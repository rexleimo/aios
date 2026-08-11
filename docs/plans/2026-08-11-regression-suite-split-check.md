# Regression suite split check

- `unit` remains isolated and runs with concurrency 4.
- `controlled` is an explicit serial manifest for shared-state candidates.
- `regression` keeps legacy 91-file coverage through explicit manifest.
- Runner reports suite name, file count, concurrency, and elapsed milliseconds.
- Unit boundary passes in receipt `receipt:e11a6410-23a5-46f6-8efa-fb196202afdb`.
- Controlled suite currently contains 37 files and exceeded 300 seconds; this
  is evidence that controlled candidates need finer partitioning before any
  concurrency increase.
