"""Real loopback aiohttp with exact deployed CSRF middleware and isolated DBs.
Run with an aiohttp-enabled Python; no provider calls or production fixtures.
"""
import ast
import hashlib
import importlib
import json
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile
import types
import unittest
sys.path=[p for p in sys.path if Path(p).resolve()!=Path(__file__).parent.resolve()]
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

HERE=Path(__file__).parent
def module(name,path=None):
    m=types.ModuleType(name)
    if path:m.__path__=[str(path)]
    sys.modules[name]=m
    return m
module('qaapp',HERE.parent)
conf=module('qaapp.config');conf.ROBOKASSA_TEST=False;conf.ADMIN_IDS=[99]
conf.ROBOKASSA_LOGIN='synthetic';conf.robokassa_on=lambda:False
conf.robo_pass1=lambda:'synthetic';conf.robo_pass2=lambda:'synthetic'
db=module('qaapp.db')
async def csrf_valid(cookie,token):return cookie=='synthetic-session' and token=='synthetic-csrf'
db.session_csrf_valid=csrf_valid
module('qaapp.services');mailer=module('qaapp.services.mailer');mailer.looks_email=lambda s:False
payments=module('qaapp.services.payments');payments._robo_sig=lambda *a:hashlib.md5(':'.join(a).encode()).hexdigest()
payments.ROBO_INVOICE_URL='forbidden://';payments.ROBO_SHORT_URL='forbidden://'
http=importlib.import_module('qaapp.material_store.http')
async def forbidden(*a,**k):raise AssertionError('Provider I/O forbidden')
for name in ['operation','create_invoice','refund_full','refund_status']:setattr(http.provider,name,forbidden)

class Integration(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        async def identity(r):
            if r.cookies.get('__Host-salon_session')=='synthetic-session':return {'id':99 if r.headers.get('X-QA-Admin') else 7,'banned':False,'session_imp':False}
        source=Path(sys.argv[1]).read_text() if len(sys.argv)>1 and Path(sys.argv[1]).is_file() else Path('/Users/saymurrbk.ru/Documents/ChatGPT/Кладовая ГИПСР/store-launch-2026-09-10/live-source/webapp.py').read_text()
        node=next(n for n in ast.parse(source).body if isinstance(n,ast.AsyncFunctionDef) and n.name=='_security_middleware')
        env=dict(web=web,secrets=secrets,db=db,SESSION_COOKIE='__Host-salon_session',CSRF_COOKIE='__Host-salon_csrf',_UNSAFE_METHODS={'POST','PUT','DELETE','PATCH'},_bearer_token=lambda r:None,_session_user=identity,_SITE_ORIGIN='https://akademsalon.ru',_err=lambda error,status:web.json_response({'error':error},status=status))
        exec(compile(ast.Module(body=[node],type_ignores=[]),'exact-live-middleware','exec'),env)
        app=web.Application(middlewares=[env['_security_middleware']])
        async def signed_revoke(r):
            b=await r.json()
            return web.Response(status=204 if b.get('deletion_secret')=='b'*64 else 403)
        app.router.add_post('/api/analytics/revoke',signed_revoke)
        http.register(app,identity,self.root)
        self.client=TestClient(TestServer(app));await self.client.start_server()
        self.body=dict(event='preview_opened',sku='housing-first',source='kladovaya',session_id='a'*32,deletion_secret='b'*64,consent=True)
        self.anon={'Origin':'https://akademsalon.ru'}
        self.auth={**self.anon,'Cookie':'__Host-salon_session=synthetic-session; __Host-salon_csrf=synthetic-csrf','X-CSRF-Token':'synthetic-csrf'}
    async def asyncTearDown(self):await self.client.close();self.tmp.cleanup()
    async def test_events_csrf_admin_and_cross_page_revoke(self):
        for headers,status in [({},403),(self.anon,204),({**self.auth,'X-CSRF-Token':'wrong'},403),(self.auth,204)]:
            r=await self.client.post('/api/store/events',json=self.body,headers=headers);self.assertEqual(r.status,status)
        with sqlite3.connect(self.root/'metrics.sqlite3') as c:self.assertEqual(c.execute('select count(*) from store_events').fetchone()[0],1)
        r=await self.client.post('/api/store/events',json={**self.body,'session_id':'c'*32},headers={**self.auth,'X-QA-Admin':'1'});self.assertEqual(r.status,204)
        r=await self.client.post('/api/analytics/revoke',json={'deletion_secret':'d'*64},headers=self.anon);self.assertEqual(r.status,403)
        with sqlite3.connect(self.root/'metrics.sqlite3') as c:self.assertEqual(c.execute('select count(*) from store_events').fetchone()[0],1)
        r=await self.client.post('/api/analytics/revoke',json={'deletion_secret':'b'*64},headers=self.anon);self.assertEqual(r.status,204)
        await self.client.post('/api/store/events',json=self.body,headers=self.anon)
        with sqlite3.connect(self.root/'metrics.sqlite3') as c:self.assertEqual(c.execute('select count(*) from store_events').fetchone()[0],0)
    async def test_private_request_idempotency_limits_and_no_anon_write(self):
        import datetime
        body=dict(subject='Synthetic discipline',task='Synthetic exercise fixture',deadline=(datetime.date.today()+datetime.timedelta(days=2)).isoformat(),budget=0,request_key='a'*32)
        r=await self.client.post('/api/store/requests',json=body,headers=self.anon);self.assertEqual(r.status,401);self.assertFalse((self.root/'requests.sqlite3').exists())
        r=await self.client.post('/api/store/requests',json=body,headers={**self.auth,'X-CSRF-Token':'wrong'});self.assertEqual(r.status,403)
        ids=[]
        for _ in range(2):
            r=await self.client.post('/api/store/requests',json=body,headers=self.auth);self.assertEqual(r.status,200);ids.append((await r.json())['id'])
        self.assertEqual(ids,[1,1])
        r=await self.client.post('/api/store/requests',json={**body,'budget':1},headers=self.auth);self.assertEqual((await r.json())['error'],'request_changed')
        for n in range(1,4):
            r=await self.client.post('/api/store/requests',json={**body,'budget':n,'request_key':str(n)*32},headers=self.auth);self.assertEqual(r.status,200 if n<3 else 409)
        http.demand.cleanup(self.root,now=__import__('time').time()+91*86400)
        with sqlite3.connect(self.root/'requests.sqlite3') as c:self.assertEqual(c.execute('select count(*) from requests').fetchone()[0],0)
    async def test_qa_probe_never_records(self):
        r=await self.client.post('/api/store/events',json=self.body,headers={**self.anon,'X-Store-QA':'1'});self.assertEqual(r.status,204);self.assertFalse((self.root/'metrics.sqlite3').exists())

if __name__=='__main__':unittest.main(argv=[sys.argv[0]],verbosity=2)
