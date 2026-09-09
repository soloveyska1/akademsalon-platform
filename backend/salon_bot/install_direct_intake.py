#!/usr/bin/env python3
"""Exact-source direct-intake compatibility. Never restore/delete reward SQLite.
Prepare is read-only. Apply backs up just source; rollback refuses changed files.
"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import os
import tempfile
import subprocess

EXPECTED_WEBAPP='7b87b6a921df199aed74f1f288baa0c056cf6cbb68a234d130dd0c46278fc522'
MARKER='# direct-intake:20260909-v2'

UPLOAD_READER = """    reader = await request.multipart()
    field = await reader.next()
    data = bytearray()
    fname = "файл"
    client_file_id = None
    have_file = False
    while field is not None:
        if field.name == "file":
            if have_file:
                return _err("one_file_per_request", 400)
            have_file = True
            fname = (field.filename or "файл")[:120]
            while True:
                chunk = await field.read_chunk(64 * 1024)
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > MAX_UPLOAD:
                    return _err("too_big", 413)
        elif field.name == "client_file_id":
            if client_file_id is not None:
                return _err("bad_file_id", 400)
            raw_id = bytearray()
            while True:
                chunk = await field.read_chunk(2048)
                if not chunk:
                    break
                raw_id.extend(chunk)
                if len(raw_id) > 100:
                    return _err("bad_file_id", 400)
            try:
                client_file_id = bytes(raw_id).decode("utf-8")
            except UnicodeDecodeError:
                return _err("bad_file_id", 400)
        field = await reader.next()
    if not have_file:
        return _err("no_file")
    if not data:
        return _err("empty")
    if client_file_id is not None:
        if kind_q:
            return _err("file_kind_unsupported", 400)
        from .services import direct_upload
        result, status = await direct_upload.accept(order_id, client_file_id, fname, bytes(data))
        if result.get("ok"):
            direct_upload.schedule_sweep(request.app["bot"])
        return _json(result, status)
"""

LOCAL_DOWNLOAD = """    if str(file_id).startswith("intake:"):
        from .services import direct_upload
        data, remote = await direct_upload.local_source(file_id, int(request.match_info.get("id") or 0))
        if remote:
            file_id = remote
        elif data is not None:
            return web.Response(body=data, headers={
                **CORS,
                "Content-Disposition": "attachment; filename*=UTF-8''" + urllib.parse.quote(fname),
                "Content-Type": "application/octet-stream",
                "Cache-Control": "private, no-store, max-age=0",
                "Pragma": "no-cache",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
            })
        else:
            return _err("file_unavailable", 503)
"""

def digest(data):return hashlib.sha256(data).hexdigest()
def patch_webapp(source):
    if MARKER in source:raise ValueError('already installed')
    def replace(old,new):
        nonlocal source
        if source.count(old)!=1:raise ValueError('source anchor mismatch: '+old[:60])
        source=source.replace(old,new)
    replace('    cart_declared = "cart" in b', '\n'.join([
        '    # direct-intake:20260909-v2',
        '    from .services import direct_intake',
        '    direct = direct_intake.enabled(b)',
        '    if "intake_version" in b and not direct:',
        '        return _err("intake_version_invalid", 400)',
        '    if direct and direct_intake.validate(b):',
        '        return _err(direct_intake.validate(b), 400)',
        '    cart_declared = "cart" in b']))
    replace('        cart_items, cart_low, cart_high, cart_errors = _cart_items(b.get("cart"))',
        '        cart_items, cart_low, cart_high, cart_errors = (direct_intake.parse(b, _cart_items, config) if direct else _cart_items(b.get("cart")))')
    replace('    topic = str(b.get("topic") or "")[:400].strip()\n    details = str(b.get("details") or "")[:1500].strip()\n    if cart_items:',
        '    if direct and any(x["quote_low"] is None for x in cart_items):\n        q = None\n'
        '    topic = str(b.get("topic") or "")[:500 if direct else 400].strip()\n'
        '    details = str(b.get("details") or "")[:direct_intake.TEXT_LIMIT if direct else 1500].strip()\n'
        '    if cart_items and not direct:')
    replace('    material["cart"] = cart_sig', '\n'.join([
        '    material["cart"] = cart_sig',
        '    if "intake_version" in body:',
        '        material["intake_version"] = body.get("intake_version")',
        '        material["case_context"] = body.get("case_context")',
        '        material["composition_intent"] = body.get("composition_intent")']))
    upload_start=source.index('async def order_upload(')
    upload_end=source.index('async def _stream_tg_file(',upload_start)
    section=source[upload_start:upload_end]
    start=section.index('    reader = await request.multipart()')
    end=section.index('    bot: Bot = request.app["bot"]',start)
    section=section[:start]+UPLOAD_READER+section[end:]
    source=source[:upload_start]+section+source[upload_end:]
    replace('    rows = await db.outbox_due()','    from .services import direct_upload\n    direct_upload.schedule_sweep(bot)\n    rows = await db.outbox_due()')
    replace('    try:\n        tg_file = await bot.get_file(file_id)', LOCAL_DOWNLOAD+'    try:\n        tg_file = await bot.get_file(file_id)')
    replace('    active = await db.active_orders(limit=100)\n    return _json({"ok": True, "uptime_s": int(time.time() - _STARTED),\n                  "active_orders": len(active)})',
        '    active = await db.active_orders(limit=100)\n    from .services import direct_upload\n    uploads = await direct_upload.queue_summary()\n    return _json({"ok": True, "uptime_s": int(time.time() - _STARTED),\n                  "active_orders": len(active), "uploads": uploads})')
    compile(source,'webapp.py','exec')
    return source


def atomic(path,data,mode=0o600):
    fd,name=tempfile.mkstemp(prefix='.direct-intake-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.chmod(name,mode);os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)

def prepare(root,module):
    web=root/'app/webapp.py';dest=root/'app/services/direct_intake.py'
    if digest(web.read_bytes())!=EXPECTED_WEBAPP:raise ValueError('reviewed source hashes changed')
    payload=module.read_bytes();compile(payload,str(module),'exec')
    if dest.exists() and digest(dest.read_bytes())!=digest(payload):raise ValueError('destination differs; review previous installation')
    upload=(module.parent/'direct_upload.py').read_bytes();compile(upload,'direct_upload.py','exec')
    upload_dest=dest.parent/'direct_upload.py'
    if upload_dest.exists() and digest(upload_dest.read_bytes())!=digest(upload):raise ValueError('upload destination differs; review previous installation')
    patched=patch_webapp(web.read_text()).encode()
    return web,dest,payload,patched,upload

def apply(root,module):
    web,dest,payload,patched,upload=prepare(root,module)
    backup=root/'backups'/('direct-intake-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    backup.mkdir(parents=True,mode=0o700)
    original=web.read_bytes();atomic(backup/'webapp.py',original)
    receipt={'before':digest(original),'after':digest(patched),'module':digest(payload),'upload_module':digest(upload),'database_restored':False}
    atomic(backup/'receipt.json',json.dumps(receipt,indent=2).encode())
    # Validate again immediately before replacement. The process keeps loaded old code until restart.
    if digest(web.read_bytes())!=EXPECTED_WEBAPP:raise ValueError('concurrent source change')
    atomic(dest,payload);atomic(dest.parent/'direct_upload.py',upload);atomic(web,patched,web.stat().st_mode&0o777)
    return backup,receipt

def rollback(root,backup,db_path):
    import sqlite3
    if not str(root.resolve()).startswith('/tmp/'):
        state=subprocess.check_output(['systemctl','show','salon-bot-v2.service','-p','ActiveState','-p','MainPID','-p','LoadState'],text=True)
        values=dict(line.split('=',1) for line in state.splitlines() if '=' in line)
        if values.get('LoadState')!='loaded' or values.get('ActiveState') not in ('inactive','failed') or values.get('MainPID')!='0':
            raise ValueError('rollback requires stopped salon-bot-v2 writer; keep stopped until source replacement finishes')
    if db_path is None:raise ValueError('rollback requires the actual live --db path')
    with sqlite3.connect('file:'+str(db_path.resolve())+'?mode=ro',uri=True) as c:
        if c.execute("SELECT 1 FROM sqlite_master WHERE name='direct_upload_receipts'").fetchone():
            if c.execute("SELECT count(*) FROM direct_upload_receipts WHERE state!='done'").fetchone()[0]:
                raise ValueError('rollback refused: local uploads must finish delivery first')
    receipt=json.loads((backup/'receipt.json').read_text());web=root/'app/webapp.py';dest=root/'app/services/direct_intake.py'
    if digest(web.read_bytes())!=receipt['after'] or digest(dest.read_bytes())!=receipt['module'] or digest((dest.parent/'direct_upload.py').read_bytes())!=receipt['upload_module']:raise ValueError('rollback refused: current source differs')
    original=(backup/'webapp.py').read_bytes()
    if digest(original)!=receipt['before']:raise ValueError('backup corrupt')
    atomic(web,original,web.stat().st_mode&0o777)
    # Module remains inert so code in an in-flight request is not removed. No DB rollback.
    return receipt

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--module',type=Path);p.add_argument('--apply',action='store_true');p.add_argument('--rollback',type=Path);p.add_argument('--db',type=Path);a=p.parse_args()
    if a.rollback:print(json.dumps(rollback(a.root,a.rollback,a.db)))
    elif a.apply:
        b,r=apply(a.root,a.module);print(json.dumps({'backup':str(b),**r}))
    else:
        web,dest,payload,patched,upload=prepare(a.root,a.module);print(json.dumps({'ready':True,'webapp_before':EXPECTED_WEBAPP,'webapp_after':digest(patched),'module':digest(payload),'upload_module':digest(upload)}))
