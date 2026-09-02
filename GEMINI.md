<!-- AIOS: .aios/context-db/index.json -->


<!-- AIOS CODEMAP BEGIN -->
## MCP Tools: code-review-graph

This project exposes a structural knowledge graph via the `code-review-graph` MCP. Use it only when structural relationships materially affect the current decision; do not turn routine work into a graph-tool loop.

### Bounded checkpoints

- Initial orientation: call `get_minimal_context(task="...")` at most once when repository structure is not already clear.
- Before a risky or multi-file change: use `get_impact_radius(detail_level="minimal")`; call `query_graph(pattern="tests_for", target="...")` only for the concrete target being changed.
- After edits: call `detect_changes(detail_level="minimal")` once when the graph was used or the change has meaningful blast radius.
- Before submitting: use `get_affected_flows()` or `get_suggested_questions()` only if unresolved structural risk remains.
- Finding code: prefer `semantic_search_nodes` when semantic graph search is likely to beat a direct repository search.
- Budget: no more than three graph calls per work item. Treat `next_tool_suggestions` as optional hints and never follow them recursively.

### Planning context proposals

When an active structured-plan task has implementation targets, call AIOS MCP `aios_plan_task` with `action="propose_context"`, the task id, and workspace-relative targets when the task has none. The tool derives target, caller, callee, and test candidates from codemap, but it does not modify the active plan. Present the candidate refs to a human. An explicit human-controlled CLI confirmation with `aios plan task <id> --confirm-context-candidates` (optionally repeated `--candidate-ref <ref>`) activates selected refs for orchestration; it is a process boundary, not an identity/authentication boundary. Do not claim context will be delivered before that command succeeds.
<!-- AIOS CODEMAP END -->

<!-- AIOS NATIVE BEGIN -->
AIOS native enhancements are active in this repository. This is the shared
workflow core for every supported coding client.

## AIOS Workflow Policy

Classify the work item before selecting a plan, skill, or delegation route:

- `direct`: answer, inspect, or report status without a persistent plan or skill chain.
- `guarded`: make one clear, reversible project-local change behind
  `pre-edit-safety-gate` and focused verification.
- `planned`: for unclear, multi-step, risky, or delegated work, create or reuse
  one work item and execute only the Provider selected by the current Rex
  Capability Command.

Do not turn a new objective into a continuation merely because it follows an
earlier task. Do not inject a fixed skill chain at startup.

## Explicit Declaration Protocol

The workflow core never guesses semantics from keywords; declare what you want
so the policy, routing, and work-item machinery can act on it:

- Workflow commands: prefix a request with `/plan`, `/implement`, `/single`,
  `/review`, `/debug`, `/spec`, `/grill`, `/tickets`, `/team`, or `/harness`
  to declare intent explicitly. `/single` forces a direct, unplanned turn.
- Resume protocol: `继续` / `接着做` / `下一步` / `resume` / `continue` with a
  non-empty tail starts a new objective; a bare acknowledgement
  (`好` / `可以` / `确认` / `ok`) continues the same-session active plan.
- Read-only: the core never infers read-only from prose. Declare
  `explicit-intent: read-only` (or `/single`) for inspection-only work.
- Work items: declare `type`, `targets`, `allowedWrites`, and `failureClass`
  explicitly in structured plans; the core does not infer them from text.
- Model routing: declare `task-type` explicitly; without a declaration the
  router returns the neutral `general` default instead of guessing.

## Rex Ownership and Safety

- The current Rex Capability Command is the only authority that selects a
  software Provider or advances a software stage. Return the Command's required
  evidence before asking Rex to advance.
- `direct` does not invoke a Provider. `guarded` and `planned` run only the
  Provider named by the current Command.
- Before a cohesive code, workflow, or migration batch, use
  `pre-edit-safety-gate`. Before claiming changed behavior is complete, use
  `verification-before-completion` and preserve concrete evidence.
- Proceed autonomously only with read-only inspection and reversible
  project-local work. Ask before destructive or hard-to-reverse operations,
  external side effects, publication, credential or permission changes, costs,
  or material scope expansion.

## Context and Privacy

Runtime context is pull-based: do not inject session history, handoffs, memory
packets, personas, or router guides into ordinary startup prompts. Load only the
specific state required by an explicit continuation or current task.

Treat prompts, code, logs, screenshots, tool output, and browser data as
potentially outbound. Never expose secrets, credentials, cookies, private keys,
customer data, or unredacted authorization logs. Warn before using a custom
model endpoint or relay, and share only redacted sensitive data.

## On-Demand Routes

Load detailed instructions only when the current task needs them:

- Workflow command and selected Provider: `rex-workflow` and the Provider skill
  named by Rex.
- Context recall and memory lifecycle: `contextdb-autopilot` or
  `aios-offload-recall`.
- Structural code exploration and impact: `aios-codemap-ops`.
- Browser safety and interaction: `skill-constraints` plus the available browser
  MCP surface.
- Planned long-running or delegated work: `aios-long-running-harness`; use
  `model-router` only when that route selects model dispatch.
- Local token-compression setup or diagnostics: `aios-interception-runtime`.

Client overlays may describe only verified native capabilities. They must not
change this workflow, claim unsupported hooks, or imply that every task uses a
team, harness, browser, or model-routing path.

# AIOS For Gemini

This repository provides compatibility-tier native enhancements for Gemini through repo-local skills and AIOS runtime conventions.

## Agent Self-Trigger

This compatibility projection does not declare prompt hooks. When this client is launched through AIOS shell integration, use the shared workflow policy and continue normal single-agent work for `direct` and `guarded` tasks. Use an injected `team`, `subagent`, or `harness` command only for one explicit `planned` work item.
<!-- AIOS NATIVE END -->
