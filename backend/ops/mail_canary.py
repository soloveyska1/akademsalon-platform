#!/usr/bin/env python3
"""Bounded SMTP/IMAP delivery canary with secret-safe JSON output.

The canary reads ``backend/.env`` without invoking a shell, authenticates to
SMTP, and sends one uniquely marked message whose envelope sender and sole
recipient are both exactly ``SMTP_FROM``.  When ``IMAP_HOST`` is configured,
it then looks for that marker in ``IMAP_MAILBOX`` using the same username and
password as SMTP.

Recognised optional IMAP settings:
    IMAP_HOST, IMAP_PORT, IMAP_TLS (ssl|starttls), IMAP_MAILBOX

An absent or unusable IMAP configuration makes delivery confirmation
``unknown``.  It does not turn a successful SMTP submission into a failure.
No address, username, password, port, marker, message subject, exception text,
or dotenv path is included in output.
"""
from __future__ import annotations

import argparse
import contextlib
import imaplib
import ipaddress
import json
import os
import re
import secrets
import smtplib
import socket
import ssl
import sys
import time
from email.message import EmailMessage
from email.utils import formataddr, parseaddr
from pathlib import Path
from typing import Any, Dict, Mapping, Optional


_MAX_DOTENV_BYTES = 256 * 1024
_ENV_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_DNS_LABEL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
_EMAIL_RE = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$"
)
_KNOWN_KEYS = {
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "SMTP_FROM_NAME",
    "SMTP_TLS",
    "IMAP_HOST",
    "IMAP_PORT",
    "IMAP_TLS",
    "IMAP_MAILBOX",
}


class DotenvError(ValueError):
    """A dotenv file is too large, malformed, or not valid UTF-8."""


class ConfigError(ValueError):
    """Canary configuration is absent or unsafe."""


def _quoted_value(raw: str, quote: str) -> str:
    """Parse one dotenv quoted value without expansion or evaluation."""
    chars = []
    index = 1
    closed = False
    while index < len(raw):
        char = raw[index]
        if char == quote:
            closed = True
            index += 1
            break
        if quote == '"' and char == "\\":
            index += 1
            if index >= len(raw):
                raise DotenvError("unterminated escape")
            escaped = raw[index]
            replacements = {
                "n": "\n",
                "r": "\r",
                "t": "\t",
                '"': '"',
                "\\": "\\",
            }
            if escaped in replacements:
                chars.append(replacements[escaped])
            else:
                # Unknown escapes stay literal.  In particular, no shell-like
                # interpolation is ever performed.
                chars.append("\\")
                chars.append(escaped)
        else:
            chars.append(char)
        index += 1

    if not closed:
        raise DotenvError("unterminated quote")
    trailing = raw[index:].strip()
    if trailing and not trailing.startswith("#"):
        raise DotenvError("characters after quoted value")
    return "".join(chars)


def _dotenv_value(raw: str) -> str:
    raw = raw.strip()
    if not raw:
        return ""
    if raw[0] in {"'", '"'}:
        return _quoted_value(raw, raw[0])
    # An unquoted # starts a comment only when whitespace precedes it.  This
    # keeps URL fragments and password characters literal.
    return re.sub(r"\s+#.*$", "", raw).rstrip()


def parse_dotenv(path: Path) -> Dict[str, str]:
    """Read KEY=VALUE lines literally; never source, expand, or execute them."""
    try:
        if not path.exists():
            return {}
        if path.stat().st_size > _MAX_DOTENV_BYTES:
            raise DotenvError("dotenv too large")
        content = path.read_bytes().decode("utf-8-sig")
    except DotenvError:
        raise
    except (OSError, UnicodeError) as exc:
        raise DotenvError("dotenv unreadable") from exc

    parsed: Dict[str, str] = {}
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export") and len(line) > 6 and line[6].isspace():
            line = line[7:].lstrip()
        if "=" not in line:
            raise DotenvError("dotenv line has no assignment")
        key, raw_value = line.split("=", 1)
        key = key.strip()
        if not _ENV_KEY_RE.fullmatch(key):
            raise DotenvError("invalid dotenv key")
        parsed[key] = _dotenv_value(raw_value)
    return parsed


def load_settings(
    path: Path, environ: Optional[Mapping[str, str]] = None
) -> Dict[str, str]:
    """Load selected settings, with the real process environment taking priority."""
    file_values = parse_dotenv(path)
    process_values = os.environ if environ is None else environ
    return {
        key: process_values[key] if key in process_values else file_values.get(key, "")
        for key in _KNOWN_KEYS
    }


def _safe_host(raw: str) -> str:
    """Validate and normalise a hostname before it can be used or displayed."""
    host = raw.strip().rstrip(".")
    if not host or len(host) > 253:
        raise ConfigError("invalid host")
    if any(char.isspace() or ord(char) < 33 for char in host):
        raise ConfigError("invalid host")
    if any(token in host for token in ("/", "\\", "@", "://")):
        raise ConfigError("invalid host")

    if host.startswith("[") and host.endswith("]"):
        host = host[1:-1]
    if ":" in host:
        try:
            return ipaddress.ip_address(host).compressed
        except ValueError as exc:
            raise ConfigError("invalid host") from exc

    try:
        ascii_host = host.encode("idna").decode("ascii").lower()
    except UnicodeError as exc:
        raise ConfigError("invalid host") from exc
    if not all(_DNS_LABEL_RE.fullmatch(label) for label in ascii_host.split(".")):
        raise ConfigError("invalid host")
    return ascii_host


def _mailbox(raw: str) -> str:
    mailbox = raw.strip() or "INBOX"
    if (
        len(mailbox) > 128
        or any(ord(char) < 32 or ord(char) == 127 for char in mailbox)
        or "\r" in mailbox
        or "\n" in mailbox
    ):
        raise ConfigError("invalid mailbox")
    return mailbox


def _sender_address(raw: str) -> str:
    address = raw.strip()
    _display_name, parsed = parseaddr(address)
    if (
        not address
        or address != parsed
        or "\r" in address
        or "\n" in address
        or not _EMAIL_RE.fullmatch(address)
    ):
        raise ConfigError("invalid sender")
    return address


def _display_name(raw: str) -> str:
    name = raw.strip() or "Академический Салон"
    if len(name) > 100 or any(ord(char) < 32 or ord(char) == 127 for char in name):
        raise ConfigError("invalid display name")
    return name


def _port(raw: str, default: int) -> int:
    try:
        value = int(raw.strip() or str(default))
    except (TypeError, ValueError) as exc:
        raise ConfigError("invalid port") from exc
    if value < 1 or value > 65535:
        raise ConfigError("invalid port")
    return value


def _bounded_number(
    value: Any, default: float, minimum: float, maximum: float
) -> float:
    if value is None or value == "":
        return default
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ConfigError("invalid duration") from exc
    if number < minimum or number > maximum:
        raise ConfigError("invalid duration")
    return number


def _smtp_tls_mode(raw: str, port: int) -> str:
    mode = raw.strip().lower()
    if not mode:
        return "ssl" if port == 465 else "starttls"
    if mode not in {"ssl", "starttls"}:
        raise ConfigError("insecure or unsupported SMTP mode")
    return mode


def _imap_tls_mode(raw: str, port_text: str) -> str:
    mode = raw.strip().lower()
    if not mode:
        return "starttls" if port_text.strip() == "143" else "ssl"
    if mode not in {"ssl", "starttls"}:
        raise ConfigError("insecure or unsupported IMAP mode")
    return mode


def _smtp_state(host: str = "", category: str = "not_attempted") -> Dict[str, Any]:
    return {
        "host": host,
        "connected": False,
        "authenticated": False,
        "sent": False,
        "category": category,
    }


def _imap_state(host: str = "", category: str = "not_attempted") -> Dict[str, Any]:
    return {
        "host": host,
        "connected": False,
        "authenticated": False,
        "received": False,
        "status": "unknown",
        "category": category,
    }


def _safe_close_smtp(client: Optional[smtplib.SMTP]) -> None:
    if client is None:
        return
    try:
        client.quit()
    except Exception:
        with contextlib.suppress(Exception):
            client.close()


def _send_canary(
    settings: Mapping[str, str], marker: str, timeout: float
) -> Dict[str, Any]:
    """Submit a single message to SMTP_FROM and return only sanitised state."""
    state = _smtp_state()
    client: Optional[smtplib.SMTP] = None
    stage = "config"
    try:
        host = _safe_host(settings.get("SMTP_HOST", ""))
        state["host"] = host
        user = settings.get("SMTP_USER", "").strip()
        password = settings.get("SMTP_PASS", "")
        if not user or not password:
            raise ConfigError("credentials missing")
        sender = _sender_address(settings.get("SMTP_FROM", ""))
        sender_name = _display_name(settings.get("SMTP_FROM_NAME", ""))

        tls_text = settings.get("SMTP_TLS", "").strip().lower()
        default_port = 587 if tls_text == "starttls" else 465
        port = _port(settings.get("SMTP_PORT", ""), default_port)
        mode = _smtp_tls_mode(tls_text, port)
        context = ssl.create_default_context()
        local_hostname = sender.rsplit("@", 1)[1]

        stage = "connect"
        if mode == "ssl":
            client = smtplib.SMTP_SSL(
                host,
                port,
                local_hostname=local_hostname,
                context=context,
                timeout=timeout,
            )
        else:
            client = smtplib.SMTP(
                host, port, local_hostname=local_hostname, timeout=timeout
            )
        state["connected"] = True

        stage = "tls"
        if mode == "starttls":
            client.ehlo()
            client.starttls(context=context)
            client.ehlo()

        stage = "auth"
        client.login(user, password)
        state["authenticated"] = True

        message = EmailMessage()
        message["From"] = formataddr((sender_name, sender))
        message["To"] = sender
        message["Subject"] = "Mail delivery canary " + marker
        message["X-Akademsalon-Canary-ID"] = marker
        message["Auto-Submitted"] = "auto-generated"
        message["X-Auto-Response-Suppress"] = "All"
        message.set_content(
            "Automated delivery canary. No customer or order data is included.\n"
            "Canary ID: " + marker
        )

        stage = "send"
        # Explicit envelope values enforce the single-recipient invariant even
        # if message headers are changed later.
        client.send_message(message, from_addr=sender, to_addrs=[sender])
        state["sent"] = True
        state["category"] = "sent"
    except ConfigError:
        state["category"] = "config_invalid"
    except smtplib.SMTPAuthenticationError:
        state["category"] = "smtp_auth_failed"
    except smtplib.SMTPNotSupportedError:
        state["category"] = (
            "smtp_auth_unsupported" if stage == "auth" else "smtp_protocol_error"
        )
    except smtplib.SMTPRecipientsRefused:
        state["category"] = "smtp_recipient_refused"
    except smtplib.SMTPSenderRefused:
        state["category"] = "smtp_sender_refused"
    except smtplib.SMTPDataError:
        state["category"] = "smtp_message_rejected"
    except ssl.SSLError:
        state["category"] = "smtp_tls_failed"
    except (socket.timeout, TimeoutError):
        state["category"] = "smtp_timeout"
    except smtplib.SMTPException:
        state["category"] = "smtp_protocol_error"
    except (socket.gaierror, ConnectionError, OSError):
        state["category"] = "smtp_unavailable"
    except Exception:
        # Exception text is deliberately discarded: libraries often include
        # usernames, addresses, server replies, or connection details in it.
        state["category"] = "smtp_internal_error"
    finally:
        _safe_close_smtp(client)
    return state


def _safe_logout_imap(client: Optional[imaplib.IMAP4]) -> None:
    if client is None:
        return
    with contextlib.suppress(Exception):
        client.logout()


def _check_imap(
    settings: Mapping[str, str], marker: str, timeout: float, wait_seconds: float
) -> Dict[str, Any]:
    """Look for the marker over IMAP; every failure remains an unknown state."""
    raw_host = settings.get("IMAP_HOST", "").strip()
    if not raw_host:
        return _imap_state(category="imap_not_configured")

    state = _imap_state()
    client: Optional[imaplib.IMAP4] = None
    stage = "config"
    try:
        host = _safe_host(raw_host)
        state["host"] = host
        user = settings.get("SMTP_USER", "").strip()
        password = settings.get("SMTP_PASS", "")
        if not user or not password:
            raise ConfigError("credentials missing")

        port_text = settings.get("IMAP_PORT", "")
        mode = _imap_tls_mode(settings.get("IMAP_TLS", ""), port_text)
        port = _port(port_text, 993 if mode == "ssl" else 143)
        mailbox = _mailbox(settings.get("IMAP_MAILBOX", ""))
        context = ssl.create_default_context()

        stage = "connect"
        if mode == "ssl":
            client = imaplib.IMAP4_SSL(
                host, port, ssl_context=context, timeout=timeout
            )
        else:
            client = imaplib.IMAP4(host, port, timeout=timeout)
        state["connected"] = True

        stage = "tls"
        if mode == "starttls":
            client.starttls(ssl_context=context)

        stage = "auth"
        client.login(user, password)
        state["authenticated"] = True

        stage = "select"
        status, _data = client.select(mailbox, readonly=True)
        if status != "OK":
            state["category"] = "imap_select_failed"
            return state

        stage = "search"
        deadline = time.monotonic() + wait_seconds
        while True:
            status, data = client.uid(
                "SEARCH",
                None,
                "HEADER",
                "X-Akademsalon-Canary-ID",
                marker,
            )
            if status != "OK":
                state["category"] = "imap_search_failed"
                return state
            if data and any(part for part in data[0].split()):
                state["received"] = True
                state["status"] = "confirmed"
                state["category"] = "received"
                return state
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                state["category"] = "imap_not_observed_before_timeout"
                return state
            time.sleep(min(2.0, remaining))
    except ConfigError:
        state["category"] = "imap_config_invalid"
    except ssl.SSLError:
        state["category"] = "imap_tls_failed"
    except (socket.timeout, TimeoutError):
        state["category"] = "imap_timeout"
    except (socket.gaierror, ConnectionError, OSError):
        state["category"] = "imap_unavailable"
    except imaplib.IMAP4.error:
        state["category"] = (
            "imap_auth_failed" if stage == "auth" else "imap_protocol_error"
        )
    except Exception:
        state["category"] = "imap_internal_error"
    finally:
        _safe_logout_imap(client)
    return state


def _empty_result(category: str) -> Dict[str, Any]:
    return {
        "ok": False,
        "smtp": _smtp_state(category=category),
        "imap": _imap_state(category="not_attempted"),
    }


def run_canary(
    settings: Mapping[str, str],
    timeout: Any = None,
    wait_seconds: Any = None,
) -> Dict[str, Any]:
    """Run one SMTP submission and, when possible, bounded IMAP confirmation."""
    try:
        operation_timeout = _bounded_number(timeout, 12.0, 2.0, 30.0)
        confirmation_wait = _bounded_number(wait_seconds, 30.0, 0.0, 120.0)
    except ConfigError:
        return _empty_result("config_invalid")

    marker = secrets.token_hex(16)
    smtp_state = _send_canary(settings, marker, operation_timeout)
    if smtp_state["sent"]:
        imap_state = _check_imap(
            settings, marker, operation_timeout, confirmation_wait
        )
    else:
        imap_state = _imap_state(category="not_attempted")
    return {
        # SMTP acceptance is the canary's success criterion.  IMAP is stronger
        # evidence when available, but its absence is explicitly non-fatal.
        "ok": bool(smtp_state["sent"]),
        "smtp": smtp_state,
        "imap": imap_state,
    }


class _QuietArgumentParser(argparse.ArgumentParser):
    """Turn malformed CLI input into the same sanitised JSON contract."""

    def error(self, message: str) -> None:
        del message
        raise ConfigError("invalid arguments")


def _parser() -> argparse.ArgumentParser:
    default_env = Path(__file__).resolve().parents[1] / ".env"
    parser = _QuietArgumentParser(
        description="Send a secret-safe SMTP canary and optionally confirm it via IMAP."
    )
    parser.add_argument(
        "--env",
        type=Path,
        default=default_env,
        help="dotenv file (default: backend/.env)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=None,
        help="per-operation timeout in seconds (2..30; default: 12)",
    )
    parser.add_argument(
        "--wait",
        type=float,
        default=None,
        help="IMAP observation window in seconds (0..120; default: 30)",
    )
    return parser


def main(argv: Optional[list] = None) -> int:
    try:
        args = _parser().parse_args(argv)
        settings = load_settings(args.env)
        result = run_canary(settings, timeout=args.timeout, wait_seconds=args.wait)
    except (DotenvError, ConfigError):
        result = _empty_result("config_invalid")
    except Exception:
        # Keep all unexpected library/path details out of both stdout and
        # stderr.  Automation gets one predictable JSON document.
        result = _empty_result("internal_error")

    sys.stdout.write(
        json.dumps(result, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
        + "\n"
    )
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
