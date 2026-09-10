import importlib.util,sqlite3,tempfile,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('metrics',Path(__file__).with_name('metrics.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Tests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'metrics.sqlite3';self.body=dict(event='preview_opened',sku='housing-first',source='kladovaya',session_id='a'*32,deletion_secret='b'*64,consent=True)
 def tearDown(self):self.tmp.cleanup()
 def test_strict_no_pii(self):
  for key,val in [('contact','synthetic@example.invalid'),('url','https://example.invalid'),('event',[]),('consent',False),('sku','free-text')]:
   body={**self.body,key:val};self.assertFalse(m.validate(body))
 def test_dedupe(self):
  m.record(self.path,self.body);m.record(self.path,self.body)
  with sqlite3.connect(self.path) as c:self.assertEqual(c.execute('select count(*) from store_events').fetchone()[0],1)
 def test_revoke_and_inflight_replay(self):
  m.record(self.path,self.body);m.revoke(self.path,{k:self.body[k] for k in ['session_id','deletion_secret']});self.assertFalse(m.record(self.path,self.body))
  with sqlite3.connect(self.path) as c:self.assertEqual(c.execute('select count(*) from store_events').fetchone()[0],0)
 def test_wrong_secret_cannot_delete(self):
  m.record(self.path,self.body);m.revoke(self.path,dict(session_id='a'*32,deletion_secret='c'*64))
  with sqlite3.connect(self.path) as c:self.assertEqual(c.execute('select count(*) from store_events').fetchone()[0],1)
 def test_retention(self):
  m.record(self.path,self.body,1);m.record(self.path,{**self.body,'session_id':'c'*32},86400*33)
  with sqlite3.connect(self.path) as c:self.assertEqual(c.execute('select count(*) from store_events').fetchone()[0],1)
if __name__=='__main__':unittest.main()
