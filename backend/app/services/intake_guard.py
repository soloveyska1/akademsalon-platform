"""Semantic intake guard for commercial orders.

The guard is intentionally narrow: it blocks explicit requests to perform
academic attestation instead of the customer, impersonate them in tests/LMS,
fabricate evidence, or bypass integrity checks.  It does not reject ordinary
mentions of those subjects, negated requests, or educational questions.

This is a deterministic first line of defence, not a substitute for a human
review.  It is shared by the Telegram wizard and ``POST /api/orders`` so a
request cannot bypass the rule by changing channel.
"""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Iterable, Mapping, Sequence


ALLOWED_ROUTES: tuple[str, ...] = (
    "диагностика ваших материалов и карта следующих шагов",
    "редакторский аудит вашего текста с комментариями",
    "консультация по структуре, методике и расчётам на ваших данных",
    "оформление, проверка источников и подготовка к защите",
)


@dataclass(frozen=True)
class IntakeDecision:
    """Result safe to expose to both bot and HTTP clients."""

    blocked: bool
    code: str | None = None
    reason: str | None = None

    def api_payload(self) -> dict:
        if not self.blocked:
            return {"ok": True}
        return {
            "ok": False,
            "error": "request_outside_scope",
            "reason": self.code,
            "message": (
                "Такую задачу нельзя оформить как коммерческий заказ. "
                "Выберите один из разрешённых форматов помощи."
            ),
            "allowed_routes": list(ALLOWED_ROUTES),
        }


_ACADEMIC = re.compile(
    r"\b(?:"
    r"вкр|диплом\w*|курсов\w*|диссертац\w*|магистерск\w*|"
    r"кандидатск\w*\s+работ\w*|аттестационн\w*\s+работ\w*|"
    r"отч[её]т\w*\s+по\s+практик\w*|контрольн\w*\s+работ\w*|"
    r"лабораторн\w*\s+работ\w*|реферат\w*|эссе"
    r")\b"
)
_AUTHOR_ACTION = re.compile(
    r"\b(?:"
    r"напиш(?:ите|и|у|ем|ешь|ете)|написать|"
    r"написали|"
    r"сдела(?:йте|й|ю|ем|ешь|ете)|сделать|"
    r"сделали|"
    r"выполн(?:ите|и|ю|им|ишь|яете)|выполнить|"
    r"выполнили|"
    r"подготов(?:ьте|ь|лю|им|ишь|ите)|подготовить|"
    r"подготовили|"
    r"созда(?:йте|й|м|шь|дим)|создать|"
    r"создали|"
    r"разработа(?:йте|й|ем|ешь)|разработать"
    r"|разработали"
    r")\b"
)
_AUTHOR_IMPERATIVE = re.compile(
    r"\b(?:напишите|напиши|сделайте|сделай|выполните|выполни|"
    r"подготовьте|подготовь|создайте|создай|разработайте|разработай)\b"
)
_REQUEST_CONTEXT = re.compile(
    r"\b(?:можете|сможете|прошу|хочу|нужно|надо|требуется|"
    r"заказать|закажу|возьм[её]тесь|помогите|ищу|"
    r"нуж(?:ен|на|ны)|хотел(?:а|ось)?\s+бы)\b"
)
_ALLOWED_TARGET = re.compile(
    r"\b(?:аудит\w*|редактур\w*|редактирован\w*|проверк\w*|"
    r"рецензи\w*|разбор\w*|консультац\w*|план\w*|структур\w*|"
    r"комментари\w*|оформлен\w*|нормоконтрол\w*|презентац\w*|"
    r"реч\w*\s+к\s+защит\w*|к\s+защит\w*|"
    r"ответ\w*\s+на\s+вопрос\w*|"
    r"расч[её]т\w*\s+по\s+(?:моим|вашим)\s+данн\w*)\b"
)

_TEST_OBJECT = re.compile(
    r"\b(?:тест\w*|экзамен\w*|зач[её]т\w*|квиз\w*|"
    r"lms|moodle|мудл\w*|личн\w+\s+кабинет\w*)\b"
)
_TEST_ACTION = re.compile(
    r"\b(?:пройд(?:ите|и|у|ем|ешь|ете)|пройти|"
    r"сда(?:йте|й|м|шь|дите)|сдать|"
    r"сдад(?:ите|им|ут)|"
    r"реш(?:ите|и|у|им|ишь|аете)|решить|"
    r"решили|"
    r"выполн(?:ите|и)|выполнить|ответ(?:ьте|ь)|ответить)\b"
)
_TEST_IMPERATIVE = re.compile(
    r"\b(?:пройдите|пройди|сдайте|сдай|решите|реши|"
    r"выполните|выполни|ответьте|ответь)\b"
)

_FABRICATE_ACTION = re.compile(
    r"\b(?:выдум(?:айте|ай|ать)|сфабрику(?:йте|й|овать)|"
    r"поддела(?:йте|й|ть)|нарису(?:йте|й|овать)|"
    r"придума(?:йте|й|ть)|сгенериру(?:йте|й|овать)|"
    r"выдумали|сфабриковали|подделали|нарисовали|"
    r"придумали|сгенерировали)\b"
)
_FABRICATE_OBJECT = re.compile(
    r"\b(?:данн\w*|результат\w*|опрос\w*|ответ\w+\s+респондент\w*|"
    r"статистик\w*|источник\w*|литератур\w*|ссылк\w*|цитат\w*|"
    r"эксперимент\w*)\b"
)

_BYPASS_ACTION = re.compile(
    r"\b(?:обойти|обмануть|накрутить|скрыть|замаскировать|"
    r"подменить|докрутить|поднять|"
    r"обошли|обманули|накрутили|скрыли|замаскировали|"
    r"подменили|докрутили|подняли)\b"
)
_BYPASS_OBJECT = re.compile(
    r"\b(?:антиплагиат\w*|оригинальност\w*|процент\w*|"
    r"ии[\s-]*детектор\w*|детектор\w*\s+ии)\b"
)
_REWRITE_FOR_SCORE = re.compile(
    r"\b(?:переписать|переписали|переписывайте|перепишите|перепиши)\b.{0,45}"
    r"\b(?:под|ради|для\s+повышения)\b.{0,25}"
    r"\b(?:процент\w*|оригинальност\w*|антиплагиат\w*)\b"
)

_NEGATION = re.compile(
    r"(?:\bне\s+(?:надо|нужно|нужна|нужен|нужны|требуется|хочу|буду|прошу|планирую|"
    r"собираюсь)\b|\bбез\s+(?:обхода|подделки|выдумывания|фабрикации)\b|"
    r"\bнельзя\b)"
)
_CONTRAST = re.compile(
    r"(?:(?:[,—-]\s*|\b)(?:но|а|зато|лучше|просто)\b|"
    r"[,—-]\s*(?:теперь\s+)?(?:нуж(?:ен|на|ны|но)|хочу|прошу|"
    r"давайте|сделайте|напишите)\b)"
)
_EXPLICIT_IMPERSONATION = re.compile(
    r"\b(?:за\s+меня|вместо\s+меня|под\s+моим\s+аккаунтом|"
    r"под\s+ключ|от\s+моего\s+имени)\b"
)
_ACADEMIC_TURNKEY = re.compile(
    rf"(?:{_ACADEMIC.pattern}.{{0,55}}\b(?:за\s+меня|вместо\s+меня|под\s+ключ)\b|"
    rf"\b(?:за\s+меня|вместо\s+меня|под\s+ключ)\b.{{0,55}}{_ACADEMIC.pattern})"
)
_ORDER_ACADEMIC = re.compile(
    rf"(?:^\s*\b(?:заказать|заказывать|купить)\b.{{0,55}}{_ACADEMIC.pattern}|"
    rf"\b(?:хочу|нужно|надо|ищу|можно(?:\s+ли)?|хотел(?:а|ось)?\s+бы)\b"
    rf".{{0,45}}\b(?:заказать|заказывать|купить)\b.{{0,55}}{_ACADEMIC.pattern})"
)
_EDUCATIONAL = re.compile(
    r"(?:\bкак\s+(?:самостоятельно\s+)?(?:написать|сделать|подготовить|"
    r"решать|выполнять)\b|"
    r"\b(?:научиться|разобраться|объясните|расскажите|покажите)\b.{0,45}"
    r"\b(?:как|самостоятельно|самому|самой|своими\s+силами)\b|"
    r"\b(?:почему\s+нельзя|что\s+считается|можно\s+ли)\b)"
)


def _normalise(value: object) -> str:
    text = str(value or "").lower().replace("ё", "е")
    text = text.replace("\u00a0", " ").replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", text).strip()


def _fragments(parts: Iterable[object]) -> Iterable[str]:
    normalised: list[str] = []
    for value in parts:
        text = _normalise(value)
        if not text:
            continue
        normalised.append(text)
        # Keep commas/dashes: they matter for negation and contrast.  Split only
        # at strong sentence boundaries so proximity checks stay local.
        for fragment in re.split(r"[\n.!?;]+", text):
            fragment = fragment.strip()
            if fragment:
                yield fragment[:2500]
    # A form can split one instruction across "topic" and "requirements".
    # Re-check the bounded concatenation so changing field cannot bypass the
    # same commercial-intake rule.
    if len(normalised) > 1:
        combined = " ".join(x.strip(" \n.!?;") for x in normalised)
        if combined:
            yield combined[:2500]


def _negated(fragment: str, start: int) -> bool:
    """Whether the matched action is governed by a nearby explicit negation."""

    prefix = fragment[max(0, start - 72):start]
    matches = list(_NEGATION.finditer(prefix))
    if not matches:
        return False
    last = matches[-1]
    return not _CONTRAST.search(prefix[last.end():])


def _nearby(a: re.Match, b: re.Match, distance: int = 90) -> bool:
    return max(a.start(), b.start()) - min(a.end(), b.end()) <= distance


def _has_request_context(fragment: str, action: re.Match, imperative: re.Pattern) -> bool:
    if imperative.fullmatch(action.group(0)):
        return True
    # A terse order field often consists of an infinitive: "Написать ВКР".
    # Treat that as an instruction, while "как написать ВКР" remains an
    # educational question handled by the exemption below.
    if not fragment[:action.start()].strip(" :-—"):
        return True
    around = fragment[max(0, action.start() - 55):min(len(fragment), action.end() + 55)]
    return bool(_REQUEST_CONTEXT.search(around) or _EXPLICIT_IMPERSONATION.search(around))


def _allowed_target_between(fragment: str, action: re.Match, academic: re.Match) -> bool:
    span = fragment[action.end():min(len(fragment), action.end() + 52)]
    target = _ALLOWED_TARGET.search(span)
    if not target:
        return False
    target_start = action.end() + target.start()
    # If the action comes first, the permitted service must be its immediate
    # object before the academic item: "сделайте аудит диплома".  A later
    # "и проверьте" must not sanitise "напишите диплом".
    if action.start() < academic.start() and target_start >= academic.start():
        return False
    # "Сделайте редакторский аудит диплома" targets the audit, not authorship.
    return not _EXPLICIT_IMPERSONATION.search(span)


def _targeted(
    fragment: str,
    action_re: re.Pattern,
    object_re: re.Pattern,
    imperative_re: re.Pattern,
    *,
    skip_allowed_target: bool = False,
) -> tuple[re.Match, re.Match] | None:
    actions = list(action_re.finditer(fragment))
    objects = list(object_re.finditer(fragment))
    for action in actions:
        if _negated(fragment, action.start()):
            continue
        if not _has_request_context(fragment, action, imperative_re):
            continue
        for obj in objects:
            if not _nearby(action, obj):
                continue
            if skip_allowed_target and _allowed_target_between(fragment, action, obj):
                continue
            return action, obj
    return None


def evaluate(parts: Sequence[object] | Iterable[object]) -> IntakeDecision:
    """Evaluate user-authored intake strings.

    The first explicit prohibited intent wins.  No source text is returned in
    the decision, so an API response cannot echo sensitive content.
    """

    for fragment in _fragments(parts):
        turnkey = _ACADEMIC_TURNKEY.search(fragment)
        if turnkey and not _negated(fragment, turnkey.start()):
            return IntakeDecision(
                True,
                "academic_impersonation",
                "Выполнение аттестационного материала вместо клиента",
            )
        ordered = _ORDER_ACADEMIC.search(fragment)
        if ordered and not _negated(fragment, ordered.start()):
            return IntakeDecision(
                True,
                "academic_impersonation",
                "Заказ аттестационного материала вместо самостоятельной работы",
            )

        authored = _targeted(
            fragment,
            _AUTHOR_ACTION,
            _ACADEMIC,
            _AUTHOR_IMPERATIVE,
            skip_allowed_target=True,
        )
        if authored:
            if not (_EDUCATIONAL.search(fragment)
                    and not _EXPLICIT_IMPERSONATION.search(fragment)
                    and not _AUTHOR_IMPERATIVE.search(fragment)):
                return IntakeDecision(
                    True,
                    "academic_impersonation",
                    "Выполнение аттестационного материала вместо клиента",
                )

        tested = _targeted(fragment, _TEST_ACTION, _TEST_OBJECT, _TEST_IMPERATIVE)
        if tested:
            if not (_EDUCATIONAL.search(fragment)
                    and not _EXPLICIT_IMPERSONATION.search(fragment)
                    and not _TEST_IMPERATIVE.search(fragment)):
                return IntakeDecision(
                    True,
                    "test_or_lms_impersonation",
                    "Прохождение теста, экзамена или LMS вместо клиента",
                )

        # Submitting an attestation item under the customer's identity is also
        # impersonation, even if the text does not ask us to author it.
        submit = _targeted(fragment, _TEST_ACTION, _ACADEMIC, _TEST_IMPERATIVE)
        if submit and _EXPLICIT_IMPERSONATION.search(fragment):
            return IntakeDecision(
                True,
                "test_or_lms_impersonation",
                "Сдача аттестационного материала вместо клиента",
            )

        fabricated = _targeted(
            fragment,
            _FABRICATE_ACTION,
            _FABRICATE_OBJECT,
            _FABRICATE_ACTION,
        )
        if fabricated:
            if not re.search(r"\b(?:почему\s+нельзя|что\s+считается|можно\s+ли)\b",
                             fragment):
                return IntakeDecision(
                    True,
                    "fabricated_evidence",
                    "Выдумывание данных, результатов или источников",
                )

        bypass = _targeted(
            fragment,
            _BYPASS_ACTION,
            _BYPASS_OBJECT,
            _BYPASS_ACTION,
        )
        if bypass:
            return IntakeDecision(
                True,
                "integrity_check_bypass",
                "Обход антиплагиата или иной проверки добросовестности",
            )
        rewrite = _REWRITE_FOR_SCORE.search(fragment)
        if rewrite and not _negated(fragment, rewrite.start()):
            return IntakeDecision(
                True,
                "integrity_check_bypass",
                "Обход антиплагиата или иной проверки добросовестности",
            )

    return IntakeDecision(False)


def payload_parts(payload: Mapping[str, object]) -> list[object]:
    """Extract only customer-authored request fields from an order payload.

    Legal/specification fields deliberately stay out: they may describe
    forbidden services in a negative contractual clause and are not the
    customer's requested task.
    """

    cart = payload.get("cart")
    details = payload.get("details")
    if isinstance(cart, Mapping):
        # Bundle UI historically serialises a contractual summary before this
        # marker; orders_create discards it and stores only the customer's
        # general comment.  Mirror that boundary here to avoid treating a
        # negative legal clause as the requested service.
        marker = "ОБЩИЙ КОММЕНТАРИЙ"
        if isinstance(details, str) and marker in details:
            details = details.split(marker, 1)[1]
        else:
            details = None
    parts: list[object] = [
        payload.get("topic"),
        details,
        payload.get("requirements"),
        payload.get("note"),
    ]
    if isinstance(cart, Mapping):
        items = cart.get("items")
        if isinstance(items, list):
            for item in items[:30]:
                if not isinstance(item, Mapping):
                    continue
                parts.extend((
                    item.get("topic"),
                    item.get("requirements"),
                    item.get("note"),
                ))
                answers = item.get("answers")
                if isinstance(answers, Mapping):
                    parts.extend(list(answers.values())[:20])
    return parts


def evaluate_payload(payload: Mapping[str, object]) -> IntakeDecision:
    return evaluate(payload_parts(payload))
