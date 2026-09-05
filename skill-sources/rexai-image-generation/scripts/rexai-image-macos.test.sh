#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export REXAI_IMAGE_SH_SOURCED=1
# shellcheck source=/dev/null
source "$SCRIPT_DIR/rexai-image-macos.sh"

[ "$(normalize_base_url 'https://coding.rexai.top/')" = 'https://coding.rexai.top' ]
[ "$(normalize_base_url '/')" = 'https://coding.rexai.top' ]

body="$(build_request_body 'gpt-image-2' 'cat' '1' '1024x1024' '')"
printf '%s' "$body" | grep -q '"model":"gpt-image-2"'
printf '%s' "$body" | grep -q '"prompt":"cat"'
printf '%s' "$body" | grep -q '"size":"1024x1024"'

img_body="$(build_request_body 'gpt-image-2' 'watercolor' '2' '' 'https://example.com/source.png')"
printf '%s' "$img_body" | grep -q '"images":\["https://example.com/source.png"\]'

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
printf '\211PNG' > "$tmpdir/source.png"
data_url="$(resolve_image_input "$tmpdir/source.png")"
case "$data_url" in
  data:image/png\;base64,*) ;;
  *) echo "expected PNG data URL, got $data_url" >&2; exit 1 ;;
esac

json='{"id":"job1","status":"succeeded","product_id":"gpt-image-2","result":{"url":"https://cdn.example.com/a.png","b64_json":null,"expires_at":"2026-06-29T01:00:00.000Z"}}'
[ "$(json_get "$json" 'id')" = 'job1' ]
[ "$(json_get "$json" 'result.url')" = 'https://cdn.example.com/a.png' ]

printf 'AQID' | save_b64_result "$tmpdir" 1 >/tmp/rexai-shell-saved.txt
saved="$(cat /tmp/rexai-shell-saved.txt)"
[ -f "$saved" ]

echo 'rexai-image macOS shell tests passed'

