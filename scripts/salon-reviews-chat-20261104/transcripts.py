"""Разбор transcripts.txt — расшифровок скриншотов отзывов (формат описан в шапке файла)."""
import re
from pathlib import Path

HEAD = re.compile(r"^== (\d+) (result|speed|care) \| (.+)$")
MSG = re.compile(r"^> ([cm])(?: (\d{1,2}:\d{2}))?(?: (.*))?$")
WORK_TYPES = {
    "thesis": "ВКР / дипломная",
    "coursework": "Курсовая работа",
    "practice": "Отчёт по практике",
    "research": "Научно-практическая работа",
    "independent": "Самостоятельная работа",
}


def parse(path):
    """Отзывы в порядке файла: {номер: {id, topic, caption, items, ext}}."""
    reviews, cur, att, quote = {}, None, None, None
    for n, raw in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        line = raw.rstrip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("== "):
            assert att is None and quote is None, f"строка {n}: вложение без сообщения"
            m = HEAD.match(line)
            assert m, f"строка {n}: заголовок «== NN тема | подпись»"
            cur = {"id": int(m[1]), "topic": m[2], "caption": m[3], "items": [], "ext": None, "work_types": []}
            assert cur["id"] not in reviews, f"строка {n}: отзыв {cur['id']} уже есть"
            reviews[cur["id"]] = cur
            continue
        assert cur is not None, f"строка {n}: нет заголовка отзыва"
        if line.startswith(("@ ", "! ")):
            assert att is None and quote is None, f"строка {n}: вложение без сообщения"
        if line.startswith("+ "):
            kinds = line[2:].split()
            if (cur["items"] or cur["ext"] or cur["work_types"] or att or quote or not kinds
                    or len(set(kinds)) != len(kinds) or not set(kinds) <= WORK_TYPES.keys()):
                raise ValueError(f"строка {n}: неверная метка вида работы")
            cur["work_types"] = kinds
        elif line.startswith("~ "):
            assert not cur["items"] and "summary" not in cur, f"строка {n}: итог должен следовать за заголовком"
            cur["summary"] = line[2:]
        elif line.startswith("@ "):
            cur["items"].append({"kind": "day", "text": line[2:]})
        elif line.startswith("! "):
            rating, who, date, service = [p.strip() for p in line[2:].split(" · ")]
            cur["ext"] = {"rating": float(rating), "who": who, "date": date, "service": service}
        elif line.startswith("% "):
            kind, _, label = line[2:].partition(" ")
            assert kind in {"file", "voice", "doc", "photo", "image", "sticker"}, f"строка {n}: {kind}"
            att = {"kind": kind, "label": label}
        elif line.startswith("^ "):
            quote = line[2:]
        elif line.startswith("> "):
            m = MSG.match(line)
            assert m, f"строка {n}: не разобрано сообщение"
            cur["items"].append({"kind": "msg", "from": m[1], "time": m[2], "text": m[3] or "",
                                 "att": att, "quote": quote})
            att = quote = None
        else:
            raise ValueError(f"строка {n}: {line[:40]}")
    assert att is None and quote is None, "вложение без сообщения в конце файла"
    return reviews
