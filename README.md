# ExamSimulator
Exam Simulator

## Usage
- Open `exam.html` and pick an exam from the list, or open `exam.html?content=NAME` to load `NAME.exam` directly.
- The header has a language toggle (EN/IT) and a light/dark theme toggle; both choices are remembered.
- Interrupted sessions are saved in the browser and can be resumed.

## Adding an exam
1. Put the exam file in this folder, named `NAME.exam` (a JavaScript file that sets `window.ExamData`).
2. Add an entry to `window.ExamCatalog` in `exams.js` (`file: "NAME"`, plus a bilingual title and description).

## Exam file format
`window.ExamData = { config: {...}, questions: [...] }` — see `managedServices.exam`.
Each question: `id`, `topic`, `question`, `options[]`, `answer[]` (0-based indexes; more than one = multiple answer), `explanation`, and optionally `shuffle: false` to keep the option order.
