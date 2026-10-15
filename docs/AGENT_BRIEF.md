# Agent brief: Geneie design v1 build (local only)

You are redesigning part of the Geneie frontend. Read `docs/DESIGN_V1.md` first and follow it. It is the
spec. The goal is a **v1 of new design AND UX** for the components you own, not a colour swap: improve
structure, hierarchy, progressive disclosure, states (loading/empty/error/success) and copy.

## Where
- Repo/worktree: `/Users/ausaf/Desktop/geneie_repos/_wt/redesign-fe` (branch `redesign/fe`). Work ONLY here.
- Tokens: `src/design/tokens.css` (already loaded). Tailwind semantic classes (`bg-background`,
  `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-primary`, ...) and the legacy
  CSS vars (`var(--bg-surface)`, `var(--text-secondary)`, `var(--accent-teal)`, `var(--success)` ...) both work.
- UI primitives live in `src/components/ui/*` and are OWNED BY THE LEAD. Do NOT edit them. Compose them.
  If you need a new primitive, create it inside your own area (a new file you own).

## Hard rules
1. **Local only.** Never run `git push`, `git commit`, `git stash`, `git checkout`, `git reset`, `git rebase`
   or anything that changes git state. The lead commits. Never touch other worktrees or repos.
2. **Only edit files you own** (your list is in your task). Do not edit `src/pages/ChatPage.jsx`,
   `src/App.css` shell rules, `src/design/*`, `src/components/ui/*`, `src/components/workspace/*`, hooks,
   services or lib (read them freely). If you need a change there, put it under "Needs lead" in your report.
3. **Behaviour and data flow stay the same.** Keep each component's props, exports, callbacks, API calls
   and polling exactly as they are, unless your task says otherwise. You are changing presentation and
   interaction structure. If a prop must change, keep the old one working and list it in "Needs lead".
4. **No new colour literals in JSX.** Use tokens. Status colours from `--success/--warning/--error/--info`.
5. **No Claude Artifacts.** Everything is local files. No secrets, no patient data in logs or screenshots.
6. Don't add dependencies (no npm install). Available: react 19, tailwind 3, lucide-react,
   @hugeicons/react, motion, sonner, cmdk, @base-ui/react (shadcn base-nova style), react-markdown.
7. Both themes must work (light default, `.dark` peer). No hover-only affordances; visible focus; 44px touch
   targets on mobile; respect `prefers-reduced-motion`.

## Workspace contract (for components that will live in the right-hand workspace)
The lead mounts them inside a panel 420-720px wide, full height, that supplies the header/tabs/close.
Your component must therefore render as **plain content**: a block that fills its parent
(`h-full min-h-0 flex flex-col`), scrolls internally (`overflow-y-auto` on the body), has **no** `fixed`/
`absolute` panel positioning, **no** own close button/drawer chrome/backdrop, **no** fixed width. Sticky
footers (Apply/Reset/Download) are fine inside it. It must also look right at 420px and at 720px.

## How to verify
- Build: `cd /Users/ausaf/Desktop/geneie_repos/_wt/redesign-fe && npx vite build --outDir <your scratch dir>`
  where `<your scratch dir>` is `/private/tmp/claude-501/-Users-ausaf-Desktop-geneie-repos/e57a3f06-abed-4614-ac34-ace8fb219cff/scratchpad/build-<yourname>`.
  Must pass with no new warnings. Do not build into `build/`.
- Visual: the app runs at `http://localhost:3100` (Vite, HMR, signed-in Chrome with remote debugging on
  `127.0.0.1:9222`). A local demo conversation with 949 variants: `http://localhost:3100/app/7038962f-e2db-4b9a-9438-0f327cca63d5`.
  Helpers: `/Users/ausaf/Desktop/geneie_repos/_wt/redesign-stack/np_lib.mjs` (puppeteer-core connect + `realClickText`).
  **Only open NEW tabs on `http://localhost:3100` and close them when done. NEVER touch, navigate or
  screenshot any tab whose URL contains `geneie-newprod`** (the user is working in those). Screenshots go in
  `/Users/ausaf/Desktop/geneie_repos/_wt/redesign-stack/shots/<yourname>-*.png`. Real pointer clicks are
  needed for custom selects (`page.mouse.click`).
- If a screen needs state you cannot reach (e.g. a running pipeline), build it and review by reading.

## Report format (final message, under 300 words)
1. Files changed (paths). 2. What changed in UX (3-6 bullets). 3. Needs lead (props/shell changes you need).
4. Build result. 5. Known gaps.
