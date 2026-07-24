"""Витрина Telegram-канала @akademsalon на сайте.

Bot API не умеет читать историю канала, зато у публичных каналов есть
серверное превью t.me/s/<имя> — забираем его раз в ~15 минут и разбираем
регулярками (без лишних зависимостей): текст, дата, просмотры, картинка.
Картинки скачиваются в data_channel/ и раздаются своим эндпоинтом
/api/channel/img/{id} — сайт не зависит от телеграмовского CDN и не даёт
внешних запросов (политика «внешних критических зависимостей ноль»).
"""
from __future__ import annotations

import html as html_mod
import logging
import os
import re
from datetime import datetime, timedelta, timezone

import aiohttp

from .. import config, db

log = logging.getLogger(__name__)

CHANNEL = "akademsalon"
URL = f"https://t.me/s/{CHANNEL}"
DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), "data_channel")
KEEP = 12          # сколько свежих постов храним
SWEEP_EVERY_S = 15 * 60

_MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня",
               "июля", "августа", "сентября", "октября", "ноября", "декабря"]

_RE_MSG = re.compile(
    r'data-post="' + CHANNEL + r'/(\d+)"(.*?)(?=data-post="|<footer|\Z)',
    re.S | re.I)
_RE_TEXT = re.compile(
    r'class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>', re.S | re.I)
_RE_PHOTO = re.compile(
    r"tgme_widget_message_photo_wrap[^\"]*\"[^>]*background-image:url\('([^']+)'\)",
    re.I)
_RE_VIEWS = re.compile(
    r'class="tgme_widget_message_views"[^>]*>([^<]+)<', re.I)
_RE_TIME = re.compile(r'<time[^>]+datetime="([^"]+)"', re.I)


def _clean_text(raw: str) -> str:
    """HTML виджета → чистый текст с переносами (теги долой, сущности назад)."""
    s = re.sub(r"<br\s*/?>", "\n", raw, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = html_mod.unescape(s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()[:900]


def ru_date(iso: str | None) -> str:
    if not iso:
        return ""
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        dt = dt.astimezone(timezone(timedelta(hours=3)))
        return f"{dt.day} {_MONTHS_GEN[dt.month - 1]}"
    except Exception:  # noqa: BLE001
        return ""


async def sweep() -> int:
    """Забрать свежие посты; вернуть, сколько новых/обновлённых."""
    os.makedirs(DIR, exist_ok=True)
    headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                             "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"}
    async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=20), headers=headers) as http:
        async with http.get(URL) as resp:
            if resp.status != 200:
                log.warning("channel preview %s -> %s", URL, resp.status)
                return 0
            page = await resp.text()
        n = 0
        for m in _RE_MSG.finditer(page):
            msg_id = int(m.group(1))
            body = m.group(2)
            tm = _RE_TEXT.search(body)
            text = _clean_text(tm.group(1)) if tm else ""
            pm = _RE_PHOTO.search(body)
            img_url = html_mod.unescape(pm.group(1)) if pm else ""
            vm = _RE_VIEWS.search(body)
            views = (vm.group(1) or "").strip() if vm else ""
            dm = _RE_TIME.search(body)
            date_iso = dm.group(1) if dm else ""
            if not text and not img_url:
                continue
            # сервисные записи («канал переименован», смена аватара) — не контент
            if "service_message" in body or re.match(
                    r"Channel (name|photo)", text or ""):
                continue
            img_path = ""
            if img_url:
                img_path = os.path.join(DIR, f"{msg_id}.jpg")
                if not os.path.exists(img_path):
                    try:
                        async with http.get(img_url) as ir:
                            if ir.status == 200:
                                data = await ir.read()
                                with open(img_path, "wb") as fh:
                                    fh.write(data)
                            else:
                                img_path = ""
                    except Exception as e:  # noqa: BLE001
                        log.warning("channel img %s failed: %s", msg_id, e)
                        img_path = ""
            await db.channel_upsert(
                msg_id, date=date_iso, text=text, views=views,
                img=os.path.basename(img_path) if img_path else "")
            n += 1
    # хвост старше KEEP чистим вместе с файлами
    for old in await db.channel_trim(KEEP):
        p = os.path.join(DIR, f"{old}.jpg")
        if os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass
    return n


def public_json(r) -> dict:
    return {
        "id": r["msg_id"],
        "date": ru_date(r["date"]),
        "text": r["text"] or "",
        "views": r["views"] or "",
        "img": f"{config.SITE_URL}/api/channel/img/{r['msg_id']}" if r["img"] else "",
        "url": f"https://t.me/{CHANNEL}/{r['msg_id']}",
    }


def img_path(msg_id: int) -> str | None:
    p = os.path.join(DIR, f"{msg_id}.jpg")
    return p if os.path.exists(p) else None
