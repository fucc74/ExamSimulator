# Exam file format (version 2)

An exam is a text file named `NAME.exam`:

```js
ExamSim.register({ ...pure JSON... });
```

Over http(s) the JSON is parsed (never executed); from `file://` the browser runs the file, so keep it a plain `ExamSim.register(<JSON>)` call.
Validate with `node tools/validate-exam.js NAME.exam`.

## Top level
| field | required | notes |
|---|---|---|
| `format` | yes | `2` |
| `id` | yes | short identifier; progress is stored under this id |
| `title` | yes | string or `{ "en": "...", "it": "..." }` |
| `description`, `code`, `version` | no | `code` is shown in the header; `version` drives the "what's new" notice |
| `changelog` | no | `[{ "version": "1.1", "date": "2026-03-31", "notes": ["Fixed Q3", {"en": "…", "it": "…"}] }]`, newest first |
| `settings` | no | `passThreshold` (0–100, default 70), `timePerQuestionSec` (default 90), `shuffleOptions` (default true), `scoring`, `pauses`, `strictTime` (see below) |
| `topics` | no | map `topicId → name` (string or localized) |
| `modes` | no | exam-defined modes, see below |
| `questions` | yes | list of questions |

Any text (`title`, question `text`, `options`, `explanation`, …) can be a plain string or an object per language; the UI language selects it.

## Modes (`modes[]`)
```json
{ "id": "official", "name": {"en": "Official simulation"}, "selection": "weighted", "exam": true,
  "count": 50, "timeSec": 5400, "passThreshold": 65,
  "groups": [ { "topics": ["Networking"], "weight": 10 }, ... ] }
```
`selection`: `random`, `balanced` (one per topic first), or `weighted` (needs `groups`, weights should sum to `count`).
`exam: true` makes exam mode (no per-answer check) the default. A mode can also set `scoring`, `pauses` and `strictTime`. Reserved ids (built-in): `all`, `review`, `mistakes`, `flagged`, `unseen`, `topic`, `difficulty`.

## Questions
Common fields: `id` (unique), `uid` (optional stable id, default `id`), `topic`, `text`, `explanation`, `difficulty` (1–3), `tags`, `source`, `estimatedSec`, `shuffle: false` (keep option order),
`points` (weight of the question, default 1), `mandatory: true` (the exam is failed unless this question is fully correct), `rev` (integer, bump it when you rewrite a question: learners see it again in spaced-repetition review), `retired: true` (kept in the file so old statistics still match, but never asked).

| `type` | fields | answer |
|---|---|---|
| `single` | `options` (2–6) | `answer: [index]` |
| `multiple` | `options` (2–6) | `answer: [i, j, …]` — say how many to select in `text` |
| `truefalse` | — | `answer: true/false` |
| `ordering` | `items` listed in the **correct** order (shuffled on screen) | implicit |
| `matching` | `pairs: [{left, right}]` (right side shuffled) | implicit |
| `numeric` | — | `answer: 8` or `{ "value": 8, "tolerance": 0.5, "unit": "GPU" }` |
| `scenario` | `context`, `parts: [question, …]` (any type except scenario) | correct only if all parts are |

`type` can be omitted: it is inferred (`parts` → scenario, `pairs` → matching, `items` → ordering, boolean answer → truefalse, several answers → multiple).

## Rich text
`text`, `options`, `explanation`, `context`, ordering items and matching pairs accept a safe Markdown subset:
`**bold**`, `*italic*`, `` `code` ``, fenced code blocks, `-` and `1.` lists, `>` quotes, `|` tables, `![alt](src)` images and `$x^2$` formulas (LaTeX subset rendered as MathML).
Image sources: `data:image/…;base64,…`, `https://…` or a relative `.png/.jpg/.webp/.gif/.svg` path. HTML is never interpreted.

## Scoring, pauses, strict clock
```json
"settings": { "scoring": { "partialCredit": true, "wrongPenalty": 0.25, "unansweredPenalty": 0 }, "pauses": 1, "strictTime": true }
```
- `partialCredit`: multiple-answer, ordering, matching and scenario questions give a fraction of the points.
- `wrongPenalty` / `unansweredPenalty`: fraction (0–1) of the question points removed; the total never goes below 0.
- `pauses` (exam modes only): number of pauses allowed (omit = unlimited). `strictTime`: the clock keeps running while the page is closed.
- Precedence: built-in defaults < the user's Options page (practice modes only) < `settings` < the mode.
- Navigation between questions is **never** restricted.

## Local exams, import and export
Exams created in the browser (wizard/editor) are stored in the browser and listed with the bundled ones; they use the same format.
Import accepts `.exam`/`.json`, `.csv` (columns `id, topic, type, difficulty, text, options, answer, explanation, tags, points`; options separated by line breaks, answer as letters `A;C`, `true`, `42±0.5 unit`; ordering lists the items in the right order; matching uses `left => right`) and text/Markdown (numbered questions, `A)` options or `- [x]` checkboxes, `Answer:`/`Risposta:`, `Explanation:`/`Spiegazione:`, `## Topic` headings).
Export writes `.exam`, CSV, Markdown (single/multiple/true-false/numeric) and Anki (tab-separated, HTML cards).
