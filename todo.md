# Target: newprod FE

Every TODO below is to be done on the `newprod` branch of geneie-frontend (branch off
`origin/newprod`). File paths and line numbers refer to `origin/newprod`.

## DONE — newprod: replace the Module 1 job card with main/dev's drawer stepper

Applied on `feat/newprod-ui-todos` (PR #226). `Module1PipelineStepper.jsx` is deleted; the
job renders through `PipelineDrawer` from the moment it is queued (ChatPage `showModule1Phase`
now covers active / artifacts / cancelled / stopping, and the drawer mounts for a FASTQ-only
conversation). The drawer header carries the GPU/CPU chip; `Module1RunLine` under the steps
shows the queue line or phase text with Switch to CPU and Leave queue / Stop run as quiet links,
and the confirm replaces that line (option A). `getModule1PhaseMessage` now drops backend text
that matches `INFRA_DETAIL_RE` and falls back to `MODULE1_PHASE_MESSAGES`.

Backend alignment checked against `bio-lab-project` `feat/newprod-baseline` (there is no
backend branch named `newprod`; that is the newprod line): `/api/module1/status` returns
`cancellable`, `switchable`, `compute`, `compute_preference`, `compute_reason`, queue fields;
`POST /api/module1/cancel/{id}` and `PATCH /api/module1/preference/{id}` match the frontend
calls. Not yet seen on a live run — check the queued, running, stopping and cancelled states on
the next FASTQ job. Still open: which branch geneie.chat deploys from.

Original entry:


Seen on geneie.chat 2026-10-16 while the EB_4_S2 run was staging: the Module 1 job
renders as a standalone bordered card above the composer — sample name + GPU chip,
"Running on GPU · GPU instance launching. · 3% · 17s", five circular nodes
(Queued / Staging / Aligning / Calling variants / Complete), and under them a large
mostly-empty inner panel whose only content is a "Stop run" button.

That card is `src/components/Module1PipelineStepper.jsx`, which exists only on
`origin/newprod` (mounted at `src/pages/ChatPage.jsx:1259` there). `main` and `dev` have
no such component: they render the Module 1 job inside `src/components/PipelineDrawer.jsx`
as the "Reads → VCF" phase, using `MODULE1_STEP_GROUPS` (the stage groups from
`src/lib/module1PipelinePhases.js` minus `complete`, which the pill itself stands for),
`PhaseMark` for node state, and `useRunTimer` for elapsed time.

Do: on newprod, drop `Module1PipelineStepper` and render the Module 1 job through
`PipelineDrawer` the way main/dev do now, so FASTQ→VCF and the downstream VCF analysis
show as one stepper.

Carry over from the newprod card before deleting it — main/dev's drawer has none of these:
- GPU/CPU chip and queue position (newprod `ChatPage.jsx:1244`) — keep exactly as they are.
- Leave queue / Stop run (newprod `useModule1Pipeline.js:666`, one endpoint for both) —
  keep the action, but NOT as the bordered box with a lone red button. Decided layout
  (option A, 2026-10-17): a quiet text link at the right end of the Reads → VCF status
  line; the inline confirm replaces that same line.

  ```
   ⟳ Reads → VCF   GPU   Aligning · 42%          6m 12s  ˅
     ✓ Queued ── ✓ Staging ── ● Aligning ── ○ Calling variants
     Aligning reads to the reference genome…          Stop run

   confirm:
     Stop this run? Progress is lost.        [Keep running] [Stop]

   queued:
     Queued · #3 in line — starts in ~4 min        Leave queue
  ```

  The link uses tertiary text color and turns `--error` only on hover/focus; no border,
  no panel. Escape / "Keep running" restore the status line. Focus returns to the link.

Also fix while here:
- The status line leaks infrastructure text ("GPU instance launching."). main's
  `INFRA_DETAIL_RE` in `module1PipelinePhases.js` only scrubs failure messages; apply the
  same rule to the running status, or show the `MODULE1_PHASE_MESSAGES` text instead.

Check first: CLAUDE.md says Vercel deploys geneie.chat from `main`, but this card exists
only on `newprod`, and geneie.chat's API calls go to `api-newprod.geneie.chat`. Confirm
which branch geneie.chat is serving now, and update CLAUDE.md if it changed.

Supersedes "Two visually different pipeline steppers" under Later, which describes
newprod's two components.

## MERGED into the first TODO (option A) — Stop run sits alone in its own box (bad UI/UX)

While a Module 1 run is going, the card shows a full-width bordered inner panel
(`mt-3 p-3 rounded-lg border`, `--bg-elevated`) whose only content is a right-aligned red
"Stop run" outline button. Newprod `src/components/Module1PipelineStepper.jsx`: panel at
~line 340 (`showQueuePanel || showRunPanel`), button at ~line 418.

Why it's bad:
- A whole bordered panel holds one button. It's mostly empty space, and it looks like
  content is missing.
- It's the biggest thing under the stepper, so a destructive action gets more visual
  weight than the run's progress.
- The red outline sits right under the progress, where it's easy to hit or misread.

Change: no standalone panel for the controls. Put Stop run / Leave queue in the card
header as a small, quiet control next to the collapse chevron (text button or icon plus a
tooltip, red only on hover and in the confirm step), and keep the existing inline confirm.
Show the panel only when it has real content: the queue note ("Your place is kept…") or
the "Switch to CPU now" offer. Never show it for the cancel button alone.

When doing the drawer migration in the entry above, put the control the same way
in `PipelineDrawer`'s Reads → VCF row, so it can't come back as a box.

## OBSOLETE once the first TODO lands — Stepper connector lines don't line up with the nodes

(Only `Module1PipelineStepper` has this; the drawer's step row is aligned. Revisit only if
the card survives.)

In the Module 1 card, each line between two steps sits below the middle of the
circles, roughly level with the top of the labels. Seen on geneie.chat 2026-10-16
(Queued → Staging → Aligning → Calling variants → Complete).

Cause: newprod `src/components/Module1PipelineStepper.jsx` ~lines 291–320. The row is
`flex items-center`, and each step is a column of a 20px circle (`w-5 h-5`) plus a label
(`gap-1`). `items-center` vertically centers the 1px connector (`flex-1 h-px mx-1`) on that
whole column, so the line lands between the circle and the label instead of at the
circle's middle.

Second problem: each column is as wide as its label, so the connectors aren't centered
between circles. The gap is lopsided wherever a label is longer than its circle
("Calling variants").

Fix: align the row to the top (`items-start`) and give the connector `mt-[10px]` (half the
circle height), so it runs through the circle centers. Put the labels in a separate
row or position them absolutely under each circle, so label width doesn't move the
nodes. Check this in the drawer migration too: `PipelineDrawer`'s `PhaseMark` row must
not have the same offset.

## TODO — Explore mode shows "Checking scope…" on every message, then refuses greetings

Seen on geneie.chat 2026-10-17 with Explore mode on: sending "hola" renders a monospace
trace line "▸ Checking scope…" (it later flips to "✓ Checking scope…"), then the answer
"Explore mode doesn't cover chit-chat. Switch to Standard mode to ask about chit-chat."

Where it comes from:
- Frontend (newprod): with `localStorage.geneie_exploratory_mode === 'on'`,
  `src/hooks/useChatMessaging.js:518` sends the turn to `POST /api/exploratory/stream`
  (`src/services/streamExploratory.js`). Any stream event type the handler doesn't know
  (`planning`, `verifying`, …) is pushed as a plain `step` trace line using the event's
  `label` (`useChatMessaging.js` ~line 597). `ChatPage.jsx:1753` renders `msg.trace` as the
  monospace log: `▸` while live, `✓` once done.
- Backend: `bio-lab-project` (`feat/newprod-baseline`) `main.py:3564` doesn't produce the
  text. It only proxies the SSE stream to `{EXPLORATORY_SERVICE_URL}/exploratory/stream`,
  the separate exploratory (Strands) service in the sidecar repo (`sc:`, deployed from its
  `newprod` branch).
- The string "Checking scope" and the refusal text appear nowhere in the backend or
  frontend repos, so both come from the exploratory service. It runs a scope gate first on
  every question, sends a step event labelled "Checking scope…", and sends a `refused`
  event when the gate classifies the message as out of scope; chit-chat is one of those
  classes. The frontend shows refusal text exactly as sent.
- Not verified: the sidecar repo isn't on this machine or reachable with this GitHub
  account. Confirm the event type and the gate's code there.

Huge gap between the trace line and the reply (asked 2026-10-17): while an Explore turn
streams, the thread renders TWO placeholders for one answer (newprod `ChatPage.jsx`):
1. the AI message itself (~1752–1845): the trace block (`margin-bottom: 8px`), then
   `<ChatMessage text="">`, which doesn't collapse when empty. It still renders an empty
   prose block plus its hover action row (`mt-1.5`, `opacity-0`, which hides the row but
   still takes up space, `ChatMessage.jsx:369`);
2. then, 32px lower (`space-y-8`), the separate `isCurrentlyActive` block (~1862) with
   `<ThinkingIndicator>` ("Aligning my reads 1s").
So "▸ Checking scope…" sits on top, then an invisible empty message, then the gap, then
the thinking indicator. When the refusal text arrives the indicator unmounts and the
empty message fills, so the finished turn is only 8px apart (measured live).
Fix: in Explore turns, don't render the separate ThinkingIndicator. The trace is the
progress UI, so show the live indicator inside the AI message (under the trace) only
until the first trace/answer event. Make `ChatMessage` render nothing, not even the
action row, while `text` is empty and streaming.

Problems:
- An internal guard step shows on every turn, including a simple "hi". It means nothing
  to a user.
- The finished line keeps its ellipsis ("✓ Checking scope…"), so it reads as still
  running.
- A greeting gets a refusal instead of a reply, and "ask about chit-chat" is awkward copy.

Fix (needs sidecar + FE):
- Don't emit, or don't render, the scope-gate step. If it stays, show it only when the
  gate takes long, and drop the ellipsis once it's done.
- Greetings / chit-chat in Explore mode: answer briefly (or hand off to the Standard
  GENERIC persona, `main.py` `generic_model()`) instead of refusing. Keep the refusal for
  genuinely off-topic requests, with better copy.

## DONE — Message Copy / Regenerate buttons are invisible until hover

Applied: the action row in `ChatMessage.jsx` no longer uses `opacity-0 group-hover:opacity-100`,
so it's always visible. It isn't rendered while the reply has no text yet. Tooltips open below
(`side="bottom"`), so they don't cover "Thought for…". Regenerate still shows only on the last
reply, as before. Checked locally.


Seen locally 2026-10-17. Under each AI reply the Copy (and Regenerate) buttons only show when
the pointer is over the message: `src/components/chat/ChatMessage.jsx:369` renders the row as
`opacity-0 group-hover:opacity-100`.

Problems:
- Touch devices have no hover, so on phone/tablet the buttons never show (they're still
  tappable, but invisible).
- Keyboard: Tab lands on an invisible button. Nothing reveals the row on focus.
- `opacity-0` hides the row but it still takes space. That's part of the gap in the Explore
  entry above.
- The tooltip opens upward and covers the "Thought for 2s" line.

Fix (decided 2026-10-17): the action row is always visible on every AI reply. No hover
reveal, so touch and keyboard users get it for free.
- Drop `opacity-0 group-hover:opacity-100` from the row at `ChatMessage.jsx:369`. Keep it
  quiet (tertiary icon color, hover background only) so it doesn't add noise.
- Keep `focus-visible` rings on the buttons.
- Open the tooltip below or to the side (`side="bottom"`), or put the Thought-for line on
  the same row as the buttons so nothing overlaps.
- While a reply is still streaming with no text yet, don't render the row (see the Explore
  gap entry).

## DONE (frontend) — Settings page, modelled on Qwen's settings

Replaces two earlier entries: "Tuning mode belongs in profile settings" and "Profile settings:
use the Claude / ChatGPT settings window pattern". On 2026-10-17 we went with Qwen's pattern
instead of a centred modal: a full page per section with its own URL, which leaves room for
plan/usage and a usage history.

Reference (chat.qwen.ai, read on 2026-10-17):
- The avatar menu has email, Upgrade Plan, Settings, Archived Chats, Customer Service and
  Log out.
- Settings is a full page at `/settings/<section>` with a "← Settings" header and a left
  rail: General, Usage & Billing, Interface, Models, Chats, Personalization, Account, About.
- Each section is a narrow centred column of rows (label left, control right, hairline
  between rows), with no cards.

Built on `feat/newprod-ui-todos` with frontend changes only. Everything uses endpoints that
already exist on `bio-lab-project` `feat/newprod-baseline`:
- Route `/settings/:section` (`src/pages/SettingsPage.jsx`), protected and behind the
  consent gate. Sections live in `src/components/settings/SettingsSections.jsx`; the row,
  switch and segmented primitives are in `SettingsUI.jsx`. On narrow screens the left rail
  becomes a scrolling tab row.
- General:
  - Theme: System / Light / Dark. `useTheme` now stores a preference and follows the OS
    for System; the boot script in `index.html` understands it too.
  - Chat mode: Standard / Explore (the existing `geneie_exploratory_mode` key).
  - Default analysis mode: Manual / Automatic. Stored in `geneie_default_analysis_mode`;
    both upload forms start on it.
- Plan & usage: plan badge, Upgrade (free plans, opens `SubscriptionPage`), the tracked
  meters from `useLimits`, and conversation / file counts from `GET /api/conversations`.
- Notifications: the two switches, on `GET/PUT /api/user/notification-preferences`.
- Integrations: NCBI API key — save, replace, remove (`GET/POST/DELETE /api/user/ncbi-key`;
  these existed in the backend but no screen used them).
- Account:
  - Email, name, sign-in method, member since.
  - Reset password, for password accounts only (Firebase reset email).
  - Sign out.
  - Delete account behind a typed DELETE confirmation. It calls `DELETE /api/account`, then
    tries Firebase `deleteUser`; if that needs a recent sign-in, it signs out instead.
- Tuning (admins only): the Tuning mode switch, now persisted in
  `geneie.tuning.active.v1`. When it's off the floating tuning pill doesn't render at all;
  the pill's own switch still turns it off. The admin panel, which changes plans for every
  user, is not part of Settings, since Settings is per-user. It is an "Admin panel" item in
  the sidebar avatar menu, shown to admins only.
- About: version, Terms, Privacy.
- The sidebar avatar menu's "Settings" now opens `/settings/general`. The old profile
  popover (`ProfileManagement.jsx`) is removed: its stats and notification switches moved
  into Settings, and Upgrade moved to Plan & usage.

Backend follow-ups (newprod), most useful first:
1. Account-level preferences: `PUT /api/user/preferences` for theme, chat mode and default
   analysis mode, so they follow the user across devices instead of living in one browser.
   This could extend the notification-preferences document.
2. Chats section (Qwen has one): delete all, export all, archive / unarchive. Only
   single-chat delete exists today (`DELETE /api/conversation/{id}`).
3. Usage history: `GET /api/usage/history` with one row per run (FASTQ → VCF, annotation,
   Exomiser) — date, sample, credit used. Qwen shows a credits history.
4. Account delete: `DELETE /api/account` erases the data but not the Firebase sign-in.
   Delete it server-side with the Admin SDK so the frontend doesn't depend on a recent
   sign-in.
5. Nice to have: per-user defaults for genome, capture BED and sequencing type to
   pre-fill the FASTQ form.

## DONE — Tuning mode: one place, opened from chat

Before: turning tuning on meant three hops (Settings switch → back to chat → floating pill →
Edit config). The pill floated over the drawer and composer. "Run comparison" silently used
the chat box text. In the editor, an empty value showed the baseline as placeholder text, so
it looked filled; Apply and save-on-blur competed; it opened on an off-screen key; and every
heading was the same uppercase grey.

Now (frontend only):
- An admin-only **Tuning** button in the chat header opens a panel docked on the right. The
  chat makes room for it instead of sliding under it (`--tuning-panel-width`). A badge counts
  the active changes. The open/closed state is persisted.
- Panel sections:
  - Your changes: each with Edit / Revert, plus Edit config.
  - Compare: its own question box, prefilled from the chat box, with Run comparison / Stop
    and ⌘/Ctrl+Enter.
  - Footer: Copy config, and Reset all (click twice to confirm).
- Editor:
  - Opens on the first listed key, or on the key you clicked Edit on.
  - One editor prefilled with the global value (option A, 2026-10-17). It replaced the
    global | yours columns and the "empty means global" state.
  - Edits save as you type. Text identical to global, or cleared, is not counted as a change.
  - "Show changes" switches to a line diff against the global value.
  - Footer buttons are Revert to global and Done.
  - Clearer heading hierarchy, and Changed / Unchanged badges.
- Compare columns are labelled "Global config" / "Your changes".
- Settings → Tuning is now one row with an Open button that takes you to chat with the panel
  open.
- Removed repeated headings and labels: the panel's visible "Question" label, the editor's
  "empty · uses global" counter, and the badge that repeated "Global config". In Settings,
  the Sign out and Delete account rows no longer repeat their own button text, and the Tuning
  row no longer says "tuning" three times.

Not done: comparisons still send `conversationId: null`, so they never use the open chat's
file. Passing the conversation would need a check that the compare endpoint doesn't save
messages into it.

## TODO — Annotation status shown 5 times in one card

Seen on geneie.chat 2026-10-17 while EB_4_S2 was annotating. The pipeline drawer says the
same thing in five places at once:

1. Header right: "Annotating…" — newprod `src/components/PipelineDrawer.jsx:418`.
2. Phase pill: "Annotated & ready" with a spinner and 48s — `PipelineDrawer.jsx:639`. The label
   says *ready* while it is still running, which is wrong as well as redundant.
3. Step chip: "● Annotation 48s" — same timer as the pill.
4. Detail line: "Annotation in progress…" — from `src/lib/variantPipelineUtils.js:60`
   (rewrites the backend's "ANNOVAR worker running").
5. Composer placeholder: "Clinical Annotation is running — chat will resume when annotation
   is complete…" — `src/pages/ChatPage.jsx:1371`. It also says "Clinical Annotation", a
   third name for the same step.

Fix: show the running state once, on the active step chip (spinner + timer). Then:
- The phase pill gets a neutral name ("Analysis") with no spinner of its own, or a label
  that changes with state ("Annotating…" while running, "Annotated & ready" only once done).
  Never show a "ready" label with a spinner.
- Drop the header-right status while a step chip already shows it.
- Show the detail line only when it adds something (an ETA, a queue position or an error),
  not a restatement of the step name.
- Composer placeholder: say what the user can do, not the step status again, e.g. "Chat
  unlocks after annotation". One name everywhere: "Annotation", not "Clinical Annotation".
- The same timer (48s) should appear once.

## TODO — "Apply a filter" after annotation: why it's there, and how it's shown

Seen on geneie.chat 2026-10-17 once EB_4_S2's annotation finished.

Why it appears (by design): the backend chat-eligibility gate (`bio-lab-project`
`feat/newprod-baseline`, `main.py` ~12624) returns `reason: CHAT_REQUIRES_FILTER` when the
file has more rows than the no-filter limit (1,000) and no reduction is active. EB_4 has
78,669 rows. Variant-level chat can't run over the whole file, so the user has to apply
ACMG or Exomiser, or use sidebar filters to get to ≤1,000 rows. The frontend turns that
reason into the CTA `{ label: 'Apply a filter', onClick: open sidebar }`
(newprod `ChatPage.jsx:1440`) and renders it inside the phase pill.

What's wrong with how it's shown:
- It says the same thing 4 times: header "Needs a filter" (`PipelineDrawer.jsx:433`), the
  "Apply a filter" button, the backend message paragraph ("This file has 78,669 variant
  rows. Apply the ACMG or Exomiser filter…"), and the composer placeholder "Apply a filter
  to enable chat" (`ChatPage.jsx:1387`).
- The phase pill reads "Annotated & ready" with an empty (not-done) circle while the file
  row shows an ANNOTATED badge. It isn't ready (chat is gated), and it isn't clear whether
  annotation finished.
- The button is crammed into the pill's right edge after an empty gap and a stray chevron.
  It reads as part of the pill, not as the next step.
- "Apply a filter" only opens the sidebar, where the user has to work out what to pick.
  This sample already has a phenotype, so Exomiser is the obvious next step and could be
  offered directly.

Fix:
- Make the Filter step the active step in the step row (Interpret ✓ → Annotation ✓ →
  Filter ● → Chat) and put the action there. Don't put a button inside the phase pill.
- Offer the actual choices: "Run Exomiser (uses phenotype)" as primary when a phenotype
  exists, "ACMG filter" as secondary, and "Other filters…" to open the sidebar.
- Say why once, in one short line ("78,669 variants: filter to chat"), and drop the
  repeats. Rewrite the backend's long message or don't show it.
- Pill state: ✓ once annotation is done; don't call it "ready" while chat is still gated.
- Composer placeholder can stay as the single reminder, or point at the step.
- Automatic mode with a phenotype: consider running Exomiser on its own after annotation.

## DONE — Module 1 pipeline stepper — duplicate spinner

The Module 1 job chip shows two spinners at once while a job is running: the
header avatar icon and the active stage node.

- `src/components/Module1PipelineStepper.jsx:48` — header `Loader2` with `animate-spin`
- `src/components/Module1PipelineStepper.jsx:85` — active stage node `Loader2` with `animate-spin`

Keep the stage-node spinner (it carries position information); replace the header
one with a static icon. Proposed: swap `Loader2` for lucide's `Dna` (verified
present in the installed lucide-react), keeping the existing `AlertCircle` for the
failed state so failures still read differently.

Applied. Header icon is now a static `Dna`; the stage-node spinner is the only
moving element. Failed state still renders `AlertCircle`.

## DONE — Pipeline drawer background too close to the page background

In dark mode the drawer barely separates from the page behind it:

- page  `--bg-app` → `hsl(0 0% 6%)` = `#0F0F0F` (`src/index.css:198`)
- drawer `--bg-surface-sunken` → `#131313` (`src/App.css:96`)

That is a 1.5% lightness step, so the drawer reads as unbounded — it carries no
border and no shadow by design (see the component doc comment in
`src/components/PipelineDrawer.jsx:130`), which leaves the fill as the only
separation.

Fix: raise the dark value of `--bg-surface-sunken` to roughly `#1A1A1A`. That
clears the page background visibly while staying below the composer's
`--bg-surface` (`#1C1C1C`), preserving the intended hierarchy where the drawer is
the secondary surface sitting behind the composer.

Safe to change globally: `--bg-surface-sunken` has exactly one consumer, the
`.pipeline-drawer` rule at `src/App.css:575`. Light mode (`#ECEEF1` on white) already
separates fine and needs no change.

Applied as `#181818` rather than `#1A1A1A`: that keeps a visible step down from the
composer's `#1C1C1C` as well as up from the page's `#0F0F0F`, so all three surfaces
stay distinguishable. The stale "unchanged" comment above the dark block in
`src/App.css` was corrected to record the deviation.

Note: the teal vertical line on the drawer's left edge in the screenshot is not a
static accent bar; it is the indeterminate perimeter progress stroke mid-sweep
(`src/App.css:670`). Leave it alone.

# Later

## Two visually different pipeline steppers

Module 1 and the downstream VCF analysis render as two unrelated-looking steppers.
They are not duplicates — they are sequential stages of one session:

- `src/components/Module1PipelineStepper.jsx` — FASTQ→VCF job.
  Queued / Staging / Aligning / Calling variants / Complete. Bordered card in normal
  flow, circular nodes, 5 macro-nodes collapsed from 9 backend phases.
- `src/components/PipelineDrawer.jsx` — post-VCF analysis.
  Upload / Interpret / ANNOVAR / Filter / Chat. Borderless drawer tucked behind the
  composer, pill-shaped steps.

Module 1 ingests its PASS VCF into the conversation, and the drawer pipeline takes
over from there, so a Module 1 user sees both in sequence.

The divergence is half-intentional: `Module1PipelineStepper.jsx:14` records that it was
"modeled visually on VariantAnalysisPipeline's chip-that-expands" — it took the concept
but not the styling.

Merging the two components is a large change: different data models (5 derived stage
groups vs ~20 props of step state), different placement, different collapse behavior.

Cheaper alternative worth doing first: leave them as separate components but unify the
visual language — shared node treatment, same surface token, same type scale — so they
read as one system across the session.
