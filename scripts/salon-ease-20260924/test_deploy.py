import importlib.util,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('deploy',Path(__file__).with_name('deploy.py'));d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
class Readback(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);(self.root/'index.html').write_bytes(b'home');(self.root/'a.js').write_bytes(b'code')
 def tearDown(self):self.tmp.cleanup()
 def test_regular_bytes(self):
  with patch.object(d,'get',return_value=(b'code',{},200)):self.assertIsNone(d.verify_file(self.root,'/a.js','release'))
 def test_expected_redirect_and_exact_destination(self):
  with patch.object(d,'get',side_effect=[(b'',{'location':'https://akademsalon.ru/'},301),(b'home',{},200)]) as get:
   self.assertEqual(d.verify_file(self.root,'/expertise.html','release'),'/');self.assertEqual(get.call_args.args[0],'/?growth_verify=release')
 def test_wrong_redirect_not_followed(self):
  with patch.object(d,'get',return_value=(b'',{'location':'https://evil.invalid/'},301)) as get:
   with self.assertRaises(AssertionError):d.verify_file(self.root,'/expertise.html','release')
   self.assertEqual(get.call_count,1)
 def test_wrong_target_bytes_rejected(self):
  with patch.object(d,'get',side_effect=[(b'',{'location':'https://akademsalon.ru/'},301),(b'old-home',{},200)]):
   with self.assertRaises(AssertionError):d.verify_file(self.root,'/expertise.html','release')
 def test_unexpected_redirect_rejected(self):
  with patch.object(d,'get',return_value=(b'code',{'location':'/'},302)):
   with self.assertRaises(AssertionError):d.verify_file(self.root,'/a.js','release')
 def test_health_success(self):
  with patch.object(d,'get',side_effect=[(b'{"ok":true}',{},200),(b'{"pay_online":true}',{},200)]):d.verify_health()
 def test_health_redirect_valid_json_rejected(self):
  with patch.object(d,'get',side_effect=[(b'{"ok":true}',{'location':'/'},302),(b'{"pay_online":true}',{},200)]):
   with self.assertRaises(AssertionError):d.verify_health()
 def test_health_false_success_rejected(self):
  with patch.object(d,'get',side_effect=[(b'{"ok":false}',{},200),(b'{"pay_online":true}',{},200)]):
   with self.assertRaises(AssertionError):d.verify_health()
if __name__=='__main__':unittest.main()
