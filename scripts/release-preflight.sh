#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_FILE="$ROOT_DIR/VERSION"
CHANGELOG_FILE="$ROOT_DIR/CHANGELOG.md"

usage() {
  cat <<'EOF'
Usage:
  scripts/release-preflight.sh --tag vX.Y.Z

Validates:
  - tag format is vX.Y.Z
  - VERSION matches X.Y.Z
  - CHANGELOG.md contains ## [X.Y.Z] - YYYY-MM-DD
  - root and MCP-server test/build checks pass
  - changed Skills have reproducible, committed training evidence
  - generated skill roots materialize from skill-sources via scripts/check-skills-sync.mjs
  - generated native outputs materialize from client-sources/native-base via scripts/check-native-sync.mjs
EOF
}

TAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      TAG="${2:-}"
      shift 2
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

if [[ -z "$TAG" ]]; then
  echo "--tag is required" >&2
  usage >&2
  exit 1
fi

if [[ ! "$TAG" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "tag must match vX.Y.Z: $TAG" >&2
  exit 1
fi

if [[ ! -f "$VERSION_FILE" ]]; then
  echo "missing VERSION file: $VERSION_FILE" >&2
  exit 1
fi
if [[ ! -f "$CHANGELOG_FILE" ]]; then
  echo "missing CHANGELOG file: $CHANGELOG_FILE" >&2
  exit 1
fi

VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
EXPECTED_VERSION="${TAG#v}"

if [[ "$VERSION" != "$EXPECTED_VERSION" ]]; then
  echo "VERSION mismatch: tag=$TAG VERSION=$VERSION" >&2
  exit 1
fi

if ! grep -Eq "^## \\[$EXPECTED_VERSION\\] - [0-9]{4}-[0-9]{2}-[0-9]{2}$" "$CHANGELOG_FILE"; then
  echo "changelog missing matching release heading for $EXPECTED_VERSION" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "missing required command: node" >&2
  exit 1
fi

for rex_file in \
  "$ROOT_DIR/rex-harness/package.json" \
  "$ROOT_DIR/rex-harness/src/index.mjs" \
  "$ROOT_DIR/rex-harness/bin/rex-harness.mjs" \
  "$ROOT_DIR/rex-harness/skill-sources/rex-workflow/SKILL.md"; do
  if [[ ! -f "$rex_file" ]]; then
    echo "missing required rex-harness release file: $rex_file" >&2
    echo "initialize the submodule with: git -C \"$ROOT_DIR\" submodule update --init --recursive -- rex-harness" >&2
    exit 1
  fi
done

if ! node "$ROOT_DIR/scripts/check-skills-sync.mjs" --materialize-temp >/dev/null; then
  echo "skills sync drift detected; run: node scripts/sync-skills.mjs" >&2
  exit 1
fi

if ! node "$ROOT_DIR/scripts/check-native-sync.mjs" --materialize-temp >/dev/null; then
  echo "native sync drift detected; run: node scripts/sync-native.mjs" >&2
  exit 1
fi

if ! npm --prefix "$ROOT_DIR" run test:scripts; then
  echo "root release test suite failed: npm run test:scripts" >&2
  exit 1
fi

if ! (
  cd "$ROOT_DIR/mcp-server"
  npm run typecheck
  npm test
  npm run build
); then
  echo "MCP-server verification failed: typecheck, test, or build" >&2
  exit 1
fi

if ! git -C "$ROOT_DIR" rev-parse --verify --quiet HEAD^ >/dev/null; then
  echo "release training verification requires a parent commit" >&2
  exit 1
fi
TRAINING_BASE="$(git -C "$ROOT_DIR" describe --tags --abbrev=0 --match 'v[0-9]*' HEAD^ 2>/dev/null || true)"
if [[ -z "$TRAINING_BASE" ]]; then
  TRAINING_BASE="HEAD^"
fi
if ! node "$ROOT_DIR/scripts/aios.mjs" skill verify-training --changed --base "$TRAINING_BASE" --json; then
  echo "changed Skills lack reproducible training evidence for this release" >&2
  exit 1
fi

if [[ -f "$ROOT_DIR/agent-sources/manifest.json" ]]; then
  if ! git -C "$ROOT_DIR" diff --quiet -- scripts/lib/specs/orchestrator-agents.json; then
    echo "agent export drift detected; run: node scripts/generate-orchestrator-agents.mjs --export-only and commit scripts/lib/specs/orchestrator-agents.json" >&2
    exit 1
  fi
  if ! node "$ROOT_DIR/scripts/generate-orchestrator-agents.mjs" --export-only >/dev/null; then
    echo "agent export regeneration failed; run: node scripts/generate-orchestrator-agents.mjs --export-only" >&2
    exit 1
  fi
  if ! git -C "$ROOT_DIR" diff --quiet -- scripts/lib/specs/orchestrator-agents.json; then
    echo "agent export drift detected; run: node scripts/generate-orchestrator-agents.mjs --export-only and commit scripts/lib/specs/orchestrator-agents.json" >&2
    exit 1
  fi
fi

echo "[ok] release preflight passed for $TAG"
echo "  VERSION:   $VERSION"
echo "  CHANGELOG: has ## [$EXPECTED_VERSION] - YYYY-MM-DD"
echo "  SKILLS:    generated roots match skill-sources/"
echo "  NATIVE:    generated native outputs match client-sources/native-base/"
echo "  REX:       rex-harness planning kernel is materialized"
echo "  TESTS:     root and MCP-server verification passed"
echo "  TRAINING:  changed Skill evidence recomputed since $TRAINING_BASE"
if [[ -f "$ROOT_DIR/agent-sources/manifest.json" ]]; then
  echo "  AGENTS:    export-only regeneration passed"
fi
