#!/usr/bin/env bash
set -euo pipefail

DEFAULT_BASE_URL="https://coding.rexai.top"
DEFAULT_OUTPUT_DIR="rexai-images"
DEFAULT_INTERVAL_MS=3000
DEFAULT_TIMEOUT_MS=180000

normalize_base_url() {
  local value="${1:-$DEFAULT_BASE_URL}"
  value="${value%/}"
  case "$value" in
    http://*|https://*) printf '%s' "$value" ;;
    *) printf '%s' "$DEFAULT_BASE_URL" ;;
  esac
}

mime_for_path() {
  case "${1##*.}" in
    jpg|JPG|jpeg|JPEG) printf 'image/jpeg' ;;
    png|PNG) printf 'image/png' ;;
    webp|WEBP) printf 'image/webp' ;;
    gif|GIF) printf 'image/gif' ;;
    *) printf 'application/octet-stream' ;;
  esac
}

json_string() {
  printf '%s' "$1" | perl -0777 -pe 's/\\/\\\\/g; s/"/\\"/g; s/\r/\\r/g; s/\n/\\n/g; s/\t/\\t/g; s/^/"/; s/$/"/;'
}

json_get() {
  local json="$1"
  local path="$2"
  printf '%s' "$json" | perl -MJSON::PP -e '
    my $path = shift @ARGV;
    local $/;
    my $root = decode_json(<STDIN>);
    my $node = $root;
    for my $part (split(/\./, $path)) {
      if (ref($node) eq "ARRAY") {
        $node = $node->[$part];
      } elsif (ref($node) eq "HASH") {
        $node = $node->{$part};
      } else {
        exit 2;
      }
    }
    exit 2 if !defined($node) || ref($node);
    print $node;
  ' "$path" 2>/dev/null || true
}

json_result_lines() {
  local json="$1"
  printf '%s' "$json" | perl -MJSON::PP -e '
    local $/;
    my $root = decode_json(<STDIN>);
    my $r = $root->{result};
    my @items;
    if (ref($r) eq "ARRAY") {
      @items = @$r;
    } elsif (ref($r) eq "HASH" && ref($r->{data}) eq "ARRAY") {
      @items = @{$r->{data}};
    } elsif (ref($r) eq "HASH" && ref($r->{images}) eq "ARRAY") {
      @items = @{$r->{images}};
    } elsif (ref($r) eq "HASH") {
      @items = ($r);
    }
    for my $item (@items) {
      next unless ref($item) eq "HASH";
      print join("\t",
        defined($item->{url}) ? $item->{url} : "",
        defined($item->{b64_json}) ? $item->{b64_json} : "",
        defined($item->{expires_at}) ? $item->{expires_at} : ""
      ), "\n";
    }
  '
}

resolve_image_input() {
  local input="$1"
  case "$input" in
    http://*|https://*|data:image/*) printf '%s' "$input"; return ;;
  esac
  local mime
  mime="$(mime_for_path "$input")"
  local b64
  b64="$(base64 < "$input" | tr -d '\n')"
  printf 'data:%s;base64,%s' "$mime" "$b64"
}

build_images_json() {
  local images="${1:-}"
  local items=""
  local image
  while IFS= read -r image; do
    [ -z "$image" ] && continue
    if [ -n "$items" ]; then items="$items,"; fi
    items="$items$(json_string "$image")"
  done <<EOF
$images
EOF
  printf '[%s]' "$items"
}

build_request_body() {
  local model="$1"
  local prompt="$2"
  local n="${3:-}"
  local size="${4:-}"
  local images="${5:-}"
  local body
  body="{\"model\":$(json_string "$model"),\"prompt\":$(json_string "$prompt")"
  if [ -n "$n" ] && [ "$n" != "0" ]; then
    body="$body,\"n\":$n"
  fi
  if [ -n "$size" ]; then
    body="$body,\"size\":$(json_string "$size")"
  fi
  if [ -n "$images" ]; then
    body="$body,\"images\":$(build_images_json "$images")"
  fi
  body="$body}"
  printf '%s' "$body"
}

api_key_help() {
  cat <<'EOF'
Missing RexAI API key.

Recommended setup:
  Windows current PowerShell:
    $env:REXAI_API_KEY = "cr_xxx"
  Windows persistent user env var, then open a new terminal:
    setx REXAI_API_KEY "cr_xxx"
  macOS/Linux current shell:
    export REXAI_API_KEY="cr_xxx"
  macOS zsh persistent setup, then open a new terminal:
    printf '%s\n' 'export REXAI_API_KEY="cr_xxx"' >> ~/.zshrc
  Linux bash persistent setup, then open a new terminal:
    printf '%s\n' 'export REXAI_API_KEY="cr_xxx"' >> ~/.bashrc

The key is read only from the REXAI_API_KEY environment variable — there is no CLI option to pass it. Never put the key in shell history or command lines.
EOF
}

save_b64_result() {
  local output_dir="$1"
  local index="$2"
  local file="$output_dir/rexai-$index.png"
  local b64
  b64="$(cat)"
  mkdir -p "$output_dir"
  if ! printf '%s' "$b64" | base64 -D > "$file" 2>/dev/null; then
    printf '%s' "$b64" | base64 -d > "$file"
  fi
  printf '%s' "$file"
}

download_url_result() {
  local url="$1"
  local output_dir="$2"
  local index="$3"
  local path="${url%%\?*}"
  local ext="${path##*.}"
  case "$ext" in
    png|jpg|jpeg|webp|gif) ;;
    *) ext="png" ;;
  esac
  mkdir -p "$output_dir"
  local file="$output_dir/rexai-$index.$ext"
  curl -fsSL "$url" -o "$file"
  printf '%s' "$file"
}

http_json() {
  local method="$1"
  local url="$2"
  local api_key="$3"
  local body="${4:-}"
  local response
  if [ -n "$body" ]; then
    response="$(curl -sS -w '\n%{http_code}' -X "$method" "$url" \
      -H 'Content-Type: application/json' \
      -H "Authorization: Bearer $api_key" \
      --data "$body")"
  else
    response="$(curl -sS -w '\n%{http_code}' -X "$method" "$url" \
      -H "Authorization: Bearer $api_key")"
  fi
  local code="${response##*$'\n'}"
  local content="${response%$'\n'$code}"
  case "$code" in
    2*) printf '%s' "$content" ;;
    *) printf 'RexAI request failed HTTP %s: %s\n' "$code" "$content" >&2; return 1 ;;
  esac
}

usage() {
  cat <<'EOF'
Usage:
  export REXAI_API_KEY=cr_xxx
  bash scripts/rexai-image-macos.sh --model gpt-image-2 --prompt "cat" --size 1024x1024
  bash scripts/rexai-image-macos.sh --model gpt-image-2 --prompt "watercolor" --image source.png

Options:
  --model <id>          RexAI image product id
  --prompt <text>       Image prompt or edit instruction
  --image <path|url>    Reference image for image-to-image; repeatable
  --size <WxH>          Optional output size
  --n <count>           Optional number of images
  --output-dir <dir>    Directory for downloaded images, default: rexai-images
  --base-url <url>      Default: https://coding.rexai.top
                        API key is read from the REXAI_API_KEY environment variable only
EOF
  api_key_help
}

main() {
  local model=""
  local prompt=""
  local size=""
  local n=""
  local output_dir="$DEFAULT_OUTPUT_DIR"
  local base_url="${REXAI_BASE_URL:-$DEFAULT_BASE_URL}"
  local api_key="${REXAI_API_KEY:-}"
  local interval_ms="$DEFAULT_INTERVAL_MS"
  local timeout_ms="$DEFAULT_TIMEOUT_MS"
  local images=""

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --help|-h) usage; return 0 ;;
      --model) model="$2"; shift 2 ;;
      --prompt) prompt="$2"; shift 2 ;;
      --size) size="$2"; shift 2 ;;
      --n) n="$2"; shift 2 ;;
      --image) images="${images}${images:+$'\n'}$(resolve_image_input "$2")"; shift 2 ;;
      --output-dir) output_dir="$2"; shift 2 ;;
      --base-url) base_url="$2"; shift 2 ;;
      --interval-ms) interval_ms="$2"; shift 2 ;;
      --timeout-ms) timeout_ms="$2"; shift 2 ;;
      *) printf 'Unknown option: %s\n' "$1" >&2; return 2 ;;
    esac
  done

  [ -n "$api_key" ] || { api_key_help >&2; return 2; }
  [ -n "$model" ] || { printf 'Missing required --model\n' >&2; return 2; }
  [ -n "$prompt" ] || { printf 'Missing required --prompt\n' >&2; return 2; }

  local base
  base="$(normalize_base_url "$base_url")"
  local body
  body="$(build_request_body "$model" "$prompt" "$n" "$size" "$images")"
  local job
  job="$(http_json POST "$base/v1/images/generations" "$api_key" "$body")"
  local job_id
  job_id="$(json_get "$job" id)"
  [ -n "$job_id" ] || { printf 'RexAI did not return a job id: %s\n' "$job" >&2; return 1; }

  local current="$job"
  local status
  status="$(json_get "$current" status)"
  local started now interval_s timeout_s
  started="$(date +%s)"
  interval_s=$(( (interval_ms + 999) / 1000 ))
  timeout_s=$(( (timeout_ms + 999) / 1000 ))
  [ "$interval_s" -gt 0 ] || interval_s=1

  while [ "$status" != "succeeded" ] && [ "$status" != "failed" ]; do
    now="$(date +%s)"
    if [ $((now - started)) -gt "$timeout_s" ]; then
      printf 'Timed out waiting for image job %s; last status=%s\n' "$job_id" "$status" >&2
      return 1
    fi
    sleep "$interval_s"
    current="$(http_json GET "$base/v1/images/jobs/$job_id" "$api_key")"
    status="$(json_get "$current" status)"
  done

  if [ "$status" = "failed" ]; then
    printf 'RexAI image job failed: %s\n' "$current" >&2
    return 1
  fi

  local idx=1
  local results=""
  local line url b64 expires file result_json
  while IFS="$(printf '\t')" read -r url b64 expires; do
    [ -z "$url$b64" ] && continue
    if [ -n "$b64" ]; then
      file="$(printf '%s' "$b64" | save_b64_result "$output_dir" "$idx")"
    else
      file="$(download_url_result "$url" "$output_dir" "$idx")"
    fi
    result_json="{\"file\":$(json_string "$file"),\"url\":$(json_string "$url"),\"expires_at\":$(json_string "$expires")}"
    if [ -n "$results" ]; then results="$results,"; fi
    results="$results$result_json"
    idx=$((idx + 1))
  done <<EOF
$(json_result_lines "$current")
EOF

  printf '{"id":%s,"status":%s,"product_id":%s,"output_dir":%s,"results":[%s]}\n' \
    "$(json_string "$job_id")" \
    "$(json_string "$status")" \
    "$(json_string "$(json_get "$current" product_id)")" \
    "$(json_string "$output_dir")" \
    "$results"
}

if [ "${REXAI_IMAGE_SH_SOURCED:-0}" != "1" ]; then
  main "$@"
fi
