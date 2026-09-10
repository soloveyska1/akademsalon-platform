"""Independent read-only application audit. Provider I/O is always replaced.

Creates only synthetic local databases under this QA directory. No application
file or production account is changed; no real invoice/refund API is called.
"""
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import time
import types
from urllib.parse import quote

sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
SOURCE=HERE
def module(name,path=None):
    m=types.ModuleType(name)
    if path:m.__path__=[str(path)]
    sys.modules[name]=m
    return m
pkg=module('auditapp',SOURCE.parent)
# Deliberately prohibit every network session, including accidental new paths.
aiohttp=module('aiohttp')
def deny_network(*a,**kw):raise AssertionError('Real provider I/O is forbidden in this review')
aiohttp.ClientSession=deny_network;aiohttp.ClientTimeout=lambda **kw:kw
aiohttp.ClientError=ConnectionError
web=module('aiohttp.web');aiohttp.web=web
web.Request=type('Request',(),{});web.Response=type('Response',(),{})
conf=module('auditapp.config'); conf.ROBOKASSA_LOGIN='synthetic-merchant';conf.ROBOKASSA_TEST=False
conf.robo_pass1=lambda:'synthetic-password-one';conf.robo_pass2=lambda:'synthetic-password-two';conf.robokassa_on=lambda:True
db=module('auditapp.db')
async def noop(*a,**kw):pass
db.receipt_mark_paid=noop
services=module('auditapp.services')
mailer=module('auditapp.services.mailer');mailer.looks_email=lambda s:bool(s and '@'in s)
payments=module('auditapp.services.payments')
payments._robo_sig=lambda *xs:hashlib.md5(':'.join(map(str,xs)).encode()).hexdigest()
payments.ROBO_INVOICE_URL='forbidden://never-called';payments.ROBO_SHORT_URL='https://example.invalid/invoice/'
storepkg=module('auditapp.material_store',SOURCE)
def load(name):
    spec=importlib.util.spec_from_file_location('auditapp.material_store.'+name,SOURCE/(name+'.py'))
    m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m);return m
core=load('core');provider=load('provider');http=load('http');admin=load('admin')
def product(sku='synthetic-material',licences=50):
    return dict(sku=sku,version='1',title='Synthetic fixture',receipt_name='Учебный образец',price=1000,licences=licences,published=True,files={'pdf':{'path':'private/a.pdf','sha256':'not-a-real-file'}})
def buy(s,uid,sku='synthetic-material',key=None,coupon=''):
    q=s.quote(uid,sku,coupon=coupon)
    return s.checkout(uid,sku,key or f'synthetic_request_{uid:020d}',q['cash'],coupon=coupon)
def runtime(s):
    rt=http.Runtime.__new__(http.Runtime);rt.store=s;rt.app={};rt.settings={'checkout_enabled':True};return rt


import unittest
from unittest.mock import patch

class Response:
    def __init__(self, *, status=200, text='', **kwargs):self.status,self.text,self.options=status,text,kwargs
class HttpError(Exception):pass
class FileResponse:
    def __init__(self,path,**kwargs):self.path,self.options=path,kwargs
web.Response=Response
web.FileResponse=FileResponse
class Unauthorized(HttpError):
    def __init__(self,**kw):super().__init__(kw)
class Forbidden(Unauthorized):pass
web.HTTPUnauthorized=Unauthorized;web.HTTPForbidden=Forbidden

class RuntimeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=HERE,prefix='synthetic-http-')
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.store=core.Store(self.root/'store.sqlite3')
        self.store.sync_catalog([product()])
        self.rt=runtime(self.store)
        self.rt.root=self.root
        self.rt.invoice_lock=asyncio.Lock()
        db.receipt_invoice_upsert=noop
    async def test_refund_ambiguous_concurrent_create_once(self):
        now=int(time.time());s=core.Store(self.root/'late.sqlite3',lambda:now)
        s.sync_catalog([product(licences=1)])
        old=buy(s,1);now+=1000;s.release(old['id'],'cancelled')
        new=buy(s,2);s.confirm(new['id'],new['cash'])
        old=s.confirm(old['id'],old['cash'],'synthetic-opkey')
        s.set_invoice(old['id'],provider.receipt_for(old));rt=runtime(s);calls=[]
        async def uncertain(p):
            calls.append(p['id']);await asyncio.sleep(0)
            raise TimeoutError('Synthetic accepted refund, lost response')
        with patch.object(provider,'refund_full',uncertain):
            errors=await asyncio.gather(*(rt.refund_unallocated(s.get(old['id']))for _ in range(8)),return_exceptions=True)
            await rt.refund_unallocated(s.get(old['id']))
        self.assertEqual(len(calls),1)
        self.assertEqual(s.get(old['id'])['refund_request'],'needs_review')
        self.assertEqual(sum(isinstance(e,TimeoutError)for e in errors),1)
    async def test_reconciliation_errors_rotate_beyond_first_40(self):
        for uid in range(1,46):buy(self.store,uid)
        seen=[]
        async def fail(inv):seen.append(inv-core.INV_OFFSET);raise core.StoreError('provider_unavailable')
        with patch.object(provider,'operation',fail):
            await self.rt.sweep();await self.rt.sweep()
        self.assertEqual(set(seen),set(range(1,46)))
        self.assertEqual(len(seen),45)
    async def invoice_transition(self,state):
        p=buy(self.store,1);calls=[]
        async def create(p,receipt,email):calls.append(p);return 'https://example.invalid/synthetic'
        self.rt.check_files=lambda p:None
        await self.rt.invoice_lock.acquire()
        with patch.object(provider,'create_invoice',create):
            task=asyncio.create_task(self.rt.invoice(p,{'id':1}));await asyncio.sleep(0)
            if state=='paid':self.store.confirm(p['id'],p['cash'])
            else:
                with self.store.tx()as c:c.execute('UPDATE purchases SET expires_at=? WHERE id=?',(int(time.time())-1,p['id']))
            self.rt.invoice_lock.release();result=await task
        self.assertEqual(calls,[])
        return result
    async def test_invoice_expiry_rechecked_inside_lock(self):
        p=await self.invoice_transition('expired');self.assertLess(p['expires_at'],time.time())
    async def test_invoice_payment_rechecked_inside_lock(self):
        p=await self.invoice_transition('paid');self.assertEqual(p['state'],'paid')
    async def test_public_checkout_disabled_in_testmode(self):
        with patch.object(provider,'refund_key',lambda:'synthetic-placeholder'),patch.object(conf,'ROBOKASSA_TEST',True):
            self.assertFalse(self.rt.enabled())
    async def test_public_checkout_disabled_without_refund_key(self):
        with patch.object(provider,'refund_key',lambda:''):
            self.assertFalse(self.rt.enabled())
    async def test_private_owner_gate_keeps_other_accounts_closed(self):
        self.rt.settings={'checkout_enabled':False,'verification_owner_id':7}
        with patch.object(provider,'refund_key',lambda:'synthetic-placeholder'):
            self.assertFalse(self.rt.enabled())
            self.assertFalse(self.rt.enabled({'id':8,'banned':0}))
            self.assertFalse(self.rt.enabled({'id':7,'banned':1}))
            self.assertFalse(self.rt.enabled({'id':7,'banned':0,'session_imp':1}))
            self.assertTrue(self.rt.enabled({'id':7,'banned':0}))
            self.rt.settings['verification_owner_id']='7'
            self.assertFalse(self.rt.enabled({'id':7,'banned':0}))
    async def test_private_owner_gate_cannot_bypass_provider_guards(self):
        self.rt.settings={'checkout_enabled':False,'verification_owner_id':7}
        owner={'id':7,'banned':0}
        with patch.object(provider,'refund_key',lambda:''):
            self.assertFalse(self.rt.enabled(owner))
        with patch.object(provider,'refund_key',lambda:'synthetic-placeholder'):
            with patch.object(conf,'ROBOKASSA_TEST',True):self.assertFalse(self.rt.enabled(owner))
            with patch.object(conf,'robokassa_on',lambda:False):self.assertFalse(self.rt.enabled(owner))
    async def test_private_owner_gate_rejects_other_checkout_before_invoice(self):
        self.rt.settings={'checkout_enabled':False,'verification_owner_id':7}
        async def identity(request):return {'id':8,'banned':0}
        self.rt.identity=identity
        with patch.object(provider,'refund_key',lambda:'synthetic-placeholder'):
            with self.assertRaisesRegex(core.StoreError,'checkout_unavailable'):
                await self.rt.checkout(types.SimpleNamespace())
    async def test_private_owner_catalogue_does_not_disclose_owner_id(self):
        self.rt.settings={'checkout_enabled':False,'verification_owner_id':7}
        for user,enabled in [(None,False),({'id':8,'banned':0},False),({'id':7,'banned':0},True)]:
            async def identity(request):return user
            self.rt.identity=identity
            with patch.object(provider,'refund_key',lambda:'synthetic-placeholder'),patch.object(web,'json_response',lambda data,**kw:data,create=True):
                response=await self.rt.catalogue(types.SimpleNamespace())
                self.assertEqual(response['checkout_enabled'],enabled)
                self.assertNotIn('verification_owner_id',response)
                self.assertNotIn('user_id',response)
    async def test_valid_callback_and_replay_owner_bound(self):
        p=buy(self.store,7);app={http.STATE_KEY:self.rt};fields={'Shp_store':str(p['id']),'Shp_scope':'material','EMail':'unsigned@example.invalid'}
        for _ in range(2):
            response=await http.verified_callback(app,core.INV_OFFSET+p['id'],p['cash'],fields)
            self.assertEqual((response.status,response.text),(200,f"OK{core.INV_OFFSET+p['id']}"))
        self.assertEqual(self.store.get(p['id'])['user_id'],7)
        self.assertEqual(self.store.get(p['id'])['reward'],50)
    async def test_invalid_callback_amount_and_scope_no_entitlement(self):
        p=buy(self.store,7);app={http.STATE_KEY:self.rt}
        for amount,fields in [(p['cash']+1,{'Shp_store':str(p['id']),'Shp_scope':'material'}),(p['cash'],{'Shp_store':str(p['id']),'Shp_scope':'wrong'}),(p['cash'],{'Shp_store':'99999','Shp_scope':'material'})]:
            r=await http.verified_callback(app,core.INV_OFFSET+p['id'],amount,fields)
            self.assertEqual(r.status,400)
        self.assertEqual(self.store.get(p['id'])['state'],'pending')
        self.assertIsNone(await http.verified_callback(app,123,p['cash'],{}))
    async def test_user_guard_anonymous_banned_impersonated(self):
        for user,exception in [(None,Unauthorized),({'id':1,'banned':1},Forbidden),({'id':1,'banned':0,'session_imp':1},Forbidden)]:
            async def identity(request):return user
            self.rt.identity=identity
            with self.assertRaises(exception):await self.rt.user(object())
    async def test_download_zip_authorized_and_hash_checked(self):
        private=self.root/'private';private.mkdir();path=private/'sample.zip';path.write_bytes(b'synthetic-zip-for-access-test')
        p=product('zip-material');p['files']={'zip':{'path':'private/sample.zip','sha256':hashlib.sha256(path.read_bytes()).hexdigest()}}
        self.store.sync_catalog([p]);purchase=buy(self.store,7,'zip-material')
        request=types.SimpleNamespace(match_info={'id':str(purchase['id']),'format':'zip'})
        user={'id':7,'banned':0}
        async def identity(request):return user
        self.rt.identity=identity
        with self.assertRaisesRegex(core.StoreError,'payment_required'):await self.rt.download(request)
        self.store.confirm(purchase['id'],purchase['cash'])
        result=await self.rt.download(request)
        self.assertEqual(result.path,path)
        self.assertIn('private, no-store',result.options['headers']['Cache-Control'])
        user={'id':8,'banned':0}
        with self.assertRaisesRegex(core.StoreError,'not_found'):await self.rt.download(request)
        user={'id':7,'banned':0};path.write_bytes(b'changed')
        with self.assertRaisesRegex(core.StoreError,'file_unavailable'):await self.rt.download(request)
    async def test_operation_amount_exact_and_namespace_bound(self):
        p=buy(self.store,1)
        fields={'Shp_store':str(p['id']),'Shp_scope':'material'}
        for amount in ['1000','1000.00','1000.000000']:
            self.assertEqual(provider.verified_operation_amount({'fields':fields,'amount':amount},p),1000)
        for amount in ['999.99','NaN','Infinity','1000.000001','bad']:
            with self.assertRaises(core.StoreError):provider.verified_operation_amount({'fields':fields,'amount':amount},p)
        with self.assertRaises(core.StoreError):provider.verified_operation_amount({'fields':{},'amount':'1000'},p)
    async def test_indexjson_signature_uses_raw_return_urls(self):
        p=buy(self.store,1);receipt=provider.receipt_for(p);form=provider.invoice_form(p,receipt)
        expected=payments._robo_sig(conf.ROBOKASSA_LOGIN,f"{p['cash']:.2f}",core.INV_OFFSET+p['id'],receipt,provider.RETURN_URL,'GET',provider.RETURN_URL,'GET',conf.robo_pass1(),'Shp_scope=material',f"Shp_store={p['id']}")
        rejected=payments._robo_sig(conf.ROBOKASSA_LOGIN,f"{p['cash']:.2f}",core.INV_OFFSET+p['id'],receipt,quote(provider.RETURN_URL,safe=''),'GET',quote(provider.RETURN_URL,safe=''),'GET',conf.robo_pass1(),'Shp_scope=material',f"Shp_store={p['id']}")
        self.assertEqual(form['SignatureValue'],expected)
        self.assertNotEqual(form['SignatureValue'],rejected)
        self.assertEqual(form['Receipt'],receipt)
        self.assertEqual(form['SuccessUrl2'],provider.RETURN_URL)
    async def test_seasonal_coupon_repeat_and_cutoff(self):
        self.store.clock=lambda:1790801999
        self.store.sync_catalog([product(),product('another-material')])
        a=buy(self.store,1,coupon='СЕМЕСТР');self.store.confirm(a['id'],a['cash'])
        b=buy(self.store,1,'another-material',key='synthetic_other_00000000001',coupon='СЕМЕСТР')
        self.assertEqual((a['discount'],b['discount']),(50,50))
        self.store.clock=lambda:1790802000
        with self.assertRaisesRegex(core.StoreError,'coupon_ineligible'):self.store.quote(2,'synthetic-material',coupon='СЕМЕСТР')

class ReconcileTests(unittest.IsolatedAsyncioTestCase):
    setUp = RuntimeTests.setUp
    def evidence(self,p,request_id='00000000-0000-4000-8000-000000000001',opkey='synthetic-opkey'):
        path=self.root/(request_id+'.json')
        path.write_text(json.dumps({'request_id':request_id,'invoice_id':core.INV_OFFSET+p['id'],'operation_key':opkey,'merchant_reference':'synthetic-fixture-only'}))
        return path
    async def test_external_refund_recovers_missing_opkey_from_operation(self):
        p=buy(self.store,1);self.store.confirm(p['id'],p['cash'])
        self.assertIsNone(self.store.get(p['id'])['op_key'])
        async def operation(inv):return {'state':'100','amount':str(p['cash']),'op_key':'synthetic-opkey','fields':{'Shp_store':str(p['id']),'Shp_scope':'material'}}
        async def status(rid):return {'requestId':rid,'label':'finished','amount':p['cash']}
        with patch.object(provider,'operation',operation),patch.object(provider,'refund_status',status):
            r=await admin.reconcile(self.store,p['id'],self.evidence(p))
        self.assertEqual(r['state'],'refunded')
    async def test_external_refund_replay_and_partial_sum(self):
        p=buy(self.store,1);self.store.confirm(p['id'],p['cash'],'synthetic-opkey')
        async def operation(inv):return {'state':'100','amount':str(p['cash']),'op_key':'synthetic-opkey','fields':{'Shp_store':str(p['id']),'Shp_scope':'material'}}
        async def status(rid):return {'requestId':rid,'label':'finished','amount':400 if rid.endswith('1') else 600}
        with patch.object(provider,'operation',operation),patch.object(provider,'refund_status',status):
            for _ in range(2):r=await admin.reconcile(self.store,p['id'],self.evidence(p))
            self.assertEqual(r['refunded'],400)
            r=await admin.reconcile(self.store,p['id'],self.evidence(p,'00000000-0000-4000-8000-000000000002'))
        self.assertEqual(r['refunded'],1000)
        self.assertEqual(self.store.account(1)['balance'],0)
    async def test_external_refund_wrong_operation_rejected(self):
        p=buy(self.store,1);self.store.confirm(p['id'],p['cash'],'synthetic-opkey')
        async def operation(inv):return {'state':'100','amount':str(p['cash']),'op_key':'WRONG-operation','fields':{'Shp_store':str(p['id']),'Shp_scope':'material'}}
        with patch.object(provider,'operation',operation):
            with self.assertRaisesRegex(core.StoreError,'mismatch'):await admin.reconcile(self.store,p['id'],self.evidence(p))
        self.assertEqual(self.store.get(p['id'])['refunded'],0)
    async def test_external_refund_invalid_amount_rejected(self):
        p=buy(self.store,1);self.store.confirm(p['id'],p['cash'],'synthetic-opkey')
        async def operation(inv):return {'state':'100','amount':str(p['cash']),'op_key':'synthetic-opkey','fields':{'Shp_store':str(p['id']),'Shp_scope':'material'}}
        for amount in [1001,1.5,0,-1,'NaN']:
            async def status(rid):return {'requestId':rid,'label':'finished','amount':amount}
            with patch.object(provider,'operation',operation),patch.object(provider,'refund_status',status):
                with self.assertRaisesRegex(core.StoreError,'refund_amount_mismatch'):await admin.reconcile(self.store,p['id'],self.evidence(p))
        self.assertEqual(self.store.get(p['id'])['refunded'],0)
    async def test_external_refund_uppercase_uuid_response(self):
        p=buy(self.store,1);self.store.confirm(p['id'],p['cash'],'synthetic-opkey')
        async def operation(inv):return {'state':'100','amount':str(p['cash']),'op_key':'synthetic-opkey','fields':{'Shp_store':str(p['id']),'Shp_scope':'material'}}
        async def status(rid):return {'requestId':rid.upper(),'label':'finished','amount':p['cash']}
        with patch.object(provider,'operation',operation),patch.object(provider,'refund_status',status):
            r=await admin.reconcile(self.store,p['id'],self.evidence(p,'abcd0000-0000-4000-8000-000000000001'))
        self.assertEqual(r['state'],'refunded')
    async def test_root_cli_denies_nonroot_before_database_open(self):
        with patch.object(admin.os,'geteuid',lambda:501),patch.object(sys,'argv',['admin','--root',str(self.root/'nonexistent'),'status']):
            with self.assertRaises(SystemExit)as caught:admin.main()
        self.assertEqual(caught.exception.code,2)
        self.assertFalse((self.root/'nonexistent').exists())

if __name__=='__main__':
    unittest.main(verbosity=2)
