# Fresh Installer Core Setup Fix

## Objective

New users should not see `doctor-superpowers` errors immediately after running the release one-liner installer and following the printed `aios doctor` step.

## Evidence

- Latest release API reports `v1.11.2` with `aios-install.sh`, `aios-install.ps1`, `harness-cli.tar.gz`, and `harness-cli.zip`.
- Fresh install simulation in `/private/tmp/rex-new-home` and `/private/tmp/rex-new-install` reproduced the failure:
  - `aios doctor` exited `1`
  - `doctor-superpowers` reported missing `~/.codex/superpowers`, missing `~/.codex/superpowers/skills`, and missing `~/.agents/skills/superpowers`
- Running `setup --components superpowers --skip-doctor` removed the fatal superpowers error.
- Running `setup --components skills,native --client all --skip-doctor` cleared the remaining skills/native first-run warnings.

## Fix

- Make release one-liner installers run first-run core setup automatically after runtime dependency bootstrap:
  - `setup --components skills,native,superpowers --client all --skip-doctor`
- Keep browser setup out of the one-liner to avoid heavy browser/runtime side effects during initial install.
- Add `AIOS_FIRST_SETUP=0|false|off|no` escape hatch for users who only want the unpacked runtime.

## Verification Plan

- Add a regression test that asserts both shell and PowerShell installers perform first-run core setup and do not include browser setup.
- Re-run the targeted release pipeline test.
- Re-run the root script suite if time allows.
