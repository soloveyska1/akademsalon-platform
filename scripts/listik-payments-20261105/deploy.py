"""Run on Salon VPS. Code/static rollback only; never restore a payment database."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.request
import patch

MODULE=Path('/root/salon_bot/app/services/kladovaya_pay.py')
CURRENT=Path('/var/www/academic_saloon/current')
EXPECTED=Path('/var/www/academic_saloon/releases/release267-reviews-chat-af83c628')
ROOT=Path('/var/www/academic_saloon/releases')


def switch(target):
    pending=CURRENT.with_name('current.listik-next')
    pending.unlink(missing_ok=True)
    pending.symlink_to(target)
    os.replace(pending,CURRENT)


def health():
    subprocess.run(['systemctl','is-active','--quiet','salon-bot-v2'],check=True)
    with urllib.request.urlopen('https://akademsalon.ru/api/health',timeout=15) as r:
        assert r.status==200


def restart():
    subprocess.run(['systemctl','restart','salon-bot-v2'],check=True)
    time.sleep(4)
    health()


def main():
    old=CURRENT.resolve()
    if old!=EXPECTED: raise RuntimeError('live static release changed; review first')
    original=MODULE.read_bytes()
    newcode=patch.backend(original.decode())
    rollbackcode=patch.once(newcode, 'async def ensure_listik_open(link):\n', 'async def ensure_listik_open(link):\n    if link["product"].startswith("listik_"):\n        raise PayError("checkout_closed",503)\n')
    compile(rollbackcode,'rollback-cashier.py','exec')
    markup=patch.page((old/'kladovaya-oplata.html').read_text())
    stamp=time.strftime('%Y%m%dT%H%M%S',time.gmtime())
    new=ROOT/('release-listik-payments-'+stamp)
    backup=Path('/root/listik-payments-backup-'+stamp)
    backup.mkdir(mode=0o700)
    (backup/'kladovaya_pay.py').write_bytes(original)
    (backup/'rollback-compatible.py').write_text(rollbackcode,encoding='utf-8')
    (backup/'release.json').write_text(json.dumps({'old':str(old),'new':str(new),'module_sha256':hashlib.sha256(original).hexdigest()}))
    shutil.copytree(old,new,symlinks=True)
    (new/'kladovaya-oplata.html').write_text(markup,encoding='utf-8')
    def put(code):
        pending=MODULE.with_suffix('.py.next')
        pending.write_bytes(code); pending.chmod(0o644); os.replace(pending,MODULE)
    try:
        put(newcode.encode()); switch(new); restart()
        # Exercise rollback of code+pointer, then reinstall the identical tested patch.
        # Old code cannot recognize new paid invoices. Keep their verifier/outbox
        # while disabling all new Listik invoices, and roll back only the storefront.
        put(rollbackcode.encode()); switch(old); restart()
        assert MODULE.read_bytes()==rollbackcode.encode()
        put(newcode.encode()); switch(new); restart()
    except Exception:
        put(rollbackcode.encode()); switch(old); restart()
        raise
    print(json.dumps({'health':True,'rollback_exercised':True,'release':str(new),'backup':str(backup),'spec_sha256':patch.SPEC_SHA}))


if __name__=='__main__': main()
