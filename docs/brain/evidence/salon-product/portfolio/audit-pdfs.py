"""Validate the seven publication PDFs without opening private originals."""
import hashlib,json,re,sys
from pathlib import Path
from pypdf import PdfReader
root=Path(sys.argv[1]);ev=root/'docs/brain/evidence/salon-product/portfolio'
provenance=json.loads((ev/'provenance.json').read_text());out=[]
for x in provenance['documents']:
 p=root/'assets/samples'/(x['id']+'.pdf');r=PdfReader(p);texts=[page.extract_text() or '' for page in r.pages];body='\n'.join(texts)
 assert x['source_modified'][:7]<'2026-09'
 assert hashlib.sha256(p.read_bytes()).hexdigest()==x['pdf_sha256']
 assert not r.metadata.get('/Author') and not r.metadata.get('/Creator')
 assert all(not page.get('/Annots') for page in r.pages)
 assert '/EmbeddedFiles' not in str(r.trailer['/Root'].get('/Names',''))
 assert not re.search(r'file:///|/Users/|mailto:|@[a-zA-Z0-9.-]+\.[a-z]{2,}',body)
 assert not re.search(r'Обновите оглавление|Ошибка! Закладка',body)
 assert all(re.sub(r'Академический Салон\s*·\s*\d+','',t).strip() for t in texts)
 out.append(dict(id=x['id'],sha256=x['pdf_sha256'],pages=len(r.pages),metadata_clean=True,annotations=0,blank_pages=0,source_before_september=True))
(ev/'pdf-audit.json').write_text(json.dumps(out,indent=2));print('7 PDFs / '+str(sum(x['pages'] for x in out))+' pages: metadata, annotation, date, text, hash and blank-page guards PASS')
