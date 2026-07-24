"""Безопасная выдача готовой работы: preview -> приёмка -> оплата -> оригинал.

Новый контур включается только после загрузки комплекта через кнопку мастера.
Старые активные заказы продолжают жить в legacy-flow без миграции состояний.
"""
from __future__ import annotations

import hashlib
import logging
import os

from aiogram import Bot
from aiogram.types import BufferedInputFile

from .. import config, db, keyboards as kb, texts
from . import group as grp
from . import mailer, notify, preview

log = logging.getLogger(__name__)


def _files_label(count: int) -> str:
    tail = count % 100
    if 11 <= tail <= 14:
        word = "файлов"
    elif count % 10 == 1:
        word = "файл"
    elif count % 10 in (2, 3, 4):
        word = "файла"
    else:
        word = "файлов"
    return f"{count} {word}"


async def latest(order_id: int):
    cur = await db.conn().execute(
        "SELECT * FROM delivery_artifacts WHERE order_id=? "
        "ORDER BY version DESC LIMIT 1", (order_id,))
    return await cur.fetchone()


async def by_id(artifact_id: int):
    cur = await db.conn().execute(
        "SELECT * FROM delivery_artifacts WHERE id=?", (artifact_id,))
    return await cur.fetchone()


async def files(artifact_or_id) -> list[dict]:
    """Файлы версии; старые одиночные версии читаются без миграции данных."""
    a = await by_id(artifact_or_id) if isinstance(artifact_or_id, int) else artifact_or_id
    if not a:
        return []
    cur = await db.conn().execute(
        "SELECT * FROM delivery_artifact_files WHERE artifact_id=? "
        "ORDER BY position", (a["id"],))
    rows = await cur.fetchall()
    if rows:
        return [dict(x) for x in rows]
    return [{
        "artifact_id": a["id"], "position": 0,
        "source_file_id": a["source_file_id"],
        "source_file_name": a["source_file_name"],
        "source_file_size": a["source_file_size"],
        "source_sha256": a["source_sha256"],
        "preview_file_id": a["preview_file_id"],
    }]


async def _fully_paid(order_id: int) -> bool:
    from . import payments
    o = await db.get_order(order_id)
    rows = await db.payments_for_order(order_id)
    plan = payments.plan_state(o, rows)
    return bool(plan) and all(x["state"] == "paid" for x in plan)


async def engagement_ready(order_or_id) -> bool:
    """Отзыв/благодарность доступны только после оплаченной чистой выдачи."""
    o = await db.get_order(order_or_id) if isinstance(order_or_id, int) else order_or_id
    if not o:
        return False
    if o["status"] == "done":
        return True
    return bool(o["handoff_phase"] == "released" and await _fully_paid(o["id"]))


def _delivery_caption(order_id: int, a, count: int, kind: str) -> str:
    no = config.order_no(order_id)
    if kind == "preview":
        return (f"🔒 Заказ {no} · защищённая первая часть.\n"
                f"В пакете {_files_label(count)}. Посмотрите работу: если всё "
                "устраивает — примите; если нужны изменения — отправьте замечания. "
                "Оригинал автоматически придёт после принятия и оплаты остатка.")
    if a["mode"] == "protected":
        return (f"📦 Заказ {no} · полный пакет без водяных знаков "
                f"({_files_label(count)}).\nОплата подтверждена — оригинал отправлен "
                "автоматически. Проверьте комплект; при необходимости правки можно "
                "запросить снова.")
    return (f"📦 Заказ {no} · исправленный пакет ({_files_label(count)}).\n"
            "Проверьте его: правки можно запрашивать снова без ограничений.")


async def _ensure_delivery_rows(a, items: list[dict], kind: str,
                                telegram: bool) -> None:
    now = db.now_iso()
    channels = ["cabinet"] + (["telegram"] if telegram else [])
    for pos, _item in enumerate(items):
        for channel in channels:
            await db.conn().execute(
                "INSERT OR IGNORE INTO handoff_deliveries(artifact_id,position,kind,"
                "channel,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                (a["id"], pos, kind, channel, "pending", now, now))
    await db.conn().commit()


async def _deliver_cabinet(order_id: int, a, items: list[dict], kind: str,
                           caption: str) -> bool:
    """Каноническая выдача в кабинете: message + receipt одной транзакцией."""
    c = db.conn()
    for pos, item in enumerate(items):
        cur = await c.execute(
            "SELECT status FROM handoff_deliveries WHERE artifact_id=? AND position=? "
            "AND kind=? AND channel='cabinet'", (a["id"], pos, kind))
        row = await cur.fetchone()
        if row and row["status"] == "sent":
            continue
        send_id = item["preview_file_id"] if kind == "preview" else item["source_file_id"]
        name = (f"proverka-{os.path.splitext(item['source_file_name'])[0]}.pdf"
                if kind == "preview" else item["source_file_name"])
        now = db.now_iso()
        await c.execute(
            "INSERT INTO messages(order_id,sender,text,kind,file_name,tg_file_id,"
            "seen_client,created_at) VALUES(?,?,?,?,?,?,0,?)",
            (order_id, "master", caption if pos == 0 else None,
             "document", name, send_id, now))
        await c.execute(
            "UPDATE handoff_deliveries SET status='sent',attempts=attempts+1,"
            "last_error=NULL,updated_at=?,sent_at=? WHERE artifact_id=? AND position=? "
            "AND kind=? AND channel='cabinet'",
            (now, now, a["id"], pos, kind))
    await c.commit()
    db.bus_bump()
    return True


async def _deliver_telegram(bot: Bot, o, a, items: list[dict], kind: str,
                            caption: str) -> bool:
    if not o["user_id"] or o["user_id"] <= 0:
        return False
    protected = kind == "preview"
    for pos, item in enumerate(items):
        cur = await db.conn().execute(
            "SELECT * FROM handoff_deliveries WHERE artifact_id=? AND position=? "
            "AND kind=? AND channel='telegram'", (a["id"], pos, kind))
        row = await cur.fetchone()
        if not row or row["status"] == "sent":
            continue
        # CAS — два webhook/worker не отправят один item параллельно.
        now = db.now_iso()
        claim = await db.conn().execute(
            "UPDATE handoff_deliveries SET status='sending',attempts=attempts+1,"
            "updated_at=? WHERE id=? AND status='pending'", (now, row["id"]))
        await db.conn().commit()
        if claim.rowcount != 1:
            continue
        send_id = item["preview_file_id"] if protected else item["source_file_id"]
        try:
            msg = await bot.send_document(
                o["user_id"], send_id, caption=caption if pos == 0 else None,
                reply_markup=(kb.handoff_client_kb(o["id"], a["id"], protected)
                              if pos == len(items) - 1 else None))
        except Exception as exc:  # noqa: BLE001
            await db.conn().execute(
                "UPDATE handoff_deliveries SET status='pending',last_error=?,updated_at=? "
                "WHERE id=?", (str(exc)[:500], db.now_iso(), row["id"]))
            await db.conn().commit()
            log.warning("handoff Telegram delivery failed order=%s artifact=%s file=%s",
                        o["id"], a["id"], item["source_file_name"], exc_info=True)
            break  # сохраняем порядок пакета; следующий tick продолжит с этого места
        sent = db.now_iso()
        await db.conn().execute(
            "UPDATE handoff_deliveries SET status='sent',telegram_message_id=?,"
            "last_error=NULL,updated_at=?,sent_at=? WHERE id=?",
            (getattr(msg, "message_id", None), sent, sent, row["id"]))
        await db.conn().commit()
    cur = await db.conn().execute(
        "SELECT count(*) AS n FROM handoff_deliveries WHERE artifact_id=? AND kind=? "
        "AND channel='telegram' AND status!='sent'", (a["id"], kind))
    return (await cur.fetchone())["n"] == 0


async def sync_telegram(bot: Bot, order_id: int) -> dict:
    """Досылает актуальный опубликованный пакет после поздней привязки Telegram."""
    o = await db.get_order(order_id)
    a = await latest(order_id)
    if not o or not a or not o["user_id"] or o["user_id"] <= 0:
        return {"ok": False, "error": "telegram_not_linked"}
    if a["phase"] not in ("preview_published", "accepted_wait_pay", "releasing",
                           "released"):
        return {"ok": False, "error": "nothing_to_sync"}
    items = await files(a)
    kind = "preview" if a["mode"] == "protected" and not a["released_at"] else "source"
    await _ensure_delivery_rows(a, items, kind, telegram=True)
    delivered = await _deliver_telegram(
        bot, o, a, items, kind, _delivery_caption(order_id, a, len(items), kind))
    return {"ok": delivered, "delivered_tg": delivered}


async def retry_pending(bot: Bot) -> None:
    """Восстанавливает прерванные/частичные Telegram-выдачи после рестарта."""
    cur = await db.conn().execute(
        "SELECT id,order_id,phase FROM delivery_artifacts "
        "WHERE phase IN ('publishing','releasing','accepted_wait_pay') "
        "ORDER BY id LIMIT 20")
    for row in await cur.fetchall():
        try:
            if row["phase"] == "publishing":
                await publish(bot, row["order_id"], row["id"], via="автовосстановление")
            else:
                await release_if_paid(bot, row["order_id"], row["id"])
        except Exception:  # noqa: BLE001 — один пакет не блокирует очередь
            log.exception("handoff recovery failed artifact=%s", row["id"])
    # sending старше 10 минут — неизвестный исход Bot API; выбираем повторную
    # доставку вместо потери файла. В крайне узком crash-window возможен дубль.
    await db.conn().execute(
        "UPDATE handoff_deliveries SET status='pending',updated_at=? "
        "WHERE channel='telegram' AND status='sending' "
        "AND updated_at < datetime('now','-10 minutes')", (db.now_iso(),))
    await db.conn().commit()
    cur = await db.conn().execute(
        "SELECT DISTINCT artifact_id FROM handoff_deliveries "
        "WHERE channel='telegram' AND status='pending' ORDER BY artifact_id LIMIT 20")
    for row in await cur.fetchall():
        a = await by_id(row["artifact_id"])
        if a:
            await sync_telegram(bot, a["order_id"])


async def prepare(order_id: int, source_file_id: str, filename: str,
                  file_size: int | None, payload: bytes, via: str) -> dict:
    """Совместимый одиночный вход; новые вызовы используют prepare_bundle."""
    return await prepare_bundle(order_id, [{
        "source_file_id": source_file_id, "filename": filename,
        "file_size": file_size, "payload": payload,
    }], via)


async def prepare_bundle(order_id: int, sources: list[dict], via: str) -> dict:
    """Фиксирует пакет оригиналов и строит защищённую копию каждого файла."""
    o = await db.get_order(order_id)
    if not o:
        return {"ok": False, "error": "not_found"}
    if not sources or len(sources) > 10:
        return {"ok": False, "error": "bundle_size"}
    prev = await latest(order_id)
    version = (prev["version"] if prev else 0) + 1
    paid = await _fully_paid(order_id)
    # Чистая версия допустима только ПОСЛЕ уже зафиксированной выдачи предыдущей.
    # Одна лишь 100% оплата не должна обходить preview/приёмку при замене пакета.
    mode = "clean_revision" if paid and prev and prev["released_at"] else "protected"
    rendered_items = []
    for src in sources:
        filename = str(src.get("filename") or "файл")[:120]
        payload = bytes(src.get("payload") or b"")
        if not payload:
            return {"ok": False, "error": "empty"}
        if mode == "protected" and not preview.can_convert(filename):
            return {"ok": False, "error": "preview_format", "filename": filename}
        rendered = payload if mode == "clean_revision" else await preview.build(
            payload, filename, order_id, first_half=True)
        if not rendered:
            return {"ok": False, "error": "preview_failed", "filename": filename}
        stem = os.path.splitext(filename)[0][:80]
        rendered_items.append({
            "source_file_id": src["source_file_id"], "source_name": filename,
            "source_size": src.get("file_size"),
            "source_sha256": hashlib.sha256(payload).hexdigest(),
            "bytes": rendered,
            "filename": (f"proverka-{stem}-v{version}.pdf"
                         if mode == "protected" else filename),
        })
    if prev and prev["phase"] in ("master_review", "fix_requested"):
        await db.conn().execute(
            "UPDATE delivery_artifacts SET phase='superseded' WHERE id=?",
            (prev["id"],))
    primary = rendered_items[0]
    cur = await db.conn().execute(
        "INSERT INTO delivery_artifacts(order_id,version,source_file_id,"
        "source_file_name,source_file_size,source_sha256,mode,phase,created_at) "
        "VALUES(?,?,?,?,?,?,?,?,?)",
        (order_id, version, primary["source_file_id"], primary["source_name"],
         primary["source_size"], primary["source_sha256"], mode,
         "master_review", db.now_iso()))
    artifact_id = cur.lastrowid
    for pos, item in enumerate(rendered_items):
        await db.conn().execute(
            "INSERT INTO delivery_artifact_files(artifact_id,position,source_file_id,"
            "source_file_name,source_file_size,source_sha256,created_at) "
            "VALUES(?,?,?,?,?,?,?)",
            (artifact_id, pos, item["source_file_id"], item["source_name"],
             item["source_size"], item["source_sha256"], db.now_iso()))
    await db.conn().commit()
    # В order_files класть нельзя: текущий кабинет показывает эту таблицу
    # клиенту. Оригинал до оплаты живёт только в delivery_artifacts.
    await db.update_order(order_id, handoff_artifact_id=artifact_id,
                          handoff_phase="master_review", handoff_version=version)
    await db.add_event(order_id, "handoff_prepared",
                       f"artifact {artifact_id} v{version} {mode} · "
                       f"files={len(rendered_items)} · {via}")
    db.bus_bump()
    return {"ok": True, "artifact_id": artifact_id, "version": version,
            "mode": mode, "bytes": primary["bytes"],
            "filename": primary["filename"],
            "source_name": primary["source_name"], "items": rendered_items,
            "file_count": len(rendered_items)}


async def set_review_file(artifact_id: int, file_id: str) -> None:
    await set_review_files(artifact_id, [file_id])


async def set_review_files(artifact_id: int, file_ids: list[str]) -> None:
    """Привязывает Telegram file_id проверочных копий в порядке пакета."""
    if not file_ids:
        return
    await db.conn().execute(
        "UPDATE delivery_artifacts SET preview_file_id=? "
        "WHERE id=? AND phase='master_review'", (file_ids[0], artifact_id))
    for pos, file_id in enumerate(file_ids):
        await db.conn().execute(
            "UPDATE delivery_artifact_files SET preview_file_id=? "
            "WHERE artifact_id=? AND position=?", (file_id, artifact_id, pos))
    await db.conn().commit()
    a = await by_id(artifact_id)
    if a:
        await db.update_order(a["order_id"], handoff_phase="master_review")
    db.bus_bump()


async def publish(bot: Bot, order_id: int, artifact_id: int, via: str) -> dict:
    """Явное подтверждение мастера: только теперь версия уходит клиенту."""
    o = await db.get_order(order_id)
    a = await by_id(artifact_id)
    if not o or not a or a["order_id"] != order_id:
        return {"ok": False, "error": "not_found"}
    if (o["handoff_artifact_id"] or 0) != artifact_id:
        return {"ok": False, "error": "stale"}
    if a["phase"] not in ("master_review", "publishing"):
        return {"ok": False, "error": "stale"}
    items = await files(a)
    protected = a["mode"] == "protected"
    if not items or any(not (x["preview_file_id"] if protected else x["source_file_id"])
                        for x in items):
        return {"ok": False, "error": "review_file_missing"}
    # Условный UPDATE отсекает двойной клик и старые кнопки версии.
    if a["phase"] == "master_review":
        cur = await db.conn().execute(
            "UPDATE delivery_artifacts SET phase='publishing' "
            "WHERE id=? AND phase='master_review'", (artifact_id,))
        await db.conn().commit()
        if cur.rowcount != 1:
            return {"ok": False, "error": "stale"}
    no = config.order_no(order_id)
    kind = "preview" if protected else "source"
    caption = _delivery_caption(order_id, a, len(items), kind)
    await _ensure_delivery_rows(a, items, kind,
                                telegram=bool(o["user_id"] and o["user_id"] > 0))
    await _deliver_cabinet(order_id, a, items, kind, caption)
    delivered = await _deliver_telegram(bot, o, a, items, kind, caption)
    phase = "preview_published" if protected else "released"
    now = db.now_iso()
    finalized = await db.conn().execute(
        "UPDATE delivery_artifacts SET phase=?, published_at=?, released_at=? "
        "WHERE id=? AND phase='publishing'",
        (phase, now, now if not protected else None, artifact_id))
    await db.conn().commit()
    if finalized.rowcount != 1:
        return {"ok": True, "delivered_tg": delivered, "phase": phase,
                "already_finalized": True}
    await db.update_order(order_id, handoff_phase=phase,
                          handoff_artifact_id=artifact_id,
                          handoff_version=a["version"])
    total = o["stages_total"] or 1
    await db.update_order(order_id, stage=1 if protected else total,
                          part_ready=0)
    await db.set_status(order_id, "check",
                        ("защищённая часть отправлена" if protected
                         else "исправленная версия отправлена") + f" · {via}")
    await db.add_event(order_id, "handoff_published",
                       f"artifact {artifact_id} · {'preview' if protected else 'clean'} "
                       f"· files={len(items)}")
    await mailer.master_message(order_id)
    alert = (f"✅ Заказ {no}: клиенту отправлена "
             f"{'защищённая первая часть' if protected else 'исправленная полная версия'}. "
             "Ждём: принять или запросить правки.")
    g = await grp.send(bot, order_id, alert)
    await notify.notify_admins(bot, alert, group_sent=bool(g),
                               map_client=(o["user_id"], order_id) if o["user_id"] else None)
    return {"ok": True, "delivered_tg": delivered, "phase": phase}


async def accept(bot: Bot, order_id: int, artifact_id: int, who: str,
                 via: str = "бот") -> dict:
    """Приёмка конкретной версии; старые кнопки не затрагивают новую."""
    a = await by_id(artifact_id)
    o = await db.get_order(order_id)
    if not a or not o or a["order_id"] != order_id:
        return {"ok": False, "error": "not_found"}
    if (o["handoff_artifact_id"] or 0) != artifact_id:
        return {"ok": False, "error": "stale"}
    if a["phase"] == "released":
        from . import flow
        return await flow.accept_part(bot, order_id, who, via=via)
    if a["phase"] != "preview_published":
        return {"ok": False, "error": "stale"}
    cur = await db.conn().execute(
        "UPDATE delivery_artifacts SET phase='accepted_wait_pay', accepted_at=? "
        "WHERE id=? AND phase='preview_published'", (db.now_iso(), artifact_id))
    await db.conn().commit()
    if cur.rowcount != 1:
        return {"ok": False, "error": "stale"}
    total = o["stages_total"] or 1
    await db.update_order(order_id, stage=total, parts_done=max(0, total - 1),
                          final_ready=0, part_ready=0,
                          handoff_phase="accepted_wait_pay")
    await db.set_status(order_id, "work", f"защищённая часть принята · {via}")
    await db.add_event(order_id, "handoff_preview_accepted", f"artifact {artifact_id}")
    from . import flow
    invoice = await flow.final_ready(bot, order_id, via="автосценарий после приёмки")
    if invoice.get("ok") and not invoice.get("due"):
        released = await release_if_paid(bot, order_id, artifact_id)
        return {"ok": True, "preview": True, "need_pay": False,
                "released": released.get("ok", False)}
    return {"ok": True, "preview": True, "need_pay": True,
            "due": invoice.get("due", 0), "kind": invoice.get("kind")}


async def request_fixes(bot: Bot, order_id: int, artifact_id: int, who: str,
                        comment: str = "", via: str = "бот") -> dict:
    a = await by_id(artifact_id)
    o = await db.get_order(order_id)
    if not a or not o or a["order_id"] != order_id \
            or (o["handoff_artifact_id"] or 0) != artifact_id or a["phase"] not in (
            "preview_published", "released"):
        return {"ok": False, "error": "stale"}
    cur = await db.conn().execute(
        "UPDATE delivery_artifacts SET phase='fix_requested' WHERE id=? AND phase=?",
        (artifact_id, a["phase"]))
    await db.conn().commit()
    if cur.rowcount != 1:
        return {"ok": False, "error": "stale"}
    from . import flow
    await db.update_order(order_id, handoff_phase="fix_requested")
    return await flow.request_fixes(bot, order_id, who, comment=comment, via=via)


async def release_if_paid(bot: Bot, order_id: int,
                          artifact_id: int | None = None) -> dict:
    """Автоматически выдаёт зафиксированный оригинал ровно один раз."""
    a = await by_id(artifact_id) if artifact_id else await latest(order_id)
    o = await db.get_order(order_id)
    if not a or not o or a["phase"] not in ("accepted_wait_pay", "releasing"):
        return {"ok": False, "error": "no_candidate"}
    if not await _fully_paid(order_id):
        return {"ok": False, "error": "not_paid"}
    if a["phase"] == "accepted_wait_pay":
        cur = await db.conn().execute(
            "UPDATE delivery_artifacts SET phase='releasing', release_started_at=? "
            "WHERE id=? AND phase='accepted_wait_pay'", (db.now_iso(), a["id"]))
        await db.conn().commit()
        if cur.rowcount != 1:
            return {"ok": False, "error": "busy"}
    no = config.order_no(order_id)
    items = await files(a)
    if not items:
        return {"ok": False, "error": "no_files"}
    caption = _delivery_caption(order_id, a, len(items), "source")
    await _ensure_delivery_rows(a, items, "source",
                                telegram=bool(o["user_id"] and o["user_id"] > 0))
    # Кабинет — канонический exactly-once доступ. Telegram досылается по ledger.
    await _deliver_cabinet(order_id, a, items, "source", caption)
    delivered = await _deliver_telegram(bot, o, a, items, "source", caption)
    now = db.now_iso()
    finalized = await db.conn().execute(
        "UPDATE delivery_artifacts SET phase='released', released_at=? "
        "WHERE id=? AND phase='releasing'", (now, a["id"]))
    await db.conn().commit()
    if finalized.rowcount != 1:
        return {"ok": True, "delivered_tg": delivered,
                "artifact_id": a["id"], "already_finalized": True}
    total = o["stages_total"] or 1
    await db.update_order(order_id, stage=total, parts_done=max(0, total - 1), part_ready=0)
    await db.update_order(order_id, handoff_phase="released",
                          handoff_artifact_id=a["id"], handoff_version=a["version"])
    await db.set_status(order_id, "check", "оригинал выдан автоматически после оплаты")
    await db.add_event(order_id, "handoff_released",
                       f"artifact {a['id']} · files={len(items)}")
    thanks_plain = (
        "Спасибо за заказ и доверие! Полный комплект уже у вас. "
        "Сохраните файлы и спокойно всё проверьте — правки остаются без ограничений. "
        "Когда убедитесь, что всё в порядке, можно оставить короткий отзыв. "
        "Если захотите дополнительно поддержать развитие проекта, в кабинете есть "
        "добровольная благодарность. Это только по желанию и никак не влияет на "
        "заказ, правки или наше отношение."
    )
    await db.msg_add(order_id, "master", thanks_plain)
    if o["user_id"] and o["user_id"] > 0:
        cabinet_url = await notify.order_link(order_id)
        thanks_tg = (
            "💛 <b>Спасибо за заказ и доверие!</b>\n\n"
            "Полный комплект уже у вас. Сохраните файлы и спокойно всё проверьте — "
            "правки остаются без ограничений.\n\n"
            "⭐ Когда убедитесь, что всё в порядке, буду благодарен за короткий отзыв — "
            "он помогает другим клиентам решиться и делает проект лучше.\n\n"
            "Если захотите дополнительно поддержать развитие проекта, в кабинете "
            "доступна добровольная благодарность. Это полностью по желанию и никак "
            "не влияет на заказ, правки или наше отношение."
        )
        await notify.notify_client(
            bot, o["user_id"], thanks_tg,
            reply_markup=kb.release_thanks_kb(order_id, cabinet_url),
            order_id=order_id)
    await mailer.master_message(order_id)
    alert = (f"🚀 Заказ {no}: оплата закрыта, чистый оригинал версии v{a['version']} "
             "автоматически выдан клиенту" + ("." if delivered else
             " в кабинете (Telegram недоступен)."))
    g = await grp.send(bot, order_id, alert)
    await notify.notify_admins(bot, alert, group_sent=bool(g),
                               map_client=(o["user_id"], order_id) if o["user_id"] else None)
    return {"ok": True, "delivered_tg": delivered, "artifact_id": a["id"]}
