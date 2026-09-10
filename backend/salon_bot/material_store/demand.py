"""Private voluntary material requests; no analytics, publishing or promises."""
import datetime as dt
import hashlib
import json
import re
import sqlite3
from contextlib import closing
import time
from .core import StoreError


def submit(path,user_id,body,now=None):
    now=int(time.time() if now is None else now)
    if not isinstance(body,dict) or set(body)!={'subject','task','deadline','budget','request_key'}:
        raise StoreError('bad_request')
    for key,lo,hi in [('subject',2,120),('task',10,4000)]:
        if not isinstance(body[key],str) or not lo<=len(body[key].strip())<=hi:
            raise StoreError('bad_request')
    if not isinstance(body['request_key'],str) or not re.fullmatch('[a-f0-9]{32}',body['request_key']):raise StoreError('bad_request')
    if type(body['budget']) is not int or not 0<=body['budget']<=100000:raise StoreError('bad_request')
    try:
        deadline=dt.date.fromisoformat(body['deadline'])
        today=dt.datetime.fromtimestamp(now,dt.timezone(dt.timedelta(hours=3))).date()
        if not today<=deadline<=today+dt.timedelta(days=730):raise ValueError()
    except (ValueError,TypeError):raise StoreError('bad_request') from None
    payload=json.dumps({k:body[k] for k in ['subject','task','deadline','budget']},ensure_ascii=False,sort_keys=True)
    digest=hashlib.sha256(payload.encode()).hexdigest()
    with closing(sqlite3.connect(path,timeout=5,isolation_level=None)) as c, c:
        c.execute('CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY,user_id INTEGER,request_key TEXT,payload TEXT,digest TEXT,created_at INTEGER,status TEXT DEFAULT "new",UNIQUE(user_id,request_key))')
        c.execute('BEGIN IMMEDIATE')
        old=c.execute('SELECT id,digest FROM requests WHERE user_id=? AND request_key=?',(user_id,body['request_key'])).fetchone()
        if old:
            if old[1]!=digest:raise StoreError('request_changed')
            c.execute('COMMIT');return old[0]
        old=c.execute('SELECT id FROM requests WHERE user_id=? AND digest=? AND created_at>=?',(user_id,digest,now-86400)).fetchone()
        if old:c.execute('COMMIT');return old[0]
        if c.execute('SELECT count(*) FROM requests WHERE user_id=? AND created_at>=?',(user_id,now-86400)).fetchone()[0]>=3:raise StoreError('request_limit')
        row=c.execute('INSERT INTO requests(user_id,request_key,payload,digest,created_at) VALUES(?,?,?,?,?)',(user_id,body['request_key'],payload,digest,now))
        c.execute('COMMIT');return row.lastrowid


def cleanup(root,now=None):
    now=int(time.time() if now is None else now)
    path=root/'requests.sqlite3'
    if path.exists():
        with closing(sqlite3.connect(path)) as c, c:c.execute('DELETE FROM requests WHERE created_at<?',(now-90*86400,))
    path=root/'metrics.sqlite3'
    if path.exists():
        with closing(sqlite3.connect(path)) as c, c:
            tables={r[0] for r in c.execute('SELECT name FROM sqlite_master')}
            if 'store_events' in tables:c.execute('DELETE FROM store_events WHERE day<?',(now//86400-30,))
            if 'store_revoked' in tables:c.execute('DELETE FROM store_revoked WHERE day<?',(now//86400-31,))
