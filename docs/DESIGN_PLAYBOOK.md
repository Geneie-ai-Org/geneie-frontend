# Geneie design playbook (distilled from the installed design skills)

Sources, surveyed in depth: the taste pack (`design-taste-frontend` + references, `redesign-existing-projects`, `stitch-design-taste`,
`minimalist-ui`, `high-end-visual-design`, `industrial-brutalist-ui`), the UX pack (`ui-ux-pro-max`: quick-reference, 119 UX guidelines,
shadcn stack rows, style/colour/typography data) and the design plugin skills (accessibility-review, design-system, design-critique,
ux-copy, frontend-design). This file keeps only what applies to a **dense app** and resolves conflicts.

**Order of authority:** 1) the reference frames (`docs/REFERENCE_SPEC.md`) set the LOOK; 2) this playbook sets QUALITY; 3) the skills'
own text is for lookup. Where they conflict, the reference wins. Tuning dials (taste pack): **variance 2, motion 3, density 7**.

## A. Principles (ranked)
1. **Colour is a role, never decoration.** Tokens only (`--background/--card/--muted/--border/--primary/--signal/--brand-*` + status pairs).
   One gray family. One accent: the muted pastel teal (`--brand-*`; `--signal` is the same hue for links and the focus ring). Used for selection, progress and the one primary action (`--brand-solid`); status colours carry meaning only.
2. **Hierarchy by size, weight and space.** Max 5 type sizes per screen; muted text is the same face in `--muted-foreground`, never lighter weight.
3. **Pills and hairlines, not heavy borders.** Actions, tabs, chips and statuses are pill shapes you can see the edge of (1px hairline `--wb-line`). Surfaces are white cards on the faint teal-gray canvas (`--wb-bg`). No shadow at rest; shadow only on floating layers (menus, popovers, dialogs) and the composer. No gradients, glass, noise, glow.
4. **Cards group related things.** One level of card (`.wb-card`), no card inside a card; inside a card separate with `divide-y`, a tinted inset or space.
5. **Every surface has every state:** default, hover, focus-visible, pressed, disabled, loading, empty, error, success. Skeletons match content size.
6. **Motion answers a user action.** Never on typing/keyboard-heavy actions; reduced-motion honoured; only `transform`/`opacity`.
7. **Honest status.** One vocabulary (queued, running, done, failed); never a spinner next to a contradicting label; colour always paired with text/icon.

## B. Numbers to use (do not invent new ones)
- **Type** (Geist): 12 meta · 13 chrome/UI/muted floor · 14 secondary body · 15 thread reading text · 18 section title · 28 empty-state headline.
  Leading 1.45–1.65 for prose, 1.25 for UI. Weights 400/500/600 only. `font-variant-numeric: tabular-nums` on every number column, count and timer.
  Mono (`--font-mono`) only for sequences, IDs, HGVS, file names in data views; mono 12–13px.
- **Spacing:** 4pt scale (4, 8, 12, 16, 24, 32). Rows: rail 32, lists 32, results table 28, admin tables 36. Panel padding 12–16. Thread column max 48rem.
- **Radius:** controls 8 · surfaces/cards 12 · code/result cards 10–12 · composer 24 · chips/avatars full. Inner elements are tighter than containers.
- **Borders:** 1px `hsl(var(--border))`; strong border only on input hover/focus. Dividers inside lists/tables are lighter (`--border-subtle`).
- **Shadows:** composer `--shadow-composer`; menus/popovers `--shadow-md`; dialogs `--shadow-lg`. Nothing else.
- **Focus:** `:focus-visible` 2px ring, 2px offset, ≥3:1 against its background; never `outline:none` alone. Sticky bars must not hide a focused control (`scroll-padding`).
- **Targets:** web minimum 24×24 CSS px hit area (WCAG 2.2); on `pointer: coarse` 44px. Keep 8px between adjacent small targets.
- **Contrast:** text ≥4.5:1, large text ≥3:1, icons/borders/focus ≥3:1. Check muted-on-muted and placeholder text; dark mode is tonal steps, not inverted colours; never `#000`/`#fff` text.
- **Motion tokens:** press 120–140ms · hover/colour 150–180ms · menus/popovers 150–200ms (scale from 0.96 at the trigger origin, never from 0) · dialogs/sheets 200–250ms ·
  exits ≈70% of entrance · ease-out `cubic-bezier(.22,1,.36,1)` · never `transition: all` · no bounce/elastic · pulsing only for a real running state · stagger lists 30–60ms max.
- **z-index:** 0 / 10 / 20 (sticky) / 30 (menus) / 40 (drawers) / 50 (dialogs) / 60 (toasts) / 70 (tooltips). No ad-hoc values.

## C. Component rules (testable)
**Rail.** Active row = soft fill + weight (never colour alone); every item icon + label; collapsed rail keeps labels in DOM with tooltips on hover AND focus;
collapse control is a button with `aria-expanded`; inert/hidden content leaves tab order; destructive actions spatially separate and confirmed;
keyboard: Up/Down moves, Enter opens; titles that truncate have a full-text path (tooltip/`title`); virtualise ≥50 rows; restore scroll/filter state on return.
**Thread.** Stream rather than spin; label AI content; regenerate/copy available by keyboard; `overflow-wrap:anywhere` on IDs/HGVS; never clamp errors; message text 15px/1.65;
status line "Working… 12s · step" is one quiet line; announcements via one `role=status` region as full phrases.
**Composer.** Input always visible; accessible name on textarea and icon buttons; send disabled while empty and shows loading/stop while running; placeholder explains a block
and a text link gives the next action; mode control is a native button with `aria-pressed`/menu semantics; 32px controls; no layout shift on state change.
**Tabs / workbench.** ARIA tabs: `role=tablist/tab/tabpanel`, roving tabindex, Left/Right/Home/End, Delete closes closable tab, `aria-selected`, `aria-controls`/`aria-labelledby`;
close buttons ≥24px hit area with accessible name; overflow handled by scroll or an overflow menu; "+" is a real menu (focus moves in, Up/Down, Escape returns focus);
avoid nested scroll regions; remember open tabs and active tab per conversation (try/catch storage).
**Data table.** Semantic `<table>`; sticky header and gutter; sortable headers expose `aria-sort`; numbers right-aligned + tabular; text left; truncation with a keyboard-reachable full value;
filter chips wrap (never clip) and each has "Remove X"; virtualise ≥50 rows (500-row cap is acceptable); "Showing first N of M"; empty/no-results/error-with-retry states; horizontal scroll inside the table only.
**Filters / forms.** Label above control (never placeholder-only); helper text in markup; validate on blur not every keystroke; error below field, `aria-describedby`, `aria-invalid`; after a failed
submit focus an error summary; required marked with the word "Required"; numeric ranges use `inputmode` and show min/max; Enter applies; reuse values already entered; read-only visually ≠ disabled.
**Dialogs / wizards.** Title states the action and count; body states consequences; buttons are verbs ("Delete 3 files" / "Keep files"), never OK/Cancel/Submit; Esc closes; focus trapped and returned;
confirm before discarding unsaved input; wizards show "Step 2 of 3", allow Back, keep entered values; long forms are a workspace tab, not a modal.
**Status / progress.** Progress bars have `role=progressbar` + value + text; durations in tabular nums; failure = what happened + why + next step + Retry; destructive stop has an inline confirm;
undo toast for reversible bulk actions; toasts 3–5s, polite, never steal focus.
**Empty / loading / error.** Empty = what this is + why empty + one action. Loading = skeleton matching dimensions (no layout jump), spinner only for <1s unknown waits. Error never apologises, never vague.

## D. Copy (ux-copy)
Sentence case. Verb-first buttons, one verb per intent through a flow ("Run annotation" -> toast "Annotation started"). No "Oops", no exclamation marks in success, active voice, name things as users do.
Numbers: thousands separators, units adjacent, ranges "0.0023 to 0.9995", durations "1m 24s". No emoji in UI chrome.

## E. Ignore list (do NOT apply to the app)
Marketing: hero/CTA rules, scroll-reveal/parallax/shutter, bento grids, py-24+ section gaps, imagery floors, GSAP pinning, AIDA, FAQ accordions, logo walls, serif display headlines,
double-bezel / 2rem+ radii / floating glass nav, pill buttons with nested icon circles, "variance mandate", gradients/noise/grain/glow/neon, ambient blobs, uppercase wide-tracked badges.
Native/mobile: 44pt as a universal target, safe areas, Dynamic Type, haptics, swipe, pull-to-refresh, bottom nav, 16px mobile body, 375/landscape testing (mobile is deferred).
Look conflicts: bans on Inter/Lucide (the reference products use similar), brutalist zero-radius/ASCII/scanlines, "no hairlines" (we use hairlines), 1200px container (we use full-bleed panes), pill buttons (we DO use pills; only the nested icon-circle pill is ignored).

## F. Pre-delivery checklist (run on screenshots + code, light AND dark, desktop)
- [ ] Contrast measured for every text/background pair incl. muted and placeholder; icons/borders ≥3:1.
- [ ] Tab through the whole screen: visible focus everywhere, logical order, no trap, sticky UI never covers focus.
- [ ] Every icon-only button has an accessible name; state is exposed (`aria-pressed/expanded/selected/sort`).
- [ ] Active/selected/sorted/error states are not colour-only.
- [ ] One primary action per view; secondary is outline; destructive is outline-red until confirmed.
- [ ] Exactly the allowed type sizes, spacing scale, radii, one elevation scale; no raw hex/rgb in JSX; no `transition: all`.
- [ ] Every async surface shows skeleton, empty, error+retry, success; no layout shift.
- [ ] Long IDs/names wrap or truncate with a full-text path; chips wrap; table scrolls inside its own container.
- [ ] Motion only transform/opacity, tokens above, reduced-motion respected, nothing blocks input.
- [ ] Copy follows section D. No other company's product name anywhere in code, comments, docs, commits or filenames.
- [ ] Critique pass (`design:design-critique` questions): first impression, usability, hierarchy, consistency, accessibility; fix Critical and Moderate before reporting.

## G. v1.2 system (supersedes any older "flat, no borders" wording above)
**Look.** Pill shapes for every action, tab, chip and status; white hairline cards on the faint teal-gray canvas; deep muted teal for the single primary action per view; teal tint for "selected"; status colours only for meaning.
**Where it lives.** Tokens `src/design/tokens.css` (`--brand-50..700`, `--brand-solid`, `--wb-bg/--wb-card/--wb-line/--wb-line-strong/--wb-pill`, `--signal` = brand teal). Classes `src/design/workbench.css`: `.wb-card`, `.wb-card-title`, `.wb-chip[data-tone=brand]`, `.wb-status[data-state=done|running|failed|pending]`, `.wb-row`, `.wb-track/.wb-fill`, `.wb-iconbtn`, `.wb-tab/.wb-tab--slide/.wb-tab-pill`, `.wb-pop/.wb-rise/.wb-fade`. The shared `Button`, `Badge`, `Input`, `SelectTrigger` become pills automatically inside `.chat-shell-right`, `.wb-scope` (put it on a page root) and every dialog, alert dialog, sheet, popover, dropdown and select.
**Interactions** (`src/components/motion`): `CountUp`, `StageMark`, `Collapse`, `Turn`, `ChipList`/`PopIn`, `SelectionMarker`, `StateButton` (idle to running to done morph), `CopyButton`, `HoldButton` (hold to confirm; use for destructive actions), `undoToast`, `Dismissible`, `useDoneFlash`. Rules: 120-250ms, opacity/transform/height only, springs only for chips, markers and pills, nothing bounces more than once, reduced motion renders the final state, never animate typing or keyboard-heavy actions.
**Destructive actions** always get a confirm: `HoldButton` (preferred) or a dialog whose confirm is a `HoldButton`; reversible removals get `undoToast`.
**Screens** need light AND dark checks, every state (default, hover, focus-visible, pressed, disabled, loading, empty, error, success), and `npm run build` must pass.
