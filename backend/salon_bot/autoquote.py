"""Auditable workload quotation. Pure core: no network, money or customer writes.

A candidate is NOT an offer. Only the issuance adapter may promise a deadline
after reserving capacity and producing the immutable contract specification.
All monetary arithmetic uses integer roubles / basis points; workload is minutes.
"""
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import re

VERSION = "labor-2026-09-09.1"
# Retail floors are the existing public catalogue, never client quote_preview.
FLOORS = {
    "self": (1500, 2500, 2500), "course": (2500, 9000, 14000),
    "course_emp": (3000, 14000, 20000), "practice": (2500, 8000, 14000),
    "chapter": (3000, 9000, 30000), "diplom": (3000, 24000, 40000),
    "master": (5000, 36000, 60000), "kandidat": (7500, 60000, 200000),
    "rinc": (2500, 7000, 9000), "vak": (3000, 12000, 18000),
    "scopus": (5000, 22000, 35000),
}
RESULT_INDEX = {"diagnostic": 0, "editing": 1, "support": 2}
REASONS = {
    "facts_required": "Уточни объём и состав задания: без них нельзя закрепить цену.",
    "volume_conflict": "В описании и выбранном объёме разные числа. Уточним нужный объём.",
    "research_conflict": "В задании есть исследование или расчёты. Их нужно включить в состав.",
    "materials_pending": "Сначала проверим приложенные материалы, чтобы учесть все требования.",
    "source_required": "Для работы с готовым текстом нужен сам исходный документ.",
    "unsupported": "Для этой задачи нужен индивидуальный состав и расчёт.",
    "complex_research": "Сложную методику, сбор данных или специальные расчёты подтвердит мастер.",
    "participation_required": "Подтверди своё участие в исследовании и предоставление исходных данных.",
    "deadline_required": "Выбери дату: так можно проверить доступное время на работу.",
    "deadline_capacity": "В указанный срок работа не помещается. Проверим возможность экспресса.",
    "fast_review": "Для срока меньше суток мастер проверит возможность выполнения.",
    "capacity_required": "Проверяем загрузку мастера перед закреплением срока.",
    "financial_floor": "Состав и выбранные льготы требуют индивидуального расчёта.",
    "unbounded_scope": "Есть дополнительные условия, которые требуют отдельной оценки.",
    "policy_disabled": "Для этого состава автоматическое подтверждение пока недоступно.",
}


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def ceildiv(n, d):
    return (n + d - 1) // d


def money_up(value):
    return ceildiv(value, 100) * 100


@dataclass(frozen=True)
class Policy:
    """Conservative planning reserves, NOT measured owner's cost or earnings.

    enable_issue is deliberately separate from numerical readiness. Only deploy
    an enabled policy after existing backlog / available capacity is reconciled.
    """
    version: str = VERSION
    cost_per_hour: int = 1000
    operating_bps: int = 1000  # fees / tax / future earned cashback reserve
    margin_bps: int = 3000
    max_discount_bps: int = 2500
    uncertainty_bps: int = 2500
    day_minutes: int = 240
    max_auto_minutes: int = 2400
    enable_issue: bool = False

    def __post_init__(self):
        values = (self.cost_per_hour, self.day_minutes, self.max_auto_minutes)
        if any(type(v) is not int or v <= 0 for v in values):
            raise ValueError("invalid_positive_policy")
        for value in (self.operating_bps, self.margin_bps, self.max_discount_bps, self.uncertainty_bps):
            if type(value) is not int or not 0 <= value <= 5000:
                raise ValueError("invalid_policy_bps")
        if self.operating_bps + self.margin_bps >= 10000:
            raise ValueError("policy_no_margin_room")


def _count(data, key, maximum):
    value = data.get(key)
    return value if type(value) is int and 0 <= value <= maximum else None


def _aware(value):
    if not isinstance(value, str) or len(value) > 40:
        return None
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return result.astimezone(timezone.utc) if result.tzinfo else None
    except (ValueError, OverflowError):
        return None


def analyze(body, *, materials=None, policy=None, now=None):
    """body is untrusted; materials is a server-created extraction manifest.

    Intent fields: work, result, scope, pages, sources, tables, figures,
    research(none/descriptive/statistical/field/custom), iterations, addons,
    deadline_at, speed, facts_confirmed. Contradictions never lower a price.
    Attached content is evidence, not executable instructions or pricing policy.
    """
    policy = policy or Policy()
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("aware_now_required")
    if not isinstance(body, dict):
        body = {}
    facts = body.get("quote_facts")
    facts = facts if isinstance(facts, dict) else {}
    reasons, components = [], []

    def manual(code):
        if code not in reasons:
            reasons.append(code)

    work, result = facts.get("work"), facts.get("result")
    if not isinstance(work, str) or work not in FLOORS or not isinstance(result, str) or result not in RESULT_INDEX:
        manual("unsupported")
        work, result = None, None
    scope = facts.get("scope")
    if scope not in ("whole", "part") or (scope == "part" and work not in ("chapter", "self")):
        manual("unsupported")
    numbers = {k: _count(facts, k, limit) for k, limit in
               (("pages", 500), ("sources", 500), ("tables", 100), ("figures", 100), ("iterations", 5))}
    if facts.get("facts_confirmed") is not True or any(v is None for v in numbers.values()) or not numbers.get("pages") or not numbers.get("iterations"):
        manual("facts_required")
    research = facts.get("research")
    if research not in ("none", "descriptive", "statistical", "field", "custom"):
        manual("facts_required")
    if work in ("kandidat", "scopus", "vak") or research in ("statistical", "field", "custom"):
        manual("complex_research")
    if work == "course_emp" and research == "none":
        manual("research_conflict")
    composition = body.get("composition_intent") or {}
    if not isinstance(composition, dict):
        composition = {}
        manual("unsupported")
    if composition.get("package") == "vip":
        manual("unbounded_scope")
    if composition.get("speed", facts.get("speed")) != facts.get("speed"):
        manual("facts_required")
    cart = body.get("cart") or {}
    items = cart.get("items") if isinstance(cart, dict) else None
    if not isinstance(items, list) or not items or not isinstance(items[0], dict):
        manual("unsupported")
    else:
        first = items[0]
        expected_tier = {"diagnostic": "base", "editing": "turn", "support": "vip"}.get(result)
        if first.get("kind") != "work" or first.get("type") != work or first.get("tier") != expected_tier or type(first.get("qty", 1)) is not int or first.get("qty", 1) != 1:
            manual("unsupported")
        # Multi-line packages require an explicit server reconciliation, never
        # price a cheap main line while ignoring the rest of the saved cart.
        if len(items) != 1:
            manual("unsupported")
    context = body.get("case_context") or {}
    if not isinstance(context, dict):
        context = {}
    if context.get("contract_contour") not in (None, "A"):
        manual("unsupported")
    if result == "support":
        participation = body.get("author_participation") or {}
        if not isinstance(participation, dict) or participation.get("confirmed") is not True or not participation.get("checkpoints"):
            manual("participation_required")
    # Do not infer an unknown attachment is empty, even if the browser says so.
    manifests = materials if isinstance(materials, list) else []
    expected_files = _count(facts, "files", 30)
    if expected_files is None or expected_files != len(manifests) or any(
            not isinstance(m, dict) or m.get("state") != "read" or not m.get("sha256") or
            not isinstance(m.get("text"), str) or not m["text"].strip() for m in manifests):
        manual("materials_pending")
    if result in ("editing", "diagnostic") and not manifests:
        manual("source_required")
    texts = [body.get("topic", ""), body.get("details", "")]
    for line in items or []:
        if isinstance(line, dict):
            texts.extend([line.get("topic", ""), line.get("requirements", "")])
            scope_input = line.get("scope")
            if isinstance(scope_input, dict):
                texts.append(scope_input.get("customer_requirements", ""))
    texts += [m.get("text", "") for m in manifests if isinstance(m, dict)]
    if any(not isinstance(t, str) or len(t) > 200000 for t in texts):
        manual("unbounded_scope")
    text = "\n".join(t[:200000] for t in texts if isinstance(t, str)).lower().replace("ё", "е")
    observed_pages = [int(x) for x in re.findall(r"(?<!\d)(\d{1,3})\s*(?:стр(?:аниц\w*)?\.?|страниц\w*)", text)]
    if observed_pages and numbers["pages"] is not None and max(observed_pages) > numbers["pages"]:
        manual("volume_conflict")
    # Signals trigger clarification; they NEVER silently add unwanted services.
    research_signal = re.search(r"эмпир\w*|регресси\w*|корреляц\w*|spss|статистическ\w*\s+анализ|манн[а–—\- ]+уитни|выборк\w*|анкетирован\w*", text)
    if research_signal and research == "none":
        manual("research_conflict")
    if (re.search(r"кандидатск\w*|диссертац\w*|магистерск\w*|дипломн\w*|\bвкр\b", text)
            and work in ("self", "course", "course_emp")):
        manual("unbounded_scope")
    if re.search(r"программирован\w*|чертеж\w*|лаборатор\w*|симуляц\w*|расчет\w*\s+(?:модел\w*|конструкц\w*)|уникальност\w*\s*(?:100|9[5-9])", text):
        manual("unbounded_scope")
    if context.get("discipline") in ("tech", "med"):
        manual("complex_research")
    addons = facts.get("addons", [])
    addon_norms = {
        "presentation": ("Презентация до 15 слайдов", 180, 4000),
        "speech": ("Речь до 7 минут", 90, 2000),
        "defense": ("Презентация до 15 слайдов и речь до 7 минут", 270, 6000),
        "norm": ("Один цикл замечаний нормоконтроля", 120, 5000),
    }
    if not isinstance(addons, list) or len(addons) > 4 or any(not isinstance(a, str) or a not in addon_norms for a in addons) or len(set(a for a in addons if isinstance(a, str))) != len(addons):
        manual("unsupported")
        addons = []
    if "defense" in addons and ("speech" in addons or "presentation" in addons):
        manual("unsupported")
    def add(key, title, count, minutes):
        if count and minutes:
            components.append({"key": key, "title": title, "units": count,
                               "minutes_per_unit": minutes, "minutes": count * minutes})

    p, s, t, f, iterations = [numbers[k] or 0 for k in ("pages", "sources", "tables", "figures", "iterations")]
    if result:
        add("brief", "Разбор задания и план", 1, 45)
        add("text", {"support": "Работа с текстом и аргументацией", "editing": "Редактура готового текста", "diagnostic": "Проверка исходного текста"}[result], p,
            {"support": 24, "editing": 12, "diagnostic": 5}[result])
        add("sources", "Проверка и оформление источников", s, 8 if result == "support" else 4)
        add("tables", "Проверка и оформление таблиц", t, 20)
        add("figures", "Схемы и иллюстрации", f, 25)
        if research == "descriptive":
            add("research", "Описательный анализ предоставленных данных", 1, 180)
        add("format", "Оформление по предоставленной методичке", p, 3)
        add("review", "Финальная сверка и корректировки по заданию", iterations, max(30, ceildiv(p * 6, 1)))
    base_minutes = sum(c["minutes"] for c in components)
    for key in addons:
        label, minutes, floor = addon_norms[key]
        add(key, label, 1, minutes)
    minutes = sum(c["minutes"] for c in components)
    reserve_minutes = ceildiv(minutes * policy.uncertainty_bps, 10000)
    labor_minutes = minutes + reserve_minutes
    labor_reserve = ceildiv(labor_minutes * policy.cost_per_hour, 60)
    # Floor survives the largest allowed existing discount, plus operating and
    # future-cashback reserve. No claim that these planning costs are actuals.
    net_needed = ceildiv(labor_reserve * 10000, 10000 - policy.operating_bps - policy.margin_bps)
    gross_labor = ceildiv(net_needed * 10000, 10000 - policy.max_discount_bps)
    base_floor = FLOORS[work][RESULT_INDEX[result]] if work and result else 0
    discipline_bps = {"hum": 10000, "law": 11500, "jurisprudence": 10000, "pedagogy": 10000,
                      "psychology": 12100, "tech": 13000, "med": 14000}
    disc = context.get("discipline", "hum")
    if not isinstance(disc, str) or disc not in discipline_bps:
        manual("unsupported")
        disc = "hum"
    # Canonical positive Math.round at the catalogue's 500 rouble increment.
    base_floor = ((base_floor * discipline_bps[disc] + 2500000) // 5000000) * 500
    def gross_for_minutes(value):
        reserve = ceildiv(value * (10000 + policy.uncertainty_bps), 10000)
        cost = ceildiv(reserve * policy.cost_per_hour, 60)
        net = ceildiv(cost * 10000, 10000 - policy.operating_bps - policy.margin_bps)
        return ceildiv(net * 10000, 10000 - policy.max_discount_bps)
    main_rub = money_up(max(base_floor, gross_for_minutes(base_minutes))) if base_floor else 0
    addon_prices = [{"key": a, "title": addon_norms[a][0],
                     "amount_rub": money_up(max(addon_norms[a][2], gross_for_minutes(addon_norms[a][1])))} for a in addons]
    standard = main_rub + sum(a["amount_rub"] for a in addon_prices) if base_floor and not any(v is None for v in numbers.values()) else None
    speed = facts.get("speed")
    if speed not in ("standard", "express24", "expressfast"):
        manual("facts_required")
    if speed == "expressfast":
        manual("fast_review")
    if speed == "express24" and (work == "kandidat" or labor_minutes > policy.day_minutes):
        manual("deadline_capacity")
    # User-approved ×2 applies to the main work; optional extras stay separate.
    express_extra = main_rub if standard and speed == "express24" else 0
    gross = standard + express_extra if standard else None
    deadline = _aware(facts.get("deadline_at"))
    if not deadline:
        manual("deadline_required")
    elif deadline <= now or (deadline - now).total_seconds() < max(3600, labor_minutes * 60):
        manual("deadline_capacity")
    elif speed == "standard" and labor_minutes > max(0, int((deadline - now).total_seconds() // 86400)) * policy.day_minutes:
        manual("deadline_capacity")
    if labor_minutes > policy.max_auto_minutes:
        manual("capacity_required")
    normalized = {"work": work, "result": result,
                  **{k: facts.get(k) if isinstance(facts.get(k), str) else None for k in ("scope", "research", "speed")},
                  "facts_confirmed": facts.get("facts_confirmed") is True, "files": expected_files,
                  **numbers, "addons": addons, "deadline_at": deadline.isoformat() if deadline else None,
                  "request_hash": digest(json.dumps(body, sort_keys=True, ensure_ascii=False, default=str)),
                  "brief_hash": digest([t for t in texts if isinstance(t, str)]),
                  "materials": [m.get("sha256") for m in manifests if isinstance(m, dict)]}
    return {
        "version": VERSION, "state": "manual_required" if reasons else "candidate",
        "can_pay": False, "policy_hash": digest(asdict(policy)), "intent_hash": digest(normalized),
        "facts": normalized, "components": components, "minutes": minutes,
        "reserve_minutes": reserve_minutes, "capacity_minutes": labor_minutes,
        "standard_rub": standard, "express_rub": express_extra, "gross_rub": gross,
        "main_rub": main_rub, "addon_prices": addon_prices,
        "minimum_net_rub": net_needed, "cost_reserve_rub": labor_reserve,
        "reasons": [{"code": c, "message": REASONS[c]} for c in reasons],
        "expires_at": (now + timedelta(minutes=30)).isoformat(),
        "deadline_at": deadline.isoformat() if deadline else None,
        "policy_enabled": policy.enable_issue,
    }


def check_economics(quote, *, discount_rub, bonus_rub, policy=None):
    """Use server-calculated benefits. Gift/deposit are tender, not discounts."""
    policy = policy or Policy()
    gross = quote.get("gross_rub")
    if type(gross) is not int or gross <= 0 or any(type(x) is not int or x < 0 for x in (discount_rub, bonus_rub)):
        return False
    reduction = discount_rub + bonus_rub
    return (bonus_rub * 100 <= gross * 20 and reduction * 10000 <= gross * policy.max_discount_bps
            and gross - reduction >= quote["minimum_net_rub"])


def strict_receipt_lines(spec, kind, amount):
    """No generic receipt fallback: exact frozen allocations or no invoice."""
    lines = spec.get("lines") or []
    stages = [s for s in spec.get("payment_schedule", []) if s.get("kind") == kind]
    if len(stages) != 1 or len({l.get("line_id") for l in lines}) != len(lines):
        raise ValueError("specification_receipt_mismatch")
    by_id = {line["line_id"]: line for line in lines}
    output, used = [], set()
    for allocation in stages[0].get("allocations", []):
        line_id, value = allocation.get("line_id"), allocation.get("amount_rub")
        if line_id not in by_id or line_id in used or type(value) is not int or value < 0:
            raise ValueError("specification_receipt_mismatch")
        used.add(line_id)
        name = by_id[line_id].get("receipt_name") or by_id[line_id].get("title")
        if not isinstance(name, str) or not name.strip():
            raise ValueError("specification_receipt_mismatch")
        if value:
            output.append({"name": name, "amount": value})
    if not output or sum(i["amount"] for i in output) != amount:
        raise ValueError("specification_receipt_mismatch")
    return output


async def legacy_checkout_allowed(order):
    """Compatibility only for pre-cutover orders with no snapshot history.

    No client flag can select this path. A cancelled snapshot never reopens it.
    Existing cohort keeps the existing payment contract while being migrated.
    """
    from .. import db
    created = str(order["created_at"] or "") if order else ""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?", created) or created >= "2026-09-09T00:00:00":
        return False
    cursor = await db.conn().execute("SELECT 1 FROM order_specifications WHERE order_id=? LIMIT 1", (order["id"],))
    return await cursor.fetchone() is None


async def refresh_financial_revision(order_id):
    """Reconcile only an unaccepted, unchanged scope before any payment.

    Never normalise contractual lines again. Unknown/paid/offer-origin cases
    stay immutable. Caller may present the new frozen PDF for fresh consent.
    """
    import copy
    from .. import db
    from . import contract, payments
    async with db.transaction():
        order = await db.get_order(order_id)
        snapshot = await db.specification_latest(order_id)
        if not order or not snapshot or not snapshot["pdf_bytes"]:
            return False
        if order["status"] not in ("priced", "prepay", "work", "check", "fix"):
            raise ValueError("pay_stage")
        spec = json.loads(snapshot["specification_json"])
        lines = spec.get("lines") or []
        plan = payments.stage_plan(order)
        old_plan = spec.get("payment_schedule") or []
        # Validate frozen allocations even when total happens to match.
        for stage in old_plan:
            strict_receipt_lines(spec, stage["kind"], stage.get("amount_rub", sum(a.get("amount_rub", 0) for a in stage.get("allocations", []))))
        old_amounts = [(x.get("kind"), x.get("amount_rub", sum(a.get("amount_rub", 0) for a in x.get("allocations", [])))) for x in old_plan]
        due = payments.money_due(order)
        settlement = {"discount_rub": due["sub_discount"] + due["promo_discount"],
                      "bonus_rub": due["bonus_spent"], "gift_tender_rub": due["gift_amount"],
                      "cash_rub": due["due_total"]}
        prior_settlement = spec.get("pricing", {}).get("settlement")
        settlement_same = prior_settlement is None or all(prior_settlement.get(k) == v for k,v in settlement.items())
        if old_amounts == [(x["kind"], x["amount"]) for x in plan] and settlement_same:
            return False
        pays = await db.payments_for_order(order_id)
        if snapshot["status"] != "offered" or snapshot["source"] != "price" or any(p["status"] in ("paid", "claimed") for p in pays):
            raise ValueError("financial_revision_requires_review")
        gross = order["price"]
        if (not lines or type(gross) is not int or gross <= 0 or
            spec.get("pricing", {}).get("order_price_rub") != gross or
            any(type(x.get("price_rub")) is not int or x["price_rub"] <= 0 for x in lines) or
            sum(x["price_rub"] for x in lines) != gross):
            raise ValueError("financial_revision_requires_review")
        due = payments.money_due(order)
        if any(type(v) is not int or v < 0 for v in due.values()):
            raise ValueError("financial_revision_requires_review")
        # Existing discounts can never silently become an oversized concession.
        if (due["bonus_spent"] * 100 > gross * 20 or
            (due["bonus_spent"] + due["sub_discount"] + due["promo_discount"]) * 100 > gross * 25):
            raise ValueError("financial_revision_requires_review")
        revised = copy.deepcopy(spec)
        revision = await db.specification_next_revision(order_id)
        revised.update(revision=revision, spec_id=f"AS-{order_id:06d}-R{revision:02d}",
                       created_at=db.now_iso(), status="offered")
        revised["pricing"]["settlement"] = {
            "discount_rub": due["sub_discount"] + due["promo_discount"],
            "bonus_rub": due["bonus_spent"], "gift_tender_rub": due["gift_amount"],
            "cash_rub": due["due_total"], "source_snapshot_id": snapshot["id"]}
        revised["payment_schedule"] = []
        for stage in plan:
            allocated = contract._allocate(stage["amount"], [x["price_rub"] for x in lines])
            revised["payment_schedule"].append({"kind": stage["kind"], "label": stage["label"],
                "amount_rub": stage["amount"], "allocations": [
                    {"line_id": line["line_id"], "amount_rub": value} for line, value in zip(lines, allocated)]})
        contract._validate_offered(revised)
        pdf = await contract.build_pdf(order, specification=revised)
        if not pdf:
            raise ValueError("financial_revision_requires_review")
        await db.payments_cancel_pending(order_id)
        await db.specification_create(order_id, contract.canonical_json(revised), pdf,
            source="price", revision=revision, schema_version=revised["schema_version"])
        await db.add_event(order_id, "financial_revision", f"R{revision}: benefits; source snapshot {snapshot['id']}")
    return True


async def checkout(order_id, *, receipt_email=None, expected_snapshot=None, expected_hash=None, expected_amount=None):
    """Called only AFTER existing access/CSRF/impersonation guards.

    Reuse existing payment + receipt tables. Amount, stage and exact revision
    are read under one writer lock. Provider I/O runs after commit. A lost HTTP
    response can retry the same pending invoice, without duplicate money rows.
    """
    from .. import db, config
    from . import payments, mailer
    if not config.robokassa_on():
        raise ValueError("online_unavailable")
    if await refresh_financial_revision(order_id):
        # Commit the new document before asking the customer to read it.
        raise ValueError("quote_changed")
    async with db.transaction() as connection:
        order = await db.get_order(order_id)
        if not order or order["status"] not in ("priced", "prepay", "work", "check", "fix"):
            raise ValueError("pay_stage")
        if not config.robokassa_on():
            raise ValueError("online_unavailable")
        kind, amount = await payments.stage_amount(order)
        if amount <= 0:
            raise ValueError("nothing_due")
        snapshot = await db.specification_latest(order_id)
        legacy = not snapshot and await legacy_checkout_allowed(order)
        if legacy:
            if any(v is not None for v in (expected_snapshot, expected_hash, expected_amount)):
                raise ValueError("quote_changed")
            # Same existing receipt rule, confined to the pre-cutover cohort.
            # The no-snapshot predicate and invoice insert share this lock.
            receipt = await payments._robo_order_receipt(order, kind, amount, payments.stage_label(order, kind))
            snapshot_id, snapshot_hash = None, None
        else:
            if not snapshot or snapshot["status"] not in ("offered", "accepted") or not snapshot["pdf_bytes"]:
                raise ValueError("specification_not_frozen")
            if (expected_snapshot is not None and expected_snapshot != snapshot["id"]) or (
                    expected_hash is not None and expected_hash != snapshot["specification_hash"]) or (
                    expected_amount is not None and expected_amount != amount):
                raise ValueError("quote_changed")
            spec = json.loads(snapshot["specification_json"])
            items = strict_receipt_lines(spec, kind, amount)
            receipt = payments._robo_receipt_items(items)
            snapshot_id, snapshot_hash = snapshot["id"], snapshot["specification_hash"]
        email = payments._robo_email(receipt_email) or payments._robo_email(await mailer.order_recipient(order))
        # An invoice with changed email is reused too; the latest valid email
        # updates only its delivery preference, not the immutable paid scope.
        current_msk = datetime.now(config.MSK).strftime("%Y-%m-%dT%H:%M")
        cursor = await connection.execute(
            "SELECT p.id,r.expires_at,r.receipt_payload FROM payments p JOIN payment_receipts r "
            "ON r.payment_id=p.id AND r.provider='robokassa' "
            "WHERE p.order_id=? AND p.specification_snapshot_id IS ? AND p.kind=? AND p.amount=? "
            "AND p.method='robokassa' AND p.status='pending' AND r.expires_at>? "
            "ORDER BY p.id DESC LIMIT 1", (order_id, snapshot_id, kind, amount, current_msk))
        existing = await cursor.fetchone()
        if existing and existing["receipt_payload"] != receipt:
            raise ValueError("specification_receipt_mismatch")
        payment_id = existing["id"] if existing else await db.payment_create(
            order_id, kind, amount, "robokassa", None, specification_snapshot_id=snapshot_id)
        expires = existing["expires_at"] if existing else payments._robo_expiration()
        await db.receipt_invoice_upsert(provider="robokassa", inv_id=payment_id,
            scope="order", scope_id=order_id, order_id=order_id, user_id=order["user_id"],
            payment_id=payment_id, kind=kind, amount=amount, buyer_email=email,
            receipt_payload=receipt, expires_at=expires)
        if not existing:
            await db.add_event(order_id, "payment_link", f"{kind} {amount} ₽ · Robokassa · snapshot {snapshot_id}")
        shp = {"Shp_kind": kind, "Shp_order": str(order_id)}
        out = f"{amount:.2f}"
        params = {"MerchantLogin": config.ROBOKASSA_LOGIN, "OutSum": out, "InvId": payment_id,
                  "Receipt": receipt, "Description": f"Заказ {order_id} — {payments.stage_label(order, kind)}"[:100],
                  "SignatureValue": payments._robo_sig(config.ROBOKASSA_LOGIN, out, payment_id, receipt,
                      config.robo_pass1(), *(f"{k}={v}" for k, v in sorted(shp.items()))),
                  "Culture": "ru", "Encoding": "utf-8", "ExpirationDate": expires, **shp}
        if email:
            params["Email"] = email
        if config.ROBOKASSA_TEST:
            params["IsTest"] = 1
    # No network wait under SQLite's writer lock. Repeat reuses the same InvId.
    url = await payments._robo_link(params)
    if not url:
        raise ValueError("pay_failed")
    return {"ok": True, "online": True, "url": url, "kind": kind, "amount": amount,
            "snapshot_id": snapshot_id, "snapshot_hash": snapshot_hash,
            "payment_id": payment_id, "reused": bool(existing), "legacy_checkout": legacy}
