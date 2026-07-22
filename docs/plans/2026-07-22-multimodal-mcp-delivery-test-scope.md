# Multimodal MCP delivery test scope

## User-visible contract

Browser MCP screenshots and other multimodal tool results reach the client in
their original MCP `content` form. The deprecated AIOS interception proxy may
record compact, binary-safe observation metadata, but it must not replace,
remove, reorder, or mutate a result content block. New browser MCP
installations are configured to connect directly to the browser-use launcher.

## Boundaries

- In scope: `tools/call` proxy result handling, browser MCP configuration
  generation and snippets, interception doctor reporting, and their focused
  tests.
- Out of scope: model selection, direct user-uploaded attachments, browser-use
  upstream behavior, existing global client configuration, and deleting the
  legacy proxy implementation.
- Safety invariant: a returned image, audio, embedded resource, or unknown
  content block is opaque protocol data and remains byte-for-byte identical.
  Observation metadata may not contain its binary payload.

## Acceptance mapping

| Observable behavior | Public seam | Assertion |
| --- | --- | --- |
| A text tool result remains usable by the client while the proxy records metadata. | `createJsonRpcProxyHandler(...)(tools/call)` | The returned text block is unchanged and `_meta.aios` contains a compact packet reference. |
| A screenshot stays visible to a multimodal model. | `createJsonRpcProxyHandler(...)(tools/call)` with text and image blocks. | The response preserves block order, image MIME type, and exact base64 data; metadata stores no image data. |
| The proxy does not make assumptions about future MCP block types. | Same handler with image, resource, and unknown blocks. | Every content block is deeply equal to the upstream result. |
| A new browser MCP installation does not route page screenshots through the deprecated proxy. | `buildPreferredMcpServer`. | Its command and arguments target the browser-use launcher and contain no `aios-mcp-proxy.mjs`. |
| Diagnostics distinguish a legacy browser proxy from a missing browser MCP. | `runInterceptionDoctor` with isolated target fixtures. | A configured direct browser MCP is healthy; a legacy proxy is reported without treating direct delivery as a failure. |

## Minimal vertical slice

The JSON-RPC handler is the stable protocol seam: it exercises the exact MCP
response shape that the Codex client receives without launching a browser or
writing a user configuration. The browser configuration builder and doctor
tests cover the default route and migration reporting with isolated fixtures.

## Prohibited shortcuts

Do not special-case PNG only, replace multimodal blocks with a textual
summary, log base64 payloads to refs or metrics, make direct browser MCP
delivery opt-in, or update real home-directory client configuration as part of
the test suite.
