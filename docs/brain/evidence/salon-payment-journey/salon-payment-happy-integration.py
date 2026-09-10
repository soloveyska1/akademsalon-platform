import importlib.util,unittest,asyncio,json,sys,socket
from pathlib import Path
from unittest.mock import patch,AsyncMock
from contextlib import ExitStack
sp=importlib.util.spec_from_file_location('review_base','/tmp/salon-payment-independent-tests.py');b=importlib.util.module_from_spec(sp);sp.loader.exec_module(b)
f=b.f;db,j,payments,config=f.db,f.j,f.payments,f.config
from app.services import autoquote,economic_v2,notify,mailer,payment_delivery,handoff
class Happy(f.Journey):
 async def asyncSetUp(self):
  await super().asyncSetUp();self.boundaries=ExitStack();self.addCleanup(self.boundaries.close)
  esp=importlib.util.spec_from_file_location('review_economic_installer',b.ROOT/'backend/salon_bot/install_economic_safety.py');eins=importlib.util.module_from_spec(esp);esp.loader.exec_module(eins)
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
 async def test_pdf_actual_renderer_after_financial_revision(self):
  oid=await self.order(stages=3);await self.add_bonus();self.pdf.stop()
  await self.change(oid,'bonus_apply',amount=3000)
  snap=await db.specification_latest(oid);pdf=bytes(snap['pdf_bytes']);self.assertTrue(pdf.startswith(b'%PDF-'));self.assertGreater(len(pdf),10000)
  Path('/tmp/salon-payment-real-contract.pdf').write_bytes(pdf)
  self.assertEqual(snap['revision'],2);spec=json.loads(snap['specification_json']);self.assertEqual(spec['pricing']['settlement']['cash_rub'],27000)
  import subprocess
  text=subprocess.check_output(['/opt/homebrew/bin/pdftotext','/tmp/salon-payment-real-contract.pdf','-'],text=True)
  Path('/tmp/salon-payment-real-contract.txt').write_text(text)
  self.assertRegex(text,r'СПИСАНО БОНУСОВ\s+3 000 руб\.');self.assertRegex(text,r'ИТОГО ДЕНЬГАМИ\s+27 000 руб\.');self.assertIn('Оплата первого',text)
 async def test_pdf_fullgift_explicit_zero_cash_and_acceptance(self):
  import subprocess
  oid=await self.order(stages=2);await self.add_gift();self.pdf.stop();await self.change(oid,'gift_apply',code='SYNTHETIC123')
  snap=await db.specification_latest(oid);spec=json.loads(snap['specification_json']);pdf=bytes(snap['pdf_bytes']);Path('/tmp/salon-payment-fullgift-contract.pdf').write_bytes(pdf)
  text=subprocess.check_output(['/opt/homebrew/bin/pdftotext','/tmp/salon-payment-fullgift-contract.pdf','-'],text=True);Path('/tmp/salon-payment-fullgift-contract.txt').write_text(text)
  self.assertRegex(text,r'ЗАЧТЕНО\s+СЕРТИФИКАТОМ\s+30 000 руб\.');self.assertRegex(text,r'ИТОГО ДЕНЬГАМИ\s+0 руб\.')
  self.assertIn('Подтверждение состава',text);self.assertIn('Доплата не требуется',text);self.assertNotIn('Оплата первого',text);self.assertIn('без нового денежного платежа',spec['common_terms']['offer_acceptance'])
  self.assertEqual(spec['payment_schedule'],[])
  await self.change(oid,'accept_price',accept=True);accepted=await db.specification_latest(oid);self.assertEqual(bytes(accepted['pdf_bytes']),pdf);self.assertEqual(accepted['status'],'accepted')
if __name__=='__main__':
 names=[n for n in dir(Happy) if n.startswith(('test_online_','test_deposit_','test_pdf_'))];suite=unittest.TestSuite(Happy(n) for n in names);result=unittest.TextTestRunner(verbosity=2).run(suite)
 Path('/tmp/salon-payment-happy-integration.json').write_text(json.dumps({'passed':result.testsRun-len(result.failures)-len(result.errors),'tests':names,'failures':[(str(t),e) for t,e in result.errors+result.failures],'notes':['Actual DB reserve/confirm/receipt/effects; provider link and external notifications stubbed; network forbidden.','PDF generation not exercised here.']},indent=2));b.tmp.cleanup();sys.exit(not result.wasSuccessful())
