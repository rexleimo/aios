---
name: frontend-design
description: Build production-grade frontend UI with distinctive design. Use AFTER establishing design direction — if no DESIGN.md exists, invoke `awesome-design-md` first to create one, then use this skill to implement. For web components, pages, landing pages, dashboards, React components, HTML/CSS layouts, or styling any web UI.
license: Complete terms in LICENSE.txt

installCatalogName: frontend-design
clients: [codex, claude, gemini, opencode, hermes, workbuddy, pi, zcode, qoder]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [general, frontend, design, ui, essential]
repoTargets: [codex, claude, gemini, opencode, hermes, workbuddy, pi, zcode, qoder]
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Read the project's contracts first

Before writing code, look for and read these files at the project root, if they exist:

- **`DESIGN.md`** — the visual language (palette, type, spacing, component shape). If it exists, follow it; do not substitute your own taste for it. If it does not exist and the user has no design direction, invoke `awesome-design-md` first.
- **`MOTION.md`** — the motion contract (durations, curves, enter/exit order, loop seams, cursor causation, reduced-motion coverage). It is a separate owner from `DESIGN.md` on purpose: visual language and timing are judged differently. Anything that animates is in scope; follow it, and run its stated gate before claiming the UI is done.

A `DESIGN.md` you never read is drift, not a decision. Naming it in this skill's description does not mean the implementation honoured it.

### If this project ships the AIOS motion material

When `MOTION.md` exists, it names companion material. **Ask the command whether it is installed; never assume either way.**

```bash
node scripts/check-motion-kit.mjs        # exit 0 = present and unmodified
node scripts/check-motion-kit.mjs --json # also lists what is deliberately absent
```

Three measurements decide how you build, and guessing any of them produces a plausible-looking page built on a false premise:

| The command says | What you may use |
|---|---|
| `verified` | The reference texts in `vendor/stageshow/references/` (vertical rhythm, framing, choreography, loop seams, cursor causation) and the frame recorder `vendor/stageshow/scripts/jumps-core.mjs`. **Read the reference for the problem in front of you, not all 16.** They are the source of the rules `MOTION.md` states, with the reasoning intact. |
| `ABSENT` / `DAMAGED` | Nothing from `vendor/`. Do not write code that imports it, and do not silently proceed as if you had design guidance — say the material is missing and what it costs. |

**The kit components are not part of this material, and no command will install them.** The upstream `kit/` is React; projects that ship the reference texts here may be static CSS, Astro+Tailwind, or single-file HTML with no React at all. Before writing a component that assumes `Stage`, `Window`, `Phone` or any `kit/parts` export, check the project's dependency manifest. If React is not there, build the shape in the project's own CSS by following the reference text — that is the intended path, not a degraded one.

### Before claiming the UI is done

Run the gates `MOTION.md` states, and quote their output. In a project that ships them:

```bash
node scripts/check-motion-contract.mjs    # declaration-level
node scripts/check-motion-frame.mjs --page <the page you changed>  # frame-level
```

The second one only means something if it measured elements: a `clean` line without a frame count is not evidence. If it exits 3 because no browser is available, report that the frame check was skipped — **a skipped frame check is not a passed frame check**, and saying otherwise is the specific failure this section exists to prevent.

Anything that steps by design (typewriter text, digit rolling, cursor hops) must carry `data-snap` or `data-typing`, or the frame gate reports it as a jump. That is not a false positive to argue with; it is the contract's way of asking you to declare intent.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.
