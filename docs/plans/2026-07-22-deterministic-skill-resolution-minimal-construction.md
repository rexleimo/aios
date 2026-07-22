# Deterministic Skill Resolution: Minimal Construction Decision

## Current Boundary

The existing skill system already has the necessary ownership points:

- `scripts/lib/skills/source-tree.mjs` loads the canonical sync manifest and
  materializes per-client overlays.
- `scripts/lib/components/skills/catalog.mjs` selects catalog entries and
  records their canonical/generated source provenance.
- `scripts/lib/components/skills/doctor.mjs` is the existing diagnostics
  surface; it already reports non-discoverable roots, managed-install drift,
  and project-over-global overrides.

The gap is that duplicate install names can be selected in manifest order and
`findSyncEntryForCatalogEntry()` returns the first match. That is implicit
precedence rather than a deterministic, actionable resolution contract.

## Reuse Ladder

1. **Remove the need:** not applicable. Six-client synchronization needs a
   stable answer for same-name skills and a diagnostic when that answer would
   be ambiguous.
2. **Reuse existing repository structure:** applicable. Extend the catalog
   resolver and existing Skills Doctor; do not add a parallel registry or CLI.
3. **Use platform facilities:** applicable. Node's `Map`, stable array sort,
   `path`, and existing filesystem checks are sufficient.
4. **Add a dependency:** not applicable. No parser, package manager, or
   discovery dependency is needed.
5. **Use a local expression only:** insufficient. The same duplicate-name
   grouping must be shared by resolver, installation, and doctor paths.
6. **Smallest new construction:** add one pure catalog-analysis helper and
   consume it in the existing resolver and Skills Doctor.

## Selected Minimal Option

Add a pure catalog-analysis helper in `scripts/lib/components/skills/catalog.mjs`
that produces a stable, provenance-bearing resolution order and sorted conflict
findings. Its contract is:

1. A canonical manifest entry is the source of truth; a client overlay only
   materializes that entry for the target client.
2. For a given client and scope, a skill name maps to exactly one canonical
   source. Multiple distinct sources for the same target name are a conflict,
   not a first-match winner.
3. The existing project-over-global rule remains explicit in diagnostics;
   within one scope, conflicts fail closed.
4. Ordering uses stable normalized keys, so manifest enumeration order cannot
   change a valid resolution result.
5. Skills Doctor reports each conflict with client, scope, skill name, and all
   canonical source paths. Install/update paths reject the same ambiguity.

This keeps native client discovery untouched, preserves the canonical manifest
and existing overlay materialization, and exposes no new always-loaded client
instructions or command surface.

## Focused Verification

- Unit-test stable ordering and conflict grouping with permuted catalog input.
- Test that duplicate names fail the resolver/install path and are rendered by
  Skills Doctor with actionable provenance.
- Test that independent client entries and a project-over-global installation
  remain valid and preserve their existing diagnostics.
- Run the focused Skills Doctor/component tests and a six-client discovery
  smoke through the existing client registry.
