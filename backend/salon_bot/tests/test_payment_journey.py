"""Run against prepared code-only backend snapshot, isolated temporary SQLite only.
SALON_PAYMENT_RUNTIME points to the hash-pinned prepared runtime; never a live DB.
"""
import unittest,os,sys,tempfile,json,uuid,copy,sqlite3,ast
from pathlib import Path
from unittest.mock import AsyncMock,patch
from cryptography.fernet import Fernet
sys.path.insert(0,os.environ['SALON_PAYMENT_RUNTIME'])
from app import db,config
from app.services import payment_journey as j,contract,payments,gift

class Journey(unittest.IsolatedAsyncioTestCase):
 async def asyncSetUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='checkout-test-');config.ORDER_ACCESS_TOKEN_KEY=Fernet.generate_key().decode();config.ADMIN_IDS=set()
  self.addAsyncCleanup(db.close)
  path=Path(self.tmp.name)/'synthetic.sqlite'
  # Production schema already includes columns added by historical migrations.
  # Materialize the same empty final schema; tolerate duplicate ADD COLUMN only.
  c=sqlite3.connect(path);c.executescript(db.SCHEMA)
  for table,cols in db.MIGRATE_COLUMNS.items():
   existing={r[1] for r in c.execute('PRAGMA table_info('+table+')')}
   for name,decl in cols:
    if name not in existing:c.execute('ALTER TABLE '+table+' ADD COLUMN '+name+' '+decl)
  c.commit();c.execute('CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY,applied_at TEXT NOT NULL)');c.commit()
  for file in sorted((Path(os.environ['SALON_PAYMENT_RUNTIME'])/'migrations').glob('*.sql')):
   statement=''
   for line in file.read_text().splitlines(True):
    statement+=line
    if sqlite3.complete_statement(statement):
     try:c.executescript(statement)
     except sqlite3.OperationalError as exc:
      if 'duplicate column name:' not in str(exc) and 'no transaction is active' not in str(exc):raise
     statement=''
  installer=Path(__file__).resolve().parents[1]/'install_economic_safety.py'
  tree=ast.parse(installer.read_text());schema=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SCHEMA_SQL' for t in n.targets));c.executescript(schema)
  c.commit();c.close()
  await db.init(str(path))
  await db._exec("INSERT INTO users(id,first_name,email,created_at,last_seen_at) VALUES(-100,'Synthetic','synthetic@example.invalid',?,?)",(db.now_iso(),db.now_iso()))
  self.user=await db.get_user(-100)
  self.pdf=patch.object(contract,'build_pdf',AsyncMock(return_value=b'%PDF-1.4 synthetic unit fixture'));self.pdf.start()
 async def asyncTearDown(self):
  self.pdf.stop();await db.close();self.tmp.cleanup()
 async def order(self,source='price',stages=2,owner=-100):
  oid=await db.create_order(user_id=owner,status='priced',work_type='course',work_label='Synthetic consultation',topic='Synthetic',price=30000,prepay=15000,stages_total=stages,source='website',guest_contact='guest@example.invalid' if not owner else None,deadline_date='2026-12-30')
  o=await db.get_order(oid)
  raw={'lines':[{'line_id':'LN-1','contract_contour':'A','academic_submode':'A1','service_id':'custom','title':'Synthetic consultation','permitted_purpose':'Synthetic consultation','deliverable':'Annotated source','formats':['docx'],'inclusions':['source check'],'exclusions':['new research'],'acceptance_criteria':['sources checked'],'price_amount':30000,'deadline':{'date':'2026-12-30'},'correction_window':{'days':14,'scope':'agreed defects'},'customer_inputs':{'description':'Synthetic input'}}]}
  spec=contract.specification_from_payload(o,[],raw,revision=1,strict=True)
  sid=await db.specification_create(oid,contract.canonical_json(spec),b'%PDF-1.4 synthetic',source=source,revision=1,schema_version=spec['schema_version'])
  if source=='offer':
   snap=await db.specification_latest(oid)
   await db.offer_create(code='TEST'+str(oid),order_id=oid,version=1,status='live',created_at=db.now_iso(),specification_json=snap['specification_json'],specification_hash=snap['specification_hash'],specification_pdf=snap['pdf_bytes'],specification_snapshot_id=sid)
  return oid
 async def body(self,oid,action,**kw):return {'action':action,'expected_revision':(await j.state(await db.get_order(oid)))['revision'],'request_id':uuid.uuid4().hex,**kw}
 async def change(self,oid,action,**kw):return await j.change(oid,self.user,await self.body(oid,action,**kw))
 async def add_bonus(self,n=10000):await db.bonus_add(-100,n,'manual','synthetic')
 async def add_gift(self,amount=40000):
  # Actual prepaid gift ledger, not a fabricated order cash payment.
  now=db.now_iso();gid=await db.gift_create(code='SYNTHETIC123',amount=amount,status='active',created_at=now,activated_at=now,expires_at='2027-12-30T00:00:00')
  await db.gift_ledger_add(gid,amount,'issue',None,'synthetic');return gid
 async def test_accept_exact_revision_and_no_fake_payment(self):
  oid=await self.order();body=await self.body(oid,'accept_price',accept=True);await j.change(oid,self.user,body)
  self.assertEqual((await db.get_order(oid))['status'],'prepay');self.assertEqual(await db.payments_for_order(oid),[])
  self.assertTrue((await j.change(oid,self.user,body))['replayed'])
 async def test_nonce_payload_conflict(self):
  oid=await self.order();body=await self.body(oid,'accept_price',accept=True);await j.change(oid,self.user,body);body['accept']=False
  with self.assertRaisesRegex(ValueError,'request_conflict'):await j.change(oid,self.user,body)
 async def test_stale_before_any_balance_write(self):
  oid=await self.order();await self.add_bonus();body=await self.body(oid,'bonus_apply',amount=3000);await db.update_order(oid,price=31000)
  with self.assertRaisesRegex(ValueError,'quote_changed'):await j.change(oid,self.user,body)
  self.assertEqual((await db.get_order(oid))['bonus_spent'] or 0,0)
 async def test_bonus_atomic_spec_and_repeat(self):
  oid=await self.order();await self.add_bonus();old=json.loads((await db.specification_latest(oid))['specification_json']);body=await self.body(oid,'bonus_apply',amount=3000);await j.change(oid,self.user,body);await j.change(oid,self.user,body)
  o=await db.get_order(oid);s=await db.specification_latest(oid);self.assertEqual(o['bonus_spent'],3000);self.assertEqual(s['revision'],2);self.assertEqual(old['lines'],json.loads(s['specification_json'])['lines']);self.assertEqual(sum(x['amount'] for x in payments.stage_plan(o)),27000)
 async def test_pdf_failure_rolls_back_bonus(self):
  oid=await self.order();await self.add_bonus()
  with patch.object(contract,'build_pdf',AsyncMock(return_value=None)):
   with self.assertRaisesRegex(ValueError,'financial_revision'):await self.change(oid,'bonus_apply',amount=3000)
  self.assertEqual((await db.get_order(oid))['bonus_spent'] or 0,0);self.assertEqual((await db.specification_latest(oid))['revision'],1)
 async def test_unowned_guest_cannot_spend_logged_in_wallet(self):
  oid=await self.order(owner=None);await self.add_bonus()
  with self.assertRaisesRegex(ValueError,'bonus_need_login'):await self.change(oid,'bonus_apply',amount=3000)
 async def test_pending_invoice_blocks_discounts(self):
  oid=await self.order();await self.add_bonus();await db.payment_create(oid,'prepay',15000,'robokassa',None)
  with self.assertRaisesRegex(ValueError,'checkout_locked'):await self.change(oid,'bonus_apply',amount=3000)
 async def test_claimed_and_paid_block_discounts(self):
  for status in ('claimed','paid'):
   oid=await self.order();pid=await db.payment_create(oid,'prepay',15000,'manual',None);await db.payment_set_status(pid,status)
   with self.assertRaisesRegex(ValueError,'checkout_locked'):await self.change(oid,'gift_remove')
 async def test_offer_revision_invalidates_old_payment_surface(self):
  oid=await self.order(source='offer');await self.add_bonus();old=(await db.offer_by_order(oid))['specification_json'];await self.change(oid,'bonus_apply',amount=3000)
  off=await db.offer_by_order(oid);self.assertEqual(off['status'],'replaced');self.assertEqual(off['specification_json'],old);self.assertEqual((await db.specification_latest(oid))['revision'],2)
 async def test_promo_firstorder_target_excluded_only(self):
  oid=await self.order();await db.setting_set('promo_campaign','on');await db.promo_add('ПЕРВЫЙЛИСТ',pct=12,cap=5000,min_price=2500,family='first-order-2026-08',uses_left=10)
  await self.change(oid,'promo_apply',code='ПЕРВЫЙЛИСТ');self.assertEqual((await db.get_order(oid))['promo_discount'],3600);self.assertEqual((await db.promo_get('ПЕРВЫЙЛИСТ'))['uses_left'],9)
 async def test_second_order_firstpromo_rejected(self):
  await self.order();oid=await self.order();await db.setting_set('promo_campaign','on');await db.promo_add('ПЕРВЫЙЛИСТ',pct=12,cap=5000,min_price=2500,family='first-order-2026-08',uses_left=10)
  with self.assertRaisesRegex(ValueError,'promo_ineligible'):await self.change(oid,'promo_apply',code='ПЕРВЫЙЛИСТ')
  self.assertEqual((await db.promo_get('ПЕРВЫЙЛИСТ'))['uses_left'],10)
 async def test_promo_pdf_failure_rolls_back_claim_and_counter(self):
  oid=await self.order();await db.setting_set('promo_campaign','on');await db.promo_add('ПЕРВЫЙЛИСТ',pct=12,cap=5000,min_price=2500,family='first-order-2026-08',uses_left=10)
  with patch.object(contract,'build_pdf',AsyncMock(return_value=None)):
   with self.assertRaises(ValueError):await self.change(oid,'promo_apply',code='ПЕРВЫЙЛИСТ')
  self.assertEqual((await db.promo_get('ПЕРВЫЙЛИСТ'))['uses_left'],10);self.assertEqual((await db.get_order(oid))['promo_discount'],0)
 async def test_gift_covers_all_no_cash_or_rewards(self):
  oid=await self.order();gid=await self.add_gift();await self.change(oid,'gift_apply',code='SYNTHETIC123');self.assertEqual(payments.money_due(await db.get_order(oid))['due_total'],0)
  await self.change(oid,'accept_price',accept=True);self.assertEqual((await db.get_order(oid))['status'],'work');self.assertEqual((await db.specification_latest(oid))['status'],'accepted');self.assertEqual(await db.payments_for_order(oid),[])
  await db.gift_mark(gid,expires_at='2020-01-01T00:00:00');await gift.sync_order(None,oid);self.assertEqual((await db.get_order(oid))['gift_amount'],30000)
  self.assertFalse((await gift.detach_from_order(None,oid))[0])
 async def test_plan_one_two_three_math(self):
  for n in (1,2,3):
   oid=await self.order(stages=n);await self.add_bonus();await self.change(oid,'bonus_apply',amount=3000);o=await db.get_order(oid);plan=payments.stage_plan(o);self.assertEqual(len(plan),n);self.assertEqual(sum(p['amount'] for p in plan),27000)
 async def test_missing_consent_or_admin_cannot_accept(self):
  oid=await self.order()
  with self.assertRaisesRegex(ValueError,'accept_required'):await self.change(oid,'accept_price')
  config.ADMIN_IDS={-100}
  with self.assertRaisesRegex(ValueError,'admin_session'):await self.change(oid,'accept_price',accept=True)


import importlib.util,asyncio
from contextlib import ExitStack
from app.services import autoquote,economic_v2,notify,mailer,payment_delivery,handoff
class PaymentIntegration(Journey):
 async def asyncSetUp(self):
  await super().asyncSetUp();self.boundaries=ExitStack();self.addCleanup(self.boundaries.close)
  esp=importlib.util.spec_from_file_location('review_economic_installer',Path(__file__).resolve().parents[1]/'install_economic_safety.py');eins=importlib.util.module_from_spec(esp);esp.loader.exec_module(eins)
  eins.install_database_v2(Path(db._db_path));eins.set_database_state(Path(db._db_path),enabled=True)
  self.boundaries.enter_context(patch('socket.socket.connect',side_effect=AssertionError('Network forbidden')))
  self.boundaries.enter_context(patch('aiohttp.ClientSession._request',AsyncMock(side_effect=AssertionError('HTTP forbidden'))))
  for name in ('notify_client','notify_admins','send_admin_card'):
   self.boundaries.enter_context(patch.object(notify,name,AsyncMock()))
  self.boundaries.enter_context(patch.object(payments,'_grp_send',AsyncMock()))
  self.boundaries.enter_context(patch.object(mailer,'send',AsyncMock()))
  self.boundaries.enter_context(patch.object(payment_delivery,'schedule_for_payment',AsyncMock()))
  self.boundaries.enter_context(patch.object(handoff,'release_if_paid',AsyncMock(return_value={'ok':False})))
 async def test_online_invoice_reuse_exact_snapshot_and_all_plans(self):
  captured=[]
  async def link(params):captured.append(params);return 'https://auth.robokassa.ru/Merchant/Index.aspx?InvId='+str(params['InvId'])
  with patch.object(config,'robokassa_on',return_value=True),patch.object(config,'ROBOKASSA_LOGIN','synthetic'),patch.object(config,'robo_pass1',return_value='synthetic-secret'),patch.object(payments,'_robo_link',side_effect=link):
   for n in (1,2,3):
    oid=await self.order(stages=n);await self.change(oid,'accept_price',accept=True);o=await db.get_order(oid);snap=await db.specification_latest(oid);info=await j.state(o)
    kw={'expected_revision':info['revision'],'expected_snapshot':snap['id'],'expected_hash':snap['specification_hash'],'expected_amount':payments.stage_plan(o)[0]['amount'],'receipt_email':'synthetic@example.invalid'}
    first=await autoquote.checkout(oid,**kw)
    self.assertEqual(first['snapshot_id'],snap['id']);self.assertEqual(first['amount'],kw['expected_amount']);self.assertFalse(first['reused'])
    with self.assertRaisesRegex(ValueError,'quote_changed'):await autoquote.checkout(oid,**kw)
    kw['expected_revision']=(await j.state(await db.get_order(oid)))['revision'];again=await autoquote.checkout(oid,**kw)
    self.assertEqual(again['payment_id'],first['payment_id']);self.assertTrue(again['reused']);self.assertEqual(len(await db.payments_for_order(oid)),1)
    row=await db.payment_get(first['payment_id']);receipt=await db.receipt_for_payment(first['payment_id'])
    self.assertEqual(row['specification_snapshot_id'],snap['id']);self.assertEqual(receipt['amount'],kw['expected_amount']);self.assertEqual(receipt['kind'],'prepay')
  self.assertEqual(len(captured),6)
 async def test_online_lost_provider_response_reuses_existing_invoice(self):
  oid=await self.order();await self.change(oid,'accept_price',accept=True)
  with patch.object(config,'robokassa_on',return_value=True),patch.object(config,'robo_pass1',return_value='synthetic'),patch.object(payments,'_robo_link',AsyncMock(return_value=None)):
   with self.assertRaisesRegex(ValueError,'pay_failed'):await autoquote.checkout(oid,expected_revision=(await j.state(await db.get_order(oid)))['revision'])
  rows=await db.payments_for_order(oid);self.assertEqual(len(rows),1);self.assertEqual(rows[0]['status'],'pending')
  with patch.object(config,'robokassa_on',return_value=True),patch.object(config,'robo_pass1',return_value='synthetic'),patch.object(payments,'_robo_link',AsyncMock(return_value='https://auth.robokassa.ru/synthetic')):
   got=await autoquote.checkout(oid,expected_revision=(await j.state(await db.get_order(oid)))['revision'])
  self.assertEqual(got['payment_id'],rows[0]['id']);self.assertTrue(got['reused'])
 async def test_deposit_actual_three_stages_confirm_exact_and_repeat(self):
  await db.setting_set(economic_v2.DEPOSIT_SETTING,economic_v2.DEPOSIT_ON);await db.setting_set(economic_v2.DEPOSIT_ISSUANCE_SETTING,economic_v2.DEPOSIT_ISSUANCE_ON)
  dep=await economic_v2.create_pending(user_id=-100,amount=30000);active=await economic_v2.activate_paid(None,dep['id']);self.assertEqual(active['state'],'active');self.assertEqual(await economic_v2.balance(-100),30000)
  oid=await self.order(stages=3);await self.change(oid,'accept_price',accept=True);snap=await db.specification_latest(oid)
  for ix,(amount,balance) in enumerate([(9000,21000),(12000,9000),(9000,0)],start=1):
   if ix>1:await db.update_order(oid,part_ready=ix)
   rev=(await j.state(await db.get_order(oid)))['revision']
   out=await asyncio.wait_for(economic_v2.pay_order(None,oid,expected_revision=rev,expected_owner=-100),5)
   self.assertTrue(out[0],out);self.assertEqual(await economic_v2.balance(-100),balance)
   with self.assertRaisesRegex(ValueError,'quote_changed'):await economic_v2.pay_order(None,oid,expected_revision=rev,expected_owner=-100)
   rows=await db.payments_for_order(oid);self.assertEqual(len(rows),ix);row=rows[-1];self.assertEqual(row['status'],'paid');self.assertEqual(row['amount'],amount);self.assertEqual(row['specification_snapshot_id'],snap['id'])
   receipt=await db.receipt_for_payment(row['id']);self.assertEqual(receipt['amount'],amount)
  self.assertEqual((await db.specification_latest(oid))['status'],'accepted')
  ops=await(await db.conn().execute("SELECT * FROM deposit_v2_ops WHERE order_id=? AND kind='pay'",(oid,))).fetchall();self.assertEqual(len(ops),3);self.assertTrue(all(o['state']=='effects_applied' for o in ops))

if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(Journey)
 suite.addTests(PaymentIntegration(n) for n in PaymentIntegration.__dict__ if n.startswith('test_'))
 result=unittest.TextTestRunner(verbosity=2).run(suite)
 sys.exit(not result.wasSuccessful())
