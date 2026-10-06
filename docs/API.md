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
`App.storage` — `listAttempts`, `listSessions`, `allQStats`, `exportData`, `importData`, … (one key, `examsim:v2`, versioned).
