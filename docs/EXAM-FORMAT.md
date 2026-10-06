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
| `description`, `code`, `version` | no | `code` is shown in the header |
| `settings` | no | `passThreshold` (0–100, default 70), `timePerQuestionSec` (default 90), `shuffleOptions` (default true) |
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
`exam: true` makes exam mode (no per-answer check) the default. Reserved ids (built-in): `all`, `review`, `mistakes`, `flagged`, `unseen`, `topic`, `difficulty`.

## Questions
Common fields: `id` (unique), `uid` (optional stable id, default `id`), `topic`, `text`, `explanation`, `difficulty` (1–3), `tags`, `source`, `estimatedSec`, `shuffle: false` (keep option order).

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
