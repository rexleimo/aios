# Release plan — v7.1.0 motion contract

## Objective and acceptance

Publish the motion contract shipped in `e37bf298` as the next host release, and leave every gate that the release pipeline actually runs in a state a maintainer can reproduce. This plan covers the release only; the feature is committed and pushed.

1. `VERSION` moves `7.0.0 → 7.1.0` and `CHANGELOG.md` gains a matching `## [7.1.0] - YYYY-MM-DD` heading placed above `## [7.0.0]`, so `release-preflight.sh` passes its tag/VERSION/heading checks.
2. `aios skill verify-training --changed --base v7.0.0` reports `verified` for the only changed skill (`frontend-design`), and its evidence is **committed**, because CI reads evidence from the tagged commit, not the working tree.
3. `docs-site/llms.txt` is regenerated and matches `generate-llms-txt.mjs`, and `llms-txt.test.mjs` stays green — which for a feature release requires a `v7.1.0:` release post to exist and lead the Blog index.
4. `scripts/release-preflight.sh --tag v7.1.0` exits 0 on the exact commit that will be tagged.
5. An annotated tag `v7.1.0` is pushed, and the GitHub release workflow produces the archive with the recorded `rex-harness` gitlink.

Non-goals: no `rex-harness` change (so no submodule release and no submodule-first ordering); no change to `MOTION.md` semantics or thresholds; no frame-capture gate (its absence is recorded in ADR 0006); no retro-fix of the pre-existing repo debt listed under "Known red, not this release".

## Baseline and ownership

- `main` tracks `origin/main`; HEAD is `e37bf298`, working tree clean, everything pushed.
- Submodule `rex-harness` is at `6563c827` (`v1.0.0`), matching its gitlink, and this release does not touch it. Verified with `git submodule status` → no `+`/`-`/`U` prefix.
- Last tag reachable from `HEAD^` is `v7.0.0` (`scripts/release-preflight.sh` computes `TRAINING_BASE` that way), so every certification below must use `--base v7.0.0`. Certifying at `HEAD` produces evidence the release gate can never accept — this is the A20 trap recorded in `docs/reference/outstanding-work.md`, and its symptom is a permanently blocked gate with a remedy that looks correct.
- Commits in scope: `e37bf298` (the feature) and `125f0c91` (a docs-only plan record). Nothing else lands in this release.

## Facts established by investigation (not assumed)

| Question | Answer | How it was established |
|---|---|---|
| Does this release need a submodule release first? | No | `git submodule status` clean; `git log v7.0.0..HEAD` touches no `rex-harness/` path |
| Is the skill-training gate actually a blocker? | **Yes**, currently blocked | `aios skill verify-training --changed --base v7.0.0` → `status: blocked`, code `accepted-hash-differs-from-current-skill`, stale refs are the two 2026-09 certifications |
| Can it be satisfied offline, deterministically? | Yes | Probed `aios skill certify --skill frontend-design --base v7.0.0` → `status: verified` in seconds; `evaluateSkillComplianceLive` is deterministic text scoring, **not** a model call. Probe evidence was deleted afterwards, so the gate is blocked again by design |
| Does a `minor` bump force a blog post? | Yes, by test | `llms-txt.test.mjs` asserts the first Blog entry must carry `vX.Y.Z:` when `isMaintenanceRelease(version)` is false; only `patch > 0` is a maintenance release |
| Is `check:site-sync` a release gate? | No | No `.github/workflows/*.yml` invokes it, and it is not in `test:scripts` |
| Is `check:site-sync` currently green? | **No — exit 1, 24 pre-existing failures** | All 24 are `missing blog translation` on old posts (`v6.1.0`…`v6.9.0`); none is caused by this release and none involves `v7.1.0` |
| Is `docs-site/changelog.md` kept in step with `CHANGELOG.md`? | No — curated page, stale since `v6.3.0` | It has 0 `## [` headings against `CHANGELOG.md`'s 219; no gate reads it |

## Release sequence

Each step states its verification; a step without a pasted command result is not done.

### 1. Certify the changed skill (the only real prerequisite)

```bash
node scripts/aios.mjs skill certify --skill frontend-design --base v7.0.0 --json
node scripts/aios.mjs skill verify-training --changed --base v7.0.0 --json   # expect status: verified
```

The certification writes `docs/evidence/skill-training/frontend-design-certification-<ts>/`. Commit it in the same commit as the version bump: `release-preflight.sh` refuses a dirty or untracked `docs/evidence/skill-training`.

Do not certify at `--base HEAD`. It passes locally and fails the gate.

### 2. Bump version and changelog

```bash
scripts/release-version.sh minor "motion contract: MOTION.md, executable declaration gate, frontend-design reads the contract"
```

Then edit the inserted entry so it states what a reader needs, in the existing bilingual table-of-contents-free style: the contract split, the gate and its 8-item baseline, the `frontend-design` change, and the explicit non-delivery of the frame-capture gate. `release-version.sh` only writes a one-line summary.

Verify the heading shape the preflight greps for — `^## \[7.1.0\] - YYYY-MM-DD$` — and that it sits above `## [7.0.0]`.

### 3. Release post, four locales

Feature release ⇒ the post is mandatory, not a nicety. Required files, following `blog-site/2026-10-v700-grill-readiness.md` exactly:

- `blog-site/2026-11-v710-motion-contract.md`
- `blog-site/zh/`, `blog-site/ja/`, `blog-site/ko/` mirrors, same slug

Frontmatter must carry `title: "v7.1.0: …"` (en) / `v7.1.0：…` (zh/ja/ko), `date`, and a `tags` array. The generator finds the current release post by `slug` containing `-v710-` or by `title` containing `v7.1.0:`, so a wrong slug with a right title still works — but the llms `firstEntry` assertion wants the title form.

Content angle that is honest about what shipped: the contract exists because agents could produce motion with no contract at all; the gate only covers what is decidable without looking at frames; the frame-level half is deliberately missing and why.

### 4. Regenerate the machine-readable index

```bash
node scripts/generate-llms-txt.mjs          # writes docs-site/llms.txt
node scripts/generate-llms-txt.mjs --check  # expect: OK
node --test scripts/tests/tooling/tools/llms-txt.test.mjs
```

Order matters: run this **after** step 3, otherwise the index is generated for a release with no post and immediately goes stale.

### 5. Reproduce the gates locally before tagging

```bash
node scripts/check-skills-sync.mjs                       # expect exit 0
node scripts/check-native-sync.mjs --materialize-temp    # expect exit 0
npm run test:scripts                                     # ~8 min; the preflight gate
(cd mcp-server && npm run typecheck && npm test && npm run build)
scripts/release-preflight.sh --tag v7.1.0                # the composite gate
```

`release-preflight.sh` re-runs most of the above; running them first means a failure is reported once, in the place that explains it, instead of as a preflight abort.

### 6. Tag and push

```bash
git add -A && git commit -m "chore(release): v7.1.0 motion contract"
git push
scripts/release-preflight.sh --tag v7.1.0    # re-run on the release commit: TRAINING_BASE now resolves from HEAD^
git tag -a v7.1.0 -m "AIOS v7.1.0"
git push origin v7.1.0
```

Re-running the preflight on the release commit is not ceremony: `TRAINING_BASE` is computed from `HEAD^`, so the base changes on a commit that has already moved. Confirm it still names `v7.0.0`.

### 7. Confirm the release artifact

The `release` workflow creates the GitHub release. Check that its archive's `rex-harness` gitlink is `6563c827` and that nothing in the release notes cites a rex-harness version that does not exist.

## Rollback

Every step is additive and reversible before the tag push: `git revert` the release commit, `rm -rf` the new evidence directory, and drop the four new blog files. After the tag is pushed, rollback becomes a new patch release — do not force-move a published tag.

## Known red, not this release

Recorded so the next maintainer does not mistake them for regressions from this work:

- `aios standards check --rule fileLines` → 7 blocking, all pre-existing (`packages/aios-pi/lib/danger-targets.mjs`, `scripts/aios-init.mjs`, `scripts/lib/environment/doctor/aggregate.mjs`, `scripts/lib/execution/lifecycle/run/orchestrate.mjs`, `scripts/lib/tooling/cli/dispatch/dispatch.mjs`, `scripts/lib/tooling/cli/parse-args/top-level.mjs`, `scripts/tests/execution/aios-runtime/aios-harness.test.mjs`). Verified identical with this release's changes stashed.
- `node scripts/check-site-sync.mjs` → exit 1, 24 missing blog translations on `v6.1.0`–`v6.9.0` posts. Not wired to CI, so it does not gate.
- `node scripts/check-doc-citations.mjs` → exit 1, 335 invalid refs across 590 files. Same status on the baseline.
- `docs-site/changelog.md` is stale at `v6.3.0`. No gate reads it; updating it is separate work.

## Open decision

**Bump kind.** `versioning-by-impact` classifies a new contract plus a new gate as `minor`, which makes the release `7.1.0` and brings the four-locale release post with it. `7.0.1` would skip the posts but would label a new capability as a fix, and `llms-txt.test.mjs` would then require the index to say "maintenance release — changelog only" about a release that added a contract.

Everything above assumes `7.1.0`. If the answer is `7.0.1`, step 3 disappears, step 4 changes shape, and the plan shrinks by roughly the writing effort of four short posts.
