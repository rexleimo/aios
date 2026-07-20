# AIOS v5.0.0 Isolated Upgrade Verification Review

## Scope reviewed

- Release identity: `v5.0.0` and `origin/main` resolve to `33a55aa07b306c34db2710476fb5c3049c8e346e`; bundled `rex-harness` resolves to `8c99152e8f531f086e4ab65db627315f90a5f5f3`.
- Upgrade lifecycle: `scripts/lib/lifecycle/update.mjs` prepares the Rex workflow surface before installing client projections.
- Legacy cleanup boundary: `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs` preserves unproven links by default, requires explicit adoption, then validates the exact link and source before unlinking.
- Tests: `scripts/tests/rex-workflow-surface-reconciliation.test.mjs` and `scripts/tests/rex-client-projection.test.mjs`.
- Local validation artifacts only: no product source or test assertion was changed for this verification.

## Standards review

No blocking standards finding.

The verification uses a disposable client-home root, has no new runtime abstraction or test-only product export, and keeps the result documents under the existing `docs/plans/` ownership. `git diff --check` passed. The repository worktree contains three untracked verification artifacts plus the timestamp refresh in `.hermes/.aios-native-sync.json` created by the authorized global native update; no product source or test assertion changed.

## Specification review

No blocking specification finding within the isolated acceptance scope.

1. A real CLI invocation of `node scripts/aios.mjs update --components skills,native --client all --scope global --skip-doctor` ran with every client-home variable under one temporary directory and exited zero (`receipt:ad7669c5-5cbb-47ed-ada3-b8dbb7fae46d`). Its observed output reported `[rex] ... workflow skills: installed` for Codex, Claude, Gemini, OpenCode, Hermes, and Grok.
2. The resulting six `rex-workflow/SKILL.md` files were independently inspected and each contains `rex-harness CLI`.
3. The real lifecycle regression passed twice in disposable fixtures (`receipt:803dafea-e256-495e-a89d-a0691b51dc19` and `receipt:8b22c082-4040-450d-b37b-f9343f80b323`). It asserts default preservation of legacy symbolic links and their sources, then `ENOENT` after explicit adoption removes recognized links across native and shared roots.
4. The all-client Rex projection regression passed (`receipt:18cbff31-9d0c-4047-92fe-54904e9f3444`), including the Grok root.
5. After isolation, the same skills and native update was applied to the operator's global client roots and exited zero (`receipt:e03111d1-7bce-45ad-aca5-cf18622da7ed`). The post-update doctor reports Rex ready, `Rex workflow surface is converged`, all managed skills healthy, and all six native client surfaces healthy.

## Boundaries and limitations

- The literal CLI update was intentionally run from the checked-out v5.0.0 source and the self-update step warned that it was skipped because this verification created local artifacts. Therefore it proves the v5.0.0 update behavior, not downloading another copy from a package registry.
- The isolated CLI fixture began without legacy links. Exact legacy adoption safety is covered by the lifecycle regression, which seeds and verifies those links in a disposable fixture.
- GitHub Release assets were not reviewed: local `gh` credentials and public-release visibility are unavailable. This review confirms the pushed Git tag only.
- The post-update doctor still has unrelated environment findings: browser-use is absent at `/Users/rex/codes/ai-browser-book/mcp-browser-use`, no default CDP endpoint is configured, the shell does not yet expose `~/.aios/bin` in `PATH`, and the MCP budget is 14 of 10. These do not invalidate the Rex-only workflow migration, but they prevent a clean full-environment doctor result.
