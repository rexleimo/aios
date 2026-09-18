# Regression throughput: parallel run evidence and follow-ups

Date: 2026-09-18 · Work item: raise `npm run test:regression` feedback speed
Related ticket (open since 2026-08-11, never executed):
`docs/plans/2026-08-11-regression-test-throughput-delivery-ticket.json`

中文结论：回归从 10.5 分钟降到 7.5 分钟（本机）/ 1.5 分钟（干净检出）。慢的根因不是文件数量，而是
`scripts/tests/aios-orchestrator.test.mjs` 里 15 个用例各等 ~46 秒；同一 commit 在干净 worktree 只要 3.7 秒，
说明真实检出里还有一份 ~43 秒/用例的本地状态开销没定位。两条后续项已列为可开工的工作项。

## 1. Inventory (ticket step `work-test-inventory`)

Cost, measured on the Windows dev box, `concurrency: 1` baseline:

| fact | value |
| --- | --- |
| suite wall time | 631.6 s (105 files, 1181 tests, 1173 pass / 8 skip / 0 fail) |
| tests slower than 5 s | 15 tests, **437.3 s combined = 69 % of the whole suite** |
| where they live | one file: `scripts/tests/aios-orchestrator.test.mjs` |
| slowest single test | 51.7 s (`dispatch runtime registry accepts a valid codex handoff that arrives before process exit`) |
| what they do | drive `createDispatchRuntimeRegistry` + `resolveDispatchRuntime({ runtimeId: 'subagent-runtime', executionMode: 'live' })` against a fake `codex` binary injected first on `PATH` (`createFakeCodexCommand`) |

Isolation classification (what may not run in parallel):

| shared-state class | finding |
| --- | --- |
| listening sockets / fixed ports | none — `createServer` and `listen(` appear in 0 regression test files |
| real `$HOME` writes | none — `os.homedir()` appears in 0 files; CLI-spawning tests override `HOME`/`AGENTS_HOME` in the spawn env |
| git operations | 12 files call `git`, every write op (`init`/`add`/`commit`) runs with `cwd` inside an `mkdtemp` fixture → repo index untouched |
| fixed temp paths | `aios-home`, `aios-repo`, `opencode-home` (only `aios-init.test.mjs`), `aios-browser-local`, `missing-aios-rc` (only `aios-components.test.mjs`) — each literal is used by exactly one file, and `node --test` parallelizes whole files, so no cross-file collision |
| unique temp paths | the rest use `mkdtemp` prefixes (`workspace-test-`, `aios-rl-mixed-`, `aios-rex-surface-`, …) → collision-free by construction |

Conclusion: no cross-file shared-state pair forbids whole-file parallelism, which is why a blanket
concurrency change was tried first instead of splitting suites.

## 2. Suite boundaries (`work-suite-boundaries`) — decision: not needed yet

The 2026-08-11 ticket anticipated "unsafe tests stay controlled" by grouping. The inventory above
found no unsafe *cross-file* interaction, so splitting the regression suite into a serial group plus a
parallel group would add a maintenance surface without removing a real hazard. Coverage and all
assertions are unchanged in this work item.

## 3. Four-way pool (`work-four-way-pool`) — shipped

`scripts/test-suites.json` → `regression.concurrency: 1 → 4`.

Experiment hygiene: the parallel samples were first taken in a **detached `git worktree` at HEAD**
with `node_modules`, `mcp-server/node_modules` and `rex-harness/src` junctioned in, so that a
suspected race could never pollute a working tree that another session was editing. Concurrency is a
single manifest value read by `scripts/lib/test-suite-runner.mjs` →
`node --test --test-concurrency=N`.

| run | commit state | files | tests | result | wall |
| --- | --- | --- | --- | --- | --- |
| baseline | working tree, `concurrency: 1` | 105 | 1181 | 1173 pass / 8 skip / 0 fail | 631.6 s |
| worktree c=4 #1 | HEAD (pre-integrations) | 104 | 1162 | 1154 pass / 8 skip / 0 fail | 99.8 s |
| worktree c=4 #2 | HEAD | 104 | 1162 | 0 fail | 88.9 s |
| worktree c=8 | HEAD | 104 | 1162 | 0 fail | 91.0 s |
| real checkout c=4 #1 | `29f03a20` | 105 | 1181 | 1173 pass / 8 skip / 0 fail | 447.6 s |
| real checkout c=4 #2 | `29f03a20` | 105 | 1181 | 1173 pass / 8 skip / 0 fail | 446.3 s |
| real checkout c=4 #3 | `29f03a20` | 105 | 1181 | 1173 pass / 8 skip / 0 fail | 441.7 s |

c=8 buys nothing over c=4 (91.0 s vs 88.9 s on 12 logical CPUs) — the constraint had already moved
to the process-spawn floor, so 4 is kept: enough headroom on smaller machines, no benefit beyond it.

## 4. The remaining floor is one file

Parallelism cannot beat the longest single file. In the real checkout `aios-orchestrator.test.mjs`
still runs its slow tests back-to-back inside one process, which is why 4-way concurrency lands at
~450 s there while a fresh checkout finishes in ~90 s. To get the dev-box gate below that, either
that file is split (mechanical, coverage-preserving: the codex-dispatch group becomes its own file)
or the per-test wait is removed. §6 F1 says the wait is *not intrinsic*.

## 5. Follow-ups (each independently startable)

**F1 — ~43 s of local-state cost per dispatch test, real checkout only.**
Same test, same machine, same commit `29f03a20`:

| checkout | `dispatch runtime registry retries codex execution when output schema is rejected by backend` |
| --- | --- |
| fresh worktree | 3.7 s (3.9 s on a repeat) |
| `E:/coding/harness-cli` | 46.9 s |

So the regression is introduced by nothing in the committed code: something present only in the real
checkout adds ~43 s to every dispatch test (×15 tests ≈ 10 min of serial time). Candidates: the
523 MB gitignored `.aios/` state root, or client resolution that finds a locally installed
`codex`/shim instead of the fake binary the test put first on `PATH`. No `4xxxx`-ms timeout constant
exists in `scripts/lib`, so it is a wait on I/O or a child process, not a coded sleep.
Next step: instrument the child spawn (log resolved command + argv + exit reason) for one of these
tests in the real checkout.

**F2 — split the codex-dispatch group out of `aios-orchestrator.test.mjs`.**
Unlocks the rest of the parallel gain on dev machines until F1 is fixed.

**F3 — keep `pretest:scripts` in mind.** `npm run test:scripts` still chains the gaia/workflow-policy/
rex suites before `test:regression`; the numbers here are `test:regression` alone.

## 6. Verdict

`regression.concurrency = 4` is kept on the evidence that it is green across six full-suite samples
(three in a fresh worktree -- two at c=4, one at c=8 -- and three in the real dev checkout at c=4,
441.7-447.6 s spread) and strictly faster. 结论：并发开关可以安全
落地，但它只是把干净检出的 1.5 分钟搬过来；开发机真正的 7.5 分钟卡在 F1。
