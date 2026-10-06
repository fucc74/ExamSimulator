# Contributing to QZ

Thank you for helping! QZ is a small, dependency-free project, so contributing is straightforward.

## Ways to help
- **Report a bug** or suggest a feature — open an [issue](../../issues/new/choose).
- **Share an exam** — an original `.exam` file on a topic you know (see the rules below).
- **Translate** — add an interface language.
- **Improve accessibility, design or documentation.**
- **Fix code** — pick an issue labelled *good first issue*.

## Quick start for code changes
```bash
git clone <your fork> && cd <repo>
npm ci
npm run build && npm test        # fast checks
npx playwright install chromium  # once, for browser tests
npm run e2e                      # the full browser suite takes a few minutes
```
Open `exam.html` in a browser to try your change. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first — it explains where everything lives.

### Rules of the road
1. **Edit `src/`, never the generated files.** `exam.html`, `exams.js` and `sw.js` are produced by `npm run build`; commit the regenerated files with your change. CI fails if they are stale.
2. **Match the surrounding style:** 4-space indentation, no frameworks, build DOM with `App.util.el` (never `innerHTML` with exam content), small comments that explain *why*.
3. **Every user-visible string goes in both dictionaries** (`src/js/11-i18n-v3.js` for new keys). A unit test fails otherwise.
4. **Add or update tests.** Logic → `tests/*.test.js`; behaviour in the browser → `tests/e2e-*.js`.
5. **Keep it accessible:** real form controls, labels, keyboard support, enough contrast. `npm run audit` must pass.
6. **Never restrict free navigation between questions** in any exam mode — it is a deliberate product decision.
7. **Backward compatibility:** keep the `examsim` storage keys and `ExamSim.register(...)` working.

## Contributing an exam
- It must be **your own work** or content you are allowed to share. Do not submit questions copied from copyrighted or confidential material (certification vendor question banks, paid courses…).
- Follow [docs/EXAM-FORMAT.md](docs/EXAM-FORMAT.md) and run `node tools/validate-exam.js your.exam` — it must have no errors; read the hints too.
- Quality checklist: one clearly best answer; wrong options plausible and **about as long as the right one**; an explanation for every question; a mix of difficulty; no trick wording.
- Put the file in the repository root and run `npm run build` so it appears in the catalog.

## Pull requests
1. Fork, create a branch from `main`.
2. Make a focused change; describe *what* and *why* in the pull request.
3. Make sure `npm run check` passes and, for UI changes, include a screenshot.
4. Be kind in reviews — see the [Code of Conduct](CODE_OF_CONDUCT.md).

By contributing you agree that your work is released under the project's license (GPL-3.0).
