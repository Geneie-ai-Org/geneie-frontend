# geneie-frontend

## Branches

Work lands on `newprod`: branch off `origin/newprod`, open pull requests against it, squash-merge.

**geneie.chat deploys from `newprod`.** A merge there is live within a couple of minutes, with no promotion
step. `main` and `dev` are old prod and are not used for current work.

The backend (`bio-lab-project`) deploys from `feat/newprod-baseline`. If a change needs both sides, merge and
deploy the backend first, then the frontend.
