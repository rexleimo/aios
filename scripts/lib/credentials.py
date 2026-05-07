"""Keychain credential store for browser MCP sites.

Layout:
    service  = aios-browser-mcp/{site}
    account  = {account_label}
    password = <plaintext>

Usernames are stored as the password field in a companion keychain entry:
    service  = aios-browser-mcp/{site}/username
    account  = {account_label}
    password = <username>
"""

from __future__ import annotations

import os
import subprocess
import sys

SERVICE_PREFIX = "aios-browser-mcp"
SUPPORTED_SITES = ("xiaohongshu", "jimeng")


def _run_security(args: list[str], timeout_s: int = 5) -> str:
    """Run `security` CLI, return stdout stripped. Raises on non-zero exit."""
    try:
        result = subprocess.run(
            ["security"] + args,
            capture_output=True,
            text=True,
            timeout=timeout_s,
        )
    except FileNotFoundError:
        raise RuntimeError("macOS `security` CLI not found — Keychain unavailable")
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"security command timed out after {timeout_s}s")
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        if "could not be found" in stderr or "The specified item could not be found" in stderr:
            raise KeyError("credential not found")
        raise RuntimeError(f"security CLI error (code={result.returncode}): {stderr}")
    return (result.stdout or "").strip()


def _service_name(site: str) -> str:
    if site not in SUPPORTED_SITES:
        raise ValueError(f"Unsupported site: {site}. Supported: {', '.join(SUPPORTED_SITES)}")
    return f"{SERVICE_PREFIX}/{site}"


def _username_service_name(site: str) -> str:
    return f"{_service_name(site)}/username"


def set_credential(site: str, account: str, password: str) -> None:
    """Store a password in Keychain. Overwrites existing entry."""
    svc = _service_name(site)
    # Delete existing if present, then add
    try:
        _run_security(["delete-generic-password", "-s", svc, "-a", account])
    except KeyError:
        pass
    _run_security(["add-generic-password", "-s", svc, "-a", account, "-w", password, "-U"])


def set_username(site: str, account: str, username: str) -> None:
    """Store a username in Keychain (non-sensitive, but kept in Keychain for consistency)."""
    svc = _username_service_name(site)
    try:
        _run_security(["delete-generic-password", "-s", svc, "-a", account])
    except KeyError:
        pass
    _run_security(["add-generic-password", "-s", svc, "-a", account, "-w", username, "-U"])


def get_password(site: str, account: str = "default") -> str:
    """Read a password from Keychain. Returns plaintext. Caller MUST zero after use."""
    svc = _service_name(site)
    return _run_security(["find-generic-password", "-s", svc, "-a", account, "-w"])


def get_username(site: str, account: str = "default") -> str | None:
    """Read a username from Keychain. Returns None if not configured."""
    svc = _username_service_name(site)
    try:
        return _run_security(["find-generic-password", "-s", svc, "-a", account, "-w"])
    except KeyError:
        return None


def delete_credential(site: str, account: str = "default") -> bool:
    """Delete a credential entry. Returns True if deleted, False if didn't exist."""
    svc = _service_name(site)
    try:
        _run_security(["delete-generic-password", "-s", svc, "-a", account])
        return True
    except KeyError:
        return False


def delete_username(site: str, account: str = "default") -> bool:
    """Delete a username entry."""
    svc = _username_service_name(site)
    try:
        _run_security(["delete-generic-password", "-s", svc, "-a", account])
        return True
    except KeyError:
        return False


def list_sites() -> list[dict[str, str]]:
    """List all configured credential entries."""
    entries: list[dict[str, str]] = []
    for site in SUPPORTED_SITES:
        for account in ("default",):
            try:
                svc = _service_name(site)
                _run_security(["find-generic-password", "-s", svc, "-a", account])
                username = get_username(site, account)
                entries.append({
                    "site": site,
                    "account": account,
                    "username": username or "(not set)",
                    "has_password": True,
                })
            except KeyError:
                username = get_username(site, account)
                if username:
                    entries.append({
                        "site": site,
                        "account": account,
                        "username": username,
                        "has_password": False,
                    })
    return entries


def resolve_password_from_env(site: str) -> str | None:
    """Read password on-demand from Keychain for the given site.

    Intended to be called from the browser_login tool handler, not at startup.
    Reads from Keychain fresh each call — caller must zero the returned string.
    """
    try:
        return get_password(site, "default")
    except KeyError:
        return None


def resolve_username_from_env(site: str) -> str | None:
    """Read username from env var (set by launcher) or fall back to Keychain."""
    env_key = f"AIOS_CRED_{site.upper()}_USERNAME"
    value = os.getenv(env_key, "").strip()
    if value:
        return value
    return get_username(site, "default")
