---
title: "AIOS TUI Refactor: Modern Terminal UI with React Ink"
description: "AIOS migrated its TUI installer from manual string rendering to a React Ink + Ink UI component architecture, improving both the interactive experience and code maintainability."
date: 2026-04-02
tags: [AIOS, TUI, Ink, React, Terminal, Onboarding]
---

# AIOS TUI Refactor: Modern Terminal UI with React Ink

The previous TUI installer used manual string concatenation to render the interface — high maintenance cost and a basic interactive experience. This refactor migrates it to a **React Ink + Ink UI** component architecture, making terminal interaction more modern.

## Why Refactor

The old TUI implementation had several problems:

- Manual ANSI string concatenation for colors and layout; changing one place easily broke others
- No real component abstraction; state management scattered across the codebase
- No routing concept; screen transitions written in a scattered way

Ink is a React renderer designed specifically for the terminal, enabling React component patterns for CLI interaction UIs. Combined with Ink UI's built-in components (`Select`, `TextInput`, `ConfirmInput`), development is greatly simplified.

## New Architecture

```
scripts/lib/tui-ink/
├── App.tsx              # MemoryRouter + Routes configuration
├── index.tsx            # render() entry point
├── hooks/
│   └── useSetupOptions.ts  # Shared configuration state
├── screens/
│   ├── MainScreen.tsx      # Main menu
│   ├── SetupScreen.tsx     # Setup configuration
│   ├── UpdateScreen.tsx    # Update configuration
│   ├── UninstallScreen.tsx # Uninstall configuration
│   ├── DoctorScreen.tsx    # Doctor configuration
│   ├── SkillPickerScreen.tsx # Skill picker
│   └── ConfirmScreen.tsx   # Execution confirmation
├── components/
│   ├── Header.tsx          # Top header bar
│   ├── Footer.tsx          # Bottom shortcut hints
│   ├── Checkbox.tsx        # Checkbox component
│   └── ScrollableSelect.tsx # Scrollable selection list
└── types.ts               # Shared type definitions
```

### Route Navigation

Screen switching is managed via `react-router`'s `MemoryRouter`:

```
/ (MainScreen)
  → /setup
  → /update
  → /uninstall
  → /doctor

/setup → /skill-picker?owner=setup
/setup → /confirm?action=setup

/skill-picker → Return to previous screen
/confirm → Execute → Show result → Return to main menu
```

### State Management

The `useSetupOptions` hook provides global configuration state shared across screens:

```typescript
interface SetupOptions {
  components: {
    browser: boolean;
    shell: boolean;
    skills: boolean;
    superpowers: boolean;
  };
  wrapMode: 'all' | 'repo-only' | 'opt-in' | 'off';
  scope: 'global' | 'project';
  client: 'all' | 'codex' | 'claude' | 'gemini' | 'opencode';
  selectedSkills: string[];
}
```

### Custom Components

Ink UI's `Select` does not support scrollable window mode, so `ScrollableSelect` was implemented:

- Keyboard ↑/↓ navigation
- Space to select
- Grouped display (Core / Optional)
- Skill descriptions and installed markers

## Dependencies

```bash
npm install ink @inkjs/ui react react-router
```

- `ink` 4.x — React renderer for terminal
- `@inkjs/ui` — Built-in interactive components
- `react` 18.x + `react-router` 7.x

Node version: project requires `>=22 <23`; Ink 4.x supports Node 18+, fully compatible.

## Visual Effects

- Current item: bold + cyan color
- Installed marker: green `(installed)`
- Description text: gray `dimColor`
- Group headings: yellow or inverse
- Error/success: red/green

## Compatibility

Non-interactive mode (no TTY) maintains the original CLI argument mode:

```bash
aios setup --components browser,shell --scope global
aios update --client codex
aios doctor
```

The entry point detects TTY and automatically invokes the Ink version.

## Related Links

- Ink docs: <https://github.com/vadimdemedes/ink>
- Ink UI docs: <https://github.com/vadimdemedes/ink-ui>
- Design doc: `docs/superpowers/specs/2026-04-02-ink-tui-design.md`
- Implementation plan: `docs/superpowers/plans/2026-04-02-ink-tui-refactor.md`
