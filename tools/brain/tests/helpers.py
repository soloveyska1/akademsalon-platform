from __future__ import annotations

import json
from pathlib import Path
import subprocess


def write(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")


def git(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=root, text=True, capture_output=True, check=True
    )
    return result.stdout.strip()


def create_project(root: Path) -> Path:
    write(root / "AGENTS.md", "# Agents\n")
    write(root / "CLAUDE.md", "# Claude\n")
    write(
        root / "docs/brain/START-HERE.md",
        """# START

## Защищённые решения

- Успех только после server ID.
""",
    )
    write(
        root / "docs/brain/ROADMAP.md",
        """# Roadmap

## NOW

### OUT-001 — Проверяемая заявка

- Почему сейчас: критический путь.
- Результат: одно подтверждённое дело.
- Связи: `JRN-001`, `SUR-002`.
- Метрика: дублей 0.
- Proof: deterministic test.
- Kill/stop: без production mutation.

## NEXT

- `OUT-002` — Следующий шаг.
""",
    )
    write(
        root / "docs/brain/PRODUCT-MAP.md",
        """# Product map

## Поверхности

| ID | Поверхность | Задача | Маршрут |
|---|---|---|---|
| `SUR-002` | Заявка | Отправить дело | configurator |

## Пути

| ID | Путь | Исход | Риск |
|---|---|---|---|
| `JRN-001` | Обращение | `OUT-001` | дубль |
""",
    )
    write(
        root / "docs/brain/DECISIONS.md",
        """# Decisions

| ID | Статус | Решение | Основание | Триггер |
|---|---|---|---|---|
| `DEC-0005` | accepted | Brain в Git | audit | scale |
| `DEC-0006` | accepted | Success после ID | safety | API change |
""",
    )
    write(
        root / "docs/brain/UX-DEBT.md",
        """# Debt

| ID | Severity | Статус | Риск | Связи | Acceptance | Target |
|---|---:|---|---|---|---|---|
| `UXD-0001` | P2 | planned | Нет marker | `OUT-001` | one row | next |
""",
    )
    write(
        root / "docs/brain/QUALITY-GATES.md",
        """# Gates

| Gate | Требование |
|---|---|
| G7 Reliability | stable IDs |
| G9 Evidence | exact tree |
| G10 Release | P0/P1 zero |
""",
    )
    write(root / "docs/brain/MODEL-COUNCIL.md", "# Council\n")
    write(root / "docs/brain/CURRENT-HANDOFF.md", "# Handoff\n\nNo mutation.\n")
    write(
        root / "docs/brain/releases/REL-0098.md",
        "# REL-0098 — Release\n\nСвязи: `OUT-001`.\n",
    )
    catalog = {
        "schema_version": 1,
        "record_schema_version": 1,
        "source_of_truth": "docs/brain",
        "derived_state": ".brain",
        "canonical_ref": "refs/heads/main",
        "context_budget_bytes": 8192,
        "index_allowlist": [
            "AGENTS.md",
            "CLAUDE.md",
            "docs/brain/**/*.md",
        ],
        "aliases": {},
        "limits": {
            "database_mb": 25,
            "report_mb": 5,
            "tracked_brain_mb": 2,
        },
        "workstream_policy": "docs/brain/workstream-policy.json",
    }
    write(root / "docs/brain/catalog.json", json.dumps(catalog, ensure_ascii=False))
    policy = {
        "schema_version": 1,
        "canonical_ref": "refs/heads/main",
        "proof_command_ids": ["brain:test", "brain:validate"],
        "semantic_namespaces": {
            "brain-command": "exact",
            "brain-index": "prefix",
            "api-route": "route",
            "production": "exact",
        },
    }
    write(
        root / "docs/brain/workstream-policy.json",
        json.dumps(policy, ensure_ascii=False),
    )
    git(root, "init", "-b", "main")
    git(root, "config", "user.email", "brain@example.invalid")
    git(root, "config", "user.name", "Brain Test")
    git(root, "add", ".")
    git(root, "commit", "-m", "fixture")
    return root


def manifest(base_sha: str, workstream_id: str = "WS-0123456789abcdef0123456789abcdef") -> dict:
    return {
        "schema_version": 2,
        "workstream_id": workstream_id,
        "slug": "brain-test",
        "status": "active",
        "branch": "codex/brain-test",
        "base_sha": base_sha,
        "result_sha": None,
        "outcome_ids": ["OUT-001"],
        "write_owner": "codex/root",
        "scope": {
            "write": [{"path": "tools/brain/brain.py", "match": "exact"}],
            "read": [{"path": "docs/brain/ROADMAP.md", "match": "exact"}],
        },
        "semantic_scope": [
            {"access": "write", "key": "brain-command:context"}
        ],
        "proof_command_ids": ["brain:test", "brain:validate"],
        "manifest_revision": 1,
        "base_manifest_hash": None,
    }
