#!/usr/bin/env python3
"""Установщик кассы Кладовой (kladovaya_pay.py) на сервер Салона.

  python3 install_kladovaya_pay.py --root /root/salon_bot --check
  python3 install_kladovaya_pay.py --root /root/salon_bot --apply --derive-secret --restart
  python3 install_kladovaya_pay.py --root /root/salon_bot --rollback <папка бэкапа> --restart

--check ничего не пишет: сверяет хеш app/webapp.py с известным, находит оба места
правки ровно по разу, проверяет, что в config, db и services есть всё, на что
опирается модуль, смотрит секрет и drop-in. --apply: бэкап в
backups/kladovaya-pay-<UTC>/, модуль в app/services/kladovaya_pay.py, два хука в
webapp.py (маршруты в build_app; вызов в robo_webhook сразу после хука магазина,
то есть после проверки подписи Password#2), drop-in
salon-bot-v2.service.d/kladovaya-pay.conf (LoadCredential=kladovaya_pay и адрес
уведомлений бота), py_compile. С --derive-secret секрет, если его ещё нет,
выводится из общего секрета кампаний: hex HMAC-SHA256(zero_campaign_hmac,
"kladovaya-pay-2026-10") — бот Кладовой получает то же из своей копии, переносить
между серверами ничего не нужно; значение не печатается. С --restart —
перезапуск salon-bot-v2, /api/health и подписанный пробный запрос к
/api/kladovaya/pay/quote; при любом сбое, в том числе systemctl, — откат сам.

--rollback снимает оба хука обратной правкой (чужие правки webapp.py после
установки не теряются), убирает модуль и drop-in. База data/kladovaya-pay.sqlite3
и секрет остаются: в базе — оплаты. Если в базе уже есть счета, откат
отказывается (без кассы поздние ResultURL и уведомления боту пропадут): закрыть
приём — ACADEMIC_SALON_KLADOVAYA_PAY_CHECKOUT=0 в drop-in и перезапуск, ResultURL,
сверка и уведомления продолжат работать. Откатить всё равно — --force.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import py_compile
import re
import shutil
import sqlite3
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
MARKER = "# kladovaya-pay:20261031-v1"
# прод 31.10.2026: webapp.py после «Кладовой 6 лет» и магазина
KNOWN_BEFORE = {
    "app/webapp.py": {"ecf371e7ddfe198b8143d5110dcf1c3a7ecaf71ca1a83df8139bcc7c07c11074"},
}
SERVICE = "salon-bot-v2.service"
DROPIN = Path("/etc/systemd/system/salon-bot-v2.service.d/kladovaya-pay.conf")
SECRET_PATH = "/etc/kladovaya-pay/secret"  # путь на сервере Салона; у бота Кладовой — тот же
SECRET = Path(SECRET_PATH)
ZERO_SECRET = Path("/etc/academic-salon/zero_campaign_hmac")
SECRET_LABEL = b"kladovaya-pay-2026-10"
NOTIFY_URL = "https://studkladovaya.ru/salon/paid"
PROBE_ORDER = "kprobe00000"
DATABASE = "data/kladovaya-pay.sqlite3"
# на что опирается модуль: без этого он встанет, а оплата сломается на первом счёте
REQUIRED = {
    "app/config.py": (r"^ROBOKASSA_LOGIN\b", r"^ROBOKASSA_TEST\b", r"^def robokassa_on\(",
                      r"^def robo_pass1\(", r"^def robo_pass2\(", r"^DOC_EDITIONS\b"),
    "app/db.py": (r"^async def receipt_invoice_upsert\(", r"^async def receipt_mark_paid\("),
    "app/services/payments.py": (r"^ROBO_INVOICE_URL\s*=", r"^ROBO_SHORT_URL\s*=", r"^def _robo_sig\("),
    "app/services/notify.py": (r"^async def notify_admins\(",),
    "app/services/mailer.py": (r"^def looks_email\(",),
    "app/material_store/http.py": (r"^async def verified_callback\(",),
}

WEBAPP_EDITS = [
    (
        "    if material_response is not None:\n"
        "        return material_response\n",
        "    if material_response is not None:\n"
        "        return material_response\n"
        f"    {MARKER}\n"
        "    from .services.kladovaya_pay import verified_callback as kladovaya_callback\n"
        "    kladovaya_response = await kladovaya_callback(request.app, inv_id, amount, data)\n"
        "    if kladovaya_response is not None:\n"
        "        return kladovaya_response\n",
    ),
    (
        "    register_material_store(app, _session_user)\n"
        '    r.add_options("/api/{tail:.*}", handle_options)\n',
        "    register_material_store(app, _session_user)\n"
        f"    from .services.kladovaya_pay import register as register_kladovaya_pay  {MARKER}\n"
        "    register_kladovaya_pay(app)\n"
        '    r.add_options("/api/{tail:.*}", handle_options)\n',
    ),
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def patched(source: str) -> str:
    if MARKER in source:
        raise SystemExit("webapp.py уже с кассой Кладовой — ставить второй раз нечего")
    for before, after in WEBAPP_EDITS:
        count = source.count(before)
        if count != 1:
            raise SystemExit(f"webapp.py: место правки найдено {count} раз(а), нужно ровно 1:\n{before}")
        source = source.replace(before, after)
    return source


def unpatched(source: str) -> str:
    for before, after in WEBAPP_EDITS:
        count = source.count(after)
        if count != 1:
            raise SystemExit(f"webapp.py: хук найден {count} раз(а), нужно ровно 1 — снимать руками:\n{after}")
        source = source.replace(after, before)
    if MARKER in source:
        raise SystemExit("webapp.py: метка кассы осталась после снятия хуков — снимать руками")
    return source


def dropin_text(notify_url: str = NOTIFY_URL) -> str:
    return (
        "[Service]\n"
        f"# {MARKER[2:]}: касса Кладовой — общий с ботом секрет и адрес его уведомлений\n"
        f"LoadCredential=kladovaya_pay:{SECRET_PATH}\n"
        f"Environment=ACADEMIC_SALON_KLADOVAYA_PAY_NOTIFY_URL={notify_url}\n"
        "Environment=ACADEMIC_SALON_KLADOVAYA_PAY_CHECKOUT=1\n"
    )


def derived_secret(zero_value: str) -> str:
    return hmac.new(zero_value.strip().encode("utf-8"), SECRET_LABEL, hashlib.sha256).hexdigest()


def secret_state(path: Path = SECRET) -> str:
    if not path.exists():
        return "missing"
    mode = stat.S_IMODE(path.stat().st_mode)
    if os.name == "posix" and mode & 0o077:  # на Windows (тесты) права файла ничего не значат
        raise SystemExit(f"{path}: права {oct(mode)}, нужно 600 (root)")
    if len(path.read_text(encoding="utf-8").strip()) < 32:
        raise SystemExit(f"{path}: секрет короче 32 символов")
    return "present"


def ensure_secret(*, derive: bool, path: Path = SECRET, zero: Path = ZERO_SECRET) -> str:
    """'present' — уже лежит, 'derived' — выведен сейчас. Значение не печатается."""
    if secret_state(path) == "present":
        return "present"
    if not derive:
        raise SystemExit(f"нет {path}: положите секрет (root, 600) или запустите с --derive-secret")
    zero_value = zero.read_text(encoding="utf-8").strip()
    if len(zero_value) < 32:
        raise SystemExit(f"{zero}: общий секрет кампаний короче 32 символов")
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    if tmp.exists():
        tmp.unlink()
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(derived_secret(zero_value) + "\n")
    os.replace(tmp, path)
    return "derived"


def check(root: Path, *, dropin: Path = DROPIN) -> dict[str, str]:
    digests = {}
    for rel, known in KNOWN_BEFORE.items():
        digest = sha256(root / rel)
        if digest not in known:
            raise SystemExit(f"{rel} незнакомый ({digest[:16]}…) — сверить и дописать в KNOWN_BEFORE")
        digests[rel] = digest
    patched((root / "app/webapp.py").read_text(encoding="utf-8"))
    for rel, patterns in REQUIRED.items():
        path = root / rel
        if not path.exists():
            raise SystemExit(f"нет {rel} — модуль опирается на него")
        text = path.read_text(encoding="utf-8")
        missing = [p for p in patterns if not re.search(p, text, re.M)]
        if missing:
            raise SystemExit(f"{rel}: нет {', '.join(missing)} — модуль опирается на это")
    if (root / "app/services/kladovaya_pay.py").exists():
        raise SystemExit("app/services/kladovaya_pay.py уже есть — сначала разобраться, откуда")
    if dropin.exists():
        raise SystemExit(f"{dropin} уже есть — сначала разобраться, откуда")
    compile((HERE / "kladovaya_pay.py").read_text(encoding="utf-8"), "kladovaya_pay.py", "exec")
    return digests


def write_compiled(path: Path, text: str, mode_from: Path | None = None) -> Path:
    tmp = path.with_suffix(path.suffix + ".kladovaya-pay.tmp")
    tmp.write_bytes(text.encode("utf-8"))  # как есть, LF: хеши сверяются по байтам
    if mode_from is not None:
        shutil.copymode(mode_from, tmp)
    py_compile.compile(str(tmp), doraise=True)
    return tmp


def systemctl(*args: str) -> None:
    subprocess.run(["systemctl", *args], check=True)


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


def probe(base: str, secret_path: Path = SECRET) -> str:
    """Та же проба, что у бота Кладовой: маршрут жив, секрет загружен, подпись сходится, приём открыт.
    Ничего не пишет. Возвращает "ok" или что ответила касса."""
    key = secret_path.read_text(encoding="utf-8").strip().encode("utf-8")
    expires = int(time.time()) + 600
    message = f"{PROBE_ORDER}|format_fix|290|{expires}".encode("utf-8")
    query = urllib.parse.urlencode({"o": PROBE_ORDER, "p": "format_fix", "a": 290, "e": expires,
                                    "s": hmac.new(key, message, hashlib.sha256).hexdigest()})
    try:
        with urllib.request.urlopen(f"{base}/api/kladovaya/pay/quote?{query}", timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
        ok = response.status == 200 and data.get("ok") is True and data.get("amount") == 290
        return "ok" if ok else f"http {response.status}"
    except urllib.error.HTTPError as exc:
        try:
            return f"http {exc.code} {json.loads(exc.read().decode('utf-8')).get('error')}"
        except Exception:
            return f"http {exc.code}"
    except Exception as exc:
        return type(exc).__name__


def invoices_in(database: Path) -> int | None:
    """Сколько счетов в базе кассы; None — база не читается."""
    if not database.exists():
        return 0
    try:
        con = sqlite3.connect(str(database), timeout=5)
        try:
            return int(con.execute("SELECT COUNT(*) FROM invoices").fetchone()[0])
        finally:
            con.close()
    except sqlite3.Error:
        return None


def apply(root: Path, *, derive: bool, do_restart: bool, base: str, notify_url: str,
          dropin: Path = DROPIN, secret_path: Path = SECRET, zero: Path = ZERO_SECRET) -> Path:
    check(root, dropin=dropin)
    secret = ensure_secret(derive=derive, path=secret_path, zero=zero)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = root / "backups" / f"kladovaya-pay-{stamp}"
    backup.mkdir(parents=True)
    webapp = root / "app/webapp.py"
    module = root / "app/services/kladovaya_pay.py"
    shutil.copy2(webapp, backup / "webapp.py")
    tmp_webapp = write_compiled(webapp, patched(webapp.read_text(encoding="utf-8")), webapp)
    tmp_module = write_compiled(module, (HERE / "kladovaya_pay.py").read_text(encoding="utf-8"))
    (root / "data").mkdir(exist_ok=True)
    dropin.parent.mkdir(parents=True, exist_ok=True)
    dropin.write_bytes(dropin_text(notify_url).encode("utf-8"))
    tmp_module.replace(module)
    tmp_webapp.replace(webapp)
    manifest = {"marker": MARKER, "webapp_before": sha256(backup / "webapp.py"),
                "webapp_after": sha256(webapp), "module": sha256(module), "dropin": str(dropin),
                "secret": secret, "notify_url": notify_url}
    (backup / "manifest.json").write_bytes(json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"))
    (backup / "README").write_text(
        "Откат: python3 install_kladovaya_pay.py --root <root> --rollback <эта папка> --restart\n"
        "После первых оплат не откатывать — ACADEMIC_SALON_KLADOVAYA_PAY_CHECKOUT=0 и перезапуск.\n",
        encoding="utf-8")
    print(f"установлено: webapp.py {manifest['webapp_after'][:16]}…, модуль {manifest['module'][:16]}…, "
          f"секрет {secret}, drop-in {dropin}, бэкап {backup}")
    if do_restart:
        try:
            systemctl("daemon-reload")
            systemctl("restart", SERVICE)
            problem = "" if health(f"{base}/api/health") else "/api/health не ответил"
            if not problem:
                answer = probe(base, secret_path)
                problem = "" if answer == "ok" else f"пробная ссылка: {answer}"
        except (subprocess.CalledProcessError, OSError) as exc:
            problem = f"systemctl: {exc}"
        if problem:
            print(f"{problem} — откатываю", file=sys.stderr)
            rollback(root, backup, do_restart=True, base=base, dropin=dropin, force=True)
            raise SystemExit(1)
        print("перезапущено: /api/health — 200, подписанная пробная ссылка — 200")
    return backup


def rollback(root: Path, backup: Path, *, do_restart: bool, base: str, dropin: Path = DROPIN,
             force: bool = False) -> None:
    invoices = invoices_in(root / DATABASE)
    if invoices != 0 and not force:
        found = "база не читается" if invoices is None else f"счетов: {invoices}"
        raise SystemExit(f"в базе кассы {found} — без кассы поздние ResultURL и уведомления боту пропадут. "
                         "Закрыть приём: ACADEMIC_SALON_KLADOVAYA_PAY_CHECKOUT=0 в drop-in и перезапуск; "
                         "откатить всё равно — --force")
    webapp = root / "app/webapp.py"
    text = webapp.read_text(encoding="utf-8")
    if MARKER in text:
        tmp = write_compiled(webapp, unpatched(text), webapp)
        tmp.replace(webapp)
    module = root / "app/services/kladovaya_pay.py"
    if module.exists():
        shutil.copy2(module, backup / "kladovaya_pay.py.removed")
        module.unlink()
    if dropin.exists():
        dropin.unlink()
    print(f"хуки сняты, модуль и drop-in убраны (бэкап {backup}); база и секрет оставлены")
    if do_restart:
        try:
            systemctl("daemon-reload")
            systemctl("restart", SERVICE)
        except (subprocess.CalledProcessError, OSError) as exc:
            print(f"systemctl после отката: {exc} — проверьте salon-bot-v2 руками", file=sys.stderr)
            raise SystemExit(1) from None
        print("здоровье после отката:", "200" if health(f"{base}/api/health") else "НЕТ ОТВЕТА")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="/root/salon_bot")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true")
    group.add_argument("--apply", action="store_true")
    group.add_argument("--rollback")
    parser.add_argument("--derive-secret", action="store_true")
    parser.add_argument("--restart", action="store_true")
    parser.add_argument("--force", action="store_true", help="--rollback и при счетах в базе кассы")
    parser.add_argument("--base-url", default="http://127.0.0.1:8090")
    parser.add_argument("--notify-url", default=NOTIFY_URL)
    args = parser.parse_args(argv)
    root = Path(args.root)
    if args.check:
        digests = check(root)
        state = secret_state()
        hint = {"present": "секрет на месте", "missing": "секрета нет — нужен --derive-secret или файл"}[state]
        print("можно ставить: " + ", ".join(f"{rel} {d[:16]}…" for rel, d in digests.items())
              + f"; места правки найдены по разу; {hint}")
    elif args.apply:
        apply(root, derive=args.derive_secret, do_restart=args.restart, base=args.base_url,
              notify_url=args.notify_url)
    else:
        rollback(root, Path(args.rollback), do_restart=args.restart, base=args.base_url, force=args.force)
    return 0


if __name__ == "__main__":
    sys.exit(main())
