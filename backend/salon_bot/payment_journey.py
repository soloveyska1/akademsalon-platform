"""Website checkout actions. Server money, atomic financial documents, exact revision.
No provider calls, background tasks or customer notifications inside transaction.
"""
from __future__ import annotations
import copy
import hashlib
import json
import re


PUBLIC_ERRORS={'quote_changed','accept_required','pay_stage','checkout_locked','specification_not_frozen','financial_revision_requires_review','bad_request','action_not_allowed','request_conflict','admin_session','not_found','promo_ineligible','promo_min_price','promo_already_applied','promo_not_better','bonus_need_login','bonus_stage','bonus_after_payment','bonus_not_for_subs','bonus_nothing','bonus_already','bonus_once','bonus_order_small','bonus_order_missing','bonus_order_refunded','bonus_empty','bonus_cap','bonus_balance','bonus_min','gift_invalid','gift_expired','gift_blocked','gift_empty','gift_nothing','gift_after_payment','gift_not_for_subs'}

def field(row, key, default=None):
    try: return row[key]
    except (KeyError, IndexError, TypeError): return default


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


async def state(order):
    from .. import db
    from . import payments, autoquote
    oid=order['id']; snap=await db.specification_latest(oid); pays=await db.payments_for_order(oid)
    frozen=bool(snap and snap['status'] in ('offered','accepted') and snap['pdf_bytes'])
    legacy=not snap and await autoquote.legacy_checkout_allowed(order)
    document_matches=True
    if frozen:
        spec=json.loads(snap['specification_json']);old=spec.get('payment_schedule') or []
        document_matches=[(x.get('kind'),x.get('amount_rub',sum(a.get('amount_rub',0) for a in x.get('allocations',[])))) for x in old]==[(x['kind'],x['amount']) for x in payments.stage_plan(order)]
        due=payments.money_due(order);settlement=spec.get('pricing',{}).get('settlement')
        expected={'discount_rub':due['sub_discount']+due['promo_discount'],'bonus_rub':due['bonus_spent'],'gift_tender_rub':due['gift_amount'],'cash_rub':due['due_total']}
        if settlement is not None: document_matches=document_matches and all(settlement.get(k)==v for k,v in expected.items())
        elif order['status'] in ('priced','prepay') and not any(p['status'] in ('paid','claimed','pending') for p in pays):
            document_matches=document_matches and not any(expected[k] for k in ('discount_rub','bonus_rub','gift_tender_rub'))
        document_matches=document_matches and spec.get('pricing',{}).get('order_price_rub')==order['price']
        try:
            for stage in payments.stage_plan(order):autoquote.strict_receipt_lines(spec,stage['kind'],stage['amount'])
        except (ValueError,TypeError,KeyError):document_matches=False
    locked=any(p['status'] in ('paid','claimed','pending') for p in pays)
    terminal=bool(field(order,'paused') or field(order,'deleted') or order['status'] not in ('priced','prepay','work','check','fix'))
    can_benefit=not terminal and not locked and order['status'] in ('priced','prepay') and (frozen or legacy) and not str(order['work_type'] or '').startswith('sub_')
    fields=('id','user_id','status','paused','deleted','price','prepay','stages_total','stage','parts_done','part_ready','final_ready','sub_discount','promo_code','promo_discount','bonus_spent','gift_code','gift_amount','deadline_date','deadline_text')
    revision=digest({'order':{k:field(order,k) for k in fields},'snapshot':[snap['id'],snap['specification_hash'],snap['status']] if snap else None,'payments':[[p['id'],p['kind'],p['amount'],p['status']] for p in pays],'plan':payments.stage_plan(order)})
    return {'revision':revision,'can_accept':not terminal and order['status']=='priced' and (frozen or legacy) and document_matches and not any(p['status'] in ('paid','claimed') for p in pays),
            'needs_refresh':frozen and not document_matches,
            'can_pay':not terminal and order['status']!='priced' and (frozen or legacy) and document_matches,
            'can_benefit':can_benefit,'has_invoice':any(p['status']=='pending' for p in pays),
            'can_deposit':not terminal and order['status']!='priced' and not any(p['status'] in ('claimed','pending') for p in pays),
            'reason':None if frozen or legacy else 'Мастер закрепляет состав и условия. После этого здесь появится принятие и оплата.',
            'benefit_reason':('Счёт уже открыт или оплата началась. Изменение скидок доступно до открытия кассы. Для сверки напиши в обсуждение.' if locked else None)}


async def assert_revision(order, expected, *, for_pay=False):
    if not isinstance(expected,str) or not re.fullmatch('[a-f0-9]{64}',expected): raise ValueError('quote_changed')
    current=await state(order)
    if current['revision']!=expected: raise ValueError('quote_changed')
    if field(order,'paused') or field(order,'deleted'): raise ValueError('pay_stage')
    if for_pay and order['status']=='priced': raise ValueError('accept_required')
    if for_pay and current['needs_refresh']: raise ValueError('quote_changed')
    if for_pay and not current['can_pay']: raise ValueError('specification_not_frozen')
    return current


async def revise(order_id):
    """Reissue only finance; all contractual scope and gross line values remain frozen."""
    from .. import db
    from . import autoquote, contract, payments
    o=await db.get_order(order_id);snap=await db.specification_latest(order_id)
    if not snap:
        if await autoquote.legacy_checkout_allowed(o): return False
        raise ValueError('specification_not_frozen')
    if snap['status']!='offered' or snap['source'] not in ('price','offer') or not snap['pdf_bytes']:
        raise ValueError('financial_revision_requires_review')
    pays=await db.payments_for_order(order_id)
    if any(p['status'] in ('paid','claimed','pending') for p in pays): raise ValueError('checkout_locked')
    original=json.loads(snap['specification_json']);lines=original.get('lines') or [];gross=o['price']
    if type(gross) is not int or gross<=0 or original.get('pricing',{}).get('order_price_rub')!=gross or not lines or any(type(x.get('price_rub')) is not int or x['price_rub']<=0 for x in lines) or sum(x['price_rub'] for x in lines)!=gross:
        raise ValueError('financial_revision_requires_review')
    due=payments.money_due(o)
    if any(type(v) is not int or v<0 for v in due.values()) or due['bonus_spent']*100>gross*20 or (due['bonus_spent']+due['sub_discount']+due['promo_discount'])*100>gross*25:
        raise ValueError('financial_revision_requires_review')
    current_offer=await db.offer_by_order(order_id)
    if snap['source']=='offer' and (not current_offer or field(current_offer,'specification_snapshot_id')!=snap['id'] or field(current_offer,'specification_hash')!=snap['specification_hash']):
        raise ValueError('financial_revision_requires_review')
    revised=copy.deepcopy(original);revision=await db.specification_next_revision(order_id)
    revised.update(revision=revision,spec_id=f'AS-{order_id:06d}-R{revision:02d}',created_at=db.now_iso(),status='offered')
    revised['pricing']['settlement']={'discount_rub':due['sub_discount']+due['promo_discount'],'bonus_rub':due['bonus_spent'],'gift_tender_rub':due['gift_amount'],'cash_rub':due['due_total'],'source_snapshot_id':snap['id']}
    if due['due_total']==0 and due['gift_amount']>0:
        revised.setdefault('common_terms',{})['offer_acceptance']='подтверждение этой редакции и зачёта сертификата на сайте без нового денежного платежа'
    else:
        revised.setdefault('common_terms',{})['offer_acceptance']='оплата первого платежа после получения этой редакции'
    revised['payment_schedule']=[]
    for stage in payments.stage_plan(o):
        values=contract._allocate(stage['amount'],[x['price_rub'] for x in lines])
        revised['payment_schedule'].append({'kind':stage['kind'],'label':stage['label'],'amount_rub':stage['amount'],'allocations':[{'line_id':line['line_id'],'amount_rub':value} for line,value in zip(lines,values)]})
    contract._validate_offered(revised)
    pdf=await contract.build_pdf(o,specification=revised)
    if not pdf: raise ValueError('financial_revision_requires_review')
    await db.specification_create(order_id,contract.canonical_json(revised),pdf,source='price',revision=revision,schema_version=revised['schema_version'])
    # Historical public offers retain their immutable document but cannot take a new payment.
    if current_offer and current_offer['status']=='live':
        await db.offer_update(current_offer['id'],status='replaced')
    await db.add_event(order_id,'financial_revision',f'R{revision}: checkout; source snapshot {snap["id"]}')
    return True


async def apply_promo(order,code,intent):
    from .. import db, config
    from . import promo, subs
    code=str(code or '').strip().upper()
    if not re.fullmatch(r'[А-ЯЁA-Z0-9_-]{2,64}',code): raise ValueError('promo_ineligible')
    old=str(order['promo_code'] or '')
    if old and old!=code and int(order['promo_discount'] or 0)>0: raise ValueError('promo_already_applied')
    p=await db.promo_get(code)
    same=bool(p and p['family'] in promo.BOUND_PROMO_FAMILIES and await db.promo_claim_matches(p['family'],order['user_id'],order['guest_contact'],order['id'],code=code))
    bad=promo.why_invalid(p,order['price'])
    if same and bad in ('expired','inactive','used_up'): bad=None
    if bad: raise ValueError('promo_min_price' if bad=='min_price' else 'promo_ineligible')
    if p['family'] and not same and await db.promo_family_used(p['family'],order['user_id'],order['guest_contact'],exclude_order=order['id']): raise ValueError('promo_ineligible')
    if order['user_id'] in config.ADMIN_IDS: raise ValueError('admin_session')
    if p['family'] in promo.BOUND_PROMO_FAMILIES and not same:
        claim={'family':p['family'],'code':code,'user_id':order['user_id'],'contact':order['guest_contact'],'token_hash':db._promo_token_hash(intent)}
        try:
            await db._promo_claim_validate(db.conn(),claim,exclude_order_id=order['id'])
            await db._promo_claim_store(db.conn(),claim,order['id'],db.now_iso())
        except db.PromoEligibilityError as exc: raise ValueError('promo_ineligible') from exc
    if old==code and int(order['promo_discount'] or 0)>0: return
    await db.update_order(order['id'],promo_code=code,promo_discount=0)
    await subs.apply_discount(order['id'])
    discount=await promo.apply(order['id'])
    if discount<=0: raise ValueError('promo_not_better')


async def change(order_id,user,body,bot=None,intent='',authorize=None):
    from .. import db, config
    from . import bonus,gift,payments,autoquote
    action=body.get('action');allowed={'accept_price','bonus_apply','bonus_cancel','gift_apply','gift_remove','promo_apply','settle_gift','refresh_quote'}
    if not isinstance(action,str) or action not in allowed: raise ValueError('action_not_allowed')
    nonce=body.get('request_id')
    if not isinstance(nonce,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{16,80}',nonce): raise ValueError('bad_request')
    if user and user['id'] in config.ADMIN_IDS: raise ValueError('admin_session')
    actor=digest({'user':user['id'] if user else None,'order':order_id})
    payload=digest({k:v for k,v in body.items() if k!='request_id'})
    async with db.transaction() as c:
        o=await db.get_order(order_id)
        if authorize is not None:
            permitted,current_user=await authorize()
            if not permitted or field(current_user,'id')!=field(user,'id'):raise ValueError('not_found')
        if not o or field(o,'deleted'): raise ValueError('not_found')
        prior=await (await c.execute("SELECT data FROM order_events WHERE order_id=? AND kind='checkout_action'",(order_id,))).fetchall()
        for row in prior:
            try: record=json.loads(row['data'])
            except (ValueError,TypeError): continue
            if record.get('request_id')==nonce:
                if record.get('actor')!=actor or record.get('payload')!=payload: raise ValueError('request_conflict')
                return {'replayed':True,'request_id':nonce}
        info=await assert_revision(o,body.get('expected_revision'))
        if action=='refresh_quote':
            if not info['can_benefit']: raise ValueError('checkout_locked')
            await revise(order_id)
        elif action in ('accept_price','settle_gift'):
            if action=='accept_price' and (not info['can_accept'] or body.get('accept') is not True): raise ValueError('accept_required')
            if action=='settle_gift' and (o['status']!='prepay' or body.get('accept') is not True or not info['can_benefit']): raise ValueError('pay_stage')
            # Repair old mismatched documents before consent, never after silently.
            if info['needs_refresh']: raise ValueError('quote_changed')
            due=payments.money_due(o)
            if action=='settle_gift' and due['due_total']!=0: raise ValueError('quote_changed')
            if due['due_total']==0:
                if int(o['gift_amount'] or 0)<=0: raise ValueError('financial_revision_requires_review')
                await gift.sync_order(bot,order_id)
                fresh=await db.get_order(order_id)
                if payments.money_due(fresh)['due_total']!=0: raise ValueError('quote_changed')
                snap=await db.specification_latest(order_id)
                if snap:
                    changed=await c.execute("UPDATE order_specifications SET status='accepted',accepted_at=? WHERE id=? AND order_id=? AND status='offered'",(db.now_iso(),snap['id'],order_id))
                    if changed.rowcount!=1: raise ValueError('quote_changed')
                await db.set_status(order_id,'work','заказ подтверждён; полностью покрыт сертификатом')
                await db.add_event(order_id,'gift_checkout_accepted',json.dumps({'snapshot_revision':info['revision'],'gift_amount':fresh['gift_amount'],'snapshot_id':snap['id'] if snap else None,'snapshot_hash':snap['specification_hash'] if snap else None}))
            else: await db.set_status(order_id,'prepay','клиент принял предложение на сайте')
            await db.add_event(order_id,'price_accepted')
        else:
            if not info['can_benefit']: raise ValueError('checkout_locked')
            if action.startswith('bonus') and (not user or not o['user_id'] or o['user_id']!=user['id']): raise ValueError('bonus_need_login')
            if action=='bonus_apply':
                amount=body.get('amount')
                if type(amount) is not int or amount<=0: raise ValueError('bad_request')
                ok,err,_=await bonus.apply_to_order(user['id'],o,amount)
                if not ok: raise ValueError(err)
            elif action=='bonus_cancel':
                ok,err,_=await bonus.cancel_spend(o)
                if not ok: raise ValueError(err)
            elif action=='gift_apply':
                code=body.get('code')
                if not isinstance(code,str) or len(code)>24: raise ValueError('bad_request')
                ok,err=await gift.attach_to_order(bot,order_id,code,via='сайт')
                if not ok: raise ValueError(err)
            elif action=='gift_remove':
                ok,err=await gift.detach_from_order(bot,order_id)
                if not ok: raise ValueError(err)
            elif action=='promo_apply': await apply_promo(o,body.get('code'),intent)
            await gift.sync_order(bot,order_id)
            await revise(order_id)
        await db.add_event(order_id,'checkout_action',json.dumps({'request_id':nonce,'actor':actor,'payload':payload,'action':action},sort_keys=True))
    return {'replayed':False,'request_id':nonce}
