# DeepSeek Search/Fetch MCP

## Launch and installation

Requires Node 24 and the repository's existing `@modelcontextprotocol/sdk`
dependency. No new dependency or separate daemon is required. For a fresh
installation, install the repository dependencies with `npm ci --omit=dev`.

Configure an MCP host to spawn this stdio command (use an absolute install path):

```sh
node /absolute/path/to/harness-cli/scripts/aios-search-mcp.mjs
```

Supply `DEEPSEEK_API_KEY` to that child process through the host's secure
environment mechanism. The server reads it only for a validated tool invocation,
not at import, startup, initialization, or discovery. It never reads `.env` files.
Do not put credentials in tool arguments, command-line arguments, or committed
client configuration. Launching does not itself issue a DeepSeek API request.

## Contract

Flow: agent -> local MCP stdio server -> DeepSeek HTTPS JSON API.

| MCP tool | Fixed endpoint | Arguments |
| --- | --- | --- |
| `deepseek_search` | `POST https://api.deepseek.com/v1/tools/search` | `query`: nonblank, 1-128 Unicode characters; `count`: integer 1-50, default 10; `ori_question`: 1-128 characters or null/omitted; `localization`: IPv4/IPv6 or empty, default empty; `need_content`: boolean, default false |
| `deepseek_fetch` | `POST https://api.deepseek.com/v1/tools/fetch` | `url`: absolute HTTP(S), host required, at most 8192 characters, no credentials, whitespace, controls, or backslashes |

Unknown arguments are rejected locally (stricter than the upstream API).
Search operators are forwarded unchanged; null `ori_question` is omitted.
Requests use `Authorization: Bearer <server-side key>` and JSON content type.
Endpoints cannot be overridden through tool arguments or environment variables.
Redirects and automatic retries are disabled.

The installed MCP SDK owns protocol negotiation, `initialize`, `ping`,
`notifications/initialized`, and request dispatch. The server advertises only
tools. Send the initialized notification after the initialization reply before
`tools/list` or `tools/call`. Discovery returns JSON input/output schemas,
read-only/open-world annotations, and cost metadata under `_meta["aios/cost"]`.

Successful calls return the documented provider object in `structuredContent`
and matching JSON in a text content block. Search returns `results` with the
documented score, title, URL, snippet, summary, content, site, date, and authority
fields; Fetch returns `title` and Markdown `content`. Unknown response fields
are removed and documented fields are schema-validated. Tool failures use MCP
`isError: true`; malformed protocol messages use JSON-RPC errors.

## Billing and outbound data

Current public guides independently publish:

- [English guide](https://api-docs.deepseek.com/guides/search.md): **USD 0.75 per
  1,000 successful requests**, for Search and Fetch separately.
- [Chinese guide](https://api-docs.deepseek.com/zh-cn/guides/search.md): **CNY 5 per
  1,000 successful requests**, for Search and Fetch separately.

These are the respective published currency prices, not a conversion claim.
Primary tool metadata uses USD 0.75 and its English source; `localizedPrices`
contains CNY 5 and its Chinese source. Both prices appear in tool descriptions
and initialization instructions. Recheck provider pricing before enabling.

The provider bills HTTP 200 requests producing nonempty Search results or Fetch
page content. Failed requests, empty Search results, and provider timeouts are
not billed; `count` does not change the per-request price. A local cancellation,
deadline, or validation failure *after* an upstream request starts cannot revoke
an upstream charge that has already occurred.

Query, original question, localization IP, and target URL (when supplied) leave
the machine for DeepSeek. Do not send sensitive values without authorization.

## Security and resource bounds

- Fetch URLs are sent to DeepSeek's remote proxy, never resolved or fetched by
  this local server. Private/loopback host syntax is accepted; DeepSeek's target
  policy determines whether it can be fetched. This is not a local-network
  fetch feature or a guarantee that the provider blocks every private target.
- Returned web content is untrusted data, not instructions. Only successful
  schema-validated content is returned; HTTP error bodies are not surfaced.
- Errors use fixed messages without exception details, credentials, response
  bodies, or unsafe SDK validation data. Stdout contains only JSON-RPC lines;
  stderr diagnostics are fixed structured events, not raw errors.
- Input lines and HTTP request bodies: **64 KiB** each. Oversized lines are
  discarded through the next newline with one safe error, then parsing resumes.
- HTTP response body: **2 MiB**, checked against advertised and actual streamed
  bytes. UTF-8 and JSON are validated. No partial result is returned on overflow.
- Deadline: **30 seconds**, covering headers and streamed body. At most **4**
  simultaneous tool calls; excess calls fail before credential lookup/HTTP.
- Output frame: **8 MiB**; queued output: **16 MiB**. A stalled output exceeding
  the queue bound closes the connection rather than accumulating indefinitely.
- Client cancellation is forwarded to the HTTP abort signal. EOF, stream errors,
  explicit close, SIGINT, or SIGTERM close the transport and abort in-flight work.
  EOF allows already-dispatched synchronous replies to flush before closing.

## Offline verification

```sh
node --test scripts/tests/tooling/search/deepseek-client.test.mjs scripts/tests/tooling/search/deepseek-contracts.test.mjs scripts/tests/tooling/search/deepseek-mcp.test.mjs scripts/tests/tooling/search/deepseek-stdio.test.mjs
```

Tests inject fake environments, fake HTTP responses, and in-memory streams; they
do not read real credentials, call paid endpoints, or start real client adapters.
The SDK client interoperability test uses its in-memory transport.

## Ownership decision

Use the already-installed SDK for MCP instead of a second handwritten protocol
implementation. A dedicated bounded transport replaces its unbounded stdio line
reader and removes potentially sensitive protocol error details. The HTTP owner
alone handles authentication, fixed endpoints, deadlines, and bounded streaming;
contracts own schemas and billing disclosure. Client registration, UI presets,
suite manifests, release integration, and broader regression remain parent-owned.
