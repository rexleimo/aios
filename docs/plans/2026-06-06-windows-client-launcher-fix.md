# Windows Client Launcher Fix Plan

Goal: make Windows client wrappers robust when npm-installed launchers point at unusable native binaries, without regressing clients that ship valid native executables.

Scope:
- `scripts/lib/platform/process/windows-command.mjs`
- `scripts/tests/aios-components.test.mjs`

Approach:
- Add a launcher validation step for Windows native `.exe` targets before treating them as direct executables.
- If the `.exe` target is not a real Windows binary, look for a package-local Node wrapper such as `cli-wrapper.cjs` and execute that through `node.exe`.
- Keep valid native executables, such as the current `opencode.exe`, on the direct-exec path.

Verification:
- Add a failing regression test for an invalid `.cmd -> .exe` launcher with a package wrapper fallback.
- Keep the existing passing coverage for valid `opencode.exe` direct execution.
- Run the targeted Node tests that cover Windows launcher resolution.
