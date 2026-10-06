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
                scoring: App.scoring.clean(options.scoring), items, index: 0, values: {}, validated: {}, applied: {}, times: {},
                timerMode, totalSec: options.totalSec || 0, secondsLeft: options.totalSec || 0,
                perQuestionSec: options.perQuestionSec || 0, qLeft: options.perQuestionSec || 0,
                pausesAllowed: options.pauses === undefined ? null : options.pauses, pausesUsed: 0, paused: false, strictTime: !!options.strictTime
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
            const it = this.item(i), v = this.values[i];
            let picks;
            if ((it.kind === 'single' || it.kind === 'multiple') && it.origin && v !== undefined) picks = (Array.isArray(v) ? v : [v]).map(k => it.origin[k]).filter(k => k !== undefined);
            App.recordAnswer(this.examId, it.uid, ok, this.times[i] || 0, storage, undefined, { picks, rev: it.rev });
        }

        canPause() { return this.timerMode !== 'none' && !this.paused && (this.pausesAllowed === null || this.pausesUsed < this.pausesAllowed); }
        pausesLeft() { return this.pausesAllowed === null ? null : Math.max(0, this.pausesAllowed - this.pausesUsed); }
        pause() { if (!this.canPause()) return false; this.paused = true; this.pausesUsed++; return true; }
        unpause() { this.paused = false; }

        // Strict time: the clock kept running while the session was closed.
        applyAway(now) {
            if (!this.strictTime || this.paused || this.timerMode !== 'total') return 0;
            const away = Math.max(0, Math.round(((now || Date.now()) - this.updatedAt) / 1000));
            this.secondsLeft = Math.max(0, this.secondsLeft - away);
            return away;
        }

        // Pace for a total timer: positive = ahead of schedule (answers vs. time used).
        pace() {
            if (this.timerMode !== 'total' || !this.totalSec) return null;
            const used = this.totalSec - this.secondsLeft;
            const expected = this.length * used / this.totalSec;
            return Math.round((this.answeredCount() - expected) * 10) / 10;
        }

        // Called once per second by the UI. Returns 'total' | 'question' when a timer runs out.
        tick() {
            if (this.paused) return null;
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

        scoreNow() { return App.scoring.score(this.items, this.values, this.scoring); }
        fraction(i) { return App.fractionOf(this.item(i), this.values[i], this.scoring); }

        // Scores the session. Returns the attempt record (also emitted as 'sessionEnd').
        submit(storage, now) {
            now = now || Date.now();
            const r = this.scoreNow();
            const answers = [];
            for (let i = 0; i < this.length; i++) {
                const answered = r.details[i].answered;
                const ok = answered && this.isCorrect(i);
                if (answered && !this.applied[i]) this._record(i, ok, storage);
                answers.push([this.item(i).uid, ok ? 1 : 0, this.times[i] || 0, answered ? 1 : 0, Math.round(r.details[i].frac * 100) / 100]);
            }
            const total = this.length;
            const passed = r.pct >= this.threshold && !r.mandatoryFailed.length;
            const attempt = {
                id: App.util.uid(), ts: now, started: this.createdAt, mode: this.modeId, modeLabel: this.modeLabel,
                studyMode: this.studyMode, durationSec: Object.values(this.times).reduce((a, b) => a + b, 0),
                total, correct: r.fully, partial: r.partial, pct: r.pct, score: r.score, maxScore: r.max, threshold: this.threshold,
                passed, mandatoryFailed: r.mandatoryFailed.length, scoring: r.custom ? r.cfg : undefined, answers
            };
            App.events.emit('sessionEnd', { session: this, attempt });
            return attempt;
        }
    }
    return Session;
})();
