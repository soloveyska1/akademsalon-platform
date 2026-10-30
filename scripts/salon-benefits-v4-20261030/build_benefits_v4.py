"""«Выгоды» v4: benefits.html из живого релиза -> страница на дизайн-системе ds-v4.

python build_benefits_v4.py <benefits.html релиза> <salon-benefits.js> <salon-products.js> <out-папка> [--preview]

Пишет <out>/benefits.html (или benefits-v4.html с --preview и noindex). Правила считает salon-benefits.js
(window.SalonBenefitMath); стартовые цифры в разметке посчитаны тем же файлом через node, чтобы страница
без скрипта и до его запуска показывала верные суммы. Тексты правил — по loyalty.html (ред. 1.11)."""
import html as H
import json
import re
import subprocess
import sys
from pathlib import Path

src, math_js, products_js, out = (Path(a) for a in sys.argv[1:5])
preview = "--preview" in sys.argv[5:]
VER = "benefits-v4-20261030-1"
DS_VER = "home-v4-20261030-4"
TG = "https://t.me/academicsaloon"
BOT_WELCOME = "https://t.me/academic_saloon_bot?start=welcome_site"  # запасная ссылка тура Листика

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
    return f"{int(n):,}".replace(",", " ") + " ₽"


def num(n):
    return f"{int(n):,}".replace(",", " ")


def even(k):
    return f"{'со' if k == 2 else 'с'} {k}-й работы"


def svg(body, cls=""):
    return (f'<svg{f" class={chr(34)}{cls}{chr(34)}" if cls else ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{body}</svg>')


I_TICKET = svg('<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v3a2.5 2.5 0 0 0 0 5v3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-3a2.5 2.5 0 0 0 0-5z"/><path d="M12 9.5v5M9.5 12h5"/>')
I_SPARK = svg('<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z"/><path d="M19 16.5c.2 1.3.9 2 2.2 2.2-1.3.2-2 .9-2.2 2.2-.2-1.3-.9-2-2.2-2.2 1.3-.2 2-.9 2.2-2.2z"/>')
I_WALLET = svg('<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><path d="M4 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5z"/><path d="M16 13.5h.01"/>')
I_GIFT = svg('<path d="M4 11h16v9H4zM3 8h18v3H3zM12 8v12"/><path d="M12 8C10.5 5 7 4.5 7 6.8 7 8 9.5 8 12 8zm0 0c1.5-3 5-3.5 5-1.2C17 8 14.5 8 12 8z"/>')
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


# ---------- первый экран: бонусный счёт, который отвечает на выбор
hero = C["hero"]
hero_html = (
    '<section class="bn-hero ds-night" aria-labelledby="bn-title"><div class="bn-hero-copy">'
    '<h1 class="ds-display-1" id="bn-title">Выгоды Салона</h1>'
    '<p class="ds-lead">С каждого оплаченного заказа 5% возвращается бонусами: 1 бонус — 1 рубль скидки на следующий заказ. '
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

# ---------- вкладки
TABS = [("subscriptions", I_TICKET, "Салон+", "скидка до 10%"), ("bonuses", I_SPARK, "Бонусы", "5% с оплаты"),
        ("deposit", I_WALLET, "Депозит", "до +15% бонусами"), ("more", I_GIFT, "Подарки", "300 и 200 бонусов")]
tabs_html = ('<nav class="bn-tabs" id="bn-tabs" aria-label="Выгоды">' + "".join(
    f'<a href="#{i}"{" aria-current=" + chr(34) + "true" + chr(34) if i == "subscriptions" else ""}>{ic}<span><b>{t}</b><small>{s}</small></span></a>'
    for i, ic, t, s in TABS) + '</nav>')

# ---------- Салон+
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


plans_html = (
    '<section class="bn-panel" id="subscriptions" aria-labelledby="bn-plus-title"><div class="bn-head">'
    '<h2 class="ds-display-2" id="bn-plus-title">Абонемент Салон+</h2>'
    '<p class="ds-lead">Один платёж — скидка на каждый заказ, пока действует абонемент. Проверь, окупится ли он на твоих планах.</p></div>'
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
    'не учтены. Сессия — разовый план на 60 дней, его считаем по одной работе. Автопродления нет.</p></section>'
)

# ---------- Бонусы
B = C["bonus"]
bonus_html = (
    '<section class="bn-panel" id="bonuses" aria-labelledby="bn-bonus-title" hidden><div class="bn-head">'
    '<h2 class="ds-display-2" id="bn-bonus-title">Бонусы</h2>'
    '<p class="ds-lead">5% с каждой оплаты возвращается на бонусный счёт. На следующем заказе ими можно оплатить до 20% цены.</p></div>'
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
    '<a class="ds-btn ds-btn--violet bn-stage-cta" href="dashboard.html#benefits">Мои бонусы в кабинете</a></div></div>'
    '<ul class="bn-rules">'
    '<li><b>1 бонус = 1 ₽</b><span>Это скидка: деньгами бонусы не выплачиваются и другим не передаются.</span></li>'
    '<li><b>До 20% заказа</b><span>Бонусами оплачивается часть заказа от 1 000 ₽ — при подтверждении, до первой оплаты.</span></li>'
    '<li><b>До 25% вместе</b><span>Скидка абонемента и бонусы вместе — не больше четверти цены заказа.</span></li>'
    '<li><b>90 дней</b><span>Столько живёт кешбэк. О сгорании бот предупреждает заранее.</span></li></ul></section>'
)

# ---------- Депозит
D = C["dep"]
cb = D["used"] * 5 // 100
extra = max(0, D["earned"] - cb)
TIERS = [(20000, 8), (30000, 10), (45000, 12), (60000, 15)]
deposit_html = (
    '<section class="bn-panel" id="deposit" aria-labelledby="bn-dep-title" hidden><div class="bn-head">'
    '<h2 class="ds-display-2" id="bn-dep-title">Депозит</h2>'
    '<p class="ds-lead">Пополни счёт на семестр вперёд: деньги остаются твоими, а за использованное начисляются бонусы до 15%.</p></div>'
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
    f'<div><span>Кешбэк за услуги<small>после полной оплаты, живёт 90 дней</small></span><b data-d="cashback" data-value="{cb}">+{num(cb)}</b></div>'
    f'<div class="is-extra"><span>Дополнительно по депозиту<small>после приёмки и 14 дней, живёт 180 дней</small></span><b data-d="extra" data-value="{extra}">+{num(extra)}</b></div>'
    f'<p data-d="reserve">Резерв пополнения — до {num(D["reserve"])} бонусов. Это не баланс для оплаты: бонусы открываются по мере использования, кешбэк в них уже учтён.</p></div>'
    '<a class="ds-btn ds-btn--violet bn-stage-cta" href="dashboard.html#deposit">Открыть кошелёк</a></div></div>'
    '<ul class="bn-rules bn-rules--3">'
    '<li><b>Деньги остаются деньгами</b><span>Остаток на счёте — до 120 000 ₽, срок не ограничен. Этап оплачивается целиком.</span></li>'
    '<li><b>Остаток можно вернуть</b><span>По заявлению в течение 10 дней, без штрафа. Бонусы за возвращённую часть сгорают.</span></li>'
    '<li><b>Это аванс, не вклад</b><span>Процентов на остаток нет: выгода — бонусами за услуги, которые ты оплатил депозитом.</span></li></ul>'
    '<details class="bn-more bn-more--rules"><summary>Как считается бонус по депозиту</summary>'
    '<p>Одно пополнение — от 20 000 до 60 000 ₽, кратно 1 000 ₽. Ставка резерва зависит от суммы пополнения: 8% до 29 999 ₽, 10% от 30 000 ₽, '
    '12% от 45 000 ₽ и 15% за 60 000 ₽. Бонусы считаются от реально использованной суммы по тем же ступеням, но не выше ставки пополнения. '
    'Сначала начисляется обычный кешбэк, а если депозитный расчёт выгоднее, разница открывается после приёмки результата и 14 дней проверки. '
    'Кешбэк и ставка депозита не складываются — применяется больший итог.</p>'
    '<p><a class="ds-link" href="loyalty.html">Все правила программы</a></p></details></section>'
)

# ---------- Подарки
more_html = (
    '<section class="bn-panel" id="more" aria-labelledby="bn-more-title" hidden><div class="bn-head">'
    '<h2 class="ds-display-2" id="bn-more-title">Подарки</h2>'
    '<p class="ds-lead">Бонусы на первый заказ, награда за друга, сертификат для своих и полезные наборы от соседнего проекта.</p></div>'
    '<div class="bn-gifts">'
    f'<a class="bn-gift bn-gift--welcome" href="{BOT_WELCOME}" target="_blank" rel="noopener" data-welcome data-tg-cta="benefits_welcome_tile">'
    '<span class="bn-gift-num">300</span><h3>бонусов новым гостям</h3>'
    '<p>Начисляет Telegram-бот после знакомства с правилами, один раз на аккаунт. Действуют 30 дней — хватит, чтобы оплатить ими до 20% первого заказа.</p>'
    f'<span class="bn-gift-cta">{PLANE}<span data-welcome-label>Забрать в Telegram</span></span></a>'
    '<a class="bn-gift bn-gift--friend" href="dashboard.html#referrals"><span class="bn-gift-num">200</span><h3>бонусов за друга</h3>'
    '<p>Друг впервые оплатил заказ по твоей ссылке — тебе 200 бонусов на 90 дней. Скидку другу ссылка не даёт.</p>'
    '<span class="bn-gift-cta">Моя ссылка в кабинете</span></a>'
    f'<a class="bn-gift bn-gift--cert" href="gift.html">{I_GIFT}<h3>Подарочный сертификат</h3>'
    '<p>От 2 000 ₽. Имя, пожелание и помощь, которую выберет сам получатель.</p><span class="bn-gift-cta">Собрать подарок</span></a>'
    '<a class="bn-gift bn-gift--club" href="dashboard.html#community"><span class="bn-gift-pair" aria-hidden="true"><i>а.</i><i>К</i></span>'
    '<h3>Салон × Кладовая ГИПСР</h3><p>Два Telegram-канала и два цифровых набора: чек-листы, планер и шаблоны за проверенную подписку.</p>'
    '<span class="bn-gift-cta">Забрать в кабинете</span></a></div></section>'
)

# ---------- как это работает, вопросы, финал
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
tail_html = (
    '<section class="bn-section bn-how" aria-labelledby="bn-how-title"><div class="bn-head">'
    '<h2 class="ds-display-2" id="bn-how-title">Как работают бонусы</h2></div><ol class="bn-steps">'
    + "".join(f'<li><h3>{esc(t)}</h3><p>{esc(p)}</p></li>' for t, p in STEPS) + '</ol></section>'
    '<section class="bn-section bn-faq" aria-labelledby="bn-faq-title"><div class="bn-head">'
    '<h2 class="ds-display-2" id="bn-faq-title">Частые вопросы</h2>'
    '<p class="ds-lead">Коротко о главном. Точные условия — в <a class="ds-link" href="loyalty.html">правилах программы</a>.</p></div>'
    '<div class="bn-faq-list">' + "".join(f'<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in FAQ)
    + '</div></section>'
    '<section class="bn-final ds-night" aria-labelledby="bn-final-title"><div>'
    '<h2 class="ds-display-2" id="bn-final-title">Выгода начинается с первого заказа</h2>'
    '<p class="ds-lead">Выбери работу и отправь заявку: бонусы и скидку абонемента применим до первой оплаты.</p></div>'
    '<div class="bn-final-actions"><a class="ds-btn ds-btn--lime" href="services.html">Выбрать работу</a>'
    f'<a class="ds-btn ds-btn--ghost" href="{TG}" target="_blank" rel="noopener" data-tg-cta="benefits_final">{PLANE}Спросить в Telegram</a></div></section>'
)

# Вкладки прилипают под шапкой только в пределах своих панелей
main = ('<main id="main" class="bn-main" data-benefits-v4>' + hero_html + '<div class="bn-switch-area">' + tabs_html + plans_html
        + bonus_html + deposit_html + more_html + '</div>' + tail_html
        + '<noscript><style>.bn-panel[hidden]{display:block!important}</style></noscript></main>')


def glue(text):
    # «1 000 ₽», «20 000», «5 %» не разрываются переносом
    text = re.sub(r"(\d) (?=\d{3}(?!\d))", "\\1\u00a0", text)
    return re.sub(r"(\d) (?=₽|%|бонус|работ|дн|тыс)", "\\1\u00a0", text)


main = re.sub(r">([^<]+)<", lambda m: ">" + glue(m.group(1)) + "<", main)

with open(src, encoding="utf-8", newline="") as fh:
    page = fh.read()


def once(old, new):
    global page
    assert page.count(old) == 1, old[:80]
    page = page.replace(old, new)


def after_tag(prefix, extra):
    global page
    assert page.count(prefix) == 1, prefix
    i = page.index(prefix)
    j = page.index(">", i) + 1
    page = page[:j] + extra + page[j:]


a = page.index('<main id="main" class="rw-main" data-rewards-hub>')
b = page.index("</main>", a) + len("</main>")
page = page[:a] + main + page[b:]

# Призыв в подвале дублирует финальный блок страницы (как на главной)
i = page.index('<div class="bottom-heading">')
j = page.index("</div>", i) + len("</div>")
assert "<div" not in page[i + 5:j - 6]
page = page[:i] + page[j:]

assert 'href="assets/fonts/v4/onest-cyrillic.woff2"' in page  # Onest уже грузит ds-shell
after_tag('<link rel="stylesheet" href="assets/css/salon-reading.css',
          '<link rel="preload" href="assets/fonts/v4/literata-display-cyrillic.woff2" as="font" type="font/woff2" crossorigin>'
          f'<link rel="stylesheet" href="assets/css/ds-v4.css?v={DS_VER}">'
          f'<link rel="stylesheet" href="assets/css/benefits-v4.css?v={VER}">')
# Вкладки и калькуляторы прежней страницы (salon-rewards.js) заменяет benefits-v4.js; правила — в salon-benefits.js
once('<script src="assets/js/salon-rewards.js?v=189&amp;r=af9bbbc84be29d87"></script>',
     f'<script src="assets/js/benefits-v4.js?v={VER}"></script>')
assert page.index('assets/js/salon-benefits.js') < page.index('assets/js/benefits-v4.js')
once('<body class="salon-direct salon-experience concept-shell salon-support salon-rewards">',
     '<body class="salon-direct salon-experience concept-shell salon-support salon-rewards ds-v4">')
if preview:
    once('<meta name="robots" content="index,follow,max-image-preview:large">', '<meta name="robots" content="noindex,nofollow">')

for need in ('id="subscriptions"', 'id="bonuses"', 'id="deposit"', 'id="more"', 'data-benefits-v4'):
    assert page.count(need) == 1, need

out.mkdir(parents=True, exist_ok=True)
name = "benefits-v4.html" if preview else "benefits.html"
with open(out / name, "w", encoding="utf-8", newline="") as fh:
    fh.write(page)
print("ok", name, len(page))
