"""Минимальный versioned migration runner для SQLite.

Каждый SQL-файл сам открывает транзакцию и фиксирует свою версию в
``schema_migrations``. Поэтому при ошибке схема не остаётся наполовину
применённой, а повторный запуск безопасно продолжает с последней версии.
"""
from __future__ import annotations

import re
from pathlib import Path

import aiosqlite

_MIGRATION_NAME = re.compile(r"^\d{4}_[a-z0-9_]+\.sql$")


async def apply_pending(
    connection: aiosqlite.Connection,
    directory: Path | None = None,
) -> list[str]:
    migration_dir = directory or Path(__file__).resolve().parents[1] / "migrations"
    await connection.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations("
        "version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
    )
    await connection.commit()
    cur = await connection.execute("SELECT version FROM schema_migrations")
    applied = {row[0] for row in await cur.fetchall()}
    completed: list[str] = []
    for path in sorted(migration_dir.glob("*.sql")):
        if not _MIGRATION_NAME.fullmatch(path.name):
            raise RuntimeError(f"invalid migration filename: {path.name}")
        version = path.stem
        if version in applied:
            continue
        sql = path.read_text(encoding="utf-8")
        if f"VALUES('{version}'" not in sql:
            raise RuntimeError(f"migration {path.name} does not record its version")
        await connection.executescript(sql)
        completed.append(version)
    return completed
