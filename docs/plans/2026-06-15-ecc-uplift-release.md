# ECC Uplift Release Plan

**Goal:** Ship the ECC uplift fixes, remove tracked Crush config files, update release docs/blog/site output, then merge the feature branch into `main` and delete it.

**Scope:**
- Harden skill health observation status writes so producer bugs fail fast.
- Let `aios skill ... --help` and `aios session ... --help` show help before positional validation.
- Remove `.crush.json` and `crush.json` from repository tracking and ignore local copies.
- Publish a patch release note in changelog, docs changelogs, blog indexes, and generated website output.

**Implementation steps:**
1. Confirm branch status and existing review fixes.
2. Apply `2.0.1 -> 2.0.2` patch version bump and changelog entry.
3. Add docs-site localized changelog entries for v2.0.2.
4. Add blog posts/index/nav entries for v2.0.2.
5. Rebuild docs/blog generated `site/` output with MkDocs.
6. Run script tests, MCP server typecheck/tests/build, site sync, MkDocs strict builds, and CRG checks.
7. Commit the feature branch, merge into `main`, delete the feature branch, and push if remote is available.

**Verification:**
- `node --test scripts/tests/ecc-uplift.test.mjs scripts/tests/aios-cli.test.mjs`
- `npm run test:scripts`
- `cd mcp-server && npm run typecheck && npm run test && npm run build`
- `npm run check:site-sync`
- `.venv-docs/bin/mkdocs build -f mkdocs.yml --strict`
- `.venv-docs/bin/mkdocs build -f mkdocs.blog.yml --strict`
