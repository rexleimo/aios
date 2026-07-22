# Multimodal MCP delivery review

## Reviewed scope

- `scripts/lib/interception/mcp/json-rpc-proxy.mjs`
- `scripts/lib/interception/mcp/tools-call-shrink.mjs`
- `scripts/tests/interception-mcp-proxy.test.mjs`
- `docs/plans/2026-07-22-multimodal-mcp-delivery-test-scope.md`

## Standards review

No style, import-order, or error-boundary issue was found in the completed
proxy preservation change. The handler remains the single JSON-RPC
orchestration point, attaches metadata through the existing helper, and keeps
the focused test isolated in a temporary workspace.

## Specification review

### [P1] Observation projection still serializes non-image binary blocks

`extractToolCallText` treats only `type: 'image'` as binary-safe. Every other
content block is passed to `JSON.stringify`, so an audio block with `data`, an
embedded resource with `blob`, or a future binary block can be written to the
AIOS raw ref and metrics path. The response now preserves those blocks for the
client, but this violates the test-scope invariant that observation metadata
must not contain binary payloads.

Required follow-up: replace the text-only helper with a content observation
projection that emits descriptors for every binary-bearing block and test
audio, embedded-resource, and unknown block fixtures.

### [P1] The browser MCP default remains the legacy proxy route

`buildPreferredMcpServer` still calls `buildAiosMcpProxyServer`; consequently
new browser MCP configuration continues to install the deprecated proxy even
though the approved scope requires direct browser-use delivery by default.

Required follow-up: return the upstream browser server directly, update MCP
snippets and doctor expectations, and add migration tests that distinguish a
direct browser target from a missing configuration.

## Review outcome

The completed proxy change fixes image loss, but the approved refactor is not
complete. Both P1 findings must be addressed before the work item can be
accepted.
