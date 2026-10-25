# geneie-frontend

## Branches

Work lands on `dev`: branch off it, and open pull requests against it.

**Vercel deploys `geneie.chat` from `main`, not `dev`.** Merging to `dev` ships nothing —
a change only reaches production when `dev` is promoted to `main`. Verified on
2026-09-14, when a merge to `dev` left production two days stale.

The backend (`bio-lab-project`) is the opposite: `dev` is what runs, and its `main` is not
to be updated.

## Loading indicators

Use the **Helix loader** wherever a loading indicator is needed (page, panel or inline waits). It is the beUI loader's
`helix` variant (https://beui.dev/components/motion/loader), vendored as `src/components/motion/helix-loader.jsx`:

```jsx
import { HelixLoader } from '@/components/motion/helix-loader';

<HelixLoader />                 // default: 32px, inherits text colour
<HelixLoader size={36} label="Loading results" />
```

Props: `size` (px, default 32), `speed` (seconds per turn, default 1), `label` (screen-reader text, default
"Loading"), `className`. It respects reduced motion by pulsing instead of moving. Do not add another spinner or the
other beUI loader variants; extend `HelixLoader` if it needs a change. Button-level busy states keep using
`StateButton`.
