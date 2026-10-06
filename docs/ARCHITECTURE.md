# QZ architecture

A deep-dive for contributors. User-facing documentation is in the [README](../README.md) and the [user guide](USER-GUIDE.md).

## 1. Design goals
1. **One file, no server.** The app must run by double-clicking `exam.html`. Therefore: no build-time modules at runtime, no `fetch` required, no external scripts (only an optional Google Fonts stylesheet).
2. **No framework, no runtime dependencies.** Plain DOM code. Dev tooling (Playwright, axe-core, pixelmatch) is only used by tests.
3. **Exams are data.** An exam is a JSON document in a `.exam` file; the engine never executes exam content.
4. **Safe by construction.** Text from exam files is never inserted with `innerHTML`; the rich-text renderer builds DOM nodes from a parsed tree.
5. **Local-first.** All user data lives in the browser; sync is opt-in.
6. **Testable core.** Everything except the UI (`80`–`90`) runs in plain Node, so most logic has fast unit tests.

## 2. Repository layout
```
src/template.html        HTML shell with placeholders (/*{{CSS}}*/, /*{{JS}}*/, /*{{CATALOG}}*/, logos)
src/styles/*.css         Concatenated in file-name order
src/js/NN-name.js        Modules, concatenated in file-name order inside one IIFE (shared scope `App`)
src/assets/              Small images embedded into exam.html as data URIs
tools/                   build.js, make-manifest.js, pack.js, validate-exam.js, convert-legacy.js, load-app.js, exam-files.js
tests/                   engine.test.js, v3.test.js (node:test) · e2e*.js (Playwright) · audit.js · visual.js · browser.js · server.js
*.exam                   Exam files
exam.html exams.js sw.js GENERATED (committed)
docs/                    Documentation
```

### Build (`tools/build.js`)
1. `make-manifest.js` reads every `*.exam` and produces the catalog (id, title, description, counts…) → `exams.js` and an embedded default catalog.
2. The template placeholders are replaced with the concatenated CSS, the JavaScript wrapped in `(function(){'use strict'; … })();`, the catalog and the logo data URIs.
3. `exam.html` is written, then `sw.js` is generated: a cache name derived from a hash of the page and the exam files, plus the list of assets to precache.

`npm run check` = build + `git diff --exit-code` on the generated files + tests + validation; CI runs the same.

## 3. JavaScript modules
Files are concatenated alphabetically, so the numeric prefix is the load order. Every file adds to the shared `App` object.

| File | Responsibility |
|---|---|
| `00-core` | `App` namespace, utilities (`shuffle`, `clone`, `el` DOM builder), event bus `App.events`, icon set, registration points (`registerType`, `registerMode`) |
| `10-i18n`, `11-i18n-v3` | EN/IT dictionaries, `App.t(key, params)`, `App.loc(value)` for `{en,it}` content |
| `15-rich` | Safe Markdown-lite parser → AST → DOM (bold, code, lists, tables, images with a whitelist, MathML formulas) |
| `20-types` | Question type handlers (`single`, `multiple`, `truefalse`, `ordering`, `matching`, `numeric`, `scenario`): `prepare`, `hasAnswer`, `isCorrect`, `fraction`, `render`, `renderReview`, `validateDef` |
| `30-schema` | Validation with readable paths, legacy conversion, normalisation, lint |
| `35-scoring` | `App.scoring` (partial credit, penalties, points, mandatory) and `App.examRules` (pauses, strict clock) |
| `40-storage` | Versioned store: preferences, sessions, attempts, per-question stats, reports; export/import with merge |
| `41-idb` | IndexedDB backend (whole store cached in memory, writes sent immediately), fallbacks, `wipeAll` |
| `42-profiles` | Several storage keys, one per profile |
| `43-backup` | Snapshots, transfer codes (gzip + base64url), backup reminder, auto-backup file, Gist sync |
| `44-library` | Exams created or imported in the browser |
| `45-convert` | Text/Markdown parser, CSV, Markdown and Anki export |
| `46-quality` | Question-quality analysis |
| `47-folder` | Exams on disk: remembered folder (File System Access) and folder import |
| `50-modes` | Spaced repetition (Leitner boxes) and the pools of every study mode |
| `55-stats` | Aggregated statistics |
| `60-session` | `App.Session`: items, answers, timers, pause, scoring, serialisable |
| `70-loader` | Loading exams (fetch+parse over http, `<script>` injection from `file://`), catalog merge, error descriptions |
| `80`–`88-ui-*` | UI: common widgets, start page and dashboard, runtime, results, statistics, options, library/editor, tools (search, palette, reports), discovery |
| `90-main` | Boot sequence, routing, service-worker registration and update prompt |

`tools/load-app.js` loads everything except `8x/9x` into a Node VM so tests and tools can call the engine without a browser.

## 4. Data model

### Exam (format 2)
See [EXAM-FORMAT.md](EXAM-FORMAT.md). After `App.schema.prepare` an exam is *normalised*: every question gets a `uid` (stable id used for statistics), a `type`, retired questions are split off, `topicList` and `hasDifficulty` are derived.

### Session
A `Session` holds prepared **items** (shuffled options, remapped answers, `origin` index map for per-option statistics), `values` (answers), `validated`, `times`, timer state and the resolved scoring/pause rules. It is a plain object (`toJSON`/`fromJSON`) so it can be saved after every change and resumed.

### Stored data
`examsim:v2` (default profile) or `examsim:v2:p:<id>`:
```
{ v, prefs: { scoring, examRules, backupRemindDays, lastBackup, … },
  exams: { <examId>: { attempts: [...], sessions: {...}, qstats: { <uid>: { seen, correct, wrong, box, due, last, lastOk, time, flag, note, picks, rev } },
                       reports: [...], meta: { seenVersion } } } }
```
Other keys: `examsim:profiles`, `examsim:ui` (language/theme, mirrored in `localStorage` so a reload cannot lose them), `examsim:lib:*` (own exams), `examsim:gist` (sync token, never exported). Backups are `{ app:'examsim', v:2, prefs, exams, library? }` and are **merged** on import (attempts by id, question stats by `last`).

> The `examsim` prefix and the global `ExamSim` are kept for backward compatibility with existing saved data and exam files, even though the product is called QZ.

## 5. Flows

### Start-up (`90-main`)
`initStorage()` (IndexedDB → localStorage → memory) → set language/theme → wire header buttons → remember (not read) the exam folder handle (1.5 s timeout) → route (`?content=`, `?url=`, `#options`) → register the service worker.

### Loading an exam (`70-loader`)
- over http(s): `fetch` the `.exam` text, strip comments, extract the argument of `ExamSim.register(...)` and `JSON.parse` it — **nothing is executed**;
- from `file://` (where `fetch` is blocked): inject a `<script>` that calls `ExamSim.register`;
- `local:ID` reads from the library, `disk:NAME` from the scanned folder (kept in memory).
The result goes through `App.schema.prepare`; failures become a `LoadError` with a readable explanation.

### Answering
Question handler `render` → `onChange(value)` → `session.setValue` → autosave (debounced). In study mode `session.check` records the result immediately; otherwise `session.submit` scores everything, writes per-question statistics (Leitner update, picked options) and one attempt record, and emits `sessionEnd`.

### Updates
The service worker precaches the shell and exam files (stale-while-revalidate). A new worker waits; the page shows a *new version available* banner and sends `SKIP_WAITING` when you press *Reload*.

### Exam discovery
`App.discovery.done` is false at every start, so `App.loader.catalog()` returns an empty list and the start page shows nothing. It becomes true only through an explicit action: *Check for exams* (served list from `exams.js` over http(s), folder scan, folder import) or saving/importing an exam in *My exams* (`libraryChange`). Exams open in-page (`App.ui.gotoExam`) so the list survives navigation within the visit; direct links (`?content=NAME`) still work without a check.

## 6. Security notes
- Exam text → DOM only through `App.rich` / `textContent`. Images: `data:image/*`, `https:` or relative image paths only. Links: `https:` only.
- Exam files are parsed, never evaluated, over http(s). From `file://` they must be trusted like any local script — only open exam files you trust.
- The Gist token is stored on the device only, in its own key, and is excluded from exports.

## 7. Testing
| Command | What |
|---|---|
| `npm test` | `node:test` unit tests: schema, scoring, storage, profiles, rich text, conversion, backup, library, quality, folder scan, translations (every `App.t('key')` must exist in EN and IT) |
| `npm run e2e` | Playwright suites against `exam.html` (file://) and a local server: every exam answered end-to-end, modes, timers, flags, mobile layout, options, sync (GitHub API mocked), wizard/editor, search, palette, update prompt, folder discovery. `E2E_BROWSER`, `E2E_DEVICE`, `E2E_ONLY` narrow runs |
| `npm run audit` | axe-core on every screen in light and dark, plus size/time budgets |
| `npm run visual` | Screenshot comparison (needs a baseline, see README) |

Tips: the e2e helpers wipe storage with `ExamSim.App.wipeAll()`; IndexedDB writes need a few milliseconds to commit, so tests wait briefly before navigating away right after a change.

## 8. Adding things
- **A question type:** `App.registerType(name, handler)` (see [API.md](API.md)); add validation and a unit test; add translations for any new UI string.
- **A study mode:** `App.registerMode(id, builder)`.
- **A UI string:** add the key to both dictionaries (`11-i18n-v3.js`); the translation test enforces it.
- **A setting:** store it as a preference (`App.storage.setPref`), expose it in `85-ui-options.js`.
- **A language:** add a dictionary and the toggle; content may use any language code in `{en,it,…}` objects.

## 9. Release checklist
1. `npm run check` is green, `npm run e2e` and `npm run audit` pass.
2. Bump `version` in `package.json` and `App.version` in `src/js/00-core.js`.
3. Commit the regenerated `exam.html`, `exams.js`, `sw.js`.
4. Push to `main`; GitHub Pages deploys automatically if enabled.
