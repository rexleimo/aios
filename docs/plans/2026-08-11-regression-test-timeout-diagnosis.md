# Regression test timeout diagnosis

## Facts

- `node --test scripts/tests/default-mode.test.mjs` passes 14 tests in about
  95 ms.
- The prior command wrapper using `node.exe` did not yield a receipt; rerunning
  the same test through `node` produced receipt
  `receipt:7e185fa9-484e-4edc-9aeb-6bdc8c53b65d` with exit code 0.
- Root `package.json` defines `test:scripts` with
  `node --test --test-concurrency=1` and a large, flat list of test files.
- Full `test:scripts` did not complete within the 300-second observation
  window. This does not show a per-file hang.

## Root cause

The slow regression feedback is caused by intentionally serial execution of a
large, flat test suite, not by `default-mode.test.mjs`. The prior focused-test
timeout was an invalid observation caused by the `node.exe` receipt invocation.

## Regression check

Use `node --test scripts/tests/default-mode.test.mjs` as a fast receipt-backed
sanity check. Before changing concurrency, classify suite files by shared
resources and run only proven isolated files with `--test-concurrency=4`.
