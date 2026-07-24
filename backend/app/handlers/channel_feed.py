"""Реалтайм-витрина канала: посты @akademsalon прилетают боту-админу.

t.me с российского VPS заблокирован, поэтому серверное превью канала
недоступно — витрину на главной пополняет сам бот: как только владелец
делает его администратором канала (права «изменение постов» не нужны,
достаточно самого статуса админа), каждый новый пост прилетает апдейтом
channel_post и сразу попадает в /api/channel. Бэкфилл старых постов —
ops/seed-пакет с машины разработчика (Bot API историю канала не отдаёт).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from aiogram import Router
from aiogram.types import Message

from .. import db
from ..services import channel

log = logging.getLogger(__name__)

router = Router(name="channel_feed")


@router.channel_post()
async def on_channel_post(m: Message) -> None:
    if (m.chat.username or "").lower() != channel.CHANNEL:
        return
    text = (m.text or m.caption or "").strip()[:900]
    img = ""
    if m.photo:
        try:
            os.makedirs(channel.DIR, exist_ok=True)
            f = await m.bot.get_file(m.photo[-1].file_id)
            dest = os.path.join(channel.DIR, f"{m.message_id}.jpg")
            await m.bot.download_file(f.file_path, dest)
            img = f"{m.message_id}.jpg"
        except Exception as e:  # noqa: BLE001 — пост без обложки лучше, чем никакого
            log.warning("channel photo %s failed: %s", m.message_id, e)
    if not text and not img:
        return
    date_iso = (m.date or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    await db.channel_upsert(m.message_id, date=date_iso, text=text,
                            views="", img=img)
    for old in await db.channel_trim(channel.KEEP):
        p = os.path.join(channel.DIR, f"{old}.jpg")
        if os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass
    log.info("channel post %s принят в витрину", m.message_id)


@router.edited_channel_post()
async def on_channel_edit(m: Message) -> None:
    """Правка поста в канале — обновить текст в витрине."""
    if (m.chat.username or "").lower() != channel.CHANNEL:
        return
    text = (m.text or m.caption or "").strip()[:900]
    if not text:
        return
    row = await db.conn().execute(
        "SELECT 1 FROM channel_posts WHERE msg_id=?", (m.message_id,))
    if not await row.fetchone():
        return
    await db.conn().execute(
        "UPDATE channel_posts SET text=? WHERE msg_id=?", (text, m.message_id))
    await db.conn().commit()
    db.bus_bump()
