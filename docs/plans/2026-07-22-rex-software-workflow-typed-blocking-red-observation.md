# Software Workflow Typed Blocking RED Observation

`receipt:d079aad7-edea-4b15-8e0c-e1fe2bbf3156` records a public TDD RED
advancement with `command:claimed-red` instead of a receipt reference. The
suite exits 1 because the evidence validator throws `requires at least one
receipt`, so callers receive no workflow result to inspect.

The workflow and selected command are valid. The behavior gap is only at the
public validation boundary: this anticipated evidence rejection should be a
typed fail-closed result rather than exception text.
