# AIOS-managed Rex Harness Test Scope

## User goal

AIOS installation and update paths manage a compatible `rex-harness` executable.
Users can invoke it through a stable `aios rex ...` entrypoint without a global
`PATH` installation. A release for this public capability uses a minor version
bump.

## Non-goals

- Do not require or silently run `npm link`.
- Do not overwrite project-local `.rex-harness/` evidence state.
- Do not make an incompatible `rex-harness` latest release active by default.
- Do not commit local OpenCode or Hermes configuration changes.

## Acceptance mapping

| Behavior | Observable assertion |
| --- | --- |
| Managed command | `aios rex doctor` delegates to managed Rex executable and returns its exit code/output. |
| Install | Fresh AIOS installation provisions compatible Rex executable before projecting Rex skills. |
| Update | `aios update` selects manifest-compatible Rex version, validates it with `doctor`, and retains prior usable version on validation failure. |
| Compatibility | Default update uses AIOS-declared compatible version; explicit latest upgrade remains opt-in. |
| Release | Package version and release notes identify a SemVer minor release. |
| Local config | `opencode.json` and `.hermes/.aios-native-sync.json` are ignored and removed from Git tracking without deleting local files. |

## Test seam and first slice

Use existing Node CLI integration tests as public seams: invoke installation and
update commands against a temporary `HOME`/runtime directory, then invoke
`aios rex doctor`. Stub only package acquisition at the process boundary. First
vertical slice: resolve managed executable and forward `doctor`; it proves the
stable public command without requiring global `PATH` state.

## Completion criteria

Focused regression tests cover install, compatible update, failed validation
rollback, and `aios rex` forwarding. Existing Rex adapter regression remains
green. Full root regression suite, Rex harness tests/doctor, and MCP server
typecheck/tests/build pass before release. Release commit contains only intended
tracked files; ignored local configuration remains on disk.
