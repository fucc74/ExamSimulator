/* A practice session: items, answers, timers, scoring. No DOM, fully serializable. */
App.Session = (function () {
    const hint = x => x;

    class Session {
        constructor(data) { Object.assign(this, data); }

        // questions: raw question defs; options: {examId, modeId, modeLabel, studyMode, timerMode, totalSec, perQuestionSec, threshold, shuffleOptions}
        static create(questions, options) {
            const items = questions.map(q => App.prepareQuestion(q, { shuffleOptions: options.shuffleOptions !== false }));
            const timerMode = options.timerMode || 'total';
            return new Session({
                id: App.util.uid(), examId: options.examId, modeId: options.modeId, modeLabel: options.modeLabel || options.modeId,
                createdAt: Date.now(), updatedAt: Date.now(), studyMode: !!options.studyMode, threshold: options.threshold,
                items, index: 0, values: {}, validated: {}, applied: {}, times: {},
                timerMode, totalSec: options.totalSec || 0, secondsLeft: options.totalSec || 0,
                perQuestionSec: options.perQuestionSec || 0, qLeft: options.perQuestionSec || 0
            });
        }

        static fromJSON(obj) { return new Session(App.util.clone(obj)); }
        toJSON() { return Object.assign({}, this); }

        get length() { return this.items.length; }
        item(i) { return this.items[i === undefined ? this.index : i]; }
        handler(i) { return App.types[this.item(i).kind]; }
        value(i) { return this.values[i === undefined ? this.index : i]; }
        setValue(i, v) { this.values[i] = v; }
        hasAnswer(i) { return this.handler(i).hasAnswer(this.item(i), this.values[i]); }
        isCorrect(i) { return this.hasAnswer(i) && this.handler(i).isCorrect(this.item(i), this.values[i]); }
        isChecked(i) { return this.validated[i] !== undefined; }
        answeredCount() { let n = 0; for (let i = 0; i < this.length; i++) if (this.hasAnswer(i)) n++; return n; }
        unanswered() { const out = []; for (let i = 0; i < this.length; i++) if (!this.hasAnswer(i)) out.push(i); return out; }

        goTo(i) {
            if (i < 0 || i >= this.length) return false;
            this.index = i;
            if (this.timerMode === 'perQuestion') this.qLeft = this.perQuestionSec;
            return true;
        }

        // Study mode: check one answer now (locks it and records the result in the SRS stats).
        check(i, storage) {
            if (this.isChecked(i)) return this.validated[i];
            if (!this.hasAnswer(i)) return null;
            const ok = this.isCorrect(i);
            this.validated[i] = ok;
            this._record(i, ok, storage);
            return ok;
        }

        _record(i, ok, storage) {
            if (this.applied[i]) return;
            this.applied[i] = true;
            App.recordAnswer(this.examId, this.item(i).uid, ok, this.times[i] || 0, storage);
        }

        // Called once per second by the UI. Returns 'total' | 'question' when a timer runs out.
        tick() {
            this.times[this.index] = (this.times[this.index] || 0) + 1;
            if (this.timerMode === 'total') {
                this.secondsLeft = Math.max(0, this.secondsLeft - 1);
                if (this.secondsLeft <= 0) return 'total';
            } else if (this.timerMode === 'perQuestion') {
                this.qLeft = Math.max(0, this.qLeft - 1);
                if (this.qLeft <= 0) return 'question';
            }
            return null;
        }

        // Scores the session. Returns the attempt record (also emitted as 'sessionEnd').
        submit(storage, now) {
            now = now || Date.now();
            let correct = 0;
            const answers = [];
            for (let i = 0; i < this.length; i++) {
                const answered = this.hasAnswer(i);
                const ok = answered && this.isCorrect(i);
                if (ok) correct++;
                if (answered && !this.applied[i]) this._record(i, ok, storage);
                answers.push([this.item(i).uid, ok ? 1 : 0, this.times[i] || 0, answered ? 1 : 0]);
            }
            const total = this.length;
            const pct = total ? Math.round(100 * correct / total) : 0;
            const attempt = {
                id: App.util.uid(), ts: now, started: this.createdAt, mode: this.modeId, modeLabel: this.modeLabel,
                studyMode: this.studyMode, durationSec: Object.values(this.times).reduce((a, b) => a + b, 0),
                total, correct, pct, threshold: this.threshold, passed: pct >= this.threshold, answers
            };
            App.events.emit('sessionEnd', { session: this, attempt });
            return attempt;
        }
    }
    return Session;
})();
