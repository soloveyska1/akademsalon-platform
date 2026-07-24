"""«Открытая приёмная»: анонимный вопрос → ответ мастера → публикация пары.

Формат выбран сознательно вместо live-чата (Стратегия/07_Анонимная_приёмная):
премодерация 100% — на сайт не попадает ни одна буква без решения мастера;
пары копятся навсегда и снимают тревогу у читателей ещё до первого вопроса.

Правило редактуры (заявлено в правилах приёмной на сайте): вопросы публикуются
в литературной обработке, суть сохраняется; идентифицирующие детали и рискованные
формулировки мастер вычищает при ответе. Исходник гостя хранится в question_raw
и виден только мастеру.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone

from aiogram import Bot

from .. import config, db

log = logging.getLogger(__name__)

MAX_Q = 600          # знаков в вопросе (как в концепции)
MAX_A = 3000         # знаков в ответе мастера
MAX_NAME = 40        # подпись-псевдоним
DAY_LIMIT_BROWSER = 2   # вопросов в сутки с одного браузера (vid)
DAY_LIMIT_IP = 4        # …и с одного IP (общажный NAT — чуть свободнее)

# рубрики приёмной; ключи хранятся в qa.tag, подписи видны на сайте и в админке
TAGS = {
    "diplom": "Диплом и ВКР",
    "kursach": "Курсовые",
    "antiplagiat": "Антиплагиат и ИИ",
    "sroki": "Сроки",
    "oplata": "Оплата и гарантии",
    "process": "Как всё устроено",
}

_MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня",
               "июля", "августа", "сентября", "октября", "ноября", "декабря"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def ru_date(iso: str | None) -> str:
    """«12 июля» — дата формуляра (московское время)."""
    if not iso:
        return ""
    try:
        dt = datetime.fromisoformat(str(iso)[:19]).replace(tzinfo=timezone.utc)
        dt = dt.astimezone(timezone(timedelta(hours=3)))
        return f"{dt.day} {_MONTHS_GEN[dt.month - 1]}"
    except Exception:  # noqa: BLE001
        return ""


def sanitize(raw: str | None, limit: int = MAX_Q) -> str:
    """Чистка гостевого текста ещё ДО очереди: ссылки/почты/телефоны — вон.

    Реклама и деанон не должны попадать даже в очередь премодерации —
    так решение мастера остаётся только про содержание вопроса."""
    s = str(raw or "")
    s = re.sub(r"https?://\S+|www\.\S+", "…", s, flags=re.I)
    s = re.sub(r"[\w.+-]+@[\w-]+\.[\w.]+", "…", s)
    s = re.sub(r"(?<!\d)(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)", "…", s)
    s = re.sub(r"@[a-zA-Z0-9_]{4,}", "…", s)  # telegram-ники
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()[:limit]


def num_label(qa_id: int) -> str:
    return f"№ {qa_id:03d}"


def public_json(r) -> dict:
    """Пара для сайта: без e-mail, без vid/ip, без исходника."""
    return {
        "id": r["id"],
        "num": num_label(r["id"]),
        "question": r["question"],
        "pseudonym": r["pseudonym"] or "Аноним",
        "answer": r["answer"],
        "tag": r["tag"] or "",
        "tag_label": TAGS.get(r["tag"] or "", ""),
        "same": int(r["same_count"] or 0),
        "date": ru_date(r["published_at"] or r["created_at"]),
        "pinned": int(r["pinned"] or 0),
    }


def admin_json(r) -> dict:
    return {
        "id": r["id"], "num": num_label(r["id"]),
        "question": r["question"], "question_raw": r["question_raw"],
        "pseudonym": r["pseudonym"] or "", "email": r["email"] or "",
        "quiet": int(r["quiet"] or 0), "status": r["status"],
        "answer": r["answer"] or "", "tag": r["tag"] or "",
        "pinned": int(r["pinned"] or 0), "same": int(r["same_count"] or 0),
        "source": r["source"] or "site",
        "vid": r["vid"] or "", "ip": r["ip"] or "",
        "created_at": r["created_at"], "answered_at": r["answered_at"],
        "published_at": r["published_at"],
        "date": ru_date(r["created_at"]),
    }


async def submit(bot: Bot | None, *, question: str, pseudonym: str = "",
                 email: str = "", quiet: bool = False,
                 vid: str = "", ip: str = "", user_id: int | None = None) -> tuple[int | None, str | None]:
    """Гость задал вопрос: лимиты, очередь, алерт мастеру. (id, err)."""
    clean = sanitize(question)
    if len(clean) < 10:
        return None, "too_short"
    if await db.qa_banned(vid, ip):
        # забаненным отвечаем «принято», но в очередь не кладём — тишина дороже
        log.info("qa: banned author dropped (vid=%s ip=%s)", vid[:12], ip)
        return 0, None
    n = await db.qa_recent_from(vid, ip)
    if (vid and n["vid_n"] >= DAY_LIMIT_BROWSER) or (ip and n["ip_n"] >= DAY_LIMIT_IP):
        return None, "rate_limited"
    qa_id = await db.qa_add(
        question=clean, question_raw=str(question or "")[:2000],
        pseudonym=sanitize(pseudonym, MAX_NAME) or "",
        email=(email or "").strip()[:120],
        quiet=1 if quiet else 0,
        status="pending", tag="", source="site",
        vid=(vid or "")[:48], ip=(ip or "")[:48],
        user_id=user_id, created_at=_now_iso(),
    )
    if bot:
        await _alert_master(bot, qa_id)
    return qa_id, None


async def _alert_master(bot: Bot, qa_id: int) -> None:
    """Новый вопрос — мастеру в ЛС с кнопками ответа."""
    from .. import keyboards as kb  # локальный импорт против циклов
    from . import notify
    r = await db.qa_get(qa_id)
    if not r:
        return
    quiet_note = "\n🤫 <i>Тихий вопрос: публикации не будет, ответ уйдёт письмом.</i>" if r["quiet"] else ""
    mail_note = " · 📧 почта оставлена" if r["email"] else " · без почты"
    text = (f"📮 <b>Вопрос в приёмную {num_label(qa_id)}</b>\n"
            f"Подпись: {r['pseudonym'] or 'Аноним'}{mail_note}{quiet_note}\n\n"
            f"<i>{_esc(r['question'])}</i>\n\n"
            f"«✍️ Ответить» — следующее сообщение станет ответом"
            + ("." if r["quiet"] else " и опубликует пару в приёмной."))
    await notify.notify_admins(bot, text, reply_markup=kb.qa_moderate(qa_id))


def _esc(s: str | None) -> str:
    import html
    return html.escape(s or "", quote=False)


async def answer(bot: Bot | None, qa_id: int, answer_text: str,
                 *, publish: bool | None = None, tag: str | None = None,
                 question_edit: str | None = None) -> dict:
    """Ответ мастера: публикация пары (или тихое письмо) + письмо автору."""
    r = await db.qa_get(qa_id)
    if not r:
        return {"ok": False, "error": "not_found"}
    a = sanitize(answer_text, MAX_A)
    if len(a) < 5:
        return {"ok": False, "error": "too_short"}
    do_publish = (not r["quiet"]) if publish is None else bool(publish)
    fields = {"answer": a, "answered_at": _now_iso()}
    if question_edit is not None and len(sanitize(question_edit)) >= 10:
        fields["question"] = sanitize(question_edit)
    if tag is not None and (tag in TAGS or tag == ""):
        fields["tag"] = tag
    if do_publish:
        fields["status"] = "published"
        fields["published_at"] = _now_iso()
    else:
        fields["status"] = "answered"
    await db.qa_mark(qa_id, **fields)
    fresh = await db.qa_get(qa_id)
    if fresh["email"]:
        from . import mailer
        try:
            await mailer.qa_answered(fresh)
        except Exception as e:  # noqa: BLE001 — письмо не должно ломать ответ
            log.warning("qa letter failed for %s: %s", qa_id, e)
    return {"ok": True, "published": do_publish, "qa": fresh}


async def reject(qa_id: int) -> bool:
    r = await db.qa_get(qa_id)
    if not r:
        return False
    await db.qa_mark(qa_id, status="rejected")
    return True
