# GAIA A/B Hermes Adapter Implementation

## Implemented GREEN Slice

The shared factory now accepts only `hermes/deepseek-v4-pro`, requires a
non-empty local usage path, and returns Hermes `--oneshot` argv containing the
sanitized common task envelope. It preserves normal rules by omitting all
customization-bypass flags.

## Scope Boundary

No Hermes process is spawned and no usage report is read in this slice. Process
execution, response parsing, artifact writes, browser readiness, and paid
evaluation remain separate behavior.
