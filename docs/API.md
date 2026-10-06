# Extension points

Everything lives under the global `ExamSim.App` (also available as `ExamSim.App` in the console).

## Events — `App.events.on(name, fn)`
| event | payload |
|---|---|
| `examLoaded` | `{exam}` |
| `sessionStart` | `{session, resumed}` |
| `answer` | `{session, index, value}` |
| `check` | `{session, index, correct}` (study mode) |
| `navigate` | `{session, index}` |
| `answerRecorded` | `{examId, uid, ok}` (spaced-repetition stats updated) |
| `sessionEnd` | `{session, attempt}` |
| `viewChange` | `{view}` |
| `storageError` | `error` |
| `profileChange` | `{id}` |
| `libraryChange` | `{id}` |
| `pause`, `unpause` | `{session}` |

Handler errors are caught and logged; they never break the engine.

## Custom question types
```js
App.registerType('slider', {
  prepare(def, ctx) { return { uid: String(def.id), kind: 'slider', topic: def.topic, text: def.text, explanation: def.explanation, target: def.answer }; },
  hasAnswer: (item, value) => value !== undefined,
  isCorrect: (item, value) => Number(value) === item.target,
  render({ item, value, onChange, locked, reveal }) { /* return a DOM node; call onChange(v, {silent:true}) */ },
  renderReview(item, value) { /* DOM node for the results page */ },
  validateDef(def, path, report) { report.error(path + '.answer', 'message'); }
});
```

## Custom modes
`App.registerMode('hardest', (exam, stats, now) => exam.questions.filter(...))` adds a practice pool selectable by id.

## Storage
`App.storage` — `listAttempts`, `listSessions`, `allQStats`, `exportData`, `importData`, `addReport/listReports`, `getMeta/setMeta`, … (one key per profile, `examsim:v2` for the default one, versioned).
Data lives in IndexedDB (loaded into memory at start, writes are debounced and flushed when the page is hidden); `localStorage` and memory are fallbacks. `App.storageKind` tells which one is active.
`App.profiles` — `list`, `current`, `create`, `rename`, `remove`, `use(id)`.

## Modules (pure logic, usable from Node through `tools/load-app.js`)
| module | purpose |
|---|---|
| `App.scoring`, `App.examRules` | scoring rules and exam-taking rules resolution |
| `App.rich` | safe Markdown-lite parser/renderer |
| `App.backup` | `snapshot`, `apply`, `encode/decode` (transfer codes), reminder (`due`, `snooze`), Gist sync, auto-backup file |
| `App.library` | local exams: `list`, `get`, `save`, `remove`, `exportAll`, `importAll`, `freeId` |
| `App.convert` | `parseText`, `fromCSV`, `buildExam`, `toCSV`, `toMarkdown`, `toAnki` |
| `App.quality` | `analyze(exam, qstats)` (answer-based findings), `structural(exam)` |

## UI helpers
`App.ui.modal({title, body, actions})`, `App.ui.toast`, `App.ui.openPalette()`, `App.ui.openSearch()`, `App.ui.reportQuestion(item)`, `App.ui.exportExamDialog(exam)`.
