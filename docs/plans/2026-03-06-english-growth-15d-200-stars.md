# English-First 15-Day Growth Sprint Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Drive English-first traffic and increase repository saves/stars from 0 to 200 in 15 days.

**Architecture:** Use a daily growth loop: publish one English asset, distribute it to one high-intent channel, route to one clear GitHub star CTA, then checkpoint metrics and adapt next-day content. Keep positioning strict: AIOS augments existing CLI agents instead of replacing them.

**Tech Stack:** MkDocs docs-site, GitHub repository pages, shell scripts, GitHub API, daily metric CSV.

---

### Task 1: Establish growth operating system and baseline

**Files:**
- Create: `docs/plans/2026-03-06-english-growth-15d-200-stars-design.md`
- Create: `tasks/metrics/english-growth-daily.csv`
- Create: `scripts/growth-daily-metrics.sh`

**Step 1: Create baseline metric table**

Create `tasks/metrics/english-growth-daily.csv` with:
- `date`
- `github_stars`
- `docs_sessions`
- `docs_to_github_clicks`
- `notes`

**Step 2: Add daily snapshot command**

Create `scripts/growth-daily-metrics.sh` to:
- pull star count from `https://api.github.com/repos/rexleimo/aios`
- append a CSV row for current day
- preserve manual fields for traffic/clicks

**Step 3: Record day-0 baseline**

Run:

```bash
bash scripts/growth-daily-metrics.sh
```

Expected:
- A row is appended for today.
- `github_stars` reflects current live value.

---

### Task 2: Convert docs homepage for English-first star conversion

**Files:**
- Modify: `docs-site/index.md`
- Modify: `mkdocs.yml`
- Create: `docs-site/english-growth.md`

**Step 1: Add explicit GitHub star CTA above the fold**

Update docs homepage hero buttons:
- `Star on GitHub`
- `Quick Start`
- `Superpowers`

**Step 2: Add sprint/public build page**

Create `docs-site/english-growth.md` covering:
- 15-day target
- why AIOS is an orchestration layer
- daily checkpoints
- clear contribution/star CTA

**Step 3: Add nav entry**

Add `English Growth Sprint` under Resources in `mkdocs.yml`.

---

### Task 3: Run 15-day execution cadence

**Files:**
- Update daily: `tasks/metrics/english-growth-daily.csv`

**Step 1: Daily checkpoint**

Each day:
1. run metrics snapshot script
2. update traffic fields manually
3. send short summary (wins/losses/next move)

**Step 2: Milestone checks**

Daily expected pace:
- Day 5 >= 40 stars
- Day 10 >= 110 stars
- Day 15 >= 200 stars

**Step 3: Trigger rules**

- If growth < planned pace for 2 consecutive days:
  - switch to stronger social proof content (demo GIF + before/after workflow)
  - run one high-signal comparison post (`raw CLI` vs `AIOS layer`)

---

### Task 4: Verification

**Files:**
- Verify: `docs-site/index.md`
- Verify: `docs-site/english-growth.md`
- Verify: `tasks/metrics/english-growth-daily.csv`
- Verify: `scripts/growth-daily-metrics.sh`

**Step 1: Verify docs build**

Run:

```bash
mkdocs build -f mkdocs.yml
```

Expected:
- build exits 0
- new page appears in output

**Step 2: Verify growth script output**

Run:

```bash
bash scripts/growth-daily-metrics.sh
tail -n 3 tasks/metrics/english-growth-daily.csv
```

Expected:
- script exits 0
- latest row contains current date and non-empty star count

**Step 3: Verify changed files in git**

Run:

```bash
git status --short
```

Expected:
- plan/docs/script/metrics files are present in diff
