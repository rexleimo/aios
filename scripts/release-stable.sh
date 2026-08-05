#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if command -v cygpath >/dev/null 2>&1; then
  ROOT_DIR="$(cygpath -w "$ROOT_DIR")"
fi
VERSION_FILE="$ROOT_DIR/VERSION"
CHANGELOG_FILE="$ROOT_DIR/CHANGELOG.md"

usage() {
  cat <<'EOF'
Usage:
  scripts/release-stable.sh [--dry-run] [--allow-dirty]

Workflow:
  1. Verify clean git state
  2. Read VERSION
  3. Validate CHANGELOG entry exists
  4. Print or run release commands for tag vX.Y.Z
EOF
}

DRY_RUN="false"
ALLOW_DIRTY="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$ALLOW_DIRTY" == "true" && "$DRY_RUN" != "true" ]]; then
  echo "--allow-dirty may only be used with --dry-run" >&2
  exit 1
fi

VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
TAG="v$VERSION"

if [[ "$ALLOW_DIRTY" != "true" && -n "$(git -C "$ROOT_DIR" status --short)" ]]; then
  echo "git worktree is not clean; commit or stash changes before release" >&2
  exit 1
fi

node "$ROOT_DIR/scripts/materialize-release-local-outputs.mjs" >/dev/null

if [[ "$ALLOW_DIRTY" != "true" && -n "$(git -C "$ROOT_DIR" status --short)" ]]; then
  echo "git worktree changed while preparing local release outputs; review changes before release" >&2
  exit 1
fi

bash "$ROOT_DIR/scripts/release-preflight.sh" --tag "$TAG" >/dev/null

echo "Version: $VERSION"
echo "Tag:     $TAG"
echo ""
echo "Commands:"
echo "  git tag $TAG"
echo "  git push origin main"
echo "  git push origin $TAG"

if [[ "$DRY_RUN" == "true" ]]; then
  echo ""
  echo "Dry run only. No tag created."
  exit 0
fi

git -C "$ROOT_DIR" tag "$TAG"
echo "+ git push origin main"
git -C "$ROOT_DIR" push origin main
echo "+ git push origin $TAG"
git -C "$ROOT_DIR" push origin "$TAG"
