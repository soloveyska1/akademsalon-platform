"""Оплата заказов: суммы этапов, ручное подтверждение, онлайн-провайдеры.

Режимы переключаются наличием ключей в .env (config.pay_provider()):
— ручной (по умолчанию): клиент видит реквизиты, жмёт «Я оплатил(а)»,
  мастер подтверждает одной кнопкой — статус двигается сам, бонусы
  начисляются сами;
— Robokassa (ROBOKASSA_LOGIN + ROBOKASSA_PASS1/2): платёжная ссылка
  с MD5-подписью, ResultURL /api/pay/robokassa подтверждает платёж;
  с «Робочеками СМЗ» чек НПД уходит в налоговую сам;
— ЮKassa (YOOKASSA_SHOP_ID + YOOKASSA_SECRET): исторический вариант,
  оставлен на случай подключения. Чек — в приложении «Мой налог».
"""
from __future__ import annotations

import hashlib
import json
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from urllib.parse import quote, urlencode

import aiohttp
from aiogram import Bot

from .. import config, db, texts
from .. import keyboards as kb
from . import bonus, mailer, notify

log = logging.getLogger(__name__)

YK_API = "https://api.yookassa.ru/v3"


# --------------------------------------------------------------- суммы

def money_due(o) -> dict:
    """Сколько платить деньгами: бонусы, скидка «Салон+», промокод, сертификат.

    Скидки уменьшают итог; предоплата пересчитывается пропорционально,
    чтобы выгода честно распределилась по этапам. Подписка и промокод
    вместе не встречаются (при цене остаётся бо́льшая из двух).
    Подарочный сертификат — средство платежа: вычитается ПОСЛЕДНИМ, после
    всех скидок и бонусов, поэтому кэшбэк/рефералка (считаются от денег)
    с сертификатной части не начисляются сами собой.
    """
    price = o["price"] or 0
    spent = o["bonus_spent"] or 0
    sub_disc = _row_int(o, "sub_discount")
    promo_disc = _row_int(o, "promo_discount")
    gift = _row_int(o, "gift_amount")
    due_total = max(price - spent - sub_disc - promo_disc - gift, 0)
    prepay = o["prepay"] or price
    if price > 0:
        prepay_due = round(prepay * due_total / price)
    else:
        prepay_due = 0
    return {"price": price, "bonus_spent": spent, "sub_discount": sub_disc,
            "promo_discount": promo_disc, "gift_amount": gift,
            "due_total": due_total,
            "prepay_due": prepay_due, "rest_due": due_total - prepay_due}


# план оплат по этапам: подписи привязаны к частям сдачи, чтобы клиент
# всегда понимал, ЗА ЧТО платит («оплата части 2», а не безликий «этап»)
PLAN_LABELS = {  # фолбэк для мест без контекста заказа
    "prepay": "Стартовый платёж",
    "stage2": "Оплата части 2",
    "rest": "Финальный платёж",
}


def kind_stage(o, kind: str) -> int:
    """Какой части сдачи соответствует платёж kind (1-based)."""
    if (o["stages_total"] or 0) == 1:
        return 1  # единственный платёж покрывает единственную выдачу
    if (o["stages_total"] or 0) == 3:
        return {"prepay": 1, "stage2": 2, "rest": 3}.get(kind, 1)
    return {"prepay": 1, "rest": 2}.get(kind, 1)


def stage_label(o, kind: str) -> str:
    """Человеческая подпись платежа для этого заказа."""
    total = o["stages_total"] or 0
    if total == 1:
        return "Оплата целиком"
    if total == 3:
        return {"prepay": "Оплата части 1 — старт",
                "stage2": "Оплата части 2",
                "rest": "Оплата части 3 — финал"}.get(kind, "Оплата этапа")
    if total == 2:
        return {"prepay": "Оплата части 1 — старт",
                "rest": "Оплата части 2 — финал"}.get(kind, "Оплата этапа")
    return {"prepay": "Предоплата", "rest": "Остаток"}.get(kind, "Оплата")


def planned_label(o, kind: str, plan: list[dict]) -> str:
    """Подпись платежа с учётом фактического плана (сжатый план — без «части N»)."""
    for p in plan:
        if p["kind"] == kind:
            return p["label"]
    return stage_label(o, kind)


def default_stages(work_type: str | None) -> int:  # noqa: ARG001 — тип оставлен под будущие правила
    """По умолчанию всегда 2 части (50/50) — решение владельца 2026-07-15.

    «30/40/30» (3 части) мастер включает вручную кнопками плана в карточке
    заказа (до цены или после, пока работа не началась)."""
    return 2


def default_prepay(price: int, stages_total: int | None) -> int:
    if stages_total == 1:
        return price  # одна выдача = один платёж целиком, половинить нечего
    share = 0.3 if stages_total == 3 else 0.5
    return int(round(price * share, -2))


def stage_plan(o) -> list[dict]:
    """[{kind, label, amount, share}] — все платежи заказа с учётом бонусов.

    3 части → 30/40/30, иначе (2 части и старые заказы) → предоплата+остаток.
    Нулевые этапы не показываются: у копеечных цен (тестовый заказ за 1 ₽,
    остаток, съеденный бонусами) 30% округляется в 0 — такой «этап» ломал
    кабинет («реквизиты ниже» без реквизитов) и бот («платить нечего» при
    реальном долге). Сумма оставшихся этапов всегда равна due_total.
    """
    d = money_due(o)
    total = d["due_total"]
    if not o["price"] or total <= 0:
        return []
    if (o["stages_total"] or 0) == 1:
        # «одним платежом»: ровно один этап на всю сумму, независимо от того,
        # какой prepay остался в заказе от прежнего плана — иначе смена плана
        # 2→1 рисовала бы «Предоплата + Остаток» при честной единице в БД
        return [{"kind": "prepay", "label": stage_label(o, "prepay"),
                 "amount": total, "share": 100}]
    if (o["stages_total"] or 0) == 3:
        a1 = int(round(total * 0.30))
        a2 = int(round(total * 0.40))
        raw = [("prepay", a1, 30), ("stage2", a2, 40), ("rest", total - a1 - a2, 30)]
    else:
        prepay = min(d["prepay_due"], total)
        share = round(prepay * 100 / total) if total else 50
        raw = [("prepay", prepay, share), ("rest", total - prepay, 100 - share)]
    plan = [{"kind": kind, "label": stage_label(o, kind), "amount": amt, "share": share}
            for kind, amt, share in raw if amt > 0]
    if len(plan) == 1 and (o["stages_total"] or 1) > 1:
        plan[0]["label"] = "Оплата целиком"  # план сжался — «часть 3» смутит
    return plan


def payable_upto(o) -> int:
    """До какого этапа оплата «созрела». Правило «сначала оплата — потом файл»:

    — первый платёж созревает сразу после цены;
    — платёж N ≥ 2 — когда мастер объявил часть N готовой (счёт выставлен,
      файл придержан) ЛИБО уже передал её на проверку (доверил без счёта);
    — «Финал готов» и завершённый заказ открывают все этапы.

    Во время работы над частью ничего не «созревает» — клиент не видит
    преждевременных кнопок «оплатить».
    """
    if o["status"] == "done" or _final_ready(o):
        return 99
    total = o["stages_total"] or 1
    upto = 1
    if o["status"] in ("check", "fix"):
        upto = max(upto, min(o["stage"] or 1, total))
    # принятые части созревают НАВСЕГДА: мастер передал часть, доверившись,
    # клиент принял её без оплаты — этап обязан остаться «к оплате», иначе
    # кнопки оплаты исчезали у клиента, а у мастера — подтверждение
    upto = max(upto, min(_row_int(o, "parts_done"), total))
    announced = _row_int(o, "part_ready")
    if announced:
        upto = max(upto, min(announced, total))
    if not o["stages_total"] and o["status"] in ("check", "fix"):
        upto = 2  # старый формат без плана: остаток созревает при выдаче
    return upto


def _final_ready(o) -> bool:
    return bool(_row_int(o, "final_ready"))


def _row_int(o, key: str) -> int:
    try:
        return int(o[key] or 0)
    except (KeyError, IndexError, TypeError, ValueError):
        return 0


def plan_state(o, payments) -> list[dict]:
    """План + факт: каждому этапу — статус paid|claimed|due|later."""
    paid_kinds = {p["kind"] for p in payments if p["status"] == "paid"}
    claimed_kinds = {p["kind"] for p in payments if p["status"] == "claimed"}
    upto = payable_upto(o)
    out = []
    for i, s in enumerate(stage_plan(o), start=1):
        if s["kind"] in paid_kinds:
            st = "paid"
        elif s["kind"] in claimed_kinds:
            st = "claimed"
        elif i <= upto:
            st = "due"
        else:
            st = "later"
        out.append({**s, "n": i, "state": st})
    return out


def due_now(o, payments) -> tuple[str, int]:
    """Ближайший созревший НЕоплаченный этап без отметки клиента: (kind, сумма).

    (kind, 0) — платить нечего. Этап с отметкой «я оплатил» (claimed) сюда
    не попадает: клиенту не предлагают оплатить то, что уже на сверке.
    """
    plan = plan_state(o, payments)
    for s in plan:
        if s["state"] == "due" and s["amount"] > 0:
            return s["kind"], s["amount"]
    return (plan[-1]["kind"] if plan else "rest", 0)


def unpaid_for_part(o, payments, part: int) -> dict:
    """Долг, блокирующий передачу части part («сначала оплата — потом файл»).

    Блокируют все неоплаченные этапы, чья часть сдачи ≤ part; финальная часть
    передаётся только после ПОЛНОГО расчёта. Отметка клиента «я оплатил»
    (claimed) долг не гасит — сперва мастер сверяет поступление.
    Возвращает {amount, claimed, labels}; amount == 0 — путь свободен.
    """
    total = o["stages_total"] or 1
    plan = plan_state(o, payments)
    if part >= total:
        block = [s for s in plan if s["state"] != "paid"]
    else:
        block = [s for s in plan
                 if s["state"] != "paid" and kind_stage(o, s["kind"]) <= part]
    return {"amount": sum(s["amount"] for s in block),
            "claimed": any(s["state"] == "claimed" for s in block),
            "labels": [s["label"] for s in block]}


def confirm_target(o, payments) -> tuple[str, int]:
    """Что подтверждать мастеру: сперва этап с отметкой клиента, затем созревший."""
    plan = plan_state(o, payments)
    for s in plan:
        if s["state"] == "claimed":
            return s["kind"], s["amount"]
    for s in plan:
        if s["state"] == "due":
            return s["kind"], s["amount"]
    return (plan[-1]["kind"] if plan else "rest", 0)


async def stage_amount(o) -> tuple[str, int]:
    """Какой этап клиент может оплатить сейчас: (kind, сумма)."""
    pays = await db.payments_for_order(o["id"])
    return due_now(o, pays)


async def confirm_amount(o) -> tuple[str, int]:
    """Какой этап мастеру подтверждать: (kind, сумма) — отмеченный первым."""
    pays = await db.payments_for_order(o["id"])
    return confirm_target(o, pays)


async def _grp_send(bot: Bot, order_id: int, text: str, reply_markup=None):
    from . import group as grp  # локальный импорт против цикла payments↔group
    return await grp.send(bot, order_id, text, reply_markup=reply_markup)


# ------------------------------------------------------- подтверждение

async def confirm(bot: Bot, order_id: int, kind: str, amount: int,
                  method: str = "manual", external_id: str | None = None,
                  actor: str = "мастер", pay_id: int | None = None,
                  allow_create: bool = False) -> dict:
    """Провести точный платёж и ровно один раз запустить основные эффекты.

    Онлайн-callback обязан передать ``pay_id``. Ручное подтверждение без id
    допускает только единственную строку ``claimed`` с той же суммой и видом:
    старая кнопка после оплаты не сможет незаметно подтвердить следующий этап.
    ``allow_create`` оставлен лишь для доверенных внутренних способов оплаты
    (сейчас депозит), которым сначала нужна собственная строка payments.
    """
    o = await db.get_order(order_id)
    if not o:
        return {"ok": False, "error": "order_not_found"}
    pays = await db.payments_for_order(order_id)
    if method in ("robokassa", "yookassa") and pay_id is None:
        return {"ok": False, "error": "payment_target_required"}
    if pay_id is None:
        claimed = [p for p in pays if p["kind"] == kind
                   and int(p["amount"] or 0) == int(amount)
                   and p["status"] == "claimed"]
        if len(claimed) == 1:
            pay_id = int(claimed[0]["id"])
        elif allow_create:
            pay_id = await db.payment_create(order_id, kind, amount, method, external_id)
        else:
            return {"ok": False, "error": "payment_target_required"}

    row = await db.payment_get(pay_id)
    if not row or row["order_id"] != order_id or row["kind"] != kind \
            or int(row["amount"] or 0) != int(amount):
        return {"ok": False, "error": "payment_mismatch"}
    if row["status"] == "canceled":
        return {"ok": False, "error": "payment_canceled"}

    # Outbox должен существовать ДО атомарного перевода payments→paid. Тогда
    # crash между записью денег и бизнес-эффектами можно отличить от старого
    # легаси-платежа, который был проведён ещё до появления effects-ledger.
    from . import payment_delivery
    receipt_before = await db.receipt_for_payment(int(pay_id))
    historic_paid_without_ledger = (
        row["status"] == "paid" and receipt_before is None
    )
    await payment_delivery.prepare_for_payment(o, row)

    claim = await db.payment_claim_paid_exact(
        pay_id, order_id, kind, int(amount), method, external_id)
    if claim == "duplicate_kind":
        if method == "deposit":
            # Внутренний кошелёк ещё можно компенсировать: не изображаем
            # второй внешний приход денег, вызывающий вернёт debit в ledger.
            await db.payment_set_status(pay_id, "canceled")
            return {"ok": False, "error": "duplicate_stage", "pay_id": pay_id}
        # Это другой InvId: деньги действительно пришли второй раз. Фиксируем
        # платёж, но не повторяем статусы/бонусы/выдачу.
        await db.payment_record_duplicate(pay_id, method, external_id)
        await db.add_event(order_id, "payment_duplicate",
                           f"{kind} {amount} ₽ · {method} — повторная оплата этапа")
        dup = (f"⚠️ <b>Повторная оплата этапа по заказу "
               f"{config.order_no(order_id)}</b>: {stage_label(o, kind)}, "
               f"{config.fmt_money(amount)} ₽ ({method}). Этап уже был оплачен — "
               "свяжитесь с клиентом и оформите возврат второго платежа.")
        await _grp_send(bot, order_id, dup)
        await notify.notify_admins(bot, dup)
        duplicate_payment = await db.payment_get(int(pay_id))
        await payment_delivery.prepare_for_payment(o, duplicate_payment)
        await db.receipt_effects_mark(int(pay_id), applied=True)
        await payment_delivery.schedule_for_payment(bot, order_id, int(pay_id))
        return {"ok": False, "error": "duplicate_payment", "pay_id": pay_id}
    if claim not in ("claimed", "already_paid"):
        return {"ok": False, "error": f"payment_{claim}"}

    fresh_payment = await db.payment_get(int(pay_id))
    receipt = await payment_delivery.prepare_for_payment(o, fresh_payment)
    if not receipt:
        return {"ok": False, "error": "payment_effects_ledger_missing"}

    if historic_paid_without_ledger:
        # Миграция не должна повторно запускать статусы/бонусы по старым уже
        # проведённым платежам. Подтверждение клиенту при этом создаём и доводим.
        await db.receipt_effects_mark(int(pay_id), applied=True)
        from . import handoff
        await handoff.release_if_paid(bot, order_id)
        await payment_delivery.schedule_for_payment(bot, order_id, int(pay_id))
        return {
            "ok": True,
            "duplicate_callback": True,
            "historic_payment": True,
            "pay_id": pay_id,
        }

    effects_claim = await db.receipt_effects_claim(int(pay_id))
    if effects_claim == "applied":
        # Основные эффекты завершены. Выдача файла и подтверждения имеют свои
        # идемпотентные ledgers и безопасно доводятся после crash/retry.
        from . import handoff
        await handoff.release_if_paid(bot, order_id)
        await payment_delivery.schedule_for_payment(bot, order_id, int(pay_id))
        return {"ok": True, "duplicate_callback": True, "pay_id": pay_id}
    if effects_claim != "claimed":
        return {
            "ok": False,
            "error": (
                "payment_effects_in_progress"
                if effects_claim == "in_progress"
                else "payment_effects_ledger_missing"
            ),
            "pay_id": pay_id,
        }

    # Деньги по делу из корзины: доступ клиент уже потерял (для него 404) —
    # платёж фиксируем, конвейер не двигаем, мастер разбирается руками.
    if o["deleted"] or 0:
        await db.add_event(order_id, "payment_confirmed",
                           f"{kind} {amount} ₽ · {method} · дело в корзине")
        trash_alert = (f"⚠️ <b>Оплата по делу из корзины</b> — заказ "
                       f"{config.order_no(order_id)}, {config.fmt_money(amount)} ₽ "
                       f"({method}). Клиент дело не видит: восстановите его "
                       "из корзины или верните деньги.")
        await notify.notify_admins(bot, trash_alert)
        await payment_delivery.schedule_for_payment(bot, order_id, int(pay_id))
        await db.receipt_effects_mark(int(pay_id), applied=True)
        return {"ok": True, "deleted_order": True, "pay_id": pay_id}

    # счета-близнецы этого же этапа (вторая вкладка, старое сообщение бота)
    # больше не действуют — иначе второе списание прошло бы молча
    await db.payments_cancel_pending_kind(order_id, kind, keep_id=pay_id)
    await db.add_event(order_id, "payment_confirmed",
                       f"{kind} {amount} ₽ · {method} · {actor}")

    # Если клиент ранее принял защищённую часть, точный зафиксированный
    # оригинал выдаётся здесь автоматически. Функция идемпотентна и сначала
    # делает файл доступным в приватном кабинете, затем меняет статус.
    from . import handoff
    release_result = await handoff.release_if_paid(bot, order_id)
    handoff_released = bool(release_result.get("ok"))

    # заказ-носитель подписки: полная оплата активирует подписку и закрывает
    # заказ — обычные ветки статусов и кэшбэк (правила 2.3) не применяются
    from . import subs  # локальный импорт против цикла payments↔subs
    if subs.is_sub_order(o):
        activated = await subs.maybe_activate(bot, order_id)
        await payment_delivery.schedule_for_payment(bot, order_id, int(pay_id))
        if not activated and o["user_id"]:
            await notify.notify_client(
                bot, o["user_id"],
                f"✅ Оплата по подписке (заказ {config.order_no(order_id)}) получена — "
                "активируем и напишем сюда.")
        await db.receipt_effects_mark(int(pay_id), applied=True)
        return {"ok": True, "pay_id": pay_id}

    no = config.order_no(order_id)
    if o["status"] in ("new", "priced", "prepay"):
        # до начала работы ЛЮБОЙ подтверждённый платёж запускает производство:
        # у копеечных планов первый этап может носить kind rest (см. stage_plan)
        await db.set_status(order_id, "work", f"стартовый платёж получен ({method})")
        if o["user_id"]:
            await notify.notify_client(
                bot, o["user_id"],
                f"✅ <b>Оплата по заказу {no} получена.</b>\n\n"
                "Работа взята в производство — держим в курсе на каждом шаге. "
                "Вопросы можно задавать прямо здесь или в кабинете на сайте.")
    elif kind == "rest":
        o2 = await db.get_order(order_id)
        accepted_all = (o2["parts_done"] or 0) >= (o2["stages_total"] or 1)
        if handoff_released:
            # Автоконтур уже отправил пакет и отдельное финальное сообщение.
            # Не дублируем следом legacy-текст «работа продолжается».
            pass
        elif accepted_all and await db.has_event(order_id, "accept_wait_pay"):
            # клиент уже осознанно принял финал и ждал только сверки денег
            if o["user_id"]:
                await notify.notify_client(
                    bot, o["user_id"],
                    f"✅ Финальная оплата по заказу {no} получена — спасибо! "
                    "Мы на связи до вашей защиты.")
            from . import flow  # локальный импорт против цикла flow↔payments
            await flow.finalize_if_ready(bot, order_id)
        elif _final_ready(o2) and o2["status"] in ("work", "fix"):
            # финал придержан до оплаты: деньги пришли — зовём мастера выдать файл
            if o["user_id"]:
                await notify.notify_client(
                    bot, o["user_id"],
                    f"✅ <b>Оплата по заказу {no} закрыта полностью — спасибо!</b>\n\n"
                    "Мастер уже передаёт финальную часть: файл придёт сюда "
                    "и появится в кабинете на сайте.")
            alert = (f"💰 <b>Остаток по заказу {no} получен — оплата закрыта.</b>\n"
                     "Передайте клиенту финальную часть: кнопка ниже "
                     "или просто файлом в ветку темы.")
            hand_kb = kb.handover_kb(o2, part=o2["stages_total"] or 1, final=True)
            g = await _grp_send(bot, order_id, alert, reply_markup=hand_kb)
            await notify.notify_admins(bot, alert, reply_markup=hand_kb,
                                       map_client=(o["user_id"], order_id) if o["user_id"] else None,
                                       group_sent=bool(g))
            await notify.send_admin_card(bot, order_id, group_sent=bool(g))
        else:
            # оплата закрыта, но работа/сопровождение продолжаются — НЕ завершаем
            if o["user_id"]:
                await notify.notify_client(
                    bot, o["user_id"],
                    f"✅ Оплата по заказу {no} закрыта полностью — спасибо! "
                    "Работа и сопровождение продолжаются: правки до полной приёмки "
                    "бесплатны, мы на связи до вашей защиты.")
    else:
        o2 = await db.get_order(order_id)
        part_n = kind_stage(o2, kind)
        if (_row_int(o2, "part_ready") == part_n and o2["status"] in ("work", "fix")
                and part_n <= (o2["stages_total"] or 1)):
            # часть была придержана до оплаты этапа: деньги пришли — передаём файл
            if o["user_id"]:
                await notify.notify_client(
                    bot, o["user_id"],
                    f"✅ <b>{stage_label(o2, kind)} по заказу {no} получена</b> "
                    f"({config.fmt_money(amount)} ₽) — спасибо!\n\n"
                    f"Мастер передаёт часть {part_n}: файл придёт сюда и появится "
                    "в кабинете на сайте.")
            alert = (f"💰 <b>{stage_label(o2, kind)} по заказу {no} получена.</b>\n"
                     f"Передайте клиенту часть {part_n}: кнопка ниже "
                     "или просто файлом в ветку темы.")
            hand_kb = kb.handover_kb(o2, part_n)
            g = await _grp_send(bot, order_id, alert, reply_markup=hand_kb)
            await notify.notify_admins(bot, alert, reply_markup=hand_kb,
                                       map_client=(o["user_id"], order_id) if o["user_id"] else None,
                                       group_sent=bool(g))
            await notify.send_admin_card(bot, order_id, group_sent=bool(g))
        elif o["user_id"]:
            await notify.notify_client(
                bot, o["user_id"],
                f"✅ {stage_label(o2, kind)} по заказу {no} получена "
                f"({config.fmt_money(amount)} ₽) — спасибо! Продолжаем работу.")
    await payment_delivery.schedule_for_payment(bot, order_id, int(pay_id))
    # бонусные хуки (кэшбэк + рефералка) — после ПОЛНОЙ оплаты заказа
    await bonus.on_payment(bot, order_id)

    # собранная заявка (ссылка мастера): закрыть её и зафиксировать акцепт.
    # Хук стоит ЗДЕСЬ, а не в robo_webhook: сюда сходятся все четыре пути
    # подтверждения — Robokassa, ЮKassa, кнопка мастера в админке и в боте.
    spec_accepted = await db.specification_accept(order_id, int(row["id"]))
    if spec_accepted:
        frozen = await db.specification_latest(order_id)
        await db.add_event(
            order_id, "specification_accepted",
            f"ред. {frozen['revision']} · платёж {row['id']}" if frozen
            else f"платёж {row['id']}",
        )
    elif not await db.specification_latest(order_id) \
            and not await db.has_event(order_id, "specification_missing_legacy"):
        # Legacy-заказ без документа не «чинится» генерацией задним числом:
        # мастер видит отдельный след и при необходимости оформляет редакцию.
        await db.add_event(order_id, "specification_missing_legacy",
                           f"платёж {row['id']} подтверждён без frozen-снимка")
    off = await db.offer_mark_paid(order_id, method=method,
                                   external_id=external_id or "",
                                   doc_editions=config.DOC_EDITIONS_STR,
                                   nonce=((row["nonce"] if row else "") or ""),
                                   inv_id=((row["id"] if row else 0) or 0))
    if off and (off["notify_to"] or "").strip():
        # ОДНО письмо, и в нём НЕТ ключа от дела: только номер, сумма и та же
        # ссылка-заявка, которая у адресата уже есть. Даже если контакт подменили,
        # злоумышленник не узнаёт ничего нового. Полноценные письма включает
        # мастер кнопкой в админке, сверив адрес с перепиской.
        try:
            await mailer.send(
                off["notify_to"].strip(),
                f"Оплата по заявке {config.order_no(order_id)} получена",
                "Здравствуйте!\n\n"
                f"Мы получили оплату по заявке {config.order_no(order_id)}"
                f" — {config.fmt_money(amount)} ₽.\n"
                "Работа начата, мастер напишет вам в течение рабочего дня.\n\n"
                "Открыть заявку и следить за делом можно по той же ссылке, "
                "по которой вы её открывали:\n"
                f"{config.SITE_URL}/zayavka.html#k={off['code']}\n\n"
                "Академический Салон")
        except Exception:  # noqa: BLE001
            log.warning("offer_paid mail failed", exc_info=True)
    if off:
        o3 = await db.get_order(order_id)
        link = (f"{config.SITE_URL}/dashboard.html#claim={o3['access_token']}"
                if o3 and o3["access_token"] else "")
        await notify.notify_admins(
            bot,
            f"🔗 <b>Оплата по собранной заявке {config.order_no(order_id)} получена.</b>\n"
            f"Ссылка клиента на дело:\n{link}\n\n"
            "Продублируйте её в переписку — если браузер клиента почистят, "
            "это его единственный ключ.")
    await db.receipt_effects_mark(int(pay_id), applied=True)
    return {"ok": True, "pay_id": pay_id}


# --------------------------------------------------- онлайн-оплата (общее)

async def online_link_for_order(o, kind: str, amount: int, extra: dict | None = None) -> str | None:
    """Ссылка онлайн-оплаты этапа заказа у активного провайдера (None — выкл)."""
    prov = config.pay_provider()
    if not prov or amount <= 0:
        return None
    if prov == "robokassa":
        return await robo_create_link(o, kind, amount, extra)
    res = await yk_create_payment(o, kind, amount,
                                  f"{config.SITE_URL}/dashboard.html?paid={o['id']}")
    return res["url"] if res else None


async def online_link_for_sub(s) -> str | None:
    """Ссылка онлайн-оплаты подписки (свой контур, без строк в payments)."""
    prov = config.pay_provider()
    if not prov:
        return None
    if prov == "robokassa":
        return await robo_create_link_sub(s)
    res = await yk_create_payment_sub(s, f"{config.SITE_URL}/dashboard.html#plus")
    return res["url"] if res else None


# ----------------------------------------------------------- Robokassa

ROBO_PAY_URL = "https://auth.robokassa.ru/Merchant/Index.aspx"
ROBO_LINK_TTL_DAYS = 3   # счёт живёт 3 суток; без срока ссылка вечна

# InvId платежей за подписку: OFFSET + subscriptions.id — не пересекается
# с payments.id заказов (их счёт на порядки меньше). Свой контур подписки
# не пишет строк в payments вовсе.
SUB_INV_OFFSET = 90_000_000
DEP_INV_OFFSET = 70_000_000
# InvId платежей за подарочный сертификат: свой диапазон ниже подписок
GIFT_INV_OFFSET = 80_000_000
# Добровольная благодарность по завершённому заказу: отдельный контур,
# чтобы она не меняла статус дела, план этапов, бонусы и выданные файлы.
TIP_INV_OFFSET = 60_000_000


def _robo_sig(*parts: object) -> str:
    """MD5 от частей, склеенных двоеточиями, — формат подписи Robokassa."""
    return hashlib.md5(":".join(str(p) for p in parts).encode("utf-8")).hexdigest()


def _robo_expiration() -> str:
    """Срок действия счёта в формате Robokassa, по времени магазина (МСК)."""
    return (datetime.now(config.MSK) + timedelta(days=ROBO_LINK_TTL_DAYS)) \
        .strftime("%Y-%m-%dT%H:%M")


def _robo_email(value: str | None) -> str | None:
    """Только валидный e-mail: Robokassa использует Email для отправки чека."""
    email = str(value or "").strip().lower()[:120]
    return email if mailer.looks_email(email) else None


async def _user_email(user_id: int | None) -> str | None:
    if not user_id:
        return None
    user = await db.get_user(user_id)
    return _robo_email(user["email"] if user else None)


def _robo_receipt(name: str, amount: int,
                  payment_method: str = "full_payment") -> str:
    """Номенклатура чека (Receipt) — однократно URL-закодированный JSON.

    Обязательна для «Робочеков СМЗ»: без состава корзины чек НПД формируется
    некорректно (предупреждение Robokassa, риск претензий ФНС). Сумма позиции
    равна OutSum — иначе Robokassa отклонит запрос. В подписи участвует
    ИМЕННО эта строка (между InvId и Паролем#1, по официальному примеру);
    в query urlencode() закодирует её второй раз — так и требуется для GET.
    tax=none — самозанятый работает без НДС.
    """
    return _robo_receipt_items(
        [{"name": name, "amount": amount}],
        payment_method=payment_method,
    )


def _robo_receipt_items(
    items: list[dict],
    *,
    payment_method: str = "full_payment",
) -> str:
    """Зафиксировать состав Receipt; сумма каждой позиции — целые рубли."""
    receipt_items = []
    for item in items:
        item_amount = int(item.get("amount") or 0)
        item_name = str(item.get("name") or "").strip()[:128]
        if item_amount <= 0 or not item_name:
            continue
        receipt_items.append({
            "name": item_name,
            "quantity": 1,
            "sum": item_amount,
            "tax": "none",
            "payment_method": payment_method,
            "payment_object": "service",
        })
    if not receipt_items:
        raise ValueError("Robokassa Receipt requires at least one positive item")
    receipt = {"items": receipt_items}
    raw = json.dumps(receipt, ensure_ascii=False, separators=(",", ":"))
    return quote(raw, safe="")


async def _robo_order_receipt(o, kind: str, amount: int, label: str) -> str:
    """Receipt из замороженной Спецификации, предъявленной до оплаты."""
    frozen = await db.specification_latest(o["id"])
    try:
        spec = json.loads(frozen["specification_json"]) if frozen else {}
        lines = {
            str(line.get("line_id") or ""): line
            for line in (spec.get("lines") or [])
            if isinstance(line, dict)
        }
        stage = next(
            (
                stage
                for stage in (spec.get("payment_schedule") or [])
                if isinstance(stage, dict) and stage.get("kind") == kind
            ),
            None,
        )
        allocations = stage.get("allocations") if stage else None
        receipt_items = []
        for allocation in allocations or []:
            line = lines.get(str(allocation.get("line_id") or "")) or {}
            receipt_items.append({
                "name": (
                    line.get("receipt_name")
                    or line.get("title")
                    or "Информационно-консультационная услуга"
                ),
                "amount": int(allocation.get("amount_rub") or 0),
            })
        if sum(int(item["amount"]) for item in receipt_items) == int(amount):
            return _robo_receipt_items(receipt_items)
    except (TypeError, ValueError, json.JSONDecodeError):
        log.warning(
            "frozen specification cannot build Receipt order=%s kind=%s",
            o["id"],
            kind,
        )
    return _robo_receipt(
        f"Информационно-консультационные услуги, заказ №{o['id']} — "
        f"{label.lower()}",
        amount,
    )


async def robo_create_link(o, kind: str, amount: int, extra: dict | None = None,
                           receipt_email: str | None = None) -> str | None:
    """Платёжная ссылка Robokassa (интерфейс оплаты).

    InvId = id строки payments: уникален, по нему ResultURL находит платёж.
    Shp_-параметры входят в подпись по алфавиту. Success/Fail/Result URL
    настраиваются в личном кабинете магазина, в запрос их не кладём.
    """
    if not config.robokassa_on() or amount <= 0:
        return None
    pid = await db.payment_create(o["id"], kind, amount, "robokassa", None)
    out = f"{amount:.2f}"
    label = stage_label(o, kind)
    receipt = await _robo_order_receipt(o, kind, amount, label)
    email = _robo_email(receipt_email) or await mailer.order_recipient(o)
    email = _robo_email(email)
    shp = {"Shp_kind": kind, "Shp_order": str(o["id"])}
    # Robokassa дописывает все Shp_* к SuccessURL — по ним посадочная
    # oplaceno.html понимает, куда вернуть человека. Подпись их уже
    # учитывает (sorted ниже), поэтому новый ключ ничего не ломает.
    if extra:
        for _k, _v in extra.items():
            if _v:
                shp["Shp_" + _k] = str(_v)
    sig = _robo_sig(config.ROBOKASSA_LOGIN, out, pid, receipt,
                    config.robo_pass1(),
                    *(f"{k}={v}" for k, v in sorted(shp.items())))
    q = {
        "MerchantLogin": config.ROBOKASSA_LOGIN,
        "OutSum": out,
        "InvId": pid,
        "Receipt": receipt,
        "Description": f"Заказ {o['id']} - {label} - Академический Салон"[:100],
        "SignatureValue": sig,
        "Culture": "ru",
        "Encoding": "utf-8",
        "ExpirationDate": _robo_expiration(),
    }
    if email:
        q["Email"] = email
    q.update(shp)
    # Срок жизни счёта: без него выписанная ссылка оплачивается даже после
    # пересборки цены — старой дешёвой можно закрыть подорожавший этап.
    if config.ROBOKASSA_TEST:
        q["IsTest"] = 1
    await db.receipt_invoice_upsert(
        provider="robokassa", inv_id=pid, scope="order", scope_id=o["id"],
        order_id=o["id"], user_id=o["user_id"], payment_id=pid,
        kind=kind, amount=amount, buyer_email=email,
        receipt_payload=receipt, expires_at=q["ExpirationDate"],
    )
    await db.add_event(o["id"], "payment_link", f"{kind} {amount} ₽ · Robokassa")
    return f"{ROBO_PAY_URL}?{urlencode(q)}"


async def robo_create_link_gift(g) -> str | None:
    """Платёжная ссылка Robokassa за сертификат (свой контур, InvId со сдвигом)."""
    amount = int(g["amount"] or 0)
    if not config.robokassa_on() or amount <= 0:
        return None
    inv = GIFT_INV_OFFSET + g["id"]
    shp = {"Shp_gift": str(g["id"]), "Shp_kind": "gift"}
    out = f"{amount:.2f}"
    receipt = _robo_receipt(
        "Подарочный сертификат мастерской (аванс за информационно-"
        "консультационные услуги)", amount, payment_method="advance")
    email = _robo_email(g["buyer_contact"])
    sig = _robo_sig(config.ROBOKASSA_LOGIN, out, inv, receipt,
                    config.robo_pass1(),
                    *(f"{k}={v}" for k, v in sorted(shp.items())))
    q = {
        "MerchantLogin": config.ROBOKASSA_LOGIN,
        "OutSum": out,
        "InvId": inv,
        "Receipt": receipt,
        "Description": f"Подарочный сертификат на {amount} руб. - Академический Салон"[:100],
        "SignatureValue": sig,
        "Culture": "ru",
        "Encoding": "utf-8",
        "ExpirationDate": _robo_expiration(),
    }
    if email:
        q["Email"] = email
    q.update(shp)
    if config.ROBOKASSA_TEST:
        q["IsTest"] = 1
    await db.receipt_invoice_upsert(
        provider="robokassa", inv_id=inv, scope="gift", scope_id=g["id"],
        user_id=g["buyer_user_id"], kind="gift", amount=amount,
        buyer_email=email, receipt_payload=receipt,
        expires_at=q["ExpirationDate"],
    )
    return f"{ROBO_PAY_URL}?{urlencode(q)}"


async def robo_create_link_sub(s) -> str | None:
    """Платёжная ссылка Robokassa за подписку (свой контур, InvId со сдвигом)."""
    amount = int(s["price"] or 0)
    if not config.robokassa_on() or amount <= 0:
        return None
    inv = SUB_INV_OFFSET + s["id"]
    shp = {"Shp_kind": "sub", "Shp_sub": str(s["id"])}
    out = f"{amount:.2f}"
    receipt = _robo_receipt(
        f"Подписка «Салон+» на {s['period_days']} дней (пакет привилегий сервиса)",
        amount)
    email = await _user_email(s["user_id"])
    sig = _robo_sig(config.ROBOKASSA_LOGIN, out, inv, receipt,
                    config.robo_pass1(),
                    *(f"{k}={v}" for k, v in sorted(shp.items())))
    q = {
        "MerchantLogin": config.ROBOKASSA_LOGIN,
        "OutSum": out,
        "InvId": inv,
        "Receipt": receipt,
        "Description": f"Подписка Салон+ ({s['plan']}) - Академический Салон"[:100],
        "SignatureValue": sig,
        "Culture": "ru",
        "Encoding": "utf-8",
        "ExpirationDate": _robo_expiration(),
    }
    if email:
        q["Email"] = email
    q.update(shp)
    if config.ROBOKASSA_TEST:
        q["IsTest"] = 1
    await db.receipt_invoice_upsert(
        provider="robokassa", inv_id=inv, scope="subscription",
        scope_id=s["id"], user_id=s["user_id"], kind="subscription",
        amount=amount, buyer_email=email, receipt_payload=receipt,
        expires_at=q["ExpirationDate"],
    )
    return f"{ROBO_PAY_URL}?{urlencode(q)}"


async def robo_create_link_dep(d) -> str | None:
    """Платёжная ссылка Robokassa за пополнение депозита (аванс мастерской)."""
    amount = int(d["amount"] or 0)
    if not config.robokassa_on() or amount <= 0:
        return None
    inv = DEP_INV_OFFSET + d["id"]
    shp = {"Shp_kind": "deposit", "Shp_dep": str(d["id"])}
    out = f"{amount:.2f}"
    receipt = _robo_receipt(
        "Аванс на услуги мастерской (пополнение депозитного счёта)", amount,
        payment_method="advance")
    email = await _user_email(d["user_id"])
    sig = _robo_sig(config.ROBOKASSA_LOGIN, out, inv, receipt,
                    config.robo_pass1(),
                    *(f"{k}={v}" for k, v in sorted(shp.items())))
    q = {
        "MerchantLogin": config.ROBOKASSA_LOGIN,
        "OutSum": out,
        "InvId": inv,
        "Receipt": receipt,
        "Description": "Аванс на услуги - Академический Салон",
        "SignatureValue": sig,
        "Culture": "ru",
        "Encoding": "utf-8",
        "ExpirationDate": _robo_expiration(),
    }
    if email:
        q["Email"] = email
    q.update(shp)
    if config.ROBOKASSA_TEST:
        q["IsTest"] = 1
    await db.receipt_invoice_upsert(
        provider="robokassa", inv_id=inv, scope="deposit", scope_id=d["id"],
        user_id=d["user_id"], kind="deposit", amount=amount,
        buyer_email=email, receipt_payload=receipt,
        expires_at=q["ExpirationDate"],
    )
    return f"{ROBO_PAY_URL}?{urlencode(q)}"


async def robo_create_link_tip(tip, order) -> str | None:
    """Добровольная благодарность после завершённого заказа."""
    amount = int(tip["amount"] or 0)
    if not config.robokassa_on() or amount <= 0:
        return None
    inv = TIP_INV_OFFSET + tip["id"]
    shp = {"Shp_kind": "tip", "Shp_order": str(order["id"]),
           "Shp_tip": str(tip["id"])}
    out = f"{amount:.2f}"
    receipt = _robo_receipt(
        f"Добровольная благодарность за оказанные информационно-"
        f"консультационные услуги, заказ №{order['id']}", amount)
    email = _robo_email(await mailer.order_recipient(order))
    sig = _robo_sig(config.ROBOKASSA_LOGIN, out, inv, receipt,
                    config.robo_pass1(),
                    *(f"{k}={v}" for k, v in sorted(shp.items())))
    q = {
        "MerchantLogin": config.ROBOKASSA_LOGIN,
        "OutSum": out,
        "InvId": inv,
        "Receipt": receipt,
        "Description": f"Благодарность мастерской - заказ {order['id']}"[:100],
        "SignatureValue": sig,
        "Culture": "ru",
        "Encoding": "utf-8",
        "ExpirationDate": _robo_expiration(),
    }
    if email:
        q["Email"] = email
    q.update(shp)
    if config.ROBOKASSA_TEST:
        q["IsTest"] = 1
    await db.receipt_invoice_upsert(
        provider="robokassa", inv_id=inv, scope="tip", scope_id=tip["id"],
        order_id=order["id"], user_id=order["user_id"], kind="tip",
        amount=amount, buyer_email=email, receipt_payload=receipt,
        expires_at=q["ExpirationDate"],
    )
    return f"{ROBO_PAY_URL}?{urlencode(q)}"


def robo_result_ok(data) -> tuple[int, int] | None:
    """Проверить подпись ResultURL (OutSum:InvId:Pass2[:Shp_…]).

    Возвращает (InvId, сумма в ₽) или None, если подпись не сошлась.
    """
    out = str(data.get("OutSum") or "")
    try:
        inv = int(str(data.get("InvId") or ""))
    except ValueError:
        return None
    got = str(data.get("SignatureValue") or "").lower()
    shp = sorted((k, str(v)) for k, v in data.items() if k.startswith("Shp_"))
    want = _robo_sig(out, inv, config.robo_pass2(),
                     *(f"{k}={v}" for k, v in shp))
    if not (got and secrets.compare_digest(want, got)):
        return None
    try:
        parsed = Decimal(out)
        if not parsed.is_finite() or parsed <= 0 \
                or parsed != parsed.quantize(Decimal("0.01")) \
                or parsed != parsed.to_integral_value():
            return None
        amount = int(parsed)
    except (InvalidOperation, ValueError):
        return None
    return inv, amount


# ------------------------------------------------------------- ЮKassa

async def yk_create_payment(o, kind: str, amount: int, return_url: str) -> dict | None:
    """Создать платёж в ЮKassa; вернуть {id, url} или None."""
    if not config.yookassa_on() or amount <= 0:
        return None
    body = {
        "amount": {"value": f"{amount}.00", "currency": "RUB"},
        "capture": True,
        "confirmation": {"type": "redirect", "return_url": return_url},
        "description": f"Заказ №{o['id']} · {('предоплата' if kind == 'prepay' else 'доплата')} · Академический Салон",
        "metadata": {"order_id": str(o["id"]), "kind": kind},
    }
    auth = aiohttp.BasicAuth(config.YOOKASSA_SHOP_ID, config.YOOKASSA_SECRET)
    headers = {"Idempotence-Key": str(uuid.uuid4())}
    try:
        async with aiohttp.ClientSession(auth=auth) as sess:
            async with sess.post(f"{YK_API}/payments", json=body, headers=headers,
                                 timeout=aiohttp.ClientTimeout(total=20)) as r:
                data = await r.json()
                if r.status not in (200, 201):
                    log.warning("yookassa create failed %s: %s", r.status, data)
                    return None
    except Exception as e:  # noqa: BLE001
        log.warning("yookassa create error: %s", e)
        return None
    url = (data.get("confirmation") or {}).get("confirmation_url")
    if not url:
        return None
    await db.payment_create(o["id"], kind, amount, "yookassa", data["id"])
    await db.add_event(o["id"], "payment_link", f"{kind} {amount} ₽ · ЮKassa")
    return {"id": data["id"], "url": url}


async def yk_create_payment_sub(s, return_url: str) -> dict | None:
    """Платёж ЮKassa за подписку: метка sub_id в metadata, без строки payments."""
    amount = int(s["price"] or 0)
    if not config.yookassa_on() or amount <= 0:
        return None
    body = {
        "amount": {"value": f"{amount}.00", "currency": "RUB"},
        "capture": True,
        "confirmation": {"type": "redirect", "return_url": return_url},
        "description": f"Подписка «Салон+» ({s['plan']}) · Академический Салон",
        "metadata": {"sub_id": str(s["id"])},
    }
    auth = aiohttp.BasicAuth(config.YOOKASSA_SHOP_ID, config.YOOKASSA_SECRET)
    headers = {"Idempotence-Key": str(uuid.uuid4())}
    try:
        async with aiohttp.ClientSession(auth=auth) as sess:
            async with sess.post(f"{YK_API}/payments", json=body, headers=headers,
                                 timeout=aiohttp.ClientTimeout(total=20)) as r:
                data = await r.json()
                if r.status not in (200, 201):
                    log.warning("yookassa sub create failed %s: %s", r.status, data)
                    return None
    except Exception as e:  # noqa: BLE001
        log.warning("yookassa sub create error: %s", e)
        return None
    url = (data.get("confirmation") or {}).get("confirmation_url")
    if not url:
        return None
    return {"id": data["id"], "url": url}


async def yk_fetch(payment_id: str) -> dict | None:
    """Проверить платёж напрямую в ЮKassa (вебхуку не верим на слово)."""
    if not config.yookassa_on():
        return None
    auth = aiohttp.BasicAuth(config.YOOKASSA_SHOP_ID, config.YOOKASSA_SECRET)
    try:
        async with aiohttp.ClientSession(auth=auth) as sess:
            async with sess.get(f"{YK_API}/payments/{payment_id}",
                                timeout=aiohttp.ClientTimeout(total=20)) as r:
                if r.status != 200:
                    return None
                return await r.json()
    except Exception as e:  # noqa: BLE001
        log.warning("yookassa fetch error: %s", e)
        return None
