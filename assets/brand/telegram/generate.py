#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Аватары «Оттиск» для Telegram: канал (сургуч) и бот (штемпельная синь).
Принцип дизайн-системы: «Движется только то, что печатается, пишется или считается».
  канал — печатается: оттиск бьётся по бумаге (осадка + расплыв краски)
  бот   — пишется:    тот же удар, затем отточие набирается «· ·· ···»
"""
import math, os, re, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

SCR   = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(SCR, "fonts")

def _find_site():
    for p in (os.environ.get("SALON_SITE"),
              os.path.abspath(os.path.join(SCR, "..", "..", "..")),
              "/Users/saymurrbk.ru/Desktop/Сайт для заказов"):
        if p and os.path.exists(os.path.join(p, "assets", "img", "favicon.svg")):
            return p
    raise SystemExit("не найден корень сайта — задайте SALON_SITE=/путь/к/сайту")

SITE = _find_site()

def _ensure_fonts():
    """Гарнитуры «Оттиска» лежат как woff2 — Pillow их не читает. Разворачиваем в ttf (однократно)."""
    os.makedirs(FONTS, exist_ok=True)
    for n in ("golos-text-normal-600-cyrillic", "golos-text-normal-600-latin"):
        dst = os.path.join(FONTS, n + ".ttf")
        if not os.path.exists(dst):
            from fontTools.ttLib import TTFont
            f = TTFont(os.path.join(SITE, "assets", "fonts", n + ".woff2"))
            f.flavor = None
            f.save(dst)

_ensure_fonts()

S, SS = 800, 3                 # финальный размер / суперсэмпл спрайта
R     = S * SS
FPS, DUR = 30, 4.0
NF    = int(round(FPS * DUR))

PAPER = (246, 241, 231)        # --paper
HAIR  = (217, 210, 194)        # --hairline

# геометрия (в финальных px, центр 400,400)
R_REG, R_OUT, R_FILL, R_RULE, R_TEXT = 371, 325, 306, 269, 288
MONO_SCALE, MONO_CY = 1.30, 390
DOT_CY, DOT_R, DOT_GAP = 532, 15, 50

THEMES = {
    "channel": dict(ink=(178, 59, 34), deep=(140, 45, 24), rule=(198, 91, 65),
                    label="КАНАЛ", dots=False),
    "bot":     dict(ink=(58, 78, 122), deep=(42, 56, 88), rule=(106, 129, 180),
                    label="БОТ", dots=True),
}

# ---------------------------------------------------------------- шрифты
_fc = {}
def font_for(ch, size, wght=600):
    sub = "cyrillic" if ("Ѐ" <= ch <= "ӿ" or ch == " ") else "latin"
    key = (sub, size, wght)
    if key not in _fc:
        f = ImageFont.truetype(os.path.join(FONTS, f"golos-text-normal-600-{sub}.ttf"), size)
        f.set_variation_by_axes([wght])
        _fc[key] = f
    return _fc[key]

# ------------------------------------------------- разбор путей favicon.svg
NUM = re.compile(r"[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?")

def tokenize(d):
    out, i = [], 0
    while i < len(d):
        c = d[i]
        if c.isalpha():
            out.append(c); i += 1
        elif c in " ,\t\r\n":
            i += 1
        else:
            m = NUM.match(d, i)
            if not m:
                raise ValueError(f"плохой символ {c!r} в позиции {i}")
            out.append(float(m.group())); i = m.end()
    return out

def flatten_path(d, steps=28):
    """SVG path -> список замкнутых подконтуров (список точек)."""
    t = tokenize(d)
    subs, cur = [], []
    x = y = sx = sy = 0.0
    i, cmd = 0, None
    def nums(k):
        nonlocal i
        v = t[i:i + k]; i += k
        return v
    while i < len(t):
        if isinstance(t[i], str):
            cmd = t[i]; i += 1
        if cmd in ("M", "m"):
            a, b = nums(2)
            x, y = (a, b) if cmd == "M" else (x + a, y + b)
            if cur: subs.append(cur)
            cur = [(x, y)]; sx, sy = x, y
            cmd = "L" if cmd == "M" else "l"          # неявные lineto после M
        elif cmd in ("L", "l"):
            a, b = nums(2); x, y = (a, b) if cmd == "L" else (x + a, y + b)
            cur.append((x, y))
        elif cmd in ("H", "h"):
            (a,) = nums(1); x = a if cmd == "H" else x + a
            cur.append((x, y))
        elif cmd in ("V", "v"):
            (a,) = nums(1); y = a if cmd == "V" else y + a
            cur.append((x, y))
        elif cmd in ("Q", "q"):
            a, b, c, e = nums(4)
            if cmd == "q": a, b, c, e = x + a, y + b, x + c, y + e
            for s in range(1, steps + 1):
                u = s / steps; v = 1 - u
                cur.append((v * v * x + 2 * v * u * a + u * u * c,
                            v * v * y + 2 * v * u * b + u * u * e))
            x, y = c, e
        elif cmd in ("Z", "z"):
            if cur: subs.append(cur); cur = []
            x, y = sx, sy
            i += 0
            if i < len(t) and not isinstance(t[i], str):
                raise ValueError("числа после Z")
        else:
            raise ValueError(f"неподдержанная команда {cmd!r}")
    if cur: subs.append(cur)
    return subs

def monogram_paths():
    svg = open(os.path.join(SITE, "assets/img/favicon.svg"), encoding="utf-8").read()
    ds = re.findall(r'<path[^>]*\sd="([^"]+)"', svg)
    assert len(ds) == 2, f"ожидались 2 буквы монограммы, найдено {len(ds)}"
    return [flatten_path(d) for d in ds]

def render_monogram(mask, cx, cy, scale):
    """Печатает «АС» из favicon.svg в маску-выворотку (чётно-нечётное правило)."""
    letters = monogram_paths()
    pts = [p for L in letters for sub in L for p in sub]
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
    y0, y1 = min(p[1] for p in pts), max(p[1] for p in pts)
    MS = 4                                    # доп. суперсэмпл под сглаживание
    k = scale * SS * MS
    w, h = int((x1 - x0) * k) + 8, int((y1 - y0) * k) + 8
    acc = Image.new("L", (w, h), 0)
    for L in letters:
        polys = []
        for sub in L:
            im = Image.new("L", (w, h), 0)
            ImageDraw.Draw(im).polygon(
                [((px - x0) * k + 4, (py - y0) * k + 4) for px, py in sub], fill=255)
            polys.append(im)
        lm = polys[0]
        for hole in polys[1:]:
            lm = ImageChops.subtract(lm, hole)
        acc = ImageChops.lighter(acc, lm)
    fw, fh = int((x1 - x0) * scale * SS), int((y1 - y0) * scale * SS)
    acc = acc.resize((fw, fh), Image.LANCZOS)
    mask.paste(ImageChops.lighter(
        mask.crop((int(cx - fw / 2), int(cy - fh / 2), int(cx - fw / 2) + fw, int(cy - fh / 2) + fh)), acc),
        (int(cx - fw / 2), int(cy - fh / 2)))

# ------------------------------------------------------------ текст по дуге
def arc_text(mask, text, radius, theta_c_deg, top, size, tracking, wght=600):
    """Печатает строку по дуге в маску-выворотку. top=True — верхняя дуга."""
    cx = cy = R / 2
    size, radius, tracking = size * SS, radius * SS, tracking * SS
    items = []
    for ch in text:
        f = font_for(ch, int(size), wght)
        items.append((ch, size * 0.34 if ch == " " else f.getlength(ch), f))
    total = sum(w for _, w, _ in items) + tracking * (len(items) - 1)
    span = total / radius                                   # рад
    th0 = math.radians(theta_c_deg) + (-span / 2 if top else span / 2)
    dirn = 1 if top else -1
    pos = 0.0
    for ch, w, f in items:
        pos += w / 2
        if ch != " ":
            cap = -f.getbbox("Н", anchor="ls")[1]
            bh = int(size * 1.9); base_y = int(size * 1.42)
            bb = f.getbbox(ch, anchor="ls")
            tw = int(bb[2] - min(0, bb[0])) + 10
            tile = Image.new("L", (tw, bh), 0)
            ImageDraw.Draw(tile).text((5, base_y), ch, font=f, fill=255, anchor="ls")
            if ch in "·•":                                  # точку — на середину капители
                ib = tile.getbbox()
                if ib: tile = ImageChops.offset(tile, 0, int(base_y - cap / 2 - (ib[1] + ib[3]) / 2))
            delta = bh / 2 - (base_y - cap / 2)             # смещение центра плитки от полосы капители
            th = th0 + dirn * (pos / radius)
            rp = radius - delta if top else radius + delta
            px, py = cx + rp * math.cos(th), cy + rp * math.sin(th)
            rot = (-90 - math.degrees(th)) if top else (90 - math.degrees(th))
            t2 = tile.rotate(rot, resample=Image.BICUBIC, expand=True)
            bx, by = int(px - t2.width / 2), int(py - t2.height / 2)
            box = (bx, by, bx + t2.width, by + t2.height)
            mask.paste(ImageChops.lighter(mask.crop(box), t2), box)
        pos += w / 2 + tracking
    return span

# ------------------------------------------------------------------ бумага
def paper_bg():
    rng = np.random.default_rng(11)
    fine = rng.random((S, S)).astype(np.float32) - 0.5
    coarse = np.asarray(Image.fromarray((rng.random((50, 50)) * 255).astype(np.uint8))
                        .resize((S, S), Image.BICUBIC), np.float32) / 255.0 - 0.5
    a = np.array(PAPER, np.float32)[None, None, :] + (fine * 9 + coarse * 7)[..., None]
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGB")
    # регистрационная линейка (тонкая, как на листах «Оттиска»)
    ring = Image.new("L", (S * 4, S * 4), 0)
    ImageDraw.Draw(ring).ellipse([S * 2 - R_REG * 4, S * 2 - R_REG * 4,
                                  S * 2 + R_REG * 4, S * 2 + R_REG * 4],
                                 outline=255, width=5)
    ring = ring.resize((S, S), Image.LANCZOS).point(lambda v: int(v * 0.85))
    img.paste(Image.new("RGB", (S, S), HAIR), (0, 0), ring)
    return img

# ------------------------------------------------------------------ печать
def seal_sprite(th):
    c = R / 2
    yy, xx = np.mgrid[0:R, 0:R]
    dx = xx.astype(np.float32) - c; dy = yy.astype(np.float32) - c
    del xx, yy
    rad = np.hypot(dx, dy); ang = np.arctan2(dy, dx)
    del dx, dy

    def edge(r0, waves):
        e = np.full_like(rad, r0 * SS)
        for amp, fr, ph in waves:
            e += amp * SS * np.sin(fr * ang + ph)
        return np.clip(e - rad + 0.5, 0, 1)

    a_out = edge(R_OUT, [(0.7, 5, 0.4), (0.5, 11, 1.9), (0.35, 23, 3.1)])
    a_fill = edge(R_FILL, [(0.6, 7, 2.2), (0.4, 13, 0.7), (0.3, 27, 4.0)])
    a_rule = (np.clip((R_RULE + 2.5) * SS - rad + 0.5, 0, 1)
              - np.clip((R_RULE - 2.5) * SS - rad + 0.5, 0, 1))

    col = np.empty((R, R, 3), np.float32)
    col[:] = np.array(th["deep"], np.float32)
    for a, rgb in ((a_fill, th["ink"]), (a_rule, th["rule"])):
        col = col * (1 - a[..., None]) + np.array(rgb, np.float32) * a[..., None]

    # краска скапливается у бортика оттиска
    pool = np.clip((rad - (R_FILL - 30) * SS) / (30 * SS), 0, 1) * a_fill
    col *= (1 - 0.045 * pool[..., None])
    del pool, a_rule, rad, ang

    # неровность накатки: живой оттиск, а не вектор
    rng = np.random.default_rng(5)
    def noise(n):
        return np.asarray(Image.fromarray((rng.random((n, n)) * 255).astype(np.uint8))
                          .resize((R, R), Image.BICUBIC), np.float32) / 255.0
    alpha = a_out * (0.945 + 0.04 * noise(46) + 0.03 * noise(190))
    alpha = np.clip(alpha, 0, 1)
    del a_out, a_fill

    # выворотка: монограмма и текст по ободу — непропечатанная бумага
    knock = Image.new("L", (R, R), 0)
    render_monogram(knock, c, MONO_CY * SS, MONO_SCALE)
    arc_text(knock, "АКАДЕМИЧЕСКИЙ САЛОН", R_TEXT, 270, True, 29, 7.5)
    span = arc_text(knock, th["label"], R_TEXT, 90, False, 33, 14)
    kd = ImageDraw.Draw(knock)
    for sgn in (-1, 1):                                    # точки-обрамления по ободу
        t = math.radians(90) + sgn * (span / 2 + 0.085)
        px, py = c + R_TEXT * SS * math.cos(t), c + R_TEXT * SS * math.sin(t)
        kd.ellipse([px - 4.5 * SS, py - 4.5 * SS, px + 4.5 * SS, py + 4.5 * SS], fill=255)
    knock = knock.filter(ImageFilter.GaussianBlur(0.55 * SS))   # краска чуть затекает в контрформы
    alpha *= 1 - np.asarray(knock, np.float32) / 255.0
    del knock

    rgba = np.concatenate([np.clip(col, 0, 255), np.clip(alpha, 0, 1)[..., None] * 255], 2)
    return Image.fromarray(rgba.astype(np.uint8), "RGBA")

def halo_sprite(th):
    """Расплыв краски в момент удара."""
    HS = 2
    d = Image.new("L", (S * HS, S * HS), 0)
    ImageDraw.Draw(d).ellipse([(S / 2 - R_OUT) * HS, (S / 2 - R_OUT) * HS,
                               (S / 2 + R_OUT) * HS, (S / 2 + R_OUT) * HS], fill=255)
    b = d.filter(ImageFilter.GaussianBlur(15 * HS))
    out = ImageChops.subtract(b, d).resize((S, S), Image.LANCZOS)
    im = Image.new("RGBA", (S, S), th["ink"] + (0,))
    im.putalpha(out)
    return im

def dot_tile(rad_px):
    MS = 8
    t = Image.new("L", (int(rad_px * 2 * MS) + 8, int(rad_px * 2 * MS) + 8), 0)
    ImageDraw.Draw(t).ellipse([4, 4, t.width - 4, t.height - 4], fill=255)
    return t.resize((int(rad_px * 2) + 1, int(rad_px * 2) + 1), Image.LANCZOS)

# --------------------------------------------------------------- хронометраж
def press(t):
    """0 — покой, 1 — полная осадка. Покой на t=0 и t=DUR ⇒ шов не виден."""
    if 0.60 <= t < 0.72:
        return ((t - 0.60) / 0.12) ** 2
    if 0.72 <= t < 1.60:
        x = (t - 0.72) / 0.88
        return math.cos(2 * math.pi * 0.9 * x) * math.exp(-4.2 * x)
    return 0.0

def bloom(t):
    if 0.66 <= t < 0.72: return (t - 0.66) / 0.06
    if 0.72 <= t < 1.70: return math.exp(-3.1 * (t - 0.72))
    return 0.0

def dot_a(t, i):
    t0 = 1.62 + 0.26 * i
    if t < t0: return 0.0
    if t < t0 + 0.11: return (t - t0) / 0.11
    if t < 3.34: return 1.0
    if t < 3.62: return 1.0 - (t - 3.34) / 0.28
    return 0.0

# --------------------------------------------------------------------- сборка
def build(name, outdir):
    th = THEMES[name]
    os.makedirs(outdir, exist_ok=True)
    paper, seal, halo = paper_bg(), seal_sprite(th), halo_sprite(th)
    tile = dot_tile(DOT_R)
    print(f"  {name}: спрайты готовы, кадры…", flush=True)
    for i in range(NF):
        t = i / FPS
        fr = paper.copy()
        b = bloom(t)
        if b > 0.004:
            sc = 1.0 + 0.055 * (1 - b)
            hs = int(S * sc)
            h = halo.resize((hs, hs), Image.BILINEAR)
            o = (S - hs) // 2
            fr.paste(h, (o, o), h.split()[3].point(lambda v: int(v * b * 0.6)))
        s = 1.0 + 0.011 * press(t)          # под нажимом оттиск расплывается наружу, а не съёживается
        ns = int(round(S * s))
        sl = seal.resize((ns, ns), Image.LANCZOS)
        o = (S - ns) // 2
        fr.paste(sl, (o, o), sl)
        if th["dots"]:
            dm = Image.new("L", (S, S), 0)
            for k in range(3):
                a = dot_a(t, k)
                if a <= 0.004: continue
                sc = 0.62 + 0.38 * min(1.0, a * 1.6)        # проявляется с «нажимом»
                td = tile.resize((max(1, int(tile.width * sc)), max(1, int(tile.height * sc))),
                                 Image.LANCZOS).point(lambda v, a=a: int(v * a))
                px = int(S / 2 + (k - 1) * DOT_GAP - td.width / 2)
                py = int(DOT_CY - td.height / 2)
                dm.paste(ImageChops.lighter(dm.crop((px, py, px + td.width, py + td.height)), td),
                         (px, py))
            fr.paste(paper, (0, 0), dm)                     # выворотка: сквозь краску видна бумага
        fr.save(os.path.join(outdir, f"f{i:04d}.png"))
    print(f"  {name}: {NF} кадров", flush=True)

if __name__ == "__main__":
    for n in (sys.argv[1:] or ["channel", "bot"]):
        build(n, os.path.join(SCR, "frames", n))
