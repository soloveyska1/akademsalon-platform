"""Переносит новые тексты магазина в индекс Листика (assistant_knowledge.json).

python refresh_listik.py <assistant_knowledge.json> <релиз до правки> <релиз после правки>

Заменяет только те фрагменты /shop.html и /shop-terms.html, чей текст изменился между
двумя релизами. Остальное остаётся байт в байт: другие страницы, кампании, исключения и
девять фрагментов с карточками работ, которые релиз 11 сентября дописал к /shop.html
(в самом HTML их нет — карточки рисует скрипт). Разбор страницы — точная копия PublicText
из scripts/build-assistant-knowledge.py (ветка codex/listik-concierge, 9a9d2510)."""
import hashlib
import json
import sys
from html.parser import HTMLParser
from pathlib import Path

PAGES = ("shop.html", "shop-terms.html")


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


def chunks(source):
    parser = PublicText()
    parser.feed(source)
    parser.flush()
    return parser.chunks


def main(index_path, before, after):
    corpus = json.loads(index_path.read_bytes().decode("utf-8"))
    for name in PAGES:
        entry = next(p for p in corpus["pages"] if p["url"] == "/" + name)
        new_source = (after / name).read_bytes().decode("utf-8")
        old, new = chunks((before / name).read_bytes().decode("utf-8")), chunks(new_source)
        assert len(old) == len(new), f"/{name}: фрагментов было {len(old)}, стало {len(new)}"
        changed = [(o, n) for o, n in zip(old, new) if o != n]
        for o, n in changed:
            assert entry["chunks"].count(o) == 1, f"/{name}: в индексе нет фрагмента «{o['text'][:60]}…»"
            entry["chunks"][entry["chunks"].index(o)] = n
        entry["sha256"] = hashlib.sha256(new_source.encode()).hexdigest()
        page = json.dumps(entry, ensure_ascii=False).lower()
        for word in ("неэксклюз", "неисключ", "тираж"):
            assert word not in page, f"/{name}: осталось «{word}»"
        print(f"/{name}: заменено фрагментов {len(changed)} из {len(entry['chunks'])}")
    index_path.write_bytes((json.dumps(corpus, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8"))


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
