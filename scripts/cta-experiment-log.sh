#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSV_PATH="$ROOT_DIR/.aios/tasks/metrics/cta-experiments.csv"

usage() {
  cat <<'USAGE'
Usage:
  scripts/cta-experiment-log.sh \
    --page PAGE \
    --slot SLOT \
    --variant VARIANT \
    --utm-content UTM_CONTENT \
    [--date YYYY-MM-DD] \
    [--views N] \
    [--clicks N] \
    [--stars-before N] \
    [--stars-after N] \
    [--decision TEXT] \
    [--notes TEXT]

Examples:
  scripts/cta-experiment-log.sh --page index.md --slot home_hero --variant A --utm-content home_hero_star --views 220 --clicks 12 --stars-before 20 --stars-after 24 --decision keep --notes "day1"
  scripts/cta-experiment-log.sh --page cli-comparison.md --slot comparison_hero --variant B --utm-content comparison_hero_star_v2 --views 0 --clicks 0 --decision running
USAGE
}

date_value="$(date +%F)"
page=""
slot=""
variant=""
utm_content=""
views=""
clicks=""
stars_before=""
stars_after=""
decision=""
notes=""

while (($# > 0)); do
  case "$1" in
    --date)
      date_value="${2:-}"
      shift 2
      ;;
    --page)
      page="${2:-}"
      shift 2
      ;;
    --slot)
      slot="${2:-}"
      shift 2
      ;;
    --variant)
      variant="${2:-}"
      shift 2
      ;;
    --utm-content)
      utm_content="${2:-}"
      shift 2
      ;;
    --views)
      views="${2:-}"
      shift 2
      ;;
    --clicks)
      clicks="${2:-}"
      shift 2
      ;;
    --stars-before)
      stars_before="${2:-}"
      shift 2
      ;;
    --stars-after)
      stars_after="${2:-}"
      shift 2
      ;;
    --decision)
      decision="${2:-}"
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

if [[ -z "$page" || -z "$slot" || -z "$variant" || -z "$utm_content" ]]; then
  echo "--page, --slot, --variant, and --utm-content are required" >&2
  usage >&2
  exit 1
fi

if [[ ! "$date_value" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "--date must be YYYY-MM-DD" >&2
  exit 1
fi

for pair in \
  "views:$views" \
  "clicks:$clicks" \
  "stars-before:$stars_before" \
  "stars-after:$stars_after"; do
  key="${pair%%:*}"
  value="${pair#*:}"
  if [[ -n "$value" && ! "$value" =~ ^[0-9]+$ ]]; then
    echo "--$key must be an integer" >&2
    exit 1
  fi
done

if [[ ! -f "$CSV_PATH" ]]; then
  mkdir -p "$(dirname "$CSV_PATH")"
  echo "date,page,slot,variant,utm_content,views,clicks,ctr,stars_before,stars_after,decision,notes" > "$CSV_PATH"
fi

clean_decision="${decision//$'\n'/ }"
clean_decision="${clean_decision//,/;}"
clean_notes="${notes//$'\n'/ }"
clean_notes="${clean_notes//,/;}"

tmp_file="$(mktemp)"
awk -F',' -v OFS=',' \
  -v d="$date_value" \
  -v p="$page" \
  -v sl="$slot" \
  -v v="$variant" \
  -v u="$utm_content" \
  -v vw="$views" \
  -v cl="$clicks" \
  -v sb="$stars_before" \
  -v sa="$stars_after" \
  -v de="$clean_decision" \
  -v no="$clean_notes" '
function recompute_ctr() {
  if ($6 != "" && $7 != "" && ($6 + 0) > 0) {
    $8 = sprintf("%.4f", ($7 + 0) / ($6 + 0))
  } else if ($6 != "" && $7 != "" && ($6 + 0) == 0) {
    $8 = ""
  }
}
NR == 1 {
  print;
  next
}
$1 == d && $2 == p && $3 == sl && $4 == v {
  if (u != "") {
    $5 = u
  }
  if (vw != "") {
    $6 = vw
  }
  if (cl != "") {
    $7 = cl
  }
  recompute_ctr()
  if (sb != "") {
    $9 = sb
  }
  if (sa != "") {
    $10 = sa
  }
  if (de != "") {
    $11 = de
  }
  if (no != "") {
    $12 = no
  }
  found = 1
  print
  next
}
{
  print
}
END {
  ctr = ""
  if (vw != "" && cl != "" && (vw + 0) > 0) {
    ctr = sprintf("%.4f", (cl + 0) / (vw + 0))
  }
  if (!found) {
    print d, p, sl, v, u, vw, cl, ctr, sb, sa, de, no
  }
}
' "$CSV_PATH" > "$tmp_file"
mv "$tmp_file" "$CSV_PATH"

echo "Upserted CTA experiment row in $CSV_PATH for $date_value $page/$slot/$variant"
