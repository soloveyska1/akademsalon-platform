"""Отзывы текстом: переписка со скриншотов — настоящими сообщениями.

python build_reviews_chat.py <папка с HTML релиза> <out> [--preview]

Берёт из релиза reviews.html, index.html, home-v4.html и пишет в <out> их новые версии:
- reviews.html — все отзывы из transcripts.txt карточками-переписками (порядок, тема и подпись —
  из заголовков блоков), под каждой «Скриншот переписки» с миниатюрой открывает скриншот в том же просмотрщике;
  reviews-chat.js вместо salon-reviews.js, reviews-chat.css поверх salon-reviews.css;
- index.html и home-v4.html — блок «Что пишут после сдачи»: отзывы из HOME коротким фрагментом
  переписки, карточка ведёт на отзыв на странице отзывов; число сообщений и ссылка «N отзывов»
  считаются по transcripts.txt.
Скрипт идемпотентен: его можно применять и к старым страницам (скриншоты), и к уже собранным.
Чтобы добавить отзыв: картинки review-NN.webp и thumbs/review-NN.webp в assets/img/reviews/,
блок в начало transcripts.txt, запуск на HTML текущего релиза.
С --preview пишет скрытые превью reviews-chat-preview.html и home-chat-preview.html (noindex).
Текст сообщений — расшифровка скриншотов дословно; скрыты имена и фамилии преподавателей,
в письме научрука (отзыв 05) одна фраза опущена и отмечена «…»."""
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from transcripts import parse  # noqa: E402

HERE = Path(__file__).resolve().parent
VER = "rc-20261104-2"
TOPIC = {"result": "После сдачи", "speed": "О сроках", "care": "О работе вместе"}
# главная: отзыв, какие сообщения показать (номера в расшифровке), подпись под карточкой
HOME = [
    (5, [1, 4, 6], "Диплом приняли без единой правки"),
    (12, [0, 1, 2], "«ВКР — 5!»"),
    (9, [0, 3], "«Не думала, что на следующий день всё отправишь»"),
    (2, [3, 4], "«У меня 5 без защиты, работа очень хорошая»"),
    (13, [0, 1], "Диплом на 5, госэкзамены на 5"),
    (15, [2], "«Спасибо, особенно за нормоконтроль»"),
    (45, [1, 2, 4], "«5 с отличием!» Позвали в магистратуру"),
    (40, [0, 1, 2], "Правки по титульнику в тот же час"),
    (33, [3, 7], "«Похвалили — сказали, очень уверенно выступаю»"),
]
INTRO_OLD = "<p>Сообщения из опубликованного архива. Открой скриншот, увеличь и прочитай весь разговор.</p>"
INTRO = ("<p>Сообщения клиентов текстом, как в чате. Скрыты только имена и фамилии преподавателей, "
         "под каждым отзывом — скриншот оригинала.</p>")

ICON = {
    "file": '<path d="M12.5 9.5h5l4 4v8a1.5 1.5 0 0 1-1.5 1.5h-7.5a1.5 1.5 0 0 1-1.5-1.5V11a1.5 1.5 0 0 1 1.5-1.5Z"/><path d="M17.5 9.5v3.5a.5.5 0 0 0 .5.5h3.5"/>',
    "voice": '<path d="M13.5 11.2v9.6l7.6-4.8-7.6-4.8Z"/>',
    "doc": '<path d="M10 11.5h12v9H10z"/><path d="m10.5 12 5.5 4.3 5.5-4.3"/>',
    "photo": '<rect x="9.5" y="10.5" width="13" height="11" rx="2"/><path d="m10 19.5 3.6-3.6 2.6 2.6 1.8-1.8 3.5 3.3"/><circle cx="18.6" cy="13.9" r="1.2"/>',
}
EMOJI_ONLY = re.compile(r"[^\w.,!?:;()\"«»'-]+")


def plural(n, one, few, many):
    if n % 10 == 1 and n % 100 != 11:
        return one
    return few if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14 else many


def svg(kind):
    return ('<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" class="rc-ico-bg"/>'
            f'<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">{ICON[kind]}</g></svg>')


def rich(text):
    t = html.escape(text, quote=False)
    t = t.replace("{скрыто}", '<span class="rc-hide" title="Скрыто ради приватности">скрыто</span>')
    assert "==" not in t and "{" not in t, text
    return t.replace("||", "<br><br>").replace("|", "<br>")


def message(it):
    side = "rc-in" if it["from"] == "c" else "rc-out"
    who = "Клиент" if it["from"] == "c" else "Мастерская"
    text, att, tm = it["text"], it["att"], it["time"]
    if att and att["kind"] == "sticker":
        return f'<p class="rc-sticker {side}"><span class="rc-sr">{who}: </span>{html.escape(att["label"])}</p>'
    if not att and EMOJI_ONLY.fullmatch(text.replace(" ", "")):
        return f'<p class="rc-emoji {side}"><span class="rc-sr">{who}: </span>{html.escape(text)}</p>'
    parts = [f'<span class="rc-sr">{who}: </span>']
    if it["quote"]:
        parts.append(f'<span class="rc-quote">{rich(it["quote"])}</span>')
    if att:
        if att["kind"] == "file":
            name, _, size = att["label"].partition(" · ")
            parts.append(f'<span class="rc-att">{svg("file")}<span><b>{rich(name)}</b><small>{html.escape(size)}</small></span></span>')
        elif att["kind"] == "voice":
            parts.append(f'<span class="rc-att">{svg("voice")}<span><b>Голосовое · {html.escape(att["label"])}</b><small>расшифровка</small></span></span>')
        else:
            parts.append(f'<span class="rc-att">{svg(att["kind"])}<span><b>{html.escape(att["label"])}</b></span></span>')
    if text:
        cls = "rc-doc" if att and att["kind"] == "doc" else "rc-text"
        parts.append(f'<span class="{cls}">{rich(text)}</span>')
    if tm:
        parts.append(f'<span class="rc-gap" aria-hidden="true"></span><span class="rc-time">{tm}</span>')
    return f'<p class="rc-msg {side}">{"".join(parts)}</p>'


def chat(items, cls="rc-chat"):
    out = [f'<p class="rc-day">{html.escape(it["text"])}</p>' if it["kind"] == "day" else message(it) for it in items]
    return f'<div class="{cls}">{"".join(out)}</div>'


def stars(r):
    full = int(r)
    s = '<span aria-hidden="true">★</span>' * full
    if r - full >= .5:
        s += '<span class="rc-half" aria-hidden="true">★</span>'
    label = f"{r:g}".replace(".", ",")
    return f'<span class="rc-stars" role="img" aria-label="Оценка {label} из 5">{s}</span>'


def card(rv):
    no, items, ext, caption = rv["id"], list(rv["items"]), rv["ext"], rv["caption"]
    date = "Отзыв на внешней площадке" if ext else ""
    if not ext and items and items[0]["kind"] == "day":
        date = items.pop(0)["text"]
    plain = html.unescape(re.sub(r"<[^>]+>", "", caption))
    head = (f'<header class="rc-head"><span class="rc-tag">{TOPIC[rv["topic"]]}</span>'
            + (f'<span class="rc-date">{html.escape(date)}</span>' if date else "") + "</header>")
    if ext:
        body = (f'<div class="rc-ext">{stars(ext["rating"])}<p class="rc-ext-who"><b>{html.escape(ext["who"])}</b>'
                f'<span>{html.escape(ext["date"])}</span></p><p class="rc-ext-svc">{html.escape(ext["service"])}</p>'
                f'<p class="rc-ext-text">{rich(items[0]["text"])}</p></div>')
    else:
        body = chat(items)
    shot = "Скриншот отзыва" if ext else "Скриншот переписки"
    foot = (f'<footer class="rc-foot"><a class="rc-proof" href="assets/img/reviews/review-{no:02d}.webp" '
            f'data-caption="{html.escape(plain)}"><img class="rc-thumb" src="assets/img/reviews/thumbs/review-{no:02d}.webp" '
            f'width="40" height="40" alt="" loading="lazy" decoding="async"><span>{shot} <span aria-hidden="true">↗</span></span></a></footer>')
    title = f'<h2 class="rc-title">{caption}</h2>'
    return (f'<article class="rc-card rc-scope" id="review-{no:02d}" data-topic="{rv["topic"]}">'
            f'{head}{title}{body}{foot}</article>')


def home_card(rv, picks, caption):
    items = []
    for k in picks:
        it = dict(rv["items"][k])
        if it["kind"] == "msg":
            it["quote"] = None
            if it["att"] and it["att"]["kind"] == "doc":  # из письма на главной — только сама похвала
                it["text"] = "…" + re.sub(r"^\{скрыто\},\s*", "", it["text"]).split(" …")[0]
        items.append(it)
    return (f'<figure class="hv-voice rc-pin"><a class="rc-scope" href="reviews.html#review-{rv["id"]:02d}" '
            f'aria-label="Открыть отзыв: {html.escape(html.unescape(caption))}">{chat(items, "rc-chat rc-compact")}</a>'
            f'<figcaption>{caption}</figcaption></figure>')


def one(pattern, page, what):
    found = re.findall(pattern, page)
    assert len(found) == 1, (what, len(found))
    return found[0]


def link_after(page, anchor_re, href_re, tag):
    """Подключить tag сразу после anchor; если уже подключён — только обновить версию."""
    if re.search(href_re, page):
        return re.sub(href_re, tag, page)
    anchor = one(anchor_re, page, anchor_re)
    return page.replace(anchor, anchor + tag, 1)


def noindex(page):
    if re.search(r'<meta name="robots"[^>]*>', page):
        return re.sub(r'<meta name="robots"[^>]*>', '<meta name="robots" content="noindex,nofollow">', page, count=1)
    assert page.count('<meta charset="utf-8">') == 1
    return page.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="robots" content="noindex,nofollow">', 1)


def build_reviews(page, reviews):
    start = one(r'<section class="(?:rv-grid|rc-wall)" aria-label="Отзывы клиентов">', page, "wall")
    a = page.index(start)
    b = page.index("</section>", a) + len("</section>")
    wall = "".join(card(rv) for rv in reviews.values())
    page = page[:a] + f'<section class="rc-wall" aria-label="Отзывы клиентов">{wall}</section>' + page[b:]
    if INTRO_OLD in page:
        page = page.replace(INTRO_OLD, INTRO, 1)
    assert page.count(INTRO) == 1, "intro"
    page = link_after(page, r'<link rel="stylesheet" href="assets/css/salon-reviews\.css[^"]*">',
                      r'<link rel="stylesheet" href="assets/css/reviews-chat\.css[^"]*">',
                      f'<link rel="stylesheet" href="assets/css/reviews-chat.css?v={VER}">')
    js = f'<script src="assets/js/reviews-chat.js?v={VER}"></script>'
    page = re.sub(r'<script src="assets/js/(?:salon-reviews|reviews-chat)\.js[^"]*"></script>', js, page)
    assert page.count(js) == 1 and "salon-reviews.js" not in page, "js"
    return page


def build_home(page, reviews):
    a = page.index('<div class="hv-voices-wall">')
    end = page.index("</section>", a)
    b = page.index("</div>", page.rindex("</figure>", a, end)) + len("</div>")
    wall = "\n".join("    " + home_card(reviews[no], picks, cap) for no, picks, cap in HOME)
    page = page[:a] + f'<div class="hv-voices-wall">\n{wall}\n  </div>' + page[b:]
    n = len(reviews)
    lead = (f"{n} {plural(n, 'сообщение', 'сообщения', 'сообщений')} из переписки с клиентами. "
            "Нажми на любое — откроется вся переписка и скриншот оригинала.")
    one(r"\d+ сообщени[а-я]* из переписки с клиентами\.[^<]*", page, "lead")
    page = re.sub(r"\d+ сообщени[а-я]* из переписки с клиентами\.[^<]*", lead, page, count=1)
    one(r'<a href="reviews\.html">\d+ отзыв[а-я]*</a>', page, "link")
    page = re.sub(r'<a href="reviews\.html">\d+ отзыв[а-я]*</a>',
                  f'<a href="reviews.html">{n} {plural(n, "отзыв", "отзыва", "отзывов")}</a>', page, count=1)
    return link_after(page, r'<link rel="stylesheet" href="assets/css/home-v4\.css[^"]*">',
                      r'<link rel="stylesheet" href="assets/css/reviews-chat\.css[^"]*">',
                      f'<link rel="stylesheet" href="assets/css/reviews-chat.css?v={VER}">')


def main():
    root, out = Path(sys.argv[1]), Path(sys.argv[2])
    preview = "--preview" in sys.argv
    out.mkdir(parents=True, exist_ok=True)
    reviews = parse(HERE / "transcripts.txt")
    for no in reviews:
        assert (root / "assets/img/reviews" / f"review-{no:02d}.webp").exists() or not (root / "assets").exists(), no
    read = lambda name: (root / name).read_text(encoding="utf-8")
    write = lambda name, text: (out / name).write_text(text, encoding="utf-8", newline="")
    page, home = build_reviews(read("reviews.html"), reviews), build_home(read("index.html"), reviews)
    if preview:
        write("reviews-chat-preview.html", noindex(page))
        write("home-chat-preview.html", noindex(home))
    else:
        write("reviews.html", page)
        write("index.html", home)
        if (root / "home-v4.html").exists():
            write("home-v4.html", build_home(read("home-v4.html"), reviews))
    print("ok", len(reviews), "reviews")


if __name__ == "__main__":
    main()
