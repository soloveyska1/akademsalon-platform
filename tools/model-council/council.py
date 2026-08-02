#!/usr/bin/env python3
"""Portable, sequential model council for Akademsalon; no local models or daemons."""

from __future__ import annotations

import argparse
import base64
from datetime import datetime
import json
import mimetypes
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / ".brain" / "council"
KEYCHAIN_ACCOUNT = "sayseemi3@gmail.com"
TOKENROUTER_SERVICE = "akademsalon-tokenrouter-api"
ZAI_SERVICE = "akademsalon-zai-api"
TOKENROUTER_ENDPOINT = "https://api.tokenrouter.com/v1/chat/completions"
ZAI_ENDPOINT = "https://api.z.ai/api/paas/v4/chat/completions"
KIMI_MODEL = os.environ.get("KIMI_COUNCIL_MODEL", "moonshotai/kimi-k3-free")
GLM_MODEL = os.environ.get("GLM_COUNCIL_MODEL", "glm-4.6v-flash")
CLAUDE_MODELS = {
    "sonnet": os.environ.get("CLAUDE_SONNET_MODEL", "sonnet"),
    "opus": os.environ.get("CLAUDE_OPUS_MODEL", "opus"),
    "fable": os.environ.get("CLAUDE_FABLE_MODEL", "fable"),
}
CLAUDE_EFFORT = {"sonnet": "high", "opus": "high", "fable": "low"}
CLAUDE_CANDIDATES = (
    Path.home() / ".hermes/node/bin/claude",
    Path("/opt/homebrew/bin/claude"),
)
PROVIDERS = ("kimi", "sonnet", "glm", "opus", "fable")


def keychain_secret(env_name: str, service: str) -> str:
    configured = os.environ.get(env_name, "").strip()
    if configured:
        return configured
    try:
        result = subprocess.run(
            [
                "/usr/bin/security",
                "find-generic-password",
                "-a",
                KEYCHAIN_ACCOUNT,
                "-s",
                service,
                "-w",
            ],
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""
    return result.stdout.strip() if result.returncode == 0 else ""


def claude_binary() -> Path | None:
    return next((path for path in CLAUDE_CANDIDATES if path.is_file()), None)


def doctor(providers: list[str]) -> int:
    states = {
        "kimi": bool(keychain_secret("TOKENROUTER_API_KEY", TOKENROUTER_SERVICE)),
        "glm": bool(keychain_secret("ZAI_API_KEY", ZAI_SERVICE)),
        "sonnet": claude_binary() is not None,
        "opus": claude_binary() is not None,
        "fable": claude_binary() is not None,
    }
    print("Akademsalon model council (credential and binary check; no inference)")
    for provider in providers:
        print(f"{provider}: {'READY' if states[provider] else 'MISSING'}")
    print("local_llm: DISABLED")
    print("background_services: NONE")
    return 0 if all(states[provider] for provider in providers) else 1


def request_json(url: str, payload: dict, headers: dict[str, str], timeout: int) -> dict:
    request = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", **headers},
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
    except (TimeoutError, URLError) as exc:
        raise RuntimeError(str(exc)) from exc


def openai_content(prompt: str, images: list[Path]) -> list[dict]:
    content: list[dict] = [{"type": "text", "text": prompt}]
    for path in images:
        mime = mimetypes.guess_type(path.name)[0] or "image/png"
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{encoded}"},
            }
        )
    return content


def call_kimi(prompt: str, images: list[Path], probe: bool) -> tuple[str, dict]:
    api_key = keychain_secret("TOKENROUTER_API_KEY", TOKENROUTER_SERVICE)
    if not api_key:
        raise RuntimeError("TokenRouter credential is unavailable")
    payload = {
        "model": KIMI_MODEL,
        "messages": [{"role": "user", "content": openai_content(prompt, images)}],
        "temperature": 0 if probe else 0.2,
        "reasoning_effort": "low",
        "max_tokens": 80 if probe else 8000,
    }
    data = request_json(
        TOKENROUTER_ENDPOINT,
        payload,
        {"Authorization": f"Bearer {api_key}"},
        timeout=180 if probe else 900,
    )
    message = ((data.get("choices") or [{}])[0].get("message") or {})
    answer = message.get("content") or message.get("reasoning_content")
    if not isinstance(answer, str) or not answer.strip():
        raise RuntimeError("Kimi returned an empty response")
    return answer.strip(), data.get("usage") or {}


def call_glm(prompt: str, images: list[Path], probe: bool) -> tuple[str, dict]:
    api_key = keychain_secret("ZAI_API_KEY", ZAI_SERVICE)
    if not api_key:
        raise RuntimeError("Z.AI credential is unavailable")
    payload = {
        "model": GLM_MODEL,
        "messages": [{"role": "user", "content": openai_content(prompt, images)}],
        "temperature": 0 if probe else 0.2,
        "max_tokens": 80 if probe else 6000,
    }
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            data = request_json(
                ZAI_ENDPOINT,
                payload,
                {"Authorization": f"Bearer {api_key}"},
                timeout=180 if probe else 900,
            )
            message = ((data.get("choices") or [{}])[0].get("message") or {})
            answer = message.get("content") or message.get("reasoning_content")
            if isinstance(answer, str) and answer.strip():
                return answer.strip(), data.get("usage") or {}
            raise RuntimeError("GLM returned an empty response")
        except RuntimeError as exc:
            last_error = exc
            if attempt == 3 or not any(
                marker in str(exc).lower()
                for marker in ("overload", "429", "http 5", "temporarily")
            ):
                raise
            time.sleep(2**attempt)
    raise RuntimeError(str(last_error or "GLM is unavailable"))


def call_claude(
    provider: str, prompt: str, images: list[Path], probe: bool
) -> tuple[str, dict]:
    binary = claude_binary()
    if binary is None:
        raise RuntimeError("Claude Code binary is unavailable")
    image_lines = "\n".join(f"- {path}" for path in images)
    full_prompt = prompt
    if images:
        full_prompt += "\n\nПрочитай приложенные изображения через Read:\n" + image_lines
    command = [
        str(binary),
        "-p",
        full_prompt,
        "--model",
        CLAUDE_MODELS[provider],
        "--effort",
        "low" if probe else CLAUDE_EFFORT[provider],
        "--tools",
        "Read",
        "--permission-mode",
        "dontAsk",
        "--no-session-persistence",
        "--output-format",
        "json",
        "--add-dir",
        str(ROOT),
    ]
    for parent in dict.fromkeys(path.parent for path in images):
        if parent != ROOT:
            command.extend(["--add-dir", str(parent)])
    result = subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=300 if probe else 1200,
        check=False,
    )
    try:
        data = json.loads(result.stdout.strip())
    except json.JSONDecodeError as exc:
        detail = result.stderr.strip()[:500] or result.stdout.strip()[:500]
        raise RuntimeError(f"Claude returned invalid JSON: {detail}") from exc
    answer = data.get("result")
    if data.get("is_error") or not isinstance(answer, str) or not answer.strip():
        raise RuntimeError(str(answer or data.get("terminal_reason") or "Claude failed"))
    return answer.strip(), data.get("usage") or {}


def standard_prompt(focus: str) -> str:
    return f"""Ты — независимый reviewer проекта «Академический Салон».
Работай только с переданным контекстом. Отделяй наблюдение от предположения.
Не предлагай менять production и не имитируй проверки, которых не выполнял.

Фокус: {focus}

Ответь по-русски в структуре:
- verdict: approve | revise | block
- confirmed_strengths
- issues: severity, evidence, user impact
- proposal
- validation_test
- confidence
""".strip()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--providers", default="kimi,sonnet,glm")
    parser.add_argument("--focus", default="критический UX, дизайн и путь клиента")
    parser.add_argument("--prompt-file")
    parser.add_argument("--image", action="append", dest="images")
    parser.add_argument("--output-dir")
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--doctor", action="store_true")
    parser.add_argument("--allow-fable", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    providers = [item.strip().lower() for item in args.providers.split(",") if item.strip()]
    unknown = sorted(set(providers) - set(PROVIDERS))
    if unknown:
        raise SystemExit("Unknown providers: " + ", ".join(unknown))
    if "fable" in providers and not args.allow_fable:
        raise SystemExit("Fable requires explicit --allow-fable")
    if args.doctor:
        return doctor(providers)

    images = [Path(item).expanduser().resolve() for item in (args.images or [])]
    missing = [str(path) for path in images if not path.is_file()]
    if missing:
        raise SystemExit("Missing images: " + ", ".join(missing))
    if args.probe:
        prompt = "Проверка связи. Ответь ровно одним словом: ГОТОВО."
    elif args.prompt_file:
        prompt = Path(args.prompt_file).expanduser().resolve().read_text(encoding="utf-8")
    else:
        prompt = standard_prompt(args.focus)

    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    output = Path(args.output_dir).expanduser().resolve() if args.output_dir else DEFAULT_OUTPUT / stamp
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    results = []
    for provider in providers:
        try:
            if provider == "kimi":
                answer, usage = call_kimi(prompt, images, args.probe)
            elif provider == "glm":
                answer, usage = call_glm(prompt, images, args.probe)
            else:
                answer, usage = call_claude(provider, prompt, images, args.probe)
            report = output / f"{provider}.md"
            report.write_text(f"# {provider}\n\n{answer}\n", encoding="utf-8")
            results.append({"provider": provider, "ok": True, "report": str(report), "usage": usage})
            print(f"READY {provider}")
        except Exception as exc:
            results.append({"provider": provider, "ok": False, "error": str(exc)})
            print(f"FAILED {provider}: {exc}", file=sys.stderr)
    status = output / "status.json"
    status.write_text(json.dumps({"providers": results}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"status: {status}")
    return 0 if results and all(item["ok"] for item in results) else 1


if __name__ == "__main__":
    sys.exit(main())
