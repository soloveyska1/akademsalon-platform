"""Фоновые задачи (один цикл раз в минуту):
— пинг админу о заявках без ответа >30 мин;
— ежедневный дайджест в 9:00 МСК;
— напоминания о дедлайнах (за 3 дня и за 1 день, в 10:00 МСК);
— мягкий follow-up клиенту, если работа 48 ч висит «на проверке».
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from aiogram import Bot

from .. import config, db, texts
from .. import keyboards as kb
from ..config import ST, order_no
from . import mailer, notify

log = logging.getLogger(__name__)

PING_AFTER_MIN = 30
FOLLOWUP_AFTER_H = 48


async def run(bot: Bot) -> None:
    log.info("scheduler started")
    while True:
        try:
            await _tick(bot)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 — цикл не должен умирать
            log.exception("scheduler tick failed")
        await asyncio.sleep(60)


async def _tick(bot: Bot) -> None:
    now_msk = datetime.now(config.MSK)
    # Выдача файлов важнее маркетинговых задач: восстанавливаем её каждый tick.
    from . import handoff
    await handoff.retry_pending(bot)
    await _ping_stale_new_orders(bot)
    await _client_followups(bot)
    await _channel_sweep_maybe()
    if now_msk.hour >= 9:
        await _once_a_day(bot, "digest_date", _send_digest)
        # сертификаты: вручение к дате — утром, чтобы подарок пришёл к завтраку
        await _once_a_day(bot, "gifts_date", _gifts_sweep)
    if now_msk.hour >= 10:
        await _once_a_day(bot, "deadline_date", _send_deadline_reminders)
        await _once_a_day(bot, "curator_date", _curator_reminders)
    if now_msk.hour >= 11:
        await _once_a_day(bot, "bonus_sweep_date", _bonus_sweep)
        await _once_a_day(bot, "subs_sweep_date", _subs_sweep)
    if now_msk.hour >= 12:
        await _once_a_day(bot, "payrem_date", _payment_reminders)
        await _once_a_day(bot, "autoaccept_date", _auto_accept_parts)
        await _once_a_day(bot, "payrec_date", _reconcile_payments)



async def _reconcile_payments(bot: Bot) -> None:
    """Сверка раз в сутки. Ловит потерянные вебхуки и зависшие сверки:
    (а) pending-счёт Robokassa старше суток — с координатами, а не голым числом;
    (б) отметка «я оплатил» (claimed) старше суток — сверка забыта;
    (в) заявка ещё live, а платёж по заказу уже paid — доснять акцепт;
    (г) заявка истекла — её незакрытые счета больше не действуют.
    Полное авто-восстановление требует опроса OpState Robokassa — отдельная
    задача; здесь ловим расхождение и не теряем оплату молча."""
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz
    from . import payments as pay_svc
    stale = (_dt.now(_tz.utc) - _td(hours=24)).strftime("%Y-%m-%dT%H:%M:%S")
    rows = await db.payments_pending_older_than(stale, method="robokassa")
    if rows:
        lines = []
        for p in rows[:5]:
            o = await db.get_order(p["order_id"])
            lbl = pay_svc.stage_label(o, p["kind"]) if o else p["kind"]
            lines.append(f"— заказ {order_no(p['order_id'])}: {lbl}, "
                         f"{config.fmt_money(p['amount'])} ₽, счёт от "
                         f"{(p['created_at'] or '')[:10]} (InvId {p['id']})")
        more = f"\n…и ещё {len(rows) - 5}" if len(rows) > 5 else ""
        await notify.notify_admins(bot,
            f"\U0001F50E Pending-счета Robokassa старше суток — сверьте с выпиской "
            f"(потерянный вебхук неотличим от брошенной кассы):\n"
            + "\n".join(lines) + more)
    claimed = await db.payments_claimed_older_than(stale)
    if claimed:
        lines = []
        for p in claimed[:5]:
            o = await db.get_order(p["order_id"])
            lbl = pay_svc.stage_label(o, p["kind"]) if o else p["kind"]
            lines.append(f"— заказ {order_no(p['order_id'])}: {lbl}, "
                         f"{config.fmt_money(p['amount'])} ₽")
        more = f"\n…и ещё {len(claimed) - 5}" if len(claimed) > 5 else ""
        await notify.notify_admins(bot,
            "⏳ Отметки «я оплатил» ждут вашей сверки больше суток — клиент "
            "видит «ждём подтверждения» и не может платить дальше:\n"
            + "\n".join(lines) + more)
    for off in await db.offers_live_with_paid_payment():
        await db.offer_mark_paid(off["order_id"], method="reconcile")
    # счета истёкших заявок: оплата после смерти условий не должна проходить
    for off in await db.offers_expired_with_pending():
        await db.payments_cancel_pending(off["order_id"])

_channel_last = 0.0


async def _channel_sweep_maybe() -> None:
    """Витрина канала: свежие посты каждые ~15 минут (и сразу на старте)."""
    global _channel_last
    import time as _time
    if _time.time() - _channel_last < 15 * 60:
        return
    _channel_last = _time.time()
    from . import channel
    try:
        await channel.sweep()
    except Exception as e:  # noqa: BLE001 — витрина не должна ронять цикл
        # t.me с российского VPS обычно заблокирован — это ожидаемо:
        # реалтайм-пополнение витрины делает бот-админ канала (channel_feed)
        log.info("channel sweep недоступен (%s) — витрину ведёт бот-админ",
                 e.__class__.__name__)


async def _gifts_sweep(bot: Bot) -> None:
    """Сертификаты: доставка к дате, предупреждение и фиксация сгорания,
    закрытие тухлых неоплаченных оформлений."""
    from . import gift
    await gift.sweep(bot)


async def _bonus_sweep(bot: Bot) -> None:
    """Сгорание бонусов: предупредить за 3 дня, списать просроченное."""
    from . import bonus
    await bonus.sweep_expiring(bot)


PAY_REMIND_MAX = 3          # напоминаний на один этап, дальше — алерт мастеру
PAY_REMIND_AFTER_H = 20     # не раньше чем через ~сутки после счёта/прошлого раза

ACCEPT_WARN_D = 5           # предупреждение «через 2 дня часть будет принята»
ACCEPT_AUTO_D = 7           # окно проверки части (оферта 4.4, спецификация 4.2)


async def _auto_accept_parts(bot: Bot) -> None:
    """Окно проверки: 7 дней полного молчания = промежуточная часть принята.

    Приводит договор в действие (оферта 4.4): клиент дважды предупреждён
    (followup 48 ч + предупреждение на 5-й день), любые сообщения или действия
    клиента после передачи отменяют авто-приёмку — тогда решает мастер.
    Финальная часть не авто-принимается никогда."""
    from . import flow
    rows = await db.orders_where(
        "WHERE status='check' AND coalesce(paused,0)=0 AND coalesce(stages_total,1) > 1")
    for o in rows:
        try:
            total = o["stages_total"] or 1
            part = o["stage"] or 1
            if part >= total:
                continue  # финал — только руками клиента или мастера
            events = await db.events_for_order(o["id"], limit=150)
            delivered_at = None
            for e in events:
                if e["kind"] == "delivered" and (e["data"] or "").startswith(f"part {part}/"):
                    delivered_at = e["created_at"]
                    break
            if not delivered_at:
                continue
            if any(e["kind"] in ("client_msg", "fix_requested", "payment_marked",
                                 "receipt", "cancel_request", "wait_checks")
                   and e["created_at"] > delivered_at for e in events):
                continue  # клиент на связи — окно оставляем мастеру и клиенту
            try:
                ts = datetime.strptime(delivered_at, "%Y-%m-%dT%H:%M:%S") \
                    .replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            age = (datetime.now(timezone.utc) - ts).days
            no = order_no(o["id"])
            warn_mark = f"part {part} warn"
            warned = any(e["kind"] == "accept_warn" and (e["data"] or "") == warn_mark
                         for e in events)
            if age >= ACCEPT_AUTO_D and warned:
                res = await flow.accept_part(
                    bot, o["id"], "Система",
                    via=f"авто-приёмка: окно проверки {ACCEPT_AUTO_D} дн. (п. 4.2 спецификации)")
                if res.get("ok"):
                    accepted_text = (
                        f"📗 Часть {part} по заказу {no} считается принятой: "
                        f"{ACCEPT_AUTO_D} дней с передачи прошли без замечаний "
                        "(окно проверки — п. 4.2 спецификации, п. 4.4 оферты). "
                        "Мастер продолжает следующую часть. Заметили несоответствие "
                        "заданию? Напишите здесь, в деле — разберёмся по-человечески.")
                    # уведомление кладём В ДЕЛО всегда: гость без Telegram видит его
                    # в кабинете, а по оферте направленное в дело считается доставленным
                    await db.msg_add(o["id"], "master", accepted_text)
                    await mailer.master_message(o["id"])
                    if o["user_id"] and o["user_id"] > 0:
                        await notify.notify_client(
                            bot, o["user_id"],
                            f"📗 <b>Часть {part} по заказу {no} считается принятой</b>: "
                            f"{ACCEPT_AUTO_D} дней с передачи прошли без замечаний "
                            "(окно проверки — п. 4.2 спецификации, п. 4.4 оферты). "
                            "Мастер продолжает следующую часть. Заметили несоответствие "
                            "заданию? Напишите в деле — разберёмся по-человечески.")
            elif age >= ACCEPT_WARN_D and not warned:
                await db.add_event(o["id"], "accept_warn", warn_mark)
                warn_text = (
                    f"🕐 Часть {part} по заказу {no} ждёт вашего решения уже {age} дн. "
                    "Посмотрите материал: «Принять часть» — и мастер продолжит, "
                    "«Нужны правки» — исправим бесплатно. "
                    f"Через {max(1, ACCEPT_AUTO_D - age)} дн. часть будет считаться "
                    "принятой по окну проверки (п. 4.2 спецификации, п. 4.4 оферты).")
                # в ленту дела — чтобы предупреждение увидел и гость без Telegram;
                # без этого авто-приёмка наступала для него в полной тишине
                await db.msg_add(o["id"], "master", warn_text)
                await mailer.master_message(o["id"])
                if o["user_id"] and o["user_id"] > 0:
                    await notify.notify_client(
                        bot, o["user_id"],
                        f"🕐 <b>Часть {part} по заказу {no} ждёт вашего решения</b> "
                        f"уже {age} дн. Посмотрите материал: «Принять часть» — и мастер "
                        "продолжит, «Нужны правки» — исправим бесплатно.\n\n"
                        f"Через {max(1, ACCEPT_AUTO_D - age)} дн. часть будет считаться "
                        "принятой по окну проверки (п. 4.2 спецификации).")
                from . import group as grp_warn
                await grp_warn.send(
                    bot, o["id"],
                    f"⏳ Часть {part} по заказу {no} ждёт приёмки уже {age} дн. — "
                    f"клиент предупреждён, авто-приёмка через "
                    f"{max(1, ACCEPT_AUTO_D - age)} дн. (финал никогда не "
                    "авто-принимается).")
        except Exception:  # noqa: BLE001 — одно дело не валит обход
            log.exception("auto-accept failed for order %s", o["id"])


async def _payment_reminders(bot: Bot) -> None:
    """Авто-напоминания о неоплаченных созревших этапах (правило владельца:
    оплату этапов надо ТРЕБОВАТЬ, а не ждать молча).

    Раз в день, до 3 раз на этап, начиная со следующего дня после выставления
    счёта; отметка клиента «я оплатил» приостанавливает (сверка за мастером),
    пауза дела — тишина. После 3 напоминаний — один алерт мастеру."""
    from . import flow, payments
    from . import group as grp_svc
    rows = await db.orders_where(
        "WHERE status IN ('prepay','work','check','fix') AND coalesce(paused,0)=0")
    now = datetime.now(timezone.utc)
    for o in rows:
        try:
            pays = await db.payments_for_order(o["id"])
            kind, due = payments.due_now(o, pays)
            if due <= 0:
                continue  # оплачено или отметка на сверке — не дёргаем
            events = await db.events_for_order(o["id"], limit=120)  # новые сверху
            sent_kind = [e for e in events if e["kind"] == "pay_reminder"
                         and (e["data"] or "").startswith(kind + " ")]
            if len(sent_kind) >= PAY_REMIND_MAX:
                if not any(e["kind"] == "pay_silent" and (e["data"] or "") == kind
                           for e in events):
                    await db.add_event(o["id"], "pay_silent", kind)
                    lbl = payments.stage_label(o, kind).lower()
                    alert = (f"🤔 Заказ {order_no(o['id'])}: счёт ({lbl}, "
                             f"{config.fmt_money(due)} ₽) без движения после "
                             f"{PAY_REMIND_MAX} напоминаний — свяжитесь с клиентом "
                             "лично или поставьте дело на паузу.")
                    silent_kb = kb.pay_silent_kb(o)
                    g = await grp_svc.send(bot, o["id"], alert, reply_markup=silent_kb)
                    await notify.notify_admins(bot, alert, reply_markup=silent_kb,
                                               group_sent=bool(g))
                continue
            marker = None
            for e in events:  # новые сверху — первый подходящий и есть свежайший
                if e["kind"] in ("pay_reminder", "part_ready", "final_ready",
                                 "delivered", "price_accepted", "part_accepted",
                                 "payment_unmarked"):
                    marker = e["created_at"]
                    break
            if not marker:
                continue
            try:
                ts = datetime.strptime(marker, "%Y-%m-%dT%H:%M:%S") \
                    .replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            if now - ts < timedelta(hours=PAY_REMIND_AFTER_H):
                continue
            await flow.remind_payment(bot, o["id"], auto=True)
        except Exception:  # noqa: BLE001 — одно дело не должно валить обход
            log.exception("pay reminder failed for order %s", o["id"])


async def _subs_sweep(bot: Bot) -> None:
    """Подписки: предупредить за 3 дня, закрыть истёкшие с предложением продлить;
    неоплаченные оформления старше 7 дней закрыть (кроме отмеченных «я оплатил» —
    те ждут сверки мастером)."""
    from . import subs
    now = datetime.now(timezone.utc)
    stale_edge = (now - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S")
    cur = await db.conn().execute(
        "SELECT * FROM subscriptions WHERE status='pending' AND order_id IS NULL "
        "AND claimed_at IS NULL AND created_at < ?", (stale_edge,))
    for s in await cur.fetchall():
        await db.sub_mark(s["id"], status="canceled", canceled_at=db.now_iso())
        await notify.notify_client(
            bot, s["user_id"],
            f"⭐ Оформление подписки «{subs.plan_label(s['plan'])}» закрыли "
            "за неактивностью — ничего не списано и не должно. Захотите вернуться — "
            "/plus, это минута.")
    warn_edge = (now + timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%S")
    for s in await db.subs_expiring(warn_edge):
        expired = s["expires_at"] <= now.strftime("%Y-%m-%dT%H:%M:%S")
        if expired:
            await db.sub_mark(s["id"], status="expired")
            # «Полка Салона»: доступ уходит вместе с подпиской (если другой
            # активной подписки с полкой нет)
            shelf_note = ""
            if "shelf" not in await subs.user_features(s["user_id"]):
                if await subs.shelf_kick(bot, s["user_id"]):
                    shelf_note = ("\n\n📚 Доступ к «Полке Салона» закрылся вместе "
                                  "с подпиской — при продлении вернём в один клик.")
            renewed = None
            try:
                if s["auto_renew"]:
                    # автопродление: счёт тем же планом, деньги — только руками
                    renewed = await subs.spawn_renewal(bot, s)
            except Exception as e:  # noqa: BLE001 — продление не должно ронять sweep
                log.warning("sub auto-renew failed for %s: %s", s["id"], e)
            if not renewed:
                await notify.notify_client(
                    bot, s["user_id"],
                    f"⭐ Подписка <b>{subs.plan_label(s['plan'])}</b> закончилась.\n\n"
                    "Спасибо, что были с нами! Продлить или собрать новую можно за минуту: "
                    "/plus здесь или в кабинете на сайте — скидка снова начнёт работать "
                    f"с первого же заказа.{shelf_note}")
        elif not s["warned"]:
            await db.sub_mark(s["id"], warned=1)
            await notify.notify_client(
                bot, s["user_id"],
                f"⭐ Подписка <b>{subs.plan_label(s['plan'])}</b> действует до "
                f"{s['expires_at'][8:10]}.{s['expires_at'][5:7]}.\n\n"
                "Если впереди ещё сдачи — продлите заранее (/plus), чтобы скидка "
                "и приоритет не прерывались.")


async def _curator_reminders(bot: Bot) -> None:
    """Куратор сессии: напоминания о сдачах за 7 / 3 / 1 день (битовая маска)."""
    today = date.today()
    for m in await db.milestones_due(7):
        try:
            dl = date.fromisoformat(m["due_date"])
        except ValueError:
            continue
        left = (dl - today).days
        mask = m["notified"] or 0
        bit = 4 if left <= 1 else (2 if left <= 3 else 1)
        if mask & bit:
            continue
        await db.conn().execute("UPDATE milestones SET notified=? WHERE id=?",
                                (mask | bit, m["id"]))
        await db.conn().commit()
        when = ("завтра" if left == 1 else "сегодня" if left <= 0
                else f"через {left} дн. ({dl.strftime('%d.%m')})")
        await notify.notify_client(
            bot, m["user_id"],
            f"📅 <b>Куратор сессии:</b> «{texts.esc(m['title'])}» — {when}.\n\n"
            "Если нужна подстраховка — разбор, презентация, нормоконтроль или "
            "срочная помощь, — напишите сюда или соберите заявку: /start → "
            "«📝 Новая заявка». Успеваем, пока есть время. 🕊")


async def _once_a_day(bot: Bot, key: str, fn) -> None:
    today = date.today().isoformat()
    if await db.setting_get(key) == today:
        return
    await db.setting_set(key, today)
    await fn(bot)


async def _ping_stale_new_orders(bot: Bot) -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=PING_AFTER_MIN)) \
        .strftime("%Y-%m-%dT%H:%M:%S")
    rows = await db.orders_where(
        "WHERE status='new' AND coalesce(paused,0)=0 AND created_at < ?", (cutoff,))
    for o in rows:
        if await db.has_event(o["id"], "admin_ping"):
            continue
        await db.add_event(o["id"], "admin_ping")
        created = datetime.strptime(o["created_at"], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
        mins = int((datetime.now(timezone.utc) - created).total_seconds() // 60)
        await notify.notify_admins(bot, texts.ORDER_PING.format(no=order_no(o["id"]), mins=mins))
        await notify.send_admin_card(bot, o["id"])


async def _client_followups(bot: Bot) -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=FOLLOWUP_AFTER_H)) \
        .strftime("%Y-%m-%dT%H:%M:%S")
    rows = await db.orders_where(
        "WHERE status='check' AND coalesce(paused,0)=0 AND updated_at < ?", (cutoff,))
    for o in rows:
        if not o["user_id"] or await db.has_event(o["id"], "client_followup"):
            continue
        await db.add_event(o["id"], "client_followup")
        await notify.notify_client(
            bot, o["user_id"],
            f"🕊 Напомним: по заказу {order_no(o['id'])} работа ждёт вашего взгляда. "
            "Если всё хорошо — нажмите «Принять» в карточке заказа (📚 Мои заказы); "
            "если есть замечания — «Нужны правки», исправим бесплатно.")


async def _send_digest(bot: Bot) -> None:
    active = await db.active_orders(limit=50)
    day_ago = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S")
    fresh = await db.orders_where("WHERE created_at >= ?", (day_ago,))
    if not active and not fresh:
        return  # тишина — не спамим
    lines = [f"🗞 <b>Утренний обзор</b> · {datetime.now(config.MSK).strftime('%d.%m')}",
             f"Активных заказов: <b>{len(active)}</b> · новых за сутки: <b>{len(fresh)}</b>\n"]
    for o in active[:8]:
        st = ST[o["status"]]
        dl = f" · до {o['deadline_date'][8:10]}.{o['deadline_date'][5:7]}" if o["deadline_date"] else ""
        lines.append(f"{st.emoji} {order_no(o['id'])} {texts.esc((o['work_label'] or '')[:30])}{dl}")
    if len(active) > 8:
        lines.append(f"… и ещё {len(active) - 8} — /orders")
    await notify.notify_admins(bot, "\n".join(lines))


async def _send_deadline_reminders(bot: Bot) -> None:
    rows = await db.orders_where(
        "WHERE status IN ('work','fix','prepay') AND coalesce(paused,0)=0 "
        "AND deadline_date IS NOT NULL")
    today = date.today()
    for o in rows:
        try:
            dl = date.fromisoformat(o["deadline_date"])
        except ValueError:
            continue
        days_left = (dl - today).days
        for threshold, ev in ((1, "deadline1"), (3, "deadline3")):
            if days_left <= threshold and not await db.has_event(o["id"], ev):
                await db.add_event(o["id"], ev)
                st = ST[o["status"]]
                await notify.notify_admins(
                    bot,
                    f"⏰ <b>Дедлайн близко:</b> заказ {order_no(o['id'])} "
                    f"({st.emoji} {st.label}) — сдача {dl.strftime('%d.%m')}, "
                    f"осталось {max(days_left, 0)} дн.",
                    reply_markup=kb.Kb(inline_keyboard=[
                        [kb.Btn(text="📋 Карточка", callback_data=f"ad:card:{o['id']}"),
                         kb.Btn(text="🖥 Открыть в админке",
                                callback_data=f"ad:panel:{o['id']}")]]))
                break
