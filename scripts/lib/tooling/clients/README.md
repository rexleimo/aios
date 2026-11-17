# Executable client management

This boundary inventories executable installations, not client configuration.
It does not read client config, MCP settings, credentials, or package registries
to produce inventory or previews. An update is the only mutating operation.

## Integration

- Node callers import `createClientManager`, `CLIENT_IDS`,
  `ClientManagementError`, and `redactClientOutput` from `index.mjs`.
  Adjacent `index.d.mts` declares the manager, injectable I/O, inventory, source,
  preview, request/result, and JSON response contracts.
- `createClientManager(options?)` exposes `inventory()`, `previewUpdate(id)`,
  and `updateClient({ client, confirm: true, expectedRevision })`.
- Next must **not import this module**, including for runtime convenience.
  ADR 0007 keeps `scripts/lib/**` out of the bundler graph. Use
  `apps/shell/ui/src/lib/data/clients.mjs`: `loadClients`,
  `previewClientUpdate`, `updateClient`, `runClientManagement`, and
  `clientManagementStatus`. It invokes the JSON CLI via bounded `execFile`,
  `process.execPath`, an argv array, and `shell: false`.
- The import-safe `scripts/aios-client-management.mjs` exports
  `parseClientManagementArgs`, `runClientManagementCli`, and
  `clientManagementFailure`. Executed CLI calls emit one JSON envelope, with
  exit 0 on success and exit 1 on structured failure. Closed argument forms:

  ```text
  inventory
  preview-update <declared-client-id>
  update <declared-client-id> --confirm --expected-revision <64-lowercase-hex>
  ```

HTTP uses uncached Node handlers at `/api/clients`:

1. `GET` returns `{ ok: true, clients: [...] }`.
2. `POST { action: 'preview-update', client: 'pi' }` returns
   `{ ok: true, preview: { client, supported, reason, revision, command, ... } }`.
3. Display `preview.command.file` and `.args` as data, not a shell command.
   Never execute or submit an edited command from the browser.
4. After explicit user confirmation, send
   `POST { action: 'update', client: 'pi', confirm: true, expectedRevision: preview.revision }`.
   Do not substitute an inventory revision, recompute the revision in the UI,
   or automatically retry a failed update.

Success returns `{ ok: true, result: { client, before, after, changed, command, output } }`.
An unchanged version is a verified unchanged-version result, not proof that no
files changed or that an upgrade occurred.
Failures return `{ ok: false, error: { code, message, lockRetained?, output? } }`.
Invalid input is HTTP 400; stale evidence 409; unsupported updates 422; locks
423; runtime, process, and readback failures 502. POST bodies are limited to
4096 bytes, including requests without a Content-Length header.

## Observation states

- `installed: true` requires an executable regular file with resolved paths.
  `executable.path` is the selected PATH entry; `realPath` is its resolved file.
- `installed: false` means no executable was found in absolute PATH entries.
  Empty/relative PATH entries are skipped; a configuration file is not evidence.
- `installed: null` with `versionStatus: 'unknown'` means failed or torn
  inspection. Never display that as absent, installed, or a successful refresh.
- A detected executable can still have `version: null` and a version status of
  `failed`, `unrecognized`, or `unsupported`. Only a recognized successful
  `--version` probe can authorize an update. Version output is never returned
  as arbitrary text. Other declared IDs can be detected but are not probed or
  updated; their `inventorySupported` is false.

## Source restrictions

Automatic updates support only `claude`, `codex`, and `pi` with verified POSIX
`npm-global` evidence: the selected `<prefix>/bin/<client>` entry must resolve
inside the matching global package; package name/version/bin metadata must
agree; and the exact prefix's npm runner plus the Node executable must be
verified. Package names are an immutable mapping, never request data:

| Client | npm package |
| --- | --- |
| claude | @anthropic-ai/claude-code |
| codex | @openai/codex |
| pi | @mariozechner/pi-coding-agent |

The preview invokes verified Node with verified npm's CLI, `update --global
--prefix <observed-prefix>`, null user/global npm config files, the fixed public
npm registry, and the fixed package name after `--`. It does not invoke a shell
or sudo, accept arbitrary flags, or modify AIOS registries or client settings.
Execution environments allow only PATH/home/system/temp variables plus fixed
locale/CI settings; inherited NODE_OPTIONS and package/auth variables are removed.
The Next wrapper additionally passes its controlled AIOS_PROJECT_ROOT.

Homebrew, stores/app bundles, Windows shims, unknown/local/ambiguous installs,
unverified npm runners, and other declared clients cannot update.
`claude-native` denotes a recognized native *layout only*: it is not proof of
official provenance, so automatic `claude update` is intentionally disabled.
Each unsupported preview includes a reason and `command: null`.

## Revision and locking protocol

Every observation is fresh. SHA-256 revisions include executable/link/stat
identities, package metadata digests, runner identities, version, sanitized
environment, and working directory. Update requires the exact preview revision,
then repeats inspection under the lock and once more immediately before launch.
Drift fails before mutation. This is conservative observation-based checking,
not a cryptographic package trust or atomic filesystem guarantee.

One atomic directory lock covers all clients and manager instances for the
current user: `<os.tmpdir()>/aios-client-management-<uid-or-user>.lock`.
Custom `lockPath` is for controlled embedders/tests; all cooperating callers
must use the same path. No age/PID heuristic reclaims an existing lock.

Failures before launch release the lock. Attempted updates that fail or time
out retain it (`UPDATE_FAILED`); unverified post-update state retains it
(`READBACK_FAILED`); failed removal reports `LOCK_RELEASE_FAILED`. An existing
lock or inability to acquire it returns `CLIENTS_LOCKED`, never an unlocked
fallback. Bounded execution kills the direct child, not an entire process tree;
the retained lock avoids silently retrying while descendants may remain.

### Operator recovery (never automatic)

1. Stop issuing updates and identify the exact user/temp root and lock path.
   Preserve the structured error; do not print unredacted process diagnostics.
2. Verify independently that no updater or descendant is still running and no
   other shell/app instance is updating this prefix. Do not infer safety merely
   from elapsed time, a dead parent PID, or an unchanged version.
3. Inspect the affected executable, package metadata, and prefix with the
   relevant package manager. Repair partial installs outside this API if needed.
4. Only after those checks, an operator may remove the exact **empty** lock
   directory with a nonrecursive directory-removal operation. Unexpected files,
   permissions, symlinks, or uncertain ownership require investigation, not
   recursive deletion or force removal. There is deliberately no unlock API.
5. Request fresh inventory and a new preview; require a new explicit
   confirmation. Never replay the old revision or automatically retry.

## Bounds and offline verification

Version probes use 2500 ms / 16384 bytes; updates use 120000 ms / 262144 bytes.
Next subprocesses use 20000 ms for reads, 145000 ms for updates, and 1048576
bytes. Metadata reads are capped at 65536 bytes; link chains at 12 hops.
Diagnostics are bounded and redact known credential forms; redaction is not
proof arbitrary client output is safe for public logging.

The tests use in-memory filesystem/process adapters. The HTTP harness exercises
the real route, wrapper, CLI, and manager with fake subprocess I/O. No installed
client, network registry, or actual updater is used:

```sh
node --test scripts/tests/tooling/clients/*.test.mjs
```

Broad repository regression and real installer smoke tests are separate; do not
claim either from these offline results. UI rendering and the parent-owned
`shell-client-model.test.mjs` remain the parent integration's responsibility.
