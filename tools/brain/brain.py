#!/usr/bin/env python3
"""On-demand project memory for Akademsalon. No daemons or third-party packages."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import fnmatch
import hashlib
import html
import json
import os
from pathlib import Path, PurePosixPath
import re
import sqlite3
import stat
import subprocess
import sys
import tempfile
import unicodedata
import uuid
from typing import Any, Iterable, Sequence


ROOT = Path(__file__).resolve().parents[2]

ENTITY_RE = re.compile(
    r"(?<![A-Z0-9-])(?:"
    r"(?:OUT|JRN|SUR)-[0-9]{3}|"
    r"(?:DEC|UXD|E|REL)-[0-9]{4}|"
    r"G(?:10|[0-9])"
    r")(?![A-Z0-9-])"
)
RECORD_DEFINITION_RE = re.compile(
    r"^(?:#{1,6}\s+|\|\s*`?)(?:"
    r"(?:OUT|JRN|SUR)-[0-9]{3}|"
    r"(?:DEC|UXD|E|REL)-[0-9]{4}|"
    r"G(?:10|[0-9])"
    r")(?![A-Z0-9-])",
    re.MULTILINE,
)
WORKSTREAM_RE = re.compile(r"^WS-[0-9a-f]{32}$")
SHA_RE = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
PROOF_ID_RE = re.compile(r"^[a-z][a-z0-9-]{1,31}:[a-z][a-z0-9-]{1,47}$")
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x1b]")
GLOB_RE = re.compile(r"[*?\[\]{}]")

PRIVACY_PATTERNS = (
    ("PRIVATE_KEY", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("BEARER_TOKEN", re.compile(r"\bBearer\s+[A-Za-z0-9._-]{20,}")),
    ("OPENAI_KEY", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}")),
    ("TELEGRAM_BOT_TOKEN", re.compile(r"\b[0-9]{7,12}:[A-Za-z0-9_-]{30,}")),
    ("OAUTH_CODE", re.compile(r"[?&]code=[A-Za-z0-9._~-]{16,}")),
)

MANIFEST_FIELDS_V1 = {
    "schema_version",
    "workstream_id",
    "slug",
    "status",
    "branch",
    "base_sha",
    "outcome_ids",
    "write_owner",
    "scope",
    "semantic_scope",
    "proof_command_ids",
    "manifest_revision",
    "base_manifest_hash",
}
MANIFEST_FIELDS_V2 = MANIFEST_FIELDS_V1 | {"result_sha"}
MANIFEST_STATUSES = {"active", "paused", "submitted", "integrated", "abandoned"}
MANIFEST_TRANSITIONS = {
    "active": {"paused", "submitted", "abandoned"},
    "paused": {"active", "submitted", "abandoned"},
    "submitted": {"active", "integrated", "abandoned"},
    "integrated": set(),
    "abandoned": set(),
}


def sanitize_display(value: object, limit: int = 500) -> str:
    text = CONTROL_RE.sub("", str(value)).replace("\r", " ").replace("\n", " ")
    return text[:limit]


class BrainFailure(RuntimeError):
    """Stable, redacted domain/operational failure."""

    def __init__(self, code: str, detail: str = "", exit_code: int = 2):
        self.code = code
        self.detail = sanitize_display(detail)
        self.exit_code = exit_code
        super().__init__(f"{code}: {self.detail}" if self.detail else code)


@dataclass(frozen=True)
class Record:
    id: str
    kind: str
    title: str
    path: str
    line_start: int
    line_end: int
    body: str
    body_sha256: str
    references: tuple[str, ...] = ()


@dataclass(frozen=True)
class Snapshot:
    paths: tuple[Path, ...]
    docs: dict[str, str]
    records: dict[str, Record]
    links: tuple[tuple[str, str], ...]
    manifests: tuple[dict[str, Any], ...] = ()


@dataclass(frozen=True)
class ContextChunk:
    id: str
    body: str
    mandatory: bool
    rank: tuple[int, int, str]


def _run_process(
    argv: Sequence[str],
    cwd: Path,
    *,
    timeout: float = 15,
    check: bool = True,
    text: bool = True,
) -> subprocess.CompletedProcess:
    process_env = None
    if argv and argv[0] == "git":
        process_env = {**os.environ, "GIT_OPTIONAL_LOCKS": "0"}
    try:
        result = subprocess.run(
            list(argv),
            cwd=cwd,
            capture_output=True,
            text=text,
            check=False,
            timeout=timeout,
            shell=False,
            env=process_env,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise BrainFailure("COMMAND_FAILED", argv[0]) from error
    if check and result.returncode:
        label = " ".join(argv[:3])
        raise BrainFailure("COMMAND_FAILED", label)
    return result


def _pairs_without_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise BrainFailure("JSON_DUPLICATE_KEY", "duplicate key")
        result[key] = value
    return result


def _reject_json_constant(_value: str) -> None:
    raise BrainFailure("JSON_CONSTANT", "non-finite number")


def _json_depth(value: Any, depth: int = 0) -> int:
    if depth > 24:
        raise BrainFailure("JSON_DEPTH", "nested input exceeds 24 levels")
    if isinstance(value, dict):
        for child in value.values():
            _json_depth(child, depth + 1)
    elif isinstance(value, list):
        for child in value:
            _json_depth(child, depth + 1)
    return depth


def normalize_repo_path(value: str) -> str:
    if not isinstance(value, str) or not value:
        raise BrainFailure("PATH_UNSAFE", "path must be a non-empty string")
    if CONTROL_RE.search(value) or "\\" in value or GLOB_RE.search(value):
        raise BrainFailure("PATH_UNSAFE", "path contains forbidden characters")
    if unicodedata.normalize("NFC", value) != value:
        raise BrainFailure("PATH_NONCANONICAL", "path must use NFC")
    pure = PurePosixPath(value)
    if pure.is_absolute() or str(pure) in {"", "."}:
        raise BrainFailure("PATH_UNSAFE", "path must be repository-relative")
    if any(part in {"", ".", "..", ".git", ".brain"} for part in pure.parts):
        raise BrainFailure("PATH_UNSAFE", "path escapes protected roots")
    if value.endswith("/"):
        raise BrainFailure("PATH_NONCANONICAL", "trailing slash is not allowed")
    return str(pure)


def _path_key(value: str) -> str:
    return unicodedata.normalize("NFC", value).casefold()


def path_scopes_overlap(left: dict[str, str], right: dict[str, str]) -> bool:
    left_path = _path_key(normalize_repo_path(left["path"]))
    right_path = _path_key(normalize_repo_path(right["path"]))
    left_match = left.get("match")
    right_match = right.get("match")
    if left_match not in {"exact", "tree"} or right_match not in {"exact", "tree"}:
        raise BrainFailure("SCOPE_MATCH", "match must be exact or tree")
    if left_match == right_match == "exact":
        return left_path == right_path
    if left_match == "tree" and right_match == "exact":
        return right_path == left_path or right_path.startswith(left_path + "/")
    if left_match == "exact" and right_match == "tree":
        return left_path == right_path or left_path.startswith(right_path + "/")
    return (
        left_path == right_path
        or left_path.startswith(right_path + "/")
        or right_path.startswith(left_path + "/")
    )


def _route_parts(key: str, namespace: str) -> tuple[str, tuple[str, ...]] | None:
    match = re.fullmatch(rf"{re.escape(namespace)}:([A-Z]+):(/[^?#]*)", key)
    if not match:
        return None
    method, route = match.groups()
    if "//" in route or "/./" in route or "/../" in route:
        return None
    segments = tuple(segment for segment in route.split("/") if segment)
    if any(not re.fullmatch(r"(?:[a-z0-9._-]+|\{[a-z][a-z0-9_]*\})", segment) for segment in segments):
        return None
    return method, segments


def semantic_keys_overlap(
    left: str,
    right: str,
    semantic_namespaces: dict[str, str],
) -> bool:
    left_ns = left.split(":", 1)[0]
    right_ns = right.split(":", 1)[0]
    if left_ns != right_ns:
        return False
    match_mode = semantic_namespaces.get(left_ns)
    if match_mode not in {"exact", "prefix", "route"}:
        raise BrainFailure("SEMANTIC_NAMESPACE", left_ns)
    if match_mode == "route":
        left_route = _route_parts(left, left_ns)
        right_route = _route_parts(right, right_ns)
        if not left_route or not right_route or left_route[0] != right_route[0]:
            return False
        if len(left_route[1]) != len(right_route[1]):
            return False
        return all(
            a == b or (a.startswith("{") and b.endswith("}")) or (b.startswith("{") and a.endswith("}"))
            for a, b in zip(left_route[1], right_route[1])
        )
    if match_mode == "prefix":
        a = left.casefold()
        b = right.casefold()
        return a == b or a.startswith(b + "/") or b.startswith(a + "/")
    return left.casefold() == right.casefold()


def compare_manifests(
    left: dict[str, Any],
    right: dict[str, Any],
    semantic_namespaces: dict[str, str],
) -> list[dict[str, str]]:
    conflicts: list[dict[str, str]] = []
    left_scope = left.get("scope", {})
    right_scope = right.get("scope", {})
    for left_mode, right_mode, code in (
        ("write", "write", "PATH_WRITE_WRITE"),
        ("write", "read", "PATH_WRITE_READ"),
        ("read", "write", "PATH_WRITE_READ"),
    ):
        for left_item in left_scope.get(left_mode, []):
            for right_item in right_scope.get(right_mode, []):
                if path_scopes_overlap(left_item, right_item):
                    conflicts.append(
                        {
                            "code": code,
                            "left": left_item["path"],
                            "right": right_item["path"],
                        }
                    )
    for left_item in left.get("semantic_scope", []):
        for right_item in right.get("semantic_scope", []):
            if "write" not in {left_item.get("access"), right_item.get("access")}:
                continue
            if semantic_keys_overlap(
                left_item.get("key", ""),
                right_item.get("key", ""),
                semantic_namespaces,
            ):
                conflicts.append(
                    {
                        "code": "SEMANTIC_WRITE",
                        "left": left_item["key"],
                        "right": right_item["key"],
                    }
                )
    unique = {(item["code"], item["left"], item["right"]): item for item in conflicts}
    return [unique[key] for key in sorted(unique)]


class BrainProject:
    def __init__(self, root: Path = ROOT):
        self.root = Path(root).absolute()
        self.brain = self.root / "docs" / "brain"
        self.local = self.root / ".brain"
        self.db = self.local / "index.sqlite"
        self.catalog_path = self.brain / "catalog.json"
        self.required = tuple(
            self.root / path
            for path in (
                "AGENTS.md",
                "CLAUDE.md",
                "docs/brain/START-HERE.md",
                "docs/brain/PRODUCT-MAP.md",
                "docs/brain/ROADMAP.md",
                "docs/brain/DECISIONS.md",
                "docs/brain/UX-DEBT.md",
                "docs/brain/QUALITY-GATES.md",
                "docs/brain/MODEL-COUNCIL.md",
                "docs/brain/CURRENT-HANDOFF.md",
            )
        )

    def git(self, *args: str, check: bool = True, text: bool = True) -> subprocess.CompletedProcess:
        return _run_process(["git", "--no-pager", *args], self.root, check=check, text=text)

    def _relative(self, path: Path) -> str:
        try:
            return str(path.relative_to(self.root)).replace(os.sep, "/")
        except ValueError as error:
            raise BrainFailure("PATH_OUTSIDE_ROOT", "path is outside repository") from error

    def secure_read_bytes(self, path: Path, max_bytes: int = 256 * 1024) -> bytes:
        path = Path(path).absolute()
        relative = self._relative(path)
        current = self.root
        for part in PurePosixPath(relative).parts:
            current = current / part
            try:
                metadata = os.lstat(current)
            except OSError as error:
                raise BrainFailure("FILE_MISSING", relative) from error
            if stat.S_ISLNK(metadata.st_mode):
                raise BrainFailure("SYMLINK_PATH", relative)
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        try:
            descriptor = os.open(path, flags)
        except OSError as error:
            raise BrainFailure("FILE_OPEN", relative) from error
        try:
            metadata = os.fstat(descriptor)
            if not stat.S_ISREG(metadata.st_mode):
                raise BrainFailure("FILE_TYPE", relative)
            if metadata.st_size > max_bytes:
                raise BrainFailure("FILE_SIZE", relative)
            chunks: list[bytes] = []
            remaining = max_bytes + 1
            while remaining > 0:
                chunk = os.read(descriptor, min(65536, remaining))
                if not chunk:
                    break
                chunks.append(chunk)
                remaining -= len(chunk)
            body = b"".join(chunks)
            if len(body) > max_bytes:
                raise BrainFailure("FILE_SIZE", relative)
            return body
        finally:
            os.close(descriptor)

    def secure_read_text(self, path: Path, max_bytes: int = 256 * 1024) -> str:
        raw = self.secure_read_bytes(path, max_bytes=max_bytes)
        try:
            return raw.decode("utf-8", errors="strict")
        except UnicodeDecodeError as error:
            raise BrainFailure("INVALID_UTF8", self._relative(path)) from error

    def strict_json(self, path: Path, max_bytes: int = 128 * 1024) -> dict[str, Any]:
        text = self.secure_read_text(path, max_bytes=max_bytes)
        return self.strict_json_text(text, self._relative(path), max_bytes=max_bytes)

    def strict_json_text(
        self,
        text: str,
        subject: str,
        max_bytes: int = 128 * 1024,
    ) -> dict[str, Any]:
        if len(text.encode("utf-8")) > max_bytes:
            raise BrainFailure("FILE_SIZE", subject)
        try:
            value = json.loads(
                text,
                object_pairs_hook=_pairs_without_duplicates,
                parse_constant=_reject_json_constant,
            )
        except BrainFailure:
            raise
        except (json.JSONDecodeError, TypeError, ValueError) as error:
            raise BrainFailure("JSON_INVALID", subject) from error
        if not isinstance(value, dict):
            raise BrainFailure("JSON_OBJECT", subject)
        _json_depth(value)
        return value

    def catalog(self) -> dict[str, Any]:
        value = self.strict_json(self.catalog_path)
        required = {
            "schema_version",
            "record_schema_version",
            "source_of_truth",
            "derived_state",
            "canonical_ref",
            "workstream_policy",
            "context_budget_bytes",
            "index_allowlist",
            "aliases",
            "limits",
        }
        missing = sorted(required - value.keys())
        if missing:
            raise BrainFailure("CATALOG_FIELD", ",".join(missing))
        if value.get("schema_version") != 1 or value.get("source_of_truth") != "docs/brain":
            raise BrainFailure("CATALOG_SCHEMA", "unsupported catalog")
        if value.get("record_schema_version") != 1:
            raise BrainFailure("RECORD_SCHEMA", "unsupported Markdown record schema")
        if value.get("derived_state") != ".brain":
            raise BrainFailure("CATALOG_DERIVED", "derived state must be .brain")
        budget = value.get("context_budget_bytes")
        if not isinstance(budget, int) or not 1024 <= budget <= 1024 * 1024:
            raise BrainFailure("CATALOG_BUDGET", "context budget out of range")
        patterns = value.get("index_allowlist")
        if not isinstance(patterns, list) or not patterns:
            raise BrainFailure("CATALOG_ALLOWLIST", "index_allowlist must be non-empty")
        for pattern in patterns:
            if not isinstance(pattern, str) or not pattern or "\\" in pattern or CONTROL_RE.search(pattern):
                raise BrainFailure("CATALOG_PATTERN", "unsafe index pattern")
            if pattern.startswith("/") or any(part == ".." for part in PurePosixPath(pattern).parts):
                raise BrainFailure("CATALOG_PATTERN", "unsafe index pattern")
            if pattern.startswith(".brain") or pattern.startswith(".git"):
                raise BrainFailure("CATALOG_PATTERN", "derived/private roots cannot be indexed")
        return value

    def tracked_files(self, cfg: dict[str, Any] | None = None) -> list[Path]:
        cfg = cfg or self.catalog()
        result = self.git(
            "ls-files",
            "-z",
            "--cached",
            "--others",
            "--exclude-standard",
            text=False,
        )
        try:
            names = [item.decode("utf-8", errors="strict") for item in result.stdout.split(b"\0") if item]
        except UnicodeDecodeError as error:
            raise BrainFailure("GIT_PATH_UTF8", "tracked path is not UTF-8") from error
        patterns = cfg["index_allowlist"]
        selected: list[Path] = []
        for name in names:
            if any(fnmatch.fnmatchcase(name, pattern) for pattern in patterns):
                selected.append(self.root / name)
        for path in self.required:
            if path not in selected:
                selected.append(path)
        unique = {self._relative(path): path for path in selected}
        paths = [unique[name] for name in sorted(unique)]
        for path in paths:
            self.secure_read_bytes(path)
        return paths

    def _privacy_check(self, relative: str, body: str) -> None:
        if not relative.startswith("docs/brain/"):
            return
        for code, pattern in PRIVACY_PATTERNS:
            if pattern.search(body):
                raise BrainFailure("PRIVACY_SIGNATURE", f"{code} in {relative}")

    @staticmethod
    def _heading_end(lines: list[str], start: int, level: int) -> int:
        for index in range(start + 1, len(lines)):
            match = re.match(r"^(#{1,6})\s+", lines[index])
            if match and len(match.group(1)) <= level:
                return index
        return len(lines)

    @staticmethod
    def _record_title(line: str, record_id: str) -> str:
        if record_id not in line:
            return line.strip(" `#|—-:\t") or record_id
        tail = line.split(record_id, 1)[1].strip(" `#|—-:\t")
        return tail or record_id

    def _parse_roadmap(self, relative: str, body: str) -> list[Record]:
        lines = body.splitlines()
        records: list[Record] = []
        now_start = next((i for i, line in enumerate(lines) if re.match(r"^##\s+NOW\s*$", line)), -1)
        now_end = len(lines)
        if now_start >= 0:
            now_end = next(
                (i for i in range(now_start + 1, len(lines)) if re.match(r"^##\s+", lines[i])),
                len(lines),
            )
        now_ids: list[str] = []
        for index, line in enumerate(lines):
            heading = re.match(r"^(#{1,6})\s+(OUT-[0-9]{3})(?![0-9-])", line)
            compact = re.match(r"^-\s+`(OUT-[0-9]{3})`\s+—\s+(.+)$", line)
            if heading:
                level = len(heading.group(1))
                record_id = heading.group(2)
                end = self._heading_end(lines, index, level)
                block = "\n".join(lines[index:end]).rstrip() + "\n"
                if now_start < index < now_end:
                    now_ids.append(record_id)
                    for label in ("Почему", "Результат", "Связи", "Метрика", "Proof"):
                        if not re.search(rf"^-\s+{label}[^:]*:\s*\S", block, re.MULTILINE | re.IGNORECASE):
                            raise BrainFailure("OUTCOME_FIELD", f"{record_id}:{label}")
                records.append(self._make_record(record_id, "outcome", relative, index, end, block, line))
            elif compact:
                record_id = compact.group(1)
                block = line + "\n"
                records.append(self._make_record(record_id, "outcome", relative, index, index + 1, block, line))
        if len(now_ids) > 3:
            raise BrainFailure("NOW_LIMIT", "more than three NOW outcomes")
        return records

    def _parse_table(self, relative: str, body: str, prefixes: tuple[str, ...]) -> list[Record]:
        lines = body.splitlines()
        records: list[Record] = []
        prefix_expression = "|".join(re.escape(prefix) for prefix in prefixes)
        row_re = re.compile(
            rf"^\|\s*`?((?:{prefix_expression})-(?:[0-9]{{3,4}})|G(?:10|[0-9]))`?(?:\s+[^|]*)?\|"
        )
        for index, line in enumerate(lines):
            match = row_re.match(line)
            if not match:
                continue
            record_id = match.group(1)
            heading_index = next(
                (i for i in range(index - 1, -1, -1) if re.match(r"^#{1,3}\s+", lines[i])),
                0,
            )
            table_header = next(
                (i for i in range(heading_index + 1, index) if lines[i].startswith("|")),
                -1,
            )
            table_separator = next(
                (
                    i
                    for i in range(table_header + 1, index)
                    if re.match(r"^\|(?:\s*:?-{3,}:?\s*\|)+\s*$", lines[i])
                ),
                -1,
            )
            block_lines = [lines[heading_index]]
            if table_header >= 0:
                block_lines.append(lines[table_header])
            if table_separator >= 0:
                block_lines.append(lines[table_separator])
            block_lines.append(line)
            block = "\n".join(block_lines).rstrip() + "\n"
            kind = {
                "SUR": "surface",
                "JRN": "journey",
                "DEC": "decision",
                "UXD": "debt",
                "G": "gate",
            }[record_id.split("-", 1)[0] if "-" in record_id else "G"]
            cells = [cell.strip().strip("`") for cell in line.strip().strip("|").split("|")]
            if kind == "decision" and len(cells) > 1 and cells[1] not in {"accepted", "proposed", "superseded"}:
                raise BrainFailure("DECISION_STATUS", record_id)
            if kind == "debt" and len(cells) > 2 and cells[2] not in {
                "open", "planned", "fixed-unverified", "verified", "waived"
            }:
                raise BrainFailure("DEBT_STATUS", record_id)
            title = cells[1] if len(cells) > 1 else record_id
            records.append(
                self._make_record(record_id, kind, relative, index, index + 1, block, title)
            )
        return records

    def _parse_file_record(self, relative: str, body: str, prefix: str, kind: str) -> list[Record]:
        filename = Path(relative).stem
        expected = re.fullmatch(rf"{prefix}-[0-9]{{4}}", filename)
        first_line = body.splitlines()[0] if body.splitlines() else ""
        heading = re.match(rf"^#\s+({prefix}-[0-9]{{4}})(?![0-9-])", first_line)
        if not expected or not heading or expected.group(0) != heading.group(1):
            raise BrainFailure("RECORD_FILENAME", relative)
        record_id = heading.group(1)
        if kind == "evidence" and re.search(r"source_type\s*:\s*model-review", body, re.IGNORECASE):
            if re.search(r"(?:closes_gate|gate_status)\s*:\s*(?:G(?:10|[0-9])|closed|pass)", body, re.IGNORECASE):
                raise BrainFailure("MODEL_REVIEW_GATE", relative)
        return [
            self._make_record(
                record_id,
                kind,
                relative,
                0,
                len(body.splitlines()),
                body.rstrip() + "\n",
                first_line,
            )
        ]

    def _make_record(
        self,
        record_id: str,
        kind: str,
        relative: str,
        start: int,
        end: int,
        block: str,
        title_line: str,
    ) -> Record:
        references = tuple(sorted({item for item in ENTITY_RE.findall(block) if item != record_id}))
        return Record(
            id=record_id,
            kind=kind,
            title=self._record_title(title_line, record_id),
            path=relative,
            line_start=start + 1,
            line_end=max(start + 1, end),
            body=block,
            body_sha256=hashlib.sha256(block.encode("utf-8")).hexdigest(),
            references=references,
        )

    def _records(self, docs: dict[str, str]) -> tuple[dict[str, Record], tuple[tuple[str, str], ...]]:
        found: list[Record] = []
        for relative, body in sorted(docs.items()):
            is_record_owner = relative in {
                "docs/brain/ROADMAP.md",
                "docs/brain/PRODUCT-MAP.md",
                "docs/brain/DECISIONS.md",
                "docs/brain/UX-DEBT.md",
                "docs/brain/QUALITY-GATES.md",
            } or (
                relative.startswith("docs/brain/evidence/")
                or relative.startswith("docs/brain/releases/")
            )
            if not is_record_owner and RECORD_DEFINITION_RE.search(body):
                raise BrainFailure("RECORD_SOURCE_UNPARSED", relative)
            if relative == "docs/brain/ROADMAP.md":
                found.extend(self._parse_roadmap(relative, body))
            elif relative == "docs/brain/PRODUCT-MAP.md":
                found.extend(self._parse_table(relative, body, ("SUR", "JRN")))
            elif relative == "docs/brain/DECISIONS.md":
                found.extend(self._parse_table(relative, body, ("DEC",)))
            elif relative == "docs/brain/UX-DEBT.md":
                found.extend(self._parse_table(relative, body, ("UXD",)))
            elif relative == "docs/brain/QUALITY-GATES.md":
                found.extend(self._parse_table(relative, body, ("G",)))
            elif relative.startswith("docs/brain/evidence/") and relative.endswith(".md"):
                found.extend(self._parse_file_record(relative, body, "E", "evidence"))
            elif relative.startswith("docs/brain/releases/") and relative.endswith(".md"):
                found.extend(self._parse_file_record(relative, body, "REL", "release"))
        records: dict[str, Record] = {}
        for record in found:
            if record.id in records:
                raise BrainFailure("DUPLICATE_ID", record.id)
            records[record.id] = record
        links: set[tuple[str, str]] = set()
        for record in records.values():
            for reference in record.references:
                if reference not in records:
                    raise BrainFailure("DANGLING_ID", f"{record.id}->{reference}")
                links.add((record.id, reference))
        return records, tuple(sorted(links))

    def _policy(self, cfg: dict[str, Any] | None = None) -> dict[str, Any]:
        cfg = cfg or self.catalog()
        relative = cfg["workstream_policy"]
        relative = normalize_repo_path(relative)
        policy_path = self.root / relative
        if not policy_path.exists():
            raise BrainFailure("POLICY_MISSING", relative)
        policy = self.strict_json(policy_path)
        allowed = {"schema_version", "canonical_ref", "proof_command_ids", "semantic_namespaces"}
        if set(policy) - allowed or policy.get("schema_version") != 1:
            raise BrainFailure("POLICY_SCHEMA", relative)
        canonical_ref = policy.get("canonical_ref")
        if (
            not isinstance(canonical_ref, str)
            or not canonical_ref
            or CONTROL_RE.search(canonical_ref)
            or canonical_ref.startswith("-")
            or not re.fullmatch(r"(?:refs/heads/|origin/)[A-Za-z0-9._/-]+", canonical_ref)
            or ".." in canonical_ref
            or "//" in canonical_ref
        ):
            raise BrainFailure("POLICY_CANONICAL_REF", relative)
        if canonical_ref != cfg["canonical_ref"]:
            raise BrainFailure("POLICY_CANONICAL_REF", "catalog mismatch")
        proof_ids = policy.get("proof_command_ids")
        if (
            not isinstance(proof_ids, list)
            or len(set(proof_ids)) != len(proof_ids)
            or not all(isinstance(item, str) and PROOF_ID_RE.fullmatch(item) for item in proof_ids)
        ):
            raise BrainFailure("POLICY_PROOF_IDS", relative)
        namespaces = policy.get("semantic_namespaces")
        if not isinstance(namespaces, dict) or not namespaces:
            raise BrainFailure("POLICY_NAMESPACES", relative)
        for namespace, match_mode in namespaces.items():
            if not re.fullmatch(r"[a-z][a-z0-9-]{1,31}", namespace) or match_mode not in {
                "exact", "prefix", "route"
            }:
                raise BrainFailure("POLICY_NAMESPACES", relative)
        if namespaces.get("api-route") not in {None, "route"}:
            raise BrainFailure("POLICY_NAMESPACES", "api-route must use route")
        return policy

    def _validate_semantic_key(self, key: str, policy: dict[str, Any]) -> None:
        if not isinstance(key, str) or CONTROL_RE.search(key) or len(key) > 180:
            raise BrainFailure("SEMANTIC_KEY", "invalid semantic key")
        if ":" not in key or not key.split(":", 1)[1]:
            raise BrainFailure("SEMANTIC_KEY", "semantic key requires namespace and value")
        namespace = key.split(":", 1)[0]
        namespaces = policy.get("semantic_namespaces", {})
        if namespace not in namespaces:
            raise BrainFailure("SEMANTIC_NAMESPACE", namespace)
        match_mode = namespaces[namespace]
        if match_mode == "route" and _route_parts(key, namespace) is None:
            raise BrainFailure("SEMANTIC_KEY", "invalid api route")
        if namespace == "production" and key not in {
            "production:deploy",
            "production:database-schema",
            "production:oauth",
            "production:bot-routing",
            "production:notification-routing",
            "production:cleanup",
        }:
            raise BrainFailure("SEMANTIC_KEY", "invalid production resource")
        if namespace == "brain-command" and not re.fullmatch(r"brain-command:[a-z][a-z0-9-]*", key):
            raise BrainFailure("SEMANTIC_KEY", "invalid brain command")

    def validate_manifest(self, data: dict[str, Any], path: Path) -> dict[str, Any]:
        schema_version = data.get("schema_version")
        expected_fields = (
            MANIFEST_FIELDS_V1
            if schema_version == 1
            else MANIFEST_FIELDS_V2
            if schema_version == 2
            else set()
        )
        unknown = sorted(set(data) - expected_fields)
        missing = sorted(expected_fields - set(data))
        if unknown or missing:
            raise BrainFailure("MANIFEST_FIELD", ",".join(unknown or missing))
        if schema_version not in {1, 2} or not WORKSTREAM_RE.fullmatch(str(data.get("workstream_id", ""))):
            raise BrainFailure("MANIFEST_SCHEMA", sanitize_display(path))
        data = dict(data)
        if schema_version == 1:
            data["result_sha"] = None
        if data.get("status") not in MANIFEST_STATUSES:
            raise BrainFailure("MANIFEST_STATUS", data.get("workstream_id", ""))
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,63}", str(data.get("slug", ""))):
            raise BrainFailure("MANIFEST_SLUG", data.get("workstream_id", ""))
        branch = data.get("branch")
        if (
            not isinstance(branch, str)
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]{1,180}", branch)
            or ".." in branch
            or "//" in branch
            or "@{" in branch
        ):
            raise BrainFailure("MANIFEST_BRANCH", data.get("workstream_id", ""))
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]{1,63}", str(data.get("write_owner", ""))):
            raise BrainFailure("MANIFEST_OWNER", data.get("workstream_id", ""))
        if not SHA_RE.fullmatch(str(data.get("base_sha", ""))):
            raise BrainFailure("MANIFEST_BASE", data.get("workstream_id", ""))
        result_sha = data.get("result_sha")
        if schema_version == 2 and data.get("status") in {"submitted", "integrated"}:
            if not SHA_RE.fullmatch(str(result_sha or "")):
                raise BrainFailure("MANIFEST_RESULT", data.get("workstream_id", ""))
        elif result_sha is not None:
            raise BrainFailure("MANIFEST_RESULT", "non-submitted workstream must use null")
        if not isinstance(data.get("manifest_revision"), int) or data["manifest_revision"] < 1:
            raise BrainFailure("MANIFEST_REVISION", data.get("workstream_id", ""))
        if data["manifest_revision"] == 1 and data.get("base_manifest_hash") is not None:
            raise BrainFailure("MANIFEST_REVISION", "revision 1 hash must be null")
        if data["manifest_revision"] > 1 and not SHA_RE.fullmatch(
            str(data.get("base_manifest_hash", ""))
        ):
            raise BrainFailure("MANIFEST_REVISION", "later revision requires base hash")
        if (
            not isinstance(data.get("outcome_ids"), list)
            or not data["outcome_ids"]
            or len(set(data["outcome_ids"])) != len(data["outcome_ids"])
            or not all(re.fullmatch(r"OUT-[0-9]{3}", item or "") for item in data["outcome_ids"])
        ):
            raise BrainFailure("MANIFEST_OUTCOME", data.get("workstream_id", ""))
        policy = self._policy()
        scopes = data.get("scope")
        if not isinstance(scopes, dict) or set(scopes) != {"write", "read"}:
            raise BrainFailure("MANIFEST_SCOPE", data.get("workstream_id", ""))
        seen_paths: set[tuple[str, str]] = set()
        for access in ("write", "read"):
            items = scopes.get(access)
            if not isinstance(items, list):
                raise BrainFailure("MANIFEST_SCOPE", access)
            for item in items:
                if not isinstance(item, dict) or set(item) != {"path", "match"}:
                    raise BrainFailure("MANIFEST_SCOPE", access)
                canonical = normalize_repo_path(item["path"])
                if item["match"] not in {"exact", "tree"}:
                    raise BrainFailure("SCOPE_MATCH", canonical)
                key = (_path_key(canonical), item["match"])
                if key in seen_paths:
                    raise BrainFailure("SCOPE_DUPLICATE", canonical)
                seen_paths.add(key)
        semantic_scope = data.get("semantic_scope")
        if not isinstance(semantic_scope, list):
            raise BrainFailure("MANIFEST_SEMANTIC", data.get("workstream_id", ""))
        seen_semantic: set[tuple[str, str]] = set()
        for item in semantic_scope:
            if not isinstance(item, dict) or set(item) != {"access", "key"}:
                raise BrainFailure("MANIFEST_SEMANTIC", data.get("workstream_id", ""))
            if item["access"] not in {"read", "write"}:
                raise BrainFailure("MANIFEST_SEMANTIC", item["access"])
            self._validate_semantic_key(item["key"], policy)
            semantic_identity = (item["access"], item["key"].casefold())
            if semantic_identity in seen_semantic:
                raise BrainFailure("MANIFEST_SEMANTIC", "duplicate semantic scope")
            seen_semantic.add(semantic_identity)
        proof_ids = data.get("proof_command_ids")
        allowed_proofs = set(policy.get("proof_command_ids", []))
        if (
            not isinstance(proof_ids, list)
            or len(set(proof_ids)) != len(proof_ids)
            or not all(
                isinstance(item, str) and PROOF_ID_RE.fullmatch(item) and item in allowed_proofs
                for item in proof_ids
            )
        ):
            raise BrainFailure("PROOF_COMMAND_ID", data.get("workstream_id", ""))
        path_parts = Path(path).parts
        if "workstreams" in path_parts:
            parent = Path(path).parent.name
            if parent != data["workstream_id"]:
                raise BrainFailure("WORKSTREAM_DIRECTORY", data["workstream_id"])
        serialized = json.dumps(data, ensure_ascii=False, sort_keys=True)
        self._privacy_check("docs/brain/workstreams/manifest.json", serialized)
        return data

    def _manifests(self) -> tuple[dict[str, Any], ...]:
        directory = self.brain / "workstreams"
        if not directory.exists():
            return ()
        if directory.is_symlink():
            raise BrainFailure("SYMLINK_PATH", "docs/brain/workstreams")
        manifests: list[dict[str, Any]] = []
        identities: dict[str, str] = {}
        live_branches: dict[str, str] = {}
        for path in sorted(directory.glob("*/manifest.json")):
            data = self.validate_manifest(self.strict_json(path), path)
            digest = self.manifest_digest(data)
            previous = identities.get(data["workstream_id"])
            if previous and previous != digest:
                raise BrainFailure("WORKSTREAM_ID_REUSE", data["workstream_id"])
            identities[data["workstream_id"]] = digest
            if data["status"] not in {"integrated", "abandoned"}:
                previous_branch = live_branches.get(data["branch"])
                if previous_branch and previous_branch != data["workstream_id"]:
                    raise BrainFailure("WORKSTREAM_BRANCH_REUSE", data["branch"])
                live_branches[data["branch"]] = data["workstream_id"]
            manifests.append(data)
        return tuple(manifests)

    def active_manifest_path(self) -> Path:
        return self.branch_manifest_path(include_terminal=False)

    def branch_manifest_path(self, include_terminal: bool = False) -> Path:
        branch = self.git("branch", "--show-current").stdout.strip()
        directory = self.brain / "workstreams"
        if directory.exists() and directory.is_symlink():
            raise BrainFailure("SYMLINK_PATH", "docs/brain/workstreams")
        candidates: list[Path] = []
        paths = sorted(directory.glob("*/manifest.json")) if directory.exists() else []
        for path in paths:
            data = self.validate_manifest(self.strict_json(path), path)
            if data["branch"] != branch:
                continue
            if include_terminal or data["status"] not in {"integrated", "abandoned"}:
                candidates.append(path)
        if len(candidates) != 1:
            raise BrainFailure("WORKSTREAM_DISCOVERY", f"branch={branch} candidates={len(candidates)}")
        return candidates[0]

    @staticmethod
    def manifest_digest(data: dict[str, Any]) -> str:
        encoded = json.dumps(
            data,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def _write_manifest(self, path: Path, data: dict[str, Any], *, create: bool) -> None:
        self.validate_manifest(data, path)
        directory = path.parent
        workstreams = self.brain / "workstreams"
        if workstreams.is_symlink():
            raise BrainFailure("SYMLINK_PATH", "docs/brain/workstreams")
        workstreams.mkdir(mode=0o755, exist_ok=True)
        if create:
            try:
                directory.mkdir(mode=0o755)
            except FileExistsError as error:
                raise BrainFailure("WORKSTREAM_EXISTS", directory.name) from error
        elif directory.is_symlink():
            raise BrainFailure("SYMLINK_PATH", self._relative(directory))
        body = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
        descriptor, temp_name = tempfile.mkstemp(prefix="manifest-", suffix=".json", dir=directory)
        temp = Path(temp_name)
        try:
            os.fchmod(descriptor, 0o600)
            encoded = body.encode("utf-8")
            written = 0
            while written < len(encoded):
                count = os.write(descriptor, encoded[written:])
                if count <= 0:
                    raise BrainFailure("MANIFEST_WRITE", self._relative(path))
                written += count
            os.fsync(descriptor)
            os.close(descriptor)
            descriptor = -1
            if create:
                try:
                    os.link(temp, path)
                except FileExistsError as error:
                    raise BrainFailure("WORKSTREAM_EXISTS", directory.name) from error
                temp.unlink()
            else:
                os.replace(temp, path)
            os.chmod(path, 0o644)
            directory_descriptor = os.open(directory, os.O_RDONLY)
            try:
                os.fsync(directory_descriptor)
            finally:
                os.close(directory_descriptor)
        except BrainFailure:
            raise
        except OSError as error:
            raise BrainFailure("MANIFEST_WRITE", self._relative(path)) from error
        finally:
            if descriptor >= 0:
                os.close(descriptor)
            if temp.exists():
                temp.unlink()

    @staticmethod
    def _scope_items(exact: Sequence[str], tree: Sequence[str]) -> list[dict[str, str]]:
        items = {
            (normalize_repo_path(path).casefold(), match): {
                "path": normalize_repo_path(path),
                "match": match,
            }
            for match, paths in (("exact", exact), ("tree", tree))
            for path in paths
        }
        return sorted(items.values(), key=lambda item: (item["path"].casefold(), item["match"]))

    def _write_new_text(self, path: Path, body: str) -> None:
        descriptor = -1
        try:
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            encoded = body.encode("utf-8")
            written = 0
            while written < len(encoded):
                count = os.write(descriptor, encoded[written:])
                if count <= 0:
                    raise BrainFailure("WORKSTREAM_WRITE", self._relative(path))
                written += count
            os.fsync(descriptor)
            os.close(descriptor)
            descriptor = -1
            os.chmod(path, 0o644)
            directory_descriptor = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_descriptor)
            finally:
                os.close(directory_descriptor)
        except OSError as error:
            raise BrainFailure("WORKSTREAM_WRITE", self._relative(path)) from error
        finally:
            if descriptor >= 0:
                os.close(descriptor)

    @staticmethod
    def _workstream_handoff(outcomes: Sequence[str], branch: str) -> str:
        outcome_text = ", ".join(sorted(set(outcomes)))
        return (
            "# Workstream handoff\n\n"
            f"- Branch: `{branch}`\n"
            f"- Outcomes: `{outcome_text}`\n"
            "- Goal: define before implementation.\n"
            "- Acceptance: define reproducible success conditions.\n"
            "- Proof: list deterministic commands/evidence IDs.\n"
            "- Changed: none yet.\n"
            "- Unverified: implementation not started.\n"
            "- Risks/rollback: define before mutation.\n"
            "- Next: review and commit the manifest plus this handoff.\n"
        )

    def init_workstream(
        self,
        *,
        outcomes: Sequence[str],
        slug: str | None = None,
        owner: str = "codex-root",
        write_exact: Sequence[str] = (),
        write_tree: Sequence[str] = (),
        read_exact: Sequence[str] = (),
        read_tree: Sequence[str] = (),
        semantic_write: Sequence[str] = (),
        semantic_read: Sequence[str] = (),
        proof_ids: Sequence[str] = (),
    ) -> Path:
        if self._status_paths():
            raise BrainFailure("WORKSTREAM_DIRTY", "init requires a clean worktree")
        branch = self.git("branch", "--show-current").stdout.strip()
        if not branch:
            raise BrainFailure("MANIFEST_BRANCH", "detached HEAD")
        policy = self._policy()
        canonical_branch = policy["canonical_ref"].removeprefix("refs/heads/")
        if canonical_branch.startswith("origin/"):
            canonical_branch = canonical_branch.removeprefix("origin/")
        if branch == canonical_branch:
            raise BrainFailure("WORKSTREAM_CANONICAL_BRANCH", branch)
        canonical_sha = self.git("rev-parse", "--verify", policy["canonical_ref"]).stdout.strip()
        head_sha = self.git("rev-parse", "HEAD").stdout.strip()
        if head_sha != canonical_sha:
            raise BrainFailure("WORKSTREAM_BASE_DIRTY", f"HEAD={head_sha[:12]} canonical={canonical_sha[:12]}")
        snapshot = self.validate(strict=True)
        for outcome in outcomes:
            record = snapshot.records.get(outcome)
            if record is None or record.kind != "outcome":
                raise BrainFailure("MANIFEST_OUTCOME", sanitize_display(outcome))
        candidate_slug = slug or branch.rsplit("/", 1)[-1]
        candidate_slug = re.sub(r"[^a-z0-9-]+", "-", candidate_slug.casefold()).strip("-")
        if len(candidate_slug) < 2:
            raise BrainFailure("MANIFEST_SLUG", candidate_slug)
        workstream_id = f"WS-{uuid.uuid4().hex}"
        handoff_relative = f"docs/brain/workstreams/{workstream_id}/HANDOFF.md"
        policy_proofs = list(policy["proof_command_ids"])
        data: dict[str, Any] = {
            "schema_version": 2,
            "workstream_id": workstream_id,
            "slug": candidate_slug,
            "status": "active",
            "branch": branch,
            "base_sha": canonical_sha,
            "result_sha": None,
            "outcome_ids": sorted(set(outcomes)),
            "write_owner": owner,
            "scope": {
                "write": self._scope_items([*write_exact, handoff_relative], write_tree),
                "read": self._scope_items(read_exact, read_tree),
            },
            "semantic_scope": [
                *({"access": "write", "key": key} for key in sorted(set(semantic_write))),
                *({"access": "read", "key": key} for key in sorted(set(semantic_read))),
            ],
            "proof_command_ids": list(proof_ids) if proof_ids else policy_proofs,
            "manifest_revision": 1,
            "base_manifest_hash": None,
        }
        path = self.brain / "workstreams" / workstream_id / "manifest.json"
        self._write_manifest(path, data, create=True)
        handoff_path = path.with_name("HANDOFF.md")
        try:
            self._write_new_text(handoff_path, self._workstream_handoff(outcomes, branch))
        except BrainFailure:
            path.unlink(missing_ok=True)
            try:
                path.parent.rmdir()
            except OSError:
                pass
            raise
        return path

    def set_workstream_status(self, target: str, manifest_path: Path | None = None) -> Path:
        path = manifest_path or self.branch_manifest_path(include_terminal=True)
        if not path.is_absolute():
            path = self.root / path
        data = self.validate_manifest(self.strict_json(path), path)
        if data["schema_version"] != 2:
            raise BrainFailure("MANIFEST_MIGRATION_REQUIRED", data["workstream_id"])
        current_status = data["status"]
        if target not in MANIFEST_TRANSITIONS.get(current_status, set()):
            raise BrainFailure("WORKSTREAM_TRANSITION", f"{current_status}->{target}")
        if self._status_paths():
            raise BrainFailure("WORKSTREAM_DIRTY", "status change requires a clean committed worktree")
        branch = self.git("branch", "--show-current").stdout.strip()
        policy = self._policy()
        canonical_sha = self.git("rev-parse", "--verify", policy["canonical_ref"]).stdout.strip()
        head_sha = self.git("rev-parse", "HEAD").stdout.strip()
        canonical_branch = policy["canonical_ref"].removeprefix("refs/heads/")
        if canonical_branch.startswith("origin/"):
            canonical_branch = canonical_branch.removeprefix("origin/")
        canonical_checkout = (
            manifest_path is not None
            and branch == canonical_branch
            and head_sha == canonical_sha
        )
        if branch != data["branch"] and not (target == "integrated" and canonical_checkout):
            raise BrainFailure("MANIFEST_BRANCH", f"current={branch} manifest={data['branch']}")
        previous_digest = self.manifest_digest(data)
        if target == "submitted":
            data["result_sha"] = head_sha
        elif target == "integrated":
            result_sha = data["result_sha"]
            if self.git("merge-base", "--is-ancestor", result_sha, canonical_sha, check=False).returncode:
                raise BrainFailure("WORKSTREAM_NOT_IN_CANONICAL", result_sha[:12])
            if self.git("merge-base", "--is-ancestor", head_sha, canonical_sha, check=False).returncode:
                raise BrainFailure("WORKSTREAM_REVISION_NOT_IN_CANONICAL", head_sha[:12])
        elif target in {"active", "paused", "abandoned"}:
            data["result_sha"] = None
        data["status"] = target
        data["manifest_revision"] += 1
        data["base_manifest_hash"] = previous_digest
        self._write_manifest(path, data, create=False)
        return path

    def migrate_workstream(self, manifest_path: Path | None = None) -> Path:
        path = manifest_path or self.branch_manifest_path(include_terminal=True)
        if not path.is_absolute():
            path = self.root / path
        raw = self.strict_json(path)
        data = self.validate_manifest(raw, path)
        if data["schema_version"] != 1:
            raise BrainFailure("MANIFEST_MIGRATION_NOT_NEEDED", data["workstream_id"])
        if data["status"] in {"integrated", "abandoned"}:
            raise BrainFailure("MANIFEST_MIGRATION_TERMINAL", data["status"])
        if self._status_paths():
            raise BrainFailure("WORKSTREAM_DIRTY", "migration requires a clean committed worktree")
        branch = self.git("branch", "--show-current").stdout.strip()
        if branch != data["branch"]:
            raise BrainFailure("MANIFEST_BRANCH", f"current={branch} manifest={data['branch']}")
        migrated = json.loads(json.dumps(raw, ensure_ascii=False))
        migrated["schema_version"] = 2
        migrated["status"] = "active" if data["status"] == "submitted" else data["status"]
        migrated["result_sha"] = None
        migrated["manifest_revision"] = data["manifest_revision"] + 1
        migrated["base_manifest_hash"] = self.manifest_digest(raw)
        handoff_path = path.with_name("HANDOFF.md")
        handoff_relative = self._relative(handoff_path)
        write_scopes = migrated["scope"]["write"]
        if not any(self._git_path_overlaps_scope(handoff_relative, item) for item in write_scopes):
            write_scopes.append({"path": handoff_relative, "match": "exact"})
            write_scopes.sort(key=lambda item: (item["path"].casefold(), item["match"]))
        created_handoff = False
        try:
            if not handoff_path.exists():
                self._write_new_text(
                    handoff_path,
                    self._workstream_handoff(data["outcome_ids"], branch),
                )
                created_handoff = True
            self._write_manifest(path, migrated, create=False)
        except BrainFailure:
            if created_handoff:
                handoff_path.unlink(missing_ok=True)
            raise
        return path

    def validate(self, strict: bool = False) -> Snapshot:
        cfg = self.catalog()
        self._policy(cfg)
        paths = self.tracked_files(cfg)
        docs: dict[str, str] = {}
        total_brain_bytes = 0
        for path in paths:
            relative = self._relative(path)
            body = self.secure_read_text(path)
            self._privacy_check(relative, body)
            docs[relative] = body
            if relative.startswith("docs/brain/"):
                total_brain_bytes += len(body.encode("utf-8"))
        tracked_limit = cfg.get("limits", {}).get("tracked_brain_mb", 2)
        if not isinstance(tracked_limit, (int, float)) or tracked_limit <= 0:
            raise BrainFailure("CATALOG_LIMIT", "tracked_brain_mb")
        if total_brain_bytes > tracked_limit * 1024 * 1024:
            raise BrainFailure("BRAIN_SIZE", "tracked brain exceeds configured limit")
        records, links = self._records(docs)
        manifests = self._manifests()
        if strict and not records:
            raise BrainFailure("RECORDS_EMPTY", "no canonical records found")
        return Snapshot(tuple(paths), docs, records, links, manifests)

    def fingerprint(self, paths: Iterable[Path]) -> str:
        digest = hashlib.sha256()
        for path in sorted(paths, key=self._relative):
            relative = self._relative(path)
            digest.update(relative.encode("utf-8"))
            digest.update(b"\0")
            digest.update(hashlib.sha256(self.secure_read_bytes(path)).digest())
        return digest.hexdigest()

    def ensure_local(self) -> None:
        if self.local.exists() or self.local.is_symlink():
            try:
                metadata = os.lstat(self.local)
            except OSError as error:
                raise BrainFailure("LOCAL_OPEN", ".brain") from error
            if stat.S_ISLNK(metadata.st_mode):
                raise BrainFailure("LOCAL_SYMLINK", ".brain")
            if not stat.S_ISDIR(metadata.st_mode):
                raise BrainFailure("LOCAL_TYPE", ".brain")
        else:
            self.local.mkdir(mode=0o700)
        os.chmod(self.local, 0o700)

    def build_index(self, quiet: bool = False, max_database_bytes: int | None = None) -> None:
        snapshot = self.validate(strict=True)
        cfg = self.catalog()
        self.ensure_local()
        configured_limit = int(cfg["limits"]["database_mb"] * 1024 * 1024)
        limit = configured_limit if max_database_bytes is None else max_database_bytes
        descriptor, temp_name = tempfile.mkstemp(prefix="brain-index-", suffix=".sqlite", dir=self.local)
        os.close(descriptor)
        temp = Path(temp_name)
        os.chmod(temp, 0o600)
        try:
            connection = sqlite3.connect(temp)
            connection.execute("PRAGMA journal_mode=DELETE")
            connection.execute("PRAGMA user_version=2")
            connection.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            connection.execute("CREATE TABLE docs (path TEXT PRIMARY KEY, title TEXT, body TEXT, sha256 TEXT)")
            connection.execute(
                "CREATE VIRTUAL TABLE search USING fts5(path UNINDEXED, title, body, tokenize='unicode61')"
            )
            connection.execute(
                "CREATE TABLE records (id TEXT PRIMARY KEY, kind TEXT, title TEXT, path TEXT, "
                "line_start INTEGER, line_end INTEGER, body_sha256 TEXT)"
            )
            connection.execute(
                "CREATE TABLE links (source_id TEXT, target_id TEXT, kind TEXT, "
                "PRIMARY KEY(source_id,target_id,kind))"
            )
            connection.execute(
                "CREATE TABLE blocks (block_id TEXT PRIMARY KEY, record_id TEXT, path TEXT, "
                "line_start INTEGER, line_end INTEGER, body TEXT, body_sha256 TEXT, byte_size INTEGER)"
            )
            for relative, body in sorted(snapshot.docs.items()):
                title_match = re.search(r"^#\s+(.+)$", body, re.MULTILINE)
                title = title_match.group(1).strip() if title_match else Path(relative).name
                digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
                connection.execute("INSERT INTO docs VALUES (?, ?, ?, ?)", (relative, title, body, digest))
                connection.execute("INSERT INTO search VALUES (?, ?, ?)", (relative, title, body))
            for record in sorted(snapshot.records.values(), key=lambda item: item.id):
                connection.execute(
                    "INSERT INTO records VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        record.id,
                        record.kind,
                        record.title,
                        record.path,
                        record.line_start,
                        record.line_end,
                        record.body_sha256,
                    ),
                )
                connection.execute(
                    "INSERT INTO blocks VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        f"record:{record.id}",
                        record.id,
                        record.path,
                        record.line_start,
                        record.line_end,
                        record.body,
                        record.body_sha256,
                        len(record.body.encode("utf-8")),
                    ),
                )
            for source, target in snapshot.links:
                connection.execute("INSERT INTO links VALUES (?, ?, 'links')", (source, target))
            meta = {
                "fingerprint": self.fingerprint(snapshot.paths),
                "head": self.git("rev-parse", "HEAD").stdout.strip(),
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }
            for key, value in meta.items():
                connection.execute("INSERT INTO meta VALUES (?, ?)", (key, value))
            connection.commit()
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            connection.close()
            if integrity != "ok" or version != 2:
                raise BrainFailure("INDEX_INTEGRITY", "temporary database failed validation")
            size = temp.stat().st_size
            if size > limit:
                raise BrainFailure("INDEX_SIZE", f"{size}>{limit}")
            with temp.open("rb") as stream:
                os.fsync(stream.fileno())
            os.replace(temp, self.db)
            os.chmod(self.db, 0o600)
        finally:
            if temp.exists():
                temp.unlink()
        if not quiet:
            print(f"Indexed {len(snapshot.paths)} files / {len(snapshot.records)} records → {self.db.relative_to(self.root)}")

    def index_is_current(self, snapshot: Snapshot | None = None) -> bool:
        if not self.db.exists() or self.db.is_symlink():
            return False
        try:
            snapshot = snapshot or self.validate(strict=True)
            connection = sqlite3.connect(f"file:{self.db}?mode=ro", uri=True)
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            stored = connection.execute("SELECT value FROM meta WHERE key='fingerprint'").fetchone()[0]
            connection.close()
            return version == 2 and stored == self.fingerprint(snapshot.paths)
        except (BrainFailure, sqlite3.Error, IndexError, TypeError, OSError):
            return False

    def ensure_index(self, snapshot: Snapshot | None = None) -> None:
        if not self.index_is_current(snapshot):
            self.build_index(quiet=True)

    def _git_status(self, root: Path | None = None) -> str:
        cwd = root or self.root
        result = _run_process(
            ["git", "--no-pager", "status", "--short", "--untracked-files=all"], cwd
        )
        return result.stdout.strip() or "clean"

    def _status_paths(self, root: Path | None = None) -> list[str]:
        cwd = root or self.root
        result = _run_process(
            ["git", "--no-pager", "status", "--porcelain=v1", "-z", "--untracked-files=all"],
            cwd,
            text=False,
        )
        entries = [item for item in result.stdout.split(b"\0") if item]
        paths: list[str] = []
        index = 0
        while index < len(entries):
            entry = entries[index]
            if len(entry) < 4 or entry[2:3] != b" ":
                raise BrainFailure("GIT_STATUS_FORMAT", str(cwd))
            status = entry[:2]
            raw_paths = [entry[3:]]
            if b"R" in status or b"C" in status:
                index += 1
                if index >= len(entries):
                    raise BrainFailure("GIT_STATUS_FORMAT", str(cwd))
                raw_paths.append(entries[index])
            for raw_path in raw_paths:
                try:
                    paths.append(raw_path.decode("utf-8", errors="strict"))
                except UnicodeDecodeError as error:
                    raise BrainFailure("GIT_PATH_UTF8", str(cwd)) from error
            index += 1
        return sorted(set(paths))

    def _worktree_snapshot(self) -> list[dict[str, str]]:
        raw = self.git("worktree", "list", "--porcelain", "-z", text=False).stdout
        entries: list[dict[str, str]] = []
        current: dict[str, str] = {}
        for token in [*raw.split(b"\0"), b""]:
            if not token:
                if current:
                    entries.append(current)
                    current = {}
                continue
            try:
                line = token.decode("utf-8", errors="strict")
            except UnicodeDecodeError as error:
                raise BrainFailure("GIT_PATH_UTF8", "git worktree path is not UTF-8") from error
            key, _separator, value = line.partition(" ")
            if key in {"worktree", "HEAD", "branch"}:
                current[key] = value
        return entries

    def _manifest_from_ref(self, oid: str, path: str) -> dict[str, Any]:
        if not SHA_RE.fullmatch(oid):
            raise BrainFailure("GIT_OBJECT", "invalid ref object")
        if not re.fullmatch(
            r"docs/brain/workstreams/WS-[0-9a-f]{32}/manifest\.json",
            path,
        ):
            raise BrainFailure("WORKSTREAM_DIRECTORY", sanitize_display(path))
        result = self.git("cat-file", "blob", f"{oid}:{path}", text=False)
        try:
            body = result.stdout.decode("utf-8", errors="strict")
        except UnicodeDecodeError as error:
            raise BrainFailure("INVALID_UTF8", path) from error
        data = self.strict_json_text(body, f"{oid[:12]}:{path}")
        return self.validate_manifest(data, Path(path))

    def _changed_branch_manifest(
        self,
        branch: str,
        oid: str,
        changed: Sequence[str],
    ) -> tuple[dict[str, Any] | None, list[str]]:
        candidates: list[dict[str, Any]] = []
        errors: list[str] = []
        for path in changed:
            if not re.fullmatch(
                r"docs/brain/workstreams/WS-[0-9a-f]{32}/manifest\.json",
                path,
            ):
                continue
            exists = self.git("cat-file", "-e", f"{oid}:{path}", check=False)
            if exists.returncode:
                continue
            try:
                data = self._manifest_from_ref(oid, path)
            except BrainFailure as error:
                errors.append(f"{path}:{error.code}")
                continue
            if data["branch"] == branch:
                candidates.append(data)
        if len(candidates) > 1:
            errors.append(f"branch={branch}:candidates={len(candidates)}")
            return None, errors
        return (candidates[0] if candidates else None), errors

    @staticmethod
    def _section(body: str, title: str) -> str:
        lines = body.splitlines()
        start = next((i for i, line in enumerate(lines) if line.strip() == f"## {title}"), -1)
        if start < 0:
            return ""
        end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
        return "\n".join(lines[start:end]).rstrip() + "\n"

    @staticmethod
    def _render_record(record: Record) -> str:
        return (
            f"## Record {record.id} · {record.kind}\n"
            f"Source: `{record.path}:{record.line_start}` · sha256 `{record.body_sha256}`\n\n"
            f"{record.body.rstrip()}\n"
        )

    @staticmethod
    def _assemble_context(header: str, chunks: list[ContextChunk], budget: int) -> str:
        mandatory = sorted((item for item in chunks if item.mandatory), key=lambda item: item.rank)
        optional = sorted((item for item in chunks if not item.mandatory), key=lambda item: item.rank)

        def render(selected: list[ContextChunk], omitted: list[ContextChunk]) -> str:
            included_ids = ", ".join(item.id for item in selected) or "none"
            omitted_ids = ", ".join(item.id for item in omitted) or "none"
            ledger = f"Included IDs: {included_ids}\nOmitted IDs: {omitted_ids}\n"
            return header + ledger + "\n" + "\n".join(item.body.rstrip() for item in selected) + "\n"

        selected = list(mandatory)
        omitted = list(optional)
        initial = render(selected, omitted)
        if len(initial.encode("utf-8")) > budget:
            raise BrainFailure("CONTEXT_BUDGET", f"mandatory={len(initial.encode('utf-8'))} budget={budget}", 3)
        for item in optional:
            candidate_selected = [*selected, item]
            candidate_omitted = [other for other in optional if other not in candidate_selected]
            candidate = render(candidate_selected, candidate_omitted)
            if len(candidate.encode("utf-8")) <= budget:
                selected = candidate_selected
        omitted = [item for item in optional if item not in selected]
        result = render(selected, omitted)
        if len(result.encode("utf-8")) > budget:
            raise BrainFailure("CONTEXT_BUDGET", "final envelope exceeds budget", 3)
        return result

    def _neighbors(self, snapshot: Snapshot, seeds: set[str], depth: int = 1) -> dict[str, int]:
        adjacency: dict[str, set[str]] = {record_id: set() for record_id in snapshot.records}
        for source, target in snapshot.links:
            adjacency[source].add(target)
            adjacency[target].add(source)
        distances = {seed: 0 for seed in seeds}
        frontier = set(seeds)
        for distance in range(1, depth + 1):
            next_frontier: set[str] = set()
            for record_id in frontier:
                next_frontier.update(adjacency.get(record_id, set()))
            next_frontier -= distances.keys()
            for record_id in next_frontier:
                distances[record_id] = distance
            frontier = next_frontier
        return distances

    def context(
        self,
        task: str,
        explicit_ids: Sequence[str] | None = None,
        budget_bytes: int | None = None,
    ) -> str:
        snapshot = self.validate(strict=True)
        cfg = self.catalog()
        task_clean = sanitize_display(task, 500)
        seeds = set(explicit_ids or ())
        seeds.update(ENTITY_RE.findall(task_clean))
        unknown = sorted(seed for seed in seeds if seed not in snapshot.records)
        if unknown:
            raise BrainFailure("CONTEXT_ID", ",".join(unknown), 3)
        warning = ""
        if not seeds:
            terms = [term.casefold() for term in re.findall(r"[\w-]{3,}", task_clean)]
            scored: list[tuple[int, str]] = []
            for record in snapshot.records.values():
                haystack = (record.title + "\n" + record.body).casefold()
                score = sum(haystack.count(term) for term in terms)
                if score:
                    scored.append((-score, record.id))
            if scored:
                seeds.add(sorted(scored)[0][1])
            warning = "Seed mode: search (use --id for outcome work).\n"
        budget = budget_bytes if budget_bytes is not None else cfg["context_budget_bytes"]
        if not isinstance(budget, int) or budget < 64:
            raise BrainFailure("CONTEXT_BUDGET", "budget must be >=64", 3)
        branch = self.git("branch", "--show-current").stdout.strip() or "detached"
        head = self.git("rev-parse", "--short=12", "HEAD").stdout.strip()
        dirty = sanitize_display(self._git_status(), 2000)
        header = (
            "# Context pack\n\n"
            f"Task: {task_clean}\nBranch: {branch}\nHEAD: {head}\n"
            f"Dirty state: {dirty}\nSeed IDs: {', '.join(sorted(seeds)) or 'none'}\n"
            "Neighbor relation: generic co-occurrence by explicit IDs, depth=1; not typed evidence.\n"
            f"{warning}"
        )
        chunks: list[ContextChunk] = []
        protected = self._section(snapshot.docs["docs/brain/START-HERE.md"], "Защищённые решения")
        if protected:
            chunks.append(ContextChunk("SAFETY-PROTECTED", protected, True, (0, 0, "SAFETY")))
        for seed in sorted(seeds):
            record = snapshot.records[seed]
            chunks.append(ContextChunk(seed, self._render_record(record), True, (0, 1, seed)))
        if any(seed.startswith("OUT-") for seed in seeds):
            for safety_id in ("DEC-0006", "G7", "G9", "G10"):
                if safety_id in snapshot.records and safety_id not in seeds:
                    chunks.append(
                        ContextChunk(
                            safety_id,
                            self._render_record(snapshot.records[safety_id]),
                            True,
                            (0, 2, safety_id),
                        )
                    )
        distances = self._neighbors(snapshot, seeds, depth=1) if seeds else {}
        mandatory_ids = {item.id for item in chunks}
        for record_id, distance in sorted(distances.items(), key=lambda item: (item[1], item[0])):
            if record_id in mandatory_ids:
                continue
            chunks.append(
                ContextChunk(
                    record_id,
                    self._render_record(snapshot.records[record_id]),
                    False,
                    (1, distance, record_id),
                )
            )
        branch_manifests = [
            item
            for item in snapshot.manifests
            if item["branch"] == branch and item["status"] not in {"integrated", "abandoned"}
        ]
        if len(branch_manifests) == 1:
            workstream_handoff_path = (
                f"docs/brain/workstreams/{branch_manifests[0]['workstream_id']}/HANDOFF.md"
            )
            workstream_handoff = snapshot.docs.get(workstream_handoff_path, "")
            if workstream_handoff:
                chunks.append(
                    ContextChunk(
                        "WORKSTREAM-HANDOFF",
                        "## Active workstream handoff (complete)\n\n"
                        + workstream_handoff.rstrip()
                        + "\n",
                        True,
                        (0, 3, "WORKSTREAM-HANDOFF"),
                    )
                )
        handoff = snapshot.docs.get("docs/brain/CURRENT-HANDOFF.md", "")
        if handoff:
            chunks.append(
                ContextChunk(
                    "CURRENT-HANDOFF",
                    "## Current handoff (complete)\n\n" + handoff.rstrip() + "\n",
                    False,
                    (2, 0, "CURRENT-HANDOFF"),
                )
            )
        return self._assemble_context(header, chunks, budget)

    def map_record(self, record_id: str, depth: int = 1) -> str:
        snapshot = self.validate(strict=True)
        if record_id not in snapshot.records:
            raise BrainFailure("MAP_ID", record_id, 3)
        distances = self._neighbors(snapshot, {record_id}, depth=max(0, depth))
        lines = [f"# Brain map", f"Root: {record_id}", "Relation: generic `links` only", ""]
        adjacency: dict[str, set[str]] = {item: set() for item in distances}
        for source, target in snapshot.links:
            if source in distances and target in distances:
                adjacency[source].add(target)
                adjacency[target].add(source)
        for item, distance in sorted(distances.items(), key=lambda pair: (pair[1], pair[0])):
            record = snapshot.records[item]
            linked = ", ".join(sorted(adjacency.get(item, set()))) or "none"
            lines.append(
                f"- {item} [{record.kind}] distance={distance} source={record.path}:{record.line_start} links={linked}"
            )
        return "\n".join(lines) + "\n"

    def _changed_paths(self, base: str, head: str) -> list[str]:
        result = self.git("diff", "--name-only", "-z", "--no-ext-diff", base, head, text=False)
        try:
            return sorted(
                item.decode("utf-8", errors="strict")
                for item in result.stdout.split(b"\0")
                if item
            )
        except UnicodeDecodeError as error:
            raise BrainFailure("GIT_PATH_UTF8", "git diff contains a non-UTF-8 path") from error

    @staticmethod
    def _git_path_overlaps_scope(path: str, scope: dict[str, str]) -> bool:
        if not isinstance(path, str) or not path or PurePosixPath(path).is_absolute():
            raise BrainFailure("GIT_PATH_UNSAFE", "git produced an invalid path")
        if any(part in {"", ".", ".."} for part in PurePosixPath(path).parts):
            raise BrainFailure("GIT_PATH_UNSAFE", "git produced an invalid path")
        candidate_key = unicodedata.normalize("NFC", path).casefold()
        scope_key = _path_key(normalize_repo_path(scope["path"]))
        if scope.get("match") == "exact":
            return candidate_key == scope_key
        if scope.get("match") == "tree":
            return candidate_key == scope_key or candidate_key.startswith(scope_key + "/")
        raise BrainFailure("SCOPE_MATCH", scope.get("path", ""))

    @staticmethod
    def _path_overlaps_manifest(path: str, manifest: dict[str, Any], include_read: bool = True) -> bool:
        modes = ["write", "read"] if include_read else ["write"]
        return any(
            BrainProject._git_path_overlaps_scope(path, scope)
            for mode in modes
            for scope in manifest["scope"].get(mode, [])
        )

    @staticmethod
    def _compact_findings(items: list[dict[str, str]]) -> list[dict[str, str]]:
        aggregate_codes = {"HISTORY_UNRELATED", "SEMANTICS_UNKNOWN", "UNMANAGED_REF_OVERLAP"}
        grouped: dict[str, list[dict[str, str]]] = {}
        output: list[dict[str, str]] = []
        for item in items:
            if item["code"] in aggregate_codes:
                grouped.setdefault(item["code"], []).append(item)
            else:
                output.append(item)
        for code, members in grouped.items():
            if len(members) == 1:
                output.append(members[0])
                continue
            subjects = "; ".join(member.get("subject", "") for member in members[:8])
            output.append(
                {
                    "code": code,
                    "subject": sanitize_display(f"{len(members)} refs: {subjects}"),
                }
            )
        return output

    def conflict_report(self, manifest_path: Path, strict: bool = False) -> dict[str, Any]:
        before_refs = self.git("show-ref", "--head").stdout
        manifest_path = Path(manifest_path)
        if not manifest_path.is_absolute():
            manifest_path = self.root / manifest_path
        current = self.validate_manifest(self.strict_json(manifest_path), manifest_path)
        policy = self._policy()
        canonical_ref = policy["canonical_ref"]
        canonical_sha = self.git("rev-parse", "--verify", canonical_ref).stdout.strip()
        head_sha = self.git("rev-parse", "HEAD").stdout.strip()
        current_branch = self.git("branch", "--show-current").stdout.strip()
        if not current_branch or current["branch"] != current_branch:
            raise BrainFailure(
                "CURRENT_MANIFEST_BRANCH",
                f"current={current_branch or 'detached'} manifest={current['branch']}",
            )
        if current["status"] in {"integrated", "abandoned"}:
            raise BrainFailure("CURRENT_MANIFEST_TERMINAL", current["status"])
        base_sha = current["base_sha"]
        hard: list[dict[str, str]] = []
        warnings: list[dict[str, str]] = []
        info: list[dict[str, str]] = []
        inspected: list[str] = []
        self_manifest_relative = (
            f"docs/brain/workstreams/{current['workstream_id']}/manifest.json"
        )
        if current["status"] == "submitted":
            result_sha = current.get("result_sha")
            result_valid = bool(result_sha) and self.git(
                "cat-file",
                "-e",
                f"{result_sha}^{{commit}}",
                check=False,
            ).returncode == 0
            result_in_head = result_valid and self.git(
                "merge-base",
                "--is-ancestor",
                result_sha,
                head_sha,
                check=False,
            ).returncode == 0
            if not result_in_head:
                hard.append(
                    {
                        "code": "CURRENT_SUBMITTED_RESULT_INVALID",
                        "subject": str(result_sha or "legacy-v1-unfrozen"),
                    }
                )
            else:
                post_result = [
                    path
                    for path in self._changed_paths(result_sha, head_sha)
                    if path != self_manifest_relative
                ]
                if post_result:
                    hard.append(
                        {
                            "code": "CURRENT_SUBMITTED_RESULT_DRIFT",
                            "subject": ",".join(post_result[:8]),
                        }
                    )
        if self.git("cat-file", "-e", f"{base_sha}^{{commit}}", check=False).returncode:
            hard.append({"code": "BASE_MISSING", "subject": base_sha})
        else:
            if self.git("merge-base", "--is-ancestor", base_sha, head_sha, check=False).returncode:
                hard.append({"code": "BASE_DIVERGED", "subject": base_sha})
            merge_base = self.git("merge-base", head_sha, canonical_sha).stdout.strip()
            if merge_base != base_sha:
                hard.append({"code": "MANIFEST_BASE_STALE", "subject": merge_base})
            if canonical_sha != base_sha:
                drift = self._changed_paths(base_sha, canonical_sha)
                overlapping = [path for path in drift if self._path_overlaps_manifest(path, current)]
                target = hard if overlapping else warnings
                target.append(
                    {
                        "code": "BASE_SCOPE_DRIFT" if overlapping else "BASE_BEHIND",
                        "subject": ",".join(overlapping or drift[:8]) or canonical_sha,
                    }
                )
            committed = self._changed_paths(base_sha, head_sha)
            escapes = [
                path for path in committed
                if path != self_manifest_relative
                and not self._path_overlaps_manifest(path, current, include_read=False)
            ]
            for path in escapes:
                hard.append({"code": "SCOPE_ESCAPE", "subject": path})
        for path in self._status_paths():
            if path == self_manifest_relative:
                continue
            if not self._path_overlaps_manifest(path, current, include_read=False):
                hard.append({"code": "DIRTY_SCOPE_ESCAPE", "subject": path})
        worktree_snapshot = self._worktree_snapshot()
        worktree_branches = {
            item.get("branch", "").removeprefix("refs/heads/")
            for item in worktree_snapshot
            if item.get("branch")
        }
        manifests = self._manifests()
        live_manifests_by_branch = {
            item["branch"]: item
            for item in manifests
            if item["workstream_id"] != current["workstream_id"]
            and item["status"] not in {"integrated", "abandoned"}
        }
        terminal_manifests_by_branch = {
            item["branch"]: item
            for item in manifests
            if item["workstream_id"] != current["workstream_id"]
            and item["status"] in {"integrated", "abandoned"}
        }
        processed_manifest_branches: set[str] = set()
        canonical_branch = canonical_ref.removeprefix("refs/heads/")
        if canonical_branch.startswith("origin/"):
            canonical_branch = canonical_branch.removeprefix("origin/")
        refs = self.git(
            "for-each-ref", "--format=%(refname:short)\t%(objectname)", "refs/heads"
        ).stdout.splitlines()
        for line in refs:
            if not line or "\t" not in line:
                continue
            name, oid = line.split("\t", 1)
            if name in {current_branch, canonical_branch}:
                continue
            inspected.append(f"ref:{name}@{oid[:12]}")
            is_active_worktree = name in worktree_branches
            if (
                not is_active_worktree
                and name not in live_manifests_by_branch
                and name not in terminal_manifests_by_branch
                and self.git("merge-base", "--is-ancestor", oid, head_sha, check=False).returncode == 0
            ):
                continue
            merge_result = self.git("merge-base", canonical_sha, oid, check=False)
            if merge_result.returncode:
                target = (
                    hard
                    if is_active_worktree or name in live_manifests_by_branch
                    else info
                )
                target.append(
                    {
                        "code": "ACTIVE_HISTORY_UNRELATED"
                        if target is hard
                        else "HISTORY_UNRELATED",
                        "subject": name,
                    }
                )
                continue
            merge_base = merge_result.stdout.strip()
            changed = self._changed_paths(merge_base, oid)
            branch_manifest, manifest_errors = self._changed_branch_manifest(name, oid, changed)
            if manifest_errors:
                hard.append(
                    {
                        "code": "FOREIGN_MANIFEST_INVALID",
                        "subject": f"{name}: {','.join(manifest_errors[:3])}",
                    }
                )
            foreign_manifest = branch_manifest or live_manifests_by_branch.get(name)
            terminal_manifest = (
                branch_manifest
                if branch_manifest and branch_manifest["status"] in {"integrated", "abandoned"}
                else terminal_manifests_by_branch.get(name)
                if branch_manifest is None
                else None
            )
            if terminal_manifest:
                processed_manifest_branches.add(name)
                if is_active_worktree:
                    warnings.append(
                        {
                            "code": "TERMINAL_WORKTREE_PRESENT",
                            "subject": f"{name}:{terminal_manifest['status']}",
                        }
                    )
                if terminal_manifest["status"] == "abandoned":
                    if not is_active_worktree:
                        continue
                    foreign_manifest = None
                else:
                    result_sha = terminal_manifest.get("result_sha")
                    result_exists = bool(result_sha) and self.git(
                        "cat-file",
                        "-e",
                        f"{result_sha}^{{commit}}",
                        check=False,
                    ).returncode == 0
                    result_on_branch = result_exists and self.git(
                        "merge-base",
                        "--is-ancestor",
                        result_sha,
                        oid,
                        check=False,
                    ).returncode == 0
                    result_in_canonical = result_exists and self.git(
                        "merge-base",
                        "--is-ancestor",
                        result_sha,
                        canonical_sha,
                        check=False,
                    ).returncode == 0
                    manifest_relative = (
                        f"docs/brain/workstreams/{terminal_manifest['workstream_id']}/manifest.json"
                    )
                    post_result = (
                        [
                            path
                            for path in self._changed_paths(result_sha, oid)
                            if path != manifest_relative
                        ]
                        if result_on_branch
                        else []
                    )
                    if not result_on_branch or not result_in_canonical:
                        hard.append(
                            {
                                "code": "TERMINAL_RESULT_INVALID",
                                "subject": f"{name}:{str(result_sha or 'legacy-v1-unfrozen')[:12]}",
                            }
                        )
                    if post_result:
                        hard.append(
                            {
                                "code": "TERMINAL_RESULT_DRIFT",
                                "subject": f"{name}: {','.join(post_result[:4])}",
                            }
                        )
                    if result_on_branch and result_in_canonical and not post_result:
                        continue
            if foreign_manifest:
                processed_manifest_branches.add(name)
                if foreign_manifest["status"] == "submitted":
                    result_sha = foreign_manifest.get("result_sha")
                    result_exists = bool(result_sha) and self.git(
                        "cat-file",
                        "-e",
                        f"{result_sha}^{{commit}}",
                        check=False,
                    ).returncode == 0
                    result_on_branch = result_exists and self.git(
                        "merge-base",
                        "--is-ancestor",
                        result_sha,
                        oid,
                        check=False,
                    ).returncode == 0
                    if not result_on_branch:
                        hard.append(
                            {
                                "code": "SUBMITTED_RESULT_INVALID",
                                "subject": f"{name}:{str(result_sha or 'legacy-v1-unfrozen')[:12]}",
                            }
                        )
                    else:
                        foreign_manifest_relative = (
                            f"docs/brain/workstreams/{foreign_manifest['workstream_id']}/manifest.json"
                        )
                        post_result = [
                            path
                            for path in self._changed_paths(result_sha, oid)
                            if path != foreign_manifest_relative
                        ]
                        if post_result:
                            hard.append(
                                {
                                    "code": "SUBMITTED_RESULT_DRIFT",
                                    "subject": f"{name}: {','.join(post_result[:4])}",
                                }
                            )
                        elif self.git(
                            "merge-base",
                            "--is-ancestor",
                            result_sha,
                            head_sha,
                            check=False,
                        ).returncode == 0:
                            continue
            overlapping = [path for path in changed if self._path_overlaps_manifest(path, current)]
            if overlapping:
                is_managed = foreign_manifest is not None
                target = hard if is_active_worktree or is_managed else warnings
                code = (
                    "ACTIVE_WORKTREE_PATH_OVERLAP"
                    if is_active_worktree
                    else "MANAGED_ACTUAL_PATH_OVERLAP"
                    if is_managed
                    else "UNMANAGED_REF_OVERLAP"
                )
                preview = ",".join(overlapping[:4])
                target.append(
                    {
                        "code": code,
                        "subject": f"{name}: {len(overlapping)} path(s): {preview}",
                    }
                )
            if foreign_manifest:
                foreign_manifest_relative = (
                    f"docs/brain/workstreams/{foreign_manifest['workstream_id']}/manifest.json"
                )
                foreign_escapes = [
                    path
                    for path in changed
                    if path != foreign_manifest_relative
                    and not self._path_overlaps_manifest(
                        path,
                        foreign_manifest,
                        include_read=False,
                    )
                ]
                if foreign_escapes:
                    preview = ",".join(foreign_escapes[:4])
                    hard.append(
                        {
                            "code": "FOREIGN_SCOPE_ESCAPE",
                            "subject": f"{name}: {len(foreign_escapes)} path(s): {preview}",
                        }
                    )
                hard.extend(
                    compare_manifests(current, foreign_manifest, policy["semantic_namespaces"])
                )
            elif changed and not overlapping:
                info.append({"code": "SEMANTICS_UNKNOWN", "subject": name})
        for other in manifests:
            if other["workstream_id"] == current["workstream_id"]:
                continue
            if other["status"] in {"integrated", "abandoned"}:
                if other["status"] == "integrated" and other["branch"] not in processed_manifest_branches:
                    result_sha = other.get("result_sha")
                    if not result_sha or self.git(
                        "merge-base",
                        "--is-ancestor",
                        result_sha,
                        canonical_sha,
                        check=False,
                    ).returncode:
                        hard.append(
                            {
                                "code": "TERMINAL_RESULT_INVALID",
                                "subject": f"{other['branch']}:{str(result_sha or 'legacy-v1-unfrozen')[:12]}",
                            }
                        )
                continue
            if other["branch"] in processed_manifest_branches:
                continue
            if other["status"] == "submitted":
                result_sha = other.get("result_sha")
                if result_sha and self.git(
                    "merge-base",
                    "--is-ancestor",
                    result_sha,
                    head_sha,
                    check=False,
                ).returncode == 0:
                    continue
                if not result_sha:
                    hard.append(
                        {
                            "code": "SUBMITTED_RESULT_INVALID",
                            "subject": f"{other['branch']}:legacy-v1-unfrozen",
                        }
                    )
            warnings.append({"code": "MANIFEST_BRANCH_MISSING", "subject": other["branch"]})
            hard.extend(compare_manifests(current, other, policy["semantic_namespaces"]))
        for item in worktree_snapshot:
            if item.get("branch") or not item.get("HEAD") or not item.get("worktree"):
                continue
            other_root = Path(item["worktree"])
            try:
                is_current_root = os.path.samefile(other_root, self.root)
            except OSError:
                is_current_root = other_root.resolve() == self.root.resolve()
            if is_current_root:
                continue
            oid = item["HEAD"]
            inspected.append(f"detached:{item['worktree']}@{oid[:12]}")
            merge_result = self.git("merge-base", canonical_sha, oid, check=False)
            if merge_result.returncode:
                hard.append(
                    {"code": "ACTIVE_HISTORY_UNRELATED", "subject": item["worktree"]}
                )
                continue
            changed = self._changed_paths(merge_result.stdout.strip(), oid)
            overlapping = [path for path in changed if self._path_overlaps_manifest(path, current)]
            if overlapping:
                hard.append(
                    {
                        "code": "ACTIVE_DETACHED_PATH_OVERLAP",
                        "subject": f"{item['worktree']}: {','.join(overlapping[:4])}",
                    }
                )
            elif oid != head_sha:
                info.append({"code": "DETACHED_WORKTREE_PRESENT", "subject": item["worktree"]})
        roots = [item["worktree"] for item in worktree_snapshot if item.get("worktree")]
        for raw_root in roots:
            other_root = Path(raw_root)
            try:
                is_current_root = os.path.samefile(other_root, self.root)
            except OSError:
                is_current_root = other_root.resolve() == self.root.resolve()
            if is_current_root:
                continue
            inspected.append(f"worktree:{raw_root}")
            dirty_paths = self._status_paths(other_root)
            overlapping = [path for path in dirty_paths if self._path_overlaps_manifest(path, current)]
            if overlapping:
                preview = ",".join(overlapping[:4])
                hard.append(
                    {
                        "code": "UNMANAGED_DIRTY_OVERLAP",
                        "subject": f"{raw_root}: {len(overlapping)} path(s): {preview}",
                    }
                )
            if dirty_paths and not overlapping:
                info.append({"code": "FOREIGN_DIRTY_DISJOINT", "subject": raw_root})
        after_refs = self.git("show-ref", "--head").stdout
        if before_refs != after_refs:
            raise BrainFailure("SNAPSHOT_MOVED", "refs changed during conflict scan")
        hard = [
            {key: sanitize_display(value) for key, value in item.items()}
            for item in hard
        ]
        warnings = [
            {key: sanitize_display(value) for key, value in item.items()}
            for item in warnings
        ]
        info = [
            {key: sanitize_display(value) for key, value in item.items()}
            for item in info
        ]
        inspected = sorted(set(sanitize_display(item) for item in inspected))
        hard = sorted(hard, key=lambda item: (item["code"], item.get("subject", ""), item.get("left", "")))
        warnings = sorted(
            self._compact_findings(warnings),
            key=lambda item: (item["code"], item.get("subject", "")),
        )
        info = sorted(
            self._compact_findings(info),
            key=lambda item: (item["code"], item.get("subject", "")),
        )
        status = "CONFLICT" if hard else (
            "CLEAR_LOCAL_SNAPSHOT_WITH_WARNINGS"
            if warnings
            else "CLEAR_LOCAL_SNAPSHOT_WITH_INFO"
            if info
            else "CLEAR_LOCAL_SNAPSHOT"
        )
        blocking = [
            {"severity": "hard", **item} for item in hard
        ] + (
            [{"severity": "warning", **item} for item in warnings] if strict else []
        )
        snapshot_digest = hashlib.sha256(
            json.dumps(
                {
                    "canonical_sha": canonical_sha,
                    "head_sha": head_sha,
                    "manifest": current,
                    "hard": hard,
                    "warnings": warnings,
                    "info": info,
                    "inspected": inspected,
                },
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()
        return {
            "status": status,
            "canonical_sha": canonical_sha,
            "head_sha": head_sha,
            "manifest_id": current["workstream_id"],
            "hard": hard,
            "warnings": warnings,
            "info": info,
            "counts": {
                "hard": len(hard),
                "warnings": len(warnings),
                "info": len(info),
                "blocking": len(blocking),
                "inspected": len(inspected),
            },
            "blocking": blocking,
            "decision": "BLOCKED" if blocking else "PROCEED_LOCAL_SNAPSHOT",
            "warning_policy": "block" if strict else "allow-explicit",
            "inspected": inspected,
            "snapshot_digest": snapshot_digest,
            "limits": [
                "no fetch or remote lease",
                "unfetched, unpushed and undeclared semantic work is unknown",
                "re-run on exact SHAs before integration",
            ],
            "exit_code": 1 if blocking else 0,
        }

    def doctor(self) -> int:
        status = self._git_status()
        branch = self.git("branch", "--show-current").stdout.strip() or "detached"
        head = self.git("rev-parse", "--short=12", "HEAD").stdout.strip()
        load = os.getloadavg()[0]
        cpu = os.cpu_count() or 1
        pressure = _run_process(["memory_pressure", "-Q"], self.root, check=False).stdout
        free_match = re.search(r"free percentage:\s*(\d+)%", pressure, re.IGNORECASE)
        free_percent = int(free_match.group(1)) if free_match else -1
        validation_error: BrainFailure | None = None
        snapshot: Snapshot | None = None
        try:
            snapshot = self.validate(strict=True)
        except BrainFailure as error:
            validation_error = error
        print("Akademsalon project brain")
        print(f"branch: {branch}")
        print(f"head:   {head}")
        print(f"dirty:\n{status}")
        memory_label = f"{free_percent}% free" if free_percent >= 0 else "not available"
        print(f"Mac: memory {memory_label}, load {load:.2f}/{cpu}")
        print(f"canonical validation: {'ERROR ' + validation_error.code if validation_error else 'OK'}")
        print(f"records: {len(snapshot.records) if snapshot else 0}")
        print(f"search index: {'current' if snapshot and self.index_is_current(snapshot) else 'stale or absent (rebuilt on demand)'}")
        warnings: list[str] = []
        if 0 <= free_percent < 15:
            warnings.append("memory below 15%: do not start parallel visual runs")
        if load > cpu * 1.5:
            warnings.append("system load is high: finish unnecessary workers before a heavy run")
        if validation_error:
            warnings.append(f"canonical truth invalid: {validation_error.code}")
        if warnings:
            print("\nWARNINGS")
            for warning in warnings:
                print(f"- {warning}")
            return 1
        print("\nStatus: ready. No background service was started.")
        return 0

    def process_report(self) -> None:
        output = _run_process(
            ["ps", "-axo", "pid=,ppid=,%cpu=,%mem=,rss=,etime=,command="],
            self.root,
        ).stdout
        candidates = []
        root_text = str(self.root)
        for line in output.splitlines():
            if root_text in line or ".claude/static-server" in line or "playwright" in line.lower():
                candidates.append(line.strip())
        print("Potential project-related processes (read-only):")
        print("PID PPID CPU% MEM% RSS(KB) ELAPSED COMMAND")
        print("\n".join(candidates) if candidates else "none")
        print("\nNo process was stopped. Browser/Codex/Claude processes are never auto-killed.")

    def report(self) -> Path:
        snapshot = self.validate(strict=True)
        self.ensure_index(snapshot)
        self.ensure_local()
        output_dir = self.local / "report"
        if output_dir.exists() and output_dir.is_symlink():
            raise BrainFailure("LOCAL_SYMLINK", ".brain/report")
        output_dir.mkdir(mode=0o700, exist_ok=True)
        output = output_dir / "index.html"
        cards = []
        connection = sqlite3.connect(f"file:{self.db}?mode=ro", uri=True)
        for path, title, body in connection.execute("SELECT path, title, body FROM docs ORDER BY path"):
            summary = re.sub(r"\s+", " ", body).strip()[:220]
            cards.append(
                f"<article><small>{html.escape(path)}</small><h2>{html.escape(title)}</h2>"
                f"<p>{html.escape(summary)}</p></article>"
            )
        connection.close()
        document = (
            "<!doctype html><html lang='ru'><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width'><title>Akademsalon Project Brain</title>"
            "<style>body{font:16px system-ui;background:#eee4d5;color:#25221d;max-width:1180px;margin:auto;padding:32px}"
            "h1{font:42px Georgia}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}"
            "article{background:#fff9f0;border:1px solid #cbbca6;padding:18px;border-top:4px solid #a63f29}"
            f"</style><h1>Академический Салон · Project Brain</h1><main>{''.join(cards)}</main></html>"
        )
        encoded = document.encode("utf-8")
        limit = int(self.catalog()["limits"]["report_mb"] * 1024 * 1024)
        if len(encoded) > limit:
            raise BrainFailure("REPORT_SIZE", "report exceeds configured limit")
        descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.write(descriptor, encoded)
        finally:
            os.close(descriptor)
        return output


def _print_conflicts(report: dict[str, Any]) -> None:
    print(report["status"])
    print(f"decision: {report['decision']}")
    print(
        "counts: "
        f"hard={report['counts']['hard']} "
        f"warnings={report['counts']['warnings']} "
        f"info={report['counts']['info']} "
        f"blocking={report['counts']['blocking']} "
        f"inspected={report['counts']['inspected']}"
    )
    print(f"warning-policy: {report['warning_policy']}")
    print(f"canonical: {report['canonical_sha']}")
    print(f"head: {report['head_sha']}")
    print(f"manifest: {report['manifest_id']}")
    for item in report["hard"]:
        subject = item.get("subject") or f"{item.get('left')} <> {item.get('right')}"
        print(f"HARD {item['code']}: {subject}")
    for item in report["warnings"]:
        print(f"WARN {item['code']}: {item.get('subject', '')}")
    for item in report["info"]:
        print(f"INFO {item['code']}: {item.get('subject', '')}")
    print(f"snapshot: {report['snapshot_digest']}")
    for limit in report["limits"]:
        print(f"LIMIT: {limit}")
    if report["hard"]:
        print("NEXT: resolve every HARD item, then re-run on the exact integration SHAs.")
    elif report["warnings"] and report["exit_code"]:
        print(
            "NEXT: review every warning; only the integration owner may rerun "
            "with --allow-warnings."
        )
    else:
        print("NEXT: re-run this local snapshot immediately before integration.")


def main(argv: Sequence[str] | None = None, project: BrainProject | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor")
    sub.add_parser("refresh")
    validate_parser = sub.add_parser("validate")
    validate_parser.add_argument("--strict", action="store_true")
    validate_parser.add_argument("--json", action="store_true")
    query_parser = sub.add_parser("query")
    query_parser.add_argument("text")
    context_parser = sub.add_parser("context")
    context_parser.add_argument("--task", required=True)
    context_parser.add_argument("--id", action="append", default=[])
    context_parser.add_argument("--budget-bytes", type=int)
    context_parser.add_argument("--json", action="store_true")
    map_parser = sub.add_parser("map")
    map_parser.add_argument("--id", required=True)
    map_parser.add_argument("--depth", type=int, default=1)
    map_parser.add_argument("--json", action="store_true")
    conflicts_parser = sub.add_parser("conflicts")
    conflicts_parser.add_argument("--manifest")
    conflict_mode = conflicts_parser.add_mutually_exclusive_group()
    conflict_mode.add_argument("--strict", action="store_true")
    conflict_mode.add_argument(
        "--allow-warnings",
        action="store_true",
        help="return zero for warnings; never suppresses hard conflicts",
    )
    conflicts_parser.add_argument("--json", action="store_true")
    workstream_parser = sub.add_parser(
        "workstream",
        help="create, inspect and transition a branch-scoped workstream",
    )
    workstream_sub = workstream_parser.add_subparsers(dest="workstream_command", required=True)
    workstream_init = workstream_sub.add_parser("init")
    workstream_init.add_argument("--outcome", action="append", required=True, help="existing OUT-NNN; repeatable")
    workstream_init.add_argument("--slug", help="lowercase workstream label; defaults to branch suffix")
    workstream_init.add_argument("--owner", default="codex-root", help="single write-owner identity")
    workstream_init.add_argument("--write-exact", action="append", default=[], help="exact repository path to modify; repeatable")
    workstream_init.add_argument("--write-tree", action="append", default=[], help="repository subtree to modify; repeatable")
    workstream_init.add_argument("--read-exact", action="append", default=[], help="exact dependency path; repeatable")
    workstream_init.add_argument("--read-tree", action="append", default=[], help="dependency subtree; repeatable")
    workstream_init.add_argument("--semantic-write", action="append", default=[], help="namespaced semantic resource to modify")
    workstream_init.add_argument("--semantic-read", action="append", default=[], help="namespaced semantic dependency")
    workstream_init.add_argument("--proof-id", action="append", default=[], help="allowlisted proof ID; defaults to policy")
    workstream_status = workstream_sub.add_parser("status")
    workstream_status.add_argument("--manifest")
    workstream_status.add_argument("--json", action="store_true")
    workstream_migrate = workstream_sub.add_parser(
        "migrate",
        help="reopen a legacy v1 live manifest as safe v2 without accepting a result SHA",
    )
    workstream_migrate.add_argument("--manifest")
    workstream_set_status = workstream_sub.add_parser("set-status")
    workstream_set_status.add_argument(
        "status",
        choices=sorted(MANIFEST_STATUSES),
    )
    workstream_set_status.add_argument("--manifest")
    sub.add_parser("processes")
    sub.add_parser("report")
    args = parser.parse_args(argv)
    project = project or BrainProject(ROOT)
    try:
        if args.command == "doctor":
            return project.doctor()
        if args.command == "refresh":
            project.build_index()
        elif args.command == "validate":
            snapshot = project.validate(strict=args.strict)
            payload = {
                "status": "valid",
                "records": len(snapshot.records),
                "links": len(snapshot.links),
                "manifests": len(snapshot.manifests),
            }
            print(json.dumps(payload, ensure_ascii=False, sort_keys=True) if args.json else (
                f"VALID records={payload['records']} links={payload['links']} manifests={payload['manifests']}"
            ))
        elif args.command == "query":
            snapshot = project.validate(strict=True)
            project.ensure_index(snapshot)
            terms = [term.casefold() for term in re.findall(r"[\w-]{2,}", sanitize_display(args.text))]
            scored = []
            for record in snapshot.records.values():
                score = sum((record.title + record.body).casefold().count(term) for term in terms)
                if score:
                    scored.append((-score, record.id, record))
            for _score, _record_id, record in sorted(scored)[:10]:
                print(f"{record.id} {record.path}:{record.line_start}\n  {record.title}")
        elif args.command == "context":
            output = project.context(args.task, explicit_ids=args.id, budget_bytes=args.budget_bytes)
            print(json.dumps({"context": output}, ensure_ascii=False, sort_keys=True) if args.json else output, end="")
        elif args.command == "map":
            output = project.map_record(args.id, depth=args.depth)
            print(json.dumps({"map": output}, ensure_ascii=False, sort_keys=True) if args.json else output, end="")
        elif args.command == "conflicts":
            manifest_path = Path(args.manifest) if args.manifest else project.active_manifest_path()
            report = project.conflict_report(
                manifest_path,
                strict=args.strict or not args.allow_warnings,
            )
            if args.json:
                print(json.dumps(report, ensure_ascii=False, sort_keys=True))
            else:
                _print_conflicts(report)
            return report["exit_code"]
        elif args.command == "workstream":
            if args.workstream_command == "init":
                path = project.init_workstream(
                    outcomes=args.outcome,
                    slug=args.slug,
                    owner=args.owner,
                    write_exact=args.write_exact,
                    write_tree=args.write_tree,
                    read_exact=args.read_exact,
                    read_tree=args.read_tree,
                    semantic_write=args.semantic_write,
                    semantic_read=args.semantic_read,
                    proof_ids=args.proof_id,
                )
                print(f"CREATED {project._relative(path)}")
                print(f"CREATED {project._relative(path.with_name('HANDOFF.md'))}")
                print(
                    "NEXT: run workstream status, complete the handoff, commit exactly "
                    "these two files, then run brain conflicts --strict"
                )
            elif args.workstream_command == "status":
                path = (
                    Path(args.manifest)
                    if args.manifest
                    else project.branch_manifest_path(include_terminal=True)
                )
                if not path.is_absolute():
                    path = project.root / path
                data = project.validate_manifest(project.strict_json(path), path)
                payload = {"path": project._relative(path), **data}
                if args.json:
                    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
                else:
                    for key in (
                        "path",
                        "workstream_id",
                        "status",
                        "branch",
                        "base_sha",
                        "result_sha",
                        "manifest_revision",
                        "write_owner",
                        "outcome_ids",
                        "proof_command_ids",
                    ):
                        value = payload[key]
                        print(f"{key}: {value}")
                    for access in ("write", "read"):
                        print(f"scope.{access}:")
                        for item in data["scope"][access]:
                            print(f"  - {item['match']}:{item['path']}")
                    print("semantic_scope:")
                    for item in data["semantic_scope"]:
                        print(f"  - {item['access']}:{item['key']}")
            elif args.workstream_command == "set-status":
                path = project.set_workstream_status(
                    args.status,
                    Path(args.manifest) if args.manifest else None,
                )
                print(f"UPDATED {project._relative(path)} status={args.status}")
                if args.status in {"integrated", "abandoned"}:
                    print(
                        "NEXT: validate and commit this terminal revision; plain conflicts "
                        "will no longer auto-discover it"
                    )
                elif args.status == "submitted":
                    print(
                        "NEXT: commit only this manifest revision; integrate its frozen "
                        "result SHA before marking integrated"
                    )
                else:
                    print("NEXT: commit this revision, then run brain conflicts --strict")
            elif args.workstream_command == "migrate":
                path = project.migrate_workstream(
                    Path(args.manifest) if args.manifest else None,
                )
                print(f"UPDATED {project._relative(path)} schema=v2")
                print(
                    "NEXT: review scope, commit the exact manifest and handoff migration, "
                    "then continue implementation before submitting a fresh result SHA"
                )
        elif args.command == "processes":
            project.process_report()
        elif args.command == "report":
            print(project.report())
        return 0
    except BrainFailure as error:
        print(f"ERROR {error.code}: {error.detail}", file=sys.stderr)
        remediation = {
            "WORKSTREAM_DIRTY": "commit or recoverably separate current changes, then retry",
            "WORKSTREAM_BASE_DIRTY": "create a fresh branch from the exact canonical ref",
            "WORKSTREAM_CANONICAL_BRANCH": "create a codex task branch from canonical first",
            "WORKSTREAM_DISCOVERY": "pass the exact manifest path or initialize this task branch",
            "MANIFEST_MIGRATION_REQUIRED": "migrate legacy v1 to v2 before changing lifecycle status",
        }.get(error.code)
        if remediation:
            print(f"NEXT: {remediation}", file=sys.stderr)
        return error.exit_code


if __name__ == "__main__":
    sys.exit(main())
