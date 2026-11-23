# RED observation — Console i18n full coverage

- workItemKey: `console-i18n-full`
- activationId: `2a52ef72-c929-4614-bbf2-d5a978a19242`
- stage: `red`

## Command

```
node --test apps/shell/ui/tests/i18n-full-coverage.test.mjs
```

cwd `E:\coding\harness-cli`; evidence receipt `receipt:622c5471-deb0-4b8a-b7b6-3c9663c5cd57` (exit 1).

## Precondition

Clean worktree at HEAD `2b4febdf` plus the new focused test file. The accepted
83-key catalogs cover shell/navigation/home only. The three domain keys asserted
below do not exist in any locale catalog.

## Expected user-observable result

`gateway.workspace.title`, `routing.config.title` and `resources.skills.title`
resolve to their zh-CN / en / ja strings so that switching locale translates the
secondary panels.

## Observed failure

`tests 1 / pass 0 / fail 1`. First assertion:

```
AssertionError [ERR_ASSERTION]: zh-CN:gateway.workspace.title
+ actual - expected
+ undefined
- '模型网关'
```

## Failure reason

Secondary-panel copy was never externalized into the catalogs. `translate()`
therefore returns the raw key (or undefined via the catalog seam), which is the
exact user-visible symptom reported: untranslated copy after switching locale.
This is a legitimate behavior-level RED, not an infrastructure/fixture failure.
