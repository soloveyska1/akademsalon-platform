#!/usr/bin/env python3
"""Exact-source, additive community routes. Never restore/delete reward SQLite.
Prepare is read-only. Apply backs up just source; rollback refuses changed files.
"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import os
import tempfile

EXPECTED_WEBAPP='a208a0cd37cfbd511e279553bb0b60b0b673e109607c8c8114cf68e44d91772e'
EXPECTED_DB='265417999d535e83bcf66896ccfabb9f28e66cdaacdc0851c8f58024fd4042a0'
MARKER='# community-gifts:20260909-v1'

def digest(data):return hashlib.sha256(data).hexdigest()
def patch_webapp(source):
    if MARKER in source:raise ValueError('already installed')
    feature='                  "pay_online": bool(config.pay_provider())})'
    start=source.index('async def features(');end=source.index('async def me(',start)
    section=source[start:end]
    if section.count(feature)!=1:raise ValueError('feature marker mismatch')
    source=source[:start]+section.replace(feature,'                  "community_rewards": True,\n'+feature)+source[end:]
    build='def build_app(bot: Bot) -> web.Application:'
    identity='''# community-gifts:20260909-v1
async def _community_identity(request):
    user = await _session_user(request)
    if not user:
        return None
    uid = int(user["id"])
    # db.upsert_user stores Telegram IDs as positive; email/OAuth IDs are negative.
    return {"user_id": uid, "telegram_id": uid if uid > 0 else None,
            "impersonated": _sess_imp(user)}


'''
    if source.count(build)!=1:raise ValueError('build marker mismatch')
    source=source.replace(build,identity+build)
    setup='    app["bot"] = bot\n    r = app.router'
    addition='''    app["bot"] = bot
    from pathlib import Path
    from .services.community_rewards import register_routes as register_community_routes
    register_community_routes(app, _community_identity,
        path=Path(__file__).resolve().parent.parent / "data" / "community-gifts.sqlite3",
        enabled=True)
    r = app.router'''
    if source.count(setup)!=1:raise ValueError('app marker mismatch')
    source=source.replace(setup,addition)
    compile(source,'webapp.py','exec')
    return source

def atomic(path,data,mode=0o600):
    fd,name=tempfile.mkstemp(prefix='.community-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.chmod(name,mode);os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)

def prepare(root,module):
    web=root/'app/webapp.py';db=root/'app/db.py';dest=root/'app/services/community_rewards.py'
    if digest(web.read_bytes())!=EXPECTED_WEBAPP or digest(db.read_bytes())!=EXPECTED_DB:raise ValueError('reviewed source hashes changed')
    payload=module.read_bytes();compile(payload,str(module),'exec')
    if dest.exists() and digest(dest.read_bytes())!=digest(payload):raise ValueError('destination differs; review previous installation')
    patched=patch_webapp(web.read_text()).encode()
    return web,dest,payload,patched

def apply(root,module):
    web,dest,payload,patched=prepare(root,module)
    backup=root/'backups'/('community-gifts-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    backup.mkdir(parents=True,mode=0o700)
    original=web.read_bytes();atomic(backup/'webapp.py',original)
    receipt={'before':digest(original),'after':digest(patched),'module':digest(payload),'database_restored':False}
    atomic(backup/'receipt.json',json.dumps(receipt,indent=2).encode())
    # Validate again immediately before replacement. The process keeps loaded old code until restart.
    if digest(web.read_bytes())!=EXPECTED_WEBAPP:raise ValueError('concurrent source change')
    atomic(dest,payload);atomic(web,patched,web.stat().st_mode&0o777)
    return backup,receipt

def rollback(root,backup):
    receipt=json.loads((backup/'receipt.json').read_text());web=root/'app/webapp.py';dest=root/'app/services/community_rewards.py'
    if digest(web.read_bytes())!=receipt['after'] or digest(dest.read_bytes())!=receipt['module']:raise ValueError('rollback refused: current source differs')
    original=(backup/'webapp.py').read_bytes()
    if digest(original)!=receipt['before']:raise ValueError('backup corrupt')
    atomic(web,original,web.stat().st_mode&0o777)
    # Module remains inert so code in an in-flight request is not removed. No DB rollback.
    return receipt

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--module',type=Path);p.add_argument('--apply',action='store_true');p.add_argument('--rollback',type=Path);a=p.parse_args()
    if a.rollback:print(json.dumps(rollback(a.root,a.rollback)))
    elif a.apply:
        b,r=apply(a.root,a.module);print(json.dumps({'backup':str(b),**r}))
    else:
        web,dest,payload,patched=prepare(a.root,a.module);print(json.dumps({'ready':True,'webapp_before':EXPECTED_WEBAPP,'webapp_after':digest(patched),'module':digest(payload)}))
