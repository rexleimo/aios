#!/usr/bin/env python3
"""RexAI async image generation — zero-install executor (stdlib only).

Recommended executor for all platforms (python3 required).
- Prints live poll progress to stderr every poll (no silent "hang"; agents can watch progress).
- NEVER hangs: every loop has a hard deadline (per-job --timeout, default 600s) and every
  HTTP call has a socket timeout. Resubmission is bounded (max 3 attempts).
- Tolerates transient failures: submit retries up to 3 tries with backoff; poll errors
  (network blip / 5xx / 429) do not kill the run — up to 5 consecutive poll errors are
  absorbed and the deadline still bounds the wait. 4xx (e.g. 401) dies immediately.
- Reports job id on submit and on timeout (job may still finish server-side).
- Saves results (b64 or URL download) into --output-dir.
- Prints a final JSON summary to stdout.

Usage:
  export REXAI_API_KEY=cr_xxx
  python3 rexai-image.py --model gpt-image-2 --prompt "..." --size 1024x1792 --output-dir out
  python3 rexai-image.py --model gpt-image-2 --prompt "..." --image ref.png --output-dir out
"""
import argparse
import base64
import json
import mimetypes
import os
import re
import sys
import time
import urllib.error
import urllib.request

DEFAULT_BASE_URL = "https://coding.rexai.top"
USER_AGENT = "rexai-image/1.0 (skill executor)"
SUBMIT_MAX_TRIES = 3
POLL_MAX_CONSECUTIVE_ERRORS = 5


def die(msg, code=1):
    print(msg, file=sys.stderr)
    sys.exit(code)


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def recheck_hint(base, job_id):
    return (f"The job may still finish server-side. Re-check with:\n"
            f"  curl -sS -H \"Authorization: Bearer <REXAI_API_KEY>\" {base}/v1/images/jobs/{job_id}")


def request_json(url, api_key, body=None, timeout=120):
    """Single HTTP round-trip.

    Returns (data, None) on success, or (None, kind) where kind is:
      'transient' — network error / timeout / 429 / 5xx (safe to retry)
      'fatal'     — other 4xx or bad payload (retrying will not help)
    Never raises, never blocks unbounded (socket timeout + capped error body read).
    """
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "User-Agent": USER_AGENT,
            **({"Content-Type": "application/json"} if data else {}),
        },
        method="POST" if data else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r), None
    except urllib.error.HTTPError as e:
        raw = e.read(16384).decode(errors="replace")
        if e.code == 429 or 500 <= e.code < 600:
            log(f"  HTTP {e.code} (transient): {raw[:300]}")
            return None, "transient"
        die(f"RexAI request failed HTTP {e.code}: {raw}")
    except Exception as e:  # URLError, socket timeout, JSON decode...
        log(f"  request error (transient): {e}")
        return None, "transient"


def submit(base, api_key, body):
    for try_no in range(1, SUBMIT_MAX_TRIES + 1):
        job, kind = request_json(f"{base}/v1/images/generations", api_key, body)
        if job is not None:
            job_id = job.get("id")
            if not job_id:
                die(f"RexAI did not return a job id: {job}")
            return job, job_id
        if kind == "fatal" or try_no == SUBMIT_MAX_TRIES:
            die(f"RexAI submit failed after {try_no} tries.")
        backoff = 3.0 * try_no
        log(f"  submit transient failure (try {try_no}/{SUBMIT_MAX_TRIES}), retry in {backoff:.0f}s...")
        time.sleep(backoff)
    raise AssertionError("unreachable")


def poll(base, api_key, job_id, deadline, interval):
    """Poll until terminal status. Always exits within `deadline` (never hangs)."""
    current, status = None, None
    consecutive_errors = 0
    started = time.time()
    while status not in ("succeeded", "failed"):
        if time.time() > deadline:
            log(f"Timed out waiting for image job {job_id}; last status={status}.")
            log(recheck_hint(base, job_id))
            sys.exit(1)
        time.sleep(max(interval, 0.1))
        current, kind = request_json(f"{base}/v1/images/jobs/{job_id}", api_key)
        if current is None:
            consecutive_errors += 1
            if consecutive_errors >= POLL_MAX_CONSECUTIVE_ERRORS:
                log(f"Polling job {job_id} failed {consecutive_errors} times in a row; giving up.")
                log(recheck_hint(base, job_id))
                sys.exit(1)
            continue
        consecutive_errors = 0
        status = current.get("status")
        log(f"  polling: status={status} elapsed={int(time.time() - started)}s")
    return current


def resolve_image_input(path):
    if path.startswith(("http://", "https://", "data:image/")):
        return path
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    b64 = base64.b64encode(open(path, "rb").read()).decode()
    return f"data:{mime};base64,{b64}"


def extract_items(result):
    if isinstance(result, list):
        items = result
    elif isinstance(result, dict):
        for k in ("data", "images"):
            if isinstance(result.get(k), list):
                items = result[k]
                break
        else:
            items = [result]
    else:
        items = []
    return [i for i in items if isinstance(i, dict)]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--model", required=True)
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--size")
    ap.add_argument("--n", type=int)
    ap.add_argument("--image", action="append", default=[],
                    help="reference image path/URL/data-URI; repeatable")
    ap.add_argument("--output-dir", default="rexai-images")
    ap.add_argument("--base-url", default=os.environ.get("REXAI_BASE_URL", DEFAULT_BASE_URL))
    ap.add_argument("--api-key", default=os.environ.get("REXAI_API_KEY", ""))
    ap.add_argument("--interval", type=float, default=3.0, help="poll interval seconds")
    ap.add_argument("--timeout", type=float, default=600.0,
                    help="per-job wait timeout seconds (default 600) — hard bound, script always exits by then")
    ap.add_argument("--retry-delay", type=float, default=20.0,
                    help="resubmit delay seconds after relay capacity failure (default 20)")
    args = ap.parse_args()

    if not args.api_key:
        die("Missing RexAI API key. Set REXAI_API_KEY or pass --api-key.", 2)

    base = args.base_url.rstrip("/")
    body = {"model": args.model, "prompt": args.prompt}
    if args.size:
        body["size"] = args.size
    if args.n:
        body["n"] = args.n
    if args.image:
        body["images"] = [resolve_image_input(p) for p in args.image]

    current, job_id, status = None, None, None
    for attempt in range(1, 4):
        job, job_id = submit(base, args.api_key, body)
        log(f"job_id={job_id} (attempt {attempt}/3) — waiting, can take 3-5 min for large sizes")
        current = poll(base, args.api_key, job_id, time.time() + args.timeout, args.interval)
        status = current.get("status")

        if status == "failed":
            blob = json.dumps(current)
            if re.search(r"circuit|status_429|suspended", blob) and attempt < 3:
                log(f"Job {job_id} failed on relay capacity, resubmit in {args.retry_delay:.0f}s...")
                time.sleep(args.retry_delay)
                continue
            if "content_policy" in blob and attempt < 3:
                delay = max(5.0, args.retry_delay / 2)
                log(f"Job {job_id} hit the (probabilistic) content filter, resubmit in {delay:.0f}s...")
                time.sleep(delay)
                continue
            die(f"RexAI image job failed: {blob}")
        break

    os.makedirs(args.output_dir, exist_ok=True)
    results = []
    idx = 1
    for item in extract_items(current.get("result")):
        url, b64, expires = item.get("url", ""), item.get("b64_json", ""), item.get("expires_at", "")
        if not url and not b64:
            continue
        if b64:
            path = os.path.join(args.output_dir, f"rexai-{idx}.png")
            open(path, "wb").write(base64.b64decode(b64))
        else:
            ext = os.path.splitext(url.split("?")[0])[1].lstrip(".")
            if ext not in ("png", "jpg", "jpeg", "webp", "gif"):
                ext = "png"
            path = os.path.join(args.output_dir, f"rexai-{idx}.{ext}")
            req = urllib.request.Request(
                url, headers={"Authorization": f"Bearer {args.api_key}", "User-Agent": USER_AGENT}
            )
            with urllib.request.urlopen(req, timeout=300) as r, open(path, "wb") as f:
                f.write(r.read())
        results.append({"file": path, "url": url, "expires_at": expires})
        idx += 1

    print(json.dumps({
        "id": job_id,
        "status": status,
        "product_id": current.get("product_id"),
        "output_dir": args.output_dir,
        "results": results,
    }))


if __name__ == "__main__":
    main()
