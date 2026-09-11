"""Bounded consented journey proxies. No contacts, URLs, purchases or identities.

One event per UTC day/tab/stage/SKU; 30-day retention. Not unique people or
verified payments. Paid/delivered remain in the commerce tables exclusively.
"""
import hashlib
import re
import sqlite3
from contextlib import closing
import time

EVENTS = frozenset(('shop_opened','preview_opened','product_selected','auth_started','auth_completed','quote_ready','checkout_submitted','payment_redirect'))
SKUS = frozenset(('none','social-pedagogy','social-work-tech','housing-first','psycholinguistics','digital-behaviour','speech-diagnostics','early-language','social-psychology-project','digital-practicum'))


def validate(body):
    if not isinstance(body,dict) or set(body) != {'event','sku','session_id','consent','source','deletion_secret'}:
        return False
    return (body['consent'] is True and isinstance(body['event'],str) and body['event'] in EVENTS
        and isinstance(body['sku'],str) and body['sku'] in SKUS
        and isinstance(body['source'],str) and body['source'] in {'kladovaya','telegram','salon'}
        and isinstance(body['deletion_secret'],str) and bool(re.fullmatch(r'[a-f0-9]{64}',body['deletion_secret']))
        and isinstance(body['session_id'],str) and bool(re.fullmatch(r'[a-f0-9]{32}',body['session_id'])))


def record(path,body,now=None):
    if not validate(body):
        raise ValueError('bad_event')
    now=int(time.time() if now is None else now); day=now//86400
    with closing(sqlite3.connect(path,timeout=2)) as c, c:
        c.execute('CREATE TABLE IF NOT EXISTS store_revoked(proof TEXT PRIMARY KEY, day INTEGER)')
        proof=hashlib.sha256(body['deletion_secret'].encode()).hexdigest()
        c.execute('DELETE FROM store_revoked WHERE day < ?', (day-31,))
        if c.execute('SELECT 1 FROM store_revoked WHERE proof=?',(proof,)).fetchone():return False
        c.execute('CREATE TABLE IF NOT EXISTS store_events(day INTEGER,session_id TEXT,event TEXT,sku TEXT,source TEXT,occurred_at INTEGER,proof TEXT,PRIMARY KEY(day,session_id,event,sku))')
        c.execute('DELETE FROM store_events WHERE day < ?', (day-30,))
        # Global bound protects disk even from clients rotating identifiers.
        if c.execute('SELECT count(*) FROM store_events WHERE day=?',(day,)).fetchone()[0]>=20000:
            return False
        c.execute('INSERT OR IGNORE INTO store_events VALUES(?,?,?,?,?,?,?)', (day,body['session_id'],body['event'],body['sku'],body['source'],now,proof))
    return True


def revoke(path,body,now=None):
    if (not isinstance(body,dict) or set(body)!={'session_id','deletion_secret'} or
        not re.fullmatch(r'[a-f0-9]{32}',str(body.get('session_id',''))) or
        not re.fullmatch(r'[a-f0-9]{64}',str(body.get('deletion_secret','')))):
        raise ValueError('bad_proof')
    proof=hashlib.sha256(body['deletion_secret'].encode()).hexdigest()
    with closing(sqlite3.connect(path,timeout=2)) as c, c:
        c.execute('CREATE TABLE IF NOT EXISTS store_revoked(proof TEXT PRIMARY KEY,day INTEGER)')
        day=int(time.time() if now is None else now)//86400
        c.execute('DELETE FROM store_revoked WHERE day < ?', (day-31,))
        known=c.execute('SELECT 1 FROM store_revoked WHERE proof=?',(proof,)).fetchone()
        if not known and c.execute('SELECT count(*) FROM store_revoked WHERE day=?',(day,)).fetchone()[0]>=20000:
            raise RuntimeError('revoke_limit')
        c.execute('INSERT OR REPLACE INTO store_revoked VALUES(?,?)',(proof,day))
        if c.execute("SELECT 1 FROM sqlite_master WHERE name='store_events'").fetchone():
            c.execute('DELETE FROM store_events WHERE proof=?',(proof,))
