# QZ user guide

This guide explains every part of QZ in detail. For a short introduction see the [README](../README.md).

## 1. Starting QZ
- **From a download:** open `exam.html` (double-click). Everything works from `file://`.
- **From a web address:** serve the folder with any static server (or GitHub Pages). Over http(s) QZ can also be installed as an app and works offline after the first visit.
- Deep links: `exam.html?content=NAME` opens `NAME.exam`; `exam.html?url=https://…/NAME.exam` loads an exam from a web address.

## 2. The start page
- The list is **empty until you press Check for exams** (or import/create an exam in this visit); a new visit starts empty again.
- **Exam cards** — one per exam, showing title, description, number of questions and topics, your last score, and *In progress* when a session is waiting.
- **Check for exams** — re-reads your exam folder (see §9). **Import a folder…** copies the `.exam` files of a folder into *My exams*.
- **Header buttons** — command palette (search icon), **Options** (gear), language (EN/IT), theme (light/dark).

## 3. The exam dashboard
After opening an exam you see:
- a colour banner with title, code, version, number of questions/topics, pass mark and time limit (all read from the exam file) and a *mastered* ring (share of questions in the top Leitner boxes);
- an **Exam** menu to switch exam;
- **Statistics**, **Search**, **Export exam**, **Change log** (if the exam has one), **Export/Import progress**;
- **mode tiles** and a **Session setup** form: mode, number of questions, *study mode* switch, timer (default / per question / none);
- the topic list — click a topic to practise only that topic;
- sessions in progress, which you can resume or delete.

### Modes
| Mode | Notes |
|---|---|
| Exam-defined modes (e.g. *Official simulation*) | Set by the author: question selection (`random`, `balanced`, `weighted`), count, time, pass mark, scoring, pauses, strict clock. |
| Full bank / Topic | All questions, or one topic, in file order when you take the whole pool. |
| Spaced-repetition review | Questions due for review today. If none are due, QZ shows the least-mastered ones and tells you. |
| My mistakes | Questions whose latest answer was wrong; they leave the list when you answer them correctly. |
| Flagged / Unseen | Questions you flagged (`M`) / never answered. |
| By difficulty | Only when the exam labels difficulty. |

**Spaced repetition:** each question lives in a box 0–4. A correct answer moves it up one box, a wrong answer sends it to box 0. The next review is due after 0, 1, 3, 7 and 21 days respectively. A question counts as *mastered* from box 3.

## 4. During a session
- **Study mode:** press *Check answer* to lock the answer, see right/wrong marks and the explanation.
- **Exam mode:** answers stay editable; a *review screen* lists unanswered and flagged questions before you submit.
- **Navigation:** previous/next, the progress grid (click any question), keyboard arrows. Free navigation is never restricted.
- **Per question:** flag (`M`), note (saved automatically), *Clear* (`X`), *Report* (`R`).
- **Clock:** the timer pill in the header; yellow and red when time is short. Exam modes can allow a limited number of pauses (`P`); a *strict clock* keeps counting while the page is closed. A pace chip shows whether you are ahead of or behind schedule.
- Sessions autosave: close the tab and resume later from the dashboard.

### Question types
| Type | How to answer |
|---|---|
| Single / multiple choice | Click an option (or press its number/letter). Multiple-choice questions say how many to select. |
| True / false | Choose one of two. |
| Ordering | Move items up/down until they are in the right order. |
| Matching | Choose the partner for every item from the drop-down. |
| Numeric | Type a number (decimals allowed; the exam may define a tolerance and a unit). |
| Scenario | Read the context, then answer each part; it is fully correct only if every part is. |

## 5. Scoring
The result is shown as a percentage and compared with the pass mark. Depending on the exam and your options:
- **Partial credit** — a fraction of the points for partly right multiple-answer, ordering, matching and scenario answers.
- **Penalties** — a wrong or empty answer can subtract a fraction of the question's points (never below 0 in total).
- **Points** — questions can weigh more than 1; **mandatory** questions must be fully correct to pass.
- Rules are resolved in this order: built-in defaults → your *Options* (practice modes only) → exam `settings` → the mode.

At the end you see score, pass/fail, correct/partial/wrong/unanswered counts, time, results by topic, and every question with your answer, the right answer and the explanation. Filter by wrong / unanswered / flagged, practise only the errors, or **print / save as PDF**.

## 6. Statistics
History chart, accuracy per topic, mastered questions, average time per question, best score, hardest questions and the **question quality** panel (too easy, too hard, suspicious answer key, distractors never chosen, slow questions, duplicate options, "all of the above").

## 7. Search and the command palette
- **Search** (`/` or the dashboard button): full text in questions, options, explanations and tags; filter by topic, type, difficulty and status (mistakes, flagged, unseen, mastered, with notes); select results and **practise them**.
- **Command palette** (`Ctrl/⌘ + K`): type to open an exam, start a mode, search, switch theme or language, back up, open Options, and more.
- **Shortcut help**: press `?`.

## 8. Options
| Section | What it does |
|---|---|
| General | Interface language and theme. |
| Scoring | Default partial credit and penalties for practice sessions. |
| Exam rules | Number of pauses and the strict clock for exam modes. |
| Profiles | Add, rename, delete and switch profiles; each has its own progress. Language and theme are per device. |
| Backup | Download a full backup, restore from a file, set the reminder interval, choose an automatic backup file (Chrome/Edge). |
| Sync | Transfer code (copy/paste between devices) and private GitHub Gist sync. |
| My exams | Exams you created or imported: open, edit, export, delete; import or create new ones. |
| Question reports | Problems you reported; export them to send to an exam author. |
| Storage | Where data is stored, how much space is used, and *Delete all data*. |
| About | Version, shortcut help and *Check for updates*. |

### Backup and sync, step by step
- **Backup file:** *Options → Backup → Download full backup*. Restore with *Restore from file* (data is merged, not overwritten).
- **Transfer code:** on device A *Create code* → *Copy*; on device B paste it in the box and press *Import code*. Tick *Include my exams* to bring your own exams too (the code gets much longer).
- **Gist sync:** create a GitHub token with only the `gist` permission, paste it in *Options → Sync*, press *Sync now*. The first sync creates a private gist; its id is remembered. Each sync merges the remote copy, then uploads the result. The token stays on the device and is never part of a backup.
- **Reminder:** a banner appears when there is progress and no backup for the chosen number of days.

## 9. Finding and managing exams
- **Check for exams** — on a web address it lists the exams the site offers; from a downloaded `exam.html` in Chrome/Edge: choose the folder once, the next presses re-read it. Cards are built from the `.exam` files, so a new or edited file shows up straight away. After a browser restart the browser may ask permission again.
- **Import a folder…** — works everywhere; copies every `.exam` in the folder into *My exams* (new ones are added, existing ones updated, bundled ones skipped).
- **Import wizard** — *Options → My exams → Import or create from a file*: choose or paste a file (`.exam`, `.json`, `.csv`, `.md`, `.txt`) and QZ opens it in the editor with every problem flagged.
- **Editor** — metadata, topics, and per question: topic, type (single, multiple, true/false, numeric; other types are edited as JSON), text with formatting and images, options with the correct ones ticked, explanation. A validation panel updates as you type; *Try it* runs the draft without saving.
- **Export** — `.exam`, CSV, Markdown and Anki (tab-separated, HTML cards). CSV also carries ordering and matching; scenarios go to `.exam` and Anki only.

### Text format understood by the importer
```
# Exam title
> optional description

## Topic name

1. Question text?
A) option
B) option
Answer: B
Explanation: why.

2. Select two correct options.
- [x] right
- [ ] wrong
- [x] right too

3. True or false: …
Answer: True

4. Type a number.
Answer: 42 ±0.5 kg
```
Italian labels (`Domanda`, `Risposta`, `Spiegazione`, `Argomento`) work too. Questions without a recognisable answer are flagged for you to fix.

## 10. Troubleshooting
| Symptom | Fix |
|---|---|
| The exam list is empty | Press **Check for exams**, or add `.exam` files and run `npm run build`. |
| "File not found" | `?content=NAME` needs `NAME.exam` in the same folder as `exam.html`. |
| An exam shows validation errors | The message lists the path of each problem; fix the file or open it in the editor. Check with `node tools/validate-exam.js NAME.exam`. |
| Progress disappeared | Browser data was cleared or you opened QZ from a different address/browser: each origin has its own storage. Restore a backup. |
| "Storage is blocked" | Private windows or strict settings can block storage; progress is then kept only until the page closes. Use backups. |
| Folder access asked again | Normal after a browser restart; press **Check for exams**. |
