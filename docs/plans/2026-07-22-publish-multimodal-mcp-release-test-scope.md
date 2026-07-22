# Multimodal MCP delivery release test scope

## User-visible contract

The v5.1.0 release must retain the completed multimodal MCP delivery behavior:
browser screenshots and other upstream MCP content blocks reach the client
unchanged, and browser-use MCP defaults to direct upstream delivery. Release
verification must prove this behavior without reading, changing, or reverting
real client home-directory configuration.

## Boundaries

- In scope: focused protocol/configuration/doctor tests, the root script suite,
  MCP-server checks, release preflight, and version/changelog consistency.
- Out of scope: model selection, browser-use upstream implementation, direct
  user-uploaded attachments, real global client configuration, and a live
  browser MCP smoke (no browser MCP tool is available in this session).
- Safety invariant: binary content blocks remain byte-for-byte unchanged in the
  client-visible MCP response and never enter AIOS metadata or refs.

## Acceptance mapping

| Observable behavior | Public seam | Assertion |
| --- | --- | --- |
| Images, audio, resources, and future blocks remain usable by a multimodal client. | `createJsonRpcProxyHandler(...)(tools/call)` | The upstream `content` array is deeply equal and AIOS metadata contains no binary payload. |
| New browser MCP entries deliver directly from browser-use. | `buildPreferredMcpServer` and printed snippets | Generated configuration contains the launcher and does not contain `aios-mcp-proxy.mjs`. |
| Diagnostics represent the direct-delivery contract. | `runInterceptionDoctor` with isolated homes | Direct browser delivery is healthy and legacy proxy usage is separately reported. |
| The published tag matches a releasable repository state. | `release-preflight.ps1 -Tag v5.1.0` | Version, changelog, generated surfaces, tests, typecheck, build, and training evidence pass. |

## Minimal vertical slice

The three focused Node tests exercise the exact JSON-RPC result, generated MCP
entry, and doctor output visible to clients. `release-preflight.ps1` then
re-executes the project release gates against the versioned repository state.
Together they detect both multimodal regression and release-contract drift
without touching production client settings.

## Prohibited shortcuts

Do not replace an image with text, weaken deep-equality assertions, suppress
binary-leak checks, skip the release preflight, or run a repair command with
`--fix` against real client homes.
