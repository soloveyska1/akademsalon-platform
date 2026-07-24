#!/usr/bin/env python3
"""Compatibility entry point for all filled Specification v2 scenarios."""

from __future__ import annotations

import runpy
from pathlib import Path


if __name__ == "__main__":
    runpy.run_path(
        str(Path(__file__).with_name("generate-spec-v2.py")),
        run_name="__main__",
    )
