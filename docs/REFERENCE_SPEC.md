# Reference spec: agent-workbench look (measured from real product frames)

Reference frames (outside the repo, view them with the image Read tool before you design):
`refs/` (local reference frames, not in the repo)
- `codex-proactive-teammate-v2-t12.png`  thread + composer, full width
- `codex-data-analysis-fraud-spike-t12.png`  window chrome, thread left, tabbed pane right (Summary | Browser), cards
- `codex-draft-prds-from-slack-linear-docs-t4.png`, `...-t12.png`, `codex-data-analysis-fraud-spike-t4.png`
- `cursor-sZQK9g-t14.png/.jpg` (and -t3/-t8/-t22/-t30): rail, thread, composer, right pane with tabs + file tree
- `cursor-agent-tabs.png`: several chats side by side
- User screenshots on the Desktop: `Screenshot 2026-10-15 at 7.58.47 PM.png`, `7.58.51 PM`, `7.59.10 PM` (rail + thread + right pane) and
  `8.00.32 PM` (left tree + thread + right pane). IGNORE whatever product is shown inside their right-hand panes.

## Look in one paragraph
White page. A light neutral rail on the left. Small type (13px chrome, 15px reading text). Hairline borders and soft fills,
no cards inside cards, no accent-coloured fills. The thread is flat prose; the only boxed things are the user prompt,
result cards ("N files changed"), code blocks and the composer. One interactive blue for links and selection.
A single orange label marks an elevated mode. Status is a quiet gray line ("Worked for 1m 24s >").

## Tokens (already in `src/design/tokens.css`; use them)
- Page `--background` white; rail `--sidebar` #F4F4F2; hover row `--bg-surface-hover`; hairline `--border`.
- Text `--text-primary` #171717, `--text-secondary` ~#555, `--text-tertiary` ~#787878.
- Links/selection `--signal` blue (hsl 211 80% 42%) via `text-[hsl(var(--signal))]` / `var(--accent-teal)`.
- `--bubble-user` soft blue user bubble, `--perm-warn` orange mode label, `--diff-add` / `--diff-del`,
  `--composer-radius` 24px, `--shadow-composer`, `--row-h` 32px, `--row-radius` 8px.
- Primary button = ink (`bg-primary`), small; the send button is a dark filled circle (32px).

## Anatomy to reproduce
**Rail (280px, collapsible to 52px).** No logo block. Rows, 32px high, 13px: `New chat` (icon + label + `⌘N` hint right-aligned, gray),
`Search`. Then groups with tiny 11-12px gray labels; each session row = small leading icon/dot (status), truncated title, and a
muted time-ago or cloud/branch icon on the right shown on hover. Active row = soft gray fill, radius 8, no border-left. A `More`
row at the end of a long group. Footer pinned: avatar + name + org on the left, filter and settings icons on the right.

**Thread header (44px).** Left: sidebar toggle, back/forward chevrons (optional), compose icon. Center-left: title (13px, medium)
followed by a muted project/file name; right: `…` menu and the workspace toggle (panel icon). No bottom border unless scrolled.

**Thread body.** Content column max 48rem, centred; message text 15px / 1.65. Assistant = flat prose, bold lead-ins, bullet lists with
comfortable gaps, links blue underlined, inline code = mono 13px in blue-tinted gray chip. User prompt = right-aligned soft blue
bubble (`--bubble-user`, radius 18, max 80%) OR a white hairline card; use the bubble. Between steps a gray
`Worked for 1m 24s ›` line (chevron expands the step log), with a hairline under the final summary.
Code block = light gray rounded card (radius 10), tiny language label top-left, copy icon top-right, mono 13px.
**Result card** (use for "filter applied", "annotation finished", report ready): light gray rounded (radius 12) card, title row
`N variants in scope` + right-aligned `Undo ↩`, body row: label + `+x −y` style counts in `--diff-add/--diff-del`, chevron.

**Composer.** Centered under the thread, width = content column. Rounded 24px card, hairline + soft shadow. Placeholder 15px gray
(`Ask for follow-up changes`). Bottom row inside the card, 32px controls: `+` (ghost icon) · orange mode label with shield icon and
chevron (`Full access ⌄` pattern: use for Standard/Explore: Standard = neutral text, Explore = orange) · flexible space ·
model/effort chips as plain text with chevrons (`GPT-5.4 ⌄  Medium ⌄` pattern) · mic icon · dark circle send (arrow up).
Below the card, a quiet row with environment text (`Work locally ⌄` pattern) when relevant. No helper text boxes above the composer;
status goes in the result card or the gray line.

**Workspace (right).** Same height as the thread. Top strip 40px: tab pills with icon + label (`≡ Summary`, `⊕ Browser` pattern),
selected = light gray fill radius 8; right side: expand icon and panel-close icon. Under it a 36px context row
(back/forward/reload-style icon buttons + centred muted title, or breadcrumb). Content below fills the rest; lists use 28-32px rows.

## Do not
Cards inside cards. Gradient or colour fills for primary actions. Pill-shaped large containers. Emoji in UI chrome. Shadows beyond
the composer and menus. Anything above 15px in the thread except page titles. Name any other company's product in code, comments,
docs, commits or filenames.
