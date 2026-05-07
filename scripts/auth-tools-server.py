#!/usr/bin/env python3
"""Auth MCP sidecar — exposes login/check-auth/configure tools with zero-password schemas.

The LLM sees tool schemas with NO password/username fields.
Credentials are resolved server-side from macOS Keychain at call time.
Login is performed via CDP Runtime.evaluate — password never sent to LLM.
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import urllib.request
from typing import Any

# ── credential resolution ─────────────────────────────────────────────────

SUPPORTED_SITES = ("xiaohongshu", "jimeng")
_CRED_SERVICE = "aios-browser-mcp"


def _resolve_password(site: str, account: str = "default") -> str | None:
    svc = f"{_CRED_SERVICE}/{site}"
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


def _resolve_username(site: str, account: str = "default") -> str | None:
    env_key = f"AIOS_CRED_{site.upper()}_USERNAME"
    value = os.getenv(env_key, "").strip()
    if value:
        return value
    svc = f"{_CRED_SERVICE}/{site}/username"
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


def _has_credential(site: str, account: str = "default") -> bool:
    svc = f"{_CRED_SERVICE}/{site}"
    result = subprocess.run(
        ["security", "find-generic-password", "-s", svc, "-a", account],
        capture_output=True, timeout=5,
    )
    return result.returncode == 0


# ── CDP helpers ───────────────────────────────────────────────────────────

CDP_URL = os.getenv("BROWSER_USE_CDP_URL", "http://127.0.0.1:9222")

LOGIN_PAGES = {
    "xiaohongshu": "https://www.xiaohongshu.com/login",
    "jimeng": "https://jimeng.jianying.com/ai-tool/user/login",
}

AUTH_COOKIE_NAMES = {
    "xiaohongshu": "a1",
    "jimeng": "sessionid",
}

AUTH_CHECK_URLS = {
    "xiaohongshu": "https://www.xiaohongshu.com",
    "jimeng": "https://jimeng.jianying.com",
}


def _get_ws_url() -> str:
    """Fetch WebSocket debugger URL from CDP HTTP endpoint."""
    resp = urllib.request.urlopen(f"{CDP_URL}/json/version", timeout=5)
    data = json.loads(resp.read())
    ws_url = data.get("webSocketDebuggerUrl", "")
    if not ws_url:
        raise RuntimeError("No webSocketDebuggerUrl in CDP /json/version response")
    return ws_url


async def _cdp_command(ws: Any, method: str, params: dict | None = None) -> dict:
    """Send a CDP command and return the result."""
    msg_id = getattr(_cdp_command, "_id", 0) + 1
    setattr(_cdp_command, "_id", msg_id)
    msg = json.dumps({"id": msg_id, "method": method, "params": params or {}})
    await ws.send(msg)
    while True:
        response = json.loads(await ws.recv())
        if response.get("id") == msg_id:
            if "error" in response:
                raise RuntimeError(f"CDP error: {response['error']}")
            return response.get("result", {})


async def _cdp_login(site: str, username: str, password: str) -> dict:
    """Perform login via CDP. Connects to Chrome, navigates, injects credentials."""
    import websockets

    ws_url = _get_ws_url()
    login_url = LOGIN_PAGES.get(site, "")
    if not login_url:
        return {"status": "error", "message": f"No login URL configured for {site}"}

    async with websockets.connect(ws_url, max_size=2**24) as ws:
        await _cdp_command(ws, "Runtime.enable")
        await _cdp_command(ws, "Page.enable")

        nav_result = await _cdp_command(ws, "Page.navigate", {"url": login_url})
        if "error" in nav_result:
            return {"status": "error", "message": f"Navigation failed: {nav_result.get('error')}"}

        await asyncio.sleep(2)

        escaped_password = json.dumps(password)
        escaped_username = json.dumps(username)
        inject_js = f"""
        (() => {{
            const inputs = document.querySelectorAll('input');
            for (const inp of inputs) {{
                const t = (inp.type || '').toLowerCase();
                const ph = (inp.placeholder || '').toLowerCase();
                const name = (inp.name || '').toLowerCase();
                const id = (inp.id || '').toLowerCase();
                if (t === 'password') {{
                    const nativeSetter = Object.getOwnPropertyDescriptor(
                        HTMLInputElement.prototype, 'value'
                    ).set;
                    nativeSetter.call(inp, {escaped_password});
                    inp.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    inp.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }}
                if ((t === 'text' || t === 'tel') &&
                    (ph.includes('手机') || ph.includes('号') || ph.includes('phone') ||
                     name.includes('user') || id.includes('user') ||
                     name.includes('phone') || id.includes('phone'))) {{
                    const nativeSetter = Object.getOwnPropertyDescriptor(
                        HTMLInputElement.prototype, 'value'
                    ).set;
                    nativeSetter.call(inp, {escaped_username});
                    inp.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    inp.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }}
            }}
            const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"]');
            for (const btn of buttons) {{
                const text = (btn.textContent || btn.value || '').toLowerCase();
                if (text.includes('登录') || text.includes('登錄') || text.includes('sign in')) {{
                    btn.click();
                    return 'clicked';
                }}
            }}
            return 'no_button';
        }})()
        """
        await _cdp_command(ws, "Runtime.evaluate", {"expression": inject_js})

        await asyncio.sleep(3)

        cookie_result = await _cdp_command(
            ws,
            "Network.getCookies",
            {"urls": [AUTH_CHECK_URLS.get(site, login_url)]},
        )
        cookies = cookie_result.get("cookies", [])
        auth_cookie_name = AUTH_COOKIE_NAMES.get(site, "")
        is_authenticated = any(c.get("name") == auth_cookie_name for c in cookies)

        status = "authenticated" if is_authenticated else "login_required"
        return {"status": status, "auth_state_class": status}


# ── Tool definitions ──────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "browser_login",
        "description": (
            "Log into a supported site using credentials stored in macOS Keychain. "
            "Credentials are NEVER visible to the LLM — they are resolved and injected "
            "entirely server-side."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "site": {
                    "type": "string",
                    "enum": list(SUPPORTED_SITES),
                    "description": "Target site to log into",
                },
                "account": {
                    "type": "string",
                    "description": "Account label. Uses 'default' if omitted.",
                },
            },
            "required": ["site"],
        },
    },
    {
        "name": "browser_check_auth",
        "description": "Check whether the browser has an active authenticated session for a site.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "site": {
                    "type": "string",
                    "enum": list(SUPPORTED_SITES),
                    "description": "Site to check auth state for",
                },
            },
            "required": ["site"],
        },
    },
    {
        "name": "browser_configure_credentials",
        "description": (
            "Guide for setting up credentials for a site. Opens the login page for manual "
            "authentication. After the user completes login manually, the session is preserved "
            "in the browser profile."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "site": {
                    "type": "string",
                    "enum": list(SUPPORTED_SITES),
                    "description": "Site to configure credentials for",
                },
                "account": {
                    "type": "string",
                    "description": "Account label. Uses 'default' if omitted.",
                },
            },
            "required": ["site"],
        },
    },
]


# ── JSON-RPC stdio MCP server ─────────────────────────────────────────────

def _handle_tools_list(_params: dict) -> dict:
    return {"tools": TOOLS}


def _handle_tools_call(params: dict) -> dict:
    name = params.get("name", "")
    arguments = params.get("arguments", {})

    if name == "browser_login":
        return _login(arguments)
    elif name == "browser_check_auth":
        return _check_auth(arguments)
    elif name == "browser_configure_credentials":
        return _configure(arguments)
    else:
        return {
            "content": [{"type": "text", "text": f"Unknown tool: {name}"}],
            "isError": True,
        }


def _login(args: dict) -> dict:
    site = args.get("site", "")
    account = args.get("account", "default")

    if site not in SUPPORTED_SITES:
        return _error(f"Unsupported site: {site}. Supported: {', '.join(SUPPORTED_SITES)}")

    if not _has_credential(site, account):
        username = _resolve_username(site, account)
        return _json_response({
            "status": "reauth_required",
            "auth_state_class": "login_required",
            "requireHumanReauth": True,
            "message": f"No credentials for {site}/{account}. Use browser_configure_credentials or log in manually.",
            "has_username": username is not None,
            "username": username,
        })

    username = _resolve_username(site, account)
    password = _resolve_password(site, account)

    if not password or not username:
        return _json_response({
            "status": "reauth_required",
            "auth_state_class": "login_required",
            "requireHumanReauth": True,
            "message": f"Missing username or password for {site}/{account}. Re-run aios cred set.",
        })

    try:
        result = asyncio.run(_cdp_login(site, username, password))
    except Exception as exc:
        return _json_response({
            "status": "error",
            "message": f"CDP login failed: {exc}",
        })
    finally:
        password = "\x00" * len(password)

    return _json_response(result)


def _check_auth(args: dict) -> dict:
    site = args.get("site", "")
    if site not in SUPPORTED_SITES:
        return _error(f"Unsupported site: {site}")

    has_cred = _has_credential(site)
    username = _resolve_username(site)

    auth_state_class = "unknown"
    try:
        ws_url = _get_ws_url()
    except Exception:
        ws_url = None

    if ws_url:
        try:
            async def _check():
                import websockets
                async with websockets.connect(ws_url, max_size=2**24) as ws:
                    await _cdp_command(ws, "Network.enable")
                    result = await _cdp_command(
                        ws,
                        "Network.getCookies",
                        {"urls": [AUTH_CHECK_URLS.get(site, "")]},
                    )
                    cookies = result.get("cookies", [])
                    auth_name = AUTH_COOKIE_NAMES.get(site, "")
                    return "authenticated" if any(c.get("name") == auth_name for c in cookies) else "login_required"
            auth_state_class = asyncio.run(_check())
        except Exception:
            pass

    return _json_response({
        "site": site,
        "auth_state_class": auth_state_class,
        "has_credentials_configured": has_cred,
        "username": username,
        "login_url": LOGIN_PAGES.get(site, ""),
    })


def _configure(args: dict) -> dict:
    site = args.get("site", "")
    account = args.get("account", "default")
    if site not in SUPPORTED_SITES:
        return _error(f"Unsupported site: {site}")

    return _json_response({
        "status": "human_action_required",
        "message": (
            f"To configure credentials for {site}/{account}:\n"
            f"1. Run: node scripts/aios-cred.mjs set-username {site} <your-username>\n"
            f"2. Run: node scripts/aios-cred.mjs set {site} {account} <your-password>\n"
            f"3. Or complete login manually at: {LOGIN_PAGES.get(site, '')}"
        ),
        "login_url": LOGIN_PAGES.get(site, ""),
        "site": site,
        "account": account,
    })


def _json_response(data: dict) -> dict:
    return {"content": [{"type": "text", "text": json.dumps(data)}]}


def _error(message: str) -> dict:
    return {"content": [{"type": "text", "text": message}], "isError": True}


def _write_response(response: dict) -> None:
    sys.stdout.write(json.dumps(response) + "\n")
    sys.stdout.flush()


def _process_request(request: dict) -> None:
    req_id = request.get("id")
    method = request.get("method", "")

    if method == "tools/list":
        _write_response({"jsonrpc": "2.0", "id": req_id, "result": _handle_tools_list(request.get("params", {}))})
    elif method == "tools/call":
        result = _handle_tools_call(request.get("params", {}))
        _write_response({"jsonrpc": "2.0", "id": req_id, "result": result})
    elif method == "initialize":
        _write_response({
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2025-03-26",
                "serverInfo": {"name": "aios-auth-tools", "version": "0.1.0"},
                "capabilities": {"tools": {}},
            },
        })
    elif method == "notifications/initialized":
        pass
    else:
        _write_response({"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Unknown method: {method}"}})


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue
        _process_request(request)


if __name__ == "__main__":
    main()
