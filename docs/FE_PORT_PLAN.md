# Frontend port plan: old prod (`main`) -> newprod (`newprod`)

Branch: `port/fe-from-main`, cut from `origin/newprod` at `be130da`. The PR targets `newprod` only.
Nothing here touches `main` or `dev`, which old prod deploys from.

## Goal

The newprod frontend should do everything old prod (`origin/main`) does. Each change is adapted
to newprod's code, not merged blind. Newprod's own work stays as it is: the admin infra pages,
tuning mode, the GPU/CPU compute choice and queue, the guest code, `Module1PipelineStepper`,
the Explore (exploratory) UI and per-turn persistence (#208).

## How the main-only delta was found (content-level, not commit-level)

Commit history was used only for context. The decision is based on the file contents of both trees:

- Every path under `src/` on `origin/main` (137 files) and `origin/newprod` (158 files) was listed.
- Each file was compared with `git diff origin/newprod origin/main -- <path>`, which compares the two
  trees directly with no merge base. Every non-empty diff was read hunk by hunk.
- Outside `src/`, the file names are the same on both branches. Only `vite.config.js` differs in
  content.
- Context only: `git log --no-merges origin/newprod..origin/main` lists 33 commits (19 not
  patch-equivalent). `origin/dev` has 0 commits that main lacks. Most of main's work had already
  reached newprod through #212, #214 and #215. That is why the content diff is much smaller than
  the commit list.

## File-by-file inventory

Counts:

| Category | Files |
|---|---|
| Compared (union of both trees) | 160 |
| Identical on both branches | 113 |
| Only on main | 2 |
| Only on newprod | 23 |
| Differ | 22 |

Decisions:

| Decision | Files |
|---|---|
| PORT | 6: `postLoginPath`, `Module1QcSection`, `ProtectedRoute`, `PublicRoute`, `AuthForm`, `PipelineDrawer` |
| ADAPT | 5: `main.jsx`, `ChatPage`, `Module1UploadForm`, `useModule1Pipeline`, `module1PipelinePhases` |
| KEEP-NEWPROD (main older or missing newprod work) | 36: 23 newprod-only files and 13 that differ. In 3 of the 13 (`useChatMessaging`, `useVariantPipeline`, `VariantFilterSidebar`) this PR also makes a contract or copy fix, and the newprod-only `Module1PipelineStepper` is adapted for items 2 and 4. |
| SKIP | 0 |
| `vite.config.js` (outside `src/`) | KEEP-NEWPROD |

### Only on main (2)

| Path | What it is | Decision | Why |
|---|---|---|---|
| `src/lib/postLoginPath.js` | Sends a user back to the `/app…` page they were turned away from after sign-in. | PORT | Required for the sign-in gate (owner decision). |
| `src/components/Module1QcSection.jsx` | "QC & alignment" row, closed by default, that wraps the QC, IGV and saved-report panels. | PORT | Used by the stepper (item 2) and by the ported drawer (item 3a). It calls the same three panels and endpoints newprod already uses. |

### Only on newprod (23), all KEEP-NEWPROD

| Group | Paths |
|---|---|
| Admin infra | `pages/AdminInfraPage.jsx`, `components/admin/{DataPlaneCard,ExomiserFastCard,InfraPanel,InfraReadOnly,IntakePanel,Module1Card,WorkerCard,infraShared}.jsx`, `components/admin/{infraAlarmHelp,infraHelp}.js`, `services/infraApi.js` |
| Tuning mode | `components/TuningMode.jsx`, `components/TuningConfigModal.jsx`, `components/chat/TuningCompareColumns.jsx`, `hooks/useTuningCompare.js`, `services/streamCompare.js`, `services/tuningConfig.js` |
| Compute choice and queue | `components/Module1ComputeChoice.jsx`, `hooks/useModule1Capacity.js` |
| Explore UI | `components/ExploratoryModeToggle.jsx`, `services/streamExploratory.js` |
| Module 1 job card (FASTQ) | `components/Module1PipelineStepper.jsx` (deleted on main; kept and adapted, items 2 and 4) |

### Differ (22)

| Path | What is different | Decision | Why |
|---|---|---|---|
| `components/AuthForm.jsx` | Main: the 4 post-sign-in `navigate('/app')` calls use `postLoginPath(location)`. | PORT | Deep link back after sign-in. |
| `components/ProtectedRoute.jsx` | Main waits while `!isAuthReady \|\| userLoading`. Newprod's `userLoading && !isAuthReady` could bounce a signed-in user to `/auth` on hard refresh. | PORT | Needed once `/app` is gated. |
| `components/PublicRoute.jsx` | Main redirects a signed-in user to `postLoginPath(location)` instead of `/app`. | PORT | Deep link. |
| `main.jsx` | Main wraps `/app` and `/app/:id` in `ProtectedRoute`. It also drops `/admin-haha/infra`, which only exists on newprod. | ADAPT | Add the guard by hand and keep the infra route. |
| `components/PipelineDrawer.jsx` | Main: two phase pills ("VCF uploaded" or "Reads → VCF", then "Annotated & ready"), a header with icon, file or sample name and status, the next action on the pill, the badge row always visible, an optional Module 1 phase, and the QC section. `PerimeterProgress` and `SegmentMeter` are removed. | PORT (file) + ADAPT (wiring) | Newprod never changed this file, so main's version is a superset. ChatPage hands the FASTQ phase to the drawer only after a successful run (item 3a). |
| `pages/ChatPage.jsx` | Main renders the Module 1 job inside the drawer (`showModule1Phase`) and narrows `hasUploadedFile`. Newprod adds the Explore trace rendering, tuning compare, compute capacity and the stepper. | ADAPT | Take main's drawer wiring and `hasUploadedFile`. Keep everything newprod-only. Add the pgx_only QC placeholder (item 6) and the GA eligibility settle (item 5). |
| `components/Module1UploadForm.jsx` | Main: "Skip & start pipeline" when the phenotype is empty (through `onDraftChange`), and the "Typical runtime: 2–4 hours" copy. Newprod: GPU/CPU compute cards, a compute-aware submit label, "Uses 1 run credit…", and the "20–30 min on GPU, about 2 h on CPU" copy. | ADAPT | Port the skip label on top of the compute label. Keep newprod's runtime copy, which is newer and matches compute choice. |
| `lib/module1PipelinePhases.js` | Main adds `getModule1FailureMessage` (hides infrastructure text) and `module1FinishedSuccessfully`. Newprod adds the `waiting_gpu`, `launching`, `cancelling` and `cancelled` phases. | ADAPT | Keep newprod's phases. Port both helpers. Failure text follows the new contract (`failure.message`, never `error`). Add terminal helpers. |
| `hooks/useModule1Pipeline.js` | Main's failure modal uses `getModule1FailureMessage` and its title is "Pipeline failed". Newprod adds cancel, switch, queue cadence and the CPU-fallback toast. | ADAPT | Keep newprod. Adopt the safe failure text, main's "Pipeline failed" modal title (main introduced it after the merge base), and the `terminal` / `failure` contract (item 4). |
| `components/DocumentUpload.jsx` | Main still calls `getAuth()` without importing it, and lacks `GUEST_UPLOAD_LIMIT_REACHED`. | KEEP-NEWPROD | Main is the buggy side. The "Skip & upload" / "Skip & import" labels and the discard dialog are already on newprod. |
| `components/VariantFilterSidebar.jsx` | Main lacks newprod's `X-Device-Id` header on the filter POSTs. | KEEP-NEWPROD | Plus the "Disease tab" wording fix (item 7). |
| `hooks/useChatMessaging.js` | Main lacks the Explore stream branch, `persistTurn` (#208) and the fresh-token fix. | KEEP-NEWPROD | Plus refusals shown as sent (item 8). |
| `hooks/useVariantPipeline.js` | Main lacks newprod's pgx_only eligibility poll. | KEEP-NEWPROD | Plus the eligibility settle loop (item 5). |
| `components/ErrorBoundary.jsx` | Newprod: design-token styling, a "Back to app" link and a `render_error` analytics event. | KEEP-NEWPROD | Newprod is newer. |
| `components/NotificationBell.jsx` | Newprod adds the `module1` job type label "Raw data". | KEEP-NEWPROD | Newprod is newer. |
| `components/SubscriptionPage.jsx` | Newprod takes the Pro price from the backend, with a fallback of $27.99. | KEEP-NEWPROD | Newprod is newer. |
| `config/env.js` | Newprod supports the `same-origin` API sentinel for the dev proxy. | KEEP-NEWPROD | Dev tooling. |
| `index.css` | Newprod adds the Explore trace cursor animation. | KEEP-NEWPROD | Explore UI. |
| `lib/safeAuth.js` | Newprod forces a token refresh so a stale token never downgrades the user to guest. | KEEP-NEWPROD | Bug fix. |
| `pages/AdminPage.jsx` | Newprod adds an "Infra →" link. | KEEP-NEWPROD | Admin infra. |
| `services/backendApi.js` | Newprod adds Module 1 capacity, cancel and preference calls, `fetchPublicConfig`, and the `INTAKE_PAUSED` message. | KEEP-NEWPROD | Newprod features. |
| `services/limitErrors.js` | Newprod maps `GUEST_CHAT_LIMIT_REACHED`. | KEEP-NEWPROD | Bug fix. |

Identical on both branches (113, no action): App.css, App.jsx, every `components/ui/*`, every
`components/chat/*` except TuningCompareColumns, AutomaticPipelinePanel, BetaSeats, BrokenHelix,
CaseReportDownloadButton (Review & report lock), ClickSpark, ClinicalReportAssignModal,
ColumnInterpretationResults (red File Analysis errors), ConversationSidebar, DeviceFrozenOverlay,
ExportVariantsButton, GaTriagePanel, GermlinePedigreeFields, germlinePedigreeOptions, GradualBlur,
IsometricGenomicScene, LegalConsentGate, Module1IgvPanel, Module1QcPanel, Module1QcReportPanel,
PanelAppSuggestSection (PanelApp branding hidden), PhenotypeAiLabel, PhenotypeInputPanel (toggle
chips, "Select all", info popovers, kept phenotype data), PipelineRunModeToggle, PixelBlast,
ProfileManagement, SessionLoadingScreen, Silk, Subscription{Canceled,Manager,Success}, TopUp*,
UsageNudge, VariantUploadLoadingModal, config/api.js (SSE stream URL), every hook not listed above,
every lib file not listed above, pages Auth/AuthAction/Landing/LegalDoc/NotFound,
services firebase/mongodbApi/tierLimits/tierLimitsFixtures, WES.svg, WGS.svg.

**Residual check after the port.** Every `+` line in `git diff HEAD origin/main -- src` (lines
main has that this branch does not) was classified:

- Each one is main's *older* version of something newprod rewrote after the merge base:
  - ErrorBoundary inline styles.
  - DocumentUpload `getAuth()`.
  - The `'Start pipeline'`-only submit label and the "2–4 hours" runtime copy. Both were checked
    against `077c1ec`: newprod changed them later for compute choice.
  - The hard-coded $27.99.
  - The pre-#208 persistence.
  - The guest-tier token gate.
  - The pre-terminal Module 1 polling.
  - The older eligibility poll.
- The "Disease tab" text was replaced on purpose.
- The one remaining main-only string, the failure modal title "Pipeline failed" (introduced on
  main after the merge base), was ported.

**Backend contract check for the main-only UI.** `Module1QcSection` calls the existing QC, IGV and
saved-report panels, which use endpoints newprod already calls. `PipelineDrawer` and
`postLoginPath` make no network calls. No mismatches were found.

## Classification

Legend: **PORT** = take main's change as-is. **ADAPT** = take the behaviour and rewrite it for
newprod's code. **PRESENT** = already on newprod, nothing to do (counted as identical or
KEEP-NEWPROD in the inventory). **NEW** = not in main; it comes
from the newprod backend contract.

| # | Item | Evidence | Decision | Risk |
|---|------|----------|----------|------|
| 1 | `/app` requires sign-in, with a post-login deep link (main `9a19802`) | Two-dot diff: `src/lib/postLoginPath.js` is new. `ProtectedRoute.jsx` waits on `!isAuthReady \|\| userLoading` (the old guard bounced signed-in users on a hard refresh). `PublicRoute.jsx` and `AuthForm.jsx` (4 x `navigate('/app')`) now use `postLoginPath(location)`. `main.jsx` wraps `/app` and `/app/:id` in `ProtectedRoute`. | **ADAPT** (owner decision: require sign-in). `main.jsx` is hand-edited, because main's copy deletes newprod's `/admin-haha/infra` route. No backend allowlist is needed: the deep link travels in React Router `location.state.from`, and only `/app*` paths are honoured. | Medium. Signed-out visitors and guests can no longer chat. See "Guest code that becomes unreachable" below. |
| 2 | Module 1 QC section collapsed by default (main `Module1QcSection.jsx`) | Main moved the QC panel, IGV panel and QC report panel into `Module1QcSection` and rendered it inside the new `PipelineDrawer`. Newprod already has the same collapsed "QC & alignment" row, but inside the stepper's `expanded` body, which is open by default. So once a run finished, the stage row stayed open and the QC row sat underneath it. | **ADAPT**. Add `Module1QcSection.jsx` (main's file), render it in `Module1PipelineStepper` **outside** the collapsible body, and collapse the stage body by default once the run has finished or is terminal. The open state is reset per `jobId`, so a new run opens again. Main's drawer also renders this section; see 3a. | Low (presentation only). |
| 3a | Phase pills: `PipelineDrawer` shows every route as two pills, "VCF uploaded" or "Reads → VCF", then "Annotated & ready". On main it also absorbs the Module 1 job and deletes `Module1PipelineStepper` (main `419ac48`/`1c6b7ec`, `1d3c845`). | Two-dot diff: `PipelineDrawer.jsx` +536/-271. `git diff 077c1ec origin/newprod -- src/components/PipelineDrawer.jsx` is **empty**: newprod never edited the drawer after the merge base, so main's drawer is a strict superset of newprod's. | **ADAPT**. Take main's `PipelineDrawer.jsx` verbatim. Its pill header, phase pills, the action button on the pill, the always-visible Annotated badge row, the copy, and the `module1Job` / `onModule1StartOver` props all come across. In `ChatPage` the FASTQ job still belongs to newprod's `Module1PipelineStepper` while it is queued, running, cancelling, cancelled or failed, or complete with ingest still pending. The stepper is the only place with the GPU/CPU chip, queue position, ETA and **Leave queue / Stop run / Switch to CPU**. Once the run has finished successfully and the VCF is in the conversation, the drawer takes over as on main: pill 1 shows "Reads → VCF" ✓ with its duration and the QC & alignment section, and the stepper is no longer rendered. Main's ChatPage `hasUploadedFile` change comes across too. | Medium (visual). The drawer layout changes for every VCF conversation. The handoff from stepper to drawer happens when the VCF lands. **Owner sign-off needed:** the first brief said "do not re-import main's drawer wholesale". The later instruction asked for main's pills and new components to be ported faithfully. Because newprod never touched the file, taking it whole is the faithful port. It is isolated in its own commit and can be reverted alone. |
| 3b | Hide infrastructure errors and the finished-run helper (main `b079364`: `getModule1FailureMessage`, `module1FinishedSuccessfully` in `module1PipelinePhases.js`) | Main's `getModule1FailureMessage` reads `job.error \|\| job.message` and blanks infrastructure text with a regex. | **ADAPT** to the new backend contract (item 4). `module1FinishedSuccessfully` moves from the stepper into the lib file. Newprod's `waiting_gpu`, `launching`, `cancelling` and `cancelled` phases stay. | Low. |
| 3c | "Skip & start pipeline" label (main `e982e75`, Module1UploadForm) | Two-dot diff: main tracks `phenotypeDraft` through `PhenotypeInputPanel`'s `onDraftChange`. Newprod's panel already supports `onDraftChange` (that file has no diff), but the form never wires it up. | **ADAPT**. Newprod's submit label comes from the compute choice ("Start on GPU", "Join GPU queue (#3)", "Wait for a GPU", "Start on CPU", "Start pipeline"). The skip variant prefixes it: "Skip & start on GPU", "Skip & join GPU queue (#3)" and so on. The compute cards and the credit line are kept. | Low. |
| 3d | "Skip & upload" / "Skip & import" and the discard confirmation (DocumentUpload) | Already on newprod (`DocumentUpload.jsx:1836`, `showDiscardConfirm`). The only two-dot hunks are regressions on main (`getAuth()` was never imported, and the `GUEST_UPLOAD_LIMIT_REACHED` code is missing). | **PRESENT** (newprod is ahead). | None. |
| 3e | Disabled tumour analysis types (main `9c8f364`) | `Module1UploadForm.jsx:72-73` and `DocumentUpload.jsx:1600-1601` are already `disabled: true` on newprod. | **PRESENT**. | None. |
| 3f | Guest-limit display in ChatPage (main `1308e89`, `b6dcb43`) and the no-yellow palette (`9079952`) | Patch-equivalent commits `5469fb1`, `4ef210f` and `5b631d9` are on newprod. Two-dot diff of `UsageNudge.jsx` and `App.css` is empty. | **PRESENT**. The guest-limit code stays harmlessly in place (item 1). | None. |
| 3g | VariantFilterSidebar changes (main `b313239` crossfade status, `e0bb2a1` lock) | The only two-dot hunk is newprod's `X-Device-Id` header, which main lacks. | **PRESENT** (newprod is ahead). | None. |
| 3h | `useModule1Pipeline.js` (main `b079364`) | Main's only addition is that the failure modal uses `getModule1FailureMessage`. Everything else in the diff is newprod-only (cancel, switch, queue cadence). | **ADAPT** (item 4). | Medium. Polling logic changes. |
| 3i | Other main-touched files: CaseReportDownloadButton, ColumnInterpretationResults, ExportVariantsButton, PhenotypeInputPanel, PanelAppSuggestSection, ChatMessage, TypewriterText (deleted), config/api.js, SSE streaming in useChatMessaging | Two-dot diff is **empty** for each, so they are identical on both branches. In `useChatMessaging` the two-dot hunks are all newprod-only (exploratory branch, `persistTurn` #208, token fix). | **PRESENT**. | None. |
| 4 | Module 1 status contract: `failure`, `terminal`, admin-only `error` | Newprod reads `data.error` at `useModule1Pipeline.js:43/238` and `Module1PipelineStepper.jsx:153/325`. Polling stops only on `failed`/`cancelled`, and `cancelling` is treated as non-terminal. | **NEW**. Map `failure` and `terminal`. User-facing text is `failure.message`, else `message` (infrastructure text masked), else a plain fallback. `error` is **never rendered**: it is not mapped onto the job at all. Polling stops when `terminal` is true, except for `status=complete` while `ingest_status` is still pending, because the backend advances ingest as a side effect of `GET /status`. `terminal` with status or phase `cancelling` is shown as the distinct **Cancelled** state: polling stops, the toast shows once, and the job is dropped after one cycle. `module1JobActive` is false whenever the job is terminal (except the complete-but-ingesting case). If an older backend omits `terminal`, the old status-set logic still applies. | Medium. A user who reloads while a run is `cancelling` now sees no job (it is terminal) instead of "Stopping…". Starting a new run during the 20-80 s machine shutdown may get a backend 409, which is shown by the existing form error path. |
| 5 | Chat-eligibility re-poll after a filter or Exomiser job (known bug: chat stayed greyed after Exomiser until reload) | `pollExomiserUntilDone` calls `refreshConversationAfterAnnovar` once. The background poll effect (`useVariantPipeline.js:1326`) only runs for `enrichmentActive \|\| indexingActive \|\| filterLoadPending \|\| pgxOnlyPending`. `indexingActive` is false when `ADVANCED_CHAT_INDEXING` arrives with `advanced_chat_status: 'ready'` (the brief re-index after GA/Exomiser), and nothing polls `allowed:null, reason:null` (the optimistic state set by `beginPipelineWork`). The filter path refreshes only on an observed `running -> completed`, so a fast job seen as `pending -> completed` never refreshes at all. | **NEW**. Add a pure helper `src/lib/chatEligibilityPoll.js` that decides whether to poll again (transient reasons: `ENRICHMENT_RUNNING/PENDING`, `ADVANCED_CHAT_INDEXING` unless `failed`, `FILTER_JOB_RUNNING`, `CHAT_REQUIRES_FILTER` with a filter active or "not loaded yet", or no answer at all). Backoff: 3 s for the first minute, then 5 s, with a cap of about 9 minutes. `settleChatEligibility()` in `useVariantPipeline` runs that loop after Exomiser completes or fails, after a filter job completes (any non-completed state -> completed), and after GA triage completes (ChatPage). It aborts on conversation switch. While the loop runs, the background effect skips its own fetch, so there are no duplicate requests. `ADVANCED_CHAT_INDEXING` with `advanced_chat_status` ready (or null) is treated as a transient "Preparing chat…" that keeps polling, not as an error. | Medium. More eligibility GETs for up to about 9 minutes after a job, which is bounded. |
| 6 | pgx_only placeholder mentions QC when a Module 1 QC exists | `ChatPage.jsx:1359` | **NEW**. When the conversation has Module 1 QC artifacts (`module1ArtifactsVisible`: live QC, BAM, or the saved report after purge), the placeholder is "Ask about pharmacogenes or this sample's sequencing QC…". | Low. |
| 7 | Stale "Disease tab" wording | `VariantFilterSidebar.jsx:2265`: "On the Disease tab, select at least one HPO finding…". No such tab exists; findings are picked under "Clinical findings" in sample info (PhenotypeInputPanel). | **NEW**. New text: "In sample info, select at least one clinical finding (HPO term) present in this patient." | None. |
| 8 | Explore refusals | `useChatMessaging.js:532` rewrites a `refused` event to "⚠️ … (not grounded)". | **NEW**. Show `evt.label` exactly as sent. If the label is missing, use a neutral line. There is no emoji prefix and no "not grounded" text. | Low. |

### Guest code that becomes unreachable (kept, not deleted)

When `/app` sits behind `ProtectedRoute`, a signed-out visitor never mounts `ChatPage`. These parts
stay in the code but can no longer be reached by a real guest:

- The guest chat flow in `ChatPage` (`userTier === 'guest'` branches): the guest message counter
  and limit next to the composer, the guest-limit placeholder, and `AuthForm` opened with
  `triggerReason="guestLimit"` ("Guest Access Ended").
- Guest pipeline UI: `getGuestPipelineCta` (drawer CTA), `buildGuestChatEligibility` /
  `resolveGuestChatEligibility`, and the guest `X-Device-Id` filter-status refresh in
  `useVariantPipeline`.
- Guest upload limits in `DocumentUpload` (`GUEST_LIMIT_REACHED`, `GUEST_UPLOAD_LIMIT_REACHED`,
  `GUEST_FILE_SIZE_EXCEEDED`) and the `refreshGuestStatus` / `guestStatus` paths in `useAuth`.
- The "Sign in to run Module 1" guard in `useModule1Pipeline`.

**Not dead code:** `useAuth` starts every session with `userTier = 'guest'` until the profile and
subscription load. Some guest branches still run briefly for signed-in users during page load. Do
not remove them as dead code.

## Order of work (one commit per group, so each can be reverted alone)

1. `docs: FE port plan` (this file).
2. `feat(auth): require sign-in for /app with post-login deep link` (item 1).
3. `fix(module1): honour failure/terminal contract, never render admin-only error` (items 3b, 3h, 4).
4. `feat(module1): collapsed QC & alignment section outside the stepper body` (item 2).
5. `feat(pipeline): phase-pill drawer from main; drawer owns the FASTQ phase after a successful run` (item 3a).
6. `fix(module1): Skip & start label on the FASTQ form` (item 3c).
7. `fix(chat): keep polling chat-eligibility after filter, Exomiser and GA jobs` (item 5).
8. `fix(copy): sidebar HPO wording, pgx_only QC placeholder, Explore refusals as sent` (items 6, 7, 8).

## Test plan

This repo has no test runner and no lint script (`package.json` only has `dev`, `build`, `preview`
and `bundle-report`). Adding vitest would change the lockfile, so it is out of scope for this PR.
Instead:

- `npm install` (the committed lockfile is out of sync with npm 11, so `npm ci` refuses;
  `package-lock.json` is not changed by this PR) and `npm run build` after every commit.
- The new logic lives in plain-JS helpers under `src/lib/` with no `@/` imports
  (`postLoginPath`, `module1PipelinePhases`, `chatEligibilityPoll`). Each was smoke-tested with
  `node --input-type=module` assertions run against the source files. The results are in the PR
  body.
- The owner's manual click-through is below.

Results on this branch:

- `npm run build` passed after every commit.
- Smoke assertions all passed:
  - `postLoginPath`: 5/5.
  - `module1PipelinePhases` (failure text, terminal, keep-polling, cancelled, finished): 23/23.
  - `chatEligibilityPoll` (transient reasons, indexing 'ready' versus 'failed', the filter case,
    backoff, cap): 18/18.

### Manual click-through (on the newprod preview or a local `npm run dev` pointed at newprod)

1. **Sign-in gate**
   - Signed out, open `/app/<some conversation id>`. You should land on `/auth`.
   - Sign in (email, Google or Microsoft). You should return to that same `/app/<id>`.
   - Signed out, open `/app`, then sign in. You should land on `/app`.
   - Signed in, hard-refresh `/app/<id>`. You should stay there with no bounce to `/auth`.
   - Signed in, open `/auth`. You should be redirected to `/app`.
   - `/admin-haha/infra` should still load (for an admin).
2. **Module 1 failure display**
   - Open a conversation whose FASTQ job failed. The stepper and the "Module 1 failed" modal should
     show `failure.message`, or a plain fallback. They should never show raw job or exception text
     (instance names, regions, tracebacks).
   - In DevTools > Network, `/api/module1/status` should stop being polled once the response has
     `terminal: true`.
3. **Cancel**
   - Start a run, then use Stop run or Leave queue. The stepper should show "Cancelled · you can
     start again…", the "Run stopped" toast should appear once, polling should stop, and the card
     should disappear after one cycle.
4. **QC section**
   - While a FASTQ run is going and QC exists, the stepper shows a collapsed "QC & alignment" row
     under the card body. That row stays visible even when the stage nodes are collapsed.
   - If the run ended without the VCF landing (for example, ingest failed), the stage nodes start
     collapsed.
   - On a finished FASTQ conversation (VCF in the chat), the stepper is gone. The drawer shows
     "Reads → VCF" ✓ with its duration and the collapsed "QC & alignment" row.
   - Opening QC should show the reports, the IGV browser and the saved report.
   - Start a new run. The stage nodes should be open again.
4b. **Phase-pill drawer (main's `PipelineDrawer`)**
   - Upload a VCF. The header should show a file icon, the file name and status text, followed by
     the pills "VCF uploaded" → "Annotated & ready".
   - Each pill's tint should fill with progress, and its chevron should open that phase's steps.
   - "Run annotation" and "Apply a filter" should appear on the second pill when they are the next
     step.
   - The Annotated badge, pencil and bin should be visible without expanding anything.
   - The remove-file dialog should still work.
5. **Exomiser unlock without reload**
   - On a VCF conversation with a phenotype, run the phenotype filter.
   - When it completes, the composer should move through "Preparing chat…", "Enriching…" or
     "Indexing…" and then become enabled, **without a reload**. Eligibility GETs should keep
     going every 3-5 s until then.
   - Repeat with the ACMG filter.
6. **pgx_only with QC**
   - On a FASTQ conversation in the pgx_only scope that has QC, the placeholder should mention
     sequencing QC.
7. **Explore refusals**
   - With exploratory mode on, ask something the agent refuses. The reply should show the
     backend's label text verbatim, with no "⚠️" and no "not grounded".
8. **Regression spot-checks**
   - Compute choice cards and the queue line still work.
   - The FASTQ form shows "Skip & start on GPU" (or similar) when the phenotype is empty, and
     "Start on GPU" once text is typed.
   - The sidebar Exomiser tab shows the new HPO wording.
   - Admin tuning mode and the infra pages still load.

## Rollback

- Each group is its own commit. `git revert <sha>` on `newprod` undoes one group without touching the others.
- To undo the whole port, revert the merge commit of this PR on `newprod`. Vercel redeploys
  https://geneie-newprod.vercel.app from `newprod`.
- `main` and `dev` (old prod) are never touched by this work.
