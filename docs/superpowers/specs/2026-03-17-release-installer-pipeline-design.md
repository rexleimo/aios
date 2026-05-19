# Release Installer Pipeline Design

## Summary

Make GitHub Releases the single stable distribution channel for `Harness CLI` installers and packaged artifacts, so the documented one-liner install URLs under `releases/latest/download/...` are always valid after an official release.

## Problem

The repository currently documents stable install commands like:

```bash
curl -fsSL https://github.com/rexleimo/rex-cli/releases/latest/download/aios-install.sh | bash
```

But the GitHub repository has no published Releases right now. That creates a hard mismatch:

- docs promise a stable installer URL,
- the release asset URL returns `404`,
- users fall back to `git clone`,
- version bumps in-repo do not automatically produce installable release assets.

The project already contains most of the building blocks:

- a version file at `VERSION`,
- a changelog at `CHANGELOG.md`,
- packaging scripts for release artifacts,
- a GitHub Actions workflow for release packaging and publishing.

What is missing is the enforced operational path that turns a versioned repository state into an actual published GitHub Release with uploaded assets.

## Goals

1. Make `releases/latest/download/aios-install.sh` and `aios-install.ps1` valid for official releases.
2. Tie official installation behavior to published semver releases, not arbitrary `main` branch state.
3. Keep `VERSION`, `CHANGELOG.md`, git tags, and GitHub Releases aligned.
4. Preserve a separate development install path when users intentionally want `main` or nightly behavior.
5. Make the release flow easy enough that maintainers actually use it consistently.

## Non-Goals

1. Redesign the installer scripts themselves unless release publishing requires small compatibility fixes.
2. Replace GitHub Releases with a package manager distribution channel.
3. Implement auto-publish on every merge to `main`.
4. Support multiple release channels beyond stable plus an optional clearly-labeled development fallback.

## Current State

### Existing pieces

- `VERSION` stores the current repo version.
- `CHANGELOG.md` records release history.
- `scripts/release-version.sh` bumps `VERSION` and inserts a release section in `CHANGELOG.md`.
- `scripts/package-release.sh` and `scripts/package-release.ps1` build release assets.
- `.github/workflows/release.yml` is intended to publish release assets.
- `README.md`, `README-zh.md`, and docs-site pages already point users to GitHub Release installer URLs.

### Current gap

There is no published GitHub Release, so the documented install URLs do not resolve. In practice, the release pipeline is incomplete as an operator workflow even if parts of the implementation already exist.

## Options Considered

### Option 1: Stable installs from GitHub Releases only

Use semver tags and GitHub Releases as the only documented stable install source.

Pros:

- matches user expectations for a CLI,
- `latest` asset URLs become stable and predictable,
- versioned assets are auditable and reproducible,
- docs and binaries align naturally.

Cons:

- requires maintainers to follow a real release process,
- first release setup takes a little extra work.

### Option 2: Install directly from `main`

Point one-liner install docs at raw files or branch artifacts from `main`.

Pros:

- fast to enable,
- no release ceremony required.

Cons:

- not versioned,
- install behavior changes whenever `main` changes,
- not appropriate as the default stable distribution story.

### Option 3: Dual path, with stable release plus explicit development install

Use GitHub Releases for stable docs, and provide a separate clearly-labeled `main` install path for advanced or internal users.

Pros:

- best operational fit,
- stable installs remain stable,
- maintainers still have a low-friction development path.

Cons:

- docs need careful wording so users do not confuse the two.

## Recommended Approach

Adopt Option 3.

GitHub Releases become the canonical stable installation channel. The repository keeps a separate development install path for users who intentionally want unreleased `main` behavior, but that path is not the primary onboarding flow.

## Release Architecture

### Version source of truth

- `VERSION` remains the canonical semantic version source.
- `CHANGELOG.md` must contain a matching release entry.
- release tags use the format `vX.Y.Z`.

### Official release trigger

The GitHub release workflow should publish only when a semver tag is pushed, for example:

- `v0.17.0`
- `v0.17.1`

The workflow should package artifacts from the tagged commit, not from moving branch state.

Manual release publication from arbitrary commits should not remain an escape hatch. If `workflow_dispatch` is kept for maintainers, it must require an explicit semver tag input and resolve the workflow checkout to that exact tag before packaging and publishing. A simpler first pass is to remove manual dispatch entirely and allow official release publication only from pushed semver tags.

### Release assets

Each official GitHub Release must upload:

- `aios-install.sh`
- `aios-install.ps1`
- `rex-cli.tar.gz`
- `rex-cli.zip`

These assets are the contract behind the documented stable install commands.

### Stable installer URLs

Stable docs continue to use:

```bash
curl -fsSL https://github.com/rexleimo/rex-cli/releases/latest/download/aios-install.sh | bash
```

and the PowerShell equivalent.

This is only correct if there is always at least one published release and each release uploads the expected files.

### Development install path

Docs should also include a clearly labeled development path for users who want unreleased code.

For the first pass, that path should be exactly one supported option:

- `git clone` from `main`

Do not document a raw `main` installer URL in the same pass. That would blur the line between stable release installation and development installation before the stable release path is proven. The development path must be described as unsupported for stable reproducibility and intended only for users who explicitly want unreleased behavior.

## Maintainer Workflow

The maintainer flow should become:

1. Finish implementation on `main`.
2. Run verification.
3. Bump version and changelog with `scripts/release-version.sh <patch|minor|major> "...summary..."`.
4. Commit the version bump.
5. Create tag `vX.Y.Z` on that exact version-bump commit, not on an earlier or later commit.
6. Push branch and tag.
7. GitHub Actions builds assets and creates the GitHub Release.
8. Verify the uploaded assets exist and the `latest/download/...` URLs resolve.

This process should be captured in a repo-local helper or documented runbook so it is repeatable.

## Required Repository Changes

### 1. Release workflow validation

Confirm and, if needed, fix `.github/workflows/release.yml` so that:

- it runs on version tags,
- it does not publish a stable release from arbitrary branch state,
- it packages the expected installer and archive assets,
- it creates a GitHub Release from that tag,
- it uploads all required files.

If `workflow_dispatch` remains, it must be constrained to a supplied semver tag and fail when the workflow checkout is not exactly that tag.

### 2. Release helper

Add a thin release helper script or documented command flow that wraps:

- version bump,
- consistency checks between `VERSION`, tag name, and `CHANGELOG.md`,
- tag creation,
- push commands.

This reduces human drift between `VERSION`, changelog, and release tags.

### 3. Documentation split

Update user-facing docs so they clearly distinguish:

- stable install from GitHub Releases,
- development install from `main` / `git clone`.

### 4. Release smoke verification

Add a verification step to the release workflow or release checklist that checks:

- packaged files exist before upload,
- release asset names match the documented URLs,
- the published release contains the required assets.

If practical, add a post-release HTTP check against the expected asset URLs.

## Error Handling

### Missing release assets

If the workflow packages archives but omits installer scripts, the release should fail rather than publish a partial stable release.

### Version/tag mismatch

If the pushed tag does not match `VERSION`, fail the release workflow early.

The workflow should also fail if:

- the tag does not point to the committed version-bump commit,
- `CHANGELOG.md` does not contain the matching release heading,
- the tag name, `VERSION`, and release title/version string diverge.

### Changelog drift

If maintainers forget the changelog entry, either:

- fail the release workflow, or
- formally decide that `scripts/release-version.sh` is the mandatory bump path and rely on that invariant.

The preferred direction is to fail early on mismatch.

## Release Consistency Rules

An official stable release is valid only if all of these match:

1. git tag name: `vX.Y.Z`
2. `VERSION`: `X.Y.Z`
3. `CHANGELOG.md` heading: `## [X.Y.Z] - YYYY-MM-DD`
4. GitHub Release tag: `vX.Y.Z`
5. packaged installer/archive payload version metadata resolves to `X.Y.Z`

If any one of these differs, the workflow must fail before publishing assets.

## Testing Strategy

### Automated

1. Validate release packaging scripts produce all required files locally.
2. Add focused tests for any release helper logic that parses version/tag data.
3. If the workflow is refactored, verify trigger and asset names through CI-safe assertions where possible.
4. Add a release preflight check that verifies tag name, `VERSION`, and changelog entry alignment before asset upload starts.

### Manual

1. Create a real release tag in GitHub.
2. Confirm the release page exists.
3. Confirm these version-specific URLs for the new tag download successfully:
   - `.../releases/download/vX.Y.Z/aios-install.sh`
   - `.../releases/download/vX.Y.Z/aios-install.ps1`
   - `.../releases/download/vX.Y.Z/rex-cli.tar.gz`
   - `.../releases/download/vX.Y.Z/rex-cli.zip`
4. Confirm these `latest` URLs download successfully:
   - `.../releases/latest/download/aios-install.sh`
   - `.../releases/latest/download/aios-install.ps1`
   - `.../releases/latest/download/rex-cli.tar.gz`
   - `.../releases/latest/download/rex-cli.zip`
5. Run the stable one-liner install on at least one Unix shell environment.
6. Verify the installed CLI reports `X.Y.Z`, so the published installer is not silently serving the wrong payload.

## Success Criteria

The work is complete when:

1. At least one official GitHub Release exists.
2. The documented stable installer URL no longer returns `404`.
3. The stable install docs work without requiring `git clone`.
4. Maintainers have a repeatable version-to-release workflow.
5. Stable and development installation paths are clearly separated in docs.

## Risks

### Release workflow exists but is not actually used

This is the current failure mode. The fix is not only code; it must produce an explicit maintainer release path and verify the first real release.

### Docs get ahead of release reality again

The stable installer docs should only advertise the release URL once the release pipeline has been exercised successfully.

### Development path drifts into quasi-stable support

The repository should explicitly treat `git clone main` as the only supported development install path until the stable release pipeline is proven. Do not advertise a `main` raw installer URL in primary docs during this phase.

### Overcomplicating the first pass

The first delivery should focus on GitHub Releases as the stable channel and one successful published release. Broader package-manager distribution can wait.
