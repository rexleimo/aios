# Docs Visual Onboarding Improvement Plan

**Goal:** Make AIOS official docs easier for new users by adding visual onboarding, real CLI/TUI evidence, and scenario-based image assets.

**Scope:** Chinese docs first. Update public docs pages and static assets only; do not change runtime behavior.

## Tasks

1. External review with `claude --model kimi-k2.6`
   - Input only public docs URLs and sanitized excerpts.
   - Do not send secrets, private configs, logs, cookies, or browser profile data.
   - Capture output to `temp/docs-visual-review-kimi-20260425.md`.

2. Local evidence capture
   - Run safe read-only/help commands for `aios`, `aios doctor --help`, `aios team --help`, `aios hud --help`.
   - Capture output under `temp/docs-visual-evidence-20260425/`.
   - Use this evidence to avoid inventing UI claims.

3. Image assets
   - Create four onboarding visuals in `docs-site/assets/`:
     - new user path
     - setup + doctor TUI concept
     - ContextDB memory loop
     - Agent Team monitoring
   - Keep AI-generated images clearly illustrative, not fake screenshots.

4. Docs integration
   - Update `docs-site/zh/index.md`, `docs-site/zh/getting-started.md`, `docs-site/zh/use-cases.md`, `docs-site/zh/team-ops.md`.
   - Add CSS for visual cards in `docs-site/assets/custom.css`.
   - Keep text concise and preserve command copyability.

5. Verification
   - `python3 -m mkdocs build --strict`
   - Review changed assets and git diff.
   - Commit and push.
