"""Real cashier HTTP tests against local fake Robokassa, never production money."""
import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path
import patch

ROOT=Path(__file__).resolve().parents[2]
BASE='b4ad1cf037d4d1edde62ffbdf8d1913cdf8008cb'


def run():
    with tempfile.TemporaryDirectory() as directory:
        root=Path(directory)
        files=['backend/salon_bot/kladovaya_pay.py','backend/salon_bot/install_kladovaya_pay.py','backend/salon_bot/tests/test_kladovaya_pay.py','scripts/kladovaya-pay-20261031/page/main.html']
        for name in files:
            dest=root/name; dest.parent.mkdir(parents=True,exist_ok=True)
            dest.write_bytes(subprocess.check_output(['git','show',BASE+':'+name],cwd=ROOT))
        module=root/files[0]
        module.write_text(patch.backend(module.read_text()),encoding='utf-8')
        spec=importlib.util.spec_from_file_location('legacy_tests',root/files[2])
        legacy=importlib.util.module_from_spec(spec); spec.loader.exec_module(legacy)

        class ListikHttp(legacy.HttpTests):
            async def asyncSetUp(self):
                await super().asyncSetUp()
                self.admission = mock.patch.object(self.kp,'ensure_listik_open',new_callable=mock.AsyncMock)
                self.admission_mock = self.admission.start()
                self.addCleanup(self.admission.stop)

            async def test_paused_service_refuses_old_link_before_invoice(self):
                self.admission_mock.side_effect=self.kp.PayError('checkout_closed',503)
                status,data=await self.checkout(product='listik_20',amount=399)
                self.assertEqual((status,data['error']),(503,'checkout_closed'))
                self.assertEqual(self.table('SELECT COUNT(*) FROM invoices')[0][0],0)

            async def test_listik_verified_payment_and_return(self):
                for product,price,order in [('listik_20',399,'klistik0020'),('listik_60',899,'klistik0060')]:
                    status,quote=await self.quote(legacy.link(order=order,product=product,amount=price))
                    self.assertEqual((status,quote['edition'],quote['bot']),(200,'listik 1.0','https://studkladovaya.ru/listik'))
                    status,data=await self.checkout(order=order,product=product,amount=price)
                    self.assertEqual(status,200)
                    inv=self.table('SELECT id,spec FROM invoices ORDER BY id DESC LIMIT 1')[0]
                    snapshot=json.loads(inv[1]); self.assertEqual(snapshot['sha256'],patch.SPEC_SHA)
                    inv_id=40_000_000+inv[0]
                    # A success redirect never grants a paid order.
                    response=await self.client.get('/api/kladovaya/pay/return/paid/'+order,allow_redirects=False)
                    self.assertEqual(response.headers['Location'],'https://studkladovaya.ru/listik?payment=returned')
                    self.assertEqual(self.table("SELECT state FROM orders WHERE ord='"+order+"'")[0][0],'open')
                    self.assertEqual((await self.result(legacy.result_form(inv_id,str(price),order=order)))[0],200)
                    self.assertEqual((await self.result(legacy.result_form(inv_id,str(price),order=order)))[0],200)
                    self.assertEqual(self.table("SELECT COUNT(*) FROM outbox WHERE ord='"+order+"'")[0][0],1)
                    body=json.loads(self.table("SELECT body FROM outbox WHERE ord='"+order+"'")[0][0])
                    self.assertEqual((body['product'],body['amount']),(product,price))

        suite=unittest.defaultTestLoader.loadTestsFromModule(legacy)
        suite.addTest(ListikHttp('test_listik_verified_payment_and_return'))
        suite.addTest(ListikHttp('test_paused_service_refuses_old_link_before_invoice'))
        result=unittest.TextTestRunner(verbosity=1).run(suite)
        return 0 if result.wasSuccessful() else 1


if __name__=='__main__': sys.exit(run())
