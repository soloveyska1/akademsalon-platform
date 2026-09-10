"""Run with SALON_WEBAPP_SOURCE and SALON_CONFIG_SOURCE pointing at reviewed sources."""
import ast
import copy
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import sys
import subprocess
import types
import unittest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'backend/salon_bot'))
import direct_intake as intake
import install_direct_intake as installer

class DirectIntake(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = Path(os.environ['SALON_WEBAPP_SOURCE']).read_text()
        config_path = Path(os.environ['SALON_CONFIG_SOURCE'])
        os.environ['PRICING_CATALOG_PATH'] = os.environ['SALON_PRICING_SOURCE']
        cls.config = types.SimpleNamespace(**runpy.run_path(str(config_path)))
        node = next(x for x in ast.parse(cls.source).body if isinstance(x, ast.FunctionDef) and x.name == '_cart_items')
        ns = {'config': cls.config, 're': re}
        exec(compile(ast.Module(body=[node], type_ignores=[]), '<exact-live-cart-parser>', 'exec'), ns)
        cls.legacy = staticmethod(ns['_cart_items'])
    def body(self, kind='work', type_id='course', speed='standard', package='standard', addon=False):
        line = {'kind':kind, 'type':type_id, 'client_id':'fixture-main', 'qty':1,
                'disc':'hum', 'term':'urgent' if speed!='standard' else 'free', 'tier':'vip',
                'topic':'Тема', 'requirements':'Требования', 'answers':{'work':'Курсовая', 'when':'2026-10-01'},
                'contract_contour':'A', 'scope':{}, 'academic_submode':'A2', 'author_participation':{'required':True,'confirmed':True}}
        body={'intake_version':2, 'case_context':{'source':'direct-order'}, 'topic':'Тема', 'details':'Полное задание',
              'cart':{'items':[line]},'composition_intent':{'speed':speed, 'package':package}}
        if addon:
            extra=copy.deepcopy(line);extra.update(kind='service',type='svc_norm',client_id='fixture-extra',parent_client_id='fixture-main')
            body['cart']['items'].append(extra)
        return body
    def parse(self,b):return intake.parse(b,self.legacy,self.config)
    def test_every_canonical_work_preserves_server_quote(self):
        for name in self.config.TYPE_BY_ID:
            with self.subTest(name=name):
                b=self.body(type_id=name);items,lo,hi,errors=self.parse(b)
                self.assertEqual(errors,[]);self.assertEqual((lo,hi),self.config.quote(name,'hum','free','vip'))
                self.assertEqual(items[0]['request']['academic_submode'],'A2')
    def test_24h_server_factor_and_addon_are_separate(self):
        b=self.body(speed='express24',addon=True);b['cart']['items'][0]['quote_preview']={'low':1,'high':1}
        items,lo,hi,errors=self.parse(b);self.assertEqual(errors,[])
        base=self.config.quote('course','hum','free','vip');self.assertEqual(items[0]['quote_low'],base[0]*2)
        self.assertEqual(lo,base[0]*2+self.config.SVC_BY_ID['svc_norm'].from_price)
    def test_candidate_cannot_take_24h(self):
        self.assertEqual(self.parse(self.body(type_id='kandidat',speed='express24'))[3],['candidate_express_unavailable'])
    def test_custom_service_and_work_have_no_invented_price(self):
        for kind,name in intake.CUSTOM:
            with self.subTest(kind=kind,name=name):
                items,lo,hi,e=self.parse(self.body(kind,name));self.assertEqual(e,[])
                self.assertIsNone(items[0]['quote_low']);self.assertEqual(items[0]['catalog_id'],name)
                self.assertEqual(items[0]['request']['tier'],'vip');self.assertEqual(items[0]['request']['price_status'],'pending')
    def test_unknown_catalog_is_rejected(self):
        self.assertTrue(self.parse(self.body(type_id='fake_catalog'))[3])
    def test_pending_bundle_has_one_price_and_full_components(self):
        for b in [self.body(type_id='custom',addon=True), self.body(package='vip',addon=True), self.body(speed='expressfast',addon=True)]:
            items,_,_,e=self.parse(b);self.assertEqual(e,[]);self.assertEqual(len(items),1)
            self.assertIsNone(items[0]['quote_low']);self.assertEqual(len(items[0]['request']['requested_components']),2)
            self.assertIsNone(items[0]['request']['parent_client_id']);self.assertEqual(items[0]['requirements'],b['details'])
    def test_pending_never_merges_different_contracts(self):
        b=self.body(type_id='custom',addon=True);b['cart']['items'][1]['contract_contour']='B'
        self.assertEqual(self.parse(b)[3],['mixed_contour_package'])
    def test_full_text_and_answers_survive_without_input_mutation(self):
        b=self.body();b['topic']='Т'*500;b['details']='Д'*20000
        b['cart']['items'][0].update(topic=b['topic'],requirements=b['details'],answers={'when':'О'*4000})
        original=copy.deepcopy(b);items,_,_,e=self.parse(b)
        self.assertEqual(e,[]);self.assertEqual(b,original)
        self.assertEqual(items[0]['requirements'],b['details']);self.assertEqual(items[0]['topic'],b['topic'])
        self.assertEqual(items[0]['request']['scope']['customer_requirements'],b['details'])
        self.assertEqual(items[0]['answers']['when'],'О'*4000)
    def test_oversized_text_is_explicitly_rejected(self):
        b=self.body();b['details']='x'*(intake.TEXT_LIMIT+1);self.assertEqual(self.parse(b)[3],['details_limit'])
        b=self.body();b['cart']['items'][0]['answers']={'x':'a'*4001};self.assertEqual(self.parse(b)[3],['answers_limit'])
    def test_malformed_never_raises(self):
        for key,value in [('kind',[]),('type',{}),('client_id',None),('parent_client_id',[]),('disc',{}),('requirements',[]),('answers',[])]:
            b=self.body();b['cart']['items'][0][key]=value
            with self.subTest(key=key):self.assertTrue(self.parse(b)[3])
        self.assertFalse(intake.enabled({'intake_version':2,'case_context':'x'}))
    def test_parent_and_duplicate_validation(self):
        b=self.body(addon=True);b['cart']['items'][1]['parent_client_id']='unknown';self.assertEqual(self.parse(b)[3],['parent_unknown'])
        b=self.body(addon=True);b['cart']['items'][1]['client_id']='fixture-main';self.assertTrue(self.parse(b)[3])
    def test_fingerprint_preserves_legacy_and_binds_new_intent(self):
        def load(source):
            node=next(x for x in ast.parse(source).body if isinstance(x,ast.FunctionDef) and x.name=='_request_fingerprint')
            ns={'json':json,'hashlib':hashlib};exec(compile(ast.Module(body=[node],type_ignores=[]),'<fingerprint>','exec'),ns);return ns['_request_fingerprint']
        old=load(self.source);new=load(installer.patch_webapp(self.source))
        b=self.body();b.pop('intake_version');self.assertEqual(old(b),new(b))
        b=self.body();before=new(b);b['composition_intent']['speed']='express24';self.assertNotEqual(before,new(b))
        b['composition_intent']['speed']='standard';b['composition_intent']['package']='vip';self.assertNotEqual(before,new(b))
    def test_full_public_price_matrix_matches_server_v2(self):
        code="""const fs=require('fs'),vm=require('vm');const s=fs.readFileSync('assets/js/app.js','utf8');const part=s.slice(s.indexOf('  var SalonCalc = {'),s.indexOf('  window.SalonCalc = SalonCalc;'));const c={};vm.createContext(c);vm.runInContext(part,c);const C=c.SalonCalc,out=[];for(const t of C.types)for(const d of C.disciplines)for(const term of C.terms)for(const tier of C.tiers){const q=C.quote(t.id,d.id,term.id,tier.id);out.push([t.id,d.id,term.id,tier.id,q.low,q.high])}process.stdout.write(JSON.stringify(out));"""
        cases=json.loads(subprocess.check_output(['node','-e',code],cwd=ROOT,text=True))
        self.assertEqual(len(cases),693)
        for type_id,disc,term,tier,lo,hi in cases:
            with self.subTest(type=type_id,discipline=disc,term=term,tier=tier):
                self.assertEqual(intake.quote(self.config,type_id,disc,term,tier),(lo,hi))
    def test_psychology_requires_deidentification(self):
        b=self.body();b['case_context']['discipline']='psychology'
        self.assertEqual(self.parse(b)[3],['data_deidentification_required'])
        b['case_context']['data_deidentified']=True
        items,_,_,e=self.parse(b);self.assertEqual(e,[])
        self.assertEqual(items[0]['request']['requested_discipline'],'psychology')
    def test_installer_exact_source_and_syntax(self):
        self.assertEqual(installer.digest(self.source.encode()),installer.EXPECTED_WEBAPP)
        patched=installer.patch_webapp(self.source);compile(patched,'patched-webapp','exec')
        self.assertIn('if cart_items and not direct:',patched)
        with self.assertRaises(ValueError):installer.patch_webapp(patched)

if __name__ == '__main__':unittest.main()
