# ExamSimulator
Exam Simulator

## Uso
- `exam.html?content=NomeFile` carica `NomeFile.js` dalla stessa cartella (es. `?content=managedServices`).
- In alternativa apri `exam.html` e usa il pulsante **Carica file domande** (`.js` o `.json`).

## Formato del file domande
`window.ExamData = { config: {...}, questions: [...] }` — vedi `managedServices.js`.
Ogni domanda: `id`, `topic`, `question`, `options[]`, `answer[]` (indici base 0; più di uno = risposta multipla), `explanation`.
