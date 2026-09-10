#!/usr/bin/env python3
"""Hash-pinned source-only checkout release; prepare/apply/rollback, no live tests."""
from pathlib import Path
import argparse,hashlib,json,os,tempfile,datetime
MARKER='# onsite-checkout:20260910-v1'
def sha(b):return hashlib.sha256(b).hexdigest()
def once(s,a,b):
 if s.count(a)!=1:raise ValueError('patch_anchor_changed: '+a[:70])
 return s.replace(a,b)
def patch_db(s):
 for name,tail in [('_promo_guest_contact_exists','contact: str | None'),('_promo_existing_contact','contact: str | None'),('_promo_user_has_contact_history','user')]:
  s=once(s,f'async def {name}(c, {tail}) -> bool:',f'async def {name}(c, {tail}, exclude_order_id=None) -> bool:')
 s=s.replace('_promo_guest_contact_exists(c, contact):','_promo_guest_contact_exists(c, contact, exclude_order_id):').replace('_promo_guest_contact_exists(c, value):','_promo_guest_contact_exists(c, value, exclude_order_id):')
 s=once(s,'"AND coalesce(synthetic,0)=0"\n    )).fetchall()','"AND coalesce(synthetic,0)=0 AND (? IS NULL OR id<>?)",\n        (exclude_order_id, exclude_order_id),\n    )).fetchall()')
 s=once(s,'async def _promo_claim_validate(c, claim: dict[str, Any] | None) -> None:','async def _promo_claim_validate(c, claim: dict[str, Any] | None, exclude_order_id=None) -> None:')
 start=s.index('async def _promo_claim_validate(');end=s.index('async def _promo_claim_store(',start);part=s[start:end]
 part=part.replace('_promo_user_has_contact_history(c, row)','_promo_user_has_contact_history(c, row, exclude_order_id)').replace('_promo_existing_contact(c, contact)','_promo_existing_contact(c, contact, exclude_order_id)')
 part=once(part,'"SELECT 1 FROM orders WHERE user_id=? LIMIT 1", (user_id,)','"SELECT 1 FROM orders WHERE user_id=? AND (? IS NULL OR id<>?) LIMIT 1", (user_id,exclude_order_id,exclude_order_id)')
 s=s[:start]+part+s[end:];return s+'\n'+MARKER+'\n'

ENDPOINT='''async def checkout_action(request: web.Request) -> web.Response:
    # onsite-checkout:20260910-v1
    if not _rate_ok("checkout:"+_ip(request),cost=2): return _err("rate_limit",429)
    order_id=int(request.match_info["id"])
    o,user=await _order_access(request,order_id)
    if not o: return _err("not_found",404)
    if _sess_imp(user) or (user and user["id"] in config.ADMIN_IDS): return _err("admin_session",409)
    try:
        body=await request.json()
        if not isinstance(body,dict) or len(json.dumps(body))>4096: return _err("bad_request",400)
    except Exception: return _err("bad_json",400)
    from .services import payment_journey
    try:
        result=await payment_journey.change(order_id,user,body,request.app["bot"],request.cookies.get(PROMO_INTENT_COOKIE,""),authorize=lambda:_order_access(request,order_id))
    except ValueError as exc:
        return _err(str(exc) if str(exc) in payment_journey.PUBLIC_ERRORS else "checkout_failed",409)
    current=await db.get_order(order_id)
    if body.get("action") in ("accept_price","settle_gift") and not result.get("replayed"):
        async def alert_accept():
            stage="Сертификат покрывает заказ, передан в работу." if current["status"]=="work" else "Ожидаем оплату на сайте."
            text=f"🤝 Клиент принял предложение №{order_id}. {stage}"
            sent=await grp.send(request.app["bot"],order_id,text)
            await notify.notify_admins(request.app["bot"],text,map_client=(current["user_id"],order_id) if current["user_id"] else None,group_sent=bool(sent))
        _bg(f"order{order_id} onsite_accept",alert_accept)
    data=await _order_full_json(current)
    data["checkout"]["owns_order"]=bool(user and current["user_id"]==user["id"])
    return _json({"ok":True,"order":data,**result})


'''
def patch_web(s):
 anchor='    d["legacy_checkout"] = await autoquote.legacy_checkout_allowed(o)\n'
 s=once(s,anchor,anchor+'    from .services import payment_journey\n    d["checkout"] = await payment_journey.state(o)\n')
 anchor='    d = await _order_full_json(o)\n    # метки'
 s=once(s,anchor,'    d = await _order_full_json(o)\n    d["checkout"]["owns_order"] = bool(user and o["user_id"]==user["id"])\n    # метки')
 anchor='async def order_action(request: web.Request) -> web.Response:'
 s=once(s,anchor,ENDPOINT+anchor)
 # Old open website tabs cannot use the non-atomic financial path.
 anchor='    action = str(b.get("action") or "")\n    allowed = _actions_for(o)'
 s=once(s,anchor,'    action = str(b.get("action") or "")\n    if action in ("accept_price","bonus_apply","bonus_cancel","gift_apply","gift_remove"):\n        return _err("quote_changed",409)\n    allowed = _actions_for(o)')
 anchor='    r.add_post("/api/orders/{id:\\\\d+}/pay", order_pay)'
 s=once(s,anchor,anchor+'\n    r.add_post("/api/orders/{id:\\\\d+}/checkout-action", checkout_action)')
 s=once(s,'            expected_amount=body.get("expected_amount"))','            expected_amount=body.get("expected_amount"), expected_revision=body.get("expected_revision"))')
 s=once(s,'"financial_revision_requires_review", "quote_changed", "pay_failed"}', '"financial_revision_requires_review", "quote_changed", "pay_failed", "accept_required"}')
 # Online checkout is only after acceptance, including old open tabs.
 start=s.index('async def order_pay(');end=s.index('async def autoquote_preview(',start);part=s[start:end]
 part=once(part,'    if _sess_imp(user):','    if o["status"] == "priced": return _err("accept_required",409)\n    if _sess_imp(user):')
 s=s[:start]+part+s[end:]
 # Existing deposit engine owns reserve/confirmation/outbox; supply exact revision under its lock.
 start=s.index('async def order_pay_deposit(');end=s.index('async def yk_webhook(',start);part=s[start:end]
 a=part.index('    if o["status"] not in');b=part.index('    if not ok:',a)
 part=part[:a]+'''    if _sess_imp(user) or user["id"] in config.ADMIN_IDS: return _err("admin_session",409)
    try:
        body=await request.json()
        if not isinstance(body,dict) or not isinstance(body.get("expected_revision"),str): return _err("quote_changed",409)
        ok,why,bal=await deposit.pay_order(request.app["bot"],order_id,actor="кабинет",expected_revision=body["expected_revision"],expected_owner=user["id"])
    except ValueError as exc:
        return _err(str(exc) if str(exc) in ("quote_changed","pay_stage","accept_required","checkout_locked","specification_not_frozen","specification_receipt_mismatch") else "pay_stage",409)
'''+part[b:];s=s[:start]+part+s[end:];return s

def patch_quote(s):
 s=once(s,'any(p["status"] in ("paid", "claimed") for p in pays):','any(p["status"] in ("paid", "claimed", "pending") for p in pays):')
 s=once(s,'    if await refresh_financial_revision(order_id):','    if expected_revision is None and await refresh_financial_revision(order_id):')
 s=once(s,'expected_hash=None, expected_amount=None):','expected_hash=None, expected_amount=None, expected_revision=None):')
 anchor='        order = await db.get_order(order_id)\n        if not order or order["status"] not in ("priced", "prepay", "work", "check", "fix"):'
 s=once(s,anchor,'        order = await db.get_order(order_id)\n        if expected_revision is not None:\n            from . import payment_journey\n            await payment_journey.assert_revision(order, expected_revision, for_pay=True)\n'+anchor.split('\n',1)[1])
 return s+'\n'+MARKER+'\n'

def patch_economics(s):
 s=once(s,'from __future__ import annotations','from __future__ import annotations\nimport json')
 start=s.index('async def pay_order(');end=s.index('\nasync def ',start+10);part=s[start:end]
 part=once(part,'bot: Bot, order_id: int, actor: str = "клиент"','bot: Bot, order_id: int, actor: str = "клиент", expected_revision=None, expected_owner=None')
 anchor='        uid = int(order["user_id"] or 0)'
 part=once(part,anchor,'''        snapshot_id=None
        if expected_revision is not None:
            from . import payment_journey, autoquote
            info=await payment_journey.assert_revision(order,expected_revision,for_pay=True)
            if expected_owner!=order["user_id"] or not info["can_deposit"]: raise ValueError("checkout_locked")
            snap=await db.specification_latest(order_id)
            if snap:
                kind_check,amount_check=await payments.stage_amount(order)
                autoquote.strict_receipt_lines(json.loads(snap["specification_json"]),kind_check,amount_check)
                snapshot_id=snap["id"]
            elif not await autoquote.legacy_checkout_allowed(order): raise ValueError("specification_not_frozen")
'''+anchor)
 part=once(part,'order_id, kind, amount, "deposit", f"deposit-v2:{op_id}"','order_id, kind, amount, "deposit", f"deposit-v2:{op_id}", specification_snapshot_id=snapshot_id')
 return s[:start]+part+s[end:]+'\n'+MARKER+'\n'

def patch_gift(s):
 for name,endname in [('attach_to_order','detach_from_order'),('detach_from_order','_release')]:
  start=s.index('async def '+name+'(');end=s.index('async def '+endname+'(',start);part=s[start:end]
  anchor='    pays = await db.payments_for_order(order_id)'
  part=once(part,anchor,'    if await db.has_event(order_id,"gift_checkout_accepted"): return False,"gift_after_payment"\n'+anchor)
  s=s[:start]+part+s[end:]
 anchor='    if g["status"] != "active":\n        return await _drop'
 s=once(s,anchor,'    if await db.has_event(order_id,"gift_checkout_accepted"):\n        return prev  # accepted prepaid tender is fixed even after expiry\n'+anchor)
 return s+'\n'+MARKER+'\n'

def patch_contract(s):
 s=once(s,'    data_hash = canonical_hash(spec)','    settlement = (spec.get("pricing") or {}).get("settlement") or {}\n    full_gift = settlement.get("cash_rub") == 0 and settlement.get("gift_tender_rub", 0) > 0\n    data_hash = canonical_hash(spec)')
 s=once(s,'      "платежа после получения этого файла означает принятие именно этой редакции.")','      "платежа после получения этого файла означает принятие именно этой редакции." if not full_gift else\n      "Заказ полностью покрыт сертификатом. Подтверждение состава, срока и зачёта "\n      "сертификата кнопкой на сайте означает принятие этой редакции без нового "\n      "денежного платежа. Подтверждение сохраняется в журнале заказа.")')
 s=once(s,'("Твёрдая цена заказа",','("Стоимость работ",')
 s=once(s,'("Первый платёж",','("Первый платёж" if not full_gift else "Покрыт сертификатом",')
 s=once(s,'else "по графику ниже"),','else ("Без доплаты" if full_gift else "по графику ниже")),')
 s=once(s,'"ИТОГО ПО ЗАКАЗУ", align="L",','"СТОИМОСТЬ РАБОТ", align="L",')
 anchor='    titles = {\n        str(item.get("line_id")):'
 block='    if settlement:\n        for label, key in [("Скидки", "discount_rub"), ("Списано бонусов", "bonus_rub"), ("Зачтено сертификатом", "gift_tender_rub")]:\n            field(label, f"{config.fmt_money(settlement.get(key) or 0)} руб.")\n        field("Итого деньгами", f"{config.fmt_money(settlement[\'cash_rub\'])} руб.")\n        if full_gift:\n            p("Доплата не требуется. Сертификат зачтён в оплату согласованного заказа; новый денежный платёж не создаётся.")\n'
 s=once(s,anchor,block+anchor)
 return s+'\n'+MARKER+'\n'

def atomic(path,b):
 fd,name=tempfile.mkstemp(prefix='.checkout-',dir=path.parent)
 try:
  with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
  os.chmod(name,0o600);os.replace(name,path)
 finally:
  if os.path.exists(name):os.unlink(name)
def prepare(root,reference,module):
 refs=json.loads(reference.read_text());result={}
 for rel,fn in [('app/webapp.py',patch_web),('app/db.py',patch_db),('app/services/autoquote.py',patch_quote),('app/services/economic_v2.py',patch_economics),('app/services/gift.py',patch_gift),('app/services/contract.py',patch_contract)]:
  raw=(root/rel).read_bytes()
  if sha(raw)!=refs[rel]:raise ValueError('source_changed:'+rel)
  patched=fn(raw.decode()).encode();compile(patched,rel,'exec');result[rel]=(raw,patched)
 raw=module.read_bytes();compile(raw,'payment_journey.py','exec');dest=root/'app/services/payment_journey.py'
 if dest.exists():raise ValueError('module_already_exists')
 result['app/services/payment_journey.py']=(None,raw);return result

def main():
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['prepare','apply','rollback']);p.add_argument('--root',type=Path,required=True);p.add_argument('--reference',type=Path);p.add_argument('--module',type=Path);p.add_argument('--backup',type=Path);a=p.parse_args()
 if a.mode=='rollback':
  receipt=json.loads((a.backup/'receipt.json').read_text())
  for rel,item in receipt['files'].items():
   if sha((a.root/rel).read_bytes())!=item['after']:raise ValueError('rollback_source_changed:'+rel)
  for rel,item in receipt['files'].items():
   # Compatibility floor: accepted gift tender outlives this source release.
   # This standalone guard has no dependency on payment_journey or schema changes.
   if rel=='app/services/gift.py':continue
   if item['before'] is None:(a.root/rel).unlink()
   else:atomic(a.root/rel,(a.backup/rel).read_bytes())
  print(json.dumps({'rolled_back':True,'database_restored':False,'compatibility_retained':['app/services/gift.py']}));return
 changes=prepare(a.root,a.reference,a.module);receipt={'database_changed':False,'files':{rel:{'before':sha(old) if old else None,'after':sha(new)} for rel,(old,new) in changes.items()}}
 if a.mode=='apply':
  backup=a.root/'backups'/('checkout-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));backup.mkdir(parents=True,mode=0o700)
  for rel,(old,new) in changes.items():
   if old is not None:(backup/rel).parent.mkdir(parents=True,exist_ok=True);atomic(backup/rel,old)
  atomic(backup/'receipt.json',json.dumps(receipt,indent=2).encode())
  for rel,(old,new) in changes.items():atomic(a.root/rel,new)
  receipt['backup']=str(backup)
 print(json.dumps(receipt))
if __name__=='__main__':main()
