# GREEN implementation diff — Console i18n full coverage

- workItemKey: `console-i18n-full`
- activationId: `2a52ef72-c929-4614-bbf2-d5a978a19242`
- stage: `green`

## Change

Only the three catalogs changed for this minimal GREEN:

```
apps/shell/ui/src/i18n/catalogs/zh-CN.json  +3 keys
apps/shell/ui/src/i18n/catalogs/en.json     +3 keys
apps/shell/ui/src/i18n/catalogs/ja.json     +3 keys
apps/shell/ui/tests/i18n-full-coverage.test.mjs  (new, RED test retained)
```

Keys added: `gateway.workspace.title`, `routing.config.title`,
`resources.skills.title` — each with zh-CN / en / ja values. Existing 83 keys
and all runtime seams (`runtime.ts`, `provider.tsx`, `server.ts`) untouched.

No assertion was weakened, skipped or rewritten. The RED test remains byte-identical.

## Evidence

`receipt:68c8d715-30d8-4e14-8602-5feafe75ba4b` — exit 0,
`node --test apps/shell/ui/tests/i18n-full-coverage.test.mjs`.

## Boundary

This GREEN proves only the catalog seam for three representative domain keys.
Full externalization of secondary panels remains for the implementation stage;
it must not be claimed complete from this diff alone.
