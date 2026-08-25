#!/usr/bin/env python3
"""Hash-pinned installer for Deposit V2 Reserve and fixed referrals.

The public deposit stays available and keeps the existing 8/10/12/15 tiers.
Safety is implemented in principal lots, exact payment operations, held bonus
uplifts, fixed referral obligations and persistent SQLite guards.  The
installer never restores a database snapshot.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable


SOURCE_MARKER = "economic-v2-reserve:20260825"
DEPOSIT_SETTING = "economic_deposit_contract_v2"
DEPOSIT_ISSUANCE_SETTING = "economic_deposit_issuance_v2"
REFERRAL_SETTING = "economic_referral_contract_v2"
MIGRATING_VALUE = "migrating-v2"
DEPOSIT_ON = "earned-v2:on"
DEPOSIT_ISSUANCE_ON = "earned-v2:open"
DEPOSIT_ISSUANCE_OFF = "earned-v2:closed"
REFERRAL_ON = "fixed-200:on"
REFERRAL_REVIEW = "fixed-200:review"
DEPOSIT_VERSION = "earned-v2-20260901"
LEGACY_VERSION = "legacy-v1"
REFERRAL_VERSION = "fixed-200-20260901"
DEP_INV_OFFSET = 70_000_000

KNOWN_BEFORE = {
    "config": "8d9b1e8f1dcc67134be3a9b7ec2ee7957b281f6af8710c1c63778b696d6fa8fc",
    "texts": "7dc29893dcfc5ac5a71e75f6dc49c12f9602ef49c017ba7b4721dd3589b56637",
    "webapp": "2d2bebb3a0a363cdff5d060c6d459834f8d2d1efb6f01426c003cd1ca8435d0e",
    "handlers_client": "a98da93fd7a790d6b32d57591f71e5dd1d8ef6b96105d7fb91dc32d354f75fac",
    "handlers_admin": "a257727e84fb5ece8163449d7d6e87b23f39adc15225e8d82862491ed10a3a2c",
    "services_bonus": "7e2f09f59dc1de1a0722f50a97805f7df2c23aa818547ed26e2708d9cbec99d6",
    "services_deposit": "8ecfa3492bef54bb4501db65c59bb0a403ef2c5ba798b04426c1636a1b24d816",
    "services_payments": "e5774abc5eaed7b1e877a442955c58351cbccb76b9ac15b231e7deec5321444f",
    "services_subs": "1a50d9c926f3e72bbb505a3c55eff9a2e9fc5ed216f5aad2d81d0953096fe123",
    "services_pamyatka": "a273579702cea79795d9acd3e8ac20ce0bdcf801abb377dee6be65e8c5ca807c",
}

# Populated from the exact production pre-images after all generated sources
# compile.  Unknown and partially applied trees always fail closed.
KNOWN_AFTER = {
    "config": "0c35f94f072ee27436feda2b27403a2430c638ef92c474553a42584902d409f6",
    "texts": "1fd521ca493ac889e28e2a7df401be94dffcfa27c6db31aeab9fabb9309bfde0",
    "webapp": "6f36199cf1324dd4b1231034b501bdd157a56447fc79ea3a568a1cc1cb1b123c",
    "handlers_client": "0200a15ef28df5a5d76d1caaa945cd7b9861bb049622c150c64772a5acab93ab",
    "handlers_admin": "c7efd2538a77158ffc9496160057a8e9d31e7c31319f249fbd4f000f2e9d36c8",
    "services_bonus": "d89d8467961930c501b607ae36f0b7dc4674cc012733af19020fc45990e14a7e",
    "services_deposit": "e1d59e4a4c3842cec1a141c7fd46f8c75028289c04f9920f1b21c17b24b85d36",
    "services_payments": "1f428f3d708d3b23432757d7c387b4cf3b5b28418de77855cdd6c145ee9b75e5",
    "services_subs": "cb958be3ca79d72e4198c5120331adabce51329b77867588dc1612bc4eb5b66f",
    "services_pamyatka": "9536fb656ba32733eae359a60e1889cf214fcbba6f65ba4809d7d761fa5871d2",
}
RUNTIME_AFTER = "13ce5434b00114f1cf12520ff9da31215485a78cfef13320730583d05909b181"


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def runtime_asset() -> Path:
    return Path(__file__).with_name("economic_v2_runtime.py")


def runtime_source() -> str:
    path = runtime_asset()
    if not path.is_file():
        raise RuntimeError(f"runtime asset missing: {path}")
    text = path.read_text(encoding="utf-8")
    if SOURCE_MARKER not in text:
        raise RuntimeError("runtime asset marker missing")
    ast.parse(text, filename=str(path))
    return text


def gross_vest_delta(old_consumed: int, new_consumed: int,
                     rate_bp: int) -> int:
    old = max(0, int(old_consumed))
    new = max(old, int(new_consumed))

    def earned(consumed: int) -> int:
        if consumed <= 0:
            return 0
        if consumed >= 60_000:
            usage_rate = 1500
        elif consumed >= 45_000:
            usage_rate = 1200
        elif consumed >= 30_000:
            usage_rate = 1000
        else:
            usage_rate = 800
        return consumed * min(max(0, int(rate_bp)), usage_rate) // 10_000

    return earned(new) - earned(old)


def lot_reward_step(*, old_principal: int, old_cashback: int,
                    added_principal: int, added_cashback: int,
                    rate_bp: int) -> dict[str, int]:
    old_p = max(0, int(old_principal))
    old_k = max(0, int(old_cashback))
    add_p = max(0, int(added_principal))
    add_k = max(0, int(added_cashback))
    old_gross = gross_vest_delta(0, old_p, rate_bp)
    new_gross = gross_vest_delta(0, old_p + add_p, rate_bp)
    old_target = max(old_gross, old_k)
    new_target = max(new_gross, old_k + add_k)
    delta = new_target - old_target
    base = min(delta, add_k)
    return {"old_target": old_target, "new_gross": new_gross,
            "new_target": new_target, "delta": delta,
            "base": base, "uplift": delta - base}


def reward_plan(*, paid_total: int, deposit_paid: int,
                deposit_gross: int, cashback_pct: int) -> dict[str, int]:
    base = max(0, int(paid_total))
    dep = min(base, max(0, int(deposit_paid)))
    pct = max(0, int(cashback_pct))
    normal = base * pct // 100
    deposit_variant = (base - dep) * pct // 100 + max(0, int(deposit_gross))
    target = max(normal, deposit_variant)
    return {"normal": normal, "deposit_variant": deposit_variant,
            "target": target, "uplift": max(0, target - normal)}


def _replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one anchor, got {count}")
    return text.replace(old, new, 1)


def _replace_between(text: str, start: str, end: str, replacement: str,
                     label: str) -> str:
    if text.count(start) != 1 or text.count(end) != 1:
        raise RuntimeError(f"{label}: exact boundaries missing")
    begin = text.index(start)
    finish = text.index(end, begin)
    return text[:begin] + replacement + text[finish:]


def _prepend_marker(text: str) -> str:
    if SOURCE_MARKER in text:
        return text
    return f"# {SOURCE_MARKER}\n" + text


DEPOSIT_WRAPPER = r'''"""Deposit V2 Reserve: atomic principal lots and earned benefits."""
from __future__ import annotations

# economic-v2-reserve:20260825

from . import economic_v2 as _v2

RATES = _v2.RATES
MIN_TOPUP = _v2.MIN_TOPUP
MAX_TOPUP = _v2.MAX_TOPUP
MAX_ACTIVE = _v2.MAX_ACTIVE
BONUS_TTL = _v2.BONUS_TTL
DepositV2Unavailable = _v2.DepositV2Unavailable
DepositLimitError = _v2.DepositLimitError

rate_for = _v2.rate_for
amount_ok = _v2.amount_ok
balance = _v2.balance
dep_get = _v2.dep_get
rows = _v2.rows
summary = _v2.summary
create_pending = _v2.create_pending
activate_paid = _v2.activate_paid
pay_order = _v2.pay_order
prepare_refund = _v2.prepare_refund
confirm_refund = _v2.confirm_refund
cancel_refund = _v2.cancel_refund
recover_payments = _v2.recover_payments
resolve_paid_hold = _v2.resolve_paid_hold
settle_confirmed_payment = _v2.settle_confirmed_payment
mark_payment_effects_applied = _v2.mark_payment_effects_applied
resolve_referral_review = _v2.resolve_referral_review
restore_order_after_refund = _v2.restore_order_after_refund


async def refund(dep_id: int, actor: str = "мастер") -> tuple[bool, str, int]:
    """Compatibility seam: reserve cash; closing still needs explicit confirm."""
    ok, report, amount, op_id = await prepare_refund(dep_id, actor)
    if ok:
        report += (f"\nПосле реального перевода: <code>/dep confirm {op_id}</code>; "
                   f"отмена: <code>/dep cancel {op_id}</code>.")
    return ok, report, amount
'''


def patch_services_deposit(text: str) -> str:
    if SOURCE_MARKER in text:
        return text
    return DEPOSIT_WRAPPER


PAYMENTS_CONFIRM_ANCHOR = '''# ------------------------------------------------------- подтверждение

async def confirm(bot: Bot, order_id: int, kind: str, amount: int,
'''
PAYMENTS_CONFIRM_ANCHOR_V2 = '''# ------------------------------------------------------- подтверждение

async def _deposit_effects_applied(method: str, pay_id: int) -> None:
    if method != "deposit":
        return
    from . import economic_v2
    if not await economic_v2.mark_payment_effects_applied(int(pay_id)):
        raise RuntimeError("deposit_v2_effects_close_failed")


async def confirm(bot: Bot, order_id: int, kind: str, amount: int,
'''
PAYMENTS_CLAIM_ACCEPTED = '''    if claim not in ("claimed", "already_paid"):
        return {"ok": False, "error": f"payment_{claim}"}

    fresh_payment = await db.payment_get(int(pay_id))
'''
PAYMENTS_CLAIM_ACCEPTED_V2 = '''    if claim not in ("claimed", "already_paid"):
        return {"ok": False, "error": f"payment_{claim}"}

    if method == "deposit":
        from . import economic_v2
        if not await economic_v2.settle_confirmed_payment(int(pay_id)):
            return {"ok": False, "error": "deposit_settlement_pending",
                    "pay_id": pay_id}

    fresh_payment = await db.payment_get(int(pay_id))
'''
PAYMENTS_ALREADY_APPLIED = '''        await handoff.release_if_paid(bot, order_id)
        await payment_delivery.schedule_for_payment(bot, order_id, int(pay_id))
        return {"ok": True, "duplicate_callback": True, "pay_id": pay_id}
'''
PAYMENTS_ALREADY_APPLIED_V2 = '''        await handoff.release_if_paid(bot, order_id)
        await payment_delivery.schedule_for_payment(bot, order_id, int(pay_id))
        await _deposit_effects_applied(method, int(pay_id))
        return {"ok": True, "duplicate_callback": True, "pay_id": pay_id}
'''
PAYMENTS_EFFECTS_MARK = '''        await db.receipt_effects_mark(int(pay_id), applied=True)
'''
PAYMENTS_EFFECTS_MARK_V2 = '''        await db.receipt_effects_mark(int(pay_id), applied=True)
        await _deposit_effects_applied(method, int(pay_id))
'''
PAYMENTS_EFFECTS_FINAL = '''    await db.receipt_effects_mark(int(pay_id), applied=True)
    return {"ok": True, "pay_id": pay_id}
'''
PAYMENTS_EFFECTS_FINAL_V2 = '''    await db.receipt_effects_mark(int(pay_id), applied=True)
    await _deposit_effects_applied(method, int(pay_id))
    return {"ok": True, "pay_id": pay_id}
'''


def patch_services_payments(text: str) -> str:
    if SOURCE_MARKER in text:
        return text
    text = _replace_once(text, PAYMENTS_CONFIRM_ANCHOR,
                         PAYMENTS_CONFIRM_ANCHOR_V2,
                         "payments v2 helper")
    text = _replace_once(text, PAYMENTS_CLAIM_ACCEPTED,
                         PAYMENTS_CLAIM_ACCEPTED_V2,
                         "payments money settlement hook")
    text = _replace_once(text, PAYMENTS_ALREADY_APPLIED,
                         PAYMENTS_ALREADY_APPLIED_V2,
                         "payments applied recovery hook")
    text = _replace_once(text, PAYMENTS_EFFECTS_FINAL,
                         PAYMENTS_EFFECTS_FINAL_V2,
                         "payments final effects mark")
    count = text.count(PAYMENTS_EFFECTS_MARK)
    if count != 4:
        raise RuntimeError(f"payments effects marks: expected four, got {count}")
    text = text.replace(PAYMENTS_EFFECTS_MARK, PAYMENTS_EFFECTS_MARK_V2)
    return _prepend_marker(text)


BONUS_IMPORT = "from . import notify\n"
BONUS_IMPORT_V2 = "from . import notify, economic_v2\n"
BONUS_BALANCE = '''async def balance(user_id: int) -> int:
    return await db.bonus_balance(user_id)
'''
BONUS_BALANCE_V2 = '''async def balance(user_id: int) -> int:
    await economic_v2.release_ready_rewards(user_id)
    await economic_v2.settle_bonus_debt(user_id)
    return await db.bonus_balance(user_id)
'''
BONUS_ON_START = '''async def on_payment(bot: Bot, order_id: int) -> None:
'''
BONUS_SPEND = '''# --------------------------------------------------------------- списание
'''
BONUS_ON_V2 = '''async def on_payment(bot: Bot, order_id: int) -> None:
    """Atomic best-of reward and exact fixed referral settlement."""
    await economic_v2.on_payment(bot, order_id)


'''
BONUS_APPLY_HEAD = '''async def apply_to_order(user_id: int, order, amount: int) -> tuple[bool, str, int]:
    """Применить бонусы к заказу — ОДИН раз, до первой оплаты.
'''
BONUS_APPLY_V2 = '''async def apply_to_order(user_id: int, order, amount: int) -> tuple[bool, str, int]:
    """Применить бонусы к заказу — ОДИН раз, до первой оплаты.
'''
BONUS_APPLY_BODY = '''    if (order["work_type"] or "").startswith("sub_"):
'''
BONUS_APPLY_BODY_V2 = '''    await economic_v2.release_ready_rewards(user_id)
    await economic_v2.settle_bonus_debt(user_id)
    if await economic_v2.order_refund_complete(int(order["id"])):
        return False, "bonus_order_refunded", 0
    if (order["work_type"] or "").startswith("sub_"):
'''
BONUS_APPLY_CALL = '''    result = await db.bonus_apply_with_aggregate_cap(
        user_id, order["id"], amount,
        f"заказ {config.order_no(order['id'])}",
        config.BONUS_MIN_ORDER, config.BONUS_SPEND_CAP_PCT,
    )
'''
BONUS_APPLY_CALL_V2 = '''    try:
        result = await db.bonus_apply_with_aggregate_cap(
            user_id, order["id"], amount,
            f"заказ {config.order_no(order['id'])}",
            config.BONUS_MIN_ORDER, config.BONUS_SPEND_CAP_PCT,
        )
    except Exception as exc:
        if "economic_order_reward_tombstone" in str(exc):
            return False, "bonus_order_refunded", 0
        raise
'''
BONUS_RESTORE = '''async def restore_for_order(order, note: str = "возврат по заказу") -> int:
    """Отказ/возврат: списанные бонусы возвращаются (срок ≥30 дней, п. 3.7)."""
    spent = order["bonus_spent"] or 0
    if spent <= 0 or not order["user_id"]:
        return 0
    await db.bonus_add(order["user_id"], spent, "restore",
                       f"{note} {config.order_no(order['id'])}", order["id"], ttl_days=30)
    await db.update_order(order["id"], bonus_spent=0)
    return spent
'''
BONUS_RESTORE_V2 = '''async def restore_for_order(
    order, note: str = "возврат по заказу", *,
    refunded_total: int | None = None,
    refunded_deposit: int | None = None,
    refunded_bonus: int | None = None,
    reverse_rewards: bool = True,
) -> int:
    """Atomically restore spent points and reconcile returned-order rewards."""
    return await economic_v2.restore_order_after_refund(
        int(order["id"]), note,
        refunded_total=refunded_total,
        refunded_deposit=refunded_deposit,
        refunded_bonus=refunded_bonus,
        reverse_rewards=reverse_rewards,
    )
'''
BONUS_CANCEL_RESTORE = '''    restored = await restore_for_order(order, "отмена списания")
'''
BONUS_CANCEL_RESTORE_V2 = '''    restored = await restore_for_order(
        order, "отмена списания", reverse_rewards=False
    )
'''
BONUS_SWEEP_HEAD = '''async def sweep_expiring(bot: Bot) -> None:
    """Раз в день: предупредить о сгорании за N дней; отметить сгоревшее."""
'''
BONUS_SWEEP_V2 = '''async def sweep_expiring(bot: Bot) -> None:
    """Recover money ops, release matured rewards, then expire old points."""
    await economic_v2.recover_payments(bot)
    await economic_v2.release_ready_rewards()
    await economic_v2.settle_bonus_debt()
'''


def patch_services_bonus(text: str) -> str:
    if SOURCE_MARKER in text:
        return text
    text = _replace_once(text, BONUS_IMPORT, BONUS_IMPORT_V2, "bonus v2 import")
    text = _replace_once(text, BONUS_BALANCE, BONUS_BALANCE_V2, "bonus v2 balance")
    text = _replace_once(
        text,
        '    rows = await db.bonus_active_accruals(user_id)\n',
        '    await economic_v2.release_ready_rewards(user_id)\n'
        '    await economic_v2.settle_bonus_debt(user_id)\n'
        '    rows = await db.bonus_active_accruals(user_id)\n',
        "bonus v2 summary",
    )
    text = _replace_between(text, BONUS_ON_START, BONUS_SPEND,
                            BONUS_ON_V2, "bonus v2 on_payment")
    text = _replace_once(text, BONUS_APPLY_BODY, BONUS_APPLY_BODY_V2,
                         "bonus v2 apply preflight")
    text = _replace_once(text, BONUS_APPLY_CALL, BONUS_APPLY_CALL_V2,
                         "bonus v2 apply tombstone race")
    text = _replace_once(text, BONUS_RESTORE, BONUS_RESTORE_V2,
                         "bonus v2 reversal")
    text = _replace_once(text, BONUS_CANCEL_RESTORE, BONUS_CANCEL_RESTORE_V2,
                         "bonus cancel restore")
    text = _replace_once(text, BONUS_SWEEP_HEAD, BONUS_SWEEP_V2,
                         "bonus v2 daily recovery")
    text = _replace_once(
        text,
        '    "expire": "Бонусы сгорели",\n',
        '    "expire": "Бонусы сгорели",\n'
        '    "deposit_v2_base": "Кэшбэк по депозитному расчёту",\n'
        '    "deposit_v2": "Выгода по депозиту",\n'
        '    "deposit_legacy": "Бонус по прежним условиям депозита",\n',
        "bonus v2 labels",
    )
    return _prepend_marker(text)


CONFIG_FEATURE = '''    ("refboost", "Реф-буст: 7% с оплат друзей", 90, "вместо обычных 5%"),
]
SUB_FEATURE_BY_ID = {f[0]: f for f in SUB_FEATURES}
'''
CONFIG_FEATURE_V2 = ''']
LEGACY_SUB_FEATURES: list[tuple[str, str, int, str]] = [
    ("refboost", "Реф-буст (архивная опция)", 90, "условия сохранены до конца срока"),
]
SUB_FEATURE_BY_ID = {f[0]: f for f in (*SUB_FEATURES, *LEGACY_SUB_FEATURES)}
'''


def patch_config(text: str) -> str:
    if SOURCE_MARKER in text:
        return text
    return _prepend_marker(_replace_once(
        text, CONFIG_FEATURE, CONFIG_FEATURE_V2, "remove new refboost sale"))


SUBS_COMPOSE = '''def compose(plan_id: str, features: list[str] | None, period: str) -> dict | None:
    """Собрать параметры подписки: цена, срок, скидка. None — некорректно."""
'''
SUBS_COMPOSE_V2 = '''def compose(plan_id: str, features: list[str] | None, period: str) -> dict | None:
    """Собрать параметры подписки: цена, срок, скидка. None — некорректно."""
    if "refboost" in set(features or []):
        return None
'''


def patch_services_subs(text: str) -> str:
    if SOURCE_MARKER in text:
        return text
    return _prepend_marker(_replace_once(
        text, SUBS_COMPOSE, SUBS_COMPOSE_V2, "block new refboost"))


TEXTS_BONUS_START = r'''WELCOME_ALREADY = (
'''
TEXTS_BONUS_END = r'''# --- открытая приёмная в боте ---
'''
TEXTS_BONUS_V2 = r'''WELCOME_ALREADY = (
    "Приветственный бонус уже был начислен на этот аккаунт — он выдаётся один раз. "
    "Текущий баланс: <b>{balance}</b>. Ещё бонусы начисляются кэшбэком и "
    "однократной наградой 200 бонусов за первого оплатившего заказ гостя."
)

BONUS_MENU = (
    "💎 <b>Ваши бонусы: {balance}</b>\n"
    "{expiring}\n"
    "Как это работает:\n"
    "• 1 бонус = 1 ₽ скидки, списание — до 20% стоимости заказа;\n"
    "• кэшбэк 5% с полностью оплаченного заказа (действует 90 дней);\n"
    "• за первого полностью оплатившего заказ гостя — 200 бонусов один раз.\n\n"
    "🔗 Ваша личная ссылка:\n<code>{ref_link}</code>\n\n"
    "Приглашённому бонус не начисляется и цена от ссылки не меняется. "
    "<a href=\"{site}/loyalty.html\">Полные правила</a>"
)

REF_HELLO = (
    "🤝 Вы пришли по личной рекомендации. Цена для вас не меняется; после "
    "полной оплаты вашего первого заказа пригласившему начислят 200 бонусов."
)

'''


def patch_texts(text: str) -> str:
    if SOURCE_MARKER in text:
        return text
    return _prepend_marker(_replace_between(
        text, TEXTS_BONUS_START, TEXTS_BONUS_END,
        TEXTS_BONUS_V2, "fixed referral texts"))


CLIENT_REF_NOTICE = '''            "🤝 По вашей ссылке пришёл новый гость — когда он оплатит первый заказ, "
            f"вам начислится {config.BONUS_REF_PCT}% бонусами.")
'''
CLIENT_REF_NOTICE_V2 = '''            "🤝 По вашей ссылке пришёл новый гость — после полной оплаты его "
            "первого заказа вам начислят 200 бонусов один раз.")
'''
CLIENT_DEP_START = '''async def _dep_text(user_id: int) -> tuple[str, object]:
'''
CLIENT_DEP_END = '''

@router.message(Command("deposit"))
'''
CLIENT_DEP_V2 = r'''async def _dep_text(user_id: int) -> tuple[str, object]:
    from ..services import deposit
    s = await deposit.summary(user_id)
    rates = sorted(deposit.RATES)
    text = (
        "💼 <b>Депозит мастерской</b>\n\n"
        f"На кошельке: <b>{config.fmt_money(s['balance'])} ₽</b>. Им оплачиваются "
        "этапы заказов в один клик — кнопка «С депозита» в кабинете.\n\n"
        "При пополнении фиксируется максимальный резерв 8–15%; итоговая ставка "
        "зависит от фактически использованной суммы. Обычный кэшбэк начисляется "
        "после полной оплаты заказа; если депозитный расчёт выгоднее, разница "
        "становится доступна после приёмки и 14-дневной проверки. Ставки не "
        f"складываются (<a href=\"{config.SITE_URL}/loyalty.html\">правила</a>).")
    if not s["can_topup"]:
        text += "\n\n⚠️ Потолок кошелька 120 000 ₽ достигнут — сначала потратьте часть."
    return text, kb.dep_menu(rates, s["can_topup"])
'''
CLIENT_CREATE = '''    d = await deposit.create_pending(user_id=cb.from_user.id, amount=amount,
                                     via="бот")
'''
CLIENT_CREATE_V2 = '''    try:
        d = await deposit.create_pending(user_id=cb.from_user.id, amount=amount,
                                         via="бот")
    except deposit.DepositLimitError:
        await cb.answer("Потолок кошелька 120 000 ₽ — сначала потратьте часть",
                        show_alert=True)
        return
    except deposit.DepositV2Unavailable:
        await cb.answer("Нужно сверить предыдущее пополнение — напишите мастеру",
                        show_alert=True)
        return
'''
CLIENT_TOPUP_COPY = '''        f"После оплаты сверху придут <b>{config.fmt_money(d['bonus_amount'])}</b> "
        f"бонусами (+{d['bonus_pct']}%) — начислим и напишем сюда автоматически.",
'''
CLIENT_TOPUP_COPY_V2 = '''        f"После оплаты зафиксируем максимальный резерв до "
        f"<b>{config.fmt_money(d['bonus_amount'])}</b> бонусов (+{d['bonus_pct']}%). "
        "Итог зависит от фактически использованной суммы и станет доступен "
        "после оплаты и приёмки заказов — напишем сюда автоматически.",
'''


def patch_handlers_client(text: str) -> str:
    if SOURCE_MARKER in text:
        return text
    text = _replace_once(text, CLIENT_REF_NOTICE, CLIENT_REF_NOTICE_V2,
                         "client fixed referral notice")
    text = _replace_between(text, CLIENT_DEP_START, CLIENT_DEP_END,
                            CLIENT_DEP_V2, "client deposit text")
    text = _replace_once(text, CLIENT_CREATE, CLIENT_CREATE_V2,
                         "client atomic topup errors")
    text = _replace_once(text, CLIENT_TOPUP_COPY, CLIENT_TOPUP_COPY_V2,
                         "client reserve copy")
    return _prepend_marker(text)


WEB_TOPUP_CREATE = '''    d = await deposit.create_pending(user_id=user["id"], amount=amount,
                                     via="кабинет")
    url = await payments.robo_create_link_dep(d)
'''
WEB_TOPUP_CREATE_V2 = '''    try:
        d = await deposit.create_pending(user_id=user["id"], amount=amount,
                                         via="кабинет")
    except deposit.DepositLimitError:
        return _err("over_limit", 409)
    except deposit.DepositV2Unavailable as exc:
        return _err(str(exc), 409)
    url = await payments.robo_create_link_dep(d)
'''
WEB_DEP_START = '''    if inv_id >= payments.DEP_INV_OFFSET:
'''
WEB_DEP_END = '''    if inv_id >= payments.TIP_INV_OFFSET:
'''
WEB_DEP_V2 = '''    if inv_id >= payments.DEP_INV_OFFSET:
        # Deposit V2: the signed callback and lot funding converge atomically.
        d = await deposit.dep_get(inv_id - payments.DEP_INV_OFFSET)
        if not d:
            return web.Response(status=400, text="unknown invoice")
        if amount != int(d["amount"] or 0):
            return web.Response(status=400, text="bad amount")
        bot_d: Bot = request.app["bot"]
        if d["status"] not in ("pending", "active"):
            await db.receipt_mark_paid("robokassa", inv_id, allocated=False)
            await notify.notify_admins(
                bot_d,
                f"⚠️ Robokassa приняла {config.fmt_money(amount)} ₽ по закрытому "
                f"пополнению #{d['id']}; деньги отмечены для ручной сверки.")
            return web.Response(text=f"OK{inv_id}")
        result = await deposit.activate_paid(
            bot_d, d["id"], method="robokassa", actor="Robokassa",
            provider="robokassa", external_id=str(inv_id))
        if not result or result.get("state") == "paid_hold":
            await notify.notify_admins(
                bot_d,
                f"⚠️ Robokassa приняла {config.fmt_money(amount)} ₽ по депозиту "
                f"#{d['id']}, но V2 оставил деньги в paid_hold: "
                f"{(result or {}).get('reason','unknown')}. Нужна сверка.")
            await payment_delivery.schedule_for_receipt(bot_d, "robokassa", inv_id)
            return web.Response(text=f"OK{inv_id}")
        if not result.get("duplicate"):
            await notify.notify_admins(
                bot_d,
                f"💼 Robokassa: депозит пополнен на {config.fmt_money(amount)} ₽; "
                f"зафиксирован резерв до {config.fmt_money(d['bonus_amount'])} бонусов "
                f"(+{d['bonus_pct']}%), без немедленной выдачи.")
        await payment_delivery.schedule_for_receipt(bot_d, "robokassa", inv_id)
        return web.Response(text=f"OK{inv_id}")
'''


def patch_webapp(text: str) -> str:
    if SOURCE_MARKER in text:
        return text
    text = _replace_once(text, WEB_TOPUP_CREATE, WEB_TOPUP_CREATE_V2,
                         "web atomic topup errors")
    text = _replace_between(text, WEB_DEP_START, WEB_DEP_END,
                            WEB_DEP_V2, "web deposit callback")
    text = _replace_once(
        text,
        '                  "bonus": d["bonus_amount"], "pct": d["bonus_pct"]})\n',
        '                  "bonus": d["bonus_amount"], "pct": d["bonus_pct"],\n'
        '                  "bonus_state": "reserved"})\n',
        "web reserve response",
    )
    return _prepend_marker(text)


ADMIN_DEP_START = '''@core.message(Command("dep"))
'''
ADMIN_DEP_END = '''

@core.message(Command("slots"))
'''
ADMIN_DEP_V2 = r'''@core.message(Command("dep"))
async def cmd_dep(m: Message, command: CommandObject) -> None:
    """Two-step deposit refund: reserve, real transfer, explicit confirmation."""
    from ..services import deposit
    args = (command.args or "").split()
    if len(args) > 1 and args[1].isdigit() and args[0] == "allocate":
        ok, report, _amount = await deposit.resolve_paid_hold(
            m.bot, int(args[1]), actor="мастер")
        await m.answer(("✅ " if ok else "⚠️ ") + report)
        return
    if len(args) > 1 and args[1].isdigit() and args[0] in ("refgrant", "refreject"):
        ok, report = await deposit.resolve_referral_review(
            m.bot, int(args[1]), grant=args[0] == "refgrant", actor="мастер")
        await m.answer(("✅ " if ok else "⚠️ ") + report)
        return
    if len(args) > 1 and args[1].isdigit() and args[0] == "refund":
        ok, report, _amount, op_id = await deposit.prepare_refund(
            int(args[1]), actor="мастер")
        if ok:
            report += (f"\nПосле перевода: <code>/dep confirm {op_id}</code>\n"
                       f"Если перевод не сделан: <code>/dep cancel {op_id}</code>")
        await m.answer(("✅ " if ok else "⚠️ ") + report)
        return
    if len(args) > 1 and args[1].isdigit() and args[0] == "confirm":
        ok, report, _amount = await deposit.confirm_refund(
            int(args[1]), actor="мастер")
        await m.answer(("✅ " if ok else "⚠️ ") + report)
        return
    if len(args) > 1 and args[1].isdigit() and args[0] == "cancel":
        ok, report, _amount = await deposit.cancel_refund(
            int(args[1]), actor="мастер")
        await m.answer(("✅ " if ok else "⚠️ ") + report)
        return
    cur = await db.conn().execute("SELECT * FROM deposits ORDER BY id DESC LIMIT 10")
    rows = await cur.fetchall()
    if not rows:
        await m.answer("💼 Депозитов пока нет.")
        return
    lines = ["💼 <b>Депозиты · последние 10</b>"]
    seen_users = set()
    for d in rows:
        mark = {"active": "🟢", "pending": "⏳", "refunded": "↩️",
                "canceled": "✖️"}.get(d["status"], "·")
        lines.append(
            f"{mark} №{d['id']} · {config.fmt_money(d['amount'])} ₽ "
            f"(резерв до {config.fmt_money(d['bonus_amount'])} бон.) · "
            f"<a href=\"tg://user?id={d['user_id']}\">клиент</a> · {d['status']}"
            + (f" · {d['via']}" if d["via"] else ""))
        seen_users.add(d["user_id"])
    for uid in list(seen_users)[:6]:
        lines.append(f"— кошелёк <a href=\"tg://user?id={uid}\">клиента</a>: "
                     f"<b>{config.fmt_money(await deposit.balance(uid))} ₽</b>")
    lines.append("\nВозврат: <code>/dep refund &lt;номер&gt;</code> — резервирует "
                 "точный остаток; после реального перевода нужен confirm.")
    lines.append("Сверка paid_hold: <code>/dep allocate &lt;номер&gt;</code> — только "
                 "после проверки прихода и потолка; либо обычный refund.")
    lines.append("Реферальная сверка: <code>/dep refgrant &lt;номер&gt;</code> или "
                 "<code>/dep refreject &lt;номер&gt;</code>.")
    await m.answer("\n".join(lines))
'''


def patch_handlers_admin(text: str) -> str:
    if SOURCE_MARKER in text:
        return text
    return _prepend_marker(_replace_between(
        text, ADMIN_DEP_START, ADMIN_DEP_END, ADMIN_DEP_V2,
        "admin two-step refund"))


PAMYATKA_AFTER = '''    H.b(f"Рекомендация: по вашей ссылке из кабинета друг получает {config.BONUS_REF_GIFT} бонусов "
        f"после первого заказа, а вы — {config.BONUS_REF_PCT}% с его оплат. Ссылка — в разделе "
        "«Пригласить друга».")
'''
PAMYATKA_AFTER_V2 = '''    H.b("Рекомендация: после первого полностью оплаченного заказа приглашённого "
        "вы получаете 200 бонусов один раз. Для приглашённого цена не меняется; "
        "личная ссылка находится в разделе «Пригласить друга».")
'''
PAMYATKA_SHORT = '''    H.b(f"Приведёте друга — ему {config.BONUS_REF_GIFT} бонусов после первого заказа, "
        f"вам {config.BONUS_REF_PCT}% с его оплат. Ссылка — в кабинете.")
'''
PAMYATKA_SHORT_V2 = '''    H.b("После первого полностью оплаченного заказа приглашённого — вам 200 бонусов "
        "один раз; для приглашённого цена не меняется. Личная ссылка — в кабинете.")
'''


def patch_services_pamyatka(text: str) -> str:
    if SOURCE_MARKER in text:
        return text
    text = _replace_once(text, PAMYATKA_AFTER, PAMYATKA_AFTER_V2,
                         "pamyatka fixed referral")
    text = _replace_once(text, PAMYATKA_SHORT, PAMYATKA_SHORT_V2,
                         "pamyatka short fixed referral")
    return _prepend_marker(text)


PATCHERS: dict[str, Callable[[str], str]] = {
    "config": patch_config,
    "texts": patch_texts,
    "webapp": patch_webapp,
    "handlers_client": patch_handlers_client,
    "handlers_admin": patch_handlers_admin,
    "services_bonus": patch_services_bonus,
    "services_deposit": patch_services_deposit,
    "services_payments": patch_services_payments,
    "services_subs": patch_services_subs,
    "services_pamyatka": patch_services_pamyatka,
}


def source_paths(root: Path) -> dict[str, Path]:
    return {
        "config": root / "config.py",
        "texts": root / "texts.py",
        "webapp": root / "webapp.py",
        "handlers_client": root / "handlers" / "client.py",
        "handlers_admin": root / "handlers" / "admin.py",
        "services_bonus": root / "services" / "bonus.py",
        "services_deposit": root / "services" / "deposit.py",
        "services_payments": root / "services" / "payments.py",
        "services_subs": root / "services" / "subs.py",
        "services_pamyatka": root / "services" / "pamyatka.py",
    }


SCHEMA_SQL = r'''
CREATE TABLE IF NOT EXISTS deposit_v2_lots(
  deposit_id INTEGER PRIMARY KEY REFERENCES deposits(id),
  user_id INTEGER NOT NULL,
  contract_version TEXT NOT NULL,
  principal_total INTEGER NOT NULL CHECK(principal_total>0),
  principal_funded INTEGER NOT NULL DEFAULT 0 CHECK(principal_funded>=0),
  principal_available INTEGER NOT NULL DEFAULT 0 CHECK(principal_available>=0),
  principal_pay_reserved INTEGER NOT NULL DEFAULT 0 CHECK(principal_pay_reserved>=0),
  principal_refund_reserved INTEGER NOT NULL DEFAULT 0 CHECK(principal_refund_reserved>=0),
  principal_consumed INTEGER NOT NULL DEFAULT 0 CHECK(principal_consumed>=0),
  principal_refunded INTEGER NOT NULL DEFAULT 0 CHECK(principal_refunded>=0),
  bonus_rate_bp INTEGER NOT NULL CHECK(bonus_rate_bp BETWEEN 0 AND 1500),
  bonus_gross_vested INTEGER NOT NULL DEFAULT 0 CHECK(bonus_gross_vested>=0),
  bonus_entitlement_awarded INTEGER NOT NULL DEFAULT 0
    CHECK(bonus_entitlement_awarded>=0),
  state TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(principal_funded=principal_available+principal_pay_reserved+
        principal_refund_reserved+principal_consumed+principal_refunded)
);
CREATE INDEX IF NOT EXISTS idx_dep_v2_user_state
  ON deposit_v2_lots(user_id,state,deposit_id);

CREATE TABLE IF NOT EXISTS deposit_v2_ops(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  op_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  deposit_id INTEGER REFERENCES deposits(id),
  user_id INTEGER NOT NULL,
  order_id INTEGER,
  payment_kind TEXT,
  payment_id INTEGER UNIQUE,
  provider TEXT,
  external_id TEXT,
  amount INTEGER NOT NULL CHECK(amount>=0),
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dep_v2_provider_external
  ON deposit_v2_ops(provider,external_id)
  WHERE provider IS NOT NULL AND external_id IS NOT NULL;
DROP INDEX IF EXISTS idx_dep_v2_live_pay;
CREATE UNIQUE INDEX idx_dep_v2_live_pay
  ON deposit_v2_ops(order_id,payment_kind)
  WHERE kind='pay' AND state IN
    ('reserved','confirming','money_settled','effects_applied');

CREATE TABLE IF NOT EXISTS deposit_v2_allocations(
  op_id INTEGER NOT NULL REFERENCES deposit_v2_ops(id),
  deposit_id INTEGER NOT NULL REFERENCES deposit_v2_lots(deposit_id),
  principal_amount INTEGER NOT NULL CHECK(principal_amount>0),
  gross_vest_delta INTEGER NOT NULL CHECK(gross_vest_delta>=0),
  principal_net INTEGER NOT NULL DEFAULT 0
    CHECK(principal_net>=0 AND principal_net<=principal_amount),
  cashback_candidate INTEGER NOT NULL DEFAULT 0 CHECK(cashback_candidate>=0),
  entitlement_delta INTEGER NOT NULL DEFAULT 0 CHECK(entitlement_delta>=0),
  uplift_delta INTEGER NOT NULL DEFAULT 0 CHECK(uplift_delta>=0),
  reward_state TEXT NOT NULL DEFAULT 'pending'
    CHECK(reward_state IN ('pending','counted','reversed')),
  base_ledger_id INTEGER UNIQUE,
  uplift_ledger_id INTEGER UNIQUE,
  PRIMARY KEY(op_id,deposit_id),
  CHECK(uplift_delta<=entitlement_delta)
);

CREATE TABLE IF NOT EXISTS deposit_v2_reward_claims(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  paid_total INTEGER NOT NULL CHECK(paid_total>=0),
  cashback_rate_bp INTEGER NOT NULL CHECK(cashback_rate_bp BETWEEN 0 AND 1000),
  normal_candidate INTEGER NOT NULL,
  deposit_candidate INTEGER NOT NULL,
  awarded INTEGER NOT NULL,
  uplift_amount INTEGER NOT NULL,
  refunded_total INTEGER NOT NULL DEFAULT 0 CHECK(refunded_total>=0),
  refunded_deposit INTEGER NOT NULL DEFAULT 0 CHECK(refunded_deposit>=0),
  cashback_ledger_id INTEGER,
  uplift_ledger_id INTEGER UNIQUE,
  state TEXT NOT NULL,
  release_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS referral_v2_obligations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invitee_user_id INTEGER NOT NULL,
  inviter_user_id INTEGER NOT NULL,
  source_order_id INTEGER,
  amount INTEGER NOT NULL CHECK(amount=200),
  state TEXT NOT NULL,
  program_version TEXT NOT NULL,
  bonus_ledger_id INTEGER UNIQUE,
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(invitee_user_id,program_version),
  UNIQUE(source_order_id,program_version)
);

CREATE TABLE IF NOT EXISTS economic_bonus_debts(
  user_id INTEGER PRIMARY KEY,
  amount INTEGER NOT NULL CHECK(amount>=0),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS economic_reward_reversals(
  bonus_ledger_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  total_reduced INTEGER NOT NULL CHECK(total_reduced>=0),
  unspent_revoked INTEGER NOT NULL,
  future_debt INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS economic_lot_reward_adjustments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deposit_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>0),
  principal_reversed INTEGER NOT NULL CHECK(principal_reversed>=0),
  entitlement_reduced INTEGER NOT NULL CHECK(entitlement_reduced>=0),
  held_canceled INTEGER NOT NULL CHECK(held_canceled>=0),
  unspent_revoked INTEGER NOT NULL CHECK(unspent_revoked>=0),
  expired_ignored INTEGER NOT NULL CHECK(expired_ignored>=0),
  future_debt INTEGER NOT NULL CHECK(future_debt>=0),
  created_at TEXT NOT NULL,
  UNIQUE(deposit_id,order_id,revision)
);
CREATE TABLE IF NOT EXISTS economic_order_reward_refunds(
  order_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  paid_total INTEGER NOT NULL CHECK(paid_total>=0),
  deposit_paid_total INTEGER NOT NULL CHECK(deposit_paid_total>=0),
  bonus_spent_total INTEGER NOT NULL DEFAULT 0 CHECK(bonus_spent_total>=0),
  refunded_total INTEGER NOT NULL CHECK(refunded_total>=0),
  refunded_deposit INTEGER NOT NULL CHECK(refunded_deposit>=0),
  refunded_bonus INTEGER NOT NULL DEFAULT 0 CHECK(refunded_bonus>=0),
  complete INTEGER NOT NULL CHECK(complete IN (0,1)),
  revision INTEGER NOT NULL CHECK(revision>0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(deposit_paid_total<=paid_total),
  CHECK(refunded_total<=paid_total),
  CHECK(refunded_deposit<=deposit_paid_total),
  CHECK(refunded_deposit<=refunded_total),
  CHECK(refunded_bonus<=bonus_spent_total),
  CHECK((complete=1 AND refunded_total=paid_total) OR
        (complete=0 AND refunded_total<paid_total))
);
'''


TRIGGERS_SQL = r'''
DROP TRIGGER IF EXISTS trg_dep_v2_insert_guard;
CREATE TRIGGER trg_dep_v2_insert_guard
BEFORE INSERT ON deposits
WHEN NEW.status='pending' AND (
  COALESCE((SELECT value FROM settings
    WHERE key='economic_deposit_contract_v2'),'')!='earned-v2:on'
  OR COALESCE((SELECT value FROM settings
    WHERE key='economic_deposit_issuance_v2'),'')!='earned-v2:open'
)
BEGIN SELECT RAISE(ABORT,'deposit_v2_not_enabled'); END;

DROP TRIGGER IF EXISTS trg_dep_v2_create_lot;
CREATE TRIGGER trg_dep_v2_create_lot
AFTER INSERT ON deposits
WHEN NEW.status='pending'
  AND (SELECT value FROM settings
    WHERE key='economic_deposit_contract_v2')='earned-v2:on'
  AND (SELECT value FROM settings
    WHERE key='economic_deposit_issuance_v2')='earned-v2:open'
BEGIN
  INSERT INTO deposit_v2_lots(
    deposit_id,user_id,contract_version,principal_total,bonus_rate_bp,state,
    created_at,updated_at)
  VALUES(NEW.id,NEW.user_id,'earned-v2-20260901',NEW.amount,
         NEW.bonus_pct*100,'invoice_pending',NEW.created_at,NEW.created_at);
END;

DROP TRIGGER IF EXISTS trg_dep_v2_activate_guard;
CREATE TRIGGER trg_dep_v2_activate_guard
BEFORE UPDATE OF status ON deposits
WHEN OLD.status='pending' AND NEW.status='active' AND (
  COALESCE((SELECT value FROM settings WHERE key='economic_deposit_contract_v2'),'')
    !='earned-v2:on'
  OR NOT EXISTS(
    SELECT 1 FROM deposit_v2_lots l JOIN deposit_v2_ops op
      ON op.deposit_id=l.deposit_id AND op.kind='activate'
    WHERE l.deposit_id=NEW.id
      AND l.user_id=NEW.user_id AND l.principal_total=NEW.amount
      AND op.user_id=NEW.user_id AND op.amount=NEW.amount
      AND l.state IN ('invoice_pending','legacy_manual_pending')
      AND op.state='prepared'
  )
)
BEGIN SELECT RAISE(ABORT,'deposit_v2_activation_seam'); END;

DROP TRIGGER IF EXISTS trg_dep_v2_ledger_guard;
CREATE TRIGGER trg_dep_v2_ledger_guard
BEFORE INSERT ON deposit_ledger
WHEN NEW.kind IN
  ('topup','pay','pay_reserve','pay_release','pay_return','refund','adjust')
AND (
  COALESCE((SELECT value FROM settings WHERE key='economic_deposit_contract_v2'),'')
    !='earned-v2:on'
  OR NEW.v2_op_id IS NULL
  OR NOT EXISTS(
    SELECT 1 FROM deposit_v2_ops op WHERE op.id=NEW.v2_op_id
    AND op.user_id=NEW.user_id AND (
      (NEW.kind='topup' AND op.kind='activate' AND op.state='prepared'
        AND op.deposit_id=NEW.deposit_id AND op.amount=NEW.delta) OR
      (NEW.kind='pay_reserve' AND op.kind='pay' AND op.state='reserved'
        AND op.order_id=NEW.order_id AND op.amount=-NEW.delta) OR
      (NEW.kind='pay_release' AND op.kind='pay'
        AND op.state IN ('reserved','confirming')
        AND op.order_id=NEW.order_id AND op.amount=NEW.delta) OR
      (NEW.kind='pay_return' AND op.kind='pay'
        AND op.state IN ('money_settled','effects_applied')
        AND op.order_id=NEW.order_id
        AND NEW.delta>0 AND NEW.delta<=op.amount) OR
      (NEW.kind='refund' AND op.kind='refund' AND op.state='reserved'
        AND op.deposit_id=NEW.deposit_id AND op.amount=-NEW.delta)
    )
  )
)
BEGIN SELECT RAISE(ABORT,'deposit_v2_ledger_seam'); END;

DROP TRIGGER IF EXISTS trg_dep_v2_pay_settle_guard;
CREATE TRIGGER trg_dep_v2_pay_settle_guard
BEFORE UPDATE OF user_id,delta,kind,deposit_id,order_id,v2_op_id ON deposit_ledger
WHEN OLD.v2_op_id IS NOT NULL AND NOT (
  (OLD.kind='pay_reserve' AND NEW.kind='pay'
    AND NEW.user_id=OLD.user_id AND NEW.delta=OLD.delta
    AND NEW.deposit_id IS OLD.deposit_id
    AND NEW.order_id IS OLD.order_id AND NEW.v2_op_id=OLD.v2_op_id
    AND EXISTS(
      SELECT 1 FROM deposit_v2_ops op
      WHERE op.id=OLD.v2_op_id AND op.kind='pay' AND op.state='money_settled'
        AND op.user_id=OLD.user_id AND op.order_id=OLD.order_id
        AND op.amount=-OLD.delta))
  OR
  (OLD.kind='pay_return' AND NEW.kind='pay_return'
    AND NEW.user_id=OLD.user_id AND NEW.deposit_id IS OLD.deposit_id
    AND NEW.order_id IS OLD.order_id AND NEW.v2_op_id=OLD.v2_op_id
    AND NEW.delta>=OLD.delta
    AND EXISTS(
      SELECT 1 FROM deposit_v2_ops op
      WHERE op.id=OLD.v2_op_id AND op.kind='pay'
        AND op.state IN ('money_settled','effects_applied')
        AND op.user_id=OLD.user_id AND op.order_id=OLD.order_id
        AND NEW.delta<=op.amount))
)
BEGIN SELECT RAISE(ABORT,'deposit_v2_pay_settlement_seam'); END;

DROP TRIGGER IF EXISTS trg_dep_v2_ledger_delete_guard;
CREATE TRIGGER trg_dep_v2_ledger_delete_guard
BEFORE DELETE ON deposit_ledger
WHEN OLD.v2_op_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'deposit_v2_ledger_immutable'); END;

DROP TRIGGER IF EXISTS trg_dep_v2_bonus_guard;
CREATE TRIGGER trg_dep_v2_bonus_guard
BEFORE INSERT ON bonus_ledger
WHEN NEW.delta>0 AND NEW.kind IN
  ('deposit','deposit_legacy','deposit_v2_base','deposit_v2') AND (
  COALESCE((SELECT value FROM settings WHERE key='economic_deposit_contract_v2'),'')
    !='earned-v2:on'
  OR NEW.kind='deposit'
  OR (NEW.kind='deposit_legacy' AND (
    NEW.v2_op_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM deposit_v2_ops op JOIN deposit_v2_lots l
        ON l.deposit_id=op.deposit_id
      WHERE op.id=NEW.v2_op_id AND op.kind='activate' AND op.state='prepared'
        AND op.user_id=NEW.user_id AND op.deposit_id=NEW.deposit_id
        AND l.contract_version='legacy-v1'
        AND NEW.delta=(SELECT d.bonus_amount FROM deposits d
          WHERE d.id=op.deposit_id))))
  OR (NEW.kind='deposit_v2_base' AND (
    NEW.v2_claim_id IS NULL OR NEW.deposit_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM deposit_v2_allocations a
      JOIN deposit_v2_ops op ON op.id=a.op_id
      JOIN deposit_v2_reward_claims c ON c.order_id=op.order_id
      WHERE c.id=NEW.v2_claim_id AND c.user_id=NEW.user_id
        AND c.order_id=NEW.order_id AND c.state IN ('held','no_uplift')
        AND a.deposit_id=NEW.deposit_id AND a.reward_state='counted'
        AND a.base_ledger_id IS NULL
        AND a.entitlement_delta-a.uplift_delta=NEW.delta)))
  OR (NEW.kind='deposit_v2' AND (
    NEW.v2_claim_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM deposit_v2_allocations a
      JOIN deposit_v2_ops op ON op.id=a.op_id
      JOIN deposit_v2_reward_claims c ON c.order_id=op.order_id
      WHERE c.id=NEW.v2_claim_id AND c.state='held'
        AND c.user_id=NEW.user_id AND c.order_id=NEW.order_id
        AND a.deposit_id=NEW.deposit_id AND a.reward_state='counted'
        AND a.uplift_ledger_id IS NULL AND a.uplift_delta=NEW.delta)))
)
BEGIN SELECT RAISE(ABORT,'deposit_v2_bonus_seam'); END;

DROP TRIGGER IF EXISTS trg_dep_v2_refund_close_guard;
CREATE TRIGGER trg_dep_v2_refund_close_guard
BEFORE UPDATE OF status ON deposits
WHEN OLD.status IN ('active','pending') AND NEW.status='refunded' AND NOT EXISTS(
  SELECT 1 FROM deposit_v2_lots l JOIN deposit_v2_ops op
    ON op.deposit_id=l.deposit_id AND op.kind='refund'
  WHERE l.deposit_id=NEW.id AND l.state='closed'
    AND l.principal_available=0 AND l.principal_pay_reserved=0
    AND l.principal_refund_reserved=0
    AND l.principal_funded=l.principal_consumed+l.principal_refunded
    AND op.state='applied' AND op.user_id=NEW.user_id
    AND op.amount=l.principal_refunded)
BEGIN SELECT RAISE(ABORT,'deposit_v2_refund_seam'); END;

DROP TRIGGER IF EXISTS trg_dep_v2_order_refund_insert_guard;
CREATE TRIGGER trg_dep_v2_order_refund_insert_guard
BEFORE INSERT ON economic_order_reward_refunds
WHEN NOT (
  NEW.deposit_paid_total<=NEW.paid_total
  AND NEW.refunded_total<=NEW.paid_total
  AND NEW.refunded_deposit<=NEW.deposit_paid_total
  AND NEW.refunded_deposit<=NEW.refunded_total
  AND NEW.refunded_total-NEW.refunded_deposit<=
      NEW.paid_total-NEW.deposit_paid_total
  AND NEW.refunded_bonus<=NEW.bonus_spent_total
  AND ((NEW.complete=1 AND NEW.refunded_total=NEW.paid_total)
       OR (NEW.complete=0 AND NEW.refunded_total<NEW.paid_total))
)
BEGIN SELECT RAISE(ABORT,'economic_order_refund_invariant'); END;

DROP TRIGGER IF EXISTS trg_dep_v2_order_refund_update_guard;
CREATE TRIGGER trg_dep_v2_order_refund_update_guard
BEFORE UPDATE ON economic_order_reward_refunds
WHEN NOT (
  NEW.deposit_paid_total<=NEW.paid_total
  AND NEW.refunded_total<=NEW.paid_total
  AND NEW.refunded_deposit<=NEW.deposit_paid_total
  AND NEW.refunded_deposit<=NEW.refunded_total
  AND NEW.refunded_total-NEW.refunded_deposit<=
      NEW.paid_total-NEW.deposit_paid_total
  AND NEW.refunded_bonus<=NEW.bonus_spent_total
  AND ((NEW.complete=1 AND NEW.refunded_total=NEW.paid_total)
       OR (NEW.complete=0 AND NEW.refunded_total<NEW.paid_total))
)
BEGIN SELECT RAISE(ABORT,'economic_order_refund_invariant'); END;

DROP TRIGGER IF EXISTS trg_dep_v2_bonus_spend_tombstone_guard;
CREATE TRIGGER trg_dep_v2_bonus_spend_tombstone_guard
BEFORE UPDATE OF bonus_spent ON orders
WHEN COALESCE(NEW.bonus_spent,0)>COALESCE(OLD.bonus_spent,0)
  AND EXISTS(
    SELECT 1 FROM economic_order_reward_refunds r
    WHERE r.order_id=NEW.id AND r.complete=1
  )
BEGIN SELECT RAISE(ABORT,'economic_order_reward_tombstone'); END;
'''


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def _ensure_column(conn: sqlite3.Connection, table: str,
                   name: str, declaration: str) -> None:
    if name not in _table_columns(conn, table):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {declaration}")


def _setting(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO settings(key,value) VALUES(?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))


def _execute_sql_script(conn: sqlite3.Connection, script: str) -> None:
    """Execute a complete SQLite script without executescript's implicit COMMIT."""
    statement = ""
    for line in script.splitlines():
        statement += line + "\n"
        if sqlite3.complete_statement(statement):
            sql = statement.strip()
            if sql:
                conn.execute(sql)
            statement = ""
    if statement.strip():
        raise RuntimeError("incomplete SQLite migration statement")


def _expected_trigger_fingerprints() -> dict[str, str]:
    """Build the exact sqlite_master representation from the embedded guards."""
    conn = sqlite3.connect(":memory:")
    try:
        conn.executescript(
            "CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);"
            "CREATE TABLE deposits(id INTEGER PRIMARY KEY,user_id INTEGER,"
            "amount INTEGER,bonus_pct INTEGER,status TEXT);"
            "CREATE TABLE deposit_ledger(user_id INTEGER,delta INTEGER,kind TEXT,"
            "deposit_id INTEGER,order_id INTEGER,v2_op_id INTEGER);"
            "CREATE TABLE bonus_ledger(user_id INTEGER,delta INTEGER,kind TEXT,"
            "deposit_id INTEGER,order_id INTEGER,v2_op_id INTEGER,"
            "v2_claim_id INTEGER);"
            "CREATE TABLE orders(id INTEGER PRIMARY KEY,bonus_spent INTEGER);"
        )
        _execute_sql_script(conn, SCHEMA_SQL)
        _execute_sql_script(conn, TRIGGERS_SQL)
        return {
            str(name): sha256_text(str(sql))
            for name, sql in conn.execute(
                "SELECT name,sql FROM sqlite_master WHERE type='trigger' "
                "AND name LIKE 'trg_dep_v2_%' ORDER BY name"
            )
        }
    finally:
        conn.close()


def preflight_database(conn: sqlite3.Connection) -> dict:
    required = {"settings", "deposits", "deposit_ledger", "bonus_ledger",
                "users", "orders", "payments"}
    tables = {row[0] for row in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    missing = sorted(required - tables)
    if missing:
        raise RuntimeError(f"database tables missing: {','.join(missing)}")
    active = conn.execute(
        "SELECT COUNT(*) FROM deposits d LEFT JOIN deposit_v2_lots l "
        "ON l.deposit_id=d.id WHERE d.status='active' AND l.deposit_id IS NULL"
        if "deposit_v2_lots" in tables else
        "SELECT COUNT(*) FROM deposits WHERE status='active'"
    ).fetchone()[0]
    if active:
        raise RuntimeError(
            f"{active} active legacy deposit(s) require explicit lot reconciliation")
    return {"active_legacy": active}


def _backfill_legacy_pending(conn: sqlite3.Connection, now: str) -> int:
    has_receipts = "payment_receipts" in {
        row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
    inserted = 0
    for dep in conn.execute(
        "SELECT * FROM deposits WHERE status='pending' ORDER BY id"
    ).fetchall():
        if conn.execute(
            "SELECT 1 FROM deposit_v2_lots WHERE deposit_id=?", (dep["id"],)
        ).fetchone():
            continue
        state = "legacy_manual_pending"
        if has_receipts:
            receipt = conn.execute(
                "SELECT provider,inv_id,payment_status FROM payment_receipts "
                "WHERE provider='robokassa' AND inv_id=?",
                (DEP_INV_OFFSET + int(dep["id"]),),
            ).fetchone()
            if receipt:
                state = (
                    "paid_hold"
                    if receipt["payment_status"] in ("paid", "paid_unallocated")
                    else "invoice_pending"
                )
        conn.execute(
            "INSERT INTO deposit_v2_lots(deposit_id,user_id,contract_version,"
            "principal_total,bonus_rate_bp,state,created_at,updated_at) "
            "VALUES(?,?,?,?,?,?,?,?)",
            (dep["id"], dep["user_id"], LEGACY_VERSION, dep["amount"],
             int(dep["bonus_pct"] or 0) * 100, state,
             dep["created_at"] or now, now),
        )
        if state == "paid_hold" and receipt:
            conn.execute(
                "INSERT OR IGNORE INTO deposit_v2_ops(op_key,kind,state,deposit_id,"
                "user_id,provider,external_id,amount,error,created_at,updated_at) "
                "VALUES(?, 'activate','paid_hold',?,?,?,?,?,?,?,?)",
                (f"activate:{dep['id']}", dep["id"], dep["user_id"],
                 receipt["provider"], str(receipt["inv_id"]), dep["amount"],
                 "legacy_receipt_backfill", dep["created_at"] or now, now),
            )
        inserted += 1
    return inserted


def _backfill_referral_reviews(conn: sqlite3.Connection, now: str) -> int:
    order_cols = _table_columns(conn, "orders")
    needed = {"price", "bonus_spent", "sub_discount", "promo_discount", "gift_amount"}
    if not needed.issubset(order_cols):
        return 0
    eligible_order = ""
    if "deleted" in order_cols:
        eligible_order += " AND COALESCE(o2.deleted,0)=0"
    if "work_type" in order_cols:
        eligible_order += " AND COALESCE(o2.work_type,'') NOT LIKE 'sub\\_%' ESCAPE '\\'"
    before = conn.total_changes
    conn.execute(
        "INSERT OR IGNORE INTO referral_v2_obligations("
        "invitee_user_id,inviter_user_id,source_order_id,amount,state,"
        "program_version,reason,created_at,updated_at) "
        "SELECT u.id,u.referrer_id,o.id,200,'needs_review',?,"
        "'legacy_paid_candidate',?,? FROM users u JOIN orders o ON o.id=("
        " SELECT o2.id FROM orders o2 WHERE o2.user_id=u.id "
        + eligible_order +
        " AND COALESCE(o2.price,0)>0 AND ("
        "   SELECT COALESCE(SUM(p.amount),0) FROM payments p "
        "   WHERE p.order_id=o2.id AND p.status='paid'"
        " )>=MAX(COALESCE(o2.price,0)-COALESCE(o2.bonus_spent,0)-"
        " COALESCE(o2.sub_discount,0)-COALESCE(o2.promo_discount,0)-"
        " COALESCE(o2.gift_amount,0),0) ORDER BY o2.id LIMIT 1"
        ") WHERE u.referrer_id IS NOT NULL AND u.referrer_id!=u.id",
        (REFERRAL_VERSION, now, now),
    )
    return conn.total_changes - before


def install_database_v2(db_path: Path) -> dict:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    conn = sqlite3.connect(db_path, timeout=15)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=15000")
        preflight_database(conn)
        conn.execute("BEGIN IMMEDIATE")
        _setting(conn, DEPOSIT_SETTING, MIGRATING_VALUE)
        _setting(conn, DEPOSIT_ISSUANCE_SETTING, MIGRATING_VALUE)
        _setting(conn, REFERRAL_SETTING, MIGRATING_VALUE)
        _execute_sql_script(conn, SCHEMA_SQL)
        _ensure_column(conn, "deposit_ledger", "v2_op_id", "INTEGER")
        _ensure_column(conn, "bonus_ledger", "v2_op_id", "INTEGER")
        _ensure_column(conn, "bonus_ledger", "v2_claim_id", "INTEGER")
        _ensure_column(conn, "bonus_ledger", "deposit_id", "INTEGER")
        _ensure_column(conn, "deposit_v2_lots", "bonus_entitlement_awarded",
                       "INTEGER NOT NULL DEFAULT 0 CHECK(bonus_entitlement_awarded>=0)")
        _ensure_column(conn, "deposit_v2_allocations", "principal_net",
                       "INTEGER NOT NULL DEFAULT 0 CHECK(principal_net>=0)")
        _ensure_column(conn, "deposit_v2_allocations", "cashback_candidate",
                       "INTEGER NOT NULL DEFAULT 0 CHECK(cashback_candidate>=0)")
        _ensure_column(conn, "deposit_v2_allocations", "entitlement_delta",
                       "INTEGER NOT NULL DEFAULT 0 CHECK(entitlement_delta>=0)")
        _ensure_column(conn, "deposit_v2_allocations", "uplift_delta",
                       "INTEGER NOT NULL DEFAULT 0 CHECK(uplift_delta>=0)")
        _ensure_column(conn, "deposit_v2_allocations", "reward_state",
                       "TEXT NOT NULL DEFAULT 'pending'")
        _ensure_column(conn, "deposit_v2_allocations", "base_ledger_id", "INTEGER")
        _ensure_column(conn, "deposit_v2_allocations", "uplift_ledger_id", "INTEGER")
        _ensure_column(conn, "economic_order_reward_refunds", "bonus_spent_total",
                       "INTEGER NOT NULL DEFAULT 0 CHECK(bonus_spent_total>=0)")
        _ensure_column(conn, "economic_order_reward_refunds", "refunded_bonus",
                       "INTEGER NOT NULL DEFAULT 0 CHECK(refunded_bonus>=0)")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_dep_ledger_v2_kind "
            "ON deposit_ledger(v2_op_id,kind) WHERE v2_op_id IS NOT NULL")
        conn.execute("DROP INDEX IF EXISTS idx_bonus_v2_claim_kind")
        conn.execute(
            "CREATE UNIQUE INDEX idx_bonus_v2_claim_kind "
            "ON bonus_ledger(v2_claim_id,kind,COALESCE(deposit_id,0)) "
            "WHERE v2_claim_id IS NOT NULL")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_bonus_v2_op_kind "
            "ON bonus_ledger(v2_op_id,kind) WHERE v2_op_id IS NOT NULL")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_dep_v2_alloc_base_ledger "
            "ON deposit_v2_allocations(base_ledger_id) "
            "WHERE base_ledger_id IS NOT NULL")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_dep_v2_alloc_uplift_ledger "
            "ON deposit_v2_allocations(uplift_ledger_id) "
            "WHERE uplift_ledger_id IS NOT NULL")
        legacy = _backfill_legacy_pending(conn, now)
        referrals = _backfill_referral_reviews(conn, now)
        _execute_sql_script(conn, TRIGGERS_SQL)
        conn.commit()
        result = check_database_v2(db_path, require_enabled=False)
        result.update({"legacy_pending": legacy, "referral_reviews": referrals})
        return result
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def set_database_state(db_path: Path, *, enabled: bool) -> dict:
    conn = sqlite3.connect(db_path, timeout=15)
    try:
        conn.execute("BEGIN IMMEDIATE")
        _setting(conn, DEPOSIT_SETTING, DEPOSIT_ON)
        _setting(conn, DEPOSIT_ISSUANCE_SETTING,
                 DEPOSIT_ISSUANCE_ON if enabled else DEPOSIT_ISSUANCE_OFF)
        _setting(conn, REFERRAL_SETTING,
                 REFERRAL_ON if enabled else REFERRAL_REVIEW)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return check_database_v2(db_path, require_enabled=enabled)


def check_database_v2(db_path: Path, *, require_enabled: bool = True) -> dict:
    conn = sqlite3.connect(db_path, timeout=15)
    conn.row_factory = sqlite3.Row
    try:
        quick = conn.execute("PRAGMA quick_check").fetchone()[0]
        tables = {row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        required = {"deposit_v2_lots", "deposit_v2_ops",
                    "deposit_v2_allocations", "deposit_v2_reward_claims",
                    "referral_v2_obligations", "economic_bonus_debts",
                    "economic_reward_reversals",
                    "economic_lot_reward_adjustments",
                    "economic_order_reward_refunds"}
        missing = sorted(required - tables)
        trigger_sql = {
            str(row[0]): sha256_text(str(row[1]))
            for row in conn.execute(
                "SELECT name,sql FROM sqlite_master WHERE type='trigger' "
                "AND name LIKE 'trg_dep_v2_%'"
            )
        }
        expected_triggers = _expected_trigger_fingerprints()
        trigger_missing = sorted(expected_triggers.keys() - trigger_sql.keys())
        trigger_unexpected = sorted(trigger_sql.keys() - expected_triggers.keys())
        trigger_tampered = sorted(
            name for name in expected_triggers.keys() & trigger_sql.keys()
            if expected_triggers[name] != trigger_sql[name]
        )
        bad_lots = conn.execute(
            "SELECT COUNT(*) FROM deposit_v2_lots WHERE "
            "principal_funded!=principal_available+principal_pay_reserved+"
            "principal_refund_reserved+principal_consumed+principal_refunded "
            "OR MIN(principal_funded,principal_available,principal_pay_reserved,"
            "principal_refund_reserved,principal_consumed,principal_refunded)<0"
        ).fetchone()[0] if not missing else -1
        bad_allocations = conn.execute(
            "SELECT COUNT(*) FROM deposit_v2_allocations WHERE "
            "principal_net<0 OR principal_net>principal_amount "
            "OR uplift_delta<0 OR uplift_delta>entitlement_delta "
            "OR reward_state NOT IN ('pending','counted','reversed') "
            "OR (reward_state='pending' AND (principal_net!=0 "
            "OR cashback_candidate!=0 OR entitlement_delta!=0 "
            "OR uplift_delta!=0 OR base_ledger_id IS NOT NULL "
            "OR uplift_ledger_id IS NOT NULL)) "
            "OR (reward_state='reversed' AND (principal_net!=0 "
            "OR cashback_candidate!=0))"
        ).fetchone()[0] if not missing else -1
        bad_refunds = conn.execute(
            "SELECT COUNT(*) FROM economic_order_reward_refunds r WHERE "
            "r.refunded_total>r.paid_total "
            "OR r.refunded_deposit>r.deposit_paid_total "
            "OR r.refunded_deposit>r.refunded_total "
            "OR r.refunded_bonus>r.bonus_spent_total "
            "OR r.refunded_total-r.refunded_deposit>"
            "r.paid_total-r.deposit_paid_total "
            "OR (r.complete=1 AND r.refunded_total!=r.paid_total) "
            "OR (r.complete=0 AND r.refunded_total>=r.paid_total) "
            "OR EXISTS(SELECT 1 FROM deposit_v2_reward_claims c "
            "WHERE c.order_id=r.order_id AND "
            "(c.paid_total!=r.paid_total "
            "OR c.refunded_total!=r.refunded_total "
            "OR c.refunded_deposit!=r.refunded_deposit))"
        ).fetchone()[0] if not missing else -1
        bad_rewards = 0
        if not missing:
            for lot in conn.execute(
                "SELECT l.deposit_id,l.bonus_rate_bp,l.bonus_entitlement_awarded,"
                "COALESCE(SUM(CASE WHEN a.reward_state='counted' "
                "THEN a.principal_net ELSE 0 END),0) principal_net,"
                "COALESCE(SUM(CASE WHEN a.reward_state='counted' "
                "THEN a.cashback_candidate ELSE 0 END),0) cashback_candidate "
                "FROM deposit_v2_lots l LEFT JOIN deposit_v2_allocations a "
                "ON a.deposit_id=l.deposit_id GROUP BY l.deposit_id"
            ):
                expected = max(
                    gross_vest_delta(
                        0, int(lot["principal_net"] or 0),
                        int(lot["bonus_rate_bp"] or 0),
                    ),
                    int(lot["cashback_candidate"] or 0),
                )
                if int(lot["bonus_entitlement_awarded"] or 0) != expected:
                    bad_rewards += 1
        settings = dict(conn.execute(
            "SELECT key,value FROM settings WHERE key IN (?,?,?)",
            (DEPOSIT_SETTING, DEPOSIT_ISSUANCE_SETTING, REFERRAL_SETTING),
        ).fetchall())
        enabled_ok = (
            settings.get(DEPOSIT_SETTING) == DEPOSIT_ON
            and settings.get(DEPOSIT_ISSUANCE_SETTING) == DEPOSIT_ISSUANCE_ON
            and settings.get(REFERRAL_SETTING) == REFERRAL_ON
        ) if require_enabled else (
            settings.get(DEPOSIT_SETTING) in (DEPOSIT_ON, MIGRATING_VALUE)
            and settings.get(DEPOSIT_ISSUANCE_SETTING) in (
                DEPOSIT_ISSUANCE_ON, DEPOSIT_ISSUANCE_OFF, MIGRATING_VALUE)
            and settings.get(REFERRAL_SETTING) in (
                REFERRAL_ON, REFERRAL_REVIEW, MIGRATING_VALUE)
        )
        ok = (
            quick == "ok" and not missing and not trigger_missing
            and not trigger_unexpected and not trigger_tampered
            and bad_lots == 0 and bad_allocations == 0
            and bad_rewards == 0 and bad_refunds == 0 and enabled_ok
        )
        return {"ok": ok, "quick_check": quick, "missing_tables": missing,
                "trigger_count": len(trigger_sql),
                "trigger_missing": trigger_missing,
                "trigger_unexpected": trigger_unexpected,
                "trigger_tampered": trigger_tampered,
                "bad_lots": bad_lots, "bad_allocations": bad_allocations,
                "bad_rewards": bad_rewards, "bad_refunds": bad_refunds,
                "settings": settings}
    finally:
        conn.close()


def _compile_sources(sources: dict[str, str]) -> None:
    for name, text in sources.items():
        ast.parse(text, filename=name)


def patched_sources(root: Path) -> dict[str, str]:
    out = {}
    for name, path in source_paths(root).items():
        out[name] = PATCHERS[name](path.read_text(encoding="utf-8"))
    out["economic_v2"] = runtime_source()
    _compile_sources(out)
    return out


def validated_patched_sources(root: Path) -> dict[str, str]:
    generated = patched_sources(root)
    expected = {name: sha256_text(generated[name]) for name in KNOWN_AFTER}
    if expected != KNOWN_AFTER \
            or sha256_text(generated["economic_v2"]) != RUNTIME_AFTER:
        raise RuntimeError("generated post-image hashes do not match pinned release")
    return generated


def source_state(root: Path) -> tuple[str, dict[str, str]]:
    paths = source_paths(root)
    hashes = {name: sha256(path) for name, path in paths.items()}
    runtime = root / "services" / "economic_v2.py"
    runtime_hash = sha256(runtime) if runtime.exists() else ""
    if hashes == KNOWN_BEFORE and not runtime_hash:
        return "before", {**hashes, "economic_v2": ""}
    if (all(KNOWN_AFTER.values()) and hashes == KNOWN_AFTER
            and runtime_hash == RUNTIME_AFTER):
        return "after", {**hashes, "economic_v2": runtime_hash}
    raise RuntimeError(
        "unknown or partial source set: "
        + json.dumps({**hashes, "economic_v2": runtime_hash}, sort_keys=True))


def _atomic_text(path: Path, text: str) -> None:
    tmp = path.with_name(f".{path.name}.economic-v2-{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def install_sources(root: Path, backup_root: Path) -> dict:
    state, before_hashes = source_state(root)
    if state == "after":
        return {"state": "after", "hashes": before_hashes, "backup": None}
    generated = validated_patched_sources(root)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = backup_root / f"economic-v2-{stamp}"
    backup.mkdir(parents=True, exist_ok=False)
    for name, path in source_paths(root).items():
        shutil.copy2(path, backup / f"{name}.py")
    (backup / "manifest.json").write_text(json.dumps(
        {"before": before_hashes, "after": {**KNOWN_AFTER,
         "economic_v2": RUNTIME_AFTER}, "rollback": "close new issuance; keep "
         "the V2 service adapter until every lot, hold and claim is settled; "
         "never restore SQLite"}, ensure_ascii=False, indent=2, sort_keys=True
    ) + "\n", encoding="utf-8")
    for name, path in source_paths(root).items():
        _atomic_text(path, generated[name])
    _atomic_text(root / "services" / "economic_v2.py", generated["economic_v2"])
    final_state, final_hashes = source_state(root)
    if final_state != "after":
        raise RuntimeError("source post-image verification failed")
    return {"state": final_state, "hashes": final_hashes, "backup": str(backup)}


def apply(root: Path, db_path: Path, backup_root: Path) -> dict:
    # Unknown source stops before the database enters migrating mode.
    state, _hashes = source_state(root)
    if state == "before":
        # Compile and hash every exact post-image before mutating SQLite.
        validated_patched_sources(root)
    database = install_database_v2(db_path)
    sources = install_sources(root, backup_root)
    enabled = set_database_state(db_path, enabled=True)
    if not enabled["ok"]:
        raise RuntimeError("V2 enable check failed")
    return {"ok": True, "database": database, "sources": sources,
            "enabled": enabled}


def check(root: Path, db_path: Path) -> dict:
    state, hashes = source_state(root)
    database = check_database_v2(db_path, require_enabled=True)
    return {"ok": state == "after" and database["ok"],
            "source_state": state, "hashes": hashes, "database": database}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--disable", action="store_true")
    parser.add_argument("--root", type=Path, default=Path("/root/salon_bot/app"))
    parser.add_argument("--db", type=Path, default=Path("/root/salon_bot/salon.db"))
    parser.add_argument("--backup-root", type=Path,
                        default=Path("/root/salon_bot/backups"))
    args = parser.parse_args()
    if args.apply:
        result = apply(args.root, args.db, args.backup_root)
    elif args.check:
        result = check(args.root, args.db)
    else:
        result = set_database_state(args.db, enabled=False)
        result["rollback"] = (
            "new top-ups and referral grants closed; existing principal, "
            "paid_hold and earned rewards remain serviceable; SQLite was not restored"
        )
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
