#!/usr/bin/env python3
"""Hermetic actual-handler proof. Refuses application/DB/payload paths outside /tmp.
Run against a fresh schema-only database and copied app with credentials cleared
inside a disabled-network namespace. This never confirms a real payment.
"""
from __future__ import annotations
import argparse
import asyncio
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace


def tmp_only(value):
    path = Path(value).resolve()
    if not str(path).startswith('/tmp/'):
        raise ValueError('isolated /tmp path required')
    return path


async def run(args):
    sys.path.insert(0, str(args.app.parent))
    os.environ['DB_PATH'] = str(args.db)
    from app import db, webapp, config
    from app.services import direct_upload
    config.DB_PATH = str(args.db)
    class Bot: pass
    bot = Bot()
    scheduled = []
    webapp._bg = lambda name, callback: scheduled.append(name)
    direct_upload.schedule_sweep = lambda _: None
    async def guest(_): return None
    webapp._session_user = guest
    webapp._rate_ok = lambda *a, **k: True
    webapp._promo_known_guest = guest

    class Request:
        def __init__(self, body=None, order_id=None, fid=None, fields=None):
            self.body = body
            self.headers = {'X-Session-Mode':'cookie', 'Origin':config.SITE_URL}
            self.cookies = {}
            self.app = {'bot':bot}
            self.match_info = {'id':str(order_id)} if order_id is not None else {}
            if fid is not None:self.match_info['fid']=str(fid)
            self.query = {}
            self.remote = '127.0.0.1'
            self.path = '/orders'
            self.method = 'POST'
            self.scheme = 'https'
            self.host = 'akademsalon.ru'
            self.fields = fields
        async def json(self):return copy.deepcopy(self.body)
        async def multipart(self):return Reader(self.fields)
    class Field:
        def __init__(self,name,data,filename=None):self.name=name;self.data=data;self.filename=filename;self.offset=0
        async def read(self):return self.data
        async def read_chunk(self,n):
            chunk=self.data[self.offset:self.offset+n];self.offset+=len(chunk);return chunk
    class Reader:
        def __init__(self,fields):self.fields=iter(fields)
        async def next(self):return next(self.fields,None)
    def unpack(response):return response.status,json.loads(response.body)
    async def access(_, order_id):return await db.get_order(order_id),None
    webapp._order_access = access
    # Authorization itself is not stub-proven here: it is exercised separately
    # by the canonical production OUT-001 capability/cookie journey.
    await db.init(str(args.db))
    out = {'cases':[], 'authorization':'separate_OUT001_proof_required', 'network_delivery':'stubbed'}
    try:
        captures=json.loads(args.payloads.read_text())
        if isinstance(captures,dict):captures=captures.get('cases',captures.get('payloads',captures.get('captures',[])))
        captures=[x for i,x in enumerate(captures) if not any(y.get('scenario',y.get('name'))==x.get('scenario',x.get('name')) for y in captures[:i])]
        if not captures:raise AssertionError('browser captures missing')
        create = getattr(webapp,'order_create',None) or getattr(webapp,'orders_create',None)
        if create is None:raise AssertionError('actual order handler missing')
        created=[]
        for index, capture in enumerate(captures):
            body=copy.deepcopy(capture.get('body',capture.get('payload',capture)))
            body['client_request_id']='isolated_direct_'+str(index).zfill(4)
            first=unpack(await create(Request(body)))
            if first[0]!=200 or not first[1].get('ok'):
                raise AssertionError({'case':capture.get('name',capture.get('scenario',index)),'status':first[0],'error':first[1]})
            order_id=first[1]['id'];created.append(order_id)
            second=unpack(await create(Request(body)))
            assert second[0]==200 and second[1]['id']==order_id and second[1].get('duplicate')
            o=await db.get_order(order_id)
            assert o['topic']==body['topic'] and o['details'].startswith(body['details'])
            items=await db.items_for_order(order_id)
            assert len(items)>0
            source_bytes=json.dumps(body,ensure_ascii=False,sort_keys=True).encode()
            out['cases'].append({'name':capture.get('name',capture.get('scenario',str(index))), 'status':200,'duplicate_same_id':True,
                                 'full_brief_saved':True,'items':len(items),'quote_low':o['quote_low'],
                                 'body_sha256':hashlib.sha256(source_bytes).hexdigest()})
            changed=copy.deepcopy(body);changed.setdefault('composition_intent',{})['speed']='expressfast' if (body.get('composition_intent') or {}).get('speed')!='expressfast' else 'express24'
            conflict=unpack(await create(Request(changed)))
            assert conflict[0]==409 and conflict[1].get('error')=='request_payload_conflict'
        order_id=created[0]
        async def upload(content=b'isolated attachment',client_id='file_test', id_first=False):
            fields=[Field('file',content,'fixture.txt'),Field('client_file_id',client_id.encode())]
            if id_first:fields.reverse()
            return unpack(await webapp.order_upload(Request(order_id=order_id,fields=fields)))
        first,second=await asyncio.gather(upload(),upload(id_first=True))
        assert first[0]==second[0]==200 and first[1]['file_id']==second[1]['file_id']
        file_id=first[1]['file_id']
        assert len(await db.files_for_order(order_id))==1
        assert len(await db.msgs_for_order(order_id))==1
        local=await webapp.order_file_download(Request(order_id=order_id,fid=file_id))
        assert local.status==200 and local.body==b'isolated attachment'
        assert local.headers['Cache-Control'].startswith('private')
        foreign=await webapp.order_file_download(Request(order_id=created[-1],fid=file_id))
        assert foreign.status==404
        conflict=await upload(content=b'changed bytes')
        assert conflict[0]==409 and conflict[1]['error']=='file_payload_conflict'
        row=await (await db.conn().execute('SELECT * FROM direct_upload_receipts WHERE order_id=?',(order_id,))).fetchone()
        async def failed(*_):raise TimeoutError('isolated relay')
        assert not await direct_upload.deliver(bot,row['key'],relay=failed)
        assert (await webapp.order_file_download(Request(order_id=order_id,fid=file_id))).body==b'isolated attachment'
        await db._exec('UPDATE direct_upload_receipts SET next_attempt=0 WHERE key=?',(row['key'],))
        calls=[]
        async def relay(*_):calls.append(1);return 'isolated_tg_file'
        values=await asyncio.gather(direct_upload.deliver(bot,row['key'],relay=relay),direct_upload.deliver(bot,row['key'],relay=relay))
        assert values.count(True)==1 and len(calls)==1
        again=await upload();assert again[1]['duplicate'] and again[1]['file_id']==file_id
        assert len(await db.files_for_order(order_id))==1 and len(await db.msgs_for_order(order_id))==1
        assert (await db.file_by_id(file_id))['file_id']=='isolated_tg_file'
        assert not direct_upload.blob_path(row['key'],row['sha256']).exists()
        out['uploads']={'duplicate_api':'one_file_one_message','same_id_changed_bytes':409,
                        'private_local_download':200,'cross_order_download':404,'retry_after_outage':True,
                        'concurrent_delivery':'one_claim','delivered_spool_removed':True}
        out['ok']=True
        out['database']='isolated_schema_only'
        return out
    finally:
        await db.close()

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--app',type=tmp_only,required=True);p.add_argument('--db',type=tmp_only,required=True);p.add_argument('--payloads',type=tmp_only,required=True)
    a=p.parse_args();print(json.dumps(asyncio.run(run(a)),ensure_ascii=False))
