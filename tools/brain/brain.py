#!/usr/bin/env python3
"""On-demand project memory for Akademsalon. No daemons or third-party packages."""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import html
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
BRAIN = ROOT / "docs" / "brain"
LOCAL = ROOT / ".brain"
DB = LOCAL / "index.sqlite"
CATALOG_PATH = BRAIN / "catalog.json"
REQUIRED = (
    ROOT / "AGENTS.md",
    ROOT / "CLAUDE.md",
    BRAIN / "START-HERE.md",
    BRAIN / "PRODUCT-MAP.md",
    BRAIN / "ROADMAP.md",
    BRAIN / "DECISIONS.md",
    BRAIN / "UX-DEBT.md",
    BRAIN / "QUALITY-GATES.md",
    BRAIN / "MODEL-COUNCIL.md",
    BRAIN / "CURRENT-HANDOFF.md",
)


def run(*command: str) -> str:
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    if result.returncode:
        return f"ERROR: {result.stderr.strip()}"
    return result.stdout.strip()


def catalog() -> dict:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def tracked_files() -> list[Path]:
    cfg = catalog()
    patterns = cfg["index_allowlist"]
    names = run("git", "ls-files").splitlines()
    selected = []
    for name in names:
        if any(fnmatch.fnmatch(name, pattern) for pattern in patterns):
            path = ROOT / name
            if path.is_file() and path.stat().st_size <= 256 * 1024:
                selected.append(path)
    for path in REQUIRED:
        if path.exists() and path not in selected:
            selected.append(path)
    return sorted(selected)


def fingerprint(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in paths:
        digest.update(str(path.relative_to(ROOT)).encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def ensure_local() -> None:
    LOCAL.mkdir(mode=0o700, exist_ok=True)
    try:
        LOCAL.chmod(0o700)
    except OSError:
        pass


def build_index(quiet: bool = False) -> None:
    ensure_local()
    paths = tracked_files()
    fd, temp_name = tempfile.mkstemp(prefix="brain-", suffix=".sqlite", dir=LOCAL)
    os.close(fd)
    temp = Path(temp_name)
    try:
        connection = sqlite3.connect(temp)
        connection.execute("PRAGMA journal_mode=DELETE")
        connection.execute("PRAGMA user_version=1")
        connection.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        connection.execute("CREATE TABLE docs (path TEXT PRIMARY KEY, title TEXT, body TEXT, sha256 TEXT)")
        connection.execute(
            "CREATE VIRTUAL TABLE search USING fts5(path UNINDEXED, title, body, tokenize='unicode61')"
        )
        for path in paths:
            body = path.read_text(encoding="utf-8", errors="replace")
            title_match = re.search(r"^#\s+(.+)$", body, re.MULTILINE)
            title = title_match.group(1).strip() if title_match else path.name
            relative = str(path.relative_to(ROOT))
            digest = hashlib.sha256(body.encode()).hexdigest()
            connection.execute("INSERT INTO docs VALUES (?, ?, ?, ?)", (relative, title, body, digest))
            connection.execute("INSERT INTO search VALUES (?, ?, ?)", (relative, title, body))
        connection.execute("INSERT INTO meta VALUES ('fingerprint', ?)", (fingerprint(paths),))
        connection.execute("INSERT INTO meta VALUES ('head', ?)", (run("git", "rev-parse", "HEAD"),))
        connection.execute(
            "INSERT INTO meta VALUES ('generated_at', ?)",
            (datetime.now(timezone.utc).isoformat(),),
        )
        connection.commit()
        connection.close()
        os.chmod(temp, 0o600)
        os.replace(temp, DB)
    finally:
        if temp.exists():
            temp.unlink()
    if DB.stat().st_size > catalog()["limits"]["database_mb"] * 1024 * 1024:
        raise SystemExit("Index exceeded configured size limit")
    if not quiet:
        print(f"Indexed {len(paths)} canonical files → {DB.relative_to(ROOT)}")


def index_is_current() -> bool:
    if not DB.exists():
        return False
    try:
        connection = sqlite3.connect(DB)
        stored = connection.execute("SELECT value FROM meta WHERE key='fingerprint'").fetchone()[0]
        connection.close()
        return stored == fingerprint(tracked_files())
    except (sqlite3.Error, IndexError, TypeError):
        return False


def ensure_index() -> None:
    if not index_is_current():
        build_index(quiet=True)


def expand_terms(text: str) -> list[str]:
    cfg = catalog()
    words = re.findall(r"[\w-]+", text.lower(), re.UNICODE)
    expanded = set(words)
    for key, aliases in cfg.get("aliases", {}).items():
        family = {key, *aliases}
        if family.intersection(expanded):
            expanded.update(family)
    return sorted(word for word in expanded if len(word) > 1)


def search(query: str, limit: int = 6) -> list[tuple[str, str, str]]:
    ensure_index()
    terms = expand_terms(query)
    if not terms:
        return []
    expression = " OR ".join(f'"{term.replace(chr(34), "")}"' for term in terms)
    connection = sqlite3.connect(DB)
    rows = connection.execute(
        "SELECT path, title, snippet(search, 2, '[', ']', ' … ', 24) "
        "FROM search WHERE search MATCH ? ORDER BY bm25(search) LIMIT ?",
        (expression, limit),
    ).fetchall()
    connection.close()
    return rows


def doctor() -> int:
    missing = [str(path.relative_to(ROOT)) for path in REQUIRED if not path.exists()]
    status = run("git", "status", "--short") or "clean"
    load = os.getloadavg()[0]
    cpu = os.cpu_count() or 1
    pressure = run("memory_pressure", "-Q")
    free_match = re.search(r"free percentage:\s*(\d+)%", pressure, re.IGNORECASE)
    free_percent = int(free_match.group(1)) if free_match else -1
    print("Akademsalon project brain")
    print(f"branch: {run('git', 'branch', '--show-current')}")
    print(f"head:   {run('git', 'rev-parse', '--short=12', 'HEAD')}")
    print(f"dirty:\n{status}")
    memory_label = f"{free_percent}% free" if free_percent >= 0 else "not available"
    print(f"Mac: memory {memory_label}, load {load:.2f}/{cpu}")
    print(f"canonical files: {'MISSING ' + ', '.join(missing) if missing else 'OK'}")
    print(f"search index: {'current' if index_is_current() else 'stale or absent (rebuilt on demand)'}")
    warnings = []
    if 0 <= free_percent < 15:
        warnings.append("memory below 15%: do not start parallel visual runs")
    if load > cpu * 1.5:
        warnings.append("system load is high: finish unnecessary workers before a heavy run")
    if missing:
        warnings.append("project brain is incomplete")
    if warnings:
        print("\nWARNINGS")
        for warning in warnings:
            print(f"- {warning}")
        return 1
    print("\nStatus: ready. No background service was started.")
    return 0


def context(task: str) -> None:
    sections = []
    for name in ("START-HERE.md", "ROADMAP.md", "CURRENT-HANDOFF.md"):
        sections.append((name, (BRAIN / name).read_text(encoding="utf-8")))
    hits = search(task)
    hit_text = "\n".join(f"- `{path}` — {title}: {snippet}" for path, title, snippet in hits)
    header = (
        f"# Context pack\n\nTask: {task}\n"
        f"Branch: {run('git', 'branch', '--show-current')}\n"
        f"HEAD: {run('git', 'rev-parse', '--short=12', 'HEAD')}\n"
        f"Dirty state:\n```\n{run('git', 'status', '--short') or 'clean'}\n```\n"
    )
    body = header + "\n## Relevant index hits\n" + (hit_text or "- none") + "\n"
    budget = catalog()["context_budget_bytes"]
    for name, content in sections:
        addition = f"\n## {name}\n\n{content}\n"
        if len((body + addition).encode("utf-8")) > budget:
            remaining = budget - len(body.encode("utf-8"))
            body += addition.encode("utf-8")[: max(0, remaining)].decode("utf-8", errors="ignore")
            break
        body += addition
    print(body)


def process_report() -> None:
    output = run("ps", "-axo", "pid=,ppid=,%cpu=,%mem=,rss=,etime=,command=")
    candidates = []
    root_text = str(ROOT)
    for line in output.splitlines():
        if root_text in line or ".claude/static-server" in line or "playwright" in line.lower():
            candidates.append(line.strip())
    print("Potential project-related processes (read-only):")
    print("PID PPID CPU% MEM% RSS(KB) ELAPSED COMMAND")
    print("\n".join(candidates) if candidates else "none")
    print("\nNo process was stopped. Browser/Codex/Claude processes are never auto-killed.")


def report() -> None:
    ensure_index()
    output = LOCAL / "report" / "index.html"
    output.parent.mkdir(parents=True, exist_ok=True)
    cards = []
    connection = sqlite3.connect(DB)
    for path, title, body in connection.execute("SELECT path, title, body FROM docs ORDER BY path"):
        summary = re.sub(r"\s+", " ", body).strip()[:220]
        cards.append(
            f"<article><small>{html.escape(path)}</small><h2>{html.escape(title)}</h2>"
            f"<p>{html.escape(summary)}</p></article>"
        )
    connection.close()
    document = f"""<!doctype html><html lang='ru'><meta charset='utf-8'>
<meta name='viewport' content='width=device-width'><title>Akademsalon Project Brain</title>
<style>body{{font:16px system-ui;background:#eee4d5;color:#25221d;max-width:1180px;margin:auto;padding:32px}}h1{{font:42px Georgia}}main{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}}article{{background:#fff9f0;border:1px solid #cbbca6;padding:18px;border-top:4px solid #a63f29}}small{{color:#7a6e60}}h2{{font:24px Georgia}}</style>
<h1>Академический Салон · Project Brain</h1><p>Сгенерировано по запросу, без фонового сервиса.</p><main>{''.join(cards)}</main></html>"""
    output.write_text(document, encoding="utf-8")
    if output.stat().st_size > catalog()["limits"]["report_mb"] * 1024 * 1024:
        output.unlink()
        raise SystemExit("Report exceeded configured size limit")
    print(output)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor")
    sub.add_parser("refresh")
    query_parser = sub.add_parser("query")
    query_parser.add_argument("text")
    context_parser = sub.add_parser("context")
    context_parser.add_argument("--task", required=True)
    sub.add_parser("processes")
    sub.add_parser("report")
    args = parser.parse_args()
    if args.command == "doctor":
        return doctor()
    if args.command == "refresh":
        build_index()
    elif args.command == "query":
        for path, title, snippet in search(args.text, 10):
            print(f"{path}\n  {title}\n  {snippet}")
    elif args.command == "context":
        context(args.task)
    elif args.command == "processes":
        process_report()
    elif args.command == "report":
        report()
    return 0


if __name__ == "__main__":
    sys.exit(main())
