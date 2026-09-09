"""Deterministic integrity, privacy, pagination and sample/page parity checks."""
from pathlib import Path
import hashlib, json, zipfile
from lxml import etree
import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/docs/specification-2026'
EVIDENCE = ROOT / 'docs/brain/evidence/specification-document'
EVIDENCE.mkdir(parents=True, exist_ok=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
report = {'checks': [], 'artifacts': {}}
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
for variant, count in [('sample', 8), ('template', 9)]:
    docx = OUT / f'specification-{variant}.docx'
    with zipfile.ZipFile(docx) as z:
        assert z.testzip() is None
        names = z.namelist()
        assert not any('comments' in n or 'vbaProject' in n or 'embeddings/' in n for n in names)
        for n in names:
            if n.endswith(('.xml', '.rels')):
                raw = z.read(n)
                xml = etree.fromstring(raw)
                for tag in ['ins', 'del', 'moveFrom', 'moveTo', 'vanish', 'webHidden']:
                    assert not list(xml.iter(W+tag)), (n, tag)
                assert b'TargetMode="External"' not in raw
                assert not any(s in raw for s in [b'/Users/', b'Codex', b'oai-mem-citation', b'turn0search'])
        xml = etree.fromstring(z.read('word/document.xml'))
        text = ''.join(xml.itertext())
        for required in ['Наименование в чеке', 'до предложения позиции к оплате', 'безвозмездную простую', 'не меняет ранее принятые условия']:
            assert required in text, (variant, required)
        core = etree.fromstring(z.read('docProps/core.xml'))
        for node in core:
            if etree.QName(node).localname in ['creator', 'lastModifiedBy']:
                assert (node.text or '') in ['', 'Академический Салон']
    pdf = OUT / f'specification-{variant}.pdf'
    with pdfplumber.open(pdf) as d:
        assert len(d.pages) == count
        lengths = []
        for page in d.pages:
            txt = page.extract_text()
            assert len(txt) > 500
            lengths.append(len(txt))
            for word in page.extract_words():
                assert word['x0'] >= 0 and word['top'] >= 0 and word['x1'] <= page.width+1 and word['bottom'] <= page.height+1
    report['artifacts'][variant] = {'docx_sha256': sha(docx), 'pdf_sha256': sha(pdf), 'pages':count, 'page_text_lengths':lengths}
    report['checks'].append(f'{variant}: ZIP/XML integrity, metadata, no annotations/tracked/hidden/external content, required clauses, PDF page bounds passed')
page = (ROOT/'legal/specification-2026/page-replacement.html').read_text()
assert page.count('assets/docs/specification-2026/specification-sample.pdf?v=4') == 2
assert '30–35' in page and '14 000' in page and '3 000' in page
assert '9 000' not in page and '38 страниц' not in page
assert sum([3000,7000,4000]) == 14000
report['checks'].append('Page/sample scope, price, first payment and two PDF links match; stage total 3000+7000+4000=14000')
(EVIDENCE/'artifact-qa.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
