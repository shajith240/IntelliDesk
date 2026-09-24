# IntelliDesk design tokens (Rev. 3)

Source of truth: `src/app/globals.css`. Rev. 3 replaces the Rev. 2 "Walnut / Brass" dark palette with an
Atlassian-aligned system so the product reads like the tools support teams already use every day (Jira, Jira
Service Management): neutral surfaces, blue for interaction, and a fixed meaning for every semantic color.

## How tokens work

- Each token is an HSL triplet on `:root` (light) and `.dark` (dark), e.g. `--primary: 215 90% 47.1%`.
  Use it with alpha as `hsl(var(--primary) / 0.5)`.
- `@theme inline` maps tokens to Tailwind utilities (`bg-primary`, `text-subtle`, `border-border-bold`, ...).
- Dark mode is class-based. `next-themes` sets `.dark` on `<html>`; `@custom-variant dark` makes `dark:` follow it.
- Components use token utilities only. Raw hex values, Tailwind palette colors (`slate-*`, `blue-500`),
  gradients, and glows are not used.

## Roles

| Role | Utilities | Use |
| --- | --- | --- |
| Surfaces | `bg-background`, `bg-sunken`, `bg-raised`, `bg-overlay` | Page, sidebar/wells, panels, menus/dialogs |
| Text | `text-foreground`, `text-subtle`, `text-subtlest`, `text-on-bold` | Primary, secondary, meta, text on solid color |
| Borders | `border-border`, `border-border-bold` | Hairlines; inputs and strong dividers |
| Neutral fill | `bg-fill`, `bg-fill-hover`, `bg-fill-pressed` | Default buttons, chips, hovered rows |
| Brand | `bg-primary`, `bg-primary-hover`, `text-primary`, `bg-selected`, `text-selected-foreground` | Primary actions, links, current nav item, selected rows |
| Focus | `ring` (global `:focus-visible` outline) | 2px outline, 2px offset, on every focusable element |
| Blanket | `bg-blanket` | Backdrop behind dialogs and sheets |

## Semantic colors

Each has a bold value, a `-subtle` background, and a `-text` foreground that meets contrast on the subtle background.

| Token | Meaning |
| --- | --- |
| `danger` | SLA breached, destructive actions, failed requests |
| `warning` | SLA at risk, needs attention |
| `success` | Resolved, SLA met, response sent |
| `info` | In progress, informational messages |
| `discovery` (purple) | Anything suggested by AI. AI output is always marked with this color plus a "Suggested by AI" label |
| `orange` | P2 priority, bronze tier |

## Priority

Priority is never shown by color alone. `PriorityIcon` pairs each color with a distinct shape.

| Severity | Label | Icon | Utility |
| --- | --- | --- | --- |
| P1 | Highest | double chevron up | `text-priority-highest` |
| P2 | High | chevron up | `text-priority-high` |
| P3 | Medium | equals | `text-priority-medium` |
| P4 | Low | chevron down | `text-priority-low` |

## Status (Jira status categories)

Rendered with `StatusLozenge`: uppercase 11px bold text in a 3px-radius lozenge.

| Status | Category | Appearance |
| --- | --- | --- |
| New | To do | grey (`bg-fill text-subtle`) |
| In Progress | In progress | blue (`bg-info-subtle text-info-text`) |
| Resolved, Closed | Done | green (`bg-success-subtle text-success-text`) |

## Shape, elevation, motion, type

- Radius: `rounded-sm` 3px (lozenges), `rounded-md` 4px (controls), `rounded-lg` 8px (panels), `rounded-xl` 12px (dialogs).
- Elevation: `shadow-raised` (cards, sticky headers) and `shadow-overlay` (menus, dialogs, sheets), navy-tinted in light mode.
- Motion: 100–150ms ease-out through `anim-overlay`, `anim-pop`, `anim-dialog`, `anim-sheet-*`, `anim-toast`.
  `prefers-reduced-motion` reduces every animation and transition to near zero. Motion never carries meaning on its own.
- Type: IBM Plex Sans for UI (14px / 20px body), IBM Plex Mono for ticket keys, timestamps and numbers, Fraunces reserved
  for the wordmark. All loaded with `next/font`.
- Spacing: Tailwind's default 4px scale, laid out on an 8px rhythm (32px controls, 40px table rows, 56px top bar).
