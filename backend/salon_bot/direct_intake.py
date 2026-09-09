"""Versioned direct-intake compatibility. Prices remain server-owned estimates."""
from copy import deepcopy
import math

VERSION = 2
TEXT_LIMIT = 64000
CUSTOM = {('work', 'custom'): 'Индивидуальная задача',
          ('service', 'custom'): 'Психология · индивидуальное сопровождение',
          ('service', 'commission_zero'): 'Подготовка к комиссии'}


# Existing public discipline choices. These aliases have distinct estimates;
# legacy transport maps them to law only for old API compatibility.
DISCIPLINE_FACTORS = {'jurisprudence': 1.0, 'pedagogy': 1.0, 'psychology': 1.21}


def quote(config, type_id, discipline, term, tier):
    work = config.TYPE_BY_ID.get(type_id)
    if not work:
        return None
    factor = DISCIPLINE_FACTORS.get(discipline)
    if factor is None:
        factor = config.DISC_BY_ID.get(discipline, config.DISCIPLINES[0])[3]
    speed = config.TERM_BY_ID.get(term, config.TERMS[0])[3]
    result = config.TIER_BY_ID.get(tier, config.TIERS[0])[3]
    # Match the documented public calculator's Math.round on positive prices.
    rounding = config.PRICING_ROUNDING
    rounded = lambda n: int(math.floor(n / rounding + 0.5) * rounding)
    low = rounded(work.prices[result] * factor * speed)
    return low, rounded(low * config.PRICING_RANGE_MULTIPLIER)


def enabled(body):
    context = body.get('case_context')
    return body.get('intake_version') == VERSION and isinstance(context, dict) and context.get('source') == 'direct-order'


def validate(body):
    """Reject oversized input explicitly; never silently accept a partial brief."""
    for key, limit in [('topic', 500), ('details', TEXT_LIMIT)]:
        if not isinstance(body.get(key, ''), str) or len(body.get(key, '')) > limit:
            return key + '_limit'
    context = body.get('case_context') or {}
    if not isinstance(context, dict):
        return 'context_shape'
    if context.get('discipline') not in (None, 'hum', 'law', 'tech', 'med', 'jurisprudence', 'pedagogy', 'psychology'):
        return 'discipline_invalid'
    if context.get('discipline') == 'psychology' and context.get('data_deidentified') is not True:
        return 'data_deidentification_required'
    cart = body.get('cart')
    if not isinstance(cart, dict) or not isinstance(cart.get('items'), list):
        return 'cart_required'
    if not 1 <= len(cart['items']) <= 30:
        return 'items_limit'
    intent = body.get('composition_intent') or {}
    if not isinstance(intent, dict) or intent.get('speed', 'standard') not in ('standard', 'express24', 'expressfast') or intent.get('package', 'standard') not in ('standard', 'vip'):
        return 'composition_invalid'
    if any(x.get('kind') == 'work' for x in cart['items'][1:] if isinstance(x, dict)):
        return 'direct_primary_first'
    for line in cart['items']:
        if not isinstance(line, dict):
            return 'item_shape'
        if line.get('kind') not in ('work', 'service') or not isinstance(line.get('type'), str):
            return 'item_catalog'
        if not isinstance(line.get('client_id'), str) or not isinstance(line.get('parent_client_id', ''), (str, type(None))):
            return 'item_identity'
        for key in ('disc', 'term', 'tier'):
            if not isinstance(line.get(key, ''), str):
                return 'item_config'
        for key, limit in [('topic', 500), ('requirements', TEXT_LIMIT)]:
            if not isinstance(line.get(key, ''), str) or len(line.get(key, '')) > limit:
                return key + '_limit'
        answers = line.get('answers', {})
        if not isinstance(answers, dict) or len(answers) > 20 or any(not isinstance(v, str) or len(v) > 4000 for v in answers.values()):
            return 'answers_limit'
    return None


def parse(body, legacy_parser, config):
    """Keep legacy validation and canonical pricing, extend only reviewed inputs.

    Temporary catalog aliases are internal validation inputs only. They are
    restored before persistence and NEVER supply a price for an unknown task.
    """
    problem = validate(body)
    if problem:
        return [], 0, 0, [problem]
    raw = deepcopy(body['cart'])
    originals = raw['items']
    normalized = deepcopy(raw)
    for src in normalized['items']:
        if (src.get('kind'), src.get('type')) in CUSTOM:
            src['kind'], src['type'] = 'work', 'self'
            src['disc'], src['term'], src['tier'] = 'hum', 'free', 'base'
            src['parent_client_id'] = None
    # Aliases must not participate in a guessed parent relationship. Explicit
    # parent integrity is checked below against the original work set.
    for src in normalized['items']:
        src['parent_client_id'] = None
    out, _, _, errors = legacy_parser(normalized)
    if errors:
        return [], 0, 0, errors
    intent = body.get('composition_intent') or {}
    speed = intent.get('speed', 'standard')
    pending = intent.get('package') == 'vip' or speed == 'expressfast'
    low = high = 0
    work_ids = {s['client_id'] for s in originals if s['kind'] == 'work'}
    only_work = next(iter(work_ids)) if len(work_ids) == 1 else None
    for src, item in zip(originals, out):
        key = (src['kind'], src['type'])
        item['kind'], item['catalog_id'] = key
        item['config'] = {k: src.get(k, default) for k, default in [('disc', 'hum'), ('term', 'free'), ('tier', 'base')]}
        unknown = key in CUSTOM
        if unknown:
            item['label'] = CUSTOM[key]
            item['qty'] = 1
        if unknown or pending:
            item['quote_low'] = item['quote_high'] = None
        elif src['kind'] == 'work':
            if speed == 'express24' and src['type'] == 'kandidat':
                return [], 0, 0, ['candidate_express_unavailable']
            requested_disc = (body.get('case_context') or {}).get('discipline') or src.get('disc', 'hum')
            q = quote(config, src['type'], requested_disc,
                      'free' if speed == 'express24' else src.get('term', 'free'), src.get('tier', 'base'))
            if not q:
                return [], 0, 0, ['quote_unavailable']
            factor = 2 if speed == 'express24' else 1
            item['quote_low'], item['quote_high'] = [n * factor * item['qty'] for n in q]
        parent = src.get('parent_client_id') or None
        if src['kind'] == 'service':
            if parent and parent not in work_ids:
                return [], 0, 0, ['parent_unknown']
            parent = parent or only_work
        else:
            parent = None
        item['parent_client_id'] = parent
        item['topic'] = src.get('topic', '').strip() or None
        item['requirements'] = src.get('requirements', '').strip() or None
        item['answers'] = deepcopy(src.get('answers') or {})
        req = item['request']
        req.update(kind=item['kind'], type=item['catalog_id'], label=item['label'], qty=item['qty'],
                   parent_client_id=parent, topic=item['topic'], requirements=item['requirements'],
                   answers=item['answers'], intake_version=VERSION,
                   quote_preview={'low': item['quote_low'], 'high': item['quote_high']},
                   price_status='pending' if item['quote_low'] is None else 'estimate',
                   composition_intent=deepcopy(intent), requested_discipline=(body.get('case_context') or {}).get('discipline'), **item['config'])
        # Preserve complete scoped input; the legacy bounded copy is only a
        # compatibility representation, not the authoritative user brief.
        if not isinstance(req.get('scope'), dict):
            req['scope'] = {}
        req['scope']['customer_requirements'] = item['requirements']
        low += item['quote_low'] or 0
        high += item['quote_high'] or 0
    if len(out) > 1 and any(x['quote_low'] is None for x in out):
        contours = {x['request'].get('contract_contour') for x in out}
        if len(contours) != 1:
            return [], 0, 0, ['mixed_contour_package']
        # One quoted package avoids inventing per-line prices from unknown
        # weights. The existing bot can safely assign its single total price.
        components = deepcopy(out)
        first = out[0]
        first['parent_client_id'] = None
        first['label'] += ' · комплект по заданию'
        first['quote_low'] = first['quote_high'] = None
        req = first['request']
        req.update(label=first['label'], parent_client_id=None, price_status='pending',
                   quote_preview={'low': None, 'high': None}, requested_components=components)
        req['scope']['included'] = [x['label'] for x in components]
        req['scope']['customer_requirements'] = body.get('details', '')
        first['requirements'] = body.get('details', '')
        req['requirements'] = first['requirements']
        out, low, high = [first], 0, 0
    return out, low, high, []
