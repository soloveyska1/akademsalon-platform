import asyncio
import importlib.util
import tempfile
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('rewards',Path(__file__).parents[1]/'community_rewards.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Bot:
    def __init__(self,status='member',admin=True):self.status=status;self.admin=admin;self.calls=[]
    async def get_me(self):return {'id':999}
    async def get_chat_member(self,chat,uid):
        self.calls.append((chat,uid))
        if uid==999:return {'status':'administrator' if self.admin else 'member'}
        if self.status=='error':raise RuntimeError('sensitive error must not leave backend')
        return {'status':self.status,'is_member':self.status=='restricted'}

class RewardsTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=m.Store(Path(self.temp.name)/'rewards.sqlite');self.bot=Bot();self.r=m.Rewards(self.store,self.bot,lambda:1000);self.user={'user_id':11,'telegram_id':11,'impersonated':False}
    def tearDown(self):self.temp.cleanup()
    async def test_member_claim_and_download(self):
        result=await self.r.claim(self.user,'salon');self.assertTrue(result['channels']['salon']['granted']);self.assertFalse(result['channels']['kladovaya']['granted'])
        self.assertIn('Сдать без суеты',(await self.r.gift(self.user,'salon'))['document'])
    async def test_other_user_has_no_download(self):
        await self.r.claim(self.user,'salon');self.assertFalse((await self.r.gift({'user_id':12},'salon'))['ok'])
    async def test_repeat_and_unsubscribe_preserve_grant(self):
        await self.r.claim(self.user,'salon');calls=len(self.bot.calls);self.bot.status='left'
        self.assertTrue((await self.r.claim(self.user,'salon'))['channels']['salon']['granted']);self.assertEqual(calls,len(self.bot.calls))
    async def test_parallel_claim_one_grant(self):
        await asyncio.gather(*(self.r.claim(self.user,'salon') for _ in range(8)))
        with self.store.connect() as db:self.assertEqual(db.execute('SELECT count(*) FROM community_grants').fetchone()[0],1)
    async def test_membership_states(self):
        for i,status in enumerate(['creator','administrator','member','restricted','left','kicked','unknown','error']):
            user={**self.user,'user_id':100+i,'telegram_id':100+i};self.bot.status=status
            result=await self.r.claim(user,'salon');self.assertEqual(result['channels']['salon']['granted'],status in ['creator','administrator','member','restricted'])
    async def test_admin_required(self):
        self.bot.admin=False;result=await self.r.claim(self.user,'salon');self.assertEqual(result['channels']['salon']['status'],'unavailable');self.assertEqual(self.store.grants(11),set())
    async def test_email_and_impersonation_refused(self):
        for who in [{**self.user,'telegram_id':None},{**self.user,'impersonated':True}]:self.assertFalse((await self.r.claim(who,'salon'))['ok'])
        self.assertEqual(self.bot.calls,[])
    async def test_unknown_and_injection_refused(self):
        for channel in ['other',"salon';DROP TABLE community_grants",'../salon']:self.assertFalse((await self.r.claim(self.user,channel))['ok'])
    async def test_rate_limit_no_network_or_grant(self):
        self.bot.status='left';await self.r.claim(self.user,'salon');calls=len(self.bot.calls)
        result=await self.r.claim(self.user,'salon');self.assertEqual(result['retry_after'],15);self.assertEqual(calls,len(self.bot.calls))
    async def test_bot_error_not_exposed(self):
        self.bot.status='error';self.assertNotIn('sensitive',str(await self.r.claim(self.user,'salon')))
    def test_restricted_without_flag(self):self.assertFalse(m.member({'status':'restricted','is_member':False}))
    def test_offline_kits_complete_and_no_network(self):
        for gift in m.CHANNELS:
            doc=m.gift_document(gift);self.assertEqual(doc.count('<section id='),3);self.assertIn('contenteditable="true"',doc);self.assertIn('connect-src \'none\'',doc);self.assertNotIn('fetch(',doc);self.assertNotIn('localStorage',doc);self.assertIn('Сохранить заполненную копию',doc)
    def test_private_file_permissions(self):self.assertEqual(Path(self.store.path).stat().st_mode&0o777,0o600)


# Optional HTTP adapter checks use aiohttp (already installed on the live server).
try:
    from aiohttp import web
    from aiohttp.test_utils import TestClient, TestServer
except ImportError:
    web=None

@unittest.skipIf(web is None,'aiohttp is required for HTTP integration tests')
class HttpTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp=tempfile.TemporaryDirectory()
        @web.middleware
        async def security(req,handler):
            if req.method=='POST' and req.cookies.get('session') and req.headers.get('X-CSRF-Token')!='verified':return web.json_response({'error':'csrf'},status=403)
            return await handler(req)
        async def resolve(req):
            sid=req.cookies.get('session')
            if sid not in {'user11','user12','email','imp'}:return None
            return {'user_id':11 if sid in {'user11','imp'} else 12 if sid=='user12' else -1,'telegram_id':11 if sid in {'user11','imp'} else 12 if sid=='user12' else None,'impersonated':sid=='imp'}
        app=web.Application(middlewares=[security]);app['bot']=Bot()
        m.register_routes(app,resolve,path=Path(self.temp.name)/'rewards.sqlite',enabled=True)
        self.client=TestClient(TestServer(app));await self.client.start_server()
    async def asyncTearDown(self):await self.client.close();self.temp.cleanup()
    async def test_auth_csrf_and_cross_user_download(self):
        for path in ['/api/community','/api/community/gift/salon']:
            r=await self.client.get(path,headers={'X-Order-Token':'guest-token'});self.assertEqual(r.status,401)
        r=await self.client.post('/api/community/claim',json={'channel':'salon'},cookies={'session':'user11'});self.assertEqual(r.status,403)
        r=await self.client.post('/api/community/claim',json={'channel':'salon'},cookies={'session':'user11'},headers={'X-CSRF-Token':'verified'});self.assertEqual(r.status,200);self.assertTrue((await r.json())['channels']['salon']['granted'])
        r=await self.client.get('/api/community/gift/salon',cookies={'session':'user12'});self.assertEqual(r.status,403)
        r=await self.client.get('/api/community/gift/salon',cookies={'session':'user11'});self.assertEqual(r.status,200);self.assertIn('no-store',r.headers['Cache-Control']);self.assertIn('Сдать без суеты',(await r.json())['document'])
    async def test_invalid_payload_email_impersonation(self):
        for body in [{'channel':[]},{'channel':'salon','user_id':1},['salon'],{'channel':'../salon'}]:
            r=await self.client.post('/api/community/claim',json=body,cookies={'session':'user11'},headers={'X-CSRF-Token':'verified'});self.assertEqual(r.status,400)
        for sid in ['email','imp']:
            r=await self.client.post('/api/community/claim',json={'channel':'salon'},cookies={'session':sid},headers={'X-CSRF-Token':'verified'});self.assertEqual(r.status,403)

if __name__=='__main__':unittest.main()
