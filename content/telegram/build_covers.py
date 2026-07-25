from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont


ROOT = Path(__file__).resolve().parent
VISUALS = ROOT / "visuals"

IVORY = (246, 241, 232)
CHARCOAL = (43, 40, 37)
RUST = (181, 64, 42)
HAIRLINE = (95, 87, 77)

FONT_SANS = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_SERIF = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
FONT_SERIF_REG = "/System/Library/Fonts/Supplemental/Georgia.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size)


def draw_spaced(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str,
                face: ImageFont.FreeTypeFont, fill: tuple[int, int, int],
                spacing: int) -> None:
    x, y = xy
    for char in text:
        draw.text((x, y), char, font=face, fill=fill)
        bbox = draw.textbbox((x, y), char, font=face)
        x += bbox[2] - bbox[0] + spacing


def add_frame(draw: ImageDraw.ImageDraw, width: int, height: int) -> None:
    draw.rectangle((24, 24, width - 25, height - 25), outline=HAIRLINE, width=2)
    draw.rectangle((36, 36, width - 37, height - 37), outline=(173, 163, 151), width=1)


def add_brandline(draw: ImageDraw.ImageDraw) -> None:
    draw_spaced(
        draw,
        (86, 67),
        "АКАДЕМИЧЕСКИЙ САЛОН",
        font(FONT_SANS, 22),
        RUST,
        8,
    )


def build_methodology_cover() -> None:
    src = Image.open(VISUALS / "source-metodichka-stilllife.png").convert("RGB")
    src = ImageEnhance.Color(src).enhance(0.88)
    draw = ImageDraw.Draw(src, "RGBA")
    w, h = src.size

    add_frame(draw, w, h)
    add_brandline(draw)

    draw.line((88, 145, 320, 145), fill=RUST, width=3)
    draw.text((88, 166), "ПРАКТИКУМ МАСТЕРСКОЙ",
              font=font(FONT_SANS, 24), fill=RUST)

    draw.text((84, 246), "МЕТОДИЧКА:", font=font(FONT_SERIF, 70), fill=CHARCOAL)
    draw.text((84, 336), "6 СТРОК, КОТОРЫЕ", font=font(FONT_SERIF, 47), fill=CHARCOAL)
    draw.text((84, 404), "ЭКОНОМЯТ", font=font(FONT_SERIF, 61), fill=CHARCOAL)
    draw.text((84, 480), "6 ДНЕЙ", font=font(FONT_SERIF, 84), fill=RUST)

    draw.text((88, 608), "Не читать целиком.",
              font=font(FONT_SERIF_REG, 29), fill=CHARCOAL)
    draw.text((88, 650), "Найти главное.",
              font=font(FONT_SERIF_REG, 29), fill=CHARCOAL)

    draw_spaced(
        draw,
        (88, h - 96),
        "— ПОЛЕЗНОЕ —",
        font(FONT_SANS, 20),
        RUST,
        6,
    )

    src.save(VISUALS / "cover-metodichka-6-strok.png", quality=95)


def build_seven_minutes_cover() -> None:
    src = Image.open(VISUALS / "source-7-minut-stilllife.png").convert("RGB")
    src = ImageEnhance.Color(src).enhance(0.82)
    draw = ImageDraw.Draw(src, "RGBA")
    w, h = src.size

    draw.rounded_rectangle(
        (52, 52, 765, h - 52),
        radius=18,
        fill=(*IVORY, 232),
        outline=(*HAIRLINE, 190),
        width=2,
    )
    add_frame(draw, w, h)
    add_brandline(draw)

    draw.line((88, 145, 320, 145), fill=RUST, width=3)
    draw.text((88, 166), "СТАТЬЯ МАСТЕРСКОЙ",
              font=font(FONT_SANS, 24), fill=RUST)

    draw.text((84, 246), "КАК НАУЧРУК", font=font(FONT_SERIF, 56), fill=CHARCOAL)
    draw.text((84, 317), "ЧИТАЕТ РАБОТУ", font=font(FONT_SERIF, 48), fill=CHARCOAL)
    draw.text((84, 389), "ЗА ПЕРВЫЕ", font=font(FONT_SERIF, 54), fill=CHARCOAL)
    draw.text((84, 460), "7 МИНУТ", font=font(FONT_SERIF, 82), fill=RUST)

    draw.text((88, 590), "Маршрут взгляда:",
              font=font(FONT_SERIF_REG, 28), fill=CHARCOAL)
    draw.text((88, 631), "от титульника до выводов.",
              font=font(FONT_SERIF_REG, 28), fill=CHARCOAL)

    draw_spaced(
        draw,
        (88, h - 96),
        "— РАЗБОР —",
        font(FONT_SANS, 20),
        RUST,
        6,
    )

    src.save(VISUALS / "cover-kak-chitayut-7-minut.png", quality=95)


if __name__ == "__main__":
    build_methodology_cover()
    build_seven_minutes_cover()
