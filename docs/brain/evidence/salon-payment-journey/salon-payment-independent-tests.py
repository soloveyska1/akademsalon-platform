import os,sys,shutil,tempfile,importlib.util,unittest,asyncio,json,hashlib
from pathlib import Path
from unittest.mock import patch
ROOT=Path('/Users/saymurrbk.ru/.codex/worktrees/salon-payment-journey')
tmp=tempfile.TemporaryDirectory(prefix='salon-contract-runtime-');runtime=Path(tmp.name)
for name in ('app','catalog','migrations'):shutil.copytree(Path('/tmp/salon-payment-runtime')/name,runtime/name,ignore=shutil.ignore_patterns('__pycache__','*.sqlite','*.db'))
p=ROOT/'backend/salon_bot/install_payment_journey.py';sp=importlib.util.spec_from_file_location('ins',p);ins=importlib.util.module_from_spec(sp);sp.loader.exec_module(ins)
for name,fn in [('webapp',ins.patch_web),('db',ins.patch_db),('autoquote',ins.patch_quote),('economic_v2',ins.patch_economics),('gift',ins.patch_gift),('contract',ins.patch_contract)]:
 rel='app/'+('' if name in ('webapp','db') else 'services/')+name+'.py'
 (runtime/rel).write_text(fn((Path('/tmp/salon-payment-backend')/(name+'.py')).read_text()))
shutil.copyfile(ROOT/'backend/salon_bot/payment_journey.py',runtime/'app/services/payment_journey.py')
os.environ['SALON_PAYMENT_RUNTIME']=str(runtime)
p=ROOT/'backend/salon_bot/tests/test_payment_journey.py';sp=importlib.util.spec_from_file_location('parent_fixture',p);f=importlib.util.module_from_spec(sp);sp.loader.exec_module(f)
db,j,payments,gift,config=f.db,f.j,f.payments,f.gift,f.config
from app.services import autoquote
class Independent(f.Journey):
 async def test_review_concurrent_bonus_one_revision(self):
  oid=await self.order();await self.add_bonus();a=await self.body(oid,'bonus_apply',amount=3000);b=await self.body(oid,'bonus_apply',amount=3000)
  out=await asyncio.gather(j.change(oid,self.user,a),j.change(oid,self.user,b),return_exceptions=True)
  self.assertEqual(sum(isinstance(x,dict) for x in out),1);self.assertEqual([str(x) for x in out if isinstance(x,Exception)],['quote_changed'])
  self.assertEqual((await db.get_order(oid))['bonus_spent'],3000);self.assertEqual((await db.specification_latest(oid))['revision'],2)
 async def test_review_failed_pdf_gift_restores_ledger(self):
  oid=await self.order();gid=await self.add_gift()
  with patch.object(f.contract,'build_pdf',f.AsyncMock(side_effect=RuntimeError('synthetic pdf crash'))):
   with self.assertRaisesRegex(RuntimeError,'synthetic'):await self.change(oid,'gift_apply',code='SYNTHETIC123')
  self.assertEqual(await db.gift_balance(gid),40000);self.assertEqual(await db.gift_hold_for_order(gid,oid),0);self.assertEqual((await db.get_order(oid))['gift_amount'],0)
 async def test_review_nonce_cannot_replay_other_identity(self):
  oid=await self.order();a=await self.body(oid,'accept_price',accept=True);await j.change(oid,self.user,a)
  with self.assertRaisesRegex(ValueError,'request_conflict'):await j.change(oid,None,a)
 async def test_review_gift_cancel_returns_exact_hold(self):
  oid=await self.order();gid=await self.add_gift();await self.change(oid,'gift_apply',code='SYNTHETIC123');await self.change(oid,'accept_price',accept=True)
  self.assertEqual(await db.gift_hold_for_order(gid,oid),30000)
  await db.set_status(oid,'cancel');await gift.sync_order(None,oid);await gift.sync_order(None,oid)
  self.assertEqual(await db.gift_hold_for_order(gid,oid),0);self.assertEqual(await db.gift_balance(gid),40000);self.assertEqual(await db.payments_for_order(oid),[])
 async def test_review_stale_online_cannot_cancel_invoice(self):
  oid=await self.order();await self.change(oid,'accept_price',accept=True);old=(await j.state(await db.get_order(oid)))['revision'];pid=await db.payment_create(oid,'prepay',15000,'robokassa',None)
  await db.update_order(oid,bonus_spent=3000)
  with patch.object(config,'robokassa_on',return_value=True):
   with self.assertRaisesRegex(ValueError,'quote_changed'):await autoquote.checkout(oid,expected_revision=old)
  self.assertEqual((await db.payment_get(pid))['status'],'pending');self.assertEqual((await db.specification_latest(oid))['revision'],1)
 async def test_review_guest_first_promo_claim_then_other_order_denied(self):
  oid=await self.order(owner=None);await db.setting_set('promo_campaign','on');await db.promo_add('ПЕРВЫЙЛИСТ',pct=12,cap=5000,min_price=2500,family='first-order-2026-08',uses_left=10)
  await j.change(oid,None,await self.body(oid,'promo_apply',code='ПЕРВЫЙЛИСТ'));self.assertEqual((await db.get_order(oid))['promo_discount'],3600)
  second=await self.order(owner=None)
  with self.assertRaisesRegex(ValueError,'promo_ineligible'):await j.change(second,None,await self.body(second,'promo_apply',code='ПЕРВЫЙЛИСТ'))
 async def test_review_same_cash_different_settlement_requires_refresh(self):
  oid=await self.order();await self.add_bonus();await self.change(oid,'bonus_apply',amount=3000);await self.add_gift();await self.change(oid,'gift_apply',code='SYNTHETIC123')
  await db.update_order(oid,bonus_spent=0);await gift.sync_order(None,oid)
  info=await j.state(await db.get_order(oid));self.assertTrue(info['needs_refresh']);self.assertFalse(info['can_accept'])
 async def test_review_payment_rejects_fresh_revision_of_unmatched_document(self):
  oid=await self.order();await self.add_bonus();await self.change(oid,'bonus_apply',amount=3000);await self.change(oid,'accept_price',accept=True)
  await db.update_order(oid,bonus_spent=0,promo_discount=3000)
  o=await db.get_order(oid);info=await j.state(o);self.assertTrue(info['needs_refresh'])
  with self.assertRaisesRegex(ValueError,'quote_changed'):await j.assert_revision(o,info['revision'],for_pay=True)
 async def test_review_deposit_exact_owner_before_money_access(self):
  from app.services import economic_v2
  oid=await self.order();await self.change(oid,'accept_price',accept=True);o=await db.get_order(oid);info=await j.state(o)
  with patch.object(economic_v2,'_require_deposit_on',f.AsyncMock()):
   with self.assertRaisesRegex(ValueError,'checkout_locked'):await economic_v2.pay_order(None,oid,expected_revision=info['revision'],expected_owner=-999)
  self.assertEqual(await db.payments_for_order(oid),[])
 async def test_review_rollback_retained_gift_standalone_after_real_acceptance(self):
  import types
  oid=await self.order();gid=await self.add_gift();await self.change(oid,'gift_apply',code='SYNTHETIC123');await self.change(oid,'accept_price',accept=True)
  standalone=types.ModuleType('app.services.review_retained_gift')
  exec(compile(Path('/tmp/salon-payment-rollback-retained-gift.py').read_text(),'rollback-gift.py','exec'),standalone.__dict__)
  await db.gift_mark(gid,expires_at='2020-01-01T00:00:00')
  with patch.dict(sys.modules,{'app.services.payment_journey':None}):
   self.assertEqual(await standalone.sync_order(None,oid),30000)
   self.assertEqual(await db.gift_hold_for_order(gid,oid),30000)
   self.assertFalse((await standalone.detach_from_order(None,oid))[0])
   await db.set_status(oid,'cancel');await standalone.sync_order(None,oid)
  self.assertEqual(await db.gift_hold_for_order(gid,oid),0);self.assertEqual(await db.gift_balance(gid),40000);self.assertEqual(await db.payments_for_order(oid),[])
 async def test_review_unhashable_action_rejected_before_write(self):
  oid=await self.order();body=await self.body(oid,[])
  with self.assertRaisesRegex(ValueError,'action_not_allowed|bad_request'):await j.change(oid,self.user,body)
  self.assertEqual((await db.get_order(oid))['status'],'priced')
 async def test_review_legacy_fullgift_pdf_needs_financial_reissue(self):
  oid=await self.order();await self.add_gift();old=json.loads((await db.specification_latest(oid))['specification_json'])
  await gift.attach_to_order(None,oid,'SYNTHETIC123');old['revision']=2;old['spec_id']='AS-000101-R02';old['payment_schedule']=[];old['pricing'].pop('settlement',None)
  await db.specification_create(oid,f.contract.canonical_json(old),b'%PDF legacy synthetic',source='price',revision=2,schema_version=old['schema_version'])
  state=await j.state(await db.get_order(oid));self.assertTrue(state['needs_refresh']);self.assertFalse(state['can_accept'])
  await self.change(oid,'refresh_quote');state=await j.state(await db.get_order(oid));self.assertFalse(state['needs_refresh']);self.assertTrue(state['can_accept'])
  spec=json.loads((await db.specification_latest(oid))['specification_json']);self.assertEqual(spec['pricing']['settlement']['gift_tender_rub'],30000)
 async def test_review_legacy_discount_invoice_keeps_matching_snapshot(self):
  oid=await self.order();old=json.loads((await db.specification_latest(oid))['specification_json']);await db.update_order(oid,bonus_spent=3000)
  for stage in old['payment_schedule']:
   stage['amount_rub']=13500;stage['allocations'][0]['amount_rub']=13500
  old['revision']=2;old['spec_id']='AS-000101-R02';old['pricing'].pop('settlement',None)
  sid=await db.specification_create(oid,f.contract.canonical_json(old),b'%PDF legacy synthetic',source='price',revision=2,schema_version=old['schema_version'])
  self.assertTrue((await j.state(await db.get_order(oid)))['needs_refresh'])
  await db.payment_create(oid,'prepay',13500,'robokassa',None,specification_snapshot_id=sid)
  self.assertFalse((await j.state(await db.get_order(oid)))['needs_refresh'])
if __name__=='__main__':
 names=[n for n in dir(Independent) if n.startswith('test_review_')];suite=unittest.TestSuite(Independent(n) for n in names)
 result=unittest.TextTestRunner(verbosity=2).run(suite)
 hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'backend/salon_bot/payment_journey.py',ROOT/'backend/salon_bot/install_payment_journey.py',ROOT/'backend/salon_bot/tests/test_payment_journey.py']}
 Path('/tmp/salon-payment-independent-tests.json').write_text(json.dumps({'passed':result.testsRun-len(result.errors)-len(result.failures),'tests':names,'failures':[(str(t),e) for t,e in result.errors+result.failures],'hashes':hashes,'note':'Isolated synthetic SQLite; actual source patches and DB helpers; PDF generation mocked; reused parent schema/setup only'},indent=2))
 tmp.cleanup();sys.exit(not result.wasSuccessful())
