from __future__ import annotations

from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest
import unicodedata

from helpers import create_project, git, manifest, write
from tools.brain.brain import (
    BrainFailure,
    BrainProject,
    compare_manifests,
    main as brain_main,
    normalize_repo_path,
    path_scopes_overlap,
)

SEMANTIC_NAMESPACES = {
    "api-route": "route",
    "brain-command": "exact",
    "brain-index": "prefix",
    "production": "exact",
}


class ConflictTests(unittest.TestCase):
    def test_path_exact_tree_and_write_read_overlap(self):
        exact = {"path": "tools/brain/brain.py", "match": "exact"}
        tree = {"path": "tools/brain", "match": "tree"}
        other = {"path": "assets/js/app.js", "match": "exact"}
        self.assertTrue(path_scopes_overlap(exact, tree))
        self.assertFalse(path_scopes_overlap(exact, other))
        self.assertTrue(
            path_scopes_overlap(
                {"path": "Docs/Brain", "match": "tree"},
                {"path": "docs/brain/ROADMAP.md", "match": "exact"},
            )
        )
        with self.assertRaisesRegex(BrainFailure, "PATH_NONCANONICAL"):
            normalize_repo_path(unicodedata.normalize("NFD", "docs/brain/café.md"))

    def test_write_write_and_write_read_are_hard_read_read_is_clear(self):
        left = manifest("a" * 40)
        right = manifest("a" * 40, "WS-fedcba9876543210fedcba9876543210")
        conflicts = compare_manifests(left, right, SEMANTIC_NAMESPACES)
        self.assertTrue(any(item["code"] == "PATH_WRITE_WRITE" for item in conflicts))
        right["scope"]["write"] = [{"path": "other.txt", "match": "exact"}]
        right["scope"]["read"] = [{"path": "tools/brain/brain.py", "match": "exact"}]
        conflicts = compare_manifests(left, right, SEMANTIC_NAMESPACES)
        self.assertTrue(any(item["code"] == "PATH_WRITE_READ" for item in conflicts))
        left["scope"]["write"] = [{"path": "left.txt", "match": "exact"}]
        left["semantic_scope"] = [{"access": "read", "key": "brain-command:context"}]
        right["semantic_scope"] = [{"access": "read", "key": "brain-command:context"}]
        self.assertFalse(compare_manifests(left, right, SEMANTIC_NAMESPACES))

    def test_semantic_write_overlap_conflicts_but_same_outcome_does_not(self):
        left = manifest("a" * 40)
        right = manifest("a" * 40, "WS-fedcba9876543210fedcba9876543210")
        left["scope"] = {"write": [], "read": []}
        right["scope"] = {"write": [], "read": []}
        self.assertTrue(
            any(
                item["code"] == "SEMANTIC_WRITE"
                for item in compare_manifests(left, right, SEMANTIC_NAMESPACES)
            )
        )
        right["semantic_scope"] = [{"access": "write", "key": "brain-command:map"}]
        self.assertFalse(compare_manifests(left, right, SEMANTIC_NAMESPACES))

    def test_semantic_match_mode_comes_from_policy_not_hardcoded_namespace(self):
        left = manifest("a" * 40)
        right = manifest("a" * 40, "WS-fedcba9876543210fedcba9876543210")
        left["scope"] = {"write": [], "read": []}
        right["scope"] = {"write": [], "read": []}
        left["semantic_scope"] = [{"access": "write", "key": "payments:checkout"}]
        right["semantic_scope"] = [
            {"access": "write", "key": "payments:checkout/refund"}
        ]
        prefix_modes = {**SEMANTIC_NAMESPACES, "payments": "prefix"}
        exact_modes = {**SEMANTIC_NAMESPACES, "payments": "exact"}
        self.assertTrue(
            any(
                item["code"] == "SEMANTIC_WRITE"
                for item in compare_manifests(left, right, prefix_modes)
            )
        )
        self.assertFalse(compare_manifests(left, right, exact_modes))

    def test_manifest_rejects_traversal_raw_commands_and_unknown_namespace(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            project = BrainProject(root)
            data = manifest(git(root, "rev-parse", "HEAD"))
            data["scope"]["write"][0]["path"] = "../secret"
            with self.assertRaisesRegex(BrainFailure, "PATH_UNSAFE"):
                project.validate_manifest(data, Path("manifest.json"))
            data = manifest(git(root, "rev-parse", "HEAD"))
            data["proof_commands"] = ["$(touch sentinel)"]
            with self.assertRaisesRegex(BrainFailure, "MANIFEST_FIELD"):
                project.validate_manifest(data, Path("manifest.json"))
            data = manifest(git(root, "rev-parse", "HEAD"))
            data["semantic_scope"][0]["key"] = "free-form:anything"
            with self.assertRaisesRegex(BrainFailure, "SEMANTIC_NAMESPACE"):
                project.validate_manifest(data, Path("manifest.json"))

    def test_conflict_scan_is_read_only_and_rejects_dirty_scope_escape(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            project = BrainProject(root)
            data = manifest(git(root, "rev-parse", "HEAD"))
            data["branch"] = "main"
            manifest_path = (
                root / "docs/brain/workstreams" / data["workstream_id"] / "manifest.json"
            )
            write(manifest_path, json.dumps(data, ensure_ascii=False))
            write(root / "rogue[1].txt", "outside declared write scope\n")
            self.assertEqual(project.active_manifest_path(), manifest_path)
            before = (root / ".brain").exists()
            report = project.conflict_report(manifest_path)
            self.assertTrue(
                any(item["code"] == "DIRTY_SCOPE_ESCAPE" for item in report["hard"])
            )
            self.assertTrue(any("rogue[1].txt" in item.get("subject", "") for item in report["hard"]))
            self.assertEqual(before, (root / ".brain").exists())

    def test_cli_blocks_warnings_by_default_and_requires_explicit_override(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            project = BrainProject(root)
            base = git(root, "rev-parse", "HEAD")
            git(root, "switch", "-c", "codex/disjoint")
            write(root / "disjoint.txt", "parallel but outside declared scope\n")
            git(root, "add", "disjoint.txt")
            git(root, "commit", "-m", "disjoint")
            git(root, "switch", "main")
            data = manifest(base)
            data["branch"] = "main"
            manifest_path = (
                root / "docs/brain/workstreams" / data["workstream_id"] / "manifest.json"
            )
            write(manifest_path, json.dumps(data, ensure_ascii=False))
            relative = manifest_path.relative_to(root)
            self.assertEqual(brain_main(["conflicts", "--manifest", str(relative)], project), 1)
            strict_report = project.conflict_report(manifest_path, strict=True)
            self.assertEqual(strict_report["decision"], "BLOCKED")
            self.assertEqual(strict_report["warning_policy"], "block")
            self.assertEqual(strict_report["counts"]["blocking"], 1)
            self.assertEqual(
                brain_main(
                    ["conflicts", "--manifest", str(relative), "--allow-warnings"], project
                ),
                0,
            )
            output = io.StringIO()
            with redirect_stdout(output):
                code = brain_main(
                    [
                        "conflicts",
                        "--manifest",
                        str(relative),
                        "--allow-warnings",
                        "--json",
                    ],
                    project,
                )
            payload = json.loads(output.getvalue())
            self.assertEqual(code, 0)
            self.assertEqual(payload["exit_code"], 0)
            self.assertEqual(payload["decision"], "PROCEED_LOCAL_SNAPSHOT")

    def test_dormant_ref_overlap_warns_but_checked_out_worktree_is_hard(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as worktree_tmp:
            root = create_project(Path(tmp))
            project = BrainProject(root)
            base = git(root, "rev-parse", "HEAD")
            git(root, "switch", "-c", "codex/overlap")
            target = root / "tools/brain/brain.py"
            write(target, "parallel implementation\n")
            git(root, "add", "tools/brain/brain.py")
            git(root, "commit", "-m", "overlap")
            git(root, "switch", "main")
            git(root, "switch", "-c", "codex/overlap-two")
            write(target, "second parallel implementation\n")
            git(root, "add", "tools/brain/brain.py")
            git(root, "commit", "-m", "second overlap")
            git(root, "switch", "main")
            data = manifest(base)
            data["branch"] = "main"
            manifest_path = (
                root / "docs/brain/workstreams" / data["workstream_id"] / "manifest.json"
            )
            write(manifest_path, json.dumps(data, ensure_ascii=False))
            dormant = project.conflict_report(manifest_path, strict=True)
            self.assertFalse(dormant["hard"])
            self.assertTrue(
                any(item["code"] == "UNMANAGED_REF_OVERLAP" for item in dormant["warnings"])
            )
            overlap_warning = next(
                item for item in dormant["warnings"] if item["code"] == "UNMANAGED_REF_OVERLAP"
            )
            self.assertIn("2 refs", overlap_warning["subject"])
            other_root = Path(worktree_tmp) / "checked-out"
            git(root, "worktree", "add", str(other_root), "codex/overlap")
            active = project.conflict_report(manifest_path, strict=True)
            self.assertTrue(
                any(item["code"] == "ACTIVE_WORKTREE_PATH_OVERLAP" for item in active["hard"])
            )

    def test_branch_manifest_is_discovered_and_actual_scope_escape_is_hard(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            project = BrainProject(root)
            base = git(root, "rev-parse", "HEAD")
            git(root, "switch", "-c", "codex/managed")
            foreign = manifest(base, "WS-fedcba9876543210fedcba9876543210")
            foreign["branch"] = "codex/managed"
            foreign["scope"]["write"] = [{"path": "declared.txt", "match": "exact"}]
            foreign_path = (
                root
                / "docs/brain/workstreams"
                / foreign["workstream_id"]
                / "manifest.json"
            )
            write(foreign_path, json.dumps(foreign, ensure_ascii=False))
            write(root / "tools/brain/brain.py", "undeclared overlapping implementation\n")
            git(root, "add", ".")
            git(root, "commit", "-m", "managed but outside scope")
            git(root, "switch", "main")
            current = manifest(base)
            current["branch"] = "main"
            current_path = (
                root / "docs/brain/workstreams" / current["workstream_id"] / "manifest.json"
            )
            write(current_path, json.dumps(current, ensure_ascii=False))
            report = project.conflict_report(current_path, strict=True)
            self.assertTrue(
                any(item["code"] == "MANAGED_ACTUAL_PATH_OVERLAP" for item in report["hard"])
            )
            self.assertTrue(
                any(item["code"] == "FOREIGN_SCOPE_ESCAPE" for item in report["hard"])
            )

    def test_inherited_submitted_result_releases_scope_but_active_does_not(self):
        for status in ("active", "paused", "submitted"):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as tmp:
                root = create_project(Path(tmp))
                project = BrainProject(root)
                base = git(root, "rev-parse", "HEAD")
                git(root, "switch", "-c", "codex/foreign")
                foreign = manifest(base, "WS-fedcba9876543210fedcba9876543210")
                foreign["branch"] = "codex/foreign"
                foreign["status"] = status
                foreign_path = (
                    root
                    / "docs/brain/workstreams"
                    / foreign["workstream_id"]
                    / "manifest.json"
                )
                write(foreign_path, json.dumps(foreign, ensure_ascii=False))
                write(root / "tools/brain/brain.py", "foreign implementation\n")
                git(root, "add", ".")
                git(root, "commit", "-m", "foreign result")
                result_sha = git(root, "rev-parse", "HEAD")
                if status == "submitted":
                    foreign["result_sha"] = result_sha
                    foreign["manifest_revision"] = 2
                    previous = {**foreign, "status": "active", "result_sha": None}
                    previous["manifest_revision"] = 1
                    previous["base_manifest_hash"] = None
                    foreign["base_manifest_hash"] = project.manifest_digest(previous)
                    write(foreign_path, json.dumps(foreign, ensure_ascii=False))
                    git(root, "add", str(foreign_path.relative_to(root)))
                    git(root, "commit", "-m", "submit foreign result")
                git(root, "switch", "main")
                git(root, "merge", "--ff-only", "codex/foreign")
                current = manifest(base)
                current["branch"] = "main"
                current_path = (
                    root
                    / "docs/brain/workstreams"
                    / current["workstream_id"]
                    / "manifest.json"
                )
                write(current_path, json.dumps(current, ensure_ascii=False))
                report = project.conflict_report(current_path, strict=True)
                has_declared_conflict = any(
                    item["code"] == "PATH_WRITE_WRITE" for item in report["hard"]
                )
                self.assertEqual(has_declared_conflict, status != "submitted")

    def test_invalid_terminal_drift_and_dirty_overlap_remain_hard(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as worktree_tmp:
            root = create_project(Path(tmp))
            project = BrainProject(root)
            base = git(root, "rev-parse", "HEAD")
            git(root, "switch", "-c", "codex/terminal")
            terminal = manifest(base, "WS-fedcba9876543210fedcba9876543210")
            terminal["branch"] = "codex/terminal"
            terminal["status"] = "integrated"
            terminal["result_sha"] = base
            terminal_path = (
                root
                / "docs/brain/workstreams"
                / terminal["workstream_id"]
                / "manifest.json"
            )
            write(terminal_path, json.dumps(terminal, ensure_ascii=False))
            write(root / "tools/brain/brain.py", "terminal branch content\n")
            git(root, "add", ".")
            git(root, "commit", "-m", "terminal branch")
            git(root, "switch", "main")
            current = manifest(base)
            current["branch"] = "main"
            current_path = (
                root / "docs/brain/workstreams" / current["workstream_id"] / "manifest.json"
            )
            write(current_path, json.dumps(current, ensure_ascii=False))
            dormant = project.conflict_report(current_path, strict=True)
            self.assertTrue(
                any(item["code"] == "TERMINAL_RESULT_DRIFT" for item in dormant["hard"])
            )
            other_root = Path(worktree_tmp) / "terminal"
            git(root, "worktree", "add", str(other_root), "codex/terminal")
            write(other_root / "tools/brain/brain.py", "dirty terminal worktree\n")
            active = project.conflict_report(current_path, strict=True)
            self.assertTrue(
                any(item["code"] == "TERMINAL_WORKTREE_PRESENT" for item in active["warnings"])
            )
            self.assertTrue(
                any(item["code"] == "UNMANAGED_DIRTY_OVERLAP" for item in active["hard"])
            )

    def test_valid_integrated_result_releases_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            project = BrainProject(root)
            base = git(root, "rev-parse", "HEAD")
            git(root, "switch", "-c", "codex/integrated")
            terminal = manifest(base, "WS-fedcba9876543210fedcba9876543210")
            terminal["branch"] = "codex/integrated"
            terminal_path = (
                root
                / "docs/brain/workstreams"
                / terminal["workstream_id"]
                / "manifest.json"
            )
            write(terminal_path, json.dumps(terminal, ensure_ascii=False))
            write(root / "tools/brain/brain.py", "integrated result\n")
            git(root, "add", ".")
            git(root, "commit", "-m", "implementation")
            result_sha = git(root, "rev-parse", "HEAD")
            active_digest = project.manifest_digest(terminal)
            terminal["status"] = "integrated"
            terminal["result_sha"] = result_sha
            terminal["manifest_revision"] = 2
            terminal["base_manifest_hash"] = active_digest
            write(terminal_path, json.dumps(terminal, ensure_ascii=False))
            git(root, "add", str(terminal_path.relative_to(root)))
            git(root, "commit", "-m", "terminal revision")
            git(root, "switch", "main")
            git(root, "merge", "--ff-only", "codex/integrated")
            current = manifest(base)
            current["branch"] = "main"
            current_path = (
                root / "docs/brain/workstreams" / current["workstream_id"] / "manifest.json"
            )
            write(current_path, json.dumps(current, ensure_ascii=False))
            report = project.conflict_report(current_path, strict=True)
            self.assertFalse(
                any(
                    item["code"]
                    in {
                        "TERMINAL_RESULT_INVALID",
                        "TERMINAL_RESULT_DRIFT",
                        "MANAGED_ACTUAL_PATH_OVERLAP",
                    }
                    for item in report["hard"]
                )
            )

    def test_current_manifest_must_match_branch_and_freeze_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            project = BrainProject(root)
            base = git(root, "rev-parse", "HEAD")
            current = manifest(base)
            current_path = (
                root / "docs/brain/workstreams" / current["workstream_id"] / "manifest.json"
            )
            write(current_path, json.dumps(current, ensure_ascii=False))
            with self.assertRaisesRegex(BrainFailure, "CURRENT_MANIFEST_BRANCH"):
                project.conflict_report(current_path, strict=True)
            current["branch"] = "main"
            current["status"] = "submitted"
            current["result_sha"] = base
            write(current_path, json.dumps(current, ensure_ascii=False))
            write(root / "tools/brain/brain.py", "post-submit drift\n")
            git(root, "add", ".")
            git(root, "commit", "-m", "drift after frozen result")
            report = project.conflict_report(current_path, strict=True)
            self.assertTrue(
                any(
                    item["code"] == "CURRENT_SUBMITTED_RESULT_DRIFT"
                    for item in report["hard"]
                )
            )

    def test_detached_worktree_overlap_is_inspected(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as worktree_tmp:
            root = create_project(Path(tmp))
            project = BrainProject(root)
            base = git(root, "rev-parse", "HEAD")
            git(root, "switch", "-c", "codex/detached-source")
            write(root / "tools/brain/brain.py", "detached implementation\n")
            git(root, "add", "tools/brain/brain.py")
            git(root, "commit", "-m", "detached overlap")
            detached_sha = git(root, "rev-parse", "HEAD")
            git(root, "switch", "main")
            current = manifest(base)
            current["branch"] = "main"
            current_path = (
                root / "docs/brain/workstreams" / current["workstream_id"] / "manifest.json"
            )
            write(current_path, json.dumps(current, ensure_ascii=False))
            other_root = Path(worktree_tmp) / "detached"
            git(root, "worktree", "add", "--detach", str(other_root), detached_sha)
            report = project.conflict_report(current_path, strict=True)
            self.assertTrue(
                any(item["code"] == "ACTIVE_DETACHED_PATH_OVERLAP" for item in report["hard"])
            )


if __name__ == "__main__":
    unittest.main()
