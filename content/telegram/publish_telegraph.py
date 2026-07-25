from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
PRIVATE_DIR = ROOT / "private"
CREDENTIALS = PRIVATE_DIR / "telegraph-account.json"
MANIFEST = ROOT / "telegraph-pages.json"

ARTICLES = (
    ROOT / "articles" / "01-kak-nauchruk-chitaet-rabotu.md",
    ROOT / "articles" / "02-dedlain-sryvaetsya-ne-na-tekste.md",
    ROOT / "articles" / "03-perevodchik-s-nauchrukovskogo.md",
)

ALLOWED_INLINE = re.compile(
    r"(\*\*.+?\*\*|_.+?_|`.+?`|\[[^\]]+\]\(https?://[^)]+\))"
)


def api(method: str, **fields: Any) -> dict[str, Any]:
    encoded: dict[str, str] = {}
    for key, value in fields.items():
        if value is None:
            continue
        encoded[key] = json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else str(value)
    data = urllib.parse.urlencode(encoded).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.telegra.ph/{method}",
        data=data,
        headers={"User-Agent": "Academic-Saloon-Publisher/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not payload.get("ok"):
        raise RuntimeError(f"Telegraph API {method}: {payload.get('error', 'unknown error')}")
    return payload["result"]


def parse_inline(text: str) -> list[Any]:
    result: list[Any] = []
    cursor = 0
    for match in ALLOWED_INLINE.finditer(text):
        if match.start() > cursor:
            result.append(text[cursor:match.start()])
        token = match.group(0)
        if token.startswith("**"):
            result.append({"tag": "strong", "children": [token[2:-2]]})
        elif token.startswith("_"):
            result.append({"tag": "em", "children": [token[1:-1]]})
        elif token.startswith("`"):
            result.append({"tag": "code", "children": [token[1:-1]]})
        else:
            link = re.match(r"\[([^\]]+)\]\((https?://[^)]+)\)", token)
            if link:
                result.append(
                    {
                        "tag": "a",
                        "attrs": {"href": link.group(2)},
                        "children": [link.group(1)],
                    }
                )
            else:
                result.append(token)
        cursor = match.end()
    if cursor < len(text):
        result.append(text[cursor:])
    return result or [""]


def parse_table(lines: list[str]) -> dict[str, Any]:
    rows = []
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        rows.append(cells)
    headers = rows[0]
    items = []
    for cells in rows[2:]:
        parts: list[Any] = []
        for idx, cell in enumerate(cells):
            if idx:
                parts.append(" · ")
            label = headers[idx] if idx < len(headers) else f"Поле {idx + 1}"
            parts.append({"tag": "strong", "children": [f"{label}: "]})
            parts.extend(parse_inline(cell))
        items.append({"tag": "li", "children": parts})
    return {"tag": "ul", "children": items}


def markdown_to_nodes(source: str) -> tuple[str, list[dict[str, Any]]]:
    lines = source.splitlines()
    title = ""
    nodes: list[dict[str, Any]] = []
    paragraph: list[str] = []

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            text = " ".join(part.strip() for part in paragraph).strip()
            if text:
                nodes.append({"tag": "p", "children": parse_inline(text)})
            paragraph = []

    index = 0
    while index < len(lines):
        line = lines[index].rstrip()
        stripped = line.strip()

        if not stripped:
            flush_paragraph()
            index += 1
            continue

        if stripped.startswith("# "):
            flush_paragraph()
            title = stripped[2:].strip()
            index += 1
            continue

        if stripped.startswith("## "):
            flush_paragraph()
            nodes.append({"tag": "h3", "children": parse_inline(stripped[3:].strip())})
            index += 1
            continue

        if stripped.startswith("### "):
            flush_paragraph()
            nodes.append({"tag": "h4", "children": parse_inline(stripped[4:].strip())})
            index += 1
            continue

        if stripped == "---":
            flush_paragraph()
            nodes.append({"tag": "hr"})
            index += 1
            continue

        if stripped.startswith(">"):
            flush_paragraph()
            quote_lines = []
            while index < len(lines) and lines[index].strip().startswith(">"):
                quote_lines.append(lines[index].strip()[1:].strip())
                index += 1
            nodes.append(
                {
                    "tag": "blockquote",
                    "children": parse_inline(" ".join(quote_lines)),
                }
            )
            continue

        if stripped.startswith("|") and index + 1 < len(lines):
            separator = lines[index + 1].strip()
            if separator.startswith("|") and re.search(r"-{3,}", separator):
                flush_paragraph()
                table_lines = [stripped, separator]
                index += 2
                while index < len(lines) and lines[index].strip().startswith("|"):
                    table_lines.append(lines[index].strip())
                    index += 1
                nodes.append(parse_table(table_lines))
                continue

        bullet_match = re.match(r"^[-*]\s+(.+)$", stripped)
        if bullet_match:
            flush_paragraph()
            items = []
            while index < len(lines):
                current = re.match(r"^[-*]\s+(.+)$", lines[index].strip())
                if not current:
                    break
                items.append({"tag": "li", "children": parse_inline(current.group(1))})
                index += 1
            nodes.append({"tag": "ul", "children": items})
            continue

        number_match = re.match(r"^\d+\.\s+(.+)$", stripped)
        if number_match:
            flush_paragraph()
            items = []
            while index < len(lines):
                current = re.match(r"^\d+\.\s+(.+)$", lines[index].strip())
                if not current:
                    break
                items.append({"tag": "li", "children": parse_inline(current.group(1))})
                index += 1
            nodes.append({"tag": "ol", "children": items})
            continue

        paragraph.append(stripped)
        index += 1

    flush_paragraph()
    if not title:
        raise ValueError("Article has no H1 title")
    return title, nodes


def load_or_create_account() -> dict[str, Any]:
    if CREDENTIALS.exists():
        return json.loads(CREDENTIALS.read_text(encoding="utf-8"))

    account = api(
        "createAccount",
        short_name="akademsalon",
        author_name="Академический Салон",
        author_url="https://t.me/akademsalon",
    )
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    CREDENTIALS.write_text(
        json.dumps(account, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.chmod(CREDENTIALS, 0o600)
    return account


def load_manifest() -> dict[str, Any]:
    if not MANIFEST.exists():
        return {"pages": {}}
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def main() -> None:
    account = load_or_create_account()
    access_token = account["access_token"]
    manifest = load_manifest()
    pages = manifest.setdefault("pages", {})

    for source_path in ARTICLES:
        title, content = markdown_to_nodes(source_path.read_text(encoding="utf-8"))
        key = source_path.name
        existing = pages.get(key)

        if existing and existing.get("path"):
            page = api(
                "editPage",
                access_token=access_token,
                path=existing["path"],
                title=title,
                author_name="Академический Салон",
                author_url="https://t.me/akademsalon",
                content=content,
                return_content=False,
            )
        else:
            page = api(
                "createPage",
                access_token=access_token,
                title=title,
                author_name="Академический Салон",
                author_url="https://t.me/akademsalon",
                content=content,
                return_content=False,
            )

        pages[key] = {
            "title": page["title"],
            "path": page["path"],
            "url": page["url"],
            "source": str(source_path.relative_to(ROOT)),
        }

    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    for page in pages.values():
        print(f"{page['title']}\t{page['url']}")


if __name__ == "__main__":
    main()
