#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSV_PATH="$ROOT_DIR/.aios/tasks/metrics/english-growth-daily.csv"

usage() {
  cat <<'USAGE'
Usage:
  scripts/growth-daily-report.sh [--date YYYY-MM-DD] [--sessions N] [--clicks N] [--notes TEXT]

Examples:
  scripts/growth-daily-report.sh --sessions 120 --clicks 8 --notes "ga4 baseline"
  scripts/growth-daily-report.sh --date 2026-03-06 --sessions 95 --clicks 7
USAGE
}

date_value="$(date +%F)"
sessions=""
clicks=""
notes=""

while (($# > 0)); do
  case "$1" in
    --date)
      date_value="${2:-}"
      shift 2
      ;;
    --sessions)
      sessions="${2:-}"
      shift 2
      ;;
    --clicks)
      clicks="${2:-}"
      shift 2
      ;;
    --notes)
      notes="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! "$date_value" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "--date must be YYYY-MM-DD" >&2
  exit 1
fi

if [[ -n "$sessions" && ! "$sessions" =~ ^[0-9]+$ ]]; then
  echo "--sessions must be an integer" >&2
  exit 1
fi

if [[ -n "$clicks" && ! "$clicks" =~ ^[0-9]+$ ]]; then
  echo "--clicks must be an integer" >&2
  exit 1
fi

if [[ ! -f "$CSV_PATH" ]]; then
  mkdir -p "$(dirname "$CSV_PATH")"
  echo "date,github_stars,docs_sessions,docs_to_github_clicks,notes" > "$CSV_PATH"
fi

clean_notes="${notes//$'\n'/ }"
clean_notes="${clean_notes//,/;}"

tmp_file="$(mktemp)"
awk -F',' -v OFS=',' -v d="$date_value" -v s="$sessions" -v c="$clicks" -v n="$clean_notes" '
NR == 1 {
  print;
  next
}
$1 == d {
  if (s != "") {
    $3 = s
  }
  if (c != "") {
    $4 = c
  }
  if (n != "") {
    $5 = n
  }
  found = 1
  print
  next
}
{
  print
}
END {
  if (!found) {
    print d, "", s, c, n
  }
}
' "$CSV_PATH" > "$tmp_file"
mv "$tmp_file" "$CSV_PATH"

echo "Updated $CSV_PATH for $date_value (sessions=${sessions:-unchanged}, clicks=${clicks:-unchanged})"
