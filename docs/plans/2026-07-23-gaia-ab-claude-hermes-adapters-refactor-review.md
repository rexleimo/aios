# GAIA A/B Claude and Hermes Adapters Refactor Review

No refactor was needed: the Claude branch shares the single task-envelope
builder with Codex and leaves policy enforcement at the public factory
boundary. The added test asserts process-visible argv/input and retains the
expected-answer sentinel. `receipt:575aedef-22e7-48d8-8d44-509b4d58a17c`
passes without a child client process.
