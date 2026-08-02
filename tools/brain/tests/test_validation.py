from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from helpers import create_project, write
from tools.brain.brain import BrainFailure, BrainProject


class ValidationTests(unittest.TestCase):
    def project(self, root: Path) -> BrainProject:
        return BrainProject(root)

    def test_valid_markdown_projection_builds_records_and_generic_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            snapshot = self.project(root).validate(strict=True)
            self.assertIn("OUT-001", snapshot.records)
            self.assertIn("JRN-001", snapshot.records)
            self.assertIn(("OUT-001", "JRN-001"), snapshot.links)
            self.assertNotIn("DEC-0005", snapshot.records["DEC-0006"].body)

    def test_duplicate_definition_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            path = root / "docs/brain/ROADMAP.md"
            path.write_text(path.read_text() + "\n### OUT-001 — duplicate\n", encoding="utf-8")
            with self.assertRaisesRegex(BrainFailure, "DUPLICATE_ID"):
                self.project(root).validate(strict=True)

    def test_dangling_numeric_reference_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            path = root / "docs/brain/ROADMAP.md"
            path.write_text(path.read_text().replace("JRN-001", "JRN-999"), encoding="utf-8")
            with self.assertRaisesRegex(BrainFailure, "DANGLING_ID"):
                self.project(root).validate(strict=True)

    def test_duplicate_json_key_and_nan_fail_without_value_echo(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            catalog = root / "docs/brain/catalog.json"
            catalog.write_text('{"schema_version":1,"schema_version":2}', encoding="utf-8")
            with self.assertRaisesRegex(BrainFailure, "JSON_DUPLICATE_KEY"):
                self.project(root).validate(strict=True)
            catalog.write_text('{"schema_version":NaN}', encoding="utf-8")
            with self.assertRaisesRegex(BrainFailure, "JSON_CONSTANT"):
                self.project(root).validate(strict=True)

    def test_model_review_cannot_close_hard_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            write(
                root / "docs/brain/evidence/E-0001.md",
                "# E-0001 — review\n\nsource_type: model-review\ncloses_gate: G7\n",
            )
            with self.assertRaisesRegex(BrainFailure, "MODEL_REVIEW_GATE"):
                self.project(root).validate(strict=True)

    def test_policy_must_match_catalog_and_contains_no_free_form_proof(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            policy = root / "docs/brain/workstream-policy.json"
            data = json.loads(policy.read_text(encoding="utf-8"))
            data["canonical_ref"] = "origin/other"
            policy.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(BrainFailure, "POLICY_CANONICAL_REF"):
                self.project(root).validate(strict=True)
            data["canonical_ref"] = "refs/heads/main"
            data["proof_command_ids"] = ["python -c dangerous"]
            policy.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(BrainFailure, "POLICY_PROOF_IDS"):
                self.project(root).validate(strict=True)

    def test_unknown_record_schema_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            catalog = root / "docs/brain/catalog.json"
            data = json.loads(catalog.read_text(encoding="utf-8"))
            data["record_schema_version"] = 2
            catalog.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(BrainFailure, "RECORD_SCHEMA"):
                self.project(root).validate(strict=True)

    def test_record_definition_outside_canonical_owner_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = create_project(Path(tmp))
            write(
                root / "docs/brain/plans/hidden-decision.md",
                "# Plan\n\n| `DEC-0008` | accepted | hidden truth | none | never |\n",
            )
            with self.assertRaisesRegex(BrainFailure, "RECORD_SOURCE_UNPARSED"):
                self.project(root).validate(strict=True)


if __name__ == "__main__":
    unittest.main()
