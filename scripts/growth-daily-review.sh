#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DAILY_CSV="$ROOT_DIR/.aios/tasks/metrics/english-growth-daily.csv"
CTA_CSV="$ROOT_DIR/.aios/tasks/metrics/cta-experiments.csv"

usage() {
  cat <<'USAGE'
Usage:
  scripts/growth-daily-review.sh [--date YYYY-MM-DD] [--page PAGE] [--slot SLOT] [--variant VARIANT]

Defaults:
  --date today
  --page index.md
  --slot home_hero
  --variant A
USAGE
}

date_value="$(date +%F)"
page="index.md"
slot="home_hero"
variant="A"

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

if [[ ! -f "$DAILY_CSV" ]]; then
  echo "Missing $DAILY_CSV" >&2
  exit 1
fi

if [[ ! -f "$CTA_CSV" ]]; then
  echo "Missing $CTA_CSV" >&2
  exit 1
fi

daily_row="$(awk -F',' -v d="$date_value" 'NR>1 && $1==d {print; exit}' "$DAILY_CSV")"
cta_row="$(awk -F',' -v d="$date_value" -v p="$page" -v sl="$slot" -v v="$variant" 'NR>1 && $1==d && $2==p && $3==sl && $4==v {print; exit}' "$CTA_CSV")"

if [[ -z "$daily_row" ]]; then
  echo "No daily metrics row for $date_value in $DAILY_CSV" >&2
  exit 1
fi

if [[ -z "$cta_row" ]]; then
  echo "No CTA row for $date_value $page/$slot/$variant in $CTA_CSV" >&2
  exit 1
fi

IFS=',' read -r _date github_stars docs_sessions docs_clicks notes <<< "$daily_row"
IFS=',' read -r _d page_v slot_v variant_v utm_content views clicks ctr stars_before stars_after decision _notes <<< "$cta_row"

star_delta=""
if [[ -n "${stars_before:-}" && -n "${stars_after:-}" ]]; then
  star_delta="$((stars_after - stars_before))"
fi

recommendation="running"
reason="insufficient sample; keep collecting one full-day run"

if [[ -n "${views:-}" && "$views" =~ ^[0-9]+$ && -n "${clicks:-}" && "$clicks" =~ ^[0-9]+$ ]]; then
  if (( views >= 100 )); then
    if [[ -n "$star_delta" && "$star_delta" =~ ^-?[0-9]+$ && "$star_delta" -gt 0 ]]; then
      recommendation="keep"
      reason="stars increased during this sample window"
    else
      if (( clicks == 0 )); then
        recommendation="kill"
        reason="enough views with zero clicks"
      else
        recommendation="running"
        reason="sample reached, but no positive star delta yet"
      fi
    fi
  fi
fi

echo "date=$date_value"
echo "page=$page_v slot=$slot_v variant=$variant_v utm_content=$utm_content"
echo "github_stars=${github_stars:-unknown} docs_sessions=${docs_sessions:-unknown} docs_to_github_clicks=${docs_clicks:-unknown}"
echo "views=${views:-unknown} clicks=${clicks:-unknown} ctr=${ctr:-unknown} stars_before=${stars_before:-unknown} stars_after=${stars_after:-unknown} star_delta=${star_delta:-unknown}"
echo "current_decision=${decision:-unknown}"
echo "recommended_decision=$recommendation"
echo "reason=$reason"
