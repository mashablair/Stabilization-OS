# Balance OS — Design system

This document describes how we approach UI for Balance OS: tokens, patterns, and product intent. Implementation lives primarily in **Tailwind CSS v4** utilities and **`src/index.css`**.

---

## Product intent: data-dense, compact by default

Balance OS surfaces a lot of structured information (tasks, time, habits, reviews). The preferred density is **compact**: tighter vertical rhythm, smaller default padding on cards and rows, and fewer “hero” spacers so more content fits in view without feeling cramped. Despite being compact, the app is still elegant and aesthetic with beautiful colors and modern look and feel. The app purpose is to inspire, create a feeling of peace and calm by providing data and insights.

**Guidelines**

- Prefer **smaller type steps** for secondary copy (`text-xs` / `text-sm`) and **single-line summaries** where a second line was decorative.
- Use **tighter section spacing** (`space-y-3`–`space-y-5` on pages; avoid `space-y-8`+ unless there’s a strong reason).
- **Cards and tables**: favor `p-3`–`p-4`, `py-2` row padding, and `rounded-xl` / `rounded-lg` consistently.
- **Primary actions** stay obvious (gradient CTA, `font-bold`) even when surrounding chrome is compact.
- **Local-first editing** (draft on type, save on blur) supports dense forms without noisy spinners.

This is a **default aesthetic**, not a user-toggle: new screens should assume compact unless a flow truly needs breathing room (e.g. onboarding, empty states).

---

## Design tokens

Tokens are defined in **`src/index.css`** inside the Tailwind v4 **`@theme`** block. They map to Tailwind utilities (e.g. `bg-primary`, `dark:bg-card-dark`).

| Token / utility            | Purpose                                           | Value / notes                                             |
| -------------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| `--color-primary`          | Brand accent, links, selected states, focus rings | `#a855f7` → `text-primary`, `bg-primary`, `ring-primary`  |
| `--color-accent-pink`      | Gradient end / secondary accent                   | `#ec4899`                                                 |
| `--color-accent-start`     | Gradient start (deeper violet)                    | `#9333ea`                                                 |
| `--color-accent-end`       | Gradient end (pink)                               | `#ec4899`                                                 |
| `--color-background-light` | Light mode page background                        | `#f6f7f8` (also set on `body` in `@layer base`)           |
| `--color-background-dark`  | Dark mode base background                         | `#0f1419`                                                 |
| `--color-card-dark`        | Dark mode elevated surfaces                       | `#181f26`                                                 |
| `--color-border-dark`      | Dark mode borders                                 | `#2a343f`                                                 |
| `--font-display`           | Primary UI font                                   | `"Inter", sans-serif`                                     |
| `--breakpoint-nav`         | Nav layout breakpoint                             | `75rem` (1200px) — custom breakpoint `nav:` in Tailwind |

### CSS utilities (not `@theme` variables)

These are hand-authored in `index.css` and used across the app:

| Class                    | Role                                                       |
| ------------------------ | ---------------------------------------------------------- |
| `.bg-gradient-accent`    | Primary CTA / emphasis backgrounds (violet → pink, 135deg) |
| `.text-gradient`         | Gradient text (same angle as accent)                       |
| `.vibrant-gradient`      | Strong gradient fill                                       |
| `.vibrant-gradient-soft` | Soft tinted gradient (20% opacity stops)                   |

### Neutrals (Tailwind palette)

We rely heavily on **Slate** for borders, muted text, and light surfaces:

- Light: `slate-200` borders, `slate-500` / `slate-600` secondary text, `white` cards.
- Dark: `slate-700`–`slate-900` borders/surfaces, `slate-300`–`slate-400` secondary text; semantic tokens `card-dark` and `border-dark` where specified.

### Dark mode

Dark mode uses the **class strategy**: root gets `.dark` (see app settings). Components use paired classes, e.g. `bg-white dark:bg-slate-900`, `border-slate-200 dark:border-slate-800`.

Tailwind custom variant (in `index.css`):

```css
@custom-variant dark (&:where(.dark, .dark *));
```

### Icons

**Material Symbols** (outlined), configured via `.material-symbols-outlined` in `index.css` (`font-variation-settings`).

---

## Common UI patterns

- **Primary button**: `bg-gradient-accent text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90`
- **Secondary button**: `border border-slate-200 dark:border-slate-700` + hover surface bump
- **Focus**: `focus:ring-2 focus:ring-primary` on inputs where used
- **Page shell**: `max-w-[1200px] mx-auto px-6` is typical; vertical padding varies by page but should stay **compact** per above

---

## Habits-specific copy (information hierarchy)

On Habits, **consistency is primary; streak is secondary** — reflect that in labels and stats ordering, not only in README.

---

## Related docs

- **README** — feature overview and stack; [links to this file](./README.md#design) for visual/design conventions.
- **`src/index.css`** — source of truth for `@theme` tokens and global utilities.

### Future ideas (not implemented)

- A formal **`compact` / `comfortable` user setting** would require tokenizing spacing scale or a second `@theme` layer; today, compact is the single standard.
