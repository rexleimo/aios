#!/usr/bin/env python3
"""Ad-hoc verification for the superpowers vendoring task.

Verifies, for all 8 vendored skills:
  1. skills-lock.json is valid JSON and lists the expected skill keys.
  2. Each SKILL.md exists on disk.
  3. The sha256 of each on-disk file == the computedHash pinned in skills-lock.json.
  4. Each SKILL.md has well-formed frontmatter with the required provenance fields.
  5. The original (non-frontmatter) body of each vendored file is byte-identical
     to the live upstream obra/superpowers main-branch content, i.e. vendoring
     did not alter the skill text itself.
"""
import json, hashlib, re, sys, urllib.request, os

ROOT = "/Users/rex/codes/harness-cli"
SKILLS = [
    "brainstorming", "using-superpowers", "test-driven-development",
    "systematic-debugging", "writing-plans", "subagent-driven-development",
    "using-git-worktrees", "verification-before-completion",
]
REQUIRED_FM = ["name", "description", "origin", "vendored_at", "vendored_version", "license"]
UPSTREAM = "https://raw.githubusercontent.com/obra/superpowers/main/skills/{}/SKILL.md"

failures = []
checks = 0

def ok():
    global checks
    checks += 1

def bad(msg):
    global checks
    checks += 1
    failures.append(msg)

# --- 1. skills-lock.json validity ---
lock_path = os.path.join(ROOT, "skills-lock.json")
try:
    with open(lock_path) as f:
        lock = json.load(f)
    ok()
except Exception as e:
    bad(f"skills-lock.json is not valid JSON: {e}")
    print("FAIL: cannot parse skills-lock.json — aborting further checks")
    sys.exit(1)

lock_skills = lock.get("skills", {})
for s in SKILLS:
    if s not in lock_skills:
        bad(f"skills-lock.json missing key: {s}")
    else:
        ok()
if "find-skills" not in lock_skills:
    bad("skills-lock.json lost pre-existing 'find-skills' entry")
else:
    ok()

# --- 2/3/4. per-skill file + hash + frontmatter ---
for s in SKILLS:
    path = os.path.join(ROOT, "skill-sources", "superpowers", s, "SKILL.md")
    if not os.path.exists(path):
        bad(f"missing file: {path}")
        continue
    with open(path, "rb") as f:
        raw = f.read()
    h = hashlib.sha256(raw).hexdigest()
    expected = lock_skills.get(s, {}).get("computedHash")
    if h == expected:
        ok()
    else:
        bad(f"{s}: hash mismatch disk={h} lock={expected}")
    text = raw.decode("utf-8")
    m = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not m:
        bad(f"{s}: no frontmatter block")
        continue
    fm = m.group(1)
    for field in REQUIRED_FM:
        if not re.search(rf"(?m)^{field}:", fm):
            bad(f"{s}: frontmatter missing field '{field}'")
    ok()

# --- 5. body byte-identical to upstream (network permitting) ---
network_ok = True
for s in SKILLS:
    path = os.path.join(ROOT, "skill-sources", "superpowers", s, "SKILL.md")
    try:
        with open(path, "r", encoding="utf-8") as f:
            local = f.read()
    except Exception as e:
        bad(f"{s}: cannot read local file: {e}")
        continue
    m = re.match(r"^---\n.*?\n---\n", local, re.DOTALL)
    local_body = local[m.end():] if m else local
    try:
        with urllib.request.urlopen(UPSTREAM.format(s), timeout=20) as r:
            upstream = r.read().decode("utf-8")
    except Exception as e:
        network_ok = False
        bad(f"{s}: upstream fetch failed ({e}) - cannot prove body integrity via network")
        continue
    mu = re.match(r"^---\n.*?\n---\n", upstream, re.DOTALL)
    upstream_body = upstream[mu.end():] if mu else upstream
    if local_body == upstream_body:
        ok()
    else:
        bad(f"{s}: vendored body diverges from upstream main (local {len(local_body)}B vs upstream {len(upstream_body)}B)")

# --- report ---
print(f"Checks run: {checks}")
print(f"Pass: {checks - len(failures)}")
print(f"Fail: {len(failures)}")
if failures:
    print("\n--- FAILURES ---")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("\nALL CHECKS PASSED")
if not network_ok:
    print("NOTE: one or more upstream fetches failed; body-integrity checks for those skills were skipped.")
