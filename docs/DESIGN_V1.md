# Geneie design v1 (local, `redesign/fe`)

Reference: Cursor and Codex desktop UIs (light, calm, content-first): left rail of sessions, a
conversation thread in the middle, a tabbed workspace on the right for everything that is not chat.

## Principles
1. **Chat is the thread. Work lives in the workspace.** Results, filters, pipeline state, QC and reports
   open in the right panel as tabs. They are never modals stacked on the thread and never cards wedged
   above the composer.
2. **One accent.** The newprod palette: blue in light, teal in dark (`--primary`) is the only brand colour: primary action, selected state, focus.
   Status colours (`--success/--warning/--error/--info`) carry meaning only and are never decoration.
3. **Hierarchy by size, weight and space, not colour.** Three text levels: primary, secondary, tertiary.
4. **Flat and hairline.** 1px borders, almost no shadow (shadow only for floating layers: menus, dialogs).
   No cards inside cards. Group with spacing and a divider first, a surface second.
5. **Progressive disclosure.** Required fields first; optional and expert fields behind "More details".
   Long lists (findings, panels) show the top few and a count.
6. **Status is a word plus a small dot**, never a spinner next to a contradicting label.
7. **Every async thing has three honest states:** working (with what), done, failed (with a reason and a
   next step). A failed request is never silent.
8. **Sentence case, plain words, no emoji.** Genomics terms stay exact; product copy stays short.

## Layout
```
| Rail 264 / 52 | Thread (max 46rem, centred) | Workspace 420–720 (default 520) |
```
- Rail: logo, New chat, search, sessions grouped Today / Previous 7 days / Older, each titled with the
  sample or the first question (never "New Conversation"), a status dot when a job is running; footer:
  account, notifications, usage.
- Thread header (48px): title, a status chip for the active job, workspace toggle.
- Composer: one rounded surface; attach (+), mode selector (Standard / Explore) INSIDE the composer
  toolbar, send. Helper text only when something blocks sending.
- Workspace tabs: Variants (filters + table), Panels, Pipeline, QC, Report, Files. Only tabs with content
  appear. Below 768px the workspace becomes a full-height sheet; the rail becomes a drawer.

## Tokens (`src/design/tokens.css`)
- Surface: `--background` page, `--card` raised, `--sidebar` rail, `--muted` fills.
- Text: `--text-primary|secondary|tertiary|disabled` (legacy names kept) or `text-foreground` /
  `text-muted-foreground`.
- Border: `border-border`, hairline; `--border-strong` for inputs on hover.
- Radius: controls 8px (`rounded-md`), surfaces 12px (`rounded-lg`), chips and pills full.
- Type: Geist Variable. 13px for dense UI, 14px body, 16px page titles; weights 400/500/600 only.
  Mono (`--font-mono`) for ids, HGVS, genomic coordinates, file names in data views.
- Control height: 28 (dense), 32 (default), 40 (touch/primary). Minimum touch target 44px on mobile.
- Motion: 120–200ms, ease-out for entering, never on layout properties except the shell grid.
  Respect `prefers-reduced-motion`.
- Focus: 2px primary-coloured ring at 55%. Never remove it.

## Rules for components
- Use tokens (`bg-background`, `text-muted-foreground`, `border-border`, `bg-primary`) or the legacy
  `var(--bg-surface)` etc. **No new hex values in JSX.** Status colours come from `--success` etc.
- Buttons: one primary per view; secondary is outline; tertiary is ghost. Destructive is outline-red,
  filled only inside a confirm.
- Modals only for confirm and for short focused forms (<= 6 fields). Anything longer is a workspace tab
  or a stepper in the workspace.
- Tables: 36px rows, sticky header, tabular numbers, sort/filter in the header, column picker, density
  toggle, row hover, keyboard navigable.
- Empty states say what the area is for and give one action. Error states say what happened and what to do.
- Forms: label above, helper below, required marked with a text "Required" (not a red star), errors inline.

## Constraints
- Local only. Nothing is pushed. Keep behaviour and API calls unchanged; this is presentation and
  interaction structure. Business logic (`src/hooks`, `src/services`, `src/lib`) is not redesigned.
- No Claude Artifacts. No secrets in files. No patient data in screenshots or logs.
