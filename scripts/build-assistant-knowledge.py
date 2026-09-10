#!/usr/bin/env python3
"""Reproducible public-only Listik index. Never ingest private referral prototypes.
No customer content, account pages, form values, script bodies or external crawl.
"""
import argparse, hashlib, json, re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {'admin.html','admin-covers.html','dashboard.html','configurator.html','zayavka.html','oplaceno.html','404.html','50x.html','offline.html','maintenance.html','referral.html','referral-rules.html','requisites.html','terms.html'}
class PublicText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.main=False; self.skip=[]; self.title=''; self.heading=''; self.anchor=''; self.chunks=[]; self.capture=None; self.text=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=='main': self.main=True
        if not self.main:return
        if self.skip:
            if tag not in ('input','br','hr','img','meta','link','source','wbr'):self.skip.append(tag)
            return
        if tag in ('script','style','form','nav','button','select','textarea','svg','noscript'):
            self.skip.append(tag);return
        if tag in ('h1','h2','h3','h4','p','li','tr','summary'):
            if self.capture:self.flush()
            self.capture=tag;self.text=[]
            if tag.startswith('h') and tag!='hr': self.pending_anchor=a.get('id','')
    def handle_endtag(self,tag):
        if self.skip:
            if tag==self.skip[-1]:self.skip.pop()
            return
        if tag==self.capture:self.flush()
        if tag=='main':self.main=False
    def handle_data(self,text):
        if self.main and not self.skip and self.capture:self.text.append(text)
    def flush(self):
        value=' '.join(' '.join(self.text).split())
        if self.capture and self.capture.startswith('h'):
            if self.capture=='h1':self.title=value
            self.heading=value;self.anchor=getattr(self,'pending_anchor','')
        elif len(value)>35 and value not in [x['text'] for x in self.chunks]:
            self.chunks.append({'heading':self.heading,'anchor':self.anchor,'text':value})
        self.capture=None;self.text=[]

def build(root):
    pages=[]
    for p in sorted(root.glob('*.html')):
        if p.name in EXCLUDED or p.name.startswith(('admin','consent-')):continue
        source=p.read_text()
        if re.search(r'<meta[^>]+name=["\']robots["\'][^>]+content=["\'][^"\']*noindex',source,re.I):continue
        parser=PublicText();parser.feed(source);parser.flush()
        if not parser.chunks:continue
        pages.append({'url':'/'+p.name,'title':parser.title or p.stem,'sha256':hashlib.sha256(source.encode()).hexdigest(),'chunks':parser.chunks})
    loyalty=(root/'loyalty.html').read_text()
    campaigns=[]
    # Freeze only the exact published campaign. A changed clause fails closed.
    plain=' '.join(re.sub('<[^>]+>',' ',loyalty).split())
    if all(x in plain for x in ['ПЕРВЫЙЛИСТ','с 24 августа по 21 сентября 2026','от 2 500 ₽','12%','не более 5 000 ₽']):
        campaigns.append({'code':'ПЕРВЫЙЛИСТ','start':'2026-08-24','end':'2026-09-21','percent':12,'minimum':2500,'cap':5000,'url':'/loyalty.html#first-order-promo'})
    return {'version':1,'pages':pages,'campaigns':campaigns,'excludes':sorted(EXCLUDED)}
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,default=ROOT);ap.add_argument('--check',action='store_true');a=ap.parse_args()
    data=build(a.root);payload=json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n';dest=ROOT/'backend/salon_bot/assistant_knowledge.json'
    if a.check:
        if not dest.exists() or dest.read_text()!=payload:raise SystemExit('Listik index is stale: run scripts/build-assistant-knowledge.py')
    else:dest.write_text(payload)
    print(json.dumps({'pages':len(data['pages']),'chunks':sum(len(p['chunks']) for p in data['pages']),'bytes':len(payload.encode())}))
