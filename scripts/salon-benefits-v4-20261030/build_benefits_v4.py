"""«Выгоды» v4: раздел выгод из прежних страниц релиза -> страницы на дизайн-системе ds-v4.

python build_benefits_v4.py <папка с прежними страницами> <salon-products.js> <out-папка> [--preview]

В папке — прежние (до v4) benefits.html, plus.html, deposit.html, gift.html, referral.html, referral-rules.html
и assets/js/salon-benefits.js. Пишет те же имена (с --preview — *-v4.html с noindex, ссылки раздела ведут на превью).

- benefits, plus, deposit, referral, referral-rules: новый <main> из общих блоков (калькуляторы, правила, вопросы).
  Суммы считает salon-benefits.js (window.SalonBenefitMath); стартовые цифры в разметке посчитаны им же через
  node, чтобы страница без скрипта и до его запуска показывала верные суммы.
- gift: покупка сертификата (polish15-supporting.js) держится за id и разметку — её не трогаем, меняем только
  первый экран, навигацию и подписи; вид даёт benefits-v4.css.
Тексты правил — по loyalty.html (ред. 1.11)."""
import html as H
import json
import re
import subprocess
import sys
from pathlib import Path

src, products_js, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
preview = "--preview" in sys.argv[4:]
math_js = src / "assets/js/salon-benefits.js"
VER = "benefits-v4-20261030-3"
DS_VER = "home-v4-20261030-4"
TG = "https://t.me/academicsaloon"
BOT_WELCOME = "https://t.me/academic_saloon_bot?start=welcome_site"  # запасная ссылка тура Листика
BOT_CLUB = "https://t.me/academic_saloon_bot?start=club"
PAGES = ["benefits", "plus", "deposit", "gift", "referral", "referral-rules"]

PRICES = {k: (None if v == "null" else int(v))
          for k, v in re.findall(r"id:'([a-z0-9_-]+)'[^}]*?price:([0-9]+|null)", products_js.read_text(encoding="utf-8"))}
WORKS = [("referat", "Реферат"), ("course", "Курсовая"), ("chapter", "Глава"), ("diplom", "ВКР"), ("master", "Магистерская")]
assert all(PRICES.get(k) for k, _ in WORKS)

# Стартовые значения калькуляторов — из опубликованных правил, тем же кодом, что на странице
calc = subprocess.run(["node", "-e", """
const m = require(process.argv[1]);
const o = (p, pts, plan, gift) => m.orderProjection(p, pts, plan, false, gift);
const out = {plans: m.planComparison(14000, 3, 'sem'), per: {}, bonus: o(14000, 2500, 'none', 0),
  dep: m.depositProjection(30000, 20000), hero: {}};
for (const c of ['plus', 'pro', 'session']) out.per[c] = o(14000, 0, c, 0).discount;
for (const c of ['none', 'plus', 'pro']) out.hero[c] = o(14000, 0, c, 0);
console.log(JSON.stringify(out));
""", str(math_js.resolve())], capture_output=True, text=True, encoding="utf-8", check=True)
C = json.loads(calc.stdout)
assert C["plans"]["plus"]["net"] == 1101 and C["plans"]["pro"]["net"] == 1510, C["plans"]
assert C["bonus"]["payable"] == 11500 and C["bonus"]["cashback"] == 575, C["bonus"]
assert C["dep"]["balance"] == 10000 and C["dep"]["earned"] == 1600 and C["dep"]["reserve"] == 3000, C["dep"]


def esc(s):
    return H.escape(str(s), quote=True)


def money(n):
    return f"{int(n):,}".replace(",", "\u00a0") + "\u00a0₽"


def num(n):
    return f"{int(n):,}".replace(",", "\u00a0")


def even(k):
    return f"{'со' if k == 2 else 'с'} {k}-й работы"


def svg(body, cls=""):
    return (f'<svg{f" class={chr(34)}{cls}{chr(34)}" if cls else ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{body}</svg>')


I_TICKET = svg('<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v3a2.5 2.5 0 0 0 0 5v3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-3a2.5 2.5 0 0 0 0-5z"/><path d="M12 9.5v5M9.5 12h5"/>')
I_SPARK = svg('<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z"/><path d="M19 16.5c.2 1.3.9 2 2.2 2.2-1.3.2-2 .9-2.2 2.2-.2-1.3-.9-2-2.2-2.2 1.3-.2 2-.9 2.2-2.2z"/>')
I_WALLET = svg('<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><path d="M4 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5z"/><path d="M16 13.5h.01"/>')
I_GIFT = svg('<path d="M4 11h16v9H4zM3 8h18v3H3zM12 8v12"/><path d="M12 8C10.5 5 7 4.5 7 6.8 7 8 9.5 8 12 8zm0 0c1.5-3 5-3.5 5-1.2C17 8 14.5 8 12 8z"/>')
I_FRIEND = svg('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M17 8v6M14 11h6"/>')
I_CHECK = svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>')
PLANE = ('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 3.2 2.9 10.4c-1.3.5-1.3 1.2-.2 '
         '1.6l4.8 1.5 1.8 5.6c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.3-1.5z'
         'M9.4 13.2l8.6-5.4c.4-.3.8-.1.5.2l-7.1 6.4-.3 3.3-1.7-4.5z"/></svg>')


def chips(name, items, current, label_id, own_id=None):
    """Плашки работ с ценой каталога; своя цена — поле в конце ряда."""
    btns = "".join(
        f'<button type="button" class="bn-chip" data-{name}="{PRICES[k]}" aria-pressed="{str(PRICES[k] == current).lower()}">'
        f'{esc(t)}<small>{money(PRICES[k])}</small></button>' for k, t in items)
    own = (f'<label class="bn-own"><span>Своя цена</span><input id="{own_id}" type="number" inputmode="numeric" '
           f'min="1000" max="500000" step="1" value="{current}" aria-describedby="{label_id}"><i aria-hidden="true">₽</i></label>'
           if own_id else "")
    return f'<div class="bn-chips" role="group" aria-labelledby="{label_id}">{btns}{own}</div>'


def seg(name, items, checked, label_id, cls="ds-seg"):
    return (f'<div class="{cls}" role="radiogroup" aria-labelledby="{label_id}">' + "".join(
        f'<label class="ds-choice"><input type="radio" name="{name}" value="{v}"{" checked" if v == checked else ""}>'
        f'<span class="ds-chip">{esc(t)}</span></label>' for v, t in items) + '</div>')


def head(title, lead, tag="h2", hid=None, extra=""):
    return (f'<div class="bn-head"><{tag} class="ds-display-2"{f" id={chr(34)}{hid}{chr(34)}" if hid else ""}>{esc(title)}</{tag}>'
            f'<p class="ds-lead">{lead}</p>{extra}</div>')


def rules(items, cls="bn-rules"):
    return f'<ul class="{cls}">' + "".join(f'<li><b>{t}</b><span>{esc(p)}</span></li>' for t, p in items) + '</ul>'


def steps(items, title, hid):
    return (f'<section class="bn-section bn-how" aria-labelledby="{hid}"><div class="bn-head">'
            f'<h2 class="ds-display-2" id="{hid}">{esc(title)}</h2></div><ol class="bn-steps">'
            + "".join(f'<li><h3>{esc(t)}</h3><p>{esc(p)}</p></li>' for t, p in items) + '</ol></section>')


def faq(items, hid, lead='Коротко о главном. Точные условия — в <a class="ds-link" href="loyalty.html">правилах программы</a>.'):
    return (f'<section class="bn-section bn-faq" aria-labelledby="{hid}"><div class="bn-head">'
            f'<h2 class="ds-display-2" id="{hid}">Частые вопросы</h2><p class="ds-lead">{lead}</p></div>'
            '<div class="bn-faq-list">' + "".join(f'<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in items)
            + '</div></section>')


def final(title, lead, primary, secondary, hid="bn-final-title"):
    return (f'<section class="bn-final ds-night" aria-labelledby="{hid}"><div>'
            f'<h2 class="ds-display-2" id="{hid}">{esc(title)}</h2><p class="ds-lead">{esc(lead)}</p></div>'
            f'<div class="bn-final-actions">{primary}{secondary}</div></section>')


CRUMBS = [("benefits", "Все выгоды"), ("plus", "Салон+"), ("deposit", "Депозит"), ("gift", "Сертификат"), ("referral", "Бонусы за друга")]


def crumbs(current):
    return ('<nav class="bn-crumbs" aria-label="Разделы выгод">' + "".join(
        f'<a href="{k}.html"{" aria-current=" + chr(34) + "page" + chr(34) if k == current else ""}>{t}</a>' for k, t in CRUMBS)
        + '</nav>')


def glue(text):
    # «1 000 ₽», «20 000», «5 %» не разрываются переносом
    text = re.sub(r"(\d) (?=\d{3}(?!\d))", "\\1\u00a0", text)
    return re.sub(r"(\d) (?=₽|%|бонус|работ|дн|тыс)", "\\1\u00a0", text)


# ---------- Салон+: калькулятор абонементов (хаб и plus.html)
P = C["plans"]
PASSES = [
    ("plus", "Салон+", "5% к каждому заказу, до 1 000 ₽", P["plus"]["cost"], ["Приоритетная очередь", "Куратор сессии: график сдач с напоминаниями",
                                                                            "«Полка Салона» — закрытые методические материалы"], "Оформить Салон+"),
    ("pro", "Салон+ Про", "10% к каждому заказу, до 3 000 ₽", P["pro"]["cost"], ["Всё из Салон+", "Кешбэк 10% вместо 5%",
                                                                                "Тренажёр защиты: 10 вероятных вопросов с тезисами по твоему черновику",
                                                                                "Консультация 15 минут каждые 30 дней"], "Оформить Про"),
    ("session", "Сессия", "7% к каждому заказу, до 2 000 ₽", 2990, ["Бронь сессии и приоритетная очередь", "Замок цен: тарифы на дату оплаты плана",
                                                                     "SOS в день сдачи: ответ за час в рабочее время", "Куратор сессии и тренажёр защиты"], "Оформить Сессию"),
]


def pass_html(code, name, rule, fee, feats, cta):
    per = C["per"][code]
    if code == "session":
        net = '<div class="bn-pass-net"><span>Срок</span><b>60 дней, разово</b></div>'
        days = "60 дней"
    else:
        v = P[code]["net"]
        net = (f'<div class="bn-pass-net"><span data-net-label="{code}">Экономия на 3 работах</span>'
               f'<b data-net="{code}" data-value="{v}">{money(v)}</b></div>')
        days = "150 дней"
    top = (f'<article class="bn-pass bn-pass--{code}{" is-best" if code == "pro" else ""}" data-pass="{code}">'
           + ('<p class="bn-pass-badge">Выгоднее по расчёту</p>' if code != "session" else ""))
    return top + (
        f'<div class="bn-pass-top"><h3>{esc(name)}</h3><p class="bn-pass-price"><b data-fee="{code}">{money(fee)}</b>'
        f'<span data-days="{code}">{days}</span></p></div><p class="bn-pass-rule">{esc(rule)}</p>'
        f'<div class="bn-pass-calc"><div><span>С одной работы</span><b data-per="{code}" data-value="{per}">−{money(per)}</b></div>'
        f'<div><span>Окупается</span><b data-even="{code}">{even(-(-fee // per))}</b></div>{net}</div>'
        f'<ul class="bn-pass-list">' + "".join(f'<li>{I_CHECK}{esc(x)}</li>' for x in feats) + '</ul>'
        f'<a class="bn-pass-cta" href="dashboard.html#plus">{esc(cta)}</a></article>'
    )


def plans_body(note_extra=""):
    return (
        '<div class="bn-toolbar">'
        '<div class="bn-field bn-field--wide"><span class="bn-label" id="bn-plan-work">Что заказываешь</span>'
        + chips("plan-price", WORKS, 14000, "bn-plan-work", "bn-plan-price") + '</div>'
        '<div class="bn-field"><span class="bn-label" id="bn-count-l">Сколько работ за срок</span><div class="bn-stepper">'
        '<button type="button" data-count-step="-1" aria-label="На одну работу меньше">−</button>'
        '<output id="bn-plan-count" aria-labelledby="bn-count-l" aria-live="polite">3</output>'
        '<button type="button" data-count-step="1" aria-label="На одну работу больше">+</button></div></div>'
        '<div class="bn-field"><span class="bn-label" id="bn-period-l">Срок абонемента</span>'
        + seg("bn-period", [("month", "30 дней"), ("sem", "150 дней")], "sem", "bn-period-l") + '</div></div>'
        '<p class="bn-error" data-plan-error role="status" hidden>Укажи цену от 1 000 до 500 000 ₽ — целым числом.</p>'
        '<div class="bn-passes">' + "".join(pass_html(*p) for p in PASSES) + '</div>'
        f'<div class="bn-verdict" data-verdict-box><p data-verdict role="status">На 3 работах за 150 дней выгоднее Салон+ Про: '
        f'экономия {money(P["pro"]["net"])} с учётом цены абонемента.</p><b data-verdict-num>−{money(P["pro"]["net"])}</b></div>'
        '<p class="bn-note">Расчёт для работ одной цены в пределах срока абонемента. Цена абонемента вычтена из экономии, будущие бонусы '
        'не учтены. Сессия — разовый план на 60 дней, его считаем по одной работе. Автопродления нет.</p>' + note_extra
    )


# ---------- Бонусы: пример счёта (хаб)
B = C["bonus"]


def bonus_body():
    return (
        '<div class="bn-lab"><div class="bn-controls">'
        '<div class="bn-field"><span class="bn-label" id="bn-order-work">Цена заказа</span>'
        + chips("order-price", [w for w in WORKS if w[0] != "chapter"], 14000, "bn-order-work", "bn-order-price") + '</div>'
        '<div class="bn-field"><div class="bn-range-head"><label class="bn-label" for="bn-points">Бонусов на счёте</label>'
        '<output for="bn-points" data-points-out>2 500</output></div>'
        '<input class="bn-range" id="bn-points" type="range" min="0" max="10000" step="100" value="2500"></div>'
        '<div class="bn-field"><span class="bn-label" id="bn-member-l">Абонемент</span>'
        + seg("bn-member", [("none", "Нет"), ("plus", "Салон+"), ("pro", "Про"), ("session", "Сессия")], "none", "bn-member-l") + '</div>'
        '<label class="bn-switch" data-promo-row hidden><input type="checkbox" id="bn-promo"><span><b>Промокод ПЕРВЫЙЛИСТ</b>'
        '<small>−12% на первый заказ от 2 500 ₽, не больше 5 000 ₽</small></span></label>'
        '<details class="bn-more"><summary>Есть подарочный сертификат</summary><label class="bn-own bn-own--wide">'
        '<span>Сумма сертификата</span><input id="bn-gift" type="number" inputmode="numeric" min="0" max="50000" step="1" value="0"><i aria-hidden="true">₽</i></label>'
        '<p class="bn-hint">Сертификат — способ оплаты: он идёт после скидок и бонусов и в лимит 25% не входит.</p></details>'
        '</div><div class="bn-stage"><div class="bn-receipt-shadow"><div class="bn-receipt" aria-live="polite">'
        '<p class="bn-receipt-title">Пример счёта</p><dl>'
        f'<div><dt>Цена работы</dt><dd data-r="price" data-value="{B["price"]}">{money(B["price"])}</dd></div>'
        f'<div class="is-zero"><dt data-r="discount-label">Скидка абонемента</dt><dd data-r="discount" data-value="0">{money(0)}</dd></div>'
        f'<div><dt>Бонусами</dt><dd data-r="spent" data-value="{B["spent"]}">−{money(B["spent"])}</dd></div>'
        f'<div data-r="gift-row" hidden><dt>Сертификатом</dt><dd data-r="gift" data-value="0">−{money(0)}</dd></div></dl>'
        '<p class="bn-receipt-limit" data-r="limit" hidden></p>'
        f'<div class="bn-receipt-total"><span>К оплате деньгами</span><b data-r="payable" data-value="{B["payable"]}">{money(B["payable"])}</b></div>'
        '</div></div>'
        f'<div class="bn-back"><b data-r="cashback" data-value="{B["cashback"]}">+{num(B["cashback"])}</b>'
        '<span><span data-r="cashback-word">бонусов</span> вернётся после полной оплаты. Живут 90 дней.</span></div>'
        '<a class="ds-btn ds-btn--violet bn-stage-cta" href="dashboard.html#deposit">Мои бонусы в кабинете</a></div></div>'
        + rules([("1\u00a0бонус = 1\u00a0₽", "Это скидка: деньгами бонусы не выплачиваются и другим не передаются."),
                 ("До 20%\u00a0заказа", "Бонусами оплачивается часть заказа от 1 000 ₽ — при подтверждении, до первой оплаты."),
                 ("До 25% вместе", "Скидка абонемента и бонусы вместе — не больше четверти цены заказа."),
                 ("90 дней", "Столько живёт кешбэк. О сгорании бот предупреждает заранее.")])
    )


# ---------- Депозит: кошелёк (хаб и deposit.html)
D = C["dep"]
CB = D["used"] * 5 // 100
EXTRA = max(0, D["earned"] - CB)
TIERS = [(20000, 8), (30000, 10), (45000, 12), (60000, 15)]
DEPOSIT_RULES = [("Деньги остаются деньгами", "Остаток на счёте — до 120 000 ₽, срок не ограничен. Этап оплачивается целиком."),
                 ("Остаток можно вернуть", "По заявлению в течение 10 дней, без штрафа. Бонусы за возвращённую часть сгорают."),
                 ("Это аванс, не вклад", "Процентов на остаток нет: выгода — бонусами за услуги, которые ты оплатил депозитом.")]
DEPOSIT_DETAILS = (
    '<details class="bn-more bn-more--rules"><summary>Как считается бонус по депозиту</summary>'
    '<p>Одно пополнение — от 20 000 до 60 000 ₽, кратно 1 000 ₽. Ставка резерва зависит от суммы пополнения: 8% до 29 999 ₽, 10% от 30 000 ₽, '
    '12% от 45 000 ₽ и 15% за 60 000 ₽. Бонусы считаются от реально использованной суммы по тем же ступеням, но не выше ставки пополнения. '
    'Сначала начисляется обычный кешбэк, а если депозитный расчёт выгоднее, разница открывается после приёмки результата и 14 дней проверки. '
    'Кешбэк и ставка депозита не складываются — применяется больший итог.</p>'
    '<p><a class="ds-link" href="loyalty.html">Все правила программы</a></p></details>')


def deposit_lab():
    return (
        '<div class="bn-lab"><div class="bn-controls">'
        f'<div class="bn-field"><div class="bn-range-head"><label class="bn-label" for="bn-topup">Пополнить на</label><output for="bn-topup" data-topup-out>{money(D["contribution"])}</output></div>'
        f'<input class="bn-range" id="bn-topup" type="range" min="20000" max="60000" step="1000" value="{D["contribution"]}">'
        '<div class="bn-tiers" role="group" aria-label="Ступени пополнения">' + "".join(
            f'<button type="button" data-topup="{a}" aria-pressed="{str(a == D["contribution"]).lower()}"><span>{num(a // 1000)} тыс.</span><b>{r}%</b></button>'
            for a, r in TIERS) + '</div></div>'
        f'<div class="bn-field"><div class="bn-range-head"><label class="bn-label" for="bn-used">Потратить на услуги</label><output for="bn-used" data-used-out>{money(D["used"])}</output></div>'
        f'<input class="bn-range" id="bn-used" type="range" min="0" max="{D["contribution"]}" step="1000" value="{D["used"]}"></div>'
        '<label class="bn-switch"><input type="checkbox" id="bn-dep-pro"><span><b>У меня Салон+ Про</b><small>Кешбэк 10% вместо 5%</small></span></label>'
        '<p class="bn-hint">Пример оплаченных и принятых услуг. Ползунки ничего не подключают и не списывают.</p>'
        '</div><div class="bn-stage"><div class="bn-wallet">'
        '<div class="bn-wallet-top"><span>Депозит</span><b aria-hidden="true">а.</b></div>'
        f'<p class="bn-wallet-label">Останется деньгами</p><p class="bn-wallet-sum" data-d="balance" data-value="{D["balance"]}">{money(D["balance"])}</p>'
        f'<div class="bn-meter" aria-hidden="true"><i data-d="meter" style="width:{D["used"] * 100 / D["contribution"]:.1f}%"></i></div>'
        f'<div class="bn-wallet-foot"><span>На услуги <b data-d="used">{money(D["used"])}</b></span><span>Внесено <b data-d="contribution">{money(D["contribution"])}</b></span></div></div>'
        '<div class="bn-ledger" aria-live="polite">'
        f'<div><span>Кешбэк за услуги<small>после полной оплаты, живёт 90 дней</small></span><b data-d="cashback" data-value="{CB}">+{num(CB)}</b></div>'
        f'<div class="is-extra"><span>Дополнительно по депозиту<small>после приёмки и 14 дней, живёт 180 дней</small></span><b data-d="extra" data-value="{EXTRA}">+{num(EXTRA)}</b></div>'
        f'<p data-d="reserve">Резерв пополнения — до {num(D["reserve"])} бонусов. Это не баланс для оплаты: бонусы открываются по мере использования, кешбэк в них уже учтён.</p></div>'
        '<a class="ds-btn ds-btn--violet bn-stage-cta" href="dashboard.html#deposit">Открыть кошелёк</a></div></div>'
    )


# ---------- Хаб: benefits.html
hero = C["hero"]
TABS = [("subscriptions", I_TICKET, "Салон+", "скидка до 10%"), ("bonuses", I_SPARK, "Бонусы", "5% с оплаты"),
        ("deposit", I_WALLET, "Депозит", "до +15% бонусами"), ("more", I_GIFT, "Подарки", "300 и 200 бонусов")]
STEPS = [("Оплачиваешь заказ", "Кешбэк считается с денежной части — после скидок, бонусов и сертификата."),
         ("Получаешь 5% бонусами", "Один раз после полной оплаты. С Салон+ Про — 10%. Живут 90 дней."),
         ("Тратишь на следующий заказ", "Бонусами — до 20% цены заказа от 1 000 ₽, до первой оплаты."),
         ("Складываешь со скидкой", "Абонемент и бонусы работают вместе. Общий потолок — 25% цены.")]
FAQ = [("Можно ли вывести бонусы деньгами?",
        "Нет. Бонус — это скидка: 1 бонус = 1 ₽ при оплате заказа. Деньгами бонусы не выплачиваются и другим людям не передаются."),
       ("Что будет, если не успею потратить бонусы?",
        "Они сгорят в конце срока: кешбэк и бонус за друга живут 90 дней, приветственные — 30. Бот предупреждает заранее, как правило за 3 дня."),
       ("Скидка абонемента и бонусы складываются?",
        "Да. Вместе они уменьшают цену заказа не больше чем на 25%, а бонусами можно оплатить до 20%. Если потолок достигнут, бонусов спишется меньше — остальные останутся на счёте."),
       ("Абонемент продлевается сам?",
        "Нет, автопродления нет. Когда срок закончится, абонемент просто перестанет действовать, а продолжить можно новой оплатой."),
       ("Можно вернуть деньги с депозита?",
        "Да. Неиспользованный остаток возвращаем по заявлению в течение 10 дней, без штрафа. Скидки по уже выполненным заказам не пересчитываются."),
       ("Начисляются ли бонусы за абонемент или сертификат?",
        "Нет. За оплату абонемента и покупку сертификата бонусы не начисляются, и оплатить их бонусами или депозитом нельзя.")]


def hub_main():
    hero_html = (
        '<section class="bn-hero ds-night" aria-labelledby="bn-title"><div class="bn-hero-copy">'
        '<h1 class="ds-display-1" id="bn-title">Выгоды Салона</h1>'
        '<p class="ds-lead">С каждого оплаченного заказа 5% возвращается бонусами: 1\u00a0бонус — 1\u00a0рубль скидки на следующий заказ. '
        'Абонемент, депозит и подарки добавляют выгоды сверху.</p>'
        '<div class="bn-hero-actions">'
        f'<a class="ds-btn ds-btn--lime" href="{BOT_WELCOME}" target="_blank" rel="noopener" data-welcome data-tg-cta="benefits_welcome">'
        f'{I_GIFT}<span data-welcome-label>Забрать 300 бонусов</span></a>'
        '<a class="ds-btn ds-btn--ghost" href="#bn-tabs">Посчитать выгоду</a></div>'
        '<p class="bn-hero-hint">300 приветственных бонусов начисляет Telegram-бот новым гостям, один раз. Действуют 30 дней.</p></div>'
        '<div class="bn-hero-play">'
        '<div class="bn-card" data-tilt><div class="bn-card-face">'
        '<div class="bn-card-top"><span class="bn-card-mark" aria-hidden="true">а.</span><span>Бонусный счёт</span></div>'
        '<p class="bn-card-label">Вернётся после оплаты</p>'
        f'<p class="bn-card-num"><span data-hero-cashback data-value="{hero["none"]["cashback"]}">+{num(hero["none"]["cashback"])}</span><small>бонусов</small></p>'
        f'<p class="bn-card-note"><span data-hero-note>Курсовая за {money(14000)}</span> <b data-hero-save hidden></b></p>'
        '</div></div>'
        '<div class="bn-hero-controls"><span class="bn-label" id="bn-hero-work">Что заказываешь</span>'
        + chips("hero-price", [w for w in WORKS if w[0] != "chapter"], 14000, "bn-hero-work")
        + '<span class="bn-label" id="bn-hero-plan">Абонемент</span>'
        + seg("bn-hero-plan", [("none", "Нет"), ("plus", "Салон+"), ("pro", "Салон+ Про")], "none", "bn-hero-plan", "ds-seg bn-seg-night")
        + '</div></div></section>'
    )
    tabs_html = ('<nav class="bn-tabs" id="bn-tabs" aria-label="Выгоды">' + "".join(
        f'<a href="#{i}"{" aria-current=" + chr(34) + "true" + chr(34) if i == "subscriptions" else ""}>{ic}<span><b>{t}</b><small>{s}</small></span></a>'
        for i, ic, t, s in TABS) + '</nav>')
    plans_html = (
        '<section class="bn-panel" id="subscriptions" aria-labelledby="bn-plus-title">'
        + head("Абонемент Салон+", "Один платёж — скидка на каждый заказ, пока действует абонемент. Проверь, окупится ли он на твоих планах.",
               hid="bn-plus-title")
        + plans_body('<p class="bn-more-link"><a class="ds-link" href="plus.html">Всё об абонементах</a></p>') + '</section>'
    )
    bonus_html = (
        '<section class="bn-panel" id="bonuses" aria-labelledby="bn-bonus-title" hidden>'
        + head("Бонусы", "5% с каждой оплаты возвращается на бонусный счёт. На следующем заказе ими можно оплатить до 20% цены.",
               hid="bn-bonus-title")
        + bonus_body() + '</section>'
    )
    deposit_html = (
        '<section class="bn-panel" id="deposit" aria-labelledby="bn-dep-title" hidden>'
        + head("Депозит", "Пополни счёт на семестр вперёд: деньги остаются твоими, а за использованное начисляются бонусы до 15%.",
               hid="bn-dep-title")
        + deposit_lab() + rules(DEPOSIT_RULES, "bn-rules bn-rules--3") + DEPOSIT_DETAILS
        + '<p class="bn-more-link"><a class="ds-link" href="deposit.html">Всё о депозите</a></p></section>'
    )
    more_html = (
        '<section class="bn-panel" id="more" aria-labelledby="bn-more-title" hidden>'
        + head("Подарки", "Бонусы на первый заказ, награда за друга, сертификат для своих и полезные наборы от соседнего проекта.",
               hid="bn-more-title")
        + '<div class="bn-gifts">'
        f'<a class="bn-gift bn-gift--welcome" href="{BOT_WELCOME}" target="_blank" rel="noopener" data-welcome data-tg-cta="benefits_welcome_tile">'
        '<span class="bn-gift-num">300</span><h3>бонусов новым гостям</h3>'
        '<p>Начисляет Telegram-бот после знакомства с правилами, один раз на аккаунт. Действуют 30 дней — хватит, чтобы оплатить ими до 20% первого заказа.</p>'
        f'<span class="bn-gift-cta">{PLANE}<span data-welcome-label>Забрать в Telegram</span></span></a>'
        '<a class="bn-gift bn-gift--friend" href="referral.html"><span class="bn-gift-num">200</span><h3>бонусов за друга</h3>'
        '<p>Друг впервые оплатил заказ по твоей ссылке — тебе 200 бонусов на 90 дней. Скидку другу ссылка не даёт.</p>'
        '<span class="bn-gift-cta">Как пригласить друга</span></a>'
        f'<a class="bn-gift bn-gift--cert" href="gift.html">{I_GIFT}<h3>Подарочный сертификат</h3>'
        '<p>От 2 000 ₽. Имя, пожелание и помощь, которую выберет сам получатель.</p><span class="bn-gift-cta">Собрать подарок</span></a>'
        '<a class="bn-gift bn-gift--club" href="dashboard.html#community"><span class="bn-gift-pair" aria-hidden="true"><i>а.</i><i>К</i></span>'
        '<h3>Салон × Кладовая ГИПСР</h3><p>Два Telegram-канала и два цифровых набора: чек-листы, планер и шаблоны за проверенную подписку.</p>'
        '<span class="bn-gift-cta">Забрать в кабинете</span></a></div></section>'
    )
    tail = (steps(STEPS, "Как работают бонусы", "bn-how-title") + faq(FAQ, "bn-faq-title")
            + final("Выгода начинается с первого заказа", "Выбери работу и отправь заявку: бонусы и скидку абонемента применим до первой оплаты.",
                    '<a class="ds-btn ds-btn--lime" href="services.html">Выбрать работу</a>',
                    f'<a class="ds-btn ds-btn--ghost" href="{TG}" target="_blank" rel="noopener" data-tg-cta="benefits_final">{PLANE}Спросить в Telegram</a>'))
    # Вкладки прилипают под шапкой только в пределах своих панелей
    return ('<main id="main" class="bn-main" data-benefits-v4>' + hero_html + '<div class="bn-switch-area">' + tabs_html + plans_html
            + bonus_html + deposit_html + more_html + '</div>' + tail
            + '<noscript><style>.bn-panel[hidden]{display:block!important}</style></noscript></main>')


# ---------- plus.html
PLUS_FAQ = [("Когда абонемент начнёт действовать?",
             "После подтверждения оплаты, не позже чем через 24 часа. Если не успеем, можно отказаться и вернуть оплату полностью."),
            ("Продлевается ли он сам?",
             "Нет, автопродления нет. Когда срок закончится, абонемент перестанет действовать, а новый срок — отдельной оплатой."),
            ("Скидка складывается с бонусами?",
             "Да. Скидка абонемента и бонусы вместе уменьшают цену заказа не больше чем на 25%."),
            ("Можно отказаться от абонемента?",
             "Да, в любое время. До активации вернём оплату полностью, после — за вычетом стоимости уже оказанных услуг абонемента; расчёт покажем."),
            ("Можно оплатить абонемент бонусами, депозитом или сертификатом?",
             "Нет, абонемент оплачивается отдельно. И бонусы за его оплату не начисляются."),
            ("Что, если не успею воспользоваться консультацией?",
             "Консультация, тренажёр и SOS не переносятся на следующий срок, если не воспользовался сам. Если услугу не дали мы — перенесём её или вернём стоимость.")]


def plus_main():
    hero_html = (
        '<section class="bn-hero bn-hero--page ds-night" aria-labelledby="bn-title"><div class="bn-hero-copy">'
        '<h1 class="ds-display-1" id="bn-title">Абонемент Салон+</h1>'
        '<p class="ds-lead">Один платёж — скидка на каждый заказ, пока действует абонемент. Плюс приоритетная очередь, куратор сессии '
        'и подготовка к защите. Автопродления нет.</p>'
        '<div class="bn-hero-actions"><a class="ds-btn ds-btn--lime" href="dashboard.html#plus">Оформить в кабинете</a>'
        '<a class="ds-btn ds-btn--ghost" href="#plus-plans">Посчитать выгоду</a></div></div>'
        '<ul class="bn-stats" aria-label="Коротко об абонементах">'
        '<li><b>до 10%</b><span>скидка на каждый заказ с Салон+ Про</span></li>'
        '<li><b>от 449 ₽</b><span>за 30 дней или 999 ₽ за семестр</span></li>'
        '<li><b>24 часа</b><span>на активацию после оплаты</span></li></ul></section>'
    )
    lab = ('<section class="bn-section bn-lab-section" id="plus-plans" aria-labelledby="bn-plus-title">'
           + head("Окупится ли абонемент", "Выбери работу, сколько их будет за срок и сам срок — посчитаем скидку, окупаемость и экономию.",
                  hid="bn-plus-title")
           + plans_body() + '</section>')
    facts = rules([("Без автопродления", "Новый срок подключается только отдельной оплатой. Никаких автоматических списаний."),
                   ("24 часа на активацию", "После подтверждения оплаты. Состав, срок и цена видны до покупки."),
                   ("Отдельная покупка", "Абонемент нельзя оплатить бонусами, сертификатом или депозитом.")], "bn-rules bn-rules--3")
    builder = (
        '<section class="bn-section" aria-labelledby="bn-own-title"><div class="bn-wide-card">'
        '<div><h2 class="ds-display-2" id="bn-own-title">Нужен свой набор?</h2>'
        '<p class="ds-lead">В кабинете есть своя сборка: базовая ставка 199 ₽ за 30 дней и опции на выбор — скидка от 3 до 10%, '
        'двойной кешбэк, куратор, тренажёр защиты, замок цен и другие. Из скидочных опций действует одна, наибольшая. '
        'Итог и состав — до оплаты.</p></div>'
        '<a class="ds-btn ds-btn--violet" href="dashboard.html#club-builder">Собрать свой абонемент</a></div></section>'
    )
    tail = (faq(PLUS_FAQ, "bn-faq-title")
            + final("Оформи абонемент перед сессией", "Выбери план в кабинете: цена, срок и состав видны до оплаты.",
                    '<a class="ds-btn ds-btn--lime" href="dashboard.html#plus">Оформить в кабинете</a>',
                    '<a class="ds-btn ds-btn--ghost" href="benefits.html">Все выгоды</a>'))
    return ('<main id="main" class="bn-main bn-page" data-benefits-v4>' + crumbs("plus") + hero_html + lab
            + '<div class="bn-section bn-section--tight">' + facts + '</div>' + builder + tail + '</main>')


# ---------- deposit.html
DEP_STEPS = [("Пополняешь кошелёк", "От 20 000 до 60 000 ₽ за раз, кратно 1 000 ₽. Ставка резерва фиксируется сразу."),
             ("Оплачиваешь этапы", "Деньги из кошелька оплачивают очередной этап заказа целиком."),
             ("Получаешь кешбэк", "После полной оплаты заказа — обычные 5% бонусами, с Салон+ Про — 10%."),
             ("Добираешь по депозиту", "Если депозитная ставка выгоднее, разница откроется после приёмки и 14 дней. Живёт 180 дней.")]
DEP_FAQ = [("Чем депозит отличается от вклада?",
            "Это аванс за будущие услуги, а не вклад: процентов на остаток нет. Выгода — бонусами за услуги, оплаченные из кошелька."),
           ("Сколько денег можно держать в кошельке?",
            "До 120 000 ₽ всего. Срок хранения не ограничен."),
           ("Как вернуть остаток?",
            "По заявлению: неиспользованные деньги вернём в течение 10 дней, без штрафа, обычно тем же способом, которым пополняли. Бонусы за возвращённую часть сгорают."),
           ("Почему бонусы по депозиту приходят не сразу?",
            "Резерв — это не баланс для оплаты. Бонусы считаются от реально использованной суммы и открываются после приёмки результата и 14 дней проверки."),
           ("Что нельзя оплатить из кошелька?",
            "Абонемент Салон+, подарочные сертификаты и новое пополнение депозита.")]


def deposit_main():
    bars = "".join(f'<li style="--h:{r / 15:.3f}"><b>{r}%</b><span>{num(a // 1000)} тыс.</span></li>' for a, r in TIERS)
    hero_html = (
        '<section class="bn-hero bn-hero--page ds-night" aria-labelledby="bn-title"><div class="bn-hero-copy">'
        '<h1 class="ds-display-1" id="bn-title">Депозит</h1>'
        '<p class="ds-lead">Аванс на семестр вперёд: деньги лежат в кошельке и оплачивают этапы, а за использованное начисляются '
        'бонусы до 15%. Остаток можно вернуть.</p>'
        '<div class="bn-hero-actions"><a class="ds-btn ds-btn--lime" href="dashboard.html#deposit">Открыть кошелёк</a>'
        '<a class="ds-btn ds-btn--ghost" href="#deposit-calc">Посчитать</a></div></div>'
        '<figure class="bn-bars"><ol aria-label="Ставка резерва от суммы пополнения">' + bars + '</ol>'
        '<figcaption>Ставка резерва — от суммы пополнения</figcaption></figure></section>'
    )
    lab = ('<section class="bn-section bn-lab-section" id="deposit-calc" aria-labelledby="bn-dep-title">'
           + head("Сколько вернётся бонусами", "Двигай ползунки: сколько вносишь и сколько тратишь на услуги. Ниже — кешбэк и начисление по депозиту.",
                  hid="bn-dep-title")
           + deposit_lab() + rules(DEPOSIT_RULES, "bn-rules bn-rules--3") + DEPOSIT_DETAILS + '</section>')
    tail = (steps(DEP_STEPS, "Как работает депозит", "bn-how-title") + faq(DEP_FAQ, "bn-faq-title")
            + final("Запас на семестр — в кабинете", "Пополнение, остаток и бонусы видны в кошельке.",
                    '<a class="ds-btn ds-btn--lime" href="dashboard.html#deposit">Открыть кошелёк</a>',
                    '<a class="ds-btn ds-btn--ghost" href="benefits.html">Все выгоды</a>'))
    return '<main id="main" class="bn-main bn-page" data-benefits-v4>' + crumbs("deposit") + hero_html + lab + tail + '</main>'


# ---------- referral.html и referral-rules.html (одинаковые страницы)
REF_STEPS = [("Друг открывает бота по ссылке", "Впервые и по твоей личной ссылке — из кабинета или из Telegram-бота."),
             ("Оплачивает первый заказ", "Целиком. Регистрация и заявка без оплаты не считаются."),
             ("Тебе — 200 бонусов", "После подтверждения оплаты. Бонусы живут 90 дней.")]
REF_RULES = [("Другу цена не меняется", "Ссылка не даёт скидку: бонус получаешь только ты."),
             ("Только оплаченные заказы", "Если по заказу друга вернут деньги, начисление пересчитаем."),
             ("Без себя и спама", "Нельзя приглашать себя с других аккаунтов и рассылать ссылку массово.")]


def referral_main():
    hero_html = (
        '<section class="bn-hero bn-hero--page ds-night" aria-labelledby="bn-title"><div class="bn-hero-copy">'
        '<h1 class="ds-display-1" id="bn-title">200 бонусов за друга</h1>'
        '<p class="ds-lead">Поделись личной ссылкой. Когда друг впервые оплатит заказ, тебе начислим 200 бонусов на следующие заказы.</p>'
        '<div class="bn-hero-actions"><a class="ds-btn ds-btn--lime" href="dashboard.html#referrals">Моя ссылка в кабинете</a>'
        f'<a class="ds-btn ds-btn--ghost" href="{BOT_CLUB}" target="_blank" rel="noopener" data-tg-cta="referral_bot">{PLANE}Ссылка в Telegram</a></div>'
        '<p class="bn-hero-hint">Ссылка есть в кабинете и в разделе «Мои бонусы» Telegram-бота.</p></div>'
        '<div class="bn-hero-play"><div class="bn-card"><div class="bn-card-face">'
        '<div class="bn-card-top"><span class="bn-card-mark" aria-hidden="true">а.</span><span>Бонусный счёт</span></div>'
        '<p class="bn-card-label">За каждого друга</p>'
        '<p class="bn-card-num"><span>+200</span><small>бонусов</small></p>'
        '<p class="bn-card-note">после полной оплаты его первого заказа</p></div></div></div></section>'
    )
    body = (rules(REF_RULES, "bn-rules bn-rules--3").join(['<div class="bn-section bn-section--tight">', '</div>'])
            + steps(REF_STEPS, "Как это работает", "bn-how-title"))
    more = (
        '<section class="bn-section" aria-labelledby="bn-more-title">'
        + head("Ещё выгоды", "Бонусы за друга складываются с остальным: абонементом, депозитом и подарками.", hid="bn-more-title")
        + '<div class="bn-links">'
        f'<a href="plus.html">{I_TICKET}<b>Салон+</b><span>Скидка до 10% на каждый заказ</span></a>'
        f'<a href="deposit.html">{I_WALLET}<b>Депозит</b><span>Деньги на семестр и бонусы до 15%</span></a>'
        f'<a href="gift.html">{I_GIFT}<b>Сертификат</b><span>Подарок от 2 000 ₽</span></a></div></section>'
    )
    tail = final("Ссылка уже ждёт в кабинете", "Открой её в кабинете или в разделе «Мои бонусы» Telegram-бота и отправь другу.",
                 '<a class="ds-btn ds-btn--lime" href="dashboard.html#referrals">Моя ссылка в кабинете</a>',
                 '<a class="ds-btn ds-btn--ghost" href="loyalty.html">Правила программы</a>')
    return '<main id="main" class="bn-main bn-page">' + crumbs("referral") + hero_html + body + more + tail + '</main>'


# ---------- gift.html: разметку покупки не трогаем
def gift_page(page):
    a = page.index('<nav class="rw-nav" aria-label="Разделы выгод">')
    b = page.index("</nav>", a) + len("</nav>")
    page = page[:a] + crumbs("gift") + page[b:]
    a = page.index('<header class="rw-intro">')
    b = page.index("</header>", a) + len("</header>")
    page = page[:a] + (
        '<section class="bn-hero bn-hero--page ds-night" aria-labelledby="bn-title"><div class="bn-hero-copy">'
        '<h1 class="ds-display-1" id="bn-title">Подарочный сертификат</h1>'
        '<p class="ds-lead">Подари помощь с учёбой: сумму выбираешь ты, задачу — получатель. От 2 000 до 50 000 ₽, '
        'остаток сохраняется.</p>'
        '<div class="bn-hero-actions"><a class="ds-btn ds-btn--lime" href="#giftBuilder">Собрать подарок</a></div></div>'
        '<div class="bn-cert-art" aria-hidden="true"><div class="bn-cert"><span class="bn-cert-mark">а.</span>'
        '<p>Подарочный сертификат</p><b>5 000 ₽</b><span>Для консультации или работы</span></div></div></section>'
    ) + page[b:]
    for old, new in [
        ('<span class="rw-kicker">СОБЕРИ СВОЙ ПОДАРОК</span><h2>Твоя забота.<br>Его планы.</h2>', '<h2>Собери подарок</h2>'),
        ('Оформить подарок ↗</button>', 'Оформить подарок</button>'),
        ('<span class="gift-envelope-label">ДЛЯ ТВОИХ БОЛЬШИХ ПЛАНОВ</span>', '<span class="gift-envelope-label">Для твоих больших планов</span>'),
        ('<span>АКАДЕМИЧЕСКИЙ<br>САЛОН</span>', '<span>Академический<br>Салон</span>'),
        ('<main id="main" class="rw-main gift-page">', '<main id="main" class="rw-main gift-page bn-main bn-gift-page">'),
    ]:
        assert page.count(old) == 1, old[:60]
        page = page.replace(old, new)
    return page


# ---------- общая обвязка страницы
def build(name):
    with open(src / f"{name}.html", encoding="utf-8", newline="") as fh:
        page = fh.read()

    def once(old, new):
        nonlocal page
        assert page.count(old) == 1, (name, old[:80])
        page = page.replace(old, new)

    if name == "gift":
        page = gift_page(page)
    else:
        main = {"benefits": hub_main, "plus": plus_main, "deposit": deposit_main,
                "referral": referral_main, "referral-rules": referral_main}[name]()
        main = re.sub(r">([^<]+)<", lambda m: ">" + glue(m.group(1)) + "<", main)
        a = page.index("<main")
        b = page.index("</main>", a) + len("</main>")
        page = page[:a] + main + page[b:]
        # Призыв в подвале дублирует финальный блок страницы (как на главной)
        i = page.index('<div class="bottom-heading">')
        j = page.index("</div>", i) + len("</div>")
        assert "<div" not in page[i + 5:j - 6]
        page = page[:i] + page[j:]

    assert 'href="assets/fonts/v4/onest-cyrillic.woff2"' in page  # Onest уже грузит ds-shell
    reading = re.search(r'<link rel="stylesheet" href="assets/css/salon-reading\.css[^>]*>', page).group(0)
    once(reading, reading
         + '<link rel="preload" href="assets/fonts/v4/literata-display-cyrillic.woff2" as="font" type="font/woff2" crossorigin>'
         f'<link rel="stylesheet" href="assets/css/ds-v4.css?v={DS_VER}">'
         f'<link rel="stylesheet" href="assets/css/benefits-v4.css?v={VER}">')
    if name in ("benefits", "plus", "deposit"):
        # Калькуляторы прежней страницы (salon-rewards.js) заменяет benefits-v4.js; правила — в salon-benefits.js
        once('<script src="assets/js/salon-rewards.js?v=189&amp;r=af9bbbc84be29d87"></script>',
             f'<script src="assets/js/benefits-v4.js?v={VER}"></script>')
        assert page.index('assets/js/salon-benefits.js') < page.index('assets/js/benefits-v4.js')
    if name.startswith("referral"):
        once('<body class="salon-direct salon-experience concept-shell salon-referral-public">',
             '<body class="salon-direct salon-experience concept-shell salon-referral-public salon-rewards ds-v4">')
    else:
        once('<body class="salon-direct salon-experience concept-shell salon-support salon-rewards">',
             '<body class="salon-direct salon-experience concept-shell salon-support salon-rewards ds-v4">')
    if preview:
        once('<meta name="robots" content="index,follow,max-image-preview:large">', '<meta name="robots" content="noindex,nofollow">')
        # Ссылки раздела ведут на превью соседних страниц
        a = page.index("<main")
        b = page.index("</main>", a)
        part = re.sub(r'href="(benefits|plus|deposit|gift|referral)\.html', r'href="\1-v4.html', page[a:b])
        page = page[:a] + part + page[b:]
    assert page.count("<main") == 1 and "\x01" not in page
    target = out / (f"{name}-v4.html" if preview else f"{name}.html")
    with open(target, "w", encoding="utf-8", newline="") as fh:
        fh.write(page)
    return target.name, len(page)


out.mkdir(parents=True, exist_ok=True)
for n in PAGES:
    print("ok", *build(n))
