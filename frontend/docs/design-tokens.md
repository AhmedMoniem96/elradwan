# Design tokens

This project uses a small token system in `ThemeContext.jsx` to keep visual rhythm consistent across pages.

## Radius

- `control` = **10px**: use for inputs, list items, and buttons.
- `card` = **12px**: use for cards, tables, dialogs, and popovers.
- `chip` = **999px**: use only for pill-style chips.

Rule of thumb: keep control/card corners in the **8–12px** range.

## Spacing

- `page`: outer page gutters (`x`, `y`) and top/bottom page breathing room.
- `section`: vertical gap between major content blocks.
- `card`: inner card/panel content padding.
- `control`: compact spacing for dense controls (table/list row padding, small stacks).

Always prefer `theme.customSpacing` tokens in layout components (`PageShell`, `SectionPanel`, app shell container) before hard-coded spacing values.

## Elevation

Use only three levels:

- `none`: flat surfaces and contained buttons.
- `cardShadow`: default elevation for card-like surfaces (cards, tables, popovers, dialogs, auth panels).
- `hoverShadow`: optional hover state for interactive card surfaces.

## Color

- `palette.background.default`: application canvas.
- `palette.background.paper`: surface base.
- `palette.divider`: all neutral borders/strokes.
- `palette.primary.main`: main call-to-action color.
- `palette.text.primary` / `palette.text.secondary`: readable hierarchy.

For borders and neutral fills, avoid ad-hoc hex values when an existing palette token can be used.
