from __future__ import annotations

import importlib.util
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).resolve().parents[1] / "ops" / "mail_canary.py"
SPEC = importlib.util.spec_from_file_location("mail_canary_under_test", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
mail_canary = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mail_canary
SPEC.loader.exec_module(mail_canary)


def smtp_settings():
    return {
        "SMTP_HOST": "smtp.example.test",
        "SMTP_PORT": "465",
        "SMTP_USER": "canary-user",
        "SMTP_PASS": "very-secret-password",
        "SMTP_FROM": "canary@example.test",
        "SMTP_FROM_NAME": "Canary",
        "SMTP_TLS": "ssl",
        "IMAP_HOST": "",
        "IMAP_PORT": "",
        "IMAP_TLS": "",
        "IMAP_MAILBOX": "",
    }


class FakeSMTP:
    latest = None

    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
        self.login_args = None
        self.message = None
        self.from_addr = None
        self.to_addrs = None
        FakeSMTP.latest = self

    def login(self, user, password):
        self.login_args = (user, password)

    def send_message(self, message, from_addr=None, to_addrs=None):
        self.message = message
        self.from_addr = from_addr
        self.to_addrs = to_addrs

    def quit(self):
        return 221, b"bye"

    def close(self):
        return None


class FakeIMAP:
    latest = None

    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
        self.login_args = None
        self.select_args = None
        self.search_args = None
        FakeIMAP.latest = self

    def login(self, user, password):
        self.login_args = (user, password)
        return "OK", [b"logged in"]

    def select(self, mailbox, readonly=False):
        self.select_args = (mailbox, readonly)
        return "OK", [b"1"]

    def uid(self, *args):
        self.search_args = args
        return "OK", [b"42"]

    def logout(self):
        return "BYE", [b"logged out"]


class MailCanaryTests(unittest.TestCase):
    def test_dotenv_values_are_literal_and_never_executed(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            side_effect = root / "must-not-exist"
            env_path = root / ".env"
            env_path.write_text(
                "SMTP_HOST=smtp.example.test\n"
                "SMTP_USER='literal-user'\n"
                f"SMTP_PASS=$(touch {side_effect})\n"
                'SMTP_FROM="canary@example.test" # safe comment\n',
                encoding="utf-8",
            )

            parsed = mail_canary.parse_dotenv(env_path)

            self.assertEqual(parsed["SMTP_PASS"], f"$(touch {side_effect})")
            self.assertEqual(parsed["SMTP_USER"], "literal-user")
            self.assertFalse(side_effect.exists())

    def test_smtp_envelope_has_exactly_smtp_from_as_recipient(self):
        settings = smtp_settings()
        marker = "0123456789abcdef"
        with mock.patch.object(mail_canary.smtplib, "SMTP_SSL", FakeSMTP):
            result = mail_canary._send_canary(settings, marker, 5.0)

        client = FakeSMTP.latest
        self.assertTrue(result["connected"])
        self.assertTrue(result["authenticated"])
        self.assertTrue(result["sent"])
        self.assertEqual(
            client.login_args,
            (settings["SMTP_USER"], settings["SMTP_PASS"]),
        )
        self.assertEqual(client.from_addr, settings["SMTP_FROM"])
        self.assertEqual(client.to_addrs, [settings["SMTP_FROM"]])
        self.assertEqual(client.message["To"], settings["SMTP_FROM"])
        self.assertEqual(client.message["X-Akademsalon-Canary-ID"], marker)

    def test_missing_imap_is_unknown_but_does_not_fail_smtp(self):
        settings = smtp_settings()
        with mock.patch.object(mail_canary.smtplib, "SMTP_SSL", FakeSMTP):
            result = mail_canary.run_canary(
                settings, timeout=5.0, wait_seconds=0.0
            )

        self.assertTrue(result["ok"])
        self.assertTrue(result["smtp"]["sent"])
        self.assertEqual(result["imap"]["status"], "unknown")
        self.assertFalse(result["imap"]["received"])
        self.assertEqual(result["imap"]["category"], "imap_not_configured")

    def test_imap_uses_smtp_credentials_and_confirms_marker(self):
        settings = smtp_settings()
        settings.update(
            {
                "IMAP_HOST": "imap.example.test",
                "IMAP_PORT": "993",
                "IMAP_TLS": "ssl",
                "IMAP_MAILBOX": "INBOX",
            }
        )
        marker = "fedcba9876543210"
        with mock.patch.object(mail_canary.imaplib, "IMAP4_SSL", FakeIMAP):
            result = mail_canary._check_imap(settings, marker, 5.0, 0.0)

        client = FakeIMAP.latest
        self.assertEqual(
            client.login_args,
            (settings["SMTP_USER"], settings["SMTP_PASS"]),
        )
        self.assertEqual(client.select_args, ("INBOX", True))
        self.assertIn(marker, client.search_args)
        self.assertTrue(result["received"])
        self.assertEqual(result["status"], "confirmed")

    def test_exception_text_and_configuration_secrets_never_enter_json(self):
        class ExplodingSMTP:
            def __init__(self, *args, **kwargs):
                raise OSError(
                    "very-secret-password canary-user canary@example.test"
                )

        settings = smtp_settings()
        with mock.patch.object(mail_canary.smtplib, "SMTP_SSL", ExplodingSMTP):
            result = mail_canary.run_canary(
                settings, timeout=5.0, wait_seconds=0.0
            )
        rendered = json.dumps(result, sort_keys=True)

        self.assertNotIn(settings["SMTP_PASS"], rendered)
        self.assertNotIn(settings["SMTP_USER"], rendered)
        self.assertNotIn(settings["SMTP_FROM"], rendered)
        self.assertEqual(result["smtp"]["category"], "smtp_unavailable")

    def test_invalid_cli_value_still_emits_only_sanitised_json(self):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            exit_code = mail_canary.main(["--timeout", "secret-cli-value"])

        payload = stdout.getvalue()
        self.assertEqual(exit_code, 1)
        self.assertEqual(stderr.getvalue(), "")
        self.assertNotIn("secret-cli-value", payload)
        self.assertFalse(json.loads(payload)["ok"])
        self.assertEqual(payload.count("\n"), 1)


if __name__ == "__main__":
    unittest.main()
