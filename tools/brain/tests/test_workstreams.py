from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from helpers import create_project, git, write
from tools.brain.brain import BrainFailure, BrainProject


class WorkstreamTests(unittest.TestCase):
    def test_init_uses_exact_canonical_and_lifecycle_hashes_each_revision(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            git(root, "switch", "-c", "codex/next-slice")
            project = BrainProject(root)
            path = project.init_workstream(
                outcomes=["OUT-001"],
                write_exact=["tools/brain/brain.py"],
                read_exact=["docs/brain/ROADMAP.md"],
                semantic_write=["brain-command:context"],
            )
            active = json.loads(path.read_text(encoding="utf-8"))
            handoff = path.with_name("HANDOFF.md")
            self.assertTrue(handoff.exists())
            self.assertIn("Workstream handoff", handoff.read_text(encoding="utf-8"))
            self.assertIn(
                {
                    "path": str(handoff.relative_to(root)),
                    "match": "exact",
                },
                active["scope"]["write"],
            )
            self.assertEqual(active["base_sha"], git(root, "rev-parse", "refs/heads/main"))
            self.assertIsNone(active["result_sha"])
            self.assertEqual(active["manifest_revision"], 1)
            active_digest = project.manifest_digest(active)
            git(root, "add", ".")
            git(root, "commit", "-m", "declare workstream")
            write(root / "tools/brain/brain.py", "implementation\n")
            git(root, "add", "tools/brain/brain.py")
            git(root, "commit", "-m", "implementation")
            result_sha = git(root, "rev-parse", "HEAD")
            project.set_workstream_status("submitted", path)
            submitted = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(submitted["result_sha"], result_sha)
            self.assertEqual(submitted["base_manifest_hash"], active_digest)
            self.assertEqual(submitted["manifest_revision"], 2)
            submitted_digest = project.manifest_digest(submitted)
            git(root, "add", str(path.relative_to(root)))
            git(root, "commit", "-m", "submit workstream")
            git(root, "branch", "-f", "main", "HEAD")
            git(root, "switch", "main")
            project.set_workstream_status("integrated", path)
            integrated = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(integrated["result_sha"], result_sha)
            self.assertEqual(integrated["base_manifest_hash"], submitted_digest)
            self.assertEqual(integrated["manifest_revision"], 3)

    def test_init_rejects_stacked_or_dirty_branch(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            git(root, "switch", "-c", "codex/stacked")
            write(root / "extra.txt", "uncommitted\n")
            with self.assertRaisesRegex(BrainFailure, "WORKSTREAM_DIRTY"):
                BrainProject(root).init_workstream(outcomes=["OUT-001"])
            git(root, "add", "extra.txt")
            git(root, "commit", "-m", "stacked")
            with self.assertRaisesRegex(BrainFailure, "WORKSTREAM_BASE_DIRTY"):
                BrainProject(root).init_workstream(outcomes=["OUT-001"])

    def test_init_rejects_canonical_branch_and_legacy_manifest_requires_migration(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            project = BrainProject(root)
            with self.assertRaisesRegex(BrainFailure, "WORKSTREAM_CANONICAL_BRANCH"):
                project.init_workstream(outcomes=["OUT-001"])
            git(root, "switch", "-c", "codex/legacy")
            legacy = {
                "schema_version": 1,
                "workstream_id": "WS-fedcba9876543210fedcba9876543210",
                "slug": "legacy",
                "status": "submitted",
                "branch": "codex/legacy",
                "base_sha": git(root, "rev-parse", "HEAD"),
                "outcome_ids": ["OUT-001"],
                "write_owner": "codex/root",
                "scope": {"write": [], "read": []},
                "semantic_scope": [],
                "proof_command_ids": ["brain:test", "brain:validate"],
                "manifest_revision": 1,
                "base_manifest_hash": None,
            }
            legacy_path = (
                root
                / "docs/brain/workstreams"
                / legacy["workstream_id"]
                / "manifest.json"
            )
            write(legacy_path, json.dumps(legacy, ensure_ascii=False))
            normalized = project.validate_manifest(legacy, legacy_path)
            self.assertIsNone(normalized["result_sha"])
            git(root, "add", ".")
            git(root, "commit", "-m", "legacy manifest")
            with self.assertRaisesRegex(BrainFailure, "MANIFEST_MIGRATION_REQUIRED"):
                project.set_workstream_status("active", legacy_path)

    def test_duplicate_live_manifest_branch_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            project = BrainProject(root)
            git(root, "switch", "-c", "codex/duplicate")
            first = project.init_workstream(outcomes=["OUT-001"])
            first_data = json.loads(first.read_text(encoding="utf-8"))
            second_data = {**first_data}
            second_data["workstream_id"] = "WS-fedcba9876543210fedcba9876543210"
            second = (
                root
                / "docs/brain/workstreams"
                / second_data["workstream_id"]
                / "manifest.json"
            )
            write(second, json.dumps(second_data, ensure_ascii=False))
            with self.assertRaisesRegex(BrainFailure, "WORKSTREAM_BRANCH_REUSE"):
                project.validate(strict=True)

    def test_failed_atomic_status_replace_preserves_previous_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            git(root, "switch", "-c", "codex/atomic")
            project = BrainProject(root)
            path = project.init_workstream(outcomes=["OUT-001"])
            git(root, "add", ".")
            git(root, "commit", "-m", "declare atomic workstream")
            before = path.read_bytes()
            with mock.patch("tools.brain.brain.os.replace", side_effect=OSError("injected")):
                with self.assertRaisesRegex(BrainFailure, "MANIFEST_WRITE"):
                    project.set_workstream_status("submitted", path)
            self.assertEqual(path.read_bytes(), before)
            self.assertFalse(list(path.parent.glob("manifest-*.json")))


if __name__ == "__main__":
    unittest.main()
