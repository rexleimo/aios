# Localized Rex Migration Minimal Construction Decision

## Reuse ladder

1. **Remove the requirement:** not applicable. Keeping the historical
   `/superpowers/` route is an explicit backward-compatible public contract.
2. **Reuse repository artifacts:** applicable. `docs-site/superpowers.md`
   already supplies the complete ownership-safe migration structure; the
   localized public changelogs supply approved terminology for Rex, conflict,
   client names, and explicit adoption.
3. **Language/platform facility:** no facility can safely localize Markdown
   content and MkDocs navigation text at build time without adding a
   translation dependency or serving a stale fallback.
4. **Existing dependency:** not applicable. MkDocs i18n consumes the existing
   `nav_translations` mapping but does not replace the localized page body.
5. **Local expression:** insufficient. A navigation-only rename would still
   route users to the retired workflow catalog.
6. **Minimal correct construction:** replace the three existing localized
   `superpowers.md` bodies with concise translations of the existing English
   Rex Workflow Migration guide, change the three corresponding values in
   `mkdocs.yml`, and add assertions to the existing public release-documentation
   test. No new runtime, skill, page route, or dependency is required.

## Rejected alternatives

- Removing the localized files risks a language fallback and fails the stated
  localized public-documentation requirement.
- Introducing a translation generator would add a new build/runtime boundary
  for a one-time short migration guide.
- Leaving the old catalog with a warning still advertises a second workflow
  and fails the Rex-only contract.
