/* Conversions between exams and text formats: free-text/Markdown parser (import wizard), Markdown, CSV and Anki export.
   Pure functions, no DOM. Question types supported in text: single, multiple, truefalse, numeric.
   CSV also carries ordering and matching. Scenario questions are exported to JSON/Anki only. */
App.convert = (function () {
    const LETTERS = 'ABCDEFGH';
    const loc = (v, lang) => (v === undefined || v === null) ? '' : (typeof v === 'string' || typeof v === 'number') ? String(v) : (v[lang] || v.en || Object.values(v)[0] || '');
    const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'general';

    // ---------------------------------------------------------------- text parser
    const RE = {
        qWord: /^\s*(?:#{1,6}\s*)?(?:Question|Domanda|Quesito|Q\.?)\s*(\d{1,4})\s*(?:[.):\-]\s*|\s+|$)(.*)$/i,
        qNum: /^\s*(?:#{1,6}\s*)?(\d{1,4})\s*[.):]\s+(.*)$/,
        checkbox: /^\s*[-*+]\s*\[( |x|X)\]\s*(?:\(?([A-Ha-h])[.)]\s+)?(.+)$/,
        letter: /^\s*\(?([A-Ha-h])[.)]\s+(.+)$/,
        bullet: /^\s*[-*•]\s+(.+)$/,
        answer: /^\s*(?:\*\*)?(?:Correct\s+answers?|Right\s+answers?|Answers?|Ans|Rispost[ae](?:\s+corrett[ae]|\s+esatta)?|Soluzione|Correct|Corretta|Giusta)(?:\*\*)?\s*[:=\-]\s*(?:\*\*)?(.+?)\s*$/i,
        expl: /^\s*(?:\*\*)?(?:Explanation|Spiegazione|Rationale|Motivazione|Why|Commento)(?:\*\*)?\s*[:\-]\s*(?:\*\*)?(.*)$/i,
        header: /^\s*(?:(#{1,6})\s+(.+?)\s*#*|(?:Topic|Section|Sezione|Argomento|Domain|Dominio|Chapter|Capitolo)\s*[:\-]\s*(.+)|={3,}\s*(.+?)\s*=*|-{3,}\s*(.+?)\s*-{3,})\s*$/i,
        mark: /\s*(?:✓|✔|\(correct\)|\(corretta\)|\[correct\]|\[corretta\])\s*$/i
    };

    function parseAnswerValue(v, optCount) {
        let s = String(v).replace(/^\*+|\*+$/g, '').trim().replace(/[.;]$/, '');
        const word = optCount > 0 ? /^(true|vero)$/i : /^(true|vero|v|t)$/i, wordF = optCount > 0 ? /^(false|falso)$/i : /^(false|falso|f)$/i;
        if (word.test(s)) return { bool: true };
        if (wordF.test(s)) return { bool: false };
        const num = s.match(/^(-?\d+(?:[.,]\d+)?)\s*(?:(?:±|\+\/-)\s*(\d+(?:[.,]\d+)?))?\s*(.*)$/);
        const lets = s.match(/^([A-Ha-h](?:\s*(?:,|;|&|\/|\+|and|e|ed)\s*[A-Ha-h])*)\s*(?:[.):]|$)/);
        if (lets) return { letters: (lets[1].toUpperCase().match(/[A-H]/g) || []).map(c => LETTERS.indexOf(c)) };
        if (/^[A-Ha-h]{2,6}$/.test(s)) return { letters: s.toUpperCase().split('').map(c => LETTERS.indexOf(c)) };
        if (num) {
            const out = { number: Number(num[1].replace(',', '.')) };
            if (num[2]) out.tolerance = Number(num[2].replace(',', '.'));
            if (num[3] && num[3].trim()) out.unit = num[3].trim();
            return out;
        }
        return { text: s };
    }

    function parseText(input) {
        const lines = String(input || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
        const meta = {}, topics = {}, warnings = [], qs = [];
        let cur = null, field = null, topicKey = 'general', lastNum = 0;
        const addTopic = name => { const k = slug(name); topics[k] = name.trim(); return k; };

        function finish() {
            if (!cur) return;
            const q = cur; cur = null;
            q.text = q.text.trim(); if (q.explanation !== undefined) q.explanation = q.explanation.trim();
            const issues = [];
            const opts = q.options.map(o => o.trim());
            const correct = new Set(q.marked);
            let a = q.answerRaw !== undefined ? parseAnswerValue(q.answerRaw, opts.length) : null;
            let out = { id: q.n || qs.length + 1, topic: q.topic, text: q.text };
            if (opts.length >= 2) {
                if (a && a.letters) a.letters.forEach(i => correct.add(i));
                else if (a && a.text) { const i = opts.findIndex(o => o.toLowerCase() === a.text.toLowerCase()); if (i >= 0) correct.add(i); }
                else if (a && a.number !== undefined && Number.isInteger(a.number) && a.number >= 1 && a.number <= opts.length) correct.add(a.number - 1);
                const ans = Array.from(correct).filter(i => i < opts.length).sort((x, y) => x - y);
                out.type = ans.length > 1 ? 'multiple' : 'single';
                out.options = opts; out.answer = ans;
                if (!ans.length) issues.push('noAnswer');
            } else if (a && a.bool !== undefined && opts.length === 0) {
                out.type = 'truefalse'; out.answer = a.bool;
            } else if (a && a.number !== undefined && opts.length === 0) {
                out.type = 'numeric';
                out.answer = (a.tolerance || a.unit) ? Object.assign({ value: a.number }, a.tolerance ? { tolerance: a.tolerance } : {}, a.unit ? { unit: a.unit } : {}) : a.number;
            } else {
                out.type = 'single'; out.options = opts; out.answer = [];
                issues.push(opts.length ? 'fewOptions' : 'noOptions');
            }
            if (q.explanation) out.explanation = q.explanation;
            if (!out.text) issues.push('noText');
            out._issues = issues;
            qs.push(out);
        }

        const open = (n, text) => { finish(); cur = { n, text: text || '', options: [], marked: [], topic: topicKey }; field = 'text'; lastNum = n; };

        for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            if (!line.trim()) { if (cur && field === 'text' && cur.text) cur.text += '\n'; else if (cur && field === 'expl' && cur.explanation) cur.explanation += '\n'; continue; }
            let m;
            const qm = (m = line.match(RE.qWord)) || (m = line.match(RE.qNum));
            if (qm && (!cur || cur.options.length >= 2 || cur.answerRaw !== undefined || Number(m[1]) === lastNum + 1) && !(cur && field === 'expl' && Number(m[1]) !== lastNum + 1)) { open(Number(m[1]), m[2]); continue; }
            if (cur) {
                if ((m = line.match(RE.expl))) { cur.explanation = m[1]; field = 'expl'; continue; }
                if ((m = line.match(RE.answer))) { cur.answerRaw = m[1]; field = 'answer'; continue; }
                if (field !== 'expl' && field !== 'answer') {
                    let om;
                    if ((om = line.match(RE.checkbox))) { cur.options.push(om[3].replace(RE.mark, '')); if (om[1].toLowerCase() === 'x') cur.marked.push(cur.options.length - 1); field = 'opt'; continue; }
                    if ((om = line.match(RE.letter)) && LETTERS.indexOf(om[1].toUpperCase()) === cur.options.length) {
                        const mk = RE.mark.test(om[2]);
                        cur.options.push(om[2].replace(RE.mark, '')); if (mk) cur.marked.push(cur.options.length - 1); field = 'opt'; continue;
                    }
                    if (field === 'opt' && (om = line.match(RE.bullet))) { cur.options.push(om[1]); field = 'opt'; continue; }
                }
            }
            if ((m = line.match(RE.header)) && (!cur || cur.options.length || cur.answerRaw !== undefined || field === 'expl' || !cur.text.trim() || /^#/.test(line.trim()) && !line.match(/^\s*#{1,6}\s+\d/))) {
                const level = m[1] ? m[1].length : 0;
                const name = (m[2] || m[3] || m[4] || m[5] || '').trim();
                if (level === 1 && !qs.length && !cur && !meta.title) { meta.title = name; continue; }
                finish(); topicKey = addTopic(name); field = null;
                continue;
            }
            if (!cur) {
                const bq = line.match(/^\s*>\s?(.*)$/);
                if (bq && !qs.length) { meta.description = (meta.description ? meta.description + ' ' : '') + bq[1].trim(); continue; }
                if (!qs.length && !meta.title && line.trim().length < 120) { meta.title = line.trim(); continue; }
                continue;
            }
            // continuation of the current field
            const t = line.replace(/^\s+/, '');
            if (field === 'text') cur.text += (cur.text && !cur.text.endsWith('\n') ? '\n' : '') + t;
            else if (field === 'opt') cur.options[cur.options.length - 1] += ' ' + t;
            else if (field === 'expl') cur.explanation += (cur.explanation ? '\n' : '') + t;
            else if (field === 'answer') cur.answerRaw += ' ' + t;
        }
        finish();
        if (!qs.length) warnings.push('noQuestions');
        // keep only topics that are used
        const used = {};
        qs.forEach(q => { if (!topics[q.topic] && q.topic === 'general') topics.general = 'General'; });
        Object.keys(topics).forEach(k => { if (qs.some(q => q.topic === k)) used[k] = topics[k]; });
        // unique ids
        const seen = new Set();
        qs.forEach((q, i) => { if (seen.has(q.id)) q.id = i + 1 + 1000; seen.add(q.id); });
        return { meta, topics: used, questions: qs, warnings };
    }

    // Builds a complete format-2 exam from parsed pieces. Drops the transient _issues field.
    function buildExam(p) {
        const questions = p.questions.map(q => { const c = Object.assign({}, q); delete c._issues; return c; });
        const n = questions.length;
        const exam = {
            format: 2, id: p.id || slug(p.title || 'my-exam'), title: p.title || 'My exam', version: p.version || '1.0',
            settings: { passThreshold: 70, timePerQuestionSec: 90, shuffleOptions: true },
            topics: p.topics && Object.keys(p.topics).length ? p.topics : undefined,
            modes: [{ id: 'mock', name: { en: 'Mock exam', it: 'Simulazione' }, selection: 'balanced', count: Math.min(20, n), exam: true }],
            questions
        };
        if (p.description) exam.description = p.description;
        if (p.code) exam.code = p.code;
        if (!exam.topics) delete exam.topics;
        return exam;
    }

    // ---------------------------------------------------------------- Markdown export
    function toMarkdown(exam, lang) {
        const L = v => loc(v, lang);
        const out = ['# ' + L(exam.title)];
        if (exam.description) out.push('> ' + L(exam.description).replace(/\n+/g, ' '));
        out.push('');
        const skipped = [];
        let topic = null, n = 0;
        (exam.questions || []).forEach(q => {
            const type = App.questionType(q);
            if (!['single', 'multiple', 'truefalse', 'numeric'].includes(type)) { skipped.push(q.id); return; }
            if (q.topic !== topic) {
                topic = q.topic;
                out.push('## ' + L(exam.topics && exam.topics[topic] !== undefined ? exam.topics[topic] : topic), '');
            }
            n++;
            out.push('### ' + n + '. ' + L(q.text !== undefined ? q.text : q.question).replace(/\n{2,}/g, '\n'));
            if (type === 'single' || type === 'multiple') {
                const ans = Array.isArray(q.answer) ? q.answer : [q.answer];
                q.options.forEach((o, i) => out.push('- [' + (ans.includes(i) ? 'x' : ' ') + '] ' + L(o).replace(/\n/g, ' ')));
            } else if (type === 'truefalse') out.push('Answer: ' + (q.answer ? 'True' : 'False'));
            else {
                const a = q.answer && typeof q.answer === 'object' ? q.answer : { value: q.answer };
                out.push('Answer: ' + a.value + (a.tolerance ? ' ±' + a.tolerance : '') + (a.unit || q.unit ? ' ' + (a.unit || q.unit) : ''));
            }
            if (q.explanation) out.push('Explanation: ' + L(q.explanation).replace(/\n+/g, ' '));
            out.push('');
        });
        return { text: out.join('\n'), skipped };
    }

    // ---------------------------------------------------------------- CSV
    const CSV_COLUMNS = ['id', 'topic', 'type', 'difficulty', 'text', 'options', 'answer', 'explanation', 'tags', 'points'];

    function csvCell(v) { const s = v === undefined || v === null ? '' : String(v); return /[",\n\r;\t]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

    function toCSV(exam, lang) {
        const L = v => loc(v, lang);
        const rows = [CSV_COLUMNS.join(',')], skipped = [];
        (exam.questions || []).forEach(q => {
            const type = App.questionType(q);
            if (type === 'scenario') { skipped.push(q.id); return; }
            let options = '', answer = '';
            if (type === 'single' || type === 'multiple') {
                options = q.options.map(o => L(o).replace(/\n/g, ' ')).join('\n');
                answer = (Array.isArray(q.answer) ? q.answer : [q.answer]).map(i => LETTERS[i]).join(';');
            } else if (type === 'truefalse') answer = q.answer ? 'true' : 'false';
            else if (type === 'numeric') { const a = typeof q.answer === 'object' ? q.answer : { value: q.answer }; answer = a.value + (a.tolerance ? '±' + a.tolerance : '') + (a.unit ? ' ' + a.unit : ''); }
            else if (type === 'ordering') options = q.items.map(o => L(o).replace(/\n/g, ' ')).join('\n');
            else if (type === 'matching') options = q.pairs.map(p => L(p.left).replace(/\n/g, ' ') + ' => ' + L(p.right).replace(/\n/g, ' ')).join('\n');
            rows.push([q.id, L(exam.topics && exam.topics[q.topic] !== undefined ? exam.topics[q.topic] : q.topic), type, q.difficulty || '', L(q.text !== undefined ? q.text : q.question), options, answer, L(q.explanation), (q.tags || []).join(';'), q.points || ''].map(csvCell).join(','));
        });
        return { text: '﻿' + rows.join('\r\n') + '\r\n', skipped };
    }

    function parseCSVRows(text, delim) {
        const rows = []; let row = [], cell = '', q = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (q) {
                if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
            } else if (c === '"' && !cell) q = true;
            else if (c === delim) { row.push(cell); cell = ''; }
            else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
            else cell += c;
        }
        if (cell || row.length) { row.push(cell); rows.push(row); }
        return rows.filter(r => r.some(c => c.trim() !== ''));
    }

    const HEAD_ALIASES = {
        id: /^(id|n|no|num|number|numero)$/, topic: /^(topic|argomento|section|sezione|category|categoria|domain|dominio)$/,
        type: /^(type|tipo)$/, difficulty: /^(difficulty|difficolta|livello|level)$/,
        text: /^(text|question|domanda|quesito|testo)$/, options: /^(options|opzioni|choices|risposte)$/,
        answer: /^(answer|answers|correct|correct answer|risposta|risposta corretta|soluzione)$/, explanation: /^(explanation|spiegazione|rationale|motivazione)$/,
        tags: /^(tags|tag)$/, points: /^(points|punti|score|punteggio)$/
    };

    function fromCSV(text) {
        text = String(text || '').replace(/^﻿/, '');
        const first = text.split(/\r?\n/, 1)[0] || '';
        const delim = [',', ';', '\t'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
        const rows = parseCSVRows(text, delim);
        if (rows.length < 2) return { meta: {}, topics: {}, questions: [], warnings: ['noQuestions'] };
        const norm = s => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const head = rows[0].map(norm);
        const col = {}; const optCols = [];
        head.forEach((h, i) => {
            const oc = h.match(/^(?:option|opt|opzione|risposta)?[_ ]?([a-f])$/);
            if (oc && !HEAD_ALIASES.answer.test(h)) { optCols[LETTERS.indexOf(oc[1].toUpperCase())] = i; return; }
            Object.keys(HEAD_ALIASES).forEach(k => { if (col[k] === undefined && HEAD_ALIASES[k].test(h)) col[k] = i; });
        });
        const warnings = []; const topics = {}; const questions = [];
        if (col.text === undefined) return { meta: {}, topics: {}, questions: [], warnings: ['noTextColumn'] };
        rows.slice(1).forEach((r, ri) => {
            const get = k => col[k] === undefined ? '' : (r[col[k]] || '').trim();
            const out = { id: get('id') && /^\d+$/.test(get('id')) ? Number(get('id')) : (get('id') || ri + 1), text: get('text') };
            const tname = get('topic') || 'General'; const tk = slug(tname); topics[tk] = tname; out.topic = tk;
            const issues = [];
            let opts = get('options') ? get('options').split(/\n/).map(s => s.trim()).filter(Boolean) : [];
            if (!opts.length && optCols.length) opts = optCols.map(i => (r[i] || '').trim()).filter(Boolean);
            let type = get('type').toLowerCase();
            const a = get('answer');
            if (!type) type = opts.length >= 2 ? (/[;,&]/.test(a) || /^[A-Ha-h]{2,}$/.test(a) ? 'multiple' : 'single') : (/^(true|false|vero|falso)$/i.test(a) ? 'truefalse' : 'numeric');
            out.type = type;
            if (type === 'single' || type === 'multiple') {
                const pv = parseAnswerValue(a, opts.length);
                let ans = pv.letters || [];
                if (!ans.length && pv.text) { const i = opts.findIndex(o => o.toLowerCase() === pv.text.toLowerCase()); if (i >= 0) ans = [i]; }
                ans = Array.from(new Set(ans)).filter(i => i < opts.length).sort((x, y) => x - y);
                out.type = ans.length > 1 ? 'multiple' : 'single';
                out.options = opts; out.answer = ans;
                if (!ans.length) issues.push('noAnswer');
                if (opts.length < 2) issues.push('fewOptions');
            } else if (type === 'truefalse') {
                const pv = parseAnswerValue(a, 0);
                if (pv.bool === undefined) { issues.push('noAnswer'); out.answer = true; } else out.answer = pv.bool;
            } else if (type === 'numeric') {
                const pv = parseAnswerValue(a, 0);
                if (pv.number === undefined) { issues.push('noAnswer'); out.answer = 0; }
                else out.answer = (pv.tolerance || pv.unit) ? Object.assign({ value: pv.number }, pv.tolerance ? { tolerance: pv.tolerance } : {}, pv.unit ? { unit: pv.unit } : {}) : pv.number;
            } else if (type === 'ordering') {
                out.items = opts; if (opts.length < 2) issues.push('fewOptions');
            } else if (type === 'matching') {
                out.pairs = opts.map(o => { const p = o.split(/\s*(?:=>|->|=)\s*/); return { left: p[0], right: p.slice(1).join(' = ') }; });
                if (out.pairs.length < 2 || out.pairs.some(p => !p.right)) issues.push('fewOptions');
            } else issues.push('badType');
            if (get('difficulty') && [1, 2, 3].includes(Number(get('difficulty')))) out.difficulty = Number(get('difficulty'));
            if (get('explanation')) out.explanation = get('explanation');
            if (get('tags')) out.tags = get('tags').split(/[;,]/).map(s => s.trim()).filter(Boolean);
            if (get('points') && Number(get('points')) > 0) out.points = Number(get('points'));
            if (!out.text) issues.push('noText');
            out._issues = issues;
            questions.push(out);
        });
        return { meta: {}, topics, questions, warnings };
    }

    // ---------------------------------------------------------------- Anki (tab separated, HTML cards)
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    function toAnki(exam, lang) {
        const L = v => App.rich && App.rich.plain ? App.rich.plain(loc(v, lang)) : loc(v, lang);
        const rows = ['#separator:tab', '#html:true', '#tags column:3'];
        const cell = s => s.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
        (exam.questions || []).forEach(q => {
            const type = App.questionType(q);
            let front = esc(L(q.text !== undefined ? q.text : q.question)), back = '';
            if (type === 'single' || type === 'multiple') {
                const ans = Array.isArray(q.answer) ? q.answer : [q.answer];
                front += '<br><br>' + q.options.map((o, i) => LETTERS[i] + ') ' + esc(L(o))).join('<br>');
                back = ans.map(i => '<b>' + LETTERS[i] + ') ' + esc(L(q.options[i])) + '</b>').join('<br>');
            } else if (type === 'truefalse') { front += '<br><i>True / False</i>'; back = '<b>' + (q.answer ? 'True' : 'False') + '</b>'; }
            else if (type === 'numeric') { const a = typeof q.answer === 'object' ? q.answer : { value: q.answer }; back = '<b>' + a.value + (a.tolerance ? ' ±' + a.tolerance : '') + (a.unit ? ' ' + esc(a.unit) : '') + '</b>'; }
            else if (type === 'ordering') back = q.items.map((o, i) => '<b>' + (i + 1) + '.</b> ' + esc(L(o))).join('<br>');
            else if (type === 'matching') { front += '<br><br>' + q.pairs.map(p => esc(L(p.left))).join('<br>'); back = q.pairs.map(p => esc(L(p.left)) + ' → <b>' + esc(L(p.right)) + '</b>').join('<br>'); }
            else if (type === 'scenario') {
                front = esc(L(q.context)) + '<br><br>' + q.parts.map((p, i) => (i + 1) + '. ' + esc(L(p.text !== undefined ? p.text : p.question))).join('<br>');
                back = q.parts.map((p, i) => {
                    const pt = App.questionType(p), ans = Array.isArray(p.answer) ? p.answer : [p.answer];
                    return (i + 1) + '. <b>' + ((pt === 'single' || pt === 'multiple') ? ans.map(k => esc(L(p.options[k]))).join(' / ') : esc(String(typeof p.answer === 'object' ? p.answer.value : p.answer))) + '</b>';
                }).join('<br>');
            }
            if (q.explanation) back += '<br><br>' + esc(L(q.explanation));
            const tags = (q.topic ? [slug(L(exam.topics && exam.topics[q.topic] !== undefined ? exam.topics[q.topic] : q.topic))] : []).concat((q.tags || []).map(slug)).join(' ');
            rows.push(cell(front) + '\t' + cell(back) + '\t' + tags);
        });
        return rows.join('\n') + '\n';
    }

    return { parseText, buildExam, toMarkdown, toCSV, fromCSV, toAnki, parseAnswerValue, slug, CSV_COLUMNS };
})();
