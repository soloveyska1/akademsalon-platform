from __future__ import annotations

from pathlib import Path
import stat
import tempfile
import unittest

from helpers import create_project
from tools.brain.brain import BrainFailure, BrainProject


class SecurityTests(unittest.TestCase):
    def test_tracked_symlink_escape_is_rejected_without_reading_target(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside:
            root = create_project(Path(tmp))
            target = Path(outside) / "secret"
            target.write_text("SHOULD_NOT_APPEAR", encoding="utf-8")
            victim = root / "docs/brain/PRODUCT-MAP.md"
            victim.unlink()
            victim.symlink_to(target)
            with self.assertRaises(BrainFailure) as raised:
                BrainProject(root).validate(strict=True)
            self.assertIn("SYMLINK", str(raised.exception))
            self.assertNotIn("SHOULD_NOT_APPEAR", str(raised.exception))

    def test_brain_directory_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside:
            root = create_project(Path(tmp))
            (root / ".brain").symlink_to(Path(outside), target_is_directory=True)
            with self.assertRaisesRegex(BrainFailure, "LOCAL_SYMLINK"):
                BrainProject(root).build_index()

    def test_failed_size_gate_preserves_previous_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = BrainProject(create_project(Path(tmp)))
            project.build_index()
            before = project.db.read_bytes()
            self.assertEqual(stat.S_IMODE(project.local.stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE(project.db.stat().st_mode), 0o600)
            with self.assertRaisesRegex(BrainFailure, "INDEX_SIZE"):
                project.build_index(max_database_bytes=100)
            self.assertEqual(project.db.read_bytes(), before)

    def test_context_and_manifest_strings_never_execute_shell(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            sentinel = root / "sentinel"
            output = BrainProject(root).context(
                "OUT-001 $(touch sentinel); `touch sentinel`", explicit_ids=["OUT-001"]
            )
            self.assertFalse(sentinel.exists())
            self.assertIn("OUT-001", output)


if __name__ == "__main__":
    unittest.main()
