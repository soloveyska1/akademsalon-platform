#!/usr/bin/env python3
"""Установщик «подарка новичку Кладовой» (kladovaya_welcome.py) на сервер Салона.

  python3 install_kladovaya_welcome.py --root /root/salon_bot --check
  python3 install_kladovaya_welcome.py --root /root/salon_bot --apply --restart
  python3 install_kladovaya_welcome.py --root /root/salon_bot --rollback <папка бэкапа> --restart

--check ничего не пишет: сверяет хеш app/webapp.py с известным, находит каждое
место правки ровно один раз. --apply: бэкап в backups/kladovaya-welcome-<UTC>/,
модуль в app/services/kladovaya_welcome.py, три правки webapp.py (импорт и одна
строка перед db.promo_get в заявке и в /api/promo/check), py_compile; с
--restart — перезапуск salon-bot-v2 и проверка /api/health, при сбое — откат
сам. --rollback возвращает исходники из бэкапа (база не трогается: строки promos
подарка остаются и без модуля ничего не дают — семейство обычное).
Решение владельца 09.10.2026: встраивать, 12 % до 5 000 ₽.
"""

from __future__ import annotations

import argparse
import hashlib
import py_compile
import shutil
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
MARKER = "# kladovaya-welcome:20261009-v1"
# app/webapp.py в проде 09.10.2026 (release228); другой — стоп, сверить руками.
KNOWN_BEFORE = {"e28d83771c4533f799de65c56d260412c894c94d31abf0b4a10e398f33450e29"}

EDITS = [
    (
        "from .services import zero_campaign\n",
        "from .services import zero_campaign\n"
        f"from .services import kladovaya_welcome  {MARKER}\n",
    ),
    (
        "    if raw_promo:\n"
        "        p = await db.promo_get(raw_promo)\n"
        "        bad = promo_svc.why_invalid(p) if p is not None else \"not_found\"\n"
        "        if not bad and p[\"family\"] == \"first-order-2026-08\":\n",
        "    if raw_promo:\n"
        f"        welcome_bad = await kladovaya_welcome.prepare(raw_promo, user)  {MARKER}\n"
        "        p = await db.promo_get(raw_promo)\n"
        "        bad = welcome_bad or (promo_svc.why_invalid(p) if p is not None else \"not_found\")\n"
        "        if not bad and p[\"family\"] == \"first-order-2026-08\":\n",
    ),
    (
        "    p = await db.promo_get(code)\n"
        "    bad = promo_svc.why_invalid(p) if p is not None else \"not_found\"\n"
        "    if not bad and p[\"family\"] == \"first-order-2026-08\":\n",
        f"    welcome_bad = await kladovaya_welcome.prepare(code, await _session_user(request))  {MARKER}\n"
        "    p = await db.promo_get(code)\n"
        "    bad = welcome_bad or (promo_svc.why_invalid(p) if p is not None else \"not_found\")\n"
        "    if not bad and p[\"family\"] == \"first-order-2026-08\":\n",
    ),
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def patched(source: str) -> str:
    if MARKER in source:
        raise SystemExit("webapp.py уже с подарком новичку — ставить второй раз нечего")
    for before, after in EDITS:
        count = source.count(before)
        if count != 1:
            raise SystemExit(f"место правки найдено {count} раз(а), нужно ровно 1:\n{before}")
        source = source.replace(before, after)
    return source


def check(root: Path) -> str:
    webapp = root / "app" / "webapp.py"
    digest = sha256(webapp)
    if digest not in KNOWN_BEFORE:
        raise SystemExit(f"app/webapp.py незнакомый ({digest[:16]}…) — сверить и дописать в KNOWN_BEFORE")
    patched(webapp.read_text(encoding="utf-8"))
    if not (root / "app" / "services" / "zero_campaign.py").exists():
        raise SystemExit("нет app/services/zero_campaign.py — общий секрет кампаний берётся оттуда")
    return digest


def health(url: str, attempts: int = 20) -> bool:
    for _ in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=5) as response:
                if response.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(1.5)
    return False


def restart() -> None:
    subprocess.run(["systemctl", "restart", "salon-bot-v2.service"], check=True)


def apply(root: Path, *, do_restart: bool, health_url: str) -> Path:
    check(root)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = root / "backups" / f"kladovaya-welcome-{stamp}"
    backup.mkdir(parents=True)
    webapp = root / "app" / "webapp.py"
    module = root / "app" / "services" / "kladovaya_welcome.py"
    shutil.copy2(webapp, backup / "webapp.py")
    (backup / "README").write_text("Откат: python3 install_kladovaya_welcome.py --root <root> --rollback <эта папка> --restart\n", encoding="utf-8")
    new_source = patched(webapp.read_text(encoding="utf-8"))
    tmp_webapp = webapp.with_suffix(".py.kladovaya-welcome.tmp")
    tmp_webapp.write_text(new_source, encoding="utf-8")
    shutil.copymode(webapp, tmp_webapp)
    py_compile.compile(str(tmp_webapp), doraise=True)
    tmp_module = module.with_suffix(".py.tmp")
    shutil.copy2(HERE / "kladovaya_welcome.py", tmp_module)
    py_compile.compile(str(tmp_module), doraise=True)
    tmp_module.replace(module)
    tmp_webapp.replace(webapp)
    print(f"установлено: webapp.py {sha256(webapp)[:16]}…, модуль {sha256(module)[:16]}…, бэкап {backup}")
    if do_restart:
        restart()
        if not health(health_url):
            print("здоровье не ответило — откатываю", file=sys.stderr)
            rollback(root, backup, do_restart=True, health_url=health_url)
            raise SystemExit(1)
        print("перезапущено, /api/health — 200")
    return backup


def rollback(root: Path, backup: Path, *, do_restart: bool, health_url: str) -> None:
    shutil.copy2(backup / "webapp.py", root / "app" / "webapp.py")
    module = root / "app" / "services" / "kladovaya_welcome.py"
    if module.exists():
        module.unlink()
    print(f"исходники возвращены из {backup}")
    if do_restart:
        restart()
        print("здоровье после отката:", "200" if health(health_url) else "НЕТ ОТВЕТА")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="/root/salon_bot")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true")
    group.add_argument("--apply", action="store_true")
    group.add_argument("--rollback")
    parser.add_argument("--restart", action="store_true")
    parser.add_argument("--health-url", default="http://127.0.0.1:8090/api/health")
    args = parser.parse_args(argv)
    root = Path(args.root)
    if args.check:
        print(f"можно ставить: webapp.py {check(root)[:16]}…, три места правки найдены по разу")
    elif args.apply:
        apply(root, do_restart=args.restart, health_url=args.health_url)
    else:
        rollback(root, Path(args.rollback), do_restart=args.restart, health_url=args.health_url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
