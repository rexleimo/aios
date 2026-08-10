#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSV_PATH="$ROOT_DIR/.aios/tasks/metrics/english-growth-daily.csv"
REPO="rexleimo/aios"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

if [ ! -f "$CSV_PATH" ]; then
  mkdir -p "$(dirname "$CSV_PATH")"
  echo "date,github_stars,docs_sessions,docs_to_github_clicks,notes" > "$CSV_PATH"
fi

today="$(date +%F)"
stars="$(curl -Ls "https://api.github.com/repos/$REPO" | jq -r '.stargazers_count')"

if [ -z "$stars" ] || [ "$stars" = "null" ]; then
  echo "Failed to fetch star count for $REPO" >&2
  exit 1
fi

# Update today's star count if row exists; otherwise append a new row.
tmp_file="$(mktemp)"
awk -F',' -v OFS=',' -v d="$today" -v s="$stars" '
NR == 1 { print; next }
$1 == d { $2 = s; found = 1; print; next }
{ print }
END { if (!found) print d, s, "", "", "" }
' "$CSV_PATH" > "$tmp_file"
mv "$tmp_file" "$CSV_PATH"

echo "Updated $CSV_PATH with $today stars=$stars"
