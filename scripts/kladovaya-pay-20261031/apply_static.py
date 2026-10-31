#!/usr/bin/env python3
"""Статика кассы Кладовой (kladovaya-pay:20261031-v1) поверх копии живого релиза Салона.

  python3 apply_static.py --check <папка релиза>
  python3 apply_static.py <папка релиза>

kladovaya-oplata.html собирается на каркасе oplaceno.html того же релиза: шапка, стили,
подвал, robots noindex и referrer no-referrer берутся оттуда, меняются только title,
подпись картинки-превью, <main>, скрипт страницы и noscript, а стиль страницы встаёт
перед </head>. Исходники — page/main.html, page/page.js, page/page.css.

В oplaceno.html добавляется одна ветка: Shp_kind=kladovaya ведёт на
/api/kladovaya/pay/return/paid/<заказ> (сервер сверяет оплату и отправляет в бота),
а с битым номером заказа — просто в бота. Без неё такой возврат ушёл бы в кабинет
Салона как dashboard.html?paid=<заказ>. Ветка живёт только в релизах: тот, кто
пересоберёт oplaceno.html, должен её сохранить (метка kladovaya-pay:20261031-v1).

Спецификация на странице написана под оферту 3.2 и политику 3.1: релиз с другой
редакцией этих документов сборка не принимает.

Каждая правка — по точному совпадению ровно один раз; повторный запуск отказывается.
Оба файла сначала пишутся во временные и только потом подменяются.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MARKER = "kladovaya-pay:20261031-v1"
PAGE = "kladovaya-oplata.html"
TITLE = ("<title>Проверяем оплату — Академический Салон</title>",
         "<title>Оплата исправления оформления — Академический Салон</title>")
ALT = ('content="Академический Салон — Проверяем оплату — Академический Салон"',
       'content="Академический Салон — Оплата исправления оформления"')
MAIN_RE = re.compile(r'<main class="p15-operations system-page system-page--payment" id="main">.*?</main>\n', re.S)
SCRIPT_RE = re.compile(r"(?<=</main>\n)<script>\n(?:(?!</script>).)*</script>\n", re.S)
NOSCRIPT_RE = re.compile(r"<noscript>(?:(?!</noscript>).)*</noscript>\n", re.S)
NOSCRIPT = ('<noscript><p style="position:fixed;right:16px;bottom:16px;left:16px;margin:0;padding:12px 16px;'
            'color:#20211e;background:#fff;border:1px solid #645f57;border-radius:6px;text-align:center">'
            'Для оплаты нужен JavaScript. Или вернитесь в <a href="https://t.me/kladovoygipsrbot">бота Кладовой</a>.'
            "</p></noscript>\n")
ROUTE = (
    "  if (kind === 'tip' && order) target = 'dashboard.html?thanks=' + encodeURIComponent(order);\n",
    f"  // {MARKER}: возврат с кассы за услугу Кладовой — через сервер Салона в её бота\n"
    "  if (kind === 'kladovaya') target = /^k[a-z0-9]{10}$/.test(order)\n"
    "    ? '/api/kladovaya/pay/return/paid/' + order : 'https://t.me/kladovoygipsrbot';\n"
    "  else if (kind === 'tip' && order) target = 'dashboard.html?thanks=' + encodeURIComponent(order);\n",
)
# редакции, под которые написана спецификация format_fix 1.0 (SPEC_DOCS в kladovaya_pay.py)
EDITIONS = {"oferta.html": "Редакция 3.2", "privacy.html": "Редакция 3.1"}


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: место правки найдено {count} раз(а), нужно ровно 1:\n{old}")
    return text.replace(old, new)


def regex_once(text: str, pattern: re.Pattern, new: str, label: str) -> str:
    result, count = pattern.subn(lambda _match: new, text)
    if count != 1:
        raise SystemExit(f"{label}: шаблон найден {count} раз(а), нужно ровно 1: {pattern.pattern[:80]}")
    return result


def source(name: str) -> str:
    text = (HERE / "page" / name).read_text(encoding="utf-8")
    return text if text.endswith("\n") else text + "\n"


def build_page(template: str) -> str:
    if MARKER in template:
        raise SystemExit("oplaceno.html уже с кассой Кладовой — каркас брать из релиза до правки")
    page = once(template, *TITLE, "title")
    if ALT[0] in page:
        page = once(page, *ALT, "og:image:alt")
    page = regex_once(page, MAIN_RE, source("main.html"), "main")
    page = regex_once(page, SCRIPT_RE, "<script>\n" + source("page.js") + "</script>\n", "script")
    page = regex_once(page, NOSCRIPT_RE, NOSCRIPT, "noscript")
    page = once(page, "</head>", "<style>\n" + source("page.css") + "</style>\n</head>", "head")
    for needle in ('name="robots" content="noindex,nofollow"', 'name="referrer" content="no-referrer"'):
        if needle not in page:
            raise SystemExit(f"каркас без {needle} — страница с подписанной ссылкой без него не выходит")
    return page


def route(template: str) -> str:
    if MARKER in template:
        raise SystemExit("oplaceno.html уже с кассой Кладовой — второй раз не ставится")
    return once(template, *ROUTE, "oplaceno.html")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def editions(release: Path) -> None:
    for name, edition in EDITIONS.items():
        text = (release / name).read_bytes().decode("utf-8")
        if edition not in text:
            raise SystemExit(f"{name} в релизе не «{edition}» — спецификация format_fix 1.0 написана под неё; "
                             "нужна новая редакция спецификации")


def apply(release: Path, *, check_only: bool = False) -> dict[str, str]:
    oplaceno, target = release / "oplaceno.html", release / PAGE
    if target.exists():
        raise SystemExit(f"{target} уже есть — релиз уже с кассой Кладовой?")
    editions(release)
    template = oplaceno.read_bytes().decode("utf-8")
    page, routed = build_page(template), route(template)
    report = {"oplaceno_before": digest(template.encode()), "oplaceno_after": digest(routed.encode()),
              PAGE: digest(page.encode())}
    if check_only:
        return report
    staged = []
    for path, text in ((target, page), (oplaceno, routed)):
        tmp = path.with_name(f".{path.name}.kladovaya-pay.tmp")
        tmp.write_bytes(text.encode("utf-8"))
        staged.append((tmp, path))
    for tmp, path in staged:
        tmp.replace(path)
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("release", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    report = apply(args.release, check_only=args.check)
    print(("можно ставить" if args.check else "поставлено") + ": "
          + ", ".join(f"{name} {value[:16]}…" for name, value in report.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
