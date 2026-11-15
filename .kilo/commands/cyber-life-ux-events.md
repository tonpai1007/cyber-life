---
name: cyber-life-ux-events
description: >-
  UX/UI and event handling patterns for the Cyber-Life dashboard. Covers
  onboarding, keyboard shortcuts, motion preferences, canvas interactions,
  undo/time-travel, and accessibility patterns specific to this HUD.
metadata:
  category: development
  source:
    repository: 'local'
    path: .kilo/commands/cyber-life-ux-events.md
    license_path: null
    commit: null
---

# Cyber-Life UX/Events Skill

Event UX for the Cyber-Life HUD: keyboard shortcuts, motion preferences,
undo/time-travel, onboarding, accessibility, and mobile controls.

## Activation

Use when the user asks about UX, UI events, keyboard shortcuts, onboarding,
motion preferences, undo/time-travel, pattern preview, accessibility,
mobile controls, or visual feedback in Cyber-Life.

## Architecture

- **State**: `config` object in `src/App.jsx:80-90` controls all visual
  effects and system toggles.
- **Motion gate**: `motionEnabled = !reducedMotion` in `src/App.jsx:103`.
  All canvas effects check this before drawing.
- **History**: `historyRef` + `historyIndex` in `src/App.jsx:132-157`
  manage undo snapshots.
- **Reduced motion**: CSS `@media (prefers-reduced-motion: reduce)` in
  `src/index.css:592-599` plus JS listener in `src/App.jsx:96-101`.
- **Onboarding**: `showOnboarding` state + `sessionStorage` flag in
  `src/App.jsx:107-118`. Dismisses on first interaction.

## Patterns

### Keyboard shortcuts

Every shortcut in `src/App.jsx:189-219` calls `setKeyFlash(label)` to show
a centered HUD label. Use this pattern:

```jsx
const [keyFlash, setKeyFlash] = useState(null);

useEffect(() => {
  if (!keyFlash) return;
  const id = setTimeout(() => setKeyFlash(null), 500);
  return () => clearTimeout(id);
}, [keyFlash]);

// in handler:
setKeyFlash('LABEL');
```

CSS animation in `src/index.css:660-680`: `keyFlash` scales down and fades
over 0.5s.

### Motion-aware canvas effects

Wrap every expensive or motion-heavy canvas effect:

```jsx
if (config.effectName && motionEnabled) {
  // draw effect
}
```

Where `motionEnabled` comes from the `prefers-reduced-motion` media query.

### Undo/time-travel

1. Call `saveHistory()` before any mutating action (pointer up, pulse, wipe)
2. `saveHistory()` pushes a `Uint8Array` snapshot to `historyRef.current`
3. `undo()` decrements `historyIndex` and restores the snapshot

Limit: `MAX_HISTORY = 20` snapshots.

### Onboarding first-run

```jsx
const [showOnboarding, setShowOnboarding] = useState(
  () => !sessionStorage.getItem('cyber-life-visited')
);

useEffect(() => {
  if (!showOnboarding) return;
  const dismiss = () => {
    setShowOnboarding(false);
    sessionStorage.setItem('cyber-life-visited', '1');
  };
  window.addEventListener('pointerdown', dismiss, { once: true });
  window.addEventListener('keydown', dismiss, { once: true });
  return () => {
    window.removeEventListener('pointerdown', dismiss);
    window.removeEventListener('keydown', dismiss);
  };
}, [showOnboarding]);
```

### Pattern preview

Hovering a pattern button sets `hoveredPattern` state. A dedicated
`patternPreviewRef` canvas renders the pattern scaled to fit. See
`src/App.jsx:131-146` and `src/App.jsx:952-980`.

### Mobile controls

At `max-width: 600px` in `src/index.css:704-735`:
- Controls wrap with `flex-wrap: wrap`
- Buttons get `min-width: 70px` and larger padding
- Stats panel and header scale down
- Sidebar becomes full-width

## Anti-patterns

- Do NOT use `transition: all` on body or large containers
- Do NOT use `left` for sidebar animation; use `transform: translateX()`
- Do NOT set global `canvas { width: 100%; height: 100% }`; it breaks
  explicit pixel-dimensioned canvases
- Do NOT use `setInterval` for the simulation loop; use
  `requestAnimationFrame` with delta-time
- Do NOT store large arrays in React state; use refs for particles and
  history

## File references

- `src/App.jsx` — main component, all event handlers, canvas render loop
- `src/index.css` — all HUD styling, animations, responsive breakpoints
- `src/useLifeGame.js` — simulation loop, now rAF-based
- `src/ErrorBoundary.jsx` — class-based error boundary for canvas failures
- `src/main.jsx` — app entry with ErrorBoundary wrapper
