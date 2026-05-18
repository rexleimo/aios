---
title: Superpowers
description: Reusable skills that automate common workflows — brainstorming, planning, debugging, verifying, and more.
---

# Superpowers

**Superpowers are like shortcuts for common coding tasks.** Instead of figuring out how to approach a bug fix or a new feature from scratch every time, invoke a skill and let it guide your agent through a proven workflow.

Think of them as "recipes" — each one knows the best way to handle a specific type of task.

## The Skills

### Starting New Work

<div class="skill-grid">
  <div class="skill-card skill-card--start">
    <div class="skill-card__header">
      <div class="skill-card__icon">💡</div>
      <div class="skill-card__name">brainstorming</div>
    </div>
    <div class="skill-card__desc">
      <strong>Before you write any code.</strong> This skill helps you explore the problem, ask the right questions, and choose the best approach before committing to an implementation.
    </div>
    <div class="skill-card__example">"Use brainstorming to figure out how to build this feature"</div>
  </div>
  <div class="skill-card skill-card--start">
    <div class="skill-card__header">
      <div class="skill-card__icon">📝</div>
      <div class="skill-card__name">writing-plans</div>
    </div>
    <div class="skill-card__desc">
      <strong>Turn a vague idea into a step-by-step plan.</strong> Break down requirements, identify dependencies, and create a clear roadmap before coding starts.
    </div>
    <div class="skill-card__example">"Use writing-plans to break this requirement into steps"</div>
  </div>
</div>

### Fixing Bugs & Ensuring Quality

<div class="skill-grid">
  <div class="skill-card skill-card--debug">
    <div class="skill-card__header">
      <div class="skill-card__icon">🔍</div>
      <div class="skill-card__name">systematic-debugging</div>
    </div>
    <div class="skill-card__desc">
      <strong>Fix bugs with evidence, not guesswork.</strong> Gather symptoms, form a hypothesis, test it, and verify the fix actually works.
    </div>
    <div class="skill-card__example">"I found a bug — use systematic-debugging"</div>
  </div>
  <div class="skill-card skill-card--debug">
    <div class="skill-card__header">
      <div class="skill-card__icon">✅</div>
      <div class="skill-card__name">verification-before-completion</div>
    </div>
    <div class="skill-card__desc">
      <strong>Never say "done" without proof.</strong> Run the tests, check the output, and confirm everything actually works before claiming success.
    </div>
    <div class="skill-card__example">"Use verification-before-completion before finishing"</div>
  </div>
</div>

### Working At Scale

<div class="skill-grid">
  <div class="skill-card skill-card--efficiency">
    <div class="skill-card__header">
      <div class="skill-card__icon">⚡</div>
      <div class="skill-card__name">dispatching-parallel-agents</div>
    </div>
    <div class="skill-card__desc">
      <strong>Do multiple things at once.</strong> Split independent tasks across parallel agents, aggregate results, and handle failures gracefully.
    </div>
    <div class="skill-card__example">"Use dispatching-parallel-agents to handle these in parallel"</div>
  </div>
  <div class="skill-card skill-card--efficiency">
    <div class="skill-card__header">
      <div class="skill-card__icon">👥</div>
      <div class="skill-card__name">team-ops</div>
    </div>
    <div class="skill-card__desc">
      <strong>Monitor your agent team.</strong> View real-time status, track outcomes, and find improvement opportunities.
    </div>
    <div class="skill-card__example">"Check the team-ops monitoring dashboard"</div>
  </div>
</div>

### Security

<div class="skill-grid">
  <div class="skill-card skill-card--security">
    <div class="skill-card__header">
      <div class="skill-card__icon">🔒</div>
      <div class="skill-card__name">security-scan</div>
    </div>
    <div class="skill-card__desc">
      <strong>Check for security issues.</strong> Scan your configuration for exposed secrets, unsafe settings, and potential vulnerabilities.
    </div>
    <div class="skill-card__example">"Run security-scan on the config"</div>
  </div>
</div>

## How To Use Skills

You don't need to memorize skill names. Just describe what you want to do, and your agent will pick the right skill:

```
You: "I need to debug this error — the login page crashes when I click submit"
Agent: *activates systematic-debugging skill*
       1. Gather error symptoms...
       2. Form hypothesis...
       3. Test fix...
       4. Verify it works
```

You can also explicitly invoke a skill by name:

```
"Use brainstorming for this feature"
"Use writing-plans to plan the migration"
"Use systematic-debugging for this error"
"Run verification-before-completion before we commit"
```

## Which Skill Should I Use?

| Situation | Skill |
|---|---|
| "I have an idea but don't know where to start" | `brainstorming` |
| "I know what to build but need a plan" | `writing-plans` |
| "Something is broken" | `systematic-debugging` |
| "About to finish — make sure it actually works" | `verification-before-completion` |
| "Multiple independent things to do" | `dispatching-parallel-agents` |
| "Need to check security" | `security-scan` |

## RL Training System

AIOS includes a multi-environment reinforcement learning system. It trains a shared student policy using a unified control plane across shell, browser, and orchestrator tasks.

For details, see the [Architecture page](architecture.md#rl-training-layer-aios).

## Where To Go Next

- [Case Library](case-library.md) — real-world examples of skills in action
- [ContextDB](contextdb.md) — how skills interact with project memory
- [Agent Team](team-ops.md) — multi-agent collaboration details
