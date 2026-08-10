---
title: I Automated My Xiaohongshu Operations with AI — My Colleagues Thought I Hired an Assistant
publish_date: 2026-03-05
description: From 2 hours per day to 15 minutes. Here's exactly how I did it.
---

# I Automated My Xiaohongshu Operations with AI — My Colleagues Thought I Hired an Assistant

You might not believe this, but I manage 3 Xiaohongshu accounts alone and still clock out on time every day.

Not because I'm particularly diligent — but because I **outsourced all the soul-crushing repetitive work to AI**.

---

## 01. Results First, Story Second

Let me show you hard data so you know I'm not exaggerating:

| Metric | Before Automation | After Automation |
|--------|-------------------|-------------------|
| Daily time spent | 2 hours | 15 minutes |
| Notes published | 1-2 / day | 5-8 / day |
| Follower growth | 50 / week | 200+ / week |
| Engagement rate | 3% | 12% |

**How did I save those 2 hours? Keep reading.**

---

## 02. What Exactly Did I Automate?

### Scenario 1: Publishing Notes

**Before** (took 30 minutes):
1. Open Xiaohongshu app
2. Tap "Publish Note"
3. Select photos (digging through album forever)
4. Write caption (stuck for half an hour)
5. Tap confirm to upload
6. Wait for upload to complete
7. Confirm successful publish

**Now** (takes 0 minutes):

I toss the materials into a designated folder, then...

```bash
# Lie back and let it auto-publish
codex
```

AIOS handles: login → photo selection → caption writing → publishing → screenshot confirmation.

Not a dream. I tested it 100 times. 98% success rate.

### Scenario 2: Engagement (Likes + Comments + Follows)

**Before**: Spent 1 hour every day scrolling through follow list, manually liking + copy-pasting comments. Hands hurt, heart exhausted.

**Now**:

Set keywords (like "programming", "AI", "growth"), AIOS automatically:
- Visits target users
- Intelligently likes posts
- Generates personalized comments (not the garbage "follow back for follow back" kind)
- Auto-follows / reciprocates follows

### Scenario 3: Data Monitoring

**Before**: Opened Xiaohongshu 10 times a day to check stats. Eyes went blurry.

**Now**: Automatically scrapes yesterday's data at 9 AM, generates a report sent to my email.

Includes: impressions, views, likes, saves, comments, follower growth...

---

## 03. The Core Tech: Why AIOS?

You might be thinking: "代理运营服务才 99/month on Taobao, why bother doing this yourself?"

Fair question. Let me explain the difference.

### Regular Scripts vs AIOS

| Item | Taobao Scripts | AIOS |
|------|---------------|--------|
| Browser control | None or simulated | Real Playwright |
| Resume from breakpoint | ❌ Start over on failure | ✅ Context DB remembers progress |
| Anti-detection | Basically none | Random delays + behavior simulation |
| Multi-account | Difficult | Multi-profile isolation |
| Maintenance | Risk of vendor disappearing | Open source, you own it |

### My Daily Routine

I arrive at the office at 9:30 AM, brew a coffee, and by the time I'm done, all 5 accounts' daily tasks have finished running.

Then I only need to:
1. Review the data report
2. Think about today's content
3. Use the remaining time for girlfriend / study / slacking off

**This is the right way to automate: not replacing your thinking, but saving time on things that don't require thinking.**

---

## 04. FAQ (You Might Ask)

**Q1: Will I get banned?**

A: Possible, but avoidable. The key is simulating real human behavior:
- Random operation intervals (5-30 seconds)
- Random scroll trajectories
- Random click positions
- Don't operate at high frequency in short time periods

AIOS has these settings enabled by default. Don't be stupid and turn them off.

**Q2: How to maintain Xiaohongshu login state?**

A: Browser profile saves it. Manually log in once, then AIOS automatically reuses the Cookie. Usually lasts 1-2 weeks. Re-login before it expires.

**Q3: Can it really generate captions?**

A: Yes. But I don't recommend letting AI write everything. Best practice: AI generates draft → you revise → auto-publish.

---

## 05. How to Get Started?

```bash
# 1. Clone the project
git clone https://github.com/rexleimo/aios.git

# 2. Install
cd aios
./scripts/setup-all.sh --components all

# 3. Launch
codex
```

For detailed setup: [rexai.top](https://rexai.top)

---

## 06. My Advice

1. **Start with one account** — don't jump to managing 5 accounts right away. First get the workflow working.
2. **Content is king** — automation saves time, but it can't produce good content for you.
3. **Let data speak** — checking the data report daily is 100x more important than blindly operating.

---

## 07. Closing

**Which part of account operations gives you the biggest headache?**

Writing captions? Engagement? Data analysis?

Tell me in the comments, and I'll write a dedicated article about whatever you need most.

---

**If this was useful, please give it a like to show your support.**

Want to learn more AIOS tricks? Follow [rexai.top](https://rexai.top). I'll keep sharing AI automation real-world cases.

**Next article preview: How to manage 10 Xiaohongshu accounts simultaneously without getting banned, using AIOS.**
