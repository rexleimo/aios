# Workflow Authoring and Handoffs

## Preconditions and output

Input: an explicit `workflow_type: one-shot|recurring`, user objective, accepted
requirements/spec refs, the current work item/Command, and any selected upstream
artifacts. Declare each artifact's role explicitly as `workflow-definition` or
`knowledge-source`; do not guess its role from filenames or user keywords.

Output: the existing spec/work item contains the operating contract below, and
the host handoff contains its revision/ref plus this run's evidence, recovery
checkpoint, pending decision brief, and improvement candidates. Unknowns are
recorded as assumptions or gaps; identifiers refer to real artifacts only.

## Fit into existing workflows

| User entry or artifact | Contribution | Owner and handoff |
|---|---|---|
| `/grill` or a Rex requirements Command | Resolve missing acceptance and workflow decisions | The selected requirements Provider records decisions; the host attaches the operating contract to that same spec/work item |
| A loop-me `workflows/*.md` specification | Existing trigger, steps, checkpoints, output briefs | Preserve its source/ref and map its fields into the accepted spec; add only missing AIOS execution controls |
| `/harness` / `aios-harness` | Execute and recover a planned resumable objective | Existing runtime and journal; Rex chooses software Providers and accepts Evidence |
| chief-of-staff notes or wiki | Historical findings and goal context | Query only relevant pages; preserve dates, repo/commit, and source refs in Memo; a wiki page alone is not completion evidence |
| A milestone's environment-improvement candidates | Propose improvements that would help the next run | Return candidates with evidence; `/retro`, learn-eval, and existing skill governance handle later review/application |

These are handoff boundaries, not a mandatory sequence of skill invocations.
Simple tasks keep the direct/guarded routes. The harness does not choose a
requirements Provider or invoke `/retro` automatically after each task.

## Operating contract

Record these fields in the existing accepted spec, using its established format:

- `workflow_type`: explicit one-shot or recurring; separate from model routing's `task-type`.
- `objective` and `non-goals`: result, allowed scope, and exclusions.
- `trigger` and `inputs`: manual/event/schedule requirement, source, and baseline.
- `artifacts` and `acceptance`: expected outputs and task-appropriate receipts,
  artifact checks, or explicit human judgments required per run.
- `failure-policy`: failure classes, changed-hypothesis retry limits, wait/stop rules.
- `budget`: supported max iterations, per-turn timeout, quota/cadence where relevant,
  and any limits that remain an operator responsibility.
- `human-decisions`: the decision, required evidence/options, and authorized work
  that can be prepared before the decision.

A recurring definition also records its stable ref/revision, processed-input
identity or baseline, and duplicate policy. Each run records the bound revision,
its own input/baseline, results, and evidence. An unchanged-input check may return
an evidenced no-op; never reuse last run's success as this run's verification.
Revising the definition is explicit and cannot silently relax active acceptance.

Reuse prior accepted decisions; research first and ask only unresolved choices
that change implementation or acceptance. The requirements Provider checks decision
dependencies, normal/failure walkthroughs and feasibility evidence before ready;
its one-decision-at-a-time interaction and question budget do not close critical
unknowns. A blocked requirements record must not be treated as an executable spec.
Do not require AI, a schedule, or human approval at every step unless needed.

## Translate upstream artifacts

- Keep a supplied loop-me spec as a source reference. Its `Checkpoint` means a
  **human decision point**; an AIOS **recovery checkpoint** persists state for
  resumption. Record both separately.
- Translate its `Brief` into `decision_brief`: question, evidence refs, options,
  recommendation, and the exact pending decision. Prepare all authorized,
  useful work before asking; do not defer investigation until after approval.
- Use chief-of-staff's tactical/strategic distinction: deliver the current result,
  then propose evidence-backed environment improvements at a useful milestone.
  Applying candidates requires the existing review/application path; it is not
  part of ordinary completion and does not enlarge this run's scope.
- Preserve historical knowledge with dates, repository/commit, and evidence refs.
  Use Memo supersession when a verified conclusion replaces an old one. Keep
  existing wiki links as sources rather than creating a second knowledge store.
- Delegate only independent domains under the existing planned/team dispatch
  policy. Worker briefs are self-contained with objective, owned paths,
  acceptance, source pointers, and a structured result. A skill cannot provide
  background execution when the selected client lacks it.

## Runtime truth

`--unattended` controls pacing for an existing run. It neither registers a cron
schedule nor authorizes automatic resume past an operator gate. Map enforceable
controls to real runtime options; report unsupported triggers/limits as gaps.
Writing this contract does not add runtime schema validation, hash binding, a
cross-run deduplication engine, or a new budget gate. Those require separate
implementation and verification before they can be advertised as guarantees.

## References

Design sources (Beta at v1.3.2):
- https://github.com/mattpocock/skills/blob/v1.3.2/skills/in-progress/loop-me/SKILL.md
- https://github.com/mattpocock/skills/blob/v1.3.2/skills/in-progress/chief-of-staff/SKILL.md
