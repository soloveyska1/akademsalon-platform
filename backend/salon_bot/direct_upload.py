"""Durable, idempotent attachment intake with private local fallback.

A successful response means bytes and one cabinet entry are committed. Telegram
is a retryable delivery channel; an interrupted Telegram send can repeat there,
but never creates another cabinet file/message. No payment code is involved.
"""
from __future__ import annotations
import asyncio
import hashlib
import os
from pathlib import Path
import re
import tempfile
import time

PREFIX = 'intake:'
MAX_FILE = 20 * 1024 * 1024
MAX_ORDER_PENDING = 100 * 1024 * 1024
MAX_PENDING = 512 * 1024 * 1024
SCHEMA = '''CREATE TABLE IF NOT EXISTS direct_upload_receipts(
 key TEXT PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 client_file_id TEXT NOT NULL, sha256 TEXT NOT NULL, file_name TEXT NOT NULL,
 file_size INTEGER NOT NULL, file_row_id INTEGER NOT NULL, message_row_id INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('queued','sending','done')),
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL DEFAULT 0, tg_file_id TEXT, last_error TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(order_id,client_file_id))'''


def spool_dir():
    from .. import config
    root = Path(config.DB_PATH).resolve().parent / 'direct-upload-spool'
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    return root


def blob_path(key, sha):
    if not re.fullmatch(r'[0-9a-f]{64}', key) or not re.fullmatch(r'[0-9a-f]{64}', sha):
        raise ValueError('invalid upload locator')
    return spool_dir() / (key + '-' + sha)


def write_blob(path, data):
    fd, tmp = tempfile.mkstemp(prefix='.incoming-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data); f.flush(); os.fsync(f.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try: os.fsync(directory)
        finally: os.close(directory)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)


async def init():
    from .. import db
    await db._exec(SCHEMA)


async def get(key):
    from .. import db
    cur = await db.conn().execute('SELECT * FROM direct_upload_receipts WHERE key=?', (key,))
    row = await cur.fetchone()
    return dict(row) if row else None


async def accept(order_id, client_id, name, data):
    from .. import db
    if not isinstance(client_id, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,100}', client_id):
        return {'ok': False, 'error': 'bad_file_id'}, 400
    if not data or len(data) > MAX_FILE:
        return {'ok': False, 'error': 'too_big' if data else 'empty'}, 413 if data else 400
    name = str(name or 'файл')[:120]
    sha = hashlib.sha256(data).hexdigest()
    key = hashlib.sha256((str(order_id) + ':' + client_id).encode()).hexdigest()
    await init()
    async with db.transaction() as c:
        row = await (await c.execute('SELECT * FROM direct_upload_receipts WHERE key=?', (key,))).fetchone()
        if row:
            if row['sha256'] != sha or row['file_name'] != name:
                return {'ok': False, 'error': 'file_payload_conflict'}, 409
            return {'ok': True, 'name': name, 'file_id': row['file_row_id'],
                    'client_file_id': client_id, 'duplicate': True,
                    'delivery_pending': row['state'] != 'done'}, 200
        sizes = await (await c.execute(
            "SELECT COALESCE(SUM(file_size),0),COALESCE(SUM(CASE WHEN order_id=? THEN file_size ELSE 0 END),0) FROM direct_upload_receipts WHERE state!='done'",
            (order_id,))).fetchone()
        if sizes[0] + len(data) > MAX_PENDING or sizes[1] + len(data) > MAX_ORDER_PENDING:
            return {'ok': False, 'error': 'upload_capacity'}, 503
        path = blob_path(key, sha)
        # Durable bytes precede the atomic cabinet/receipt transaction. An
        # interrupted commit leaves only an unreferenced, privately held blob.
        await asyncio.to_thread(write_blob, path, data)
        file_id = await db.add_file(order_id, 'client', PREFIX + key, None, name, len(data), 'document')
        message_id = await db.msg_add(order_id, 'client', None, kind='document', file_name=name, tg_file_id=PREFIX + key)
        await db.add_event(order_id, 'client_msg', 'файл: ' + name[:60])
        stamp = db.now_iso()
        await c.execute('INSERT INTO direct_upload_receipts(key,order_id,client_file_id,sha256,file_name,file_size,file_row_id,message_row_id,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                        (key, order_id, client_id, sha, name, len(data), file_id, message_id, 'queued', stamp, stamp))
    return {'ok': True, 'name': name, 'file_id': file_id, 'client_file_id': client_id, 'delivery_pending': True}, 200


async def local_source(file_id, order_id):
    """Called only after existing order/file or order/message authorization."""
    key = file_id[len(PREFIX):]
    if not re.fullmatch(r'[0-9a-f]{64}', key):
        return None, None
    row = await get(key)
    if not row or row['order_id'] != order_id:
        return None, None
    if row['state'] == 'done' and row['tg_file_id']:
        return None, row['tg_file_id']
    try:
        data = await asyncio.to_thread(blob_path(key, row['sha256']).read_bytes)
    except FileNotFoundError:
        # Delivery can finish between the receipt read and opening the blob.
        row = await get(key)
        return None, row.get('tg_file_id') if row and row['state'] == 'done' else None
    if hashlib.sha256(data).hexdigest() != row['sha256']:
        raise RuntimeError('upload_integrity')
    return data, None


async def deliver(bot, key, relay=None):
    from .. import db
    now = int(time.time())
    async with db.transaction() as c:
        row = await (await c.execute('SELECT * FROM direct_upload_receipts WHERE key=?', (key,))).fetchone()
        if not row or row['state'] == 'done' or row['next_attempt'] > now or row['lease_until'] > now:
            return False
        row = dict(row)
        await c.execute("UPDATE direct_upload_receipts SET state='sending',attempts=attempts+1,lease_until=?,updated_at=? WHERE key=?", (now + 180, db.now_iso(), key))
    try:
        data = await asyncio.to_thread(blob_path(key, row['sha256']).read_bytes)
        if hashlib.sha256(data).hexdigest() != row['sha256']:
            raise RuntimeError('upload_integrity')
        if relay is None:
            relay = telegram_relay
        # Bound network work below the lease. An OS stop can still make a
        # Telegram response ambiguous; cabinet records remain exactly once.
        tg_file_id = await asyncio.wait_for(relay(bot, row, data), timeout=90)
        if not tg_file_id:
            raise RuntimeError('relay_unavailable')
        async with db.transaction() as c:
            await c.execute('UPDATE order_files SET file_id=? WHERE id=? AND order_id=?', (tg_file_id, row['file_row_id'], row['order_id']))
            await c.execute('UPDATE messages SET tg_file_id=? WHERE id=? AND order_id=?', (tg_file_id, row['message_row_id'], row['order_id']))
            await c.execute("UPDATE direct_upload_receipts SET state='done',tg_file_id=?,lease_until=0,last_error=NULL,updated_at=? WHERE key=?", (tg_file_id, db.now_iso(), key))
        db.bus_bump()
        blob_path(key, row['sha256']).unlink(missing_ok=True)
        return True
    except Exception as exc:
        await db._exec("UPDATE direct_upload_receipts SET state='queued',lease_until=0,next_attempt=?,last_error=?,updated_at=? WHERE key=? AND state!='done'",
                       (now + min(3600, 30 * (2 ** min(row['attempts'], 6))), type(exc).__name__, db.now_iso(), key))
        return False


async def telegram_relay(bot, row, data):
    from aiogram.types import BufferedInputFile
    from .. import config
    from . import group as grp
    caption = f"📎 Файл · заказ №{row['order_id']} · с сайта"
    msg = await grp.send_document(bot, row['order_id'], BufferedInputFile(data, filename=row['file_name']), caption=caption)
    if msg and msg.document:
        return msg.document.file_id
    for admin_id in config.ADMIN_IDS:
        try:
            msg = await bot.send_document(admin_id, BufferedInputFile(data, filename=row['file_name']), caption=caption)
            if msg and msg.document:
                return msg.document.file_id
        except Exception:
            continue
    return None


async def sweep(bot):
    from .. import db
    await init()
    rows = await (await db.conn().execute("SELECT key FROM direct_upload_receipts WHERE state!='done' AND next_attempt<=? AND lease_until<=? ORDER BY created_at LIMIT 10", (int(time.time()), int(time.time())))).fetchall()
    for row in rows:
        await deliver(bot, row['key'])
    # Only delete orphaned private files older than a day. Active receipts,
    # including delayed delivery, always retain their bytes.
    # Serialize orphan deletion with accept's blob write and receipt commit.
    async with db.transaction():
        active = {r[0] + '-' + r[1] for r in await (await db.conn().execute("SELECT key,sha256 FROM direct_upload_receipts WHERE state!='done'")).fetchall()}
        for path in spool_dir().iterdir():
            if path.is_file() and path.name not in active and path.stat().st_mtime < time.time() - 86400:
                if re.fullmatch(r'[0-9a-f]{64}-[0-9a-f]{64}', path.name) or path.name.startswith('.incoming-'):
                    path.unlink(missing_ok=True)


_sweep_task = None

def schedule_sweep(bot):
    global _sweep_task
    if _sweep_task is None or _sweep_task.done():
        _sweep_task = asyncio.create_task(sweep(bot))
        def completed(task):
            if task.cancelled():
                return
            exc = task.exception()
            if exc:
                import logging
                logging.getLogger(__name__).error('direct upload sweep failed: %s', type(exc).__name__)
        _sweep_task.add_done_callback(completed)


async def queue_summary():
    from .. import db
    exists = await (await db.conn().execute("SELECT 1 FROM sqlite_master WHERE name='direct_upload_receipts'")).fetchone()
    if not exists:
        return {'pending': 0, 'delayed': 0}
    row = await (await db.conn().execute("SELECT COUNT(*), COALESCE(SUM(CASE WHEN strftime('%s','now')-strftime('%s',created_at)>900 THEN 1 ELSE 0 END),0) FROM direct_upload_receipts WHERE state!='done'")).fetchone()
    return {'pending': row[0], 'delayed': row[1]}
