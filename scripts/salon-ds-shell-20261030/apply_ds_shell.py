"""Подключает ds-shell.css (шрифт оболочки сайта) на всех страницах релиза, где есть шапка.

python apply_ds_shell.py <папка с HTML релиза>

Ссылка ставится сразу после salon-experience.css с тем же префиксом пути, рядом прелоад кириллицы
Onest (если его ещё нет). Повторный запуск ничего не меняет. Каждая вставка проверяется."""
import re
import sys
from pathlib import Path

VER = "ds-shell-20261030-1"
root = Path(sys.argv[1])
LINK = re.compile(r'<link rel="stylesheet" href="(/?)assets/css/salon-experience\.css\?[^"]*">')

changed, skipped = [], []
for page in sorted(root.glob("*.html")):
    with open(page, encoding="utf-8", newline="") as fh:
        html = fh.read()
    found = LINK.findall(html)
    if not found or "ds-shell.css" in html:
        skipped.append(page.name)
        continue
    assert len(found) == 1, page.name
    prefix = found[0]
    tags = ""
    if "onest-cyrillic.woff2" not in html:
        tags += f'<link rel="preload" href="{prefix}assets/fonts/v4/onest-cyrillic.woff2" as="font" type="font/woff2" crossorigin>'
    tags += f'<link rel="stylesheet" href="{prefix}assets/css/ds-shell.css?v={VER}">'
    m = LINK.search(html)
    html = html[:m.end()] + tags + html[m.end():]
    assert html.count("ds-shell.css") == 1 and html.count("onest-cyrillic.woff2") <= 2
    with open(page, "w", encoding="utf-8", newline="") as fh:
        fh.write(html)
    changed.append(page.name)

print(f"changed {len(changed)}, skipped {len(skipped)}: {' '.join(skipped)}")
