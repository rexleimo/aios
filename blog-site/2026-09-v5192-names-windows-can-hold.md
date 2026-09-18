---
title: "v5.19.2: Names Windows Can Hold"
description: "A candidate id is legitimately 'session:<id>'. Used as a file name on NTFS it becomes an alternate data stream: the write appears to succeed, readdir never lists it, and a promotion is lost while the importer still reports zero errors."
date: 2026-09-18
tags: ["AIOS", "evolution", "windows", "filesystem", "testing", "release", "v5.19.2"]
---

# v5.19.2: Names Windows Can Hold

An entity id and a file name are different things. Most of the time the difference is invisible, so the two get used interchangeably, and then one platform quietly disagrees.

In this repository a candidate id is `session:<sessionId>`. That shape is asserted by the test suite, it is part of the data model, and it is not going to change. Three places used it directly as a file name.

## The colon that is not a character

`session:eval-001.json` is a perfectly ordinary file name on POSIX. On NTFS it is not a file name at all: everything after the colon is an **alternate data stream** of a file called `session`.

That produces a failure mode worse than a crash. On Windows:

```
writeFile('...promotions/session:session-import-0.json')  -> succeeds
readdir('...promotions/')                                 -> []
```

The write reports success. The directory listing does not contain it. `readPromotion` finds nothing, `listPromotions` returns an empty array, and the importer that just "wrote" three promotions reports `errors.length === 0`.

The record was never stored, and nothing said so.

## Three writers, three outcomes

The same id reached the filesystem three different ways:

**Verdicts** named the file from the raw id and wrote it through an atomic rename. The temp file was created as a stream, then the rename onto the final stream path failed with `EINVAL: invalid argument, rename '...\.session:session-eval-001.json...'`. Loud, at least — but only on Windows.

**Promotions** were worse. `promotionPath()` sanitizes the id before building the path, and its allow-list was `[^A-Za-z0-9._:-]` — it keeps the colon. So the store wrote a stream, `readdir` never saw it, and the promotion vanished.

**The integration bridge** open-coded a second writer:

```js
const target = path.join(rootDir, '.aios', 'memo', 'evolution', 'promotions', `${promotionId}.json`);
await fs.writeFile(target, JSON.stringify(promotion, null, 2), 'utf8');
```

That path bypassed `promotionPath()` entirely — two writers for one artifact, agreeing only by luck.

## The fix

Derived names are sanitized; the id is data and keeps its colon.

```js
// scripts/lib/fs/file-segment.mjs
const ILLEGAL_FILE_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
export function sanitizeFileSegment(segment) {
  return String(segment ?? '').replace(ILLEGAL_FILE_NAME_CHARS, '-');
}
```

The character class is not invented here: the memo storage layer already normalized exactly this set for its own paths. Those helpers also lowercase and collapse whitespace, so they are not reusable for an opaque id — this one only removes what a file name cannot hold.

Three consequences followed. `writeVerdict`/`readVerdict` sanitize the name they derive, so they still agree with each other. `promotionPath()` dropped the colon from its allow-list and passes the result through the sanitizer as a backstop. `writePromotion` is now exported, and the integration bridge calls it instead of writing its own path.

One more thing sat behind the bug: `atomicWriteText` had repeated the temp-name formula without the cleanup that the other atomic writer performs, so a failed rename left the stray stream on disk. It now delegates to `writeFileAtomic`, and there is one implementation instead of two.

## The failure that only exists in a temporary directory

Adding a file to `scripts/lib/fs/` broke three release-preflight tests — and the command they run exits `0` when you run it by hand in the working tree. The release fixture copies `scripts/lib/fs/atomic-write.mjs` as an explicit single file, so the moment that module imported its new sibling, every fixture run died inside a temporary root with `agent export regeneration failed`.

The first instinct was "unrelated to my change". That is a guess, so it was measured instead: check the changed files out at the previous commit, run the same test, and it passes; restore them, and it fails. The guess was wrong. The fixture now copies the directory, the way `scripts/lib/clients` was already copied.

## Honest status: fixed before wired

`evolution-integration.test.mjs` has gone from five failures to exit code 0. It is still not reachable from any test entry point, which means the fix is not yet protected by CI — it is green because nothing runs it.

That is the next step, and it is a separate one: 82 test files in `scripts/tests/` are unreachable from every entry point, and wiring them into a suite before they pass would only turn the gate red. Fix first, then wire, then shrink the baseline.

## Verification

- `node --test scripts/tests/evolution-integration.test.mjs` — five failures to exit 0
- `scripts/tests/artifact-filename-windows-safety.test.mjs` — new, wired, five cases pinning the invariant on POSIX as well, where the failure cannot reproduce
- `npm run test:scripts` — 1293 tests, 1285 pass, 0 fail
