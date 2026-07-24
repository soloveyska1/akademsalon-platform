"""Неизменяемая русская спецификация заказа v2.

Канонический JSON является источником договорных данных. PDF строится только
из него; для публичной заявки точные JSON/PDF-байты и оба SHA-256 сохраняются
в строке offers. Новая редакция создаёт новую строку, старую не переписывает.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from .. import config, db
from . import payments

log = logging.getLogger(__name__)

_FONT_REGULAR = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "/Library/Fonts/DejaVuSans.ttf",
    os.path.expanduser("~/Library/Fonts/DejaVuSans.ttf"),
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
]
_FONT_BOLD = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    "/Library/Fonts/DejaVuSans-Bold.ttf",
    os.path.expanduser("~/Library/Fonts/DejaVuSans-Bold.ttf"),
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]

EXECUTOR_NAME = "Семёнов Семён Юрьевич"
EXECUTOR_LINE = (
    "Исполнитель: Семёнов Семён Юрьевич, плательщик НПД, "
    "ИНН 212885750445, г. Казань. Связь: support@akademsalon.ru · "
    "Telegram @academicsaloon · akademsalon.ru."
)

INK = (34, 32, 27)
MUTE = (105, 100, 92)
HAIR = (205, 198, 185)
WAX = (168, 64, 47)


def _first_existing(paths: list[str]) -> str | None:
    for path in paths:
        if os.path.exists(path):
            return path
    return None


def _dict(row) -> dict[str, Any]:
    if row is None:
        return {}
    if isinstance(row, dict):
        return dict(row)
    try:
        return {key: row[key] for key in row.keys()}
    except Exception:  # noqa: BLE001
        return {}


def _json_dict(raw) -> dict[str, Any]:
    if isinstance(raw, dict):
        return dict(raw)
    try:
        value = json.loads(raw or "{}")
        return value if isinstance(value, dict) else {}
    except (TypeError, ValueError):
        return {}


def _list(value) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip()[:1000] for item in value if str(item).strip()][:40]
    if value is None:
        return []
    return [part.strip()[:1000] for part in str(value).replace(";", "\n").splitlines()
            if part.strip()][:40]


def canonical_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False)


def canonical_hash(payload: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def _document_url(key: str) -> str:
    slug = {
        "specification": "specifikaciya",
        "academic_integrity": "academic-integrity",
    }.get(key, key)
    return f"https://akademsalon.ru/{slug}.html"


def _iso(value: str | None) -> str:
    text = str(value or "").strip()
    return text[:25] or db.now_iso()


def _ru_date(value: str | None) -> str:
    text = str(value or "")[:10]
    try:
        dt = datetime.strptime(text, "%Y-%m-%d")
    except ValueError:
        return str(value or "")
    months = ("января", "февраля", "марта", "апреля", "мая", "июня",
              "июля", "августа", "сентября", "октября", "ноября", "декабря")
    return f"{dt.day} {months[dt.month - 1]} {dt.year} г."


def _contour(value: Any, service_id: str = "") -> str:
    text = str(value or "").upper()
    if text.startswith("B1") or text.startswith("Б1"):
        return "B1"
    if text.startswith("B2") or text.startswith("Б2"):
        return "B2"
    if text.startswith("A") or text.startswith("А"):
        return "A"
    return "B_PENDING" if service_id == "author" else "A"


def _amount(line: dict[str, Any]) -> int:
    price = line.get("price")
    if isinstance(price, dict):
        price = price.get("amount")
    for value in (price, line.get("price_amount"), line.get("final_price"),
                  line.get("a")):
        try:
            amount = int(value or 0)
        except (TypeError, ValueError):
            amount = 0
        if amount > 0:
            return amount
    return 0


def _allocate(total: int, weights: list[int]) -> list[int]:
    """Детерминированно распределить целые рубли с остатком по порядку строк."""
    if not weights:
        return []
    weights = [max(0, int(value or 0)) for value in weights]
    if not sum(weights):
        weights = [1] * len(weights)
    base = [total * value // sum(weights) for value in weights]
    for index in range(total - sum(base)):
        base[index % len(base)] += 1
    return base


def _request_line(item) -> dict[str, Any]:
    row = _dict(item)
    request = _json_dict(row.get("request_json"))
    request.update({
        "id": row.get("client_id") or row.get("id"),
        "position": row.get("position"),
        "parent_client_id": row.get("parent_client_id"),
        "kind": row.get("kind"),
        "type": row.get("catalog_id"),
        "label": row.get("label"),
        "qty": row.get("qty"),
        "topic": row.get("topic"),
        "deadline_text": row.get("deadline_text"),
        "requirements": row.get("requirements"),
        "note": row.get("note"),
        "quote_low": row.get("quote_low"),
        "quote_high": row.get("quote_high"),
        "final_price": row.get("final_price"),
        "answers": _json_dict(row.get("answers_json")),
    })
    return request


def _normal_line(raw: dict[str, Any], position: int, o: dict[str, Any]) -> dict[str, Any]:
    answer = raw.get("answers") if isinstance(raw.get("answers"), dict) else {}
    scope = raw.get("scope") if isinstance(raw.get("scope"), dict) else {}
    input_data = raw.get("input") if isinstance(raw.get("input"), dict) else {}
    if not input_data and isinstance(raw.get("customer_inputs"), dict):
        input_data = raw["customer_inputs"]
    deadline = raw.get("deadline") if isinstance(raw.get("deadline"), dict) else {}
    correction = raw.get("correction_window")
    if not isinstance(correction, dict):
        correction = {}
    service_id = str(raw.get("service_id") or answer.get("service_id") or "")
    contour = _contour(raw.get("contract_contour") or answer.get("contract_contour"),
                       service_id)
    title = str(raw.get("title") or raw.get("label") or raw.get("t")
                or f"Позиция {position}")[:180]
    line_id = str(raw.get("line_id") or raw.get("id")
                  or raw.get("requested_line_id") or raw.get("client_id")
                  or f"LN-{position:03d}")[:100]
    purpose = str(raw.get("permitted_purpose") or answer.get("purpose") or "")
    if not purpose and contour == "A":
        purpose = ("Консультация, аудит, редактура или оформление самостоятельного "
                   "материала Заказчика без выполнения аттестации вместо него.")
    result = str(raw.get("deliverable") or raw.get("result")
                 or f"Результат по позиции «{title}» в согласованном формате")[:1000]
    included = _list(raw.get("inclusions") or raw.get("included"))
    if not included:
        included = ["операции и объём, прямо названные в этой позиции"]
    excluded = _list(raw.get("exclusions") or raw.get("excluded"))
    if not excluded:
        excluded = (
            ["создание и сдача аттестационной работы вместо Заказчика",
             "гарантия оценки, допуска, процента оригинальности или решения комиссии"]
            if contour == "A"
            else ["использование результата в учебной или научной аттестации"]
        )
    criteria = _list(raw.get("acceptance_criteria"))
    if not criteria:
        criteria = ["передан согласованный результат",
                    "результат соответствует включённым операциям и формату позиции"]
    dependencies = _list(raw.get("dependencies") or raw.get("dependency_line_ids"))
    input_description = str(
        input_data.get("description") or raw.get("input_description")
        or scope.get("customer_requirements") or raw.get("requirements")
        or "Исходные материалы и требования Заказчика, переданные в деле заказа"
    )[:1500]
    input_version = str(input_data.get("version") or raw.get("input_version")
                        or "версия, зафиксированная в деле заказа до начала позиции")[:300]
    deadline_text = str(deadline.get("text") or raw.get("deadline_text")
                        or raw.get("deadline") or o.get("deadline_text") or "")[:180]
    deadline_date = str(deadline.get("date") or raw.get("deadline_date")
                        or o.get("deadline_date") or "")[:10]
    actual_author = str(raw.get("actual_author") or "").strip()
    author_profile = raw.get("actual_author_profile")
    if not actual_author and isinstance(author_profile, dict):
        # Название модели («Лично Исполнитель (Б1)») — не имя автора.
        # В B1 без отдельного имени договор прямо называет Исполнителя; в B2
        # пустое имя остаётся ошибкой strict-валидации до выпуска документа.
        actual_author = str(author_profile.get("author_name") or "").strip()
    if contour == "B1" and actual_author.lower() in ("исполнитель", "мастерская"):
        actual_author = EXECUTOR_NAME
    if not actual_author:
        actual_author = (
            "Заказчик — автор содержательной основы; Исполнитель оказывает "
            "согласованную консультационную или редакторскую услугу"
            if contour == "A" else
            (EXECUTOR_NAME if contour == "B1" else "")
        )
    rights = str(raw.get("rights_mode") or raw.get("intellectual_rights_profile") or "")
    if not rights:
        rights = (
            "Права на исходник Заказчика сохраняются у Заказчика; режим "
            "использования результата Исполнителя определяется Офертой и этой позицией"
            if contour == "A" else ""
        )
    unit = str(raw.get("unit") or "позиция")[:120]
    unit_definition = str(raw.get("unit_definition")
                          or f"1 позиция = один результат «{title}» с указанным составом")[:500]
    third_party_performers = _list(raw.get("third_party_performers"))
    if (contour == "B2" and not third_party_performers
            and isinstance(author_profile, dict)
            and not author_profile.get("confirmation_pending")):
        named_performer = str(author_profile.get("author_name") or "").strip()
        if named_performer:
            third_party_performers = [named_performer]
    return {
        "line_id": line_id,
        "position": position,
        "parent_line_id": str(raw.get("parent_line_id")
                              or raw.get("parent_client_id") or "")[:100] or None,
        "dependency_line_ids": dependencies,
        "separability": str(raw.get("separability") or "independent")[:40],
        "contract_contour": contour,
        "permitted_purpose": purpose[:1000],
        "legal_service_type": str(raw.get("legal_service_type")
                                  or ("academic_support" if contour == "A"
                                      else "author_order_non_attestation"))[:100],
        "service_code": str(raw.get("service_code") or raw.get("type") or "")[:100],
        "title": title,
        "plain_description": str(raw.get("plain_description") or result)[:1200],
        "quantity": max(1, min(100, int(raw.get("quantity") or raw.get("qty") or 1))),
        "unit": unit,
        "unit_definition": unit_definition,
        "scope": {"topic": str(raw.get("topic") or scope.get("topic") or o.get("topic") or "")[:400],
                  "included": included, "excluded": excluded},
        "customer_inputs": {"description": input_description, "version": input_version},
        "deliverables": [{"name": result, "formats": _list(raw.get("formats")) or
                          ["формат, зафиксированный в деле заказа"],
                          "acceptance_criteria": criteria}],
        "schedule": {"deadline_text": deadline_text,
                     "deadline_date": deadline_date,
                     "start_conditions": dependencies or
                     ["получение полного комплекта исходных материалов"]},
        "corrections": {
            "primary_check_days": int(correction.get("days")
                                      or raw.get("correction_window_days") or 7),
            "voluntary_iterations": int(raw.get("iterations") or 1),
            "scope": str(correction.get("scope") or
                         "устранение подтверждённых несоответствий этой позиции")[:500],
        },
        "actual_author": actual_author[:500],
        "rights_mode": rights[:1000],
        "third_party_performers": third_party_performers,
        "price_rub": _amount(raw),
        "discount_rub": max(0, int(raw.get("discount_amount")
                                   or (_dict(raw.get("discount")).get("amount") or 0))),
        "payment_allocation": _list(raw.get("payment_allocation")),
        "cancellation_effect": str(raw.get("cancellation_effect")
                                   or "расчёт за фактически оказанное по этой позиции")[:500],
    }


def _validate_offered(spec: dict[str, Any]) -> None:
    lines = spec.get("lines") or []
    if not lines:
        raise ValueError("specification_lines_required")
    ids = [line["line_id"] for line in lines]
    if len(ids) != len(set(ids)):
        raise ValueError("specification_line_ids_not_unique")
    required = (
        "permitted_purpose", "title", "unit_definition", "actual_author", "rights_mode",
    )
    for line in lines:
        if line["contract_contour"] not in ("A", "B1", "B2"):
            raise ValueError(f"line_{line['position']}_contract_contour_required")
        for field in required:
            if not line.get(field):
                raise ValueError(f"line_{line['position']}_{field}_required")
        if line["price_rub"] <= 0:
            raise ValueError(f"line_{line['position']}_price_required")
        if not line["scope"]["included"] or not line["scope"]["excluded"]:
            raise ValueError(f"line_{line['position']}_scope_required")
        if not line["deliverables"][0]["acceptance_criteria"]:
            raise ValueError(f"line_{line['position']}_acceptance_required")
        if line["contract_contour"] == "B2" and not line["third_party_performers"]:
            raise ValueError(f"line_{line['position']}_b2_performer_required")


def specification_from_payload(o, order_items: list[Any], raw: dict[str, Any] | None,
                               revision: int = 1, created_at: str | None = None,
                               *, strict: bool = False) -> dict[str, Any]:
    """Нормализовать admin-v2 либо сохранённый request-v2 в договорный снимок."""
    order = _dict(o)
    raw = raw if isinstance(raw, dict) else {}
    sources = raw.get("lines") if isinstance(raw.get("lines"), list) else []
    if not sources:
        sources = [_request_line(item) for item in order_items]
    if not sources:
        sources = [{
            "id": "LN-001", "position": 1, "label": order.get("work_label"),
            "topic": order.get("topic"), "deadline_text": order.get("deadline_text"),
            "price_amount": order.get("price"), "contract_contour": "A",
        }]
    lines = [_normal_line(_dict(source), index, order)
             for index, source in enumerate(sources, 1)]

    total = int(order.get("price") or 0)
    amounts = [line["price_rub"] for line in lines]
    if total > 0 and (not all(amounts) or sum(amounts) != total):
        weights = [
            int(_dict(source).get("quote_low") or _dict(source).get("a") or 1)
            for source in sources
        ]
        amounts = _allocate(total, weights)
        for line, amount in zip(lines, amounts):
            line["price_rub"] = amount

    built = _iso(created_at or raw.get("created_at") or order.get("updated_at")
                 or order.get("created_at"))
    spec = {
        "schema_version": "2.0",
        "spec_id": str(raw.get("spec_id")
                       or f"AS-{int(order.get('id') or 0):06d}-R{revision:02d}"),
        "order_id": int(order.get("id") or 0),
        "number": str(order.get("id") or ""),
        "revision": int(revision or 1),
        "status": "offered",
        "created_at": built,
        "currency": "RUB",
        "documents": {
            key: {"version": value,
                  "url": _document_url(key)}
            for key, value in config.DOC_EDITIONS.items()
        },
        "parties": {
            "contractor": {"name": EXECUTOR_NAME, "inn": "212885750445",
                           "tax_regime": "НПД"},
            "customer": {"name": str(order.get("guest_name") or "Заказчик")[:120]},
        },
        "lines": lines,
        "pricing": {
            "gross_rub": sum(line["price_rub"] for line in lines),
            "line_discount_rub": sum(line["discount_rub"] for line in lines),
            "order_price_rub": total or sum(line["price_rub"] for line in lines),
            "currency": "RUB",
        },
        "common_terms": {
            "offer_acceptance": "оплата первого платежа после получения этой редакции",
            "delivery_channel": "приватное дело заказа на сайте и привязанный Telegram-бот",
            "change_control": "любое существенное изменение оформляется новой редакцией",
        },
    }
    plan = payments.stage_plan(o)
    spec["payment_schedule"] = []
    for stage in plan:
        allocations = _allocate(int(stage["amount"]), [line["price_rub"] for line in lines])
        spec["payment_schedule"].append({
            "kind": stage["kind"], "label": stage["label"],
            "amount_rub": int(stage["amount"]),
            "allocations": [
                {"line_id": line["line_id"], "amount_rub": amount}
                for line, amount in zip(lines, allocations)
            ],
        })
    if strict:
        _validate_offered(spec)
        if total and sum(line["price_rub"] for line in lines) != total:
            raise ValueError("specification_price_mismatch")
    return spec


async def specification_for_order(o) -> dict[str, Any]:
    """Последний снимок; v2-сборка из строк допустима только как черновик."""
    stored = await db.specification_latest(o["id"])
    stored_spec = _json_dict(_dict(stored).get("specification_json"))
    if stored_spec:
        return stored_spec
    off = await db.offer_by_order(o["id"])
    if off:
        snap = _json_dict(_dict(off).get("specification_json"))
        if snap:
            return snap
    items = await db.items_for_order(o["id"])
    return specification_from_payload(o, items, None, revision=1,
                                      created_at=_dict(o).get("updated_at"))


async def snapshot_for_order(o) -> dict[str, Any]:
    """Вернуть только заранее замороженные JSON/PDF и хэши.

    Генерация «на лету» здесь запрещена: цена, сроки или строки заказа могли
    измениться после того, что увидел клиент. Черновик можно собрать через
    ``specification_for_order``, но выпускать документ разрешено только после
    ``db.specification_create``.
    """
    stored = await db.specification_latest(o["id"])
    stored_d = _dict(stored)
    stored_spec = _json_dict(stored_d.get("specification_json"))
    stored_pdf = stored_d.get("pdf_bytes")
    if stored_spec and stored_pdf:
        payload = bytes(stored_pdf)
        return {
            "snapshot_id": int(stored_d["id"]),
            "specification": stored_spec,
            "data_hash": stored_d.get("specification_hash")
                         or canonical_hash(stored_spec),
            "pdf": payload,
            "pdf_hash": stored_d.get("pdf_hash")
                        or hashlib.sha256(payload).hexdigest(),
            "revision": int(stored_d.get("revision")
                            or stored_spec.get("revision") or 1),
            "status": stored_d.get("status"),
            "frozen": True,
        }
    # Совместимость с уже созданной frozen-offer редакцией между миграциями:
    # это всё ещё точные сохранённые байты, а не mutable fallback.
    off = await db.offer_by_order(o["id"])
    off_d = _dict(off)
    spec = _json_dict(off_d.get("specification_json"))
    frozen_pdf = off_d.get("specification_pdf")
    if spec and frozen_pdf:
        payload = bytes(frozen_pdf)
        return {
            "specification": spec,
            "data_hash": off_d.get("specification_hash") or canonical_hash(spec),
            "pdf": payload,
            "pdf_hash": off_d.get("specification_pdf_hash")
                        or hashlib.sha256(payload).hexdigest(),
            "revision": int(off_d.get("specification_revision")
                            or spec.get("revision") or 1),
            "frozen": True,
        }
    return {
        "specification": None,
        "data_hash": "",
        "pdf": None,
        "pdf_hash": "",
        "revision": 0,
        "frozen": False,
    }


def _pdf_datetime(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        parsed = datetime(2000, 1, 1, tzinfo=timezone.utc)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


async def build_pdf(o, specification: dict[str, Any] | None = None) -> bytes | None:
    """Построить стабильные PDF-байты только из канонической спецификации."""
    try:
        from fpdf import FPDF
        from fpdf.enums import XPos, YPos
    except Exception as exc:  # noqa: BLE001
        log.warning("fpdf2 недоступен: %s", exc)
        return None
    reg = _first_existing(_FONT_REGULAR)
    bold = _first_existing(_FONT_BOLD) or reg
    if not reg:
        log.warning("DejaVuSans.ttf не найден")
        return None
    spec = specification or await specification_for_order(o)
    data_hash = canonical_hash(spec)
    revision = int(spec.get("revision") or 1)
    order_no = int(spec.get("order_id") or _dict(o).get("id") or 0)
    built = _pdf_datetime(str(spec.get("created_at") or ""))
    built_ru = built.astimezone(config.MSK).strftime("%d.%m.%Y %H:%M МСК")

    class SpecPDF(FPDF):
        def footer(self):  # noqa: N802
            self.set_y(-16)
            self.set_draw_color(*HAIR)
            self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
            self.set_font("DV", "", 6.8)
            self.set_text_color(*MUTE)
            self.multi_cell(
                0, 3.5,
                f"{spec['spec_id']} · ред. {revision} · SHA-256 данных: {data_hash}\n"
                f"страница {self.page_no()} из {{nb}}",
                align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT,
            )

    pdf = SpecPDF(format="A4")
    pdf.alias_nb_pages()
    pdf.set_margins(17, 15, 17)
    pdf.set_auto_page_break(True, 22)
    pdf.add_font("DV", "", reg)
    pdf.add_font("DV", "B", bold)
    pdf.set_creation_date(built)
    pdf.set_title(f"Спецификация заказа № {order_no}, редакция {revision}")
    pdf.set_author("Академический Салон")
    pdf.set_subject(data_hash)
    pdf.add_page()
    width = pdf.w - pdf.l_margin - pdf.r_margin
    home = {"new_x": XPos.LMARGIN, "new_y": YPos.NEXT}

    def p(text: str, size: float = 9.2, leading: float = 4.8,
          color=INK, bold_text: bool = False):
        pdf.set_font("DV", "B" if bold_text else "", size)
        pdf.set_text_color(*color)
        pdf.multi_cell(width, leading, str(text), **home)

    def heading(text: str):
        if pdf.get_y() > pdf.h - pdf.b_margin - 30:
            pdf.add_page()
        pdf.ln(2.5)
        p(text, 11, 5.8, bold_text=True)
        y = pdf.get_y() + .5
        pdf.set_draw_color(*HAIR)
        pdf.line(pdf.l_margin, y, pdf.l_margin + width, y)
        pdf.ln(2.5)

    p("АКАДЕМИЧЕСКИЙ САЛОН · ИНДИВИДУАЛЬНЫЕ УСЛОВИЯ", 8, 4, MUTE)
    p(f"Спецификация заказа № {order_no}", 17, 8, bold_text=True)
    p(f"Редакция {revision} · сформирована {built_ru} · "
      f"{len(spec['lines'])} поз.", 8.6, 4.5, MUTE)
    pdf.set_draw_color(*WAX)
    pdf.set_line_width(.6)
    pdf.line(pdf.l_margin, pdf.get_y() + 2, pdf.l_margin + width, pdf.get_y() + 2)
    pdf.ln(5)
    p("Это индивидуальная часть договора. Она действует только вместе с "
      f"Публичной офертой ред. {config.DOC_EDITIONS['oferta']}. Оплата первого "
      "платежа после получения этого файла означает принятие именно этой редакции.")

    heading("1. Стороны и документы")
    p(EXECUTOR_LINE)
    customer = spec.get("parties", {}).get("customer", {}).get("name") or "Заказчик"
    p(f"Заказчик: {customer}. Идентификаторы и подтверждённые контакты хранятся "
      "в приватном деле заказа и не публикуются в документе.")
    docs = spec.get("documents") or {}
    document_names = {
        "oferta": "Публичная оферта",
        "privacy": "Политика ПДн",
        "consent": "Согласие",
        "terms": "Условия сайта",
        "loyalty": "Правила лояльности",
        "requisites": "Реквизиты",
        "specification": "Спецификация",
        "academic_integrity": "Академическая добросовестность",
    }
    p("Применимые редакции: " + " · ".join(
        f"{document_names.get(name, name)} {data.get('version')}"
        for name, data in docs.items()
        if isinstance(data, dict) and data.get("version")
    ), 8.5, 4.4, MUTE)

    heading("2. Краткое резюме")
    pricing = spec.get("pricing") or {}
    p(f"Позиций: {len(spec['lines'])}. Твёрдая цена заказа: "
      f"{config.fmt_money(pricing.get('order_price_rub') or 0)} ₽. "
      "Каждая строка ниже имеет самостоятельный предмет, результат, срок, "
      "цену, критерии и режим использования.")
    for line in spec["lines"]:
        due = line["schedule"].get("deadline_text") or _ru_date(
            line["schedule"].get("deadline_date")) or "срок указан в карточке позиции"
        p(f"{line['position']:02}. [{line['contract_contour']}] {line['title']} · "
          f"{line['quantity']} {line['unit']} · {due} · "
          f"{config.fmt_money(line['price_rub'])} ₽", 9, 4.8,
          bold_text=True)

    heading("3. Подробные условия позиций")
    for line in spec["lines"]:
        if pdf.get_y() > pdf.h - pdf.b_margin - 58:
            pdf.add_page()
        p(f"Позиция {line['position']} · {line['line_id']} · "
          f"контур {line['contract_contour']}", 10.2, 5.4, bold_text=True)
        p(line["title"], 11.4, 6, bold_text=True)
        p(f"Назначение: {line['permitted_purpose']}")
        p(f"Результат: {line['deliverables'][0]['name']}")
        p(f"Единица: {line['unit_definition']}; количество — "
          f"{line['quantity']} {line['unit']}.")
        p("Исходные материалы: " + line["customer_inputs"]["description"])
        p("Версия исходников: " + line["customer_inputs"]["version"])
        p("Включено: " + "; ".join(line["scope"]["included"]))
        p("Не включено: " + "; ".join(line["scope"]["excluded"]))
        p("Критерии приёмки: " +
          "; ".join(line["deliverables"][0]["acceptance_criteria"]))
        deadline = line["schedule"].get("deadline_text") or _ru_date(
            line["schedule"].get("deadline_date")) or "указан в деле заказа"
        p("Договорный срок: " + deadline)
        p("Условия начала и зависимости: " +
          "; ".join(line["schedule"]["start_conditions"]))
        p(f"Проверка и исправления: {line['corrections']['primary_check_days']} "
          f"календарных дней первичной проверки; "
          f"{line['corrections']['scope']}.")
        p("Фактический автор / роль: " + line["actual_author"])
        p("Права и использование: " + line["rights_mode"])
        if line["third_party_performers"]:
            p("Привлечённые лица: " + "; ".join(line["third_party_performers"]))
        p(f"Цена позиции: {config.fmt_money(line['price_rub'])} ₽. "
          f"Отказ: {line['cancellation_effect']}.", bold_text=True)
        pdf.ln(2)

    heading("4. Цена и график платежей")
    p(f"Цена заказа: {config.fmt_money(pricing.get('order_price_rub') or 0)} ₽. "
      "Скидка, бонусы, сертификат и депозит показываются отдельно; сертификат "
      "и депозит являются зачётом ранее внесённого аванса, а не скидкой.")
    for index, stage in enumerate(spec.get("payment_schedule") or [], 1):
        allocation = "; ".join(
            f"{part['line_id']} — {config.fmt_money(part['amount_rub'])} ₽"
            for part in stage.get("allocations") or []
        )
        p(f"{index}. {stage['label']}: {config.fmt_money(stage['amount_rub'])} ₽. "
          f"Распределение: {allocation}.")

    heading("5. Передача, приёмка и изменения")
    p("Результаты передаются в приватном деле заказа на сайте и, после "
      "привязки, в Telegram-боте @academic_saloon_bot. Переданные файлы, "
      "сообщения и отметки времени сохраняются в деле.")
    p("Заказчик проверяет каждую позицию по её измеримым критериям. "
      "Подтверждённые несоответствия согласованному предмету устраняются без "
      "доплаты в пределах закона и условий Оферты. Добровольные итерации не "
      "ограничивают права при обнаружении недостатка.")
    p("Изменение предмета, результата, цены, срока, контура или режима прав "
      "вступает в силу только после выпуска и отдельного принятия новой "
      "редакции. Старая редакция сохраняется без изменений.")

    heading("6. Контуры и допустимое использование")
    p("Контур A — консультация, обучение, аудит, редактура или оформление "
      "самостоятельного материала Заказчика; Исполнитель не выполняет за него "
      "аттестационную работу и не участвует в сдаче или защите.")
    p("Контур B1 — авторский заказ вне аттестации, произведение лично создаёт "
      "Исполнитель. Контур B2 — произведение создаёт названный фактический "
      "автор; передача возможна только при подтверждённой цепочке прав. "
      "Конкретный режим прав указан в карточке соответствующей позиции.")
    p("Заказчик отвечает за фактическую цель использования результата и "
      "соблюдение правил своей организации. Название «образец» само по себе "
      "не меняет назначение заказа.")

    heading("7. Отказ, претензии и заключительные положения")
    p("Заказчик вправе отказаться от договора в любое время с оплатой "
      "фактически оказанного и подтверждённых расходов. Расчёт производится "
      "по каждой позиции и распределению платежей; неоказанная часть "
      "возвращается применимым способом.")
    p("Претензии направляются на support@akademsalon.ru или в переписке дела. "
      "К отношениям применяется право Российской Федерации; права потребителя "
      "и законная подсудность соглашением не ограничиваются.")
    p("Технические доказательства этой редакции:", bold_text=True)
    p(f"ID: {spec['spec_id']}\nРедакция: {revision}\n"
      f"SHA-256 канонических данных: {data_hash}\n"
      "SHA-256 окончательного PDF показывается рядом со ссылкой на файл и "
      "фиксируется сервером в журнале акцепта.", 8.4, 4.4, MUTE)

    return bytes(pdf.output())
