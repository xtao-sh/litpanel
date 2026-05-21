from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncGenerator

import httpx


@dataclass(frozen=True)
class ProviderPreset:
    key: str
    label: str
    api_style: str
    default_base_url: str
    default_model: str
    description: str


@dataclass(frozen=True)
class StepDefinition:
    key: str
    label: str
    group: str
    description: str
    default_provider: str


PROVIDER_PRESETS: list[ProviderPreset] = [
    ProviderPreset(
        key="kimi_coding",
        label="Kimi Coding",
        api_style="anthropic",
        default_base_url="https://api.kimi.com/coding/",
        default_model="kimi-for-coding",
        description="Kimi Coding Anthropic-compatible endpoint for literature processing.",
    ),
    ProviderPreset(
        key="deepseek",
        label="DeepSeek",
        api_style="openai",
        default_base_url="https://api.deepseek.com/v1",
        default_model="deepseek-chat",
        description="DeepSeek OpenAI-compatible chat endpoint.",
    ),
    ProviderPreset(
        key="minimax",
        label="MiniMax",
        api_style="openai",
        default_base_url="https://api.minimax.io/v1",
        default_model="MiniMax-Text-01",
        description="MiniMax OpenAI-compatible endpoint.",
    ),
    ProviderPreset(
        key="openai",
        label="ChatGPT",
        api_style="openai",
        default_base_url="https://api.openai.com/v1",
        default_model="gpt-4.1-mini",
        description="OpenAI Chat Completions endpoint.",
    ),
    ProviderPreset(
        key="gemini",
        label="Gemini",
        api_style="openai",
        default_base_url="https://generativelanguage.googleapis.com/v1beta/openai",
        default_model="gemini-2.5-flash",
        description="Google Gemini OpenAI-compatible endpoint.",
    ),
    ProviderPreset(
        key="anthropic",
        label="Anthropic",
        api_style="anthropic",
        default_base_url="https://api.anthropic.com/v1",
        default_model="claude-3-5-sonnet-latest",
        description="Anthropic Messages API endpoint.",
    ),
]

PROVIDER_PRESET_MAP = {preset.key: preset for preset in PROVIDER_PRESETS}

STEP_DEFINITIONS: list[StepDefinition] = [
    StepDefinition("scanner", "Scanner", "pipeline", "Remote discovery triage and topic filtering.", "kimi_coding"),
    StepDefinition("scout", "Scout", "pipeline", "Lightweight paper reading and triage.", "kimi_coding"),
    StepDefinition("reader", "Reader", "pipeline", "Full paper extraction into structured cards.", "kimi_coding"),
    StepDefinition("linker", "Linker", "pipeline", "Cross-paper relation and map building.", "kimi_coding"),
    StepDefinition("thinker", "Thinker", "pipeline", "Idea generation from maps and cards.", "kimi_coding"),
    StepDefinition("critic", "Critic", "pipeline", "Idea evaluation and filtering.", "kimi_coding"),
    StepDefinition("rag", "Knowledge Chat", "workspace", "RAG, paper Q&A, idea generation, and contextual chat.", "kimi_coding"),
    StepDefinition("debate", "Debate", "workspace", "Debate and synthesis workflows.", "kimi_coding"),
]

STEP_DEFINITION_MAP = {step.key: step for step in STEP_DEFINITIONS}


class LLMError(Exception):
    """Base exception for runtime LLM failures."""


class LLMConnectionError(LLMError):
    """Raised when the configured provider cannot be reached."""


class LLMConfigurationError(ValueError):
    """Raised when a configured step/provider pairing is invalid or incomplete."""


class LLMStatusError(LLMError):
    def __init__(self, status_code: int, body: str = ""):
        super().__init__(f"LLM API returned status {status_code}: {body[:200]}")
        self.status_code = status_code
        self.body = body


class _TextBlock:
    def __init__(self, text: str):
        self.text = text


class LLMMessageResponse:
    def __init__(self, text: str, raw: Any = None):
        self.content = [_TextBlock(text)]
        self.raw = raw


def _repo_root() -> Path:
    return Path(__file__).resolve().parent


def _default_db_path() -> Path:
    env_path = (
        os.environ.get("KB_DB_PATH")
        or os.environ.get("NBER_KB_DB_PATH")
        or os.environ.get("APP_DB_PATH")
        or ""
    ).strip()
    if env_path:
        return Path(env_path).expanduser()
    return _repo_root() / "backend" / "kb.db"


def _normalize_endpoint(base_url: str, api_style: str) -> str:
    normalized = (base_url or "").strip().rstrip("/")
    if not normalized:
        normalized = PROVIDER_PRESET_MAP["kimi_coding"].default_base_url.rstrip("/")
    lower = normalized.lower()
    if api_style == "openai":
        if lower.endswith("/chat/completions"):
            return normalized
        return normalized + "/chat/completions"
    if lower.endswith("/messages"):
        return normalized
    if "api.kimi.com/coding" in lower and not lower.endswith("/v1"):
        return normalized + "/v1/messages"
    return normalized + "/messages"


def _load_openclaw_env() -> dict[str, str]:
    path = Path.home() / ".openclaw" / "openclaw.json"
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return {}
    env_payload = payload.get("env", {})
    if not isinstance(env_payload, dict):
        return {}
    return {str(key): str(value) for key, value in env_payload.items()}


def _load_legacy_env_provider() -> dict[str, str] | None:
    openclaw_env = _load_openclaw_env()
    api_key = (
        os.environ.get("LLM_API_KEY")
        or os.environ.get("KIMI_API_KEY")
        or openclaw_env.get("LLM_API_KEY")
        or openclaw_env.get("KIMI_API_KEY")
        or ""
    ).strip()
    base_url = (
        os.environ.get("LLM_API_BASE_URL")
        or os.environ.get("KB_LLM_API_BASE_URL")
        or os.environ.get("NBER_API_BASE_URL")
        or ""
    ).strip()
    model = (
        os.environ.get("LLM_API_MODEL")
        or os.environ.get("KB_LLM_MODEL")
        or os.environ.get("NBER_AGENT_MODEL")
        or ""
    ).strip()
    provider_key = "kimi_coding"
    lower = base_url.lower()
    if "anthropic" in lower:
        provider_key = "anthropic"
    elif "openai.com" in lower:
        provider_key = "openai"
    elif "deepseek" in lower:
        provider_key = "deepseek"
    elif "minimax" in lower:
        provider_key = "minimax"
    elif "googleapis.com" in lower or "gemini" in lower:
        provider_key = "gemini"
    elif "moonshot" in lower or "kimi" in lower:
        provider_key = "kimi_coding"

    preset = PROVIDER_PRESET_MAP.get(provider_key, PROVIDER_PRESET_MAP["kimi_coding"])
    if not (api_key or base_url or model):
        return None
    return {
        "provider": preset.key,
        "label": preset.label,
        "api_style": preset.api_style,
        "base_url": base_url or preset.default_base_url,
        "api_key": api_key,
        "api_key_hint": mask_api_key(api_key),
        "has_key": True if api_key else False,
        "default_model": model or preset.default_model,
        "enabled": True if api_key else False,
    }


def mask_api_key(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    if len(raw) <= 6:
        return "*" * len(raw)
    return f"{raw[:3]}***{raw[-4:]}"


def _keychain_service(db_path: str | Path | None = None) -> str:
    resolved = str(Path(db_path or _default_db_path()).expanduser().resolve())
    digest = hashlib.sha256(resolved.encode("utf-8")).hexdigest()[:16]
    return f"research-kb::{digest}"


def _keychain_account(provider: str) -> str:
    return f"ai-provider::{provider}"


def _run_security_command(args: list[str], *, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    if not Path("/usr/bin/security").exists():
        raise RuntimeError("macOS Keychain CLI is unavailable on this machine.")
    return subprocess.run(
        ["/usr/bin/security", *args],
        check=False,
        capture_output=True,
        text=True,
        input=input_text,
    )


def read_workspace_secret(
    provider: str,
    *,
    db_path: str | Path | None = None,
    keychain_account: str | None = None,
) -> str:
    if not Path("/usr/bin/security").exists():
        return ""
    service = _keychain_service(db_path)
    account = keychain_account or _keychain_account(provider)
    result = _run_security_command(["find-generic-password", "-a", account, "-s", service, "-w"])
    if result.returncode != 0:
        return ""
    return (result.stdout or "").strip()


def upsert_workspace_secret(
    provider: str,
    api_key: str,
    *,
    db_path: str | Path | None = None,
) -> dict[str, str]:
    secret = (api_key or "").strip()
    if not secret:
        return {
            "keychain_account": _keychain_account(provider),
            "api_key_hint": "",
        }
    service = _keychain_service(db_path)
    account = _keychain_account(provider)
    result = _run_security_command(
        ["add-generic-password", "-U", "-a", account, "-s", service, "-w", secret]
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "Keychain write failed").strip())
    return {
        "keychain_account": account,
        "api_key_hint": mask_api_key(secret),
    }


def delete_workspace_secret(
    provider: str,
    *,
    db_path: str | Path | None = None,
    keychain_account: str | None = None,
) -> None:
    service = _keychain_service(db_path)
    account = keychain_account or _keychain_account(provider)
    result = _run_security_command(["delete-generic-password", "-a", account, "-s", service])
    if result.returncode != 0:
        stderr = (result.stderr or result.stdout or "").lower()
        if "could not be found" in stderr or "item not found" in stderr:
            return
        raise RuntimeError((result.stderr or result.stdout or "Keychain delete failed").strip())


def build_runtime_override(
    *,
    step: str,
    provider: str,
    base_url: str,
    api_key: str,
    model: str,
) -> dict[str, Any]:
    provider_key = provider if provider in PROVIDER_PRESET_MAP else "kimi_coding"
    preset = PROVIDER_PRESET_MAP[provider_key]
    resolved_model = (model or "").strip() or preset.default_model
    resolved_base_url = (base_url or "").strip() or preset.default_base_url
    return {
        "step": step,
        "provider": provider_key,
        "provider_label": preset.label,
        "api_style": preset.api_style,
        "base_url": resolved_base_url,
        "api_key": (api_key or "").strip(),
        "model": resolved_model,
        "configured": bool((api_key or "").strip()),
    }


def get_catalog_payload() -> dict[str, list[dict[str, str]]]:
    return {
        "providers": [
            {
                "key": preset.key,
                "label": preset.label,
                "api_style": preset.api_style,
                "default_base_url": preset.default_base_url,
                "default_model": preset.default_model,
                "description": preset.description,
            }
            for preset in PROVIDER_PRESETS
        ],
        "steps": [
            {
                "key": step.key,
                "label": step.label,
                "group": step.group,
                "description": step.description,
                "default_provider": step.default_provider,
            }
            for step in STEP_DEFINITIONS
        ],
    }


def load_workspace_ai_settings(
    db_path: str | Path | None = None,
    *,
    include_secrets: bool = False,
) -> dict[str, Any]:
    resolved_db_path = Path(db_path or _default_db_path()).expanduser()
    provider_settings = {
        preset.key: {
            "provider": preset.key,
            "label": preset.label,
            "api_style": preset.api_style,
            "base_url": preset.default_base_url,
            "api_key": "",
            "api_key_hint": "",
            "has_key": False,
            "keychain_account": _keychain_account(preset.key),
            "default_model": preset.default_model,
            "enabled": False,
        }
        for preset in PROVIDER_PRESETS
    }
    step_configs = {
        step.key: {
            "step": step.key,
            "provider": step.default_provider,
            "model": "",
        }
        for step in STEP_DEFINITIONS
    }

    if resolved_db_path.exists():
        conn = sqlite3.connect(str(resolved_db_path))
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                "SELECT provider, label, api_style, base_url, api_key, api_key_hint, keychain_account, default_model, enabled FROM ai_provider_settings"
            ).fetchall()
            for row in rows:
                key = str(row["provider"])
                if key not in provider_settings:
                    continue
                keychain_account = str(row["keychain_account"] or _keychain_account(key))
                secret = read_workspace_secret(
                    key,
                    db_path=resolved_db_path,
                    keychain_account=keychain_account,
                )
                legacy_secret = str(row["api_key"] or "")
                provider_settings[key].update(
                    {
                        "label": row["label"],
                        "api_style": row["api_style"],
                        "base_url": row["base_url"],
                        "api_key": secret if include_secrets else "",
                        "api_key_hint": str(row["api_key_hint"] or mask_api_key(secret or legacy_secret)),
                        "has_key": bool(secret or legacy_secret),
                        "keychain_account": keychain_account,
                        "default_model": row["default_model"],
                        "enabled": bool(row["enabled"]),
                    }
                )

            rows = conn.execute(
                "SELECT step, provider, model FROM ai_step_configs"
            ).fetchall()
            for row in rows:
                key = str(row["step"])
                if key not in step_configs:
                    continue
                step_configs[key].update(
                    {
                        "provider": str(row["provider"] or ""),
                        "model": str(row["model"] or ""),
                    }
                )
        except sqlite3.OperationalError:
            pass
        finally:
            conn.close()

    legacy = _load_legacy_env_provider()
    if legacy:
        key = legacy["provider"]
        current = provider_settings.get(key)
        if current and not current.get("has_key"):
            provider_settings[key].update(
                {
                    "base_url": legacy["base_url"],
                    "default_model": legacy["default_model"],
                    "enabled": legacy["enabled"],
                    "has_key": legacy["has_key"],
                    "api_key_hint": legacy["api_key_hint"],
                    "api_key": legacy["api_key"] if include_secrets else "",
                }
            )
        for step in step_configs.values():
            if not step.get("provider"):
                step["provider"] = key

    return {
        "providers": provider_settings,
        "steps": step_configs,
    }


def resolve_step_runtime(step: str, db_path: str | Path | None = None) -> dict[str, Any]:
    settings = load_workspace_ai_settings(db_path=db_path, include_secrets=True)
    step_key = step if step in STEP_DEFINITION_MAP else "rag"
    step_config = settings["steps"].get(step_key, {})
    provider_key = str(step_config.get("provider") or "").strip()
    step_def = STEP_DEFINITION_MAP[step_key]
    if not provider_key:
        provider_key = step_def.default_provider

    provider_settings = settings["providers"]
    configured_provider = provider_settings.get(provider_key)
    legacy = _load_legacy_env_provider()
    no_saved_provider_keys = not any(
        bool(item.get("has_key")) for item in provider_settings.values()
    )
    if configured_provider is None:
        raise LLMConfigurationError(
            f"Step '{step_key}' references unknown provider '{provider_key}'. Update the AI step routing in Setup."
        )
    if (
        legacy
        and legacy.get("api_key")
        and no_saved_provider_keys
        and provider_key == step_def.default_provider
    ):
        configured_provider = legacy
        provider_key = legacy["provider"]
    if not configured_provider.get("enabled"):
        raise LLMConfigurationError(
            f"Step '{step_key}' is assigned to provider '{provider_key}', but that provider is disabled."
        )
    if not configured_provider.get("api_key"):
        raise LLMConfigurationError(
            f"Step '{step_key}' is assigned to provider '{provider_key}', but no API key is configured."
        )

    model = str(step_config.get("model") or "").strip() or str(configured_provider.get("default_model") or "").strip()
    if not model:
        model = PROVIDER_PRESET_MAP[provider_key].default_model

    return {
        "step": step_key,
        "provider": provider_key,
        "provider_label": configured_provider.get("label") or PROVIDER_PRESET_MAP[provider_key].label,
        "api_style": configured_provider.get("api_style") or PROVIDER_PRESET_MAP[provider_key].api_style,
        "base_url": configured_provider.get("base_url") or PROVIDER_PRESET_MAP[provider_key].default_base_url,
        "api_key": configured_provider.get("api_key") or "",
        "model": model,
        "configured": bool(configured_provider.get("enabled")) and bool(configured_provider.get("api_key")),
    }


def _build_openai_payload(model: str, max_tokens: int, system: str | None, messages: list[dict[str, str]], stream: bool) -> dict[str, Any]:
    openai_messages: list[dict[str, Any]] = []
    if system:
        openai_messages.append({"role": "system", "content": system})
    openai_messages.extend(messages)
    payload: dict[str, Any] = {
        "model": model,
        "messages": openai_messages,
        "stream": stream,
    }
    if max_tokens:
        payload["max_tokens"] = max_tokens
    return payload


def _build_anthropic_payload(model: str, max_tokens: int, system: str | None, messages: list[dict[str, str]], stream: bool) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
        "stream": stream,
    }
    if system:
        payload["system"] = system
    return payload


def _build_headers(api_style: str, api_key: str) -> dict[str, str]:
    if api_style == "openai":
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
    return {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }


def _parse_openai_text(data: dict[str, Any]) -> str:
    choices = data.get("choices", [])
    if not choices:
        return ""
    message = choices[0].get("message", {})
    content = message.get("content", "")
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
        return "".join(parts)
    return str(content or "")


def _parse_anthropic_text(data: dict[str, Any]) -> str:
    content = data.get("content", [])
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
        return "".join(parts)
    return ""


def _raise_for_status(response: httpx.Response) -> None:
    if response.status_code < 400:
        return
    body = response.text
    raise LLMStatusError(response.status_code, body)


class SyncMessagesAPI:
    def __init__(self, runtime: dict[str, Any]):
        self.runtime = runtime

    def create(
        self,
        *,
        model: str,
        max_tokens: int,
        system: str | None = None,
        messages: list[dict[str, str]],
    ) -> LLMMessageResponse:
        api_key = str(self.runtime.get("api_key") or "")
        if not api_key:
            raise ValueError(
                f"No API key configured for step '{self.runtime['step']}'. Configure an enabled provider first."
            )
        api_style = str(self.runtime["api_style"])
        endpoint = _normalize_endpoint(str(self.runtime["base_url"]), api_style)
        payload = (
            _build_openai_payload(model, max_tokens, system, messages, False)
            if api_style == "openai"
            else _build_anthropic_payload(model, max_tokens, system, messages, False)
        )
        try:
            response = httpx.post(
                endpoint,
                json=payload,
                headers=_build_headers(api_style, api_key),
                timeout=120.0,
            )
        except httpx.HTTPError as exc:
            raise LLMConnectionError(str(exc)) from exc
        _raise_for_status(response)
        data = response.json()
        text = _parse_openai_text(data) if api_style == "openai" else _parse_anthropic_text(data)
        return LLMMessageResponse(text=text, raw=data)


class SyncLLMClient:
    def __init__(self, runtime: dict[str, Any]):
        self.messages = SyncMessagesAPI(runtime)


async def _iter_openai_text_stream(response: httpx.Response) -> AsyncGenerator[str, None]:
    async for line in response.aiter_lines():
        raw = line.strip()
        if not raw or not raw.startswith("data:"):
            continue
        payload = raw[5:].strip()
        if payload == "[DONE]":
            break
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            continue
        for choice in data.get("choices", []):
            delta = choice.get("delta", {})
            content = delta.get("content")
            if isinstance(content, str) and content:
                yield content
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text" and block.get("text"):
                        yield str(block["text"])


async def _iter_anthropic_text_stream(response: httpx.Response) -> AsyncGenerator[str, None]:
    current_event = ""
    async for line in response.aiter_lines():
        raw = line.strip()
        if not raw:
            continue
        if raw.startswith("event:"):
            current_event = raw[6:].strip()
            continue
        if not raw.startswith("data:"):
            continue
        payload = raw[5:].strip()
        if payload == "[DONE]":
            break
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if current_event == "content_block_delta":
            delta = data.get("delta", {})
            if delta.get("type") == "text_delta" and delta.get("text"):
                yield str(delta["text"])
        elif current_event == "content_block_start":
            block = data.get("content_block", {})
            if block.get("type") == "text" and block.get("text"):
                yield str(block["text"])


class AsyncMessageStream:
    def __init__(self, runtime: dict[str, Any], *, model: str, max_tokens: int, system: str | None, messages: list[dict[str, str]]):
        self.runtime = runtime
        self.model = model
        self.max_tokens = max_tokens
        self.system = system
        self.messages = messages
        self._client: httpx.AsyncClient | None = None
        self._ctx: Any = None
        self._response: httpx.Response | None = None
        self.text_stream: AsyncGenerator[str, None] | None = None

    async def __aenter__(self) -> "AsyncMessageStream":
        api_key = str(self.runtime.get("api_key") or "")
        if not api_key:
            raise ValueError(
                f"No API key configured for step '{self.runtime['step']}'. Configure an enabled provider first."
            )
        api_style = str(self.runtime["api_style"])
        endpoint = _normalize_endpoint(str(self.runtime["base_url"]), api_style)
        payload = (
            _build_openai_payload(self.model, self.max_tokens, self.system, self.messages, True)
            if api_style == "openai"
            else _build_anthropic_payload(self.model, self.max_tokens, self.system, self.messages, True)
        )
        self._client = httpx.AsyncClient(timeout=None)
        self._ctx = self._client.stream(
            "POST",
            endpoint,
            json=payload,
            headers=_build_headers(api_style, api_key),
        )
        try:
            self._response = await self._ctx.__aenter__()
        except httpx.HTTPError as exc:
            raise LLMConnectionError(str(exc)) from exc
        _raise_for_status(self._response)
        self.text_stream = (
            _iter_openai_text_stream(self._response)
            if api_style == "openai"
            else _iter_anthropic_text_stream(self._response)
        )
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self._ctx is not None:
            await self._ctx.__aexit__(exc_type, exc, tb)
        if self._client is not None:
            await self._client.aclose()


class AsyncMessagesAPI:
    def __init__(self, runtime: dict[str, Any]):
        self.runtime = runtime

    async def create(
        self,
        *,
        model: str,
        max_tokens: int,
        system: str | None = None,
        messages: list[dict[str, str]],
    ) -> LLMMessageResponse:
        api_key = str(self.runtime.get("api_key") or "")
        if not api_key:
            raise ValueError(
                f"No API key configured for step '{self.runtime['step']}'. Configure an enabled provider first."
            )
        api_style = str(self.runtime["api_style"])
        endpoint = _normalize_endpoint(str(self.runtime["base_url"]), api_style)
        payload = (
            _build_openai_payload(model, max_tokens, system, messages, False)
            if api_style == "openai"
            else _build_anthropic_payload(model, max_tokens, system, messages, False)
        )
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    endpoint,
                    json=payload,
                    headers=_build_headers(api_style, api_key),
                )
        except httpx.HTTPError as exc:
            raise LLMConnectionError(str(exc)) from exc
        _raise_for_status(response)
        data = response.json()
        text = _parse_openai_text(data) if api_style == "openai" else _parse_anthropic_text(data)
        return LLMMessageResponse(text=text, raw=data)

    def stream(
        self,
        *,
        model: str,
        max_tokens: int,
        system: str | None = None,
        messages: list[dict[str, str]],
    ) -> AsyncMessageStream:
        return AsyncMessageStream(
            self.runtime,
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )


class AsyncLLMClient:
    def __init__(self, runtime: dict[str, Any]):
        self.messages = AsyncMessagesAPI(runtime)


def build_sync_client(step: str, db_path: str | Path | None = None) -> SyncLLMClient:
    return SyncLLMClient(resolve_step_runtime(step, db_path=db_path))


def build_async_client(step: str, db_path: str | Path | None = None) -> AsyncLLMClient:
    return AsyncLLMClient(resolve_step_runtime(step, db_path=db_path))


def build_sync_client_from_runtime(runtime: dict[str, Any]) -> SyncLLMClient:
    return SyncLLMClient(runtime)


def build_async_client_from_runtime(runtime: dict[str, Any]) -> AsyncLLMClient:
    return AsyncLLMClient(runtime)
