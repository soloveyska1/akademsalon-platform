import ast,json,subprocess,types,pathlib
p=pathlib.Path('/tmp/salon-autoquote-review/app/services/contract.py')
t=ast.parse(p.read_text());t.body=[n for n in t.body if not(isinstance(n,ast.ImportFrom) and n.level)]
g={'config':types.SimpleNamespace(),'db':types.SimpleNamespace(),'payments':types.SimpleNamespace()};exec(compile(t,str(p),'exec'),g)
norm=lambda x:g['_normal_line'](x,1,{'id':101,'topic':'SYNTHETIC'},'2026-09-10T00:00:00')
raw={'line_id':'LN-1','contract_contour':'A','academic_submode':'A1','service_id':'ai','title':'SYNTHETIC review','deliverable':'Exact annotated source','formats':['docx','pdf'],'inclusions':['fact check','source check'],'exclusions':['new research'],'acceptance_criteria':['all 3 references checked'],'deadline':{'date':'2026-10-01','text':'Contractual Oct 1'},'correction_window':{'days':14,'scope':'Exact agreed defects'},'iterations':3,'price_amount':6011,'discount_amount':20,'customer_inputs':{'description':'Sample input','version':'v3','source_material_required':True,'source_material_provided':True,'original_prompt':'Synthetic prompt','sources_disclosure':'Synthetic sources'}}
base=norm(raw)
# Read current implementation; no actual customer information and no backend request.
core='/Users/saymurrbk.ru/.codex/worktrees/salon-admin-rebuild/assets/js/salon-admin-core.js'
run=lambda code:json.loads(subprocess.check_output(['node','-e',code],input=json.dumps(base).encode()))
current=run("let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(require("+json.dumps(core)+").pricedLines({id:101,specification_lines:[JSON.parse(s)]},6011)[0])));")
adapted=run("let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(require("+json.dumps(core)+").specificationSubmissionLine(JSON.parse(s)))));")
changed=lambda got:{k:{'before':v,'after':got.get(k)} for k,v in base.items() if got.get(k)!=v}
report={'current_changes':changed(norm(current)),'adapter_changes':changed(norm(adapted)),'synthetic':True}
pathlib.Path('/tmp/admin-rebuild-spec-roundtrip.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2));assert not report['adapter_changes']
