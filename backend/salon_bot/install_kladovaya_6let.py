#!/usr/bin/env python3
"""Установщик «Кладовой 6 лет» (kladovaya_6let.py + сторож подарков) на сервер Салона.

  python3 install_kladovaya_6let.py --root /root/salon_bot --check
  python3 install_kladovaya_6let.py --root /root/salon_bot --apply --restart
  python3 install_kladovaya_6let.py --root /root/salon_bot --rollback <папка бэкапа> --restart

--check ничего не пишет: сверяет хеши app/webapp.py и app/db.py с известными и
находит каждое место правки ровно один раз. --apply: бэкап в
backups/kladovaya-6let-<UTC>/, модуль в app/services/kladovaya_6let.py, сторож
в ops/kladovaya_6let_watch.py, две строки в webapp.py (импорт и маршрут
/api/campaigns/kladovaya-6let/sync), правка db.promo_customer_state (подписка
конкурса не лишает кода новичка), таблица подарков, py_compile; с --restart —
перезапуск salon-bot-v2, проверка /api/health (при сбое — откат сам) и таймер
сторожа salon-kladovaya-6let.timer. --rollback возвращает исходники из
бэкапа и выключает таймер (таблица подарков остаётся: без модуля она ничего не
даёт, выданные подписки остаются у людей).
Решение владельца 10.10.2026: «делаем» (docs/6let.md в репозитории Кладовой).
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import py_compile
import shutil
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
MARKER = "# kladovaya-6let:20261010-v1"
# прод 10.10.2026: webapp.py после подарка новичку (kladovaya-welcome), db.py как был
KNOWN_BEFORE = {
    "app/webapp.py": {"aae1f385a6625287f713dfad017dd1cc03ec3c098a0a13ee2b5ad6cb46bea134"},
    "app/db.py": {"13031eb5ae95a45b09f4152189927e354f45f4e3dcaa481f2769c72321cf53d1"},
}
UNIT = "salon-kladovaya-6let"

WEBAPP_EDITS = [
    (
        "from .services import kladovaya_welcome  # kladovaya-welcome:20261009-v1\n",
        "from .services import kladovaya_welcome  # kladovaya-welcome:20261009-v1\n"
        f"from .services import kladovaya_6let  {MARKER}\n",
    ),
    (
        '    r.add_post("/api/campaigns/zero-classes-2026-09-01/claim", zero_campaign_claim)\n',
        '    r.add_post("/api/campaigns/zero-classes-2026-09-01/claim", zero_campaign_claim)\n'
        f"    kladovaya_6let.register(r, _ip)  {MARKER}\n",
    ),
]
DB_EDITS = [
    (
        "    for table, column in (\n"
        '        ("subscriptions", "user_id"), ("deposits", "user_id"),\n'
        '        ("gifts", "buyer_user_id"),\n'
        "    ):\n",
        f"    # подарки «Кладовой 6 лет» не лишают кода новичка  {MARKER}\n"
        "    if await (await c.execute(\n"
        "        \"SELECT 1 FROM subscriptions WHERE user_id=? AND COALESCE(via,'')<>'kladovaya-6let' LIMIT 1\",\n"
        "        (user_id,),\n"
        "    )).fetchone():\n"
        '        return "existing"\n'
        "    for table, column in (\n"
        '        ("deposits", "user_id"),\n'
        '        ("gifts", "buyer_user_id"),\n'
        "    ):\n",
    ),
]

SERVICE = f"""[Unit]
Description=Salon: «Кладовой 6 лет» gifts — switch subscriptions on after Telegram login (kladovaya_6let_watch.py)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/root/salon_bot
EnvironmentFile=/root/salon_bot/.env
Environment=SALON_DB_PATH=/root/salon_bot/salon.db
ExecStart=/usr/bin/python3 /root/salon_bot/ops/kladovaya_6let_watch.py run
Nice=10
TimeoutStartSec=90
"""
TIMER = f"""[Unit]
Description=Salon: «Кладовой 6 лет» gifts watcher, every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
AccuracySec=10s

[Install]
WantedBy=timers.target
"""


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def patched(source: str, edits: list[tuple[str, str]], name: str) -> str:
    if MARKER in source:
        raise SystemExit(f"{name} уже с «Кладовой 6 лет» — ставить второй раз нечего")
    for before, after in edits:
        count = source.count(before)
        if count != 1:
            raise SystemExit(f"{name}: место правки найдено {count} раз(а), нужно ровно 1:\n{before}")
        source = source.replace(before, after)
    return source


def check(root: Path) -> dict[str, str]:
    digests = {}
    for rel, known in KNOWN_BEFORE.items():
        digest = sha256(root / rel)
        if digest not in known:
            raise SystemExit(f"{rel} незнакомый ({digest[:16]}…) — сверить и дописать в KNOWN_BEFORE")
        digests[rel] = digest
    patched((root / "app/webapp.py").read_text(encoding="utf-8"), WEBAPP_EDITS, "webapp.py")
    patched((root / "app/db.py").read_text(encoding="utf-8"), DB_EDITS, "db.py")
    if not (root / "app" / "services" / "zero_campaign.py").exists():
        raise SystemExit("нет app/services/zero_campaign.py — подпись и nonce берутся оттуда")
    return digests


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


def systemctl(*args: str) -> None:
    subprocess.run(["systemctl", *args], check=True)


def write_compiled(path: Path, text: str, mode_from: Path | None = None) -> Path:
    tmp = path.with_suffix(path.suffix + ".kladovaya-6let.tmp")
    tmp.write_text(text, encoding="utf-8")
    if mode_from is not None:
        shutil.copymode(mode_from, tmp)
    py_compile.compile(str(tmp), doraise=True)
    return tmp


def apply(root: Path, *, do_restart: bool, health_url: str, systemd_dir: Path = Path("/etc/systemd/system")) -> Path:
    check(root)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = root / "backups" / f"kladovaya-6let-{stamp}"
    backup.mkdir(parents=True)
    webapp, dbpy = root / "app/webapp.py", root / "app/db.py"
    module = root / "app/services/kladovaya_6let.py"
    watcher = root / "ops/kladovaya_6let_watch.py"
    shutil.copy2(webapp, backup / "webapp.py")
    shutil.copy2(dbpy, backup / "db.py")
    (backup / "README").write_text("Откат: python3 install_kladovaya_6let.py --root <root> --rollback <эта папка> --restart\n", encoding="utf-8")
    tmp_webapp = write_compiled(webapp, patched(webapp.read_text(encoding="utf-8"), WEBAPP_EDITS, "webapp.py"), webapp)
    tmp_db = write_compiled(dbpy, patched(dbpy.read_text(encoding="utf-8"), DB_EDITS, "db.py"), dbpy)
    tmp_module = write_compiled(module, (HERE / "kladovaya_6let.py").read_text(encoding="utf-8"))
    watcher.parent.mkdir(parents=True, exist_ok=True)
    tmp_watcher = write_compiled(watcher, (HERE / "kladovaya_6let_watch.py").read_text(encoding="utf-8"))
    # таблица подарков — до перезапуска, чтобы первый обмен её уже видел
    spec = importlib.util.spec_from_file_location("kladovaya_6let_watch", HERE / "kladovaya_6let_watch.py")
    watch = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(watch)
    con = watch.connect(root / "salon.db")
    try:
        watch.migrate(con)
    finally:
        con.close()
    tmp_module.replace(module)
    tmp_watcher.replace(watcher)
    tmp_db.replace(dbpy)
    tmp_webapp.replace(webapp)
    print(f"установлено: webapp.py {sha256(webapp)[:16]}…, db.py {sha256(dbpy)[:16]}…, модуль {sha256(module)[:16]}…, сторож {sha256(watcher)[:16]}…, бэкап {backup}")
    if do_restart:
        systemctl("restart", "salon-bot-v2.service")
        if not health(health_url):
            print("здоровье не ответило — откатываю", file=sys.stderr)
            rollback(root, backup, do_restart=True, health_url=health_url, systemd_dir=systemd_dir)
            raise SystemExit(1)
        print("перезапущено, /api/health — 200")
        (systemd_dir / f"{UNIT}.service").write_text(SERVICE, encoding="utf-8")
        (systemd_dir / f"{UNIT}.timer").write_text(TIMER, encoding="utf-8")
        systemctl("daemon-reload")
        systemctl("enable", "--now", f"{UNIT}.timer")
        print(f"таймер {UNIT}.timer включён")
    return backup


def update(root: Path, *, health_url: str) -> Path:
    """Только новые модуль и сторож: правки webapp.py и db.py уже стоят (--apply)."""
    webapp = root / "app/webapp.py"
    if MARKER not in webapp.read_text(encoding="utf-8"):
        raise SystemExit("«Кладовой 6 лет» ещё не стоит — сначала --apply")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = root / "backups" / f"kladovaya-6let-update-{stamp}"
    backup.mkdir(parents=True)
    module = root / "app/services/kladovaya_6let.py"
    watcher = root / "ops/kladovaya_6let_watch.py"
    shutil.copy2(module, backup / "kladovaya_6let.py")
    shutil.copy2(watcher, backup / "kladovaya_6let_watch.py")
    tmp_module = write_compiled(module, (HERE / "kladovaya_6let.py").read_text(encoding="utf-8"))
    tmp_watcher = write_compiled(watcher, (HERE / "kladovaya_6let_watch.py").read_text(encoding="utf-8"))
    spec = importlib.util.spec_from_file_location("kladovaya_6let_watch", HERE / "kladovaya_6let_watch.py")
    watch = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(watch)
    con = watch.connect(root / "salon.db")
    try:
        watch.migrate(con)
    finally:
        con.close()
    tmp_module.replace(module)
    tmp_watcher.replace(watcher)
    systemctl("restart", "salon-bot-v2.service")
    if not health(health_url):
        print("здоровье не ответило — возвращаю прежние модуль и сторож", file=sys.stderr)
        shutil.copy2(backup / "kladovaya_6let.py", module)
        shutil.copy2(backup / "kladovaya_6let_watch.py", watcher)
        systemctl("restart", "salon-bot-v2.service")
        raise SystemExit(1)
    print(f"обновлено: модуль {sha256(module)[:16]}…, сторож {sha256(watcher)[:16]}…, бэкап {backup}; /api/health — 200")
    return backup


def rollback(root: Path, backup: Path, *, do_restart: bool, health_url: str, systemd_dir: Path = Path("/etc/systemd/system")) -> None:
    shutil.copy2(backup / "webapp.py", root / "app/webapp.py")
    shutil.copy2(backup / "db.py", root / "app/db.py")
    module = root / "app/services/kladovaya_6let.py"
    if module.exists():
        module.unlink()
    print(f"исходники возвращены из {backup}")
    timer = systemd_dir / f"{UNIT}.timer"
    if timer.exists():
        subprocess.run(["systemctl", "disable", "--now", f"{UNIT}.timer"], check=False)
    if do_restart:
        systemctl("restart", "salon-bot-v2.service")
        print("здоровье после отката:", "200" if health(health_url) else "НЕТ ОТВЕТА")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="/root/salon_bot")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true")
    group.add_argument("--apply", action="store_true")
    group.add_argument("--update", action="store_true")
    group.add_argument("--rollback")
    parser.add_argument("--restart", action="store_true")
    parser.add_argument("--health-url", default="http://127.0.0.1:8090/api/health")
    args = parser.parse_args(argv)
    root = Path(args.root)
    if args.check:
        digests = check(root)
        print("можно ставить: " + ", ".join(f"{rel} {d[:16]}…" for rel, d in digests.items()) + "; места правки найдены по разу")
    elif args.apply:
        apply(root, do_restart=args.restart, health_url=args.health_url)
    elif args.update:
        update(root, health_url=args.health_url)
    else:
        rollback(root, Path(args.rollback), do_restart=args.restart, health_url=args.health_url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
