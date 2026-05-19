# Release Recovery And Docs Onboarding Plan

**Goal:** Restore GitHub Releases to the current stable version and make the Chinese docs easier for new users to start using Harness CLI.

**Release recovery:**
- Root cause: `v1.6.0` tag reached GitHub, but the release workflow failed during `scripts/release-preflight.sh` because archived/generated skill outputs drift on Linux: Codex `.system` generated skills are ignored locally and the Claude `skill-creator` license filename differs by case.
- Fix the generated skill artifact contract so a clean archive can pass `node scripts/check-skills-sync.mjs`.
- Because `v1.6.0` is already pushed and failed before release creation, publish a follow-up patch release (`v1.6.1`) instead of force-moving the pushed tag.

**Docs simplification:**
- Keep the full reference docs, but move first-screen guidance toward “what command should I run?”
- Update Chinese homepage, quick start, workflow, and Agent Team pages with a shorter happy path.
- Keep advanced controls (`orchestrate live`, `skill-candidates`, low-level env vars) in later sections, not the first user path.

**Verification:**
- Run release preflight on the working tree and a clean archive.
- Run focused script tests that cover release and skills sync.
- Build or check docs navigation enough to catch broken links/syntax.
- Confirm GitHub has a release newer than `v0.17.0` after tag push.
