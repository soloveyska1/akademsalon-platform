from __future__ import annotations

import math
import subprocess
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "motion"
OUT_DIR.mkdir(parents=True, exist_ok=True)

MUSIC = ROOT.parent.parent / "media" / "ruslan-reel" / "brand-reel-bed-v5.wav"

W, H, FPS = 720, 1280, 30

SERIF = "/System/Library/Fonts/Supplemental/Georgia.ttf"
SERIF_BOLD = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
SANS = "/System/Library/Fonts/Supplemental/Verdana.ttf"
SANS_BOLD = "/System/Library/Fonts/Supplemental/Verdana Bold.ttf"
MONO = "/System/Library/Fonts/SFNSMono.ttf"

PAPER = (246, 241, 231)
PAPER_2 = (239, 232, 216)
SHEET = (255, 254, 249)
INK = (34, 32, 27)
SOFT = (105, 99, 87)
FAINT = (139, 131, 112)
LINE = (217, 210, 194)
LINE_STRONG = (190, 178, 153)
WAX = (178, 59, 34)
WAX_DEEP = (141, 43, 24)
GREEN = (61, 107, 80)
MARK = (239, 229, 204)


@lru_cache(maxsize=None)
def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size)


def clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def ease(value: float) -> float:
    value = clamp(value)
    return value * value * (3 - 2 * value)


def out_back(value: float) -> float:
    value = clamp(value)
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * (value - 1) ** 3 + c1 * (value - 1) ** 2


def paper_texture(seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    base = np.full((H, W, 3), PAPER, dtype=np.int16)
    base += rng.normal(0, 2.2, (H, W, 1)).astype(np.int16)
    image = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(image, "RGBA")
    for _ in range(150):
        y = int(rng.integers(0, H))
        x = int(rng.integers(0, W - 100))
        length = int(rng.integers(25, 150))
        draw.line((x, y, x + length, y), fill=(*LINE_STRONG, int(rng.integers(3, 10))))
    return image


def rounded(draw: ImageDraw.ImageDraw, box, radius=8, fill=SHEET,
            outline=LINE_STRONG, width=1) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def wrapped(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.FreeTypeFont,
            max_width: int) -> list[str]:
    lines: list[str] = []
    for source in text.split("\n"):
        if not source:
            lines.append("")
            continue
        current = ""
        for word in source.split():
            candidate = f"{current} {word}".strip()
            if not current or draw.textlength(candidate, font=face) <= max_width:
                current = candidate
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
    return lines


def multiline(draw: ImageDraw.ImageDraw, xy, text: str,
              face: ImageFont.FreeTypeFont, fill=INK, max_width=590,
              gap=9, anchor="la") -> int:
    x, y = xy
    for line in wrapped(draw, text, face, max_width):
        draw.text((x, y), line, font=face, fill=fill, anchor=anchor)
        y += face.size + gap
    return y


def brand_header(base: Image.Image, t: float, duration: float, section: str) -> None:
    draw = ImageDraw.Draw(base, "RGBA")
    draw.rectangle((0, 0, W, 78), fill=PAPER)
    draw.line((0, 76, W, 76), fill=LINE, width=1)
    rounded(draw, (30, 22, 66, 58), 4, SHEET, LINE_STRONG)
    draw.text((48, 40), "¶", font=font(SERIF, 25), fill=WAX, anchor="mm")
    draw.text((79, 29), "Академический Салон", font=font(SERIF, 23), fill=INK)
    draw.text((W - 30, 31), section, font=font(MONO, 12), fill=SOFT, anchor="ra")
    progress = clamp(t / duration)
    draw.rectangle((0, 75, int(W * progress), 79), fill=WAX)
    draw.line((30, H - 58, W - 30, H - 58), fill=LINE_STRONG)
    draw.text((30, H - 43), "AKADEMSALON.RU", font=font(MONO, 12), fill=FAINT)
    draw.text((W - 30, H - 43), f"{t:04.1f}", font=font(MONO, 12), fill=FAINT, anchor="ra")


def wax_seal(base: Image.Image, center=(610, 1120), scale=1.0) -> None:
    draw = ImageDraw.Draw(base, "RGBA")
    cx, cy = center
    r = int(48 * scale)
    draw.ellipse((cx - r - 5, cy - r - 5, cx + r + 5, cy + r + 5),
                 fill=(*WAX_DEEP, 55))
    draw.ellipse((cx - r, cy - r, cx + r, cy + r),
                 fill=WAX, outline=WAX_DEEP, width=3)
    draw.ellipse((cx - r + 8, cy - r + 8, cx + r - 8, cy + r - 8),
                 outline=(239, 190, 170), width=1)
    draw.text((cx, cy + 1), "АС", font=font(SERIF, int(30 * scale)),
              fill=SHEET, anchor="mm")


def cloud(draw: ImageDraw.ImageDraw, center, scale=1.0,
          fill=MARK, outline=WAX) -> None:
    cx, cy = center
    s = scale
    circles = [
        (cx - 32 * s, cy - 2 * s, 28 * s),
        (cx - 6 * s, cy - 17 * s, 35 * s),
        (cx + 25 * s, cy - 2 * s, 27 * s),
    ]
    for x, y, r in circles:
        draw.ellipse((x - r, y - r, x + r, y + r), fill=fill, outline=outline, width=2)
    draw.rounded_rectangle(
        (cx - 58 * s, cy - 10 * s, cx + 57 * s, cy + 35 * s),
        radius=int(20 * s), fill=fill, outline=outline, width=2,
    )


def stamp(base: Image.Image, text: str, xy, angle=-5,
          color=WAX, size=22, scale=1.0) -> None:
    sw, sh = int(430 * scale), int(106 * scale)
    layer = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.rounded_rectangle((5, 5, sw - 5, sh - 5), radius=5,
                           outline=(*color, 245), width=4)
    draw.rounded_rectangle((12, 12, sw - 12, sh - 12), radius=3,
                           outline=(*color, 120), width=1)
    draw.text((sw / 2, sh / 2), text, font=font(MONO, size),
              fill=(*color, 245), anchor="mm")
    layer = layer.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    base.alpha_composite(layer, xy)


def enter_y(local: float, start: float, from_y: int, to_y: int,
            duration: float = 0.28) -> int:
    p = out_back((local - start) / duration)
    return int(from_y + (to_y - from_y) * p)


def common_page(base: Image.Image) -> ImageDraw.ImageDraw:
    draw = ImageDraw.Draw(base, "RGBA")
    draw.rectangle((34, 104, W - 34, H - 82), fill=SHEET,
                   outline=INK, width=2)
    draw.rectangle((46, 116, W - 46, H - 94), outline=LINE_STRONG, width=1)
    return draw


def reel_methodology(texture: Image.Image, t: float, duration: float) -> Image.Image:
    base = texture.copy().convert("RGBA")
    brand_header(base, t, duration, "ПРАКТИКУМ · 01")
    draw = common_page(base)

    if t < 3.0:
        y = enter_y(t, 0.0, 720, 230)
        draw.text((66, 156), "МЕТОДИЧКА · ПЕРВАЯ ПОМОЩЬ",
                  font=font(MONO, 14), fill=SOFT)
        multiline(draw, (66, y), "ЭТО НЕ\n40 СТРАНИЦ.", font(SERIF_BOLD, 62),
                  max_width=590, gap=2)
        if t > 1.15:
            p = ease((t - 1.15) / 0.35)
            draw.rectangle((64, 512, 64 + int(565 * p), 520), fill=WAX)
            multiline(draw, (66, 560), "ЭТО 6 СТРОК,\nКОТОРЫЕ РЕШАЮТ ВСЁ.",
                      font(SERIF_BOLD, 40), fill=WAX, max_width=580, gap=4)
        wax_seal(base, (590, 1010), 1.18)

    elif t < 13.1:
        local = t - 3.0
        items = (
            ("01", "ОБЪЁМ", "страницы и приложения"),
            ("02", "СТРУКТУРА", "главы и параграфы"),
            ("03", "ИСТОЧНИКИ", "годы и типы публикаций"),
            ("04", "ОРИГИНАЛЬНОСТЬ", "система и порог"),
            ("05", "СРОКИ", "черновик · правки · финал"),
            ("06", "ОФОРМЛЕНИЕ", "поля · шрифт · ссылки"),
        )
        draw.text((66, 150), "НАЙДИТЕ ШЕСТЬ СТРОК", font=font(MONO, 15), fill=WAX)
        draw.text((66, 188), "до того, как откроете Word",
                  font=font(SERIF, 28), fill=INK)
        for idx, (num, title, note) in enumerate(items):
            start = idx * 1.3
            p = ease((local - start) / 0.25)
            if p <= 0:
                continue
            y = 270 + idx * 126
            x = int(-620 * (1 - p) + 58)
            rounded(draw, (x, y, x + 604, y + 96), 7,
                    PAPER_2 if idx % 2 else SHEET, LINE_STRONG)
            draw.rectangle((x, y, x + 8, y + 96), fill=WAX)
            draw.text((x + 32, y + 24), num, font=font(MONO, 15), fill=WAX)
            draw.text((x + 92, y + 18), title, font=font(SANS_BOLD, 23), fill=INK)
            draw.text((x + 92, y + 55), note, font=font(SANS, 17), fill=SOFT)
            if local > start + 0.38:
                draw.ellipse((x + 547, y + 26, x + 583, y + 62), fill=GREEN)
                draw.text((x + 565, y + 44), "✓", font=font(SANS_BOLD, 18),
                          fill=SHEET, anchor="mm")
        counter = min(6, max(1, int(local / 1.3) + 1))
        draw.text((W - 62, 178), f"{counter} / 6", font=font(MONO, 16),
                  fill=SOFT, anchor="ra")

    elif t < 16.2:
        local = t - 13.1
        draw.text((W / 2, 230), "ПРОПУСТИЛИ ОДНУ?", font=font(MONO, 17),
                  fill=WAX, anchor="ma")
        draw.text((W / 2, 380), "ПОЛУЧИЛИ\nПРАВКУ", font=font(SERIF_BOLD, 67),
                  fill=INK, anchor="ma", align="center", spacing=6)
        stamp(base, "ПЕРЕДЕЛАТЬ", (145, 645), -7, WAX, 27, 0.95)
        cloud(draw, (W / 2, 880), 1.05)
        draw.text((W / 2, 887), "6 строк < 6 дней", font=font(MONO, 18),
                  fill=INK, anchor="mm")
        draw.text((W / 2, 1005), "Сначала требования. Потом текст.",
                  font=font(SERIF, 26), fill=SOFT, anchor="ma")

    else:
        local = t - 16.2
        p = ease(local / 0.35)
        draw.text((W / 2, int(310 - 110 * (1 - p))), "ПРИШЛИТЕ\nМЕТОДИЧКУ",
                  font=font(SERIF_BOLD, 58), fill=INK, anchor="ma",
                  align="center", spacing=5)
        draw.text((W / 2, 535), "Разложим по пунктам до старта.",
                  font=font(SERIF, 27), fill=SOFT, anchor="ma")
        rounded(draw, (96, 666, W - 96, 758), 46, WAX, WAX_DEEP, 2)
        draw.text((W / 2, 712), "@academic_saloon_bot",
                  font=font(MONO, 20), fill=SHEET, anchor="mm")
        draw.text((W / 2, 845), "СОХРАНИТЕ · ПЕРЕШЛИТЕ ОДНОКУРСНИКУ",
                  font=font(MONO, 13), fill=WAX, anchor="ma")
        wax_seal(base, (W / 2, 1030), 1.15)

    return camera(base, t, duration)


def reel_seven_minutes(texture: Image.Image, t: float, duration: float) -> Image.Image:
    base = texture.copy().convert("RGBA")
    brand_header(base, t, duration, "РАЗБОР · 02")
    draw = common_page(base)

    if t < 3.0:
        draw.text((66, 156), "МАРШРУТ ВЗГЛЯДА", font=font(MONO, 15), fill=SOFT)
        size = int(168 + 18 * math.sin(t * 4.2))
        draw.text((W / 2, 390), "7", font=font(SERIF_BOLD, size),
                  fill=WAX, anchor="mm")
        draw.text((W / 2, 540), "МИНУТ", font=font(MONO, 26),
                  fill=INK, anchor="mm")
        draw.text((W / 2, 690), "ХВАТАЕТ, ЧТОБЫ\nНАЙТИ СЛАБОЕ МЕСТО",
                  font=font(SERIF_BOLD, 37), fill=INK,
                  anchor="ma", align="center", spacing=6)
        draw.arc((150, 315, 570, 735), 205, 335,
                 fill=(*LINE_STRONG, 160), width=7)

    elif t < 14.5:
        local = t - 3.0
        stages = (
            ("00:00", "ТИТУЛЬНИК", "кто · что · где"),
            ("00:40", "ОГЛАВЛЕНИЕ", "логика маршрута"),
            ("01:30", "ВВЕДЕНИЕ", "цель ↔ задачи"),
            ("03:00", "ТАБЛИЦЫ", "есть ли свои данные"),
            ("05:10", "ВЫВОДЫ", "ответили ли на задачи"),
            ("06:30", "ИСТОЧНИКИ", "свежесть и оформление"),
        )
        draw.text((66, 150), "КАК ЧИТАЮТ РАБОТУ", font=font(MONO, 15), fill=WAX)
        draw.line((116, 242, 116, 1040), fill=LINE_STRONG, width=4)
        scan_y = 242 + int(798 * ease(local / 10.8))
        draw.line((82, scan_y, W - 70, scan_y), fill=(*WAX, 90), width=3)
        for idx, (timecode, title, note) in enumerate(stages):
            start = idx * 1.68
            p = ease((local - start) / 0.30)
            if p <= 0:
                continue
            y = 245 + idx * 132
            draw.ellipse((94, y - 2, 138, y + 42), fill=GREEN if p > .75 else MARK,
                         outline=WAX, width=2)
            draw.text((116, y + 20), str(idx + 1), font=font(MONO, 14),
                      fill=SHEET if p > .75 else INK, anchor="mm")
            x = int(730 - 540 * p)
            draw.text((x, y - 3), timecode, font=font(MONO, 14), fill=WAX)
            draw.text((x + 102, y - 8), title, font=font(SANS_BOLD, 21), fill=INK)
            draw.text((x + 102, y + 31), note, font=font(SANS, 17), fill=SOFT)
        draw.text((W - 64, 1042), f"{min(7.0, local * .65):04.1f} / 7:00",
                  font=font(MONO, 14), fill=SOFT, anchor="ra")

    elif t < 18.4:
        local = t - 14.5
        draw.text((W / 2, 245), "СИЛЬНАЯ РАБОТА", font=font(SERIF_BOLD, 49),
                  fill=INK, anchor="ma")
        draw.text((W / 2, 350), "МОЖЕТ ВЫГЛЯДЕТЬ", font=font(MONO, 19),
                  fill=SOFT, anchor="ma")
        draw.text((W / 2, 465), "СЛАБОЙ", font=font(SERIF_BOLD, 86),
                  fill=WAX, anchor="ma")
        if local > 1.0:
            stamp(base, "МАРШРУТ НЕ ВИДЕН", (105, 620), -5, WAX, 22, 1.10)
        draw.text((W / 2, 820), "Читатель не обязан искать вашу логику.",
                  font=font(SERIF, 27), fill=INK, anchor="ma")
        draw.text((W / 2, 895), "Её нужно показать.",
                  font=font(SERIF_BOLD, 32), fill=GREEN, anchor="ma")

    else:
        local = t - 18.4
        p = ease(local / 0.35)
        draw.text((W / 2, int(280 - 90 * (1 - p))), "ПОКАЖИТЕ\nСТРУКТУРУ.",
                  font=font(SERIF_BOLD, 61), fill=INK,
                  anchor="ma", align="center", spacing=6)
        draw.text((W / 2, 510), "Потом — детали.",
                  font=font(SERIF, 31), fill=WAX, anchor="ma")
        rounded(draw, (95, 665, W - 95, 755), 44, INK, INK)
        draw.text((W / 2, 710), "полный разбор — в канале",
                  font=font(MONO, 18), fill=SHEET, anchor="mm")
        draw.text((W / 2, 845), "@akademsalon",
                  font=font(MONO, 22), fill=WAX, anchor="ma")
        wax_seal(base, (W / 2, 1030), 1.15)

    return camera(base, t, duration)


def reel_translation(texture: Image.Image, t: float, duration: float) -> Image.Image:
    base = texture.copy().convert("RGBA")
    brand_header(base, t, duration, "ПЕРЕВОДЧИК · 03")
    draw = common_page(base)

    if t < 3.4:
        draw.text((66, 156), "ИЗ КОММЕНТАРИЕВ НАУЧРУКА", font=font(MONO, 14), fill=SOFT)
        draw.text((W / 2, 300), "«СЛАБАЯ", font=font(SERIF_BOLD, 63),
                  fill=INK, anchor="ma")
        draw.text((W / 2, 420), "АНАЛИТИКА»", font=font(SERIF_BOLD, 63),
                  fill=WAX, anchor="ma")
        for idx in range(32):
            x = 88 + idx * 17
            amp = int(12 + 32 * abs(math.sin(t * 8.5 + idx * .65)))
            draw.rounded_rectangle((x, 628 - amp, x + 6, 628 + amp),
                                   radius=3, fill=WAX)
        draw.text((W / 2, 760), "Страшно звучит.\nНо перевод короткий.",
                  font=font(SERIF, 30), fill=SOFT,
                  anchor="ma", align="center", spacing=5)

    elif t < 7.2:
        local = t - 3.4
        draw.text((66, 160), "НЕ ЗНАЧИТ", font=font(MONO, 17), fill=WAX)
        draw.text((W / 2, 350), "«ДОБАВЬТЕ\nЕЩЁ 5 СТРАНИЦ»",
                  font=font(SERIF_BOLD, 52), fill=INK,
                  anchor="ma", align="center", spacing=7)
        if local > .8:
            stamp(base, "НЕ ПОМОЖЕТ", (153, 655), -8, WAX, 26, .96)
        draw.text((W / 2, 875), "Объём ≠ анализ",
                  font=font(MONO, 20), fill=SOFT, anchor="ma")

    elif t < 14.6:
        local = t - 7.2
        draw.text((66, 150), "ЗНАЧИТ", font=font(MONO, 17), fill=GREEN)
        steps = (
            ("01", "СРАВНИТЕ", "план ↔ факт"),
            ("02", "ОБЪЯСНИТЕ", "почему так произошло"),
            ("03", "СДЕЛАЙТЕ ВЫВОД", "что это меняет"),
        )
        for idx, (num, title, note) in enumerate(steps):
            p = ease((local - idx * 1.75) / .32)
            if p <= 0:
                continue
            y = 265 + idx * 235
            x = int(725 - 650 * p)
            rounded(draw, (x, y, x + 570, y + 170), 8,
                    PAPER_2 if idx != 1 else MARK, LINE_STRONG)
            draw.text((x + 34, y + 28), num, font=font(MONO, 15), fill=WAX)
            draw.text((x + 98, y + 26), title, font=font(SANS_BOLD, 26), fill=INK)
            draw.text((x + 98, y + 82), note, font=font(SERIF, 24), fill=SOFT)
            draw.line((x + 98, y + 127, x + 505, y + 127), fill=WAX, width=3)
        draw.text((W / 2, 1010), "ТРИ ДЕЙСТВИЯ. НОЛЬ ВОДЫ.",
                  font=font(MONO, 15), fill=WAX, anchor="ma")

    elif t < 17.5:
        local = t - 14.6
        phrase = "«Показатель вырос на 18%, потому что…»"
        chars = int(len(phrase) * ease(local / 2.2))
        draw.text((66, 160), "ФРАЗА-МОСТ", font=font(MONO, 16), fill=WAX)
        rounded(draw, (64, 270, W - 64, 620), 8, PAPER_2, LINE_STRONG)
        multiline(draw, (94, 330), phrase[:chars], font(SERIF_BOLD, 39),
                  max_width=520, gap=8)
        draw.rectangle((94, 525, 99, 577), fill=WAX)
        draw.text((W / 2, 760), "Сначала факт.\nПотом причина.\nВ конце — вывод.",
                  font=font(SERIF, 31), fill=INK,
                  anchor="ma", align="center", spacing=8)

    else:
        local = t - 17.5
        p = ease(local / .35)
        draw.text((W / 2, int(275 - 100 * (1 - p))), "СОХРАНИТЕ",
                  font=font(SERIF_BOLD, 67), fill=WAX, anchor="ma")
        draw.text((W / 2, 410), "Следующая правка\nбудет понятнее.",
                  font=font(SERIF_BOLD, 39), fill=INK,
                  anchor="ma", align="center", spacing=6)
        rounded(draw, (108, 655, W - 108, 745), 45, GREEN, GREEN)
        draw.text((W / 2, 700), "#полезное@akademsalon",
                  font=font(MONO, 17), fill=SHEET, anchor="mm")
        cloud(draw, (W / 2, 905), 1.05)
        draw.text((W / 2, 912), "понятно", font=font(MONO, 18),
                  fill=INK, anchor="mm")
        wax_seal(base, (W / 2, 1060), 1.05)

    return camera(base, t, duration)


def camera(base: Image.Image, t: float, duration: float) -> Image.Image:
    progress = clamp(t / duration)
    zoom = 1.0 + 0.017 * progress
    new_w, new_h = int(W * zoom), int(H * zoom)
    enlarged = base.resize((new_w, new_h), Image.Resampling.BICUBIC)
    drift = int(5 * math.sin(t * .7))
    left = max(0, min(new_w - W, (new_w - W) // 2 + drift))
    top = max(0, min(new_h - H, (new_h - H) // 2))
    return enlarged.crop((left, top, left + W, top + H)).convert("RGB")


SPECS = (
    ("reel-01-metodichka-6-strok", 20.0, 0.0, reel_methodology, 1101),
    ("reel-02-kak-chitayut-7-minut", 22.0, 18.0, reel_seven_minutes, 1102),
    ("reel-03-perevodchik-nauchruka", 20.0, 38.0, reel_translation, 1103),
)


def render_one(name: str, duration: float, music_offset: float, renderer, seed: int) -> None:
    silent = OUT_DIR / f"{name}-silent.mp4"
    final = OUT_DIR / f"{name}.mp4"
    texture = paper_texture(seed)

    if not silent.exists():
        video_cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-f", "rawvideo", "-pix_fmt", "rgb24",
            "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
            "-an", "-vf", "scale=1080:1920:flags=lanczos",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(silent),
        ]
        process = subprocess.Popen(video_cmd, stdin=subprocess.PIPE)
        assert process.stdin is not None
        for index in range(round(duration * FPS)):
            frame = renderer(texture, index / FPS, duration)
            process.stdin.write(np.asarray(frame, dtype=np.uint8).tobytes())
        process.stdin.close()
        code = process.wait()
        if code:
            raise SystemExit(code)

    fade_out = max(0.0, duration - .9)
    audio_cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-ss", str(music_offset), "-t", str(duration), "-i", str(MUSIC),
        "-i", str(silent),
        "-map", "1:v:0", "-map", "0:a:0",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-filter:a", f"volume=0.72,afade=t=in:st=0:d=0.35,afade=t=out:st={fade_out}:d=0.9",
        "-shortest", "-movflags", "+faststart", str(final),
    ]
    subprocess.run(audio_cmd, check=True)
    silent.unlink()
    print(final)


def main() -> None:
    for spec in SPECS:
        render_one(*spec)


if __name__ == "__main__":
    main()
