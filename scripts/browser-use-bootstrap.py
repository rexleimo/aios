#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import importlib.util
import os
import sys
import types
from pathlib import Path

AIOS_ROOT = Path(__file__).resolve().parents[1]
BROWSER_USE_REPO_DIR_NAME = "ai-browser-book"
BROWSER_USE_PROJECT_DIR_NAME = "mcp-browser-use"
DEFAULT_SCREENSHOT_TIMEOUT_MS = 15_000


def _env_int(name: str, fallback: int) -> int:
    raw = str(os.getenv(name, "")).strip()
    if not raw:
        return fallback
    try:
        value = int(raw)
    except ValueError:
        return fallback
    return value if value > 0 else fallback


def _browser_use_repo_candidates() -> list[Path]:
    env_repo = str(os.getenv("AIOS_BROWSER_USE_REPO") or "").strip()
    candidates: list[Path] = []
    if env_repo:
        candidates.append(Path(env_repo).expanduser())
    candidates.extend([
        AIOS_ROOT.parent / BROWSER_USE_REPO_DIR_NAME,
        AIOS_ROOT / BROWSER_USE_REPO_DIR_NAME,
    ])
    return candidates


def _resolve_browser_use_repo_root(candidate: Path) -> Path | None:
    project_dir = candidate / BROWSER_USE_PROJECT_DIR_NAME
    if (project_dir / "pyproject.toml").exists():
        return candidate.resolve()

    if candidate.name == BROWSER_USE_PROJECT_DIR_NAME and (candidate / "pyproject.toml").exists():
        parent = candidate.parent
        if (parent / BROWSER_USE_PROJECT_DIR_NAME / "pyproject.toml").exists():
            return parent.resolve()

    return None


def _describe_browser_use_project_path(candidate: Path) -> Path:
    project_dir = candidate / BROWSER_USE_PROJECT_DIR_NAME
    if (project_dir / "pyproject.toml").exists():
        return project_dir

    if candidate.name == BROWSER_USE_PROJECT_DIR_NAME and (candidate / "pyproject.toml").exists():
        return candidate

    return project_dir


def _resolve_browser_use_repo() -> Path:
    candidates = _browser_use_repo_candidates()
    for candidate in candidates:
        resolved = _resolve_browser_use_repo_root(candidate)
        if resolved is not None:
            return resolved

    checked = "\n".join(f"  - {_describe_browser_use_project_path(candidate)}" for candidate in candidates)
    raise SystemExit(
        "[aios-browser] mcp-browser-use project not found.\n"
        "[aios-browser] Set AIOS_BROWSER_USE_REPO=/path/to/ai-browser-book or place ai-browser-book next to/in this repo.\n"
        f"[aios-browser] Checked:\n{checked}"
    )


def _install_optional_shims() -> None:
    if importlib.util.find_spec("mcp_browser_use.xhs") is None:
        xhs = types.ModuleType("mcp_browser_use.xhs")

        def extract_urls_from_html(_html: str) -> list[str]:
            return []

        def filter_image_urls(values: list[str]) -> list[str]:
            seen: set[str] = set()
            out: list[str] = []
            for value in values or []:
                if not isinstance(value, str):
                    continue
                item = value.strip()
                if not item or item in seen:
                    continue
                seen.add(item)
                out.append(item)
            return out

        xhs.extract_urls_from_html = extract_urls_from_html
        xhs.filter_image_urls = filter_image_urls
        sys.modules["mcp_browser_use.xhs"] = xhs

    if importlib.util.find_spec("mcp_browser_use.ins") is None:
        ins = types.ModuleType("mcp_browser_use.ins")

        def extract_urls_from_html(_html: str) -> list[str]:
            return []

        def filter_media_urls(values: list[str]) -> list[str]:
            seen: set[str] = set()
            out: list[str] = []
            for value in values or []:
                if not isinstance(value, str):
                    continue
                item = value.strip()
                if not item or item in seen:
                    continue
                seen.add(item)
                out.append(item)
            return out

        def extract_post_info(_html: str) -> dict[str, object]:
            return {}

        ins.extract_urls_from_html = extract_urls_from_html
        ins.filter_media_urls = filter_media_urls
        ins.extract_post_info = extract_post_info
        sys.modules["mcp_browser_use.ins"] = ins


def _install_credential_shim() -> None:
    """Install mcp_browser_use.credentials shim so the MCP server can
    read credentials on-demand without exposing them to LLM context."""
    try:
        if importlib.util.find_spec("mcp_browser_use.credentials") is not None:
            return
    except (ModuleNotFoundError, ValueError):
        pass

    # Ensure parent package exists (normally provided by server src on sys.path)
    try:
        _parent_spec = importlib.util.find_spec("mcp_browser_use")
    except (ModuleNotFoundError, ValueError):
        _parent_spec = None
    if _parent_spec is None:
        sys.modules.setdefault("mcp_browser_use", types.ModuleType("mcp_browser_use"))

    cred = types.ModuleType("mcp_browser_use.credentials")

    def resolve_password(site: str, account: str = "default") -> str | None:
        import subprocess
        svc = f"aios-browser-mcp/{site}"
        try:
            result = subprocess.run(
                ["security", "find-generic-password", "-s", svc, "-a", account, "-w"],
                capture_output=True, text=True, timeout=5,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return None
        if result.returncode != 0:
            return None
        return result.stdout.strip()

    def resolve_username(site: str, account: str = "default") -> str | None:
        import os as _os
        env_key = f"AIOS_CRED_{site.upper()}_USERNAME"
        value = _os.getenv(env_key, "").strip()
        if value:
            return value
        import subprocess as _subprocess
        svc = f"aios-browser-mcp/{site}/username"
        try:
            result = _subprocess.run(
                ["security", "find-generic-password", "-s", svc, "-a", account, "-w"],
                capture_output=True, text=True, timeout=5,
            )
        except (FileNotFoundError, _subprocess.TimeoutExpired):
            return None
        if result.returncode != 0:
            return None
        return result.stdout.strip()

    def has_credential(site: str, account: str = "default") -> bool:
        import subprocess as _subprocess
        svc = f"aios-browser-mcp/{site}"
        result = _subprocess.run(
            ["security", "find-generic-password", "-s", svc, "-a", account],
            capture_output=True, timeout=5,
        )
        return result.returncode == 0

    cred.resolve_password = resolve_password
    cred.resolve_username = resolve_username
    cred.has_credential = has_credential
    sys.modules["mcp_browser_use.credentials"] = cred


def _install_screenshot_timeout_guard() -> None:
    timeout_ms = _env_int("BROWSER_USE_SCREENSHOT_TIMEOUT_MS", DEFAULT_SCREENSHOT_TIMEOUT_MS)
    os.environ.setdefault("BROWSER_USE_SCREENSHOT_TIMEOUT_MS", str(timeout_ms))

    try:
        from browser_use.actor.page import Page
    except Exception as exc:  # noqa: BLE001
        print(f"[aios-browser] screenshot guard skipped: cannot import browser_use.actor.page ({exc})", file=sys.stderr)
        return

    original = getattr(Page, "screenshot", None)
    if not callable(original):
        print("[aios-browser] screenshot guard skipped: Page.screenshot is missing", file=sys.stderr)
        return
    if getattr(original, "__aios_guarded__", False):
        return

    async def guarded_screenshot(self: object, *args: object, **kwargs: object) -> str:
        guard_timeout_ms = _env_int("BROWSER_USE_SCREENSHOT_TIMEOUT_MS", DEFAULT_SCREENSHOT_TIMEOUT_MS)
        guard_timeout_s = max(1.0, guard_timeout_ms / 1000.0)
        try:
            return await asyncio.wait_for(original(self, *args, **kwargs), timeout=guard_timeout_s)
        except asyncio.TimeoutError as exc:
            raise TimeoutError(f"page.screenshot timed out after {guard_timeout_ms}ms") from exc

    setattr(guarded_screenshot, "__aios_guarded__", True)
    Page.screenshot = guarded_screenshot


def main() -> None:
    browser_use_repo = _resolve_browser_use_repo()
    os.environ.setdefault("AIOS_BROWSER_USE_REPO", str(browser_use_repo))
    mcp_dir = browser_use_repo / BROWSER_USE_PROJECT_DIR_NAME
    src_dir = mcp_dir / "src"
    if not src_dir.exists():
        raise SystemExit(f"[aios-browser] browser-use src directory missing: {src_dir}")

    sys.path.insert(0, str(src_dir))
    _install_optional_shims()
    _install_credential_shim()
    _install_screenshot_timeout_guard()

    from mcp_browser_use.server import main as server_main

    server_main()


if __name__ == "__main__":
    main()
