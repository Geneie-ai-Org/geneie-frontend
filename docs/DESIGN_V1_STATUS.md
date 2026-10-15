# Design v1: status (local, `redesign/fe`, nothing pushed)

Spec: `docs/DESIGN_V1.md`. Agent brief used for the build: `docs/AGENT_BRIEF.md`.

## What v1 is
- **Tokens and theme:** `src/design/tokens.css` (light default, dark peer, one teal accent, status colours kept
  separate), `src/design/shell.css` (layout). Theme key is `geneie-theme-v2`. Delete the two imports in
  `src/main.jsx` to get the previous look back.
- **Shell:** rail | thread | workspace. `src/components/workspace/WorkspacePanel.jsx` (tabs: Variants, Pipeline,
  File check, Triage; drag-resizable 420-720px; sheet below 768px) and `PipelineStatusStrip.jsx` (one status
  line with the next action, replaces the banner + file card + stepper stack above the composer).
- **Components redesigned:** auth, landing, legal, 404, consent, device-frozen overlay; composer, messages,
  thinking, nudges, tuning UI; rail (titled sessions, search, grouped), notifications, settings, billing; variant
  filters (summary, mode switch, inline groups, sticky footer); phenotype, gene panels, GA triage, file check;
  both upload wizards (3 steps, optional details collapsed, inline errors), pipeline job card, QC/IGV; admin
  users/infra with confirm dialogs.

## Checked
- `npx vite build` passes. No JS exceptions walking: conversation, workspace tabs, ACMG/Phenotype modes, filter
  group, rail, settings, FASTQ wizard, dark theme (local stack, desktop 1440x900, light and dark).
- Mobile was explicitly deferred.

## Open items (not done)
1. **Rename sessions:** pass `onRenameConversation` (wire to the conversation update API) and keep user-set titles.
2. **Rail status dots:** map a `status` field (running/failed) onto conversation records.
3. **Silent failures upstream:** `useModule1Pipeline` closes the FASTQ form on a 403/400; upload services throw
   errors without `status`/`code` (the wizard matches the device message text as a workaround).
4. **System theme** option (`useTheme` is light/dark only).
5. **Report tab:** `ClinicalReportAssignModal` is still a modal; a Report tab is the better home.
6. **Copy review:** landing FAQ and data-handling text was rewritten to match `privacy.md`/`terms.md` (HIPAA, GDPR and
   "zero-hallucination" claims removed). `public/llms.txt` still says "HIPAA and GDPR". Needs an owner's read.
7. **Not seen live:** Pro-only billing states, admin pages against the real backend (checked with mock data),
   failed/cancelled Module 1 cards (mocked), assistant message styling during real streaming.
8. `package-lock.json` is modified locally because the newprod lockfile is out of sync with `package.json`;
   do not commit it. `skills-lock.json` is untracked.

## Product findings from using newprod (not FE-only)
- `PRO_DEVICE_FROZEN` (4 active devices) makes `POST /api/upload-variant-file` return 403; the old UI showed nothing.
- Module 1 EB57 failed at ~45% (alignment) with a generic message.
- Gene-panel suggestions for an epidermolysis bullosa phenotype were generic (no skin/blistering panel).
- Several counters read "N of M" with N > M (e.g. "49 of 10 Module 1 runs left", "113 of 30 Annotation runs left").
- Admin "Devices" button reset devices with no confirmation (fixed in the new admin UI).
