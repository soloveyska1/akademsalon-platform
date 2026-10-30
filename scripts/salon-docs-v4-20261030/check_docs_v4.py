"""Проверка сборки «Документов Салона» v4: прежние страницы против собранных.

python check_docs_v4.py <папка с прежними страницами> <out-папка> [--preview]

Для каждой из двенадцати страниц: текст документа совпадает посимвольно (заголовок и подзаголовок
переехали на ночную сцену, но остались на странице), все прежние id и ссылки на месте, head и подвал
не изменились, кроме оговорённого (стили, скрипт, класс body, призыв в подвале, robots у превью),
скрипт читалки находит всё, на что опирается. Код выхода 1 — если что-то не так."""
import html as H
import re
import sys
from pathlib import Path

src, out = Path(sys.argv[1]), Path(sys.argv[2])
preview = "--preview" in sys.argv[3:]
PAGES = ["requisites", "oferta", "terms", "loyalty", "refunds", "academic-integrity", "privacy",
         "consent-request", "consent", "consent-analytics", "consent-marketing", "consent-publication"]
VER = "docs-v4-20261030-1"
problems = []


def text(h, sep=""):
    return re.sub(r"\s+", "" if sep == "" else " ", H.unescape(re.sub(r"<[^>]+>", sep, h))).strip()


def check(cond, msg):
    if not cond:
        problems.append(msg)


for slug in PAGES:
    old = (src / f"{slug}.html").read_text(encoding="utf-8")
    new = (out / (f"{slug}-v4.html" if preview else f"{slug}.html")).read_text(encoding="utf-8")
    om = old[old.index("<main"):old.index("</main>")]
    nm = new[new.index("<main"):new.index("</main>")]
    oa = om[om.index('<article class="doc">'):om.index("</article>")]
    na = nm[nm.index("<article class=\"doc"):nm.index("</article>")]
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", nm, re.S).group(1)
    sub = re.search(r'<p class="doc-subtitle[^"]*">(.*?)</p>', nm, re.S)
    moved = f"<h1>{h1}</h1>" + (f"<p>{sub.group(1)}</p>" if sub else "")
    check(text(oa) == text(moved + na), f"{slug}: текст документа отличается")
    check(text(oa, " ") == text(moved + na, " "), f"{slug}: слова документа отличаются")
    check(re.findall(r'href="([^"]*)"', oa) == re.findall(r'href="([^"]*)"', na), f"{slug}: ссылки в тексте изменились")
    ids = re.findall(r'\bid="([^"]+)"', new)
    check(len(ids) == len(set(ids)), f"{slug}: повторяются id")
    for i in re.findall(r'\bid="([^"]+)"', om):
        check(i in ids, f"{slug}: пропал id {i}")
    check(new.count("<h1") == 1, f"{slug}: h1 не один")
    # Всё, на что опирается docs-v4.js
    for need in ("data-legal-reader", 'id="ld-search"', 'id="ld-search-status"', 'id="ld-toc"', "data-ld-next", "data-ld-size",
                 "data-ld-print", "data-ld-now", 'class="ld-navigation"', 'class="ld-sidebar"', 'class="ld-progress"'):
        check(nm.count(need) == 1, f"{slug}: {need} — {nm.count(need)} раз")
    check(re.search(r"<h2\b", na) is not None, f"{slug}: нет разделов h2")
    # Вне <main> меняется только оговорённое
    def outside(p):
        p = p[:p.index("<main")] + p[p.index("</main>"):]
        p = re.sub(r'<div class="bottom-heading">.*?</div>', "", p, flags=re.S)
        p = p.replace(' ds-v4">', '">')
        p = re.sub(r'<link rel="preload" href="assets/fonts/v4/literata-display-cyrillic.woff2"[^>]*>', "", p)
        p = re.sub(r'<link rel="stylesheet" href="assets/css/(ds-v4|docs-v4|salon-legal)\.css[^"]*">', "", p)
        p = re.sub(r'<script src="assets/js/(docs-v4|salon-legal)\.js[^"]*"></script>', "", p)
        return re.sub(r'<meta name="robots" content="[^"]*"\s*/?>', "", p) if preview else p
    check(outside(old) == outside(new), f"{slug}: изменилось что-то вне <main>")
    check(f"docs-v4.css?v={VER}" in new and f"docs-v4.js?v={VER}" in new and "ds-v4.css?v=home-v4-20261030-4" in new,
          f"{slug}: версии стилей или скрипта")
    check("salon-legal.css" not in new and "salon-legal.js" not in new, f"{slug}: осталась старая читалка")
    check(new.index("salon-reading.css") < new.index("ds-v4.css") < new.index("docs-v4.css"), f"{slug}: порядок стилей")
    robots = re.search(r'<meta name="robots" content="([^"]*)"', new).group(1)
    if preview:
        check(robots == "noindex,nofollow", f"{slug}: превью без noindex")
        check(re.search(r'href="(?:requisites|oferta|terms|privacy|loyalty|refunds|academic-integrity|consent[a-z-]*)\.html"',
                        nm.replace(na, "")) is None, f"{slug}: навигация превью ведёт на живые страницы")
    else:
        check(robots == re.search(r'<meta name="robots" content="([^"]*)"', old).group(1), f"{slug}: robots изменился")
        check("-v4.html" not in new, f"{slug}: ссылка на превью в живой странице")
    check(not re.search(r"[↗↓↑→]", re.sub(r"<article.*?</article>", "", nm, flags=re.S)), f"{slug}: стрелки в интерфейсе")

for f in ("assets/css/docs-v4.css", "assets/js/docs-v4.js"):
    check((out / f).is_file(), f"нет {f}")

if problems:
    print("\n".join(problems))
    sys.exit(1)
print(f"ok: {len(PAGES)} страниц", "(превью)" if preview else "")
