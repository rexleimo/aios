---
title: Quick Start
description: The shortest path from installation to first use: install, open the TUI, run Doctor, then start an agent inside a project.
---

# Quick Start

Goal: **install RexCLI, open the TUI, run Doctor once, and start an agent in a project in about 3 minutes.**

If you do not know every RexCLI feature yet, that is fine. Follow this page first, then continue to [Find Commands By Scenario](use-cases.md).

## What You Need

- Node.js **22 LTS** and `npm`
- At least one coding CLI: `codex`, `claude`, `gemini`, or `opencode`
- A project directory where you want to work

Check Node:

```bash
node -v
npm -v
```

If Node is not 22, switch first:

```bash
nvm install 22
nvm use 22
```

## 1) Install The Stable Release

=== "macOS / Linux"

    ```bash
    curl -fsSL https://github.com/rexleimo/rex-cli/releases/latest/download/aios-install.sh | bash
    source ~/.zshrc
    aios
    ```

    If you use bash instead of zsh, replace `source ~/.zshrc` with `source ~/.bashrc`.

=== "Windows PowerShell"

    ```powershell
    irm https://github.com/rexleimo/rex-cli/releases/latest/download/aios-install.ps1 | iex
    . $PROFILE
    aios
    ```

After installation, the default directory is `~/.rexcil/rex-cli`, and the unified entry point is `aios`.

!!! tip "When should I use git clone?"
    Use `git clone` only if you explicitly want unreleased `main` branch behavior. Stable users should prefer the GitHub Releases installer.

## 2) Finish Setup And Doctor In The TUI

Run:

```bash
aios
```

Recommended order:

1. Choose **Setup**.
2. Select `all`, or the minimal set `shell,skills,superpowers`.
3. After installation, choose **Doctor**.
4. Start using RexCLI after Doctor shows no critical errors.

<figure class="rex-visual">
  <img src="assets/visual-tui-setup-doctor.svg" alt="Illustration of choosing Setup first and Doctor second in the aios TUI">
  <figcaption>Illustration: after the TUI opens, run Setup first, then Doctor. When critical errors are 0, go into your project and start `codex` / `claude` / `gemini` / `opencode`.</figcaption>
</figure>

If you changed shell wrappers, reload the current shell:

=== "macOS / Linux"

    ```bash
    source ~/.zshrc
    ```

=== "Windows PowerShell"

    ```powershell
    . $PROFILE
    ```

## 3) Enable Memory In A Project

Enter your project directory:

=== "macOS / Linux"

    ```bash
    cd /path/to/your/project
    touch .contextdb-enable
    codex
    ```

=== "Windows PowerShell"

    ```powershell
    cd C:\path	o\your\project
    New-Item -ItemType File -Path .contextdb-enable -Force
    codex
    ```

You can also replace the last line with:

```bash
claude
gemini
```

As long as they run in the same project directory, they read and write the same ContextDB.

## 4) Confirm It Works The First Time

Run inside the project:

=== "macOS / Linux"

    ```bash
    aios doctor --native --verbose
    ls -la memory/context-db
    ```

=== "Windows PowerShell"

    ```powershell
    aios doctor --native --verbose
    Get-ChildItem -Path memory/context-db -ErrorAction SilentlyContinue
    ```

If you see directories such as `sessions/`, `index/`, or `exports/`, ContextDB has started recording.

If the directory does not exist yet, start `codex` / `claude` / `gemini` / `opencode` once normally and let RexCLI initialize it automatically. You do not need to reinstall immediately.

If it still does not appear, run:

```bash
aios doctor --native --fix
```

## 5) The 7 Most Used Commands

| Scenario | Command |
|---|---|
| Open the TUI | `aios` |
| Start Codex with memory | `codex` |
| View current session status | `aios hud --provider codex` |
| Run one agent overnight | `aios harness run --objective "Draft tomorrow handoff" --worktree --max-iterations 20` |
| Run a multi-agent task | `aios team 3:codex "Implement X and run tests before finishing"` |
| Watch team progress | `aios team status --provider codex --watch` |
| Pre-submit quality check | `aios quality-gate pre-pr --profile strict` |

Route shortcuts are available inside native clients after setup:

- Claude/Gemini/OpenCode: `/single <task>`, `/subagent <task>`, `/team <task>`, `/harness <task>`.
- Codex: `/prompts:single <task>`, `/prompts:subagent <task>`, `/prompts:team <task>`, `/prompts:harness <task>`.
- If they are missing, run `aios doctor --native --fix`.

## 6) Use Memo For Persistent Operator Memory

If you need durable project notes without manually touching ContextDB files:

```bash
aios memo use release-train
aios memo add "Need strict pre-PR checks #quality"
aios memo pin add "Avoid destructive git commands."
aios memo persona init
aios memo persona add "Response style: concise, direct, evidence-first"
aios memo user init
aios memo user add "Preferred language: zh-CN + technical English terms"
aios memo recall "quality gate" --limit 5
```

Memory layering:

- `memo add/list/search/recall` -> ContextDB events
- `memo pin` -> workspace `pinned.md`
- `memo persona/user` -> global identity files (`~/.aios/SOUL.md`, `~/.aios/USER.md`) injected into the `ctx-agent` Memory prelude before workspace memo content

## 7) Shortest Agent Team Usage

Use this only when the task can be split into relatively independent parts:

```bash
aios team 3:codex "Implement the user settings page, add tests, and update docs"
aios team status --provider codex --watch
```

If you are fixing a small bug or do not know how to split the work yet, start normally:

```bash
codex
```

See [Agent Team](team-ops.md) for more decision rules.

## 8) Let One Agent Run Overnight

Use Solo Harness when one provider should keep working on one clear objective and leave a run journal:

```bash
aios harness run --objective "Draft tomorrow handoff" --session nightly-demo --worktree --max-iterations 20
aios harness status --session nightly-demo --json
```

When you start from wrapped `codex` / `claude` / `gemini` / `opencode`, the startup route prompt lets the agent self-trigger this lane for explicit long-running, overnight, resumable, or checkpoint-heavy tasks. The injected command includes `--workspace <project-root>` so ContextDB artifacts stay in the active project.

Use `CTXDB_HARNESS_MAX_ITERATIONS=<n>` to change the default injected loop budget.

## 9) Browser Automation Troubleshooting

RexCLI uses a CDP/browser-use path for browser automation by default. For browser-related issues, start with:

```bash
aios internal browser doctor --fix
aios internal browser cdp-status
```

For complex pages, ask the agent to read page text/DOM first, then use screenshots as fallback. Do not start by blindly clicking buttons.

## 10) Privacy-Safe Reads

Do not paste `.env`, tokens, cookies, or cloud config directly into a model. Use:

```bash
aios privacy read --file <path>
```

When RexCLI-wrapped `codex` / `claude` / `gemini` / `opencode` starts, the Privacy Shield panel shows the current privacy protection status.

## 11) Update And Uninstall

Prefer the TUI:

```bash
aios
```

Or use commands:

```bash
aios update --components all --client all
aios uninstall --components shell,skills,native
```

## 12) Development Install Path

Maintainers or users testing unreleased features can use:

=== "macOS / Linux"

    ```bash
    git clone https://github.com/rexleimo/rex-cli.git ~/.rexcil/rex-cli
    cd ~/.rexcil/rex-cli
    scripts/aios.sh
    ```

=== "Windows PowerShell"

    ```powershell
    git clone https://github.com/rexleimo/rex-cli.git $HOME\.rexcil\rex-cli
    cd $HOME\.rexcil\rex-cli
    powershell -ExecutionPolicy Bypass -File .\scripts\aios.ps1
    ```

Development install is not the same as stable release. Most users should use the one-liner in step 1.

## FAQ

### Does RexCLI replace native CLIs?

No. You still run `codex`, `claude`, `gemini`, and `opencode`. RexCLI adds memory, skills, diagnostics, and orchestration around them.

### Can agents trigger AIOS themselves?

Yes, when they are launched through the wrapped clients. The startup prompt tells the agent when to stay on `single`, when to use `team`/`subagent`, and when a long-running objective should invoke `aios harness run ... --workspace <project-root>`.

### Why create `.contextdb-enable`?

It is an opt-in switch so RexCLI does not record context in every directory. Create it only in repositories where you want project memory.

### Do I need to learn ContextDB / Superpowers / Team Ops first?

No. New users only need three things at first: `aios` for setup and diagnostics, `.contextdb-enable` for project memory, and `codex` for normal work.

### How many agents should I start with?

Start with `3`:

```bash
aios team 3:codex "task"
```

If conflicts increase, reduce to `2`; if the task is very independent, consider `4`.

### What if `CODEX_HOME points to ".codex"`?

It means `CODEX_HOME` is relative. Change it to an absolute path:

```bash
export CODEX_HOME="$HOME/.codex"
mkdir -p "$CODEX_HOME"
```

### What should I read next?

- [Find Commands By Scenario](use-cases.md)
- [Agent Team](team-ops.md)
- [ContextDB](contextdb.md)
- [Troubleshooting](troubleshooting.md)
