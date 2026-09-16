# geneie-frontend

## Branches

Work lands on `dev`: branch off it, and open pull requests against it.

**Vercel deploys `geneie.chat` from `main`, not `dev`.** Merging to `dev` ships nothing —
a change only reaches production when `dev` is promoted to `main`. Verified on
2026-09-14, when a merge to `dev` left production two days stale.

The backend (`bio-lab-project`) is the opposite: `dev` is what runs, and its `main` is not
to be updated.
