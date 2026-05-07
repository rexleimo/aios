# Browser MCP Sensitive Credential Design

**Date**: 2026-05-07  
**Status**: Approved  
**Route**: MCPB official path — `user_config` + `sensitive: true`

## Problem

Browser automation requires site credentials (小红书, Jimeng, etc.) to log in. In the MCP protocol, the LLM generates `tools/call` JSON including all parameter values — so passing passwords as tool parameters leaks them to the LLM context. MCP protocol has no standard per-parameter redaction mechanism, but it provides MCPB `user_config` with `sensitive: true` as the sanctioned path for credential handling.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                LLM Context (NO passwords)          │
│                                                    │
│  browser_login({ site: "xiaohongshu" })            │
│  browser_login({ site: "jimeng", account: "work" })│
└──────────────────┬─────────────────────────────────┘
                   │  tools/call (no password params)
┌──────────────────▼─────────────────────────────────┐
│  Browser MCP Server                                │
│                                                    │
│  login handler:                                    │
│    1. resolve site+account → credential key        │
│    2. read from env: AIOS_CRED_{SITE}_{KEY}        │
│    3. CDP inject into browser                      │
│    4. return { status: "authenticated" }           │
└──────┬──────────────────────┬──────────────────────┘
       │ env vars             │ env vars
┌──────▼──────────┐    ┌──────▼──────────┐
│  XHS_USERNAME   │    │  JIMENG_PASS    │
│  XHS_PASSWORD   │    │  ...            │
└──────┬──────────┘    └──────┬──────────┘
       │                      │
┌──────▼──────────────────────▼──────────────────────┐
│  macOS Keychain                                    │
│  service: aios-browser-mcp/xiaohongshu             │
│  account: default                                  │
│  password: <encrypted, hardware-backed>            │
└────────────────────────────────────────────────────┘
```

## Credential Storage

### Keychain Layout

```
service  = aios-browser-mcp/{site}
account  = {account_label}
password = <plaintext password>
```

Multi-account support via `account` field:

```
aios-browser-mcp/xiaohongshu / default  → main account password
aios-browser-mcp/xiaohongshu / work     → work account password
aios-browser-mcp/jimeng        / default → jimeng password
```

### Access Pattern

```bash
# Write (user setup, one-time)
security add-generic-password \
  -s "aios-browser-mcp/xiaohongshu" \
  -a "default" \
  -w "myPassword123"

# Read (only when browser_login is called — NOT at server startup)
security find-generic-password \
  -s "aios-browser-mcp/xiaohongshu" \
  -a "default" \
  -w

# Delete (account removal)
security delete-generic-password \
  -s "aios-browser-mcp/xiaohongshu" \
  -a "default"
```

### Read Timing

Passwords are read **on-demand** from Keychain when a `browser_login` call needs them, not at server startup. This minimizes the window where plaintext sits in process memory.

Usernames are non-sensitive — stored in Keychain alongside passwords and read at startup for auth state detection (e.g., checking if the logged-in user matches the configured account).

### Memory Safety

- Password read from Keychain → in memory < 100ms → CDP injection → buffer zeroed
- Injected via `Runtime.evaluate` (never keyboard events, avoids keystroke loggers)
- Never written to disk, never logged, never in env vars

## MCP Server Configuration

### Launcher Script Changes

`scripts/run-browser-use-mcp.sh` reads credentials from Keychain at startup and injects as env vars:

```bash
# Credential injection block (added to launcher)
inject_credentials() {
  local sites=("xiaohongshu" "jimeng")
  for site in "${sites[@]}"; do
    local username
    username=$(security find-generic-password -s "aios-browser-mcp/${site}" -a "default" -w 2>/dev/null || true)
    if [ -n "$username" ]; then
      export "AIOS_CRED_${site^^}_USERNAME=$username"
    fi
    # Password read on-demand in server, not stored in env long-term
  done
}
```

### Future: MCPB Packaging

When ready for distribution, package as `.mcpb`:

```json
{
  "manifest_version": "0.4",
  "name": "aios-browser-mcp",
  "server": {
    "type": "python",
    "entry_point": "server/main.py",
    "mcp_config": {
      "command": "python",
      "args": ["${__dirname}/server/main.py"],
      "env": {
        "AIOS_CRED_XHS_USERNAME": "${user_config.xhs_username}",
        "AIOS_CRED_XHS_PASSWORD": "${user_config.xhs_password}",
        "AIOS_CRED_JIMENG_USERNAME": "${user_config.jimeng_username}",
        "AIOS_CRED_JIMENG_PASSWORD": "${user_config.jimeng_password}"
      }
    }
  },
  "user_config": {
    "xhs_username": {
      "type": "string",
      "title": "小红书 Username",
      "required": false
    },
    "xhs_password": {
      "type": "string",
      "title": "小红书 Password",
      "sensitive": true,
      "required": false
    },
    "jimeng_username": {
      "type": "string",
      "title": "即梦 Username", 
      "required": false
    },
    "jimeng_password": {
      "type": "string",
      "title": "即梦 Password",
      "sensitive": true,
      "required": false
    }
  }
}
```

`sensitive: true` ensures the host (Claude Desktop / Claude Code) stores these in OS Keychain, not plaintext config files.

## Tool Design

### browser_login

```
inputSchema:
  site:     "xiaohongshu" | "jimeng"    (required)
  account:  string                        (optional, default: "default")

NO username, password, or token fields.

Server behavior:
  1. Check current auth state via stored profile
  2. If authenticated → return immediately
  3. Read credentials from env: AIOS_CRED_{SITE}_{PREFIX}_USERNAME / PASSWORD
  4. Navigate to login page
  5. Inject credentials via CDP Runtime.evaluate
  6. Submit and wait for auth state change
  7. Return { status, auth_state_class }

returns:
  status: "authenticated" | "login_required" | "reauth_required" | "error"
```

### browser_check_auth

```
inputSchema:
  site: "xiaohongshu" | "jimeng"

Server behavior:
  1. Navigate to site home
  2. Check for login indicators (cookies, DOM elements)
  3. Return auth state without touching credentials

returns:
  { site, auth_state_class, profile_name, expires_at }
```

### browser_configure_credentials (setup helper)

```
inputSchema:
  site:     "xiaohongshu" | "jimeng"
  account:  string (optional)

Server behavior:
  1. Open site login page in browser
  2. Signal to user: complete login manually ONCE
  3. User enters credentials directly in browser (not through LLM)
  4. Server detects successful login
  5. Profile is now authenticated for future sessions

This is the existing human-in-the-loop path, kept as fallback.
```

## Login Flow

### Automatic (profile with cached session)

```
LLM: browser_login({ site: "xiaohongshu" })
  → Server: profile exists, cookies valid → skip
  → return { status: "authenticated" }
  
Time: < 1s, no credentials touched.
```

### Automatic (session expired, credential available)

```
LLM: browser_login({ site: "xiaohongshu" })
  → Server: auth check → login_required
  → Read password from env
  → Navigate to login page
  → CDP inject credentials
  → Submit
  → return { status: "authenticated" }
  
Time: ~3-5s, credentials in memory < 100ms.
```

### Manual fallback (no credential configured)

```
LLM: browser_login({ site: "xiaohongshu" })
  → Server: no credential in env
  → return { status: "reauth_required", requireHumanReauth: true }
  
LLM 告知用户: "需要你手动登录小红书，请在当前浏览器窗口操作"
User types password directly in browser.
```

## Security Boundaries

| What | Protected How |
|------|--------------|
| Password at rest | macOS Keychain (Secure Enclave) |
| Password in transit to MCP | env var (process-local, not in ps output for other users) |
| Password in LLM context | Not present — tool schemas exclude it |
| Password in MCP logs | Server-side resolution, never returned in tool results |
| Password in browser | CDP `Runtime.evaluate` injection, no keyboard events |
| Password in memory | Short-lived buffer, zeroed after use |

## Non-Goals

- End-to-end encryption of credentials (Keychain is the trust boundary)
- Generic credential manager for all MCP servers (scoped to browser MCP)
- Password rotation / expiry management (use existing account security)
- MCPB `.mcpb` packaging in initial implementation (pattern first, package later)

## Implementation Scope

1. **Credential store**: Python module to read/write Keychain entries for browser MCP
2. **Launcher injection**: `scripts/run-browser-use-mcp.sh` reads Keychain → env vars
3. **Tool redesign**: `browser_login` / `browser_check_auth` tools with zero-password schemas
4. **Server-side login**: handler that reads from env and performs CDP-based login
5. **Setup helper**: `browser_configure_credentials` for initial credential registration
