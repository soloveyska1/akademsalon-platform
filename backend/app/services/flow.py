"""Сценарии жизни заказа, общие для бота, рабочей группы, сайта и админки.

Поэтапная сдача, правило «сначала оплата — потом файл»:
у заказа есть план из 2 частей (50/50) или 3 частей (30/40/30 — как
обещает сайт). Оплата части 1 — при подтверждении заказа. Дальше мастер
работает, объявляет «часть N готова» (part_ready) → клиент получает счёт
этапа с подписью «оплата части N» → после подтверждения оплаты мастер
передаёт файл → клиент смотрит, безлимитно просит правки или принимает →
мастер работает над следующей частью. Финал закрывается только когда
принята последняя часть И оплачены все этапы.

Мастер может и довериться: сдать часть файлом без объявления — тогда
этап «созревает» в момент сдачи.

Старые заказы без плана (stages_total IS NULL) живут как раньше:
одна выдача, предоплата+остаток.
"""
from __future__ import annotations

import logging

from aiogram import Bot

from .. import config, db, keyboards as kb, texts
from . import mailer, notify, payments
from . import group as grp
from ..texts import esc

log = logging.getLogger(__name__)


def parts_total(o) -> int:
    """Сколько частей сдачи у заказа (1 — старый формат одной выдачи)."""
    return o["stages_total"] or 1


def part_label(o, part: int | None = None) -> str:
    total = parts_total(o)
    p = part or o["stage"] or 1
    return f"часть {p} из {total}" if total > 1 else "работа"


async def set_plan(order_id: int, stages_total: int | None) -> None:
    """Сменить план этапов (до финала). Подгоняет предоплату под план."""
    o = await db.get_order(order_id)
    if not o:
        return
    pays = await db.payments_for_order(order_id)
    if any(p["status"] in ("claimed", "paid") for p in pays):
        # После отметки/оплаты финансовый снимок неизменяем: иначе уже
        # предъявленный этап задним числом превращается в другой план.
        return
    # 1 храним честной единицей (а не NULL): NULL значит «не выбрано», и до
    # цены его перекрывал дефолт (2) — выбор «в один платёж» не приживался
    stages_total = stages_total if stages_total in (1, 2, 3) else None
    fields: dict = {"stages_total": stages_total}
    if o["price"] and o["status"] in ("new", "priced", "prepay"):
        fields["prepay"] = payments.default_prepay(o["price"], stages_total)
    if (o["stage"] or 1) > (stages_total or 1):
        fields["stage"] = stages_total or 1
    await db.update_order(order_id, **fields)
    await db.add_event(order_id, "plan_set",
                       "одна выдача" if (stages_total or 1) == 1 else f"{stages_total} ч.")


# ------------------------------------------------------------------ цена

async def set_price(bot: Bot, order_id: int, price: int, prepay: int | None = None,
                    stages: int | None = None, via: str = "мастер",
                    specification: dict | None = None) -> dict:
    """Назначить цену только вместе с новой неизменяемой спецификацией.

    Полный payload строк предпочтительно приходит из редактора веб-админки.
    Для прежних Telegram-сценариев сервер до отправки цены сам собирает,
    проверяет и замораживает спецификацию из сохранённых строк заказа.
    """
    o = await db.get_order(order_id)
    if not o or price <= 0:
        return {"ok": False, "error": "bad_price"}
    pays = await db.payments_for_order(order_id)
    if any(p["status"] in ("claimed", "paid") for p in pays):
        return {"ok": False, "error": "financial_locked"}
    specification_autofilled = not isinstance(specification, dict)
    specification_payload = specification if isinstance(specification, dict) else {}
    stages_total = stages if stages in (1, 2, 3) else (o["stages_total"] or
                                                       payments.default_stages(o["work_type"]))
    prepay = min(prepay or payments.default_prepay(price, stages_total), price)
    # Проверяем предмет до любой мутации заказа. После обновления финансов
    # тот же payload будет собран повторно, уже с фактическими скидками и
    # графиком платежей, и только тогда заморожен.
    from . import contract
    items = await db.items_for_order(order_id)
    revision = await db.specification_next_revision(order_id)
    spec_created_at = db.now_iso()
    proposed = dict(o)
    proposed.update(price=price, prepay=prepay, stages_total=stages_total)
    try:
        preflight_spec = contract.specification_from_payload(
            proposed, items, specification_payload, revision=revision,
            created_at=spec_created_at, strict=True,
        )
        preflight_pdf = await contract.build_pdf(proposed, preflight_spec)
        if not preflight_pdf:
            raise ValueError("specification_pdf_unavailable")
    except Exception as exc:  # noqa: BLE001 — до этой точки заказ ещё не менялся
        return {"ok": False, "error": "bad_specification",
                "detail": str(exc)[:160]}
    # Любая прежняя ссылка/ручная отметка относится к старому финансовому
    # снимку. До первой оплаты её безопасно погасить и выпустить новый счёт.
    if any(p["status"] == "pending" for p in pays):
        await db.payments_cancel_pending(order_id)
    await db.update_order(order_id, price=price, prepay=prepay,
                          stages_total=stages_total)
    # автоскидка действующей подписки «Салон+» — сразу, чтобы клиент видел выгоду
    from . import subs  # локальный импорт против цикла flow↔subs
    disc = await subs.apply_discount(order_id)
    # промокод заявки: применяется после подписки, остаётся бо́льшая из двух
    from . import promo as promo_svc
    pdisc = await promo_svc.apply(order_id)
    if pdisc:
        disc = 0  # подписочную скидку promo.apply снял как менее выгодную
    # подарочный сертификат: зачёт после всех скидок и бонусов
    from . import gift as gift_svc
    gift_amt = await gift_svc.sync_order(bot, order_id)
    fresh = await db.get_order(order_id)
    try:
        spec = contract.specification_from_payload(
            fresh, items, specification_payload, revision=revision,
            created_at=spec_created_at, strict=True,
        )
        spec_json = contract.canonical_json(spec)
        spec_hash = contract.canonical_hash(spec)
        spec_pdf = await contract.build_pdf(fresh, spec)
        if not spec_pdf:
            raise ValueError("specification_pdf_unavailable")
        import hashlib
        spec_pdf_hash = hashlib.sha256(spec_pdf).hexdigest()
        snapshot_id = await db.specification_create(
            order_id, spec_json, spec_pdf, source="price",
            revision=revision, schema_version="2.0",
            specification_hash=spec_hash, pdf_hash=spec_pdf_hash,
            created_at=spec_created_at,
        )
    except Exception as exc:  # noqa: BLE001 — цену клиенту без снимка не выпускаем
        await db.add_event(order_id, "spec_freeze_failed", str(exc)[:300])
        log.exception("specification freeze failed for %s", order_id)
        return {"ok": False, "error": "specification_freeze_failed",
                "detail": str(exc)[:160]}
    if specification_autofilled:
        await db.add_event(
            order_id, "specification_autofilled",
            f"ред. {revision} · {len(spec.get('lines') or [])} поз. · {via}",
        )
    if o["status"] in ("new", "priced", "prepay"):
        await db.set_status(order_id, "priced", f"{price} ₽ (предоплата {prepay}) · {via}")
    else:
        # переоценка по ходу работы не роняет статус в «цена предложена»:
        # дело остаётся в work/check/fix, меняются только суммы плана
        await db.add_event(order_id, "price_updated",
                           f"{price} ₽ (предоплата {prepay}) · {via}")
    fresh = await db.get_order(order_id)
    due = payments.money_due(fresh)  # готовый расчёт «деньгами» — для клиента и мастера
    await mailer.order_event(fresh, "priced")
    delivered_tg = None
    # почтовый аккаунт сайта (id < 0) Telegram недоступен: предложение уже
    # ушло письмом строкой выше — остаёмся в ветке «клиент без Telegram»
    if o["user_id"] and o["user_id"] > 0:
        body = texts.PRICE_OFFER.format(
            no=config.order_no(order_id), price=config.fmt_money(price),
            prepay_part="")
        if disc > 0:
            body += (f"\n\n⭐ Подписка «Салон+» уже применена: <b>−{config.fmt_money(disc)} ₽</b>. "
                     f"Деньгами к оплате: <b>{config.fmt_money(due['due_total'])} ₽</b>.")
        if pdisc > 0:
            body += (f"\n\n🎟 Промокод <b>{o['promo_code']}</b> применён: "
                     f"<b>−{config.fmt_money(pdisc)} ₽</b>. "
                     f"Деньгами к оплате: <b>{config.fmt_money(due['due_total'])} ₽</b>.")
        if gift_amt > 0:
            body += (f"\n\n🎁 Подарочный сертификат зачтён: "
                     f"<b>−{config.fmt_money(gift_amt)} ₽</b>. "
                     f"Деньгами к оплате: <b>{config.fmt_money(due['due_total'])} ₽</b>.")
        # план оплат целиком: полная сумма честно названа, но платят по частям
        body += texts.plan_offer_block(payments.stage_plan(fresh), config.fmt_money)
        markup = kb.with_cab_url(kb.price_offer(order_id),
                                 await notify.order_link(order_id),
                                 "🧾 Смета целиком — в кабинете")
        delivered_tg = await notify.notify_client(
            bot, o["user_id"], body, reply_markup=markup)
    await grp.status_sync(bot, order_id)
    await send_spec(bot, order_id)
    return {"ok": True, "price": price, "prepay": prepay, "sub_discount": disc,
            "promo_discount": pdisc, "due": due,
            "stages": stages_total or 1, "delivered_tg": delivered_tg,
            "specification": {
                "snapshot_id": snapshot_id, "revision": revision,
                "data_sha256": spec_hash, "pdf_sha256": spec_pdf_hash,
            }}


async def send_spec(bot: Bot, order_id: int) -> bool:
    """PDF-спецификация клиенту в Telegram — сразу вместе с ценой.

    Гость без Telegram скачивает её в кабинете (кнопка «Спецификация»).
    При изменении цены уходит обновлённая версия.
    """
    o = await db.get_order(order_id)
    if not o or not o["user_id"] or o["user_id"] <= 0 or not o["price"]:
        return False  # гость и почтовый аккаунт берут PDF в кабинете сайта
    try:
        from . import contract
        snap = await contract.snapshot_for_order(o)
        pdf = snap.get("pdf")
        if not pdf:
            await db.add_event(order_id, "spec_send_blocked",
                               "нет замороженной редакции")
            log.error("specification send blocked for %s: no frozen snapshot", order_id)
            return False
        from aiogram.types import BufferedInputFile
        lines = snap["specification"].get("lines") or []
        revision = int(snap.get("revision") or 1)
        short_hash = str(snap.get("pdf_hash") or "")[:12]
        await bot.send_document(
            o["user_id"],
            BufferedInputFile(
                pdf, filename=f"specifikaciya-{order_id}-r{revision}.pdf"),
            caption=(
                f"📄 Спецификация заказа №{order_id}, редакция {revision}: "
                f"{len(lines)} поз., цена и срок каждой позиции, график оплаты, "
                "критерии приёмки и режим прав.\n\n"
                f"PDF SHA-256: {short_hash}… Полный хэш доступен в кабинете. "
                f"Документ действует вместе с Офертой ред. "
                f"{config.DOC_EDITIONS['oferta']}; оплата первого платежа после "
                "получения файла означает принятие этой редакции."
            ))
        await db.add_event(
            order_id, "spec_sent",
            f"ред. {revision} · {len(lines)} поз. · pdf {short_hash}")
        return True
    except Exception as e:  # noqa: BLE001 — спецификация не должна ломать цену
        log.warning("spec send failed for %s: %s", order_id, e)
        return False


async def send_pamyatka(bot: Bot, order_id: int) -> bool:
    """Персональная памятка «что дальше» — вместе с финальной частью работы.

    Собирается из полей заказа (тип работы выбирает состав разделов, даты
    окон считаются от передачи). Идемпотентно: событие pamyatka_sent.
    Почтовым клиентам — сообщение в ленту дела и письмо, PDF ждёт в кабинете.
    """
    o = await db.get_order(order_id)
    if not o:
        return False
    from . import pamyatka
    if not pamyatka.family_for(o):
        return False
    if await db.has_event(order_id, "pamyatka_sent"):
        return False
    try:
        no = config.order_no(order_id)
        if o["user_id"] and o["user_id"] > 0:
            pdf = await pamyatka.build_order_pdf(o)
            if not pdf:
                return False
            from aiogram.types import BufferedInputFile
            await bot.send_document(
                o["user_id"],
                BufferedInputFile(pdf, filename=f"pamyatka-zakaz-{order_id}.pdf"),
                caption=(f"📘 Памятка по заказу {no} — «что дальше»: приёмка за 48 часов, "
                         "антиплагиат без паники, письмо научруку, окна бесплатных правок "
                         "с датами и план подготовки к защите. Она же — в кабинете дела."))
        else:
            await db.msg_add(order_id, "master",
                             "📘 Памятка по вашему заказу подготовлена: что проверить в первые "
                             "48 часов, окна бесплатных правок с датами, подготовка к сдаче. "
                             "Скачать: кабинет → ваше дело → ссылка «Памятка (PDF)» у цены.")
            await mailer.master_message(order_id)
        await db.add_event(order_id, "pamyatka_sent")
        return True
    except Exception as e:  # noqa: BLE001 — памятка не должна ломать сдачу
        log.warning("pamyatka send failed for %s: %s", order_id, e)
        return False


# ------------------------------------------------------------------ сдача

async def deliver_debt(o, part: int | None = None) -> dict:
    """Долг, который блокирует передачу части клиенту (правило владельца:
    «сначала оплата части — потом файл», без исключений по умолчанию).

    Повторная сдача той же части (правки по check/fix) не блокируется —
    клиент уже видел материал, придерживать исправления бессмысленно.
    Возвращает {amount, claimed, labels, part}; amount == 0 — путь свободен.
    """
    total = parts_total(o)
    p = max(1, min(part or o["stage"] or 1, total))
    if o["status"] in ("check", "fix") and (o["stage"] or 1) == p:
        return {"amount": 0, "claimed": False, "labels": [], "part": p}
    pays = await db.payments_for_order(o["id"])
    return {**payments.unpaid_for_part(o, pays, p), "part": p}


def debt_line(debt: dict) -> str:
    """Человеческая строка долга: «12 000 ₽ (оплата части 2)»."""
    labels = " + ".join(x.lower() for x in debt.get("labels", []))
    return (f"{config.fmt_money(debt['amount'])} ₽"
            + (f" ({labels})" if labels else ""))


async def deliver_part(bot: Bot, order_id: int, part: int | None = None,
                       note: str = "", via: str = "мастер",
                       force: bool = False) -> dict:
    """Мастер сдал часть работы: статус, оплата этапа, уведомление клиента.

    Файлы к этому моменту уже отправлены клиенту/сохранены (кто как сдаёт);
    здесь — только механика статусов и оплат.

    Жёсткое правило «сначала оплата — потом файл»: без force=True сдача
    НЕ фиксируется, пока этап части не оплачен (отметка клиента «я оплатил»
    не считается — нужна сверка). force — осознанный обход мастером,
    он остаётся в хронике событием delivered_unpaid.
    """
    o = await db.get_order(order_id)
    if not o:
        return {"ok": False}
    total = parts_total(o)
    part = max(1, min(part or o["stage"] or 1, total))
    redelivery = o["status"] in ("check", "fix") and (o["stage"] or 1) == part
    debt = await deliver_debt(o, part)
    if debt["amount"] > 0 and not redelivery:
        if not force:
            return {"ok": False, "error": "stage_unpaid", "part": part, "total": total,
                    "debt": debt["amount"], "claimed": debt["claimed"],
                    "labels": debt["labels"]}
        await db.add_event(order_id, "delivered_unpaid",
                           f"part {part}/{total} · долг {debt['amount']} ₽ · {via}")
    # часть передана — объявление «готова, ждёт оплату» исполнено
    await db.update_order(order_id, stage=part, part_ready=0)
    await db.set_status(order_id, "check",
                        f"{'исправленная ' if redelivery else ''}{part_label(o, part)} сдана · {via}")
    await db.add_event(order_id, "delivered", f"part {part}/{total}")

    o = await db.get_order(order_id)
    pays = await db.payments_for_order(order_id)
    kind, due = payments.due_now(o, pays)  # claimed сюда не попадает
    claimed = any(p["status"] == "claimed" for p in pays)
    no = config.order_no(order_id)

    # клиенту: файл уже у него, добавляем кнопки приёмки и, если этап не оплачен, — оплату
    if o["user_id"]:
        if total > 1:
            head = (f"📤 <b>Заказ {no}: передан {'обновлённый ' if redelivery else ''}"
                    f"результат — {part_label(o, part).lower()}</b>. Файл выше.\n\n")
            if part < total:
                head += ("Посмотрите материал. Всё в порядке — нажмите «Принять часть», "
                         "и мы продолжим. Есть замечания — «Нужны правки», это бесплатно.")
            else:
                head += ("Это финальная часть. Дальше сопровождаем работу до защиты: "
                         "замечания научного руководителя и предзащиты вносим бесплатно — "
                         "кнопка «Нужны правки». Когда все проверки пройдены, нажмите "
                         "«Принять и завершить».")
            if due > 0:
                head += (f"\n\n💳 За эту часть по плану — <b>{config.fmt_money(due)} ₽</b> "
                         f"({payments.stage_label(o, kind).lower()}). "
                         "Оплатить можно кнопкой ниже или в кабинете на сайте.")
            elif claimed:
                head += ("\n\n🧾 Ваша отметка об оплате — на сверке у мастера; "
                         "как подтвердится, пришлём уведомление.")
            await notify.notify_client(bot, o["user_id"], head,
                                       reply_markup=kb.delivered_kb(order_id, part, total,
                                                                    due if due > 0 else 0))
        else:
            await notify.notify_client(bot, o["user_id"],
                                       texts.WORK_DELIVERED.format(no=no),
                                       reply_markup=kb.delivered_kb(order_id))
    # финальная часть у клиента — вручаем персональную памятку «что дальше»
    if part >= total:
        await send_pamyatka(bot, order_id)
    await mailer.order_event(o, "status")
    await grp.status_sync(bot, order_id)

    # мастеру — «что дальше»: часть у клиента, бот следит за приёмкой и деньгами
    final_part = part >= total
    what = (f"Финал ({part_label(o, part)})" if final_part and total > 1
            else part_label(o, part).capitalize())
    head = (f"📦 <b>{'Исправленная версия — ' if redelivery else ''}"
            f"{what if not redelivery else what[0].lower() + what[1:]} "
            f"у клиента на проверке</b> · заказ {no}.\n")
    if final_part and total > 1:
        wait = ("Клиент может принять и завершить, попросить правки или нажать "
                "«ещё жду проверок» (научрук/предзащита). Финал сам не принимается — "
                "только руками.")
    elif total > 1:
        wait = ("Клиент решает: «принять часть» или «нужны правки». Полное молчание "
                f"7 дней = авто-приёмка (предупреждение на 5-й день).")
    else:
        wait = "Клиент решает: «принять работу» или «нужны правки»."
    if due > 0:
        money = (f"\n💳 Этап не оплачен: <b>{config.fmt_money(due)} ₽</b> "
                 f"({payments.stage_label(o, kind).lower()}) — счёт у клиента.")
    elif claimed:
        money = "\n🧾 Отметка клиента «я оплатил» на сверке — подтвердите поступление."
    else:
        money = "\n✅ Оплата этапа закрыта."
    next_kb = kb.after_deliver_kb(o, due if due > 0 else 0, claimed)
    g = await grp.send(bot, order_id, head + wait + money, reply_markup=next_kb)
    await notify.notify_admins(bot, head + wait + money, reply_markup=next_kb,
                               map_client=(o["user_id"], order_id) if o["user_id"] else None,
                               group_sent=bool(g))
    return {"ok": True, "part": part, "total": total, "due": due, "kind": kind,
            "redelivery": redelivery}


# ----------------------------------------------------------------- приёмка

async def accept_part(bot: Bot, order_id: int, who: str, via: str = "бот") -> dict:
    """Клиент принял текущую часть. Возвращает {ok, final, need_pay, next_part…}."""
    o = await db.get_order(order_id)
    if not o or o["status"] not in ("check", "fix"):
        return {"ok": False, "error": "not_on_review"}
    total = parts_total(o)
    part = o["stage"] or 1
    no = config.order_no(order_id)
    pays = await db.payments_for_order(order_id)

    if total > 1 and part < total:
        # промежуточная часть: фиксируем и продолжаем работу над следующей.
        # Оплата следующего этапа созреет, когда мастер объявит часть готовой.
        await db.update_order(order_id, parts_done=part, stage=part + 1, part_ready=0)
        await db.set_status(order_id, "work", f"часть {part}/{total} принята · {via}")
        await db.add_event(order_id, "part_accepted", f"{part}/{total}")
        o2 = await db.get_order(order_id)
        kind, due = payments.due_now(o2, pays)
        alert = (f"📗 {who} принял(а) часть {part}/{total} по заказу {no} — "
                 f"работаем над частью {part + 1}.\n"
                 f"Когда она будет готова — жмите «📣 Часть готова — счёт» (кнопка ниже): "
                 "клиент оплатит этап, файл передадите после оплаты.")
        if due > 0:
            # часть принята, а её этап не оплачен (мастер передал, доверившись)
            alert += (f"\n💳 Внимание: за принятую часть не оплачено "
                      f"{config.fmt_money(due)} ₽ ({payments.stage_label(o, kind).lower()}) — "
                      + ("клиенту отправлено напоминание со счётом."
                         if o["user_id"] else
                         "клиент без Telegram увидит счёт только в кабинете, "
                         "продублируйте просьбу в переписке."))
            if o["user_id"]:
                markup = kb.with_pay_url(
                    kb.prepay_kb(order_id),
                    await payments.online_link_for_order(o2, kind, due), due)
                await notify.notify_client(
                    bot, o["user_id"],
                    f"💳 Часть {part} по заказу {no} принята — по плану оплаты за неё "
                    f"<b>{config.fmt_money(due)} ₽</b> ({payments.stage_label(o, kind).lower()}). "
                    "Оплатить можно кнопкой ниже или в кабинете — и мы спокойно работаем дальше.",
                    reply_markup=markup)
        next_kb = kb.accepted_next_kb(o2, part + 1, total, due)
        g = await grp.send(bot, order_id, alert, reply_markup=next_kb)
        await grp.status_sync(bot, order_id)
        await notify.notify_admins(bot, alert, reply_markup=next_kb,
                                   map_client=(o["user_id"], order_id) if o["user_id"] else None,
                                   group_sent=bool(g))
        return {"ok": True, "final": False, "part": part, "total": total,
                "next_part": part + 1, "due": due}

    # финальная часть (или старый одноэтапный заказ)
    plan = payments.plan_state(o, pays)
    outstanding = sum(s["amount"] for s in plan if s["state"] != "paid")
    kind, due = payments.due_now(o, pays)
    if outstanding > 0:
        # приняли, но деньги ещё не дошли (или отметка на сверке):
        # завершим после подтверждения оплаты
        await db.update_order(order_id, parts_done=total)
        await db.add_event(order_id, "accept_wait_pay", f"{outstanding} ₽ ({kind})")
        on_check = any(s["state"] == "claimed" for s in plan)
        alert = (f"🎉 {who} принял(а) работу по заказу {no}. "
                 + (f"Отметка об оплате {config.fmt_money(outstanding)} ₽ на сверке — "
                    "подтвердите кнопкой ниже, и заказ закроется сам." if on_check and due <= 0 else
                    f"Остался финальный платёж {config.fmt_money(outstanding)} ₽ — "
                    "подтвердите кнопкой ниже, и заказ закроется сам."))
        wait_kb = kb.accept_wait_pay_kb(o, due or outstanding)
        g = await grp.send(bot, order_id, alert, reply_markup=wait_kb)
        await notify.notify_admins(bot, alert, reply_markup=wait_kb,
                                   map_client=(o["user_id"], order_id) if o["user_id"] else None,
                                   group_sent=bool(g))
        return {"ok": True, "final": True, "need_pay": True, "due": due or outstanding,
                "kind": kind, "on_check": on_check}

    await db.update_order(order_id, parts_done=total)
    await db.set_status(order_id, "done", f"клиент принял работу · {via}")
    await db.add_event(order_id, "work_accepted", via)
    alert = texts.ACCEPT_ALERT.format(who=who, no=no)
    g = await grp.send(bot, order_id, alert)
    await grp.status_sync(bot, order_id)
    await notify.notify_admins(bot, alert,
                               map_client=(o["user_id"], order_id) if o["user_id"] else None,
                               group_sent=bool(g))
    await mailer.order_event(await db.get_order(order_id), "status")
    await offer_defense(bot, order_id)
    return {"ok": True, "final": True, "need_pay": False}


# --------------------------------------- часть готова: счёт до передачи файла

async def part_ready(bot: Bot, order_id: int, via: str = "мастер") -> dict:
    """Мастер объявил: текущая часть готова, файл придержан до оплаты этапа.

    Для финальной части прозрачно переходит в final_ready (счёт на остаток).
    Клиент получает счёт с подписью «оплата части N» и реквизитами; после
    подтверждения оплаты мастеру придёт напоминание передать файл
    (payments.confirm → ветка part_ready).
    """
    o = await db.get_order(order_id)
    if not o:
        return {"ok": False, "error": "not_found"}
    total = parts_total(o)
    part = max(1, min(o["stage"] or 1, total))
    if total <= 1 or part >= total:
        return await final_ready(bot, order_id, via=via)
    if o["status"] not in ("work", "fix"):
        return {"ok": False, "error": "not_in_work"}
    pays = await db.payments_for_order(order_id)
    if (o["part_ready"] or 0) >= part:
        kind, due = payments.due_now(o, pays)
        return {"ok": False, "error": "already", "due": due, "part": part}
    await db.update_order(order_id, part_ready=part)
    await db.add_event(order_id, "part_ready", f"{part}/{total} · {via}")
    o = await db.get_order(order_id)
    kind, due = payments.due_now(o, pays)
    no = config.order_no(order_id)
    if due <= 0:
        # этап уже оплачен (или отметка на сверке) — придерживать нечего
        await db.update_order(order_id, part_ready=0)
        return {"ok": True, "due": 0, "part": part, "paid_already": True}
    label = payments.stage_label(o, kind)
    req = await db.setting_get("requisites")
    if o["user_id"]:
        body = (f"📘 <b>Результат этапа {part} по заказу {no} подготовлен.</b>\n\n"
                f"Мы работаем по правилу «сначала оплата этапа — потом файл»: "
                f"часть передаётся после оплаты <b>{config.fmt_money(due)} ₽</b> "
                f"({label.lower()}).\n\n"
                + (f"💳 <b>Реквизиты:</b>\n{esc(req)}\n\n" if req else "")
                + "Как только мастер подтвердит поступление, файл придёт сюда и в "
                  "кабинет на сайте — и сопровождение продолжится без пауз.")
        markup = kb.with_pay_url(kb.prepay_kb(order_id),
                                 await payments.online_link_for_order(o, kind, due), due)
        markup = kb.with_cab_url(markup, await notify.order_link(order_id),
                                 "💼 План оплат — в кабинете")
        await notify.notify_client(bot, o["user_id"], body, reply_markup=markup)
    await mailer.order_event(o, "part_ready", amount=due, part=part)
    alert = (f"📘 Часть {part}/{total} по заказу {no} объявлена готовой: клиент получил "
             f"счёт на {config.fmt_money(due)} ₽ ({label.lower()}). Файл держим: увидели "
             "поступление — жмите «Оплата получена», и бот напомнит передать файл.")
    ann_kb = kb.announced_kb(o)
    g = await grp.send(bot, order_id, alert, reply_markup=ann_kb)
    await notify.notify_admins(bot, alert, reply_markup=ann_kb,
                               map_client=(o["user_id"], order_id) if o["user_id"] else None,
                               group_sent=bool(g))
    return {"ok": True, "due": due, "part": part, "kind": kind}


# --------------------------------------------------- финал под оплату

async def final_ready(bot: Bot, order_id: int, via: str = "мастер") -> dict:
    """Мастер объявил: финальная часть готова, файл придержан до полной оплаты.

    Клиент получает счёт на остаток; после подтверждения оплаты мастеру
    придёт напоминание передать файл (payments.confirm → ветка rest).
    """
    o = await db.get_order(order_id)
    if not o or o["status"] not in ("work", "fix", "check"):
        return {"ok": False, "error": "not_in_work"}
    pays = await db.payments_for_order(order_id)
    if o["final_ready"]:
        kind, due = payments.due_now(o, pays)
        return {"ok": False, "error": "already", "due": due}
    await db.update_order(order_id, final_ready=1, final_ready_at=db.now_iso())
    await db.add_event(order_id, "final_ready", via)
    o = await db.get_order(order_id)
    kind, due = payments.due_now(o, pays)
    no = config.order_no(order_id)
    if due <= 0:
        # всё уже оплачено — придерживать нечего, просто скажем мастеру
        await db.update_order(order_id, final_ready=0, final_ready_at=None)
        return {"ok": True, "due": 0}
    req = await db.setting_get("requisites")
    if o["user_id"]:
        body = (f"🏁 <b>Итоговый результат по заказу {no} подготовлен.</b>\n\n"
                f"Мастер завершил финальный этап — результат передаётся после закрытия "
                f"остатка: <b>{config.fmt_money(due)} ₽</b>.\n\n"
                + (f"💳 <b>Реквизиты:</b>\n{esc(req)}\n\n" if req else "")
                + "Как только мастер подтвердит поступление, файлы сразу придут сюда "
                  "и в кабинет — и мы останемся на связи до вашей защиты.")
        markup = kb.with_pay_url(kb.prepay_kb(order_id),
                                 await payments.online_link_for_order(o, kind, due), due)
        markup = kb.with_cab_url(markup, await notify.order_link(order_id),
                                 "💼 План оплат — в кабинете")
        await notify.notify_client(bot, o["user_id"], body, reply_markup=markup)
    await mailer.order_event(o, "final_ready", amount=due)
    alert = (f"🏁 Финал по заказу {no} объявлен готовым: клиент получил счёт на остаток "
             f"{config.fmt_money(due)} ₽. Файл держим: увидели поступление — жмите "
             "«Оплата получена», и бот напомнит передать финал.")
    ann_kb = kb.announced_kb(o)
    g = await grp.send(bot, order_id, alert, reply_markup=ann_kb)
    await notify.notify_admins(bot, alert, reply_markup=ann_kb,
                               map_client=(o["user_id"], order_id) if o["user_id"] else None,
                               group_sent=bool(g))
    return {"ok": True, "due": due, "kind": kind}


# --------------------------------------------------- напоминание об оплате

async def remind_payment(bot: Bot, order_id: int, via: str = "мастер",
                         auto: bool = False) -> dict:
    """Вежливо повторить клиенту счёт созревшего этапа (кнопка мастера и авто).

    Ничего не выставляет заново — просто доносит уже существующий долг
    с реквизитами, кассой и понятным «почему»: часть/финал придержаны,
    предоплата перед стартом или оплата уже переданной части.
    """
    o = await db.get_order(order_id)
    if not o or o["status"] in ("done", "cancel"):
        return {"ok": False, "error": "not_active"}
    if o["paused"]:
        return {"ok": False, "error": "paused"}
    pays = await db.payments_for_order(order_id)
    kind, due = payments.due_now(o, pays)
    if due <= 0:
        claimed = any(p["status"] == "claimed" for p in pays)
        return {"ok": False, "error": "claimed" if claimed else "nothing_due"}
    label = payments.planned_label(o, kind, payments.stage_plan(o))
    part = payments.kind_stage(o, kind)
    no = config.order_no(order_id)
    if o["final_ready"] and o["status"] in ("work", "fix"):
        why = ("Итоговый результат подготовлен и ждёт передачи — по правилу мастерской "
               "финальный пакет уходит после закрытия остатка.")
    elif (o["part_ready"] or 0) and o["status"] in ("work", "fix"):
        why = (f"Результат этапа {o['part_ready']} подготовлен и ждёт передачи — файл уходит "
               "сразу после оплаты этапа.")
    elif o["status"] == "prepay":
        why = "Мы готовы начать: согласованный этап стартует сразу после первого платежа."
    elif o["status"] in ("check", "fix"):
        why = f"Часть {part} уже у вас на проверке — за неё по плану оплата этапа."
    else:
        why = "По плану оплат созрел очередной этап."
    req = await db.setting_get("requisites")
    delivered_tg = False
    if o["user_id"]:
        body = (f"🔔 <b>Напоминание по заказу {no}: {label.lower()} — "
                f"{config.fmt_money(due)} ₽.</b>\n\n{why}\n\n"
                + (f"💳 <b>Реквизиты:</b>\n{esc(req)}\n\n" if req else "")
                + "Оплатить можно кнопкой ниже или в кабинете на сайте. Если уже "
                  "перевели — нажмите «Я оплатил(а)»; вопросы можно писать прямо сюда.")
        markup = kb.with_pay_url(kb.prepay_kb(order_id),
                                 await payments.online_link_for_order(o, kind, due), due)
        markup = kb.with_cab_url(markup, await notify.order_link(order_id),
                                 "💼 Оплата и план — в кабинете")
        delivered_tg = await notify.notify_client(bot, o["user_id"], body,
                                                  reply_markup=markup)
    mailed = await mailer.order_event(o, "pay_reminder", amount=due, label=label)
    await db.add_event(order_id, "pay_reminder",
                       f"{kind} {due} ₽ · {'авто' if auto else via}")
    return {"ok": True, "due": due, "kind": kind, "label": label,
            "delivered_tg": delivered_tg, "mailed": mailed}


# ------------------------------------------- защищённый предпросмотр работы

async def send_preview(bot: Bot, order_id: int, data: bytes, filename: str,
                       via: str = "мастер") -> dict:
    """Отправить клиенту защищённый предпросмотр файла (оригинал НЕ уходит).

    Развязка спора «покажи работу — сначала оплати»: клиент видит документ
    целиком, но сдать/скопировать его нельзя (растровые страницы с вожжёнными
    водяными знаками). Вместе с предпросмотром клиент получает кнопки оплаты
    созревшего этапа — оригинал уходит после подтверждения, как обычно.
    """
    o = await db.get_order(order_id)
    if not o:
        return {"ok": False, "error": "not_found"}
    from . import preview  # локальный импорт: PyMuPDF тяжёлый, нужен не всем
    if not preview.can_convert(filename):
        return {"ok": False, "error": "preview_format"}
    pv = await preview.build(data, filename, order_id)
    if not pv:
        return {"ok": False, "error": "preview_failed"}
    no = config.order_no(order_id)
    pays = await db.payments_for_order(order_id)
    kind, due = payments.due_now(o, pays)
    pv_name = f"predprosmotr-{order_id}.pdf"
    from aiogram.types import BufferedInputFile
    tg_file_id = None
    if o["user_id"] and o["user_id"] > 0:
        try:
            doc = await bot.send_document(
                o["user_id"], BufferedInputFile(pv, filename=pv_name),
                caption=(f"🔒 Предпросмотр по заказу {no} — защищённая копия для проверки."))
            if doc.document:
                tg_file_id = doc.document.file_id
            body = (f"🔒 <b>Заказ {no}: предпросмотр результата</b> — файл выше.\n\n"
                    "Это защищённая копия: водяные знаки на каждой странице, текст "
                    "не выделяется и не копируется. Проверьте материал спокойно — "
                    "оригинальный файл придёт сюда сразу после оплаты этапа.")
            markup = None
            if due > 0:
                body += (f"\n\n💳 К оплате сейчас: <b>{config.fmt_money(due)} ₽</b> "
                         f"({payments.stage_label(o, kind).lower()}) — кнопки ниже.")
                markup = kb.with_pay_url(
                    kb.prepay_kb(order_id),
                    await payments.online_link_for_order(o, kind, due), due)
            await notify.notify_client(bot, o["user_id"], body, reply_markup=markup)
        except Exception:  # noqa: BLE001
            log.warning("preview: client TG delivery failed", exc_info=True)
    # копия в ветку заказа — и file_id для кабинета гостя без Telegram
    gmsg = await grp.send_document(
        bot, order_id,
        tg_file_id or BufferedInputFile(pv, filename=pv_name),
        caption=f"🔒 Предпросмотр · заказ {no} (копия; оригинал у мастера)")
    if not tg_file_id and gmsg and gmsg.document:
        tg_file_id = gmsg.document.file_id
    if not tg_file_id:
        return {"ok": False, "error": "relay_failed"}
    await db.add_file(order_id, "admin", tg_file_id, None, pv_name, len(pv),
                      "document", label="превью")
    await db.msg_add(order_id, "master", None, kind="document",
                     file_name=pv_name, tg_file_id=tg_file_id)
    await db.add_event(order_id, "preview_sent", f"{filename[:80]} · {via}")
    await mailer.master_message(order_id)
    return {"ok": True, "due": due, "kind": kind}


async def offer_defense(bot: Bot, order_id: int) -> None:
    """После завершения — мягкие предложения (каждое один раз, отказ — крестик).

    Три сюжета: услуги «к защите» (если заказ не был услугой); остаток
    подарочного сертификата — потратить на презентацию/речь; живой промокод
    клиента, который он вводил, но так и не потратил.
    """
    o = await db.get_order(order_id)
    if not o or not o["user_id"]:
        return
    from . import gift as gift_svc  # локальный импорт против циклов
    no = config.order_no(order_id)
    gift = await gift_svc.order_gift_info(o)
    rest = (gift if gift and gift.get("state") == "active"
            and int(gift.get("balance") or 0) > 0 else None)
    is_svc = (o["work_type"] or "").startswith("svc_")
    if not is_svc and not await db.has_event(order_id, "defense_offered"):
        await db.add_event(order_id, "defense_offered")
        body = texts.DEFENSE_OFFER.format(no=no)
        if rest:
            body += texts.GIFT_REST_DEFENSE_LINE.format(
                code=rest["code"], balance=config.fmt_money(rest["balance"]))
        await notify.notify_client(bot, o["user_id"], body,
                                   reply_markup=kb.defense_offer_kb(order_id))
    elif rest and not await db.has_event(order_id, "gift_rest_offered"):
        # заказ был услугой (или защита уже предлагалась), а остаток живой
        await db.add_event(order_id, "gift_rest_offered")
        g = await db.gift_by_code(rest["code"])
        expires = gift_svc.ru_date(g["expires_at"]) if g and g["expires_at"] else "конца срока"
        fits = [s for s in config.SERVICES if s.from_price <= rest["balance"]]
        enough = (texts.GIFT_REST_ENOUGH_FULL.format(
            svc=max(fits, key=lambda s: s.from_price).label)
            if fits else texts.GIFT_REST_ENOUGH_PART)
        await notify.notify_client(
            bot, o["user_id"],
            texts.GIFT_REST_OFFER.format(
                code=rest["code"], balance=config.fmt_money(rest["balance"]),
                expires=expires, enough=enough),
            reply_markup=kb.gift_rest_kb(order_id, rest["code"]))
    # промокод, который клиент вводил, но так и не потратил — напомнить
    if not await db.has_event(order_id, "promo_reminded"):
        p = await db.promo_unused_for_user(o["user_id"])
        if p:
            from . import promo as promo_svc
            await db.add_event(order_id, "promo_reminded")
            await notify.notify_client(
                bot, o["user_id"],
                texts.PROMO_REMINDER.format(code=esc(p["code"]),
                                            label=promo_svc.label(p)),
                reply_markup=kb.promo_reminder_kb(p["code"]))


async def finalize_if_ready(bot: Bot, order_id: int) -> bool:
    """Финальный платёж подтверждён: если клиент уже принял работу — закрыть заказ."""
    o = await db.get_order(order_id)
    if not o or o["status"] in ("done", "cancel"):
        return False
    if not await db.has_event(order_id, "accept_wait_pay"):
        return False
    pays = await db.payments_for_order(order_id)
    plan = payments.plan_state(o, pays)
    if any(s["state"] != "paid" for s in plan):
        return False  # остались неоплаченные или неподтверждённые этапы
    await db.set_status(order_id, "done", "финальная оплата получена, работа принята")
    no = config.order_no(order_id)
    if o["user_id"]:
        await notify.notify_client(bot, o["user_id"], texts.ORDER_DONE.format(no=no),
                                   reply_markup=kb.review_invite_kb(order_id))
    await grp.send(bot, order_id, f"🏁 Заказ {no} завершён: работа принята, оплата закрыта.")
    await grp.status_sync(bot, order_id)
    await mailer.order_event(await db.get_order(order_id), "status")
    await offer_defense(bot, order_id)
    return True


# ------------------------------------------------------------------ правки

async def _last_event_at(order_id: int, kind: str,
                         data_prefix: str | None = None) -> str | None:
    """Время свежайшего события такого рода (события идут новые → старые)."""
    events = await db.events_for_order(order_id, limit=200)
    for e in events:
        if e["kind"] == kind and (data_prefix is None
                                  or (e["data"] or "").startswith(data_prefix)):
            return e["created_at"]
    return None


def _days_since(iso: str | None) -> int | None:
    from datetime import datetime, timezone
    if not iso:
        return None
    try:
        ts = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    return max(0, (datetime.now(timezone.utc) - ts).days)


async def fix_window_state(o) -> dict:
    """Где запрос правок относительно окон оферты (р. 9) / спецификации (р. 5).

    Возвращает {state, age}: 'in' — в окне проверки; 'vuz_only' — окно проверки
    прошло, бесплатны только документированные замечания вуза; 'expired' —
    сервисное окно истекло (для финала); age — дней с передачи. Только для
    финальной части: промежуточные закрываются авто-приёмкой.
    """
    total = parts_total(o)
    part = o["stage"] or 1
    if total > 1 and part < total:
        return {"state": "in", "age": None}
    delivered_at = await _last_event_at(o["id"], "delivered", f"part {part}/")
    age = _days_since(delivered_at)
    if age is None:
        return {"state": "in", "age": None}
    limit = 60
    wait_at = await _last_event_at(o["id"], "wait_checks")
    if wait_at and delivered_at and wait_at > delivered_at:
        limit = 180  # клиент предупредил о более поздней защите — окно продлено
    if age > limit:
        return {"state": "expired", "age": age, "limit": limit}
    if age > 7:
        return {"state": "vuz_only", "age": age, "limit": limit}
    return {"state": "in", "age": age}


async def request_fixes(bot: Bot, order_id: int, who: str, comment: str = "",
                        via: str = "бот") -> dict:
    """Клиент просит правки. Количество безлимитно; окна сроков (оферта р. 9)
    система подсказывает мастеру, решение — за ним."""
    o = await db.get_order(order_id)
    if not o or o["status"] not in ("check", "fix", "done"):
        return {"ok": False, "error": "not_on_review"}
    total = parts_total(o)
    part = o["stage"] or 1
    win = await fix_window_state(o)
    await db.set_status(order_id, "fix", f"правки по {part_label(o, part)} · {via}")
    await db.add_event(order_id, "fix_requested",
                       f"part {part}/{total}"
                       + (f" · окно: {win['state']} ({win['age']} дн.)"
                          if win.get("age") is not None else ""))
    if comment:
        await db.msg_add(order_id, "client", comment)
    no = config.order_no(order_id)
    alert = texts.FIX_ALERT.format(no=no, who=who)
    if total > 1:
        alert += f" (часть {part} из {total})"
    if comment:
        alert += f"\n{esc(comment)}"
    if win["state"] == "expired":
        alert += (f"\n⏳ <b>Сервисное окно истекло</b> ({win['age']} дн. с передачи "
                  f"финала, лимит {win['limit']}) — по спецификации (п. 5.4) такие "
                  "правки оцениваются как отдельная услуга. Решение за вами.")
    elif win["state"] == "vuz_only":
        alert += (f"\n⏳ Окно проверки (7 дн.) прошло — {win['age']} дн. с передачи. "
                  "Бесплатны только документированные замечания научрука/комиссии "
                  "(п. 5.3 спецификации); прочее — отдельная услуга (п. 5.4).")
    alert += ("\n\nОтветить клиенту можно прямо здесь; исправленная версия сдаётся "
              "файлом в эту ветку — счёт этап повторно не выставляет.")
    fix_kb = kb.fix_alert_kb(o)
    g = await grp.send(bot, order_id, alert, reply_markup=fix_kb)
    await grp.status_sync(bot, order_id)
    await notify.notify_admins(bot, alert, reply_markup=fix_kb,
                               map_client=(o["user_id"], order_id) if o["user_id"] else None,
                               group_sent=bool(g))
    if win["state"] == "expired":
        expired_text = (
            f"Запрос правок по заказу {no} принят. Обратите внимание: сервисное окно "
            f"бесплатных доработок истекло ({win['age']} дн. с передачи финала — "
            "пп. 5.3–5.4 спецификации), поэтому мастер оценит объём и предложит "
            "условия. Если у вас документированные замечания научного руководителя "
            "или комиссии — приложите их, это ускорит решение.")
        if o["user_id"] and o["user_id"] > 0:
            await notify.notify_client(bot, o["user_id"], expired_text)
        else:
            # гость без Telegram видел стандартное «исправим и вернём» и ждал
            # бесплатной доработки — честное объяснение кладём в ленту дела
            await db.msg_add(order_id, "master", expired_text)
            await mailer.master_message(order_id)
    return {"ok": True, "part": part, "total": total, "window": win["state"]}


async def ack_fixes(bot: Bot, order_id: int, via: str = "бот") -> dict:
    """Мастер взял правки в работу: честный сигнал клиенту вместо тишины.

    Идемпотентно в рамках одного запроса правок: повторное нажатие после
    последнего fix_requested не дублирует сообщение клиенту.
    """
    o = await db.get_order(order_id)
    if not o:
        return {"ok": False, "error": "not_found"}
    if o["status"] != "fix":
        return {"ok": False, "error": "not_in_fix"}
    events = await db.events_for_order(order_id, limit=50)
    for e in events:  # новые сверху: что случилось позже — ack или запрос?
        if e["kind"] == "fix_ack":
            return {"ok": False, "error": "already"}
        if e["kind"] == "fix_requested":
            break
    await db.add_event(order_id, "fix_ack", via)
    # видно и в Telegram, и в ленте кабинета на сайте
    await db.msg_add(order_id, "master",
                     "🛠 Замечания приняты в работу — готовим исправленную версию.")
    delivered = False
    if o["user_id"]:
        delivered = await notify.notify_client(
            bot, o["user_id"],
            f"🛠 <b>Мастер взял ваши правки в работу</b> · заказ {config.order_no(order_id)}.\n\n"
            "Исправленная версия придёт сюда и в кабинет на сайте — счёт за это "
            "не выставляется, правки в рамках задания бесплатны.")
    return {"ok": True, "delivered_tg": delivered}


async def remind_review(bot: Bot, order_id: int, via: str = "мастер") -> dict:
    """Мягко напомнить клиенту, что часть ждёт его проверки (кнопка мастера).

    Не путать с напоминанием об оплате: здесь зовём посмотреть материал
    и решить — «принять» или «нужны правки». Не чаще раза в 6 часов.
    """
    o = await db.get_order(order_id)
    if not o or o["status"] != "check":
        return {"ok": False, "error": "not_on_review"}
    if o["paused"]:
        return {"ok": False, "error": "paused"}
    last = await _last_event_at(order_id, "review_nudge")
    if last:
        from datetime import datetime, timedelta, timezone
        try:
            ts = datetime.strptime(last, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - ts < timedelta(hours=6):
                return {"ok": False, "error": "too_often"}
        except ValueError:
            pass
    total = parts_total(o)
    part = o["stage"] or 1
    pays = await db.payments_for_order(order_id)
    kind, due = payments.due_now(o, pays)
    no = config.order_no(order_id)
    delivered = False
    if o["user_id"]:
        final_part = part >= total
        body = (f"🕊 <b>Напоминание по заказу {no}:</b> {part_label(o, part)} ждёт "
                "вашего взгляда — файл в этом чате и в кабинете на сайте.\n\n"
                + ("Всё проверено — «Принять и завершить»; ждёте научрука — так и "
                   "напишите, дело никуда не денется. Замечания? «Нужны правки» — "
                   "бесплатно." if final_part else
                   "Всё в порядке — нажмите «Принять часть», и мастер продолжит. "
                   "Есть замечания — «Нужны правки», это бесплатно.")
                + (f"\n\n💳 За эту часть по плану — <b>{config.fmt_money(due)} ₽</b> "
                   f"({payments.stage_label(o, kind).lower()})." if due > 0 else ""))
        delivered = await notify.notify_client(
            bot, o["user_id"], body,
            reply_markup=kb.delivered_kb(order_id, part, total, due if due > 0 else 0))
    await db.add_event(order_id, "review_nudge", via)
    return {"ok": True, "delivered_tg": delivered, "part": part}


async def unclaim_payment(bot: Bot, order_id: int, via: str = "мастер") -> dict:
    """Мастер сверил поступления и не нашёл платёж: честно снять отметку клиента.

    Отметка возвращается в pending, клиенту — вежливое объяснение с кнопками
    оплаты и просьбой о чеке. Ничего не удаляется — только статус отметки.
    """
    o = await db.get_order(order_id)
    if not o:
        return {"ok": False, "error": "not_found"}
    pays = await db.payments_for_order(order_id)
    row = next((p for p in pays if p["status"] == "claimed"), None)
    if not row:
        return {"ok": False, "error": "no_claim"}
    await db.payment_set_status(row["id"], "pending")
    await db.add_event(order_id, "payment_unmarked", f"мастер · {via}")
    label = payments.stage_label(o, row["kind"])
    no = config.order_no(order_id)
    delivered = False
    if o["user_id"]:
        markup = kb.with_pay_url(
            kb.unpaid_kb(order_id),
            await payments.online_link_for_order(o, row["kind"], row["amount"] or 0),
            row["amount"] or 0)
        delivered = await notify.notify_client(
            bot, o["user_id"],
            f"🔎 <b>По заказу {no} мастер сверил поступления:</b> платёж "
            f"«{label.lower()}» ({config.fmt_money(row['amount'] or 0)} ₽) пока не найден, "
            "поэтому отметку об оплате мы сняли.\n\n"
            "Такое бывает: перевод ещё идёт или реквизиты перепутались. Проверьте, "
            "пожалуйста, чек — и пришлите его сюда, разберёмся быстро. Кнопки оплаты "
            "снова активны ниже.",
            reply_markup=markup)
    return {"ok": True, "amount": row["amount"] or 0, "label": label,
            "delivered_tg": delivered}


# -------------------------------------------------------------- возобновление

async def resume_order(bot: Bot, order_id: int, who: str, via: str = "бот",
                       by_master: bool = False) -> dict:
    """Возобновить отменённый заказ: вернуть статус и ДЕЙСТВИЯ обеим сторонам.

    Клиент получает карточку с кнопками (принять цену/обсудить), мастер —
    карточку заказа в группу: никто не остаётся с голым текстом.
    """
    o = await db.get_order(order_id)
    if not o or o["status"] != "cancel":
        return {"ok": False, "error": "not_canceled"}
    new_status = "priced" if o["price"] else "new"
    await db.set_status(order_id, new_status, f"возобновлён · {via}")
    await db.update_order(order_id, cancel_reason=None, archived_client=0, archived_admin=0)
    # сертификат, если был привязан, снова зачитывается (остаток мог измениться)
    from . import gift as gift_svc
    await gift_svc.sync_order(bot, order_id)
    no = config.order_no(order_id)

    if by_master:
        if o["user_id"]:
            if o["price"]:
                await notify.notify_client(
                    bot, o["user_id"],
                    f"🔄 <b>Заказ {no} снова в работе.</b>\n\n" +
                    texts.PRICE_OFFER.format(
                        no=no, price=config.fmt_money(o["price"]), prepay_part="") +
                    texts.plan_offer_block(payments.stage_plan(o), config.fmt_money),
                    reply_markup=kb.price_offer(order_id))
            else:
                await notify.notify_client(
                    bot, o["user_id"],
                    f"🔄 <b>Заказ {no} снова в работе.</b> Мастер вернулся к вашей заявке — "
                    "детали в «📚 Мои заказы» и в кабинете на сайте.")
        alert = f"🔄 Заказ {no} возобновлён мастером."
        g = await grp.send(bot, order_id, alert)
    else:
        alert = f"🔄 {who} возобновил(а) заказ {no} — он снова в работе."
        g = await grp.send_card(bot, order_id, alert=alert)
        await notify.notify_admins(bot, alert,
                                   map_client=(o["user_id"], order_id) if o["user_id"] else None,
                                   group_sent=bool(g))
    await grp.status_sync(bot, order_id)
    await mailer.order_event(await db.get_order(order_id), "status")
    return {"ok": True, "status": new_status, "priced": bool(o["price"])}


# ------------------------------------------------------------------ отзывы

async def submit_review(
    bot: Bot,
    order_id: int,
    rating: int,
    text: str | None,
    author: str | None,
    via: str = "бот",
    *,
    publication_consent: bool = False,
    publication_categories: dict[str, bool] | None = None,
    publication_consent_doc: str | None = None,
) -> int:
    """Отзыв клиента: сохранить, показать мастеру в ветке заказа, ждать модерации."""
    o = await db.get_order(order_id)
    review_id = await db.review_upsert(
        order_id,
        o["user_id"] if o else None,
        rating,
        text,
        author,
        publication_consent=publication_consent,
        publication_categories=publication_categories,
        publication_consent_doc=publication_consent_doc,
    )
    await db.add_event(order_id, "review", f"{rating}★ · {via}")
    stars = "★" * max(1, min(rating, 5)) + "☆" * (5 - max(1, min(rating, 5)))
    no = config.order_no(order_id)
    body = (f"⭐ <b>Отзыв по заказу {no}</b> · {stars}\n"
            + (f"«{esc(text)}»\n" if text else "<i>Без текста — только оценка.</i>\n")
            + (f"Подпись: {esc(author)}\n" if author else "")
            + (
                "\nОтдельное согласие на публикацию зафиксировано. Опубликовать на сайте?"
                if publication_consent
                else "\n⚠️ Отдельного согласия на публикацию нет: отзыв можно хранить,"
                     " но нельзя публиковать."
            ))
    moderation_kb = kb.review_moderate_kb(review_id) if publication_consent else None
    g = await grp.send(bot, order_id, body, reply_markup=moderation_kb)
    await notify.notify_admins(bot, body, reply_markup=moderation_kb,
                               map_client=(o["user_id"], order_id) if o and o["user_id"] else None,
                               group_sent=bool(g))
    return review_id


async def moderate_review(bot: Bot, review_id: int, approve: bool) -> str:
    r = await db.review_get(review_id)
    if not r:
        return "not_found"
    result = await db.review_moderate(
        review_id, "approved" if approve else "rejected"
    )
    if result not in ("approved", "rejected"):
        return result
    o = await db.get_order(r["order_id"])
    if approve and o and o["user_id"]:
        await notify.notify_client(
            bot, o["user_id"],
            f"💛 Ваш отзыв по заказу {config.order_no(o['id'])} опубликован на сайте — "
            "спасибо, что нашли время!")
    return result
