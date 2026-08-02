from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from helpers import create_project
from tools.brain.brain import BrainFailure, BrainProject


class ContextTests(unittest.TestCase):
    def test_outcome_context_is_atomic_bounded_and_has_ledger(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = BrainProject(create_project(Path(tmp)))
            output = project.context("prove OUT-001", explicit_ids=["OUT-001"], budget_bytes=5000)
            self.assertLessEqual(len(output.encode("utf-8")), 5000)
            self.assertIn("OUT-001", output)
            self.assertIn("Kill/stop: без production mutation.", output)
            self.assertIn("Included IDs:", output)
            self.assertIn("Omitted IDs:", output)
            self.assertIn("generic co-occurrence by explicit IDs", output)

    def test_mandatory_seed_overflow_fails_without_partial_pack(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = BrainProject(create_project(Path(tmp)))
            with self.assertRaisesRegex(BrainFailure, "CONTEXT_BUDGET"):
                project.context("OUT-001", explicit_ids=["OUT-001"], budget_bytes=180)

    def test_same_tree_context_is_byte_deterministic_and_sanitizes_controls(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = BrainProject(create_project(Path(tmp)))
            first = project.context("OUT-001\x1b]8;;bad", explicit_ids=["OUT-001"])
            second = project.context("OUT-001\x1b]8;;bad", explicit_ids=["OUT-001"])
            self.assertEqual(first, second)
            self.assertNotIn("\x1b", first)

    def test_map_is_generic_and_resolves_reverse_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = BrainProject(create_project(Path(tmp)))
            mapped = project.map_record("OUT-001", depth=1)
            self.assertIn("JRN-001", mapped)
            self.assertIn("UXD-0001", mapped)
            self.assertNotIn("closes", mapped.lower())


if __name__ == "__main__":
    unittest.main()
