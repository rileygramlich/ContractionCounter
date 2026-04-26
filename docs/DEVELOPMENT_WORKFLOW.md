# ContractionCounter Development Workflow

## Branch-first flow

1. Sync latest `master`:
   - `git checkout master`
   - `git pull origin master`
2. Create a focused branch:
   - `git checkout -b feature/<short-name>`
3. Implement in small commits.
4. Run quality gate:
   - `npm run build`
5. Push branch:
   - `git push -u origin <branch>`
6. Open PR to `master`.

## Review standard (Hermes Dev)

Before opening PR, perform self-review on:
- Correctness and edge cases
- Regression risk
- Clarity/readability
- Scope control (no unrelated edits)

## PR/MR expectations

- One problem per branch
- Clear summary and validation notes
- Keep PRs small enough to review quickly
