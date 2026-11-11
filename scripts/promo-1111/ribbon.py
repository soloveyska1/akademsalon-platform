"""Плашка акции «11.11» над шапкой главной (index.html и home-v4.html).

    python ribbon.py SRC_DIR OUT_DIR            вставить (повторный запуск ничего не меняет)
    python ribbon.py SRC_DIR OUT_DIR --remove   убрать плашку совсем

SRC_DIR и OUT_DIR могут совпадать (правка на месте). Перед вставкой старая плашка
снимается по меткам <!-- promo-1111 -->…<!-- /promo-1111 -->, поэтому скрипт идемпотентен.
Стиль кладётся в конец <head>, разметка и инлайн-скрипт сразу после ссылки
«К содержанию», то есть перед липкой шапкой: плашка уезжает при прокрутке, шапка
прилипает как раньше. После 23:59:59 12.11.2026 по Москве скрипт убирает плашку
сам, без JS она остаётся до следующего релиза.
"""
import re
import sys
from pathlib import Path

PAGES = ('index.html', 'home-v4.html')
END = '2026-11-12T23:59:59+03:00'
OPEN, CLOSE = '<!-- promo-1111 -->', '<!-- /promo-1111 -->'

STYLE = (
    '<style>'
    '.pm-ribbon{display:block;padding:10px 16px;border-bottom:1px solid var(--ds-line,#e6e1f3);'
    'background:var(--ds-violet-soft,#ece6ff);color:var(--ds-ink,#1b1531);'
    'font:400 14px/1.45 var(--sans,"Onest","Golos Text",Arial,sans-serif);'
    'text-align:center;text-decoration:none;text-wrap:balance}'
    '.pm-ribbon b{font-weight:600}'
    '.pm-ribbon-more{margin-left:4px;font-weight:600;color:var(--ds-violet,#4b30c8);text-decoration:underline;'
    'text-decoration-thickness:1.5px;text-underline-offset:4px;white-space:nowrap}'
    '.pm-ribbon:hover .pm-ribbon-more{color:var(--ds-violet-hover,#3b23a8);text-decoration-thickness:2px}'
    '.pm-ribbon:focus-visible{outline:3px solid var(--ds-violet,#4b30c8);outline-offset:-3px;border-radius:0}'
    '@media(max-width:640px){.pm-ribbon{padding:8px 16px;font-size:13px;line-height:1.4}.pm-ribbon-more{margin-left:2px}}'
    '@media(max-width:359px){.pm-ribbon{padding:8px 10px;font-size:12px}}'
    '</style>'
)

RIBBON = (
    '<a class="pm-ribbon" id="pm-ribbon" href="11-11.html">'
    '<b>11.11 в&nbsp;последний момент:</b> подарок к&nbsp;защите для новых заказов до&nbsp;23:59 12&nbsp;ноября '
    '<span class="pm-ribbon-more">Подробнее</span></a>'
    "<script>(function(){var r=document.getElementById('pm-ribbon');"
    f"if(r&&Date.now()>Date.parse('{END}'))r.parentNode.removeChild(r);}}());</script>"
)

BLOCK = re.compile(re.escape(OPEN) + r'.*?' + re.escape(CLOSE), re.S)
SKIP = re.compile(r'<a class="skip-link" href="#main">[^<]*</a>')


def apply(html, remove=False):
    html = BLOCK.sub('', html)
    if remove:
        return html
    assert html.count('</head>') == 1, 'нет </head>'
    html = html.replace('</head>', OPEN + STYLE + CLOSE + '</head>', 1)
    m = SKIP.search(html) or re.search(r'<body\b[^>]*>', html)
    assert m, 'нет <body>'
    return html[:m.end()] + OPEN + RIBBON + CLOSE + html[m.end():]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    remove = '--remove' in sys.argv
    src, out = Path(args[0]), Path(args[1])
    out.mkdir(parents=True, exist_ok=True)
    for name in PAGES:
        html = (src / name).read_bytes().decode('utf-8')
        new = apply(html, remove)
        assert apply(new, remove) == new, 'не идемпотентно'
        (out / name).write_bytes(new.encode('utf-8'))
        print(name, 'убрана' if remove else 'есть', len(new.encode('utf-8')), 'байт')


if __name__ == '__main__':
    main()
