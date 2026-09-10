"""Purpose-bound referral rewards; no cash wallet writes or automatic repricing.

The adapter supplies authoritative payment snapshots. Issuance and reservations
are idempotent. DRAFT STORAGE CORE ONLY: no production routes or installer.
Canonical versioned payment/refund integration is intentionally required. A reservation is a service request, never a payment confirmation.
"""
from __future__ import annotations
import json
import sqlite3
import time
import uuid
from pathlib import Path
from contextlib import contextmanager

VERSION='defense-circle-v1'
POLICY={'version':VERSION,'min_order':5000,'credit':1000,'standard_price':6000,
        'max_redemption':6000,'hold_days':14,'valid_days':365,'reserve_days':7}
DAY=86400

class RewardError(ValueError):
    pass

class Store:
    def __init__(self,path):
        self.path=Path(path);self.path.parent.mkdir(parents=True,exist_ok=True)
        with self.connection() as c:
            c.executescript('''
CREATE TABLE IF NOT EXISTS circle_sources(
 friend_id INTEGER PRIMARY KEY, inviter_id INTEGER NOT NULL, order_id INTEGER NOT NULL UNIQUE,
 qualified_at INTEGER NOT NULL, net_paid INTEGER NOT NULL, valid INTEGER NOT NULL,
 version TEXT NOT NULL, updated_at INTEGER NOT NULL, source_revision INTEGER NOT NULL CHECK(source_revision>0));
CREATE TABLE IF NOT EXISTS circle_claims(
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, request_id TEXT NOT NULL,
 order_id INTEGER NOT NULL, amount INTEGER NOT NULL CHECK(amount>0 AND amount<=6000),
 state TEXT NOT NULL CHECK(state IN ('reserved','completed','released','expired','revoked')),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(user_id,request_id));
CREATE TABLE IF NOT EXISTS circle_allocations(
 claim_id TEXT NOT NULL REFERENCES circle_claims(id),friend_id INTEGER NOT NULL REFERENCES circle_sources(friend_id),
 amount INTEGER NOT NULL CHECK(amount>0 AND amount<=1000),PRIMARY KEY(claim_id,friend_id));
CREATE TABLE IF NOT EXISTS circle_events(
 id INTEGER PRIMARY KEY AUTOINCREMENT,claim_id TEXT,kind TEXT NOT NULL,created_at INTEGER NOT NULL,
 UNIQUE(claim_id,kind));
CREATE TABLE IF NOT EXISTS circle_outbox(
 claim_id TEXT PRIMARY KEY REFERENCES circle_claims(id),state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS circle_sources_owner ON circle_sources(inviter_id);
CREATE INDEX IF NOT EXISTS circle_claims_owner ON circle_claims(user_id);
''')
        self.path.chmod(0o600)
    @contextmanager
    def connection(self):
        c=sqlite3.connect(self.path,timeout=10,isolation_level=None);c.row_factory=sqlite3.Row
        c.execute('PRAGMA foreign_keys=ON')
        try:yield c
        finally:c.close()
    @contextmanager
    def transaction(self):
        with self.connection() as c:
            c.execute('BEGIN IMMEDIATE')
            try:yield c;c.commit()
            except BaseException:c.rollback();raise
    def reconcile(self,inviter,sources,now):
        """Apply canonical versioned payment/refund events, never a client snapshot.

        Adapter must pin the source order and provide strictly monotonic revisions.
        Absence is not a refund. Cancellation is an explicit higher-revision event.
        This module is not wired to production: the transaction adapter is required.
        """
        if not isinstance(inviter,int) or not inviter:raise RewardError('identity')
        seen=set()
        with self.transaction() as c:
            for s in sources:
                friend=int(s['friend_id']);order=int(s['order_id']);net=max(0,int(s['net_paid']))
                if friend==inviter or not friend or order<=0:continue
                revision=s.get('revision')
                if not isinstance(revision,int) or isinstance(revision,bool) or revision<1:raise RewardError('source_revision')
                old=c.execute('SELECT * FROM circle_sources WHERE friend_id=?',(friend,)).fetchone()
                if old and (old['inviter_id']!=inviter or old['order_id']!=order):raise RewardError('source_identity_changed')
                seen.add(friend)
                if old and revision<old['source_revision']:continue
                if old and revision==old['source_revision']:
                    incoming_valid=int(bool(s.get('fully_paid')) and not s.get('excluded') and net>=POLICY['min_order'])
                    if old['net_paid']!=net or old['valid']!=incoming_valid or old['qualified_at']!=int(s['qualified_at']):raise RewardError('event_conflict')
                    continue
                valid=int(bool(s.get('fully_paid')) and not s.get('excluded') and net>=POLICY['min_order'])
                qualified=int(s['qualified_at'])
                c.execute('''INSERT INTO circle_sources VALUES(?,?,?,?,?,?,?,?,?)
ON CONFLICT(friend_id) DO UPDATE SET net_paid=excluded.net_paid,valid=excluded.valid,updated_at=excluded.updated_at,source_revision=excluded.source_revision''',
                    (friend,inviter,order,qualified,net,valid,VERSION,now,revision))
            # A withdrawn source cannot finance an unfulfilled request. Release
            # the whole reservation; already delivered benefits never create debt.
            affected=c.execute('''SELECT DISTINCT c.id FROM circle_claims c JOIN circle_allocations a ON a.claim_id=c.id
JOIN circle_sources s ON s.friend_id=a.friend_id WHERE c.user_id=? AND c.state='reserved' AND s.valid=0''',(inviter,)).fetchall()
            for x in affected:
                c.execute("UPDATE circle_claims SET state='revoked',updated_at=? WHERE id=?",(now,x['id']))
                c.execute("INSERT OR IGNORE INTO circle_events(claim_id,kind,created_at) VALUES(?,'revoked',?)",(x['id'],now))
            self._expire(c,now)
    def _expire(self,c,now):
        c.execute("UPDATE circle_claims SET state='expired',updated_at=? WHERE state='reserved' AND expires_at<=?",(now,now))
    def _available(self,c,user,now):
        rows=c.execute('''SELECT s.*,COALESCE((SELECT SUM(a.amount) FROM circle_allocations a
JOIN circle_claims q ON q.id=a.claim_id WHERE a.friend_id=s.friend_id AND q.state IN ('reserved','completed')),0) used
FROM circle_sources s WHERE s.inviter_id=? AND s.valid=1 AND s.version=? ORDER BY s.qualified_at,s.friend_id''',(user,VERSION)).fetchall()
        return [(r,max(0,POLICY['credit']-r['used'])) for r in rows
                if r['qualified_at']+POLICY['hold_days']*DAY<=now<r['qualified_at']+(POLICY['hold_days']+POLICY['valid_days'])*DAY]
    def overview(self,user,now):
        with self.transaction() as c:
            self._expire(c,now);rows=c.execute('SELECT * FROM circle_sources WHERE inviter_id=? AND version=?',(user,VERSION)).fetchall()
            claims=[dict(x) for x in c.execute('SELECT id,order_id,amount,state,created_at,expires_at FROM circle_claims WHERE user_id=? ORDER BY created_at DESC LIMIT 30',(user,))]
            eligible=[r for r in rows if r['valid']]
            available=sum(v for _,v in self._available(c,user,now))
            return {'available':available,'confirmed_count':sum(r['qualified_at']+POLICY['hold_days']*DAY<=now for r in eligible),
                'pending_count':sum(r['qualified_at']+POLICY['hold_days']*DAY>now for r in eligible),
                'reserved':c.execute("SELECT COALESCE(SUM(amount),0) FROM circle_claims WHERE user_id=? AND state='reserved'",(user,)).fetchone()[0],
                'used':c.execute("SELECT COALESCE(SUM(amount),0) FROM circle_claims WHERE user_id=? AND state='completed'",(user,)).fetchone()[0],
                'claims':claims,'next_count':max(0,(POLICY['standard_price']-available+POLICY['credit']-1)//POLICY['credit'])}
    def reserve(self,user,request_id,order_id,amount,now):
        try:uuid.UUID(request_id)
        except (ValueError,TypeError,AttributeError):raise RewardError('request_id')
        if not isinstance(amount,int) or isinstance(amount,bool) or not 0<amount<=POLICY['max_redemption']:raise RewardError('amount')
        if not isinstance(order_id,int) or isinstance(order_id,bool) or order_id<=0:raise RewardError('order')
        with self.transaction() as c:
            self._expire(c,now)
            old=c.execute('SELECT * FROM circle_claims WHERE user_id=? AND request_id=?',(user,request_id)).fetchone()
            if old:
                if old['order_id']!=order_id or old['amount']!=amount:raise RewardError('idempotency_conflict')
                return {'id':old['id'],'state':old['state'],'amount':old['amount'],'duplicate':True}
            if c.execute("SELECT 1 FROM circle_claims WHERE order_id=? AND state IN ('reserved','completed')",(order_id,)).fetchone():raise RewardError('order_already_claimed')
            lots=self._available(c,user,now)
            if sum(v for _,v in lots)<amount:raise RewardError('insufficient')
            cid=str(uuid.uuid4());c.execute("INSERT INTO circle_claims VALUES(?,?,?,?,?,'reserved',?,?,?)",(cid,user,request_id,order_id,amount,now,now+POLICY['reserve_days']*DAY,now))
            left=amount
            for s,n in lots:
                part=min(left,n)
                if part:c.execute('INSERT INTO circle_allocations VALUES(?,?,?)',(cid,s['friend_id'],part));left-=part
                if not left:break
            c.execute("INSERT INTO circle_events(claim_id,kind,created_at) VALUES(?,'reserved',?)",(cid,now))
            c.execute('INSERT INTO circle_outbox(claim_id) VALUES(?)',(cid,))
            return {'id':cid,'state':'reserved','amount':amount,'duplicate':False}
    def release(self,user,cid,now):
        with self.transaction() as c:
            r=c.execute('SELECT * FROM circle_claims WHERE id=? AND user_id=?',(cid,user)).fetchone()
            if not r:raise RewardError('not_found')
            if r['state']=='released':return {'id':cid,'state':'released','duplicate':True}
            if r['state']!='reserved':raise RewardError('not_releasable')
            c.execute("UPDATE circle_claims SET state='released',updated_at=? WHERE id=?",(now,cid));c.execute("INSERT OR IGNORE INTO circle_events(claim_id,kind,created_at) VALUES(?,'released',?)",(cid,now))
            return {'id':cid,'state':'released'}
    def complete(self,cid,now,*,expected_sources):
        """Internal fulfilment projection after canonical transaction approval.

        expected_sources must come from current authoritative revisions inside
        the billing adapter, not from a browser or cached API response.
        """
        with self.transaction() as c:
            self._expire(c,now);r=c.execute('SELECT * FROM circle_claims WHERE id=?',(cid,)).fetchone()
            if not r:raise RewardError('not_found')
            if r['state']=='completed':return {'id':cid,'state':'completed','duplicate':True}
            if r['state']!='reserved':raise RewardError('not_reserved')
            sources=c.execute('SELECT s.friend_id,s.source_revision,s.valid FROM circle_sources s JOIN circle_allocations a ON a.friend_id=s.friend_id WHERE a.claim_id=?',(cid,)).fetchall()
            if not sources or any(not x['valid'] or expected_sources.get(x['friend_id'])!=x['source_revision'] for x in sources):raise RewardError('stale_source')
            c.execute("UPDATE circle_claims SET state='completed',updated_at=? WHERE id=?",(now,cid));c.execute("INSERT OR IGNORE INTO circle_events(claim_id,kind,created_at) VALUES(?,'completed',?)",(cid,now))
            return {'id':cid,'state':'completed'}
