import importlib.util
from pathlib import Path
import tempfile,unittest,uuid,concurrent.futures
spec=importlib.util.spec_from_file_location('referral',Path(__file__).parents[1]/'referral_rewards.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Rewards(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.store=m.Store(Path(self.tmp.name)/'rewards.sqlite');self.now=1_800_000_000
 def tearDown(self):self.tmp.cleanup()
 def source(self,friend=2,net=5000,revision=1,**kwargs):
  return dict(friend_id=friend,order_id=friend*10,net_paid=net,fully_paid=True,qualified_at=self.now-15*m.DAY,revision=revision,**kwargs)
 def grant(self,count=1):self.store.reconcile(1,[self.source(i+2) for i in range(count)],self.now)
 def reserve(self,order=100,amount=1000,rid=None):return self.store.reserve(1,rid or str(uuid.uuid4()),order,amount,self.now)
 def test_threshold_and_partial(self):
  self.store.reconcile(1,[self.source(net=4999)],self.now);self.assertEqual(self.store.overview(1,self.now)['available'],0)
  self.store.reconcile(1,[self.source(revision=2)],self.now);self.assertEqual(self.store.overview(1,self.now)['available'],1000)
 def test_hold_and_expiry(self):
  s=self.source();s['qualified_at']=self.now;self.store.reconcile(1,[s],self.now)
  self.assertEqual(self.store.overview(1,self.now)['pending_count'],1);self.assertEqual(self.store.overview(1,self.now+14*m.DAY)['available'],1000);self.assertEqual(self.store.overview(1,self.now+379*m.DAY)['available'],0)
 def test_replay_cannot_double_grant(self):
  self.grant();self.grant();self.assertEqual(self.store.overview(1,self.now)['available'],1000)
 def test_same_revision_conflict_rejected(self):
  self.grant()
  with self.assertRaises(m.RewardError):self.store.reconcile(1,[self.source(net=0)],self.now)
 def test_revision_prevents_stale_resurrection(self):
  self.grant();self.store.reconcile(1,[self.source(net=0,revision=2)],self.now);self.grant();self.assertEqual(self.store.overview(1,self.now)['available'],0)
 def test_source_order_pinned(self):
  self.grant();x=self.source(revision=2);x['order_id']=999
  with self.assertRaises(m.RewardError):self.store.reconcile(1,[x],self.now)
 def test_missing_snapshot_does_not_revoke(self):
  self.grant();self.store.reconcile(1,[],self.now);self.assertEqual(self.store.overview(1,self.now)['available'],1000)
 def test_refund_revokes_reserved_not_completed_debt(self):
  self.grant(2);r=self.reserve();self.store.reconcile(1,[self.source(net=0,revision=2)],self.now);self.assertEqual(self.store.overview(1,self.now)['claims'][0]['state'],'revoked');self.assertEqual(self.store.overview(1,self.now)['available'],1000)
 def test_idempotency_and_conflict(self):
  self.grant(2);rid=str(uuid.uuid4());a=self.reserve(rid=rid);b=self.reserve(rid=rid);self.assertEqual(a['id'],b['id']);self.assertTrue(b['duplicate'])
  with self.assertRaises(m.RewardError):self.reserve(order=101,rid=rid)
 def test_two_tabs_cannot_overspend(self):
  self.grant()
  def attempt(n):
   try:return self.reserve(order=100+n)['state']
   except m.RewardError:return 'rejected'
  with concurrent.futures.ThreadPoolExecutor(2) as ex:r=list(ex.map(attempt,[1,2]))
  self.assertEqual(sorted(r),['rejected','reserved'])
 def test_cap_and_residual(self):
  self.grant(8);self.reserve(amount=6000);self.assertEqual(self.store.overview(1,self.now)['available'],2000)
  with self.assertRaises(m.RewardError):self.reserve(order=101,amount=6001)
 def test_release_and_expiry(self):
  self.grant();r=self.reserve();self.store.release(1,r['id'],self.now);self.assertEqual(self.store.overview(1,self.now)['available'],1000);self.reserve(order=101);self.assertEqual(self.store.overview(1,self.now+7*m.DAY)['available'],1000)
 def test_cannot_release_other_user(self):
  self.grant();r=self.reserve()
  with self.assertRaises(m.RewardError):self.store.release(2,r['id'],self.now)
 def test_completion_requires_current_revision(self):
  self.grant();r=self.reserve()
  with self.assertRaises(m.RewardError):self.store.complete(r['id'],self.now,expected_sources={2:2})
  self.store.complete(r['id'],self.now,expected_sources={2:1});self.store.reconcile(1,[self.source(net=0,revision=2)],self.now);self.assertEqual(self.store.overview(1,self.now)['available'],0);self.assertEqual(self.store.overview(1,self.now)['used'],1000)
 def test_summary_not_limited_to_recent30(self):
  self.grant(31)
  for i in range(31):
   r=self.reserve(order=100+i);self.store.complete(r['id'],self.now,expected_sources={j+2:1 for j in range(31)})
  s=self.store.overview(1,self.now);self.assertEqual(len(s['claims']),30);self.assertEqual(s['used'],31000)
 def test_invalid_input_does_not_mutate(self):
  self.grant()
  for amount in [True,-1,0,6001,1.5]:
   with self.assertRaises(m.RewardError):self.reserve(amount=amount)
  self.assertEqual(self.store.overview(1,self.now)['available'],1000)
if __name__=='__main__':unittest.main()
