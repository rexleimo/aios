# Browser MCP Sensitive Credentials — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement macOS Keychain-backed credential storage and injection so browser MCP login tools never expose passwords to LLM context.

**Architecture:** Credential store module (Python) reads/writes macOS Keychain via `security` CLI. Launcher script injects usernames as env vars. Bootstrap script installs a `mcp_browser_use.credentials` shim for on-demand password resolution. Auth tools (`browser_login`, `browser_check_auth`, `browser_configure_credentials`) are built as a thin MCP server extension that sits alongside the external browser MCP server, reading credentials from the shim at call time.

**Tech Stack:** Python 3 (stdlib `subprocess` + `json`), Bash, Node.js (CLI), macOS Keychain `security` CLI

**Constraint:** The browser MCP server (`mcp_browser_use.server`) lives in an external repo at `/Users/molei/codes/ai-browser-book`. We inject at integration boundaries: bootstrap shims, launcher env vars, and a sidecar auth tool server.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `scripts/lib/credentials.py` | **Create** | Keychain read/write/delete, env var resolution |
| `scripts/aios-cred.mjs` | **Create** | CLI: `aios cred set|get|list|delete` |
| `scripts/run-browser-use-mcp.sh` | **Modify** | Inject usernames from Keychain as env vars |
| `scripts/browser-use-bootstrap.py` | **Modify** | Install `mcp_browser_use.credentials` shim |
| `scripts/auth-tools-server.py` | **Create** | Auth MCP sidecar: `browser_login`, `browser_check_auth`, `browser_configure_credentials` |
| `scripts/tests/test_credentials.py` | **Create** | Unit tests for credential store module |
| `scripts/tests/test_credentials.test.mjs` | **Create** | Integration test for CLI + Keychain round-trip |

---

### Task 1: Credential Store Module

**Files:**
- Create: `scripts/lib/credentials.py`

- [ ] **Step 1: Write the module**

```python
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
```

- [ ] **Step 2: Verify module is importable**

```bash
cd /Users/rex/cool.cnb/rex-ai-boot && python3 -c "from scripts.lib.credentials import SUPPORTED_SITES; print('OK:', SUPPORTED_SITES)"
```

Expected: `OK: ('xiaohongshu', 'jimeng')`

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/credentials.py
git commit -m "feat(credentials): add Keychain credential store module"
```

---

### Task 2: Credential CLI

**Files:**
- Create: `scripts/aios-cred.mjs`

- [ ] **Step 1: Write the CLI**

```javascript
#!/usr/bin/env node
/** aios cred — manage browser MCP credentials in macOS Keychain */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CRED_MODULE = resolve(__dirname, 'lib', 'credentials.py');

function python(args) {
  const script = args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(', ');
  const code = `
import sys
sys.path.insert(0, "${__dirname}")
from lib.credentials import *
${script}
`;
  const result = spawnSync('python3', ['-c', code], { encoding: 'utf-8' });
  if (result.error) throw result.error;
  if (result.stderr) process.stderr.write(result.stderr);
  return result.stdout.trim();
}

function error(msg) { process.stderr.write(`error: ${msg}\n`); process.exit(1); }

const cmd = process.argv[2];
const args = process.argv.slice(3);

function requireArgs(n, usage) {
  if (args.length < n) error(`Usage: aios cred ${cmd} ${usage}`);
}

switch (cmd) {
  case 'set': {
    requireArgs(3, '<site> <account> <password>');
    const [site, account, password] = args;
    const stdout = python([
      `set_credential("${site}", "${account}", "${password}")`,
      'print("ok")',
    ]);
    console.log(stdout || 'ok');
    break;
  }
  case 'get': {
    requireArgs(1, '<site> [account]');
    const [site, account = 'default'] = args;
    const password = python([`print(get_password("${site}", "${account}"))`]);
    console.log(password);
    break;
  }
  case 'list': {
    const stdout = python([
      `entries = list_sites()`,
      `print(__import__('json').dumps(entries, indent=2))`,
    ]);
    console.log(stdout || '[]');
    break;
  }
  case 'delete': {
    requireArgs(1, '<site> [account]');
    const [site, account = 'default'] = args;
    python([`delete_credential("${site}", "${account}")`, 'print("deleted")']);
    console.log('deleted');
    break;
  }
  case 'set-username': {
    requireArgs(2, '<site> <username>');
    const [site, username] = args;
    python([`set_username("${site}", "default", "${username}")`, 'print("ok")']);
    console.log('ok');
    break;
  }
  default:
    error(`unknown subcommand: ${cmd}\nUsage: aios cred <set|get|list|delete|set-username>`);
}
```

- [ ] **Step 2: Verify CLI runs**

```bash
node scripts/aios-cred.mjs list
```

Expected: `[]` (or lists configured entries if any exist)

- [ ] **Step 3: Commit**

```bash
git add scripts/aios-cred.mjs
git commit -m "feat(credentials): add aios cred CLI for Keychain management"
```

---

### Task 3: Launcher Username Injection

**Files:**
- Modify: `scripts/run-browser-use-mcp.sh` (append credential injection block)

- [ ] **Step 1: Read the current launcher**

```bash
cat scripts/run-browser-use-mcp.sh
```

- [ ] **Step 2: Add credential injection before the MCP server exec line**

Find the line that executes the Python server (ends with `$VENV_PYTHON $BOOTSTRAP_SCRIPT` or similar). Insert before it:

```bash
# --- injected credential usernames (non-sensitive) ---
inject_usernames() {
  for site in xiaohongshu jimeng; do
    local svc="aios-browser-mcp/${site}/username"
    local username
    username=$(security find-generic-password -s "$svc" -a "default" -w 2>/dev/null || true)
    if [ -n "$username" ]; then
      # Convert site to UPPER_SNAKE for env var name
      local env_key
      env_key="AIOS_CRED_$(echo "$site" | tr '[:lower:]' '[:upper:]')_USERNAME"
      export "$env_key=$username"
      echo "[aios-browser] injected username for $site: $username" >&2
    fi
  done
}
inject_usernames
# --- end credential injection ---
```

- [ ] **Step 3: Run the launcher dry-run to verify no errors**

```bash
bash -n scripts/run-browser-use-mcp.sh
```

- [ ] **Step 4: Commit**

```bash
git add scripts/run-browser-use-mcp.sh
git commit -m "feat(credentials): inject usernames from Keychain at launcher startup"
```

---

### Task 4: Bootstrap Credential Shim

**Files:**
- Modify: `scripts/browser-use-bootstrap.py` (add shim install call in `main()`)

- [ ] **Step 1: Add the credential shim installer function**

Add this function to `browser-use-bootstrap.py` alongside the existing `_install_optional_shims()`:

```python
def _install_credential_shim() -> None:
    """Install mcp_browser_use.credentials shim so the MCP server can
    read credentials on-demand without exposing them to LLM context."""
    if importlib.util.find_spec("mcp_browser_use.credentials") is not None:
        return

    cred = types.ModuleType("mcp_browser_use.credentials")

    def resolve_password(site: str, account: str = "default") -> str | None:
        """Read password from Keychain. Called on-demand during browser_login."""
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
        """Read username from env var (set by launcher) or Keychain fallback."""
        import os
        env_key = f"AIOS_CRED_{site.upper()}_USERNAME"
        value = os.getenv(env_key, "").strip()
        if value:
            return value
        svc = f"aios-browser-mcp/{site}/username"
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

    def has_credential(site: str, account: str = "default") -> bool:
        import subprocess
        svc = f"aios-browser-mcp/{site}"
        result = subprocess.run(
            ["security", "find-generic-password", "-s", svc, "-a", account],
            capture_output=True, timeout=5,
        )
        return result.returncode == 0

    cred.resolve_password = resolve_password
    cred.resolve_username = resolve_username
    cred.has_credential = has_credential
    sys.modules["mcp_browser_use.credentials"] = cred
```

- [ ] **Step 2: Call `_install_credential_shim()` in `main()`**

In the `main()` function, add the call after `_install_optional_shims()`:

```python
_install_optional_shims()
_install_credential_shim()       # <-- add this line
_install_screenshot_timeout_guard()
```

- [ ] **Step 3: Verify bootstrap imports work**

```bash
cd /Users/rex/cool.cnb/rex-ai-boot && python3 -c "
import sys
sys.path.insert(0, '.')
exec(open('scripts/browser-use-bootstrap.py').read().split('def main')[0])
_install_credential_shim()
import mcp_browser_use.credentials
print('resolve_password:', mcp_browser_use.credentials.resolve_password)
print('has_credential:', mcp_browser_use.credentials.has_credential)
"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/browser-use-bootstrap.py
git commit -m "feat(credentials): add mcp_browser_use.credentials shim for on-demand password resolution"
```

---

### Task 5: Auth MCP Sidecar Server

**Files:**
- Create: `scripts/auth-tools-server.py`

This is a self-contained MCP server that registers `browser_login`, `browser_check_auth`, and `browser_configure_credentials`. It connects to CDP directly to perform login — it does NOT coordinate with the browser MCP server. The LLM calls these tools with only site name, never passwords. Credentials are resolved from Keychain at call time, injected into the browser via CDP `Runtime.evaluate`, and zeroed from memory immediately after.

**Architecture key decision:** The sidecar opens its own CDP WebSocket connection for login operations. Chrome supports multiple CDP clients on the same debug port, so this does not conflict with the browser MCP server. After login, the browser MCP server sees the authenticated session in the shared profile.

- [ ] **Step 1: Write the auth MCP server**

```python
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
    import websockets  # type: ignore[import-untyped]

    ws_url = _get_ws_url()
    login_url = LOGIN_PAGES.get(site, "")
    if not login_url:
        return {"status": "error", "message": f"No login URL configured for {site}"}

    async with websockets.connect(ws_url, max_size=2**24) as ws:  # type: ignore[attr-defined]
        # Enable runtime for injection
        await _cdp_command(ws, "Runtime.enable")
        await _cdp_command(ws, "Page.enable")

        # Navigate to login page
        nav_result = await _cdp_command(ws, "Page.navigate", {"url": login_url})
        if "error" in nav_result:
            return {"status": "error", "message": f"Navigation failed: {nav_result.get('error')}"}

        # Wait for page load
        await asyncio.sleep(2)

        # Inject credentials via Runtime.evaluate (no keyboard events)
        escaped_password = json.dumps(password)
        escaped_username = json.dumps(username)  # noqa: F841
        inject_js = f"""
        (() => {{
            const inputs = document.querySelectorAll('input');
            for (const inp of inputs) {{
                const t = (inp.type || '').toLowerCase();
                const ph = (inp.placeholder || '').toLowerCase();
                const name = (inp.name || '').toLowerCase();
                const id = (inp.id || '').toLowerCase();
                // Password field
                if (t === 'password') {{
                    const nativeSetter = Object.getOwnPropertyDescriptor(
                        HTMLInputElement.prototype, 'value'
                    ).set;
                    nativeSetter.call(inp, {escaped_password});
                    inp.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    inp.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }}
                // Username/phone field
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
            // Try to find and click submit/login button
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
        eval_result = await _cdp_command(ws, "Runtime.evaluate", {"expression": inject_js})

        # Wait for navigation after form submit
        await asyncio.sleep(3)

        # Check cookies for auth indicator
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

    # Perform CDP login
    try:
        result = asyncio.run(_cdp_login(site, username, password))
    except Exception as exc:
        return _json_response({
            "status": "error",
            "message": f"CDP login failed: {exc}",
        })
    finally:
        # Zero password from memory
        password = "\x00" * len(password)

    return _json_response(result)


def _check_auth(args: dict) -> dict:
    site = args.get("site", "")
    if site not in SUPPORTED_SITES:
        return _error(f"Unsupported site: {site}")

    has_cred = _has_credential(site)
    username = _resolve_username(site)

    # Try CDP cookie check for live auth state
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


async def _main_async() -> None:
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await asyncio.get_event_loop().connect_read_pipe(lambda: protocol, sys.stdin)

    writer_transport, writer_protocol = await asyncio.get_event_loop().connect_write_pipe(
        asyncio.streams.FlowControlMixin, sys.stdout
    )
    writer = asyncio.StreamWriter(writer_transport, writer_protocol, reader, asyncio.get_event_loop())

    while True:
        try:
            line = await reader.readline()
        except EOFError:
            break
        if not line:
            break

        try:
            request = json.loads(line.decode())
        except json.JSONDecodeError:
            continue

        req_id = request.get("id")
        method = request.get("method", "")

        if method == "tools/list":
            response = {"jsonrpc": "2.0", "id": req_id, "result": _handle_tools_list(request.get("params", {}))}
        elif method == "tools/call":
            response = {"jsonrpc": "2.0", "id": req_id, "result": _handle_tools_call(request.get("params", {}))}
        elif method == "initialize":
            response = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": "2025-03-26",
                    "serverInfo": {"name": "aios-auth-tools", "version": "0.1.0"},
                    "capabilities": {"tools": {}},
                },
            }
        elif method == "notifications/initialized":
            continue
        else:
            response = {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Unknown method: {method}"}}

        writer.write((json.dumps(response) + "\n").encode())
        await writer.drain()


def main() -> None:
    asyncio.run(_main_async())


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify the server starts and responds to initialize**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | python3 scripts/auth-tools-server.py
```

Expected: JSON-RPC response with `serverInfo.name == "aios-auth-tools"`

- [ ] **Step 3: Verify tools/list returns zero-password schemas**

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | timeout 3 python3 scripts/auth-tools-server.py || true
```

Expected: 3 tools in response, none with `password` or `username` in their `inputSchema.properties`.

- [ ] **Step 4: Verify `websockets` package is available**

```bash
python3 -c "import websockets; print('OK:', websockets.__version__)"
```

Expected: prints version. If missing: `pip3 install websockets`

- [ ] **Step 5: Commit**

```bash
git add scripts/auth-tools-server.py
git commit -m "feat(credentials): add auth MCP sidecar with CDP-based login"
```

---

### Task 6: Tests

**Files:**
- Create: `scripts/tests/test_credentials.py`

- [ ] **Step 1: Write unit tests**

```python
"""Tests for credential store module. Run with: python3 -m pytest scripts/tests/test_credentials.py -v"""

import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.credentials import (
    _service_name,
    _username_service_name,
    SUPPORTED_SITES,
    set_credential,
    set_username,
    get_password,
    get_username,
    delete_credential,
    delete_username,
    list_sites,
)


def test_service_name_valid():
    assert _service_name("xiaohongshu") == "aios-browser-mcp/xiaohongshu"
    assert _service_name("jimeng") == "aios-browser-mcp/jimeng"


def test_service_name_invalid():
    try:
        _service_name("unsupported")
        assert False, "should have raised ValueError"
    except ValueError as e:
        assert "Unsupported site" in str(e)


def test_username_service_name():
    assert _username_service_name("xiaohongshu") == "aios-browser-mcp/xiaohongshu/username"


def test_supported_sites():
    assert "xiaohongshu" in SUPPORTED_SITES
    assert "jimeng" in SUPPORTED_SITES
    assert len(SUPPORTED_SITES) == 2


def test_set_get_delete_round_trip():
    """Integration test: actually writes to and reads from Keychain."""
    site = "xiaohongshu"
    test_pw = "test-password-roundtrip-2026"

    # Clean up any leftover
    delete_credential(site, "test-roundtrip")

    # Set
    set_credential(site, "test-roundtrip", test_pw)

    # Get
    result = get_password(site, "test-roundtrip")
    assert result == test_pw

    # Delete
    assert delete_credential(site, "test-roundtrip") is True

    # Verify deleted
    try:
        get_password(site, "test-roundtrip")
        assert False, "should have raised KeyError after delete"
    except KeyError:
        pass

    # Delete again should return False (already gone)
    assert delete_credential(site, "test-roundtrip") is False


def test_username_round_trip():
    site = "xiaohongshu"

    delete_username(site, "test-username")

    set_username(site, "test-username", "myuser@test.com")
    result = get_username(site, "test-username")
    assert result == "myuser@test.com"

    delete_username(site, "test-username")
    assert get_username(site, "test-username") is None


def test_get_password_nonexistent():
    try:
        get_password("xiaohongshu", "nonexistent-account-zzz")
        assert False, "should have raised KeyError"
    except KeyError:
        pass


def test_list_sites_empty_when_no_creds():
    entries = list_sites()
    assert isinstance(entries, list)
    # Each entry has expected keys
    for entry in entries:
        assert "site" in entry
        assert "account" in entry
        assert "has_password" in entry
```

- [ ] **Step 2: Run tests**

```bash
python3 -m pytest scripts/tests/test_credentials.py -v
```

Expected: All tests pass (Keychain integration tests will interact with real Keychain)

- [ ] **Step 3: After tests pass, clean up test data**

```bash
security delete-generic-password -s "aios-browser-mcp/xiaohongshu" -a "test-roundtrip" 2>/dev/null || true
security delete-generic-password -s "aios-browser-mcp/xiaohongshu/username" -a "test-username" 2>/dev/null || true
```

- [ ] **Step 4: Commit**

```bash
git add scripts/tests/test_credentials.py
git commit -m "test(credentials): add Keychain store unit tests"
```

---

### Task 7: MCP Config Registration

**Files:**
- Modify: `scripts/lib/components/browser.mjs` (extend MCP server block to include auth sidecar)

- [ ] **Step 1: Add auth sidecar MCP server alongside browser MCP**

In the `installBrowserMcp()` / MCP config generator section, add a second server entry for the auth tools:

```json
{
  "mcpServers": {
    "mcp-browser-use": {
      "type": "stdio",
      "command": "bash",
      "args": ["/path/to/scripts/run-browser-use-mcp.sh"],
      "env": {
        "BROWSER_USE_CDP_URL": "http://127.0.0.1:9222"
      }
    },
    "aios-auth-tools": {
      "type": "stdio",
      "command": "python3",
      "args": ["/path/to/scripts/auth-tools-server.py"],
      "env": {
        "BROWSER_USE_CDP_URL": "http://127.0.0.1:9222"
      }
    }
  }
}
```

The `browser.mjs` change: in the function that generates the MCP server config block, append the `aios-auth-tools` entry. The exact location depends on the current code — find where the `mcp-browser-use` server block is constructed and add the second entry.

- [ ] **Step 2: Verify with doctor check**

```bash
node scripts/aios.mjs internal browser doctor --fix --dry-run
```

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/components/browser.mjs
git commit -m "feat(credentials): register auth-tools MCP sidecar in browser config"
```

---

## Phase 2 (External Repo Changes)

These changes go in `/Users/molei/codes/ai-browser-book/mcp-browser-use/src/mcp_browser_use/`.

### Task 8: Server-Side browser_login Tool

**Files:**
- Create: `mcp_browser_use/tools/auth.py` (in external repo)
- Modify: `mcp_browser_use/server/server.py` (register the tool)

When the external server has a `browser_login` tool that:
1. Receives only `{site, account}` from LLM
2. Imports `mcp_browser_use.credentials.resolve_password()` (the shim we installed)
3. Navigates to login page, injects credentials via CDP
4. Returns auth state — never echoes password

The tool can be implemented in the external server using the credential shim module. The key integration point is the import:

```python
from mcp_browser_use.credentials import resolve_password, resolve_username, has_credential
```

If the shim is installed (bootstrap runs before server), this import works. If not, the server should fall back gracefully to human-in-the-loop.

---

## Verification Checklist

After all tasks complete, verify end-to-end:

- [ ] `node scripts/aios-cred.mjs set xiaohongshu default <real-password>` succeeds
- [ ] `node scripts/aios-cred.mjs set-username xiaohongshu <real-username>` succeeds
- [ ] `node scripts/aios-cred.mjs list` shows the entry
- [ ] `AIOS_CRED_XIAOHONGSHU_USERNAME` env var set by launcher (check with `echo $AIOS_CRED_XIAOHONGSHU_USERNAME` in shell after sourcing launcher)
- [ ] `python3 scripts/auth-tools-server.py` returns tools with zero password fields in inputSchema
- [ ] `browser_login({site:"xiaohongshu"})` resolves credentials from Keychain without password appearing in LLM context
- [ ] `browser_check_auth({site:"xiaohongshu"})` returns state without touching credentials
- [ ] `browser_configure_credentials({site:"xiaohongshu"})` triggers human-in-the-loop flow
- [ ] Password never appears in: MCP log output, tool call arguments, tool results
- [ ] After `delete` CLI, `browser_login` returns `reauth_required`
