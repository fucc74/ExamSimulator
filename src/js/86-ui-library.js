/* UI: import wizard, exam editor and export dialog.
   Wizard = read a file/pasted text (.exam/.json/.csv/.md/.txt) into a draft exam → editor shows what was understood,
   lets the author fix every question, validates live and saves into the local library (or downloads a .exam file). */
(function () {
    const { el, icon } = App.util;
    const $ = App.ui.$;
    const SIMPLE = ['single', 'multiple', 'truefalse', 'numeric'];
    const LETTERS = 'ABCDEF';

    let E = null;      // editor state: {draft, isNew, issues:{qid:[codes]}, open:Set, images:Map, dirty, validateTimer}

    // ---------------------------------------------------------------- image helpers (data URIs hidden behind @imgN in text boxes)
    function hideImages(str) {
        return String(str || '').replace(/\((data:image\/[^)\s]+)\)/g, (m, uri) => {
            let key = null;
            E.images.forEach((v, k) => { if (v === uri) key = k; });
            if (!key) { key = '@img' + (E.images.size + 1); E.images.set(key, uri); }
            return '(' + key + ')';
        });
    }
    function showImages(str) { return String(str || '').replace(/\((@img\d+)\)/g, (m, k) => E.images.has(k) ? '(' + E.images.get(k) + ')' : m); }

    // Downscales an image file to at most 900 px wide and returns a data URI.
    function imageToDataUri(file, maxW) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                if (/svg/.test(file.type)) { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); return; }
                const scale = Math.min(1, (maxW || 900) / img.width);
                const c = document.createElement('canvas');
                c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                const png = file.type === 'image/png' && c.width * c.height < 250000;
                resolve(c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.82));
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
            img.src = url;
        });
    }

    // ---------------------------------------------------------------- reading sources
    // The content wins over the extension: Android and some browsers rename downloads (ai.exam → ai.exam.txt).
    function detectKind(name, text) {
        const n = String(name || '').toLowerCase();
        const t = String(text || '').replace(/^\uFEFF/, '').trim();
        if (/^(\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*(ExamSim\.register\s*\(|[{[])/.test(t)) return 'exam';
        if (/\.(exam|json|js)(\.txt)?$/.test(n)) return 'exam';
        if (/\.csv$|\.tsv$/.test(n)) return 'csv';
        if (/\.(md|markdown|txt)$/.test(n)) return 'text';
        const first = t.split(/\r?\n/, 1)[0] || '';
        if (/(^|[,;\t])\s*"?(text|question|domanda)"?\s*([,;\t]|$)/i.test(first) && /[,;\t]/.test(first)) return 'csv';
        return 'text';
    }

    // Returns {draft, issues:{id:[codes]}, notes:[strings]} or throws Error(message)
    function readSource(name, text) {
        const kind = detectKind(name, text);
        const fileTitle = String(name || '').replace(/\.txt$/i, '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
        if (kind === 'exam') {
            let data;
            try { data = App.loader.parseText(text); } catch (e) { throw new Error(App.t('wizBadExam', { detail: e.detail || e.message })); }
            if (!data) { try { data = JSON.parse(text); } catch (e) { throw new Error(App.t('wizBadExam', { detail: e.message })); } }
            if (data && data.format === undefined && (data.config || data.questions)) data = App.schema.fromLegacy(data, App.convert.slug(fileTitle || 'imported'));
            if (!data || typeof data !== 'object' || !Array.isArray(data.questions)) throw new Error(App.t('wizBadExam', { detail: 'questions' }));
            return { draft: data, issues: {}, notes: [App.t('wizNoteExam')] };
        }
        const parsed = kind === 'csv' ? App.convert.fromCSV(text) : App.convert.parseText(text);
        if (!parsed.questions.length) throw new Error(App.t(parsed.warnings.includes('noTextColumn') ? 'wizNoTextColumn' : 'wizNoQuestions'));
        const issues = {};
        parsed.questions.forEach(q => { if (q._issues && q._issues.length) issues[q.id] = q._issues.slice(); });
        const draft = App.convert.buildExam({ title: parsed.meta.title || fileTitle || App.t('wizDefaultTitle'), description: parsed.meta.description, questions: parsed.questions, topics: parsed.topics });
        return { draft, issues, notes: [App.t(kind === 'csv' ? 'wizNoteCsv' : 'wizNoteText', { n: parsed.questions.length })] };
    }

    // ---------------------------------------------------------------- wizard
    App.ui.openWizard = function () {
        const file = el('input', { type: 'file', id: 'wiz-file', accept: '.exam,.json,.js,.csv,.tsv,.md,.markdown,.txt,text/plain,text/csv,application/json' });
        const area = el('textarea', { id: 'wiz-text', rows: 9, placeholder: App.t('wizPastePlaceholder') });
        const msg = el('p', { class: 'hint', id: 'wiz-msg', role: 'alert' });
        let fileName = '';
        file.addEventListener('change', () => {
            const f = file.files[0]; if (!f) return;
            fileName = f.name;
            const r = new FileReader();
            r.onload = () => { area.value = String(r.result); msg.textContent = App.t('wizLoaded', { name: f.name, kb: Math.max(1, Math.round(f.size / 1024)) }); };
            r.readAsText(f);
        });
        const body = el('div', { class: 'wizard' },
            el('p', { text: App.t('wizIntro') }),
            el('ul', { class: 'wiz-formats' },
                el('li', {}, el('b', { text: '.exam / .json' }), el('span', { text: ' — ' + App.t('wizFmtExam') })),
                el('li', {}, el('b', { text: '.csv' }), el('span', { text: ' — ' + App.t('wizFmtCsv') })),
                el('li', {}, el('b', { text: '.md / .txt' }), el('span', { text: ' — ' + App.t('wizFmtText') }))),
            el('div', { class: 'field' }, el('label', { for: 'wiz-file', text: App.t('wizChooseFile') }), file),
            el('div', { class: 'field' }, el('label', { for: 'wiz-text', text: App.t('wizOrPaste') }), area),
            el('details', { class: 'wiz-example' }, el('summary', { text: App.t('wizExampleTitle') }), el('pre', { class: 'rich-pre', text: App.t('wizExample') })),
            msg);
        const m = App.ui.modal({
            title: App.t('wizTitle'), body, wide: true,
            actions: [{ label: App.t('wizContinue'), icon: 'next', onclick: () => {
                try {
                    if (!area.value.trim()) { msg.textContent = App.t('wizEmpty'); return false; }
                    const r = readSource(fileName, area.value);
                    openEditorWith(r.draft, { isNew: true, issues: r.issues, notes: r.notes });
                } catch (e) { msg.textContent = e.message; msg.style.color = 'var(--error)'; return false; }
            } }, { label: App.t('cancelBtn'), cls: 'btn-ghost' }]
        });
        return m;
    };

    // ---------------------------------------------------------------- editor
    const catalogIds = () => App.loader.knownIds();

    App.ui.openEditor = function (id) {
        if (id) {
            const raw = App.library.get(id);
            if (!raw) { App.ui.toast(App.t('errNotFound', { name: id })); return; }
            openEditorWith(App.util.clone(raw), { isNew: false, issues: {}, notes: [] });
        } else {
            openEditorWith({
                format: 2, id: 'my-exam', title: App.t('wizDefaultTitle'), version: '1.0',
                settings: { passThreshold: 70, timePerQuestionSec: 90, shuffleOptions: true },
                topics: { general: 'General' },
                questions: [{ id: 1, topic: 'general', type: 'single', text: '', options: ['', ''], answer: [0] }]
            }, { isNew: true, issues: {}, notes: [] });
        }
    };

    function openEditorWith(draft, opts) {
        draft.format = 2;
        if (!draft.topics) { draft.topics = {}; }
        draft.questions.forEach(q => { if (q.topic && draft.topics[q.topic] === undefined) draft.topics[q.topic] = q.topic; });
        if (opts.isNew) draft.id = App.library.freeId(draft.id || App.convert.slug(App.loc(draft.title)), catalogIds());
        E = { draft, isNew: opts.isNew, origId: draft.id, issues: opts.issues || {}, notes: opts.notes || [], open: new Set(), images: new Map(), dirty: !!opts.isNew, cards: {}, validateTimer: null };
        // first questions with problems start open
        draft.questions.forEach(q => { if ((E.issues[q.id] || []).length && E.open.size < 3) E.open.add(q.id); });
        App.ui.show('library');
        App.ui.renderLibrary();
    }

    const qIndexById = id => E.draft.questions.findIndex(q => q.id === id);
    const nextId = () => E.draft.questions.reduce((m, q) => Math.max(m, typeof q.id === 'number' ? q.id : 0), 0) + 1;
    const isSimple = q => SIMPLE.includes(App.questionType(q)) && ['text', 'explanation'].every(k => q[k] === undefined || typeof q[k] === 'string') && (!q.options || q.options.every(o => typeof o === 'string'));
    const touch = () => { E.dirty = true; clearTimeout(E.validateTimer); E.validateTimer = setTimeout(refreshValidation, 250); };

    function exportDraft() {
        const d = App.util.clone(E.draft);
        const unhide = v => typeof v === 'string' ? showImages(v) : Array.isArray(v) ? v.map(unhide) : (v && typeof v === 'object') ? Object.keys(v).reduce((o, k) => { o[k] = unhide(v[k]); return o; }, {}) : v;
        d.questions = d.questions.map(q => {
            const c = unhide(q);
            Object.keys(c).forEach(k => { if (c[k] === '' || c[k] === undefined) delete c[k]; });
            return c;
        });
        if (!d.description) delete d.description;
        if (!d.code) delete d.code;
        return d;
    }

    function validation() {
        const raw = exportDraft();
        const rep = App.schema.validate(raw);
        return rep;
    }

    function refreshValidation() {
        const panel = $('ed-validation');
        if (!panel) return;
        const rep = validation();
        panel.textContent = '';
        panel.className = 'ed-validation ' + (rep.ok() ? 'ok' : 'bad');
        panel.appendChild(el('div', { class: 'ed-val-head' }, icon(rep.ok() ? 'check' : 'flag', 16),
            el('b', { text: rep.ok() ? App.t('edValid') : App.t('edProblems', { n: rep.errors.length }) }),
            rep.warnings.length ? el('span', { class: 'chip warn', text: App.t('edWarnings', { n: rep.warnings.length }) }) : null));
        const bad = new Set();
        rep.errors.slice(0, 8).forEach(e => panel.appendChild(el('p', { class: 'ed-val-line', text: '• ' + e.path + ': ' + e.message })));
        rep.errors.concat(rep.warnings).forEach(e => { const m = String(e.path).match(/^questions\[(\d+)\]/); if (m) bad.add(Number(m[1])); });
        rep.warnings.slice(0, 4).forEach(w => panel.appendChild(el('p', { class: 'ed-val-line warn', text: '! ' + w.path + ': ' + w.message })));
        E.draft.questions.forEach((q, i) => {
            const card = E.cards[q.id];
            if (card) card.classList.toggle('has-problem', rep.errors.some(e => e.path.startsWith('questions[' + i + ']')));
        });
        const save = $('ed-save'); if (save) save.disabled = !rep.ok();
        const dl = $('ed-download'); if (dl) dl.disabled = !rep.ok();
    }

    App.ui.renderLibrary = function () {
        if (!E) { App.ui.closeOptions(); return; }
        const v = $('view-library');
        v.textContent = '';
        const d = E.draft;
        const head = el('div', { class: 'row between opt-head' },
            el('div', {}, el('h1', { text: E.isNew ? App.t('edTitleNew') : App.t('edTitleEdit') }), el('p', { class: 'subtitle', text: App.t('edSub') })),
            App.ui.btn(App.t('backBtn'), 'back', 'btn-secondary btn-sm', () => { if (!E.dirty || confirm(App.t('edDiscardConfirm'))) { E = null; App.ui.openOptions(); } }, { id: 'ed-back' }));
        v.appendChild(head);
        if (E.notes.length) v.appendChild(el('div', { class: 'banner info', id: 'ed-notes' }, icon('book', 18), el('span', { class: 'banner-text', text: E.notes.join(' ') })));

        // metadata
        const bind = (input, setter) => { input.addEventListener('input', () => { setter(input.value); touch(); }); return input; };
        const meta = el('div', { class: 'card ed-meta' },
            el('div', { class: 'ed-meta-grid' },
                el('div', { class: 'field' }, el('label', { for: 'ed-title', text: App.t('edExamTitle') }), bind(el('input', { type: 'text', id: 'ed-title', value: typeof d.title === 'string' ? d.title : App.loc(d.title), disabled: typeof d.title !== 'string' }), x => { d.title = x; })),
                el('div', { class: 'field' }, el('label', { for: 'ed-id', text: App.t('edExamId') }), bind(el('input', { type: 'text', id: 'ed-id', value: d.id, disabled: !E.isNew }), x => { d.id = x.trim(); }), el('p', { class: 'hint', text: App.t('edIdHint') })),
                el('div', { class: 'field' }, el('label', { for: 'ed-version', text: App.t('edVersion') }), bind(el('input', { type: 'text', id: 'ed-version', value: d.version || '' }), x => { d.version = x; })),
                el('div', { class: 'field' }, el('label', { for: 'ed-pass', text: App.t('edPass') }), bind(el('input', { type: 'number', id: 'ed-pass', min: 0, max: 100, value: (d.settings && d.settings.passThreshold) || 70 }), x => { d.settings = Object.assign({}, d.settings, { passThreshold: Number(x) || 70 }); })),
                el('div', { class: 'field ed-wide' }, el('label', { for: 'ed-desc', text: App.t('edDescription') }), bind(el('input', { type: 'text', id: 'ed-desc', value: typeof d.description === 'string' ? d.description : '', disabled: d.description !== undefined && typeof d.description !== 'string' }), x => { d.description = x; }))));
        v.appendChild(meta);

        // topics
        const topicBox = el('details', { class: 'card ed-topics' }, el('summary', { class: 'ed-topics-sum' }, icon('grid', 16), el('b', { text: App.t('edTopics') }), el('span', { class: 'chip', text: String(Object.keys(d.topics).length) })));
        const topicList = el('div', { class: 'ed-topic-list' });
        Object.keys(d.topics).forEach(k => {
            const used = d.questions.filter(q => q.topic === k).length;
            topicList.appendChild(el('div', { class: 'ed-topic-row' },
                el('code', { text: k }),
                bind(el('input', { type: 'text', value: typeof d.topics[k] === 'string' ? d.topics[k] : App.loc(d.topics[k]), disabled: typeof d.topics[k] !== 'string', 'aria-label': k }), x => { d.topics[k] = x || k; }),
                el('span', { class: 'chip', text: App.t('nQuestions', { n: used }) })));
        });
        const newTopic = el('input', { type: 'text', id: 'ed-new-topic', placeholder: App.t('edNewTopic'), maxLength: 40 });
        topicBox.appendChild(topicList);
        topicBox.appendChild(el('div', { class: 'opt-add' }, newTopic, App.ui.btn(App.t('edAddTopic'), 'star', 'btn-sm', () => {
            const name = newTopic.value.trim(); if (!name) return;
            let key = App.convert.slug(name), n = 2; while (d.topics[key] !== undefined) key = App.convert.slug(name) + '-' + (n++);
            d.topics[key] = name; touch(); App.ui.renderLibrary();
        })));
        v.appendChild(topicBox);

        // validation + questions
        v.appendChild(el('div', { id: 'ed-validation', class: 'ed-validation', role: 'status' }));
        const list = el('div', { id: 'ed-questions', class: 'ed-questions' });
        E.cards = {};
        d.questions.forEach((q, i) => { const c = questionCard(q, i); E.cards[q.id] = c; list.appendChild(c); });
        v.appendChild(el('div', { class: 'section-title' }, el('h2', { text: App.t('edQuestions', { n: d.questions.length }) }),
            el('span', { class: 'toolbar' },
                App.ui.btn(App.t('edExpandAll'), 'chevron', 'btn-ghost btn-sm', () => { d.questions.forEach(q => E.open.add(q.id)); App.ui.renderLibrary(); }),
                App.ui.btn(App.t('edCollapseAll'), 'chevron', 'btn-ghost btn-sm', () => { E.open.clear(); App.ui.renderLibrary(); }))));
        v.appendChild(list);
        v.appendChild(el('div', { class: 'toolbar', style: 'margin:12px 0' }, App.ui.btn(App.t('edAddQuestion'), 'star', 'btn-sm', () => {
            const id = nextId();
            d.questions.push({ id, topic: Object.keys(d.topics)[0] || 'general', type: 'single', text: '', options: ['', ''], answer: [0] });
            if (!Object.keys(d.topics).length) d.topics.general = 'General';
            E.open.add(id); touch(); App.ui.renderLibrary();
            const c = E.cards[id]; if (c) c.scrollIntoView({ block: 'center' });
        }, { id: 'ed-add' })));

        // footer
        v.appendChild(el('div', { class: 'ed-footer card' },
            App.ui.btn(E.isNew ? App.t('edSaveNew') : App.t('edSave'), 'check', '', () => saveDraft(), { id: 'ed-save' }),
            App.ui.btn(App.t('edDownload'), 'download', 'btn-secondary', () => App.ui.exportExamDialog(exportDraft(), { raw: true }), { id: 'ed-download' }),
            App.ui.btn(App.t('edPreview'), 'play', 'btn-ghost', () => previewDraft(), { id: 'ed-preview' })));
        refreshValidation();
    };

    function saveDraft() {
        const raw = exportDraft();
        if (E.isNew) raw.id = App.library.freeId(raw.id, catalogIds().concat(App.library.has(raw.id) ? [] : []));
        const r = App.library.save(raw);
        if (!r.ok) { App.ui.toast(App.t('edSaveFail'), 5000); return; }
        E.isNew = false; E.dirty = false; E.origId = r.id; E.draft.id = r.id;
        App.ui.toast(App.t('edSaved'));
        App.ui.renderLibrary();
        window.__lastSavedExamId = r.id;
    }

    // Opens the draft as a temporary exam (not saved) so it can be tried right away
    function previewDraft() {
        const raw = exportDraft();
        const { exam, report } = App.schema.prepare(raw, raw.id);
        if (!exam) { App.ui.toast(App.t('edNotValid', { n: report.errors.length }), 5000); return; }
        exam.sourceFile = 'preview'; exam.preview = true; exam.id = 'preview-' + exam.id;
        const ret = E;
        App.ui.openExam(exam);
        App.ui.toast(App.t('edPreviewNote'), 6000);
        App.state.editorReturn = ret;
    }

    // ---------------------------------------------------------------- question card
    function questionCard(q, i) {
        const d = E.draft;
        const open = E.open.has(q.id);
        const type = App.questionType(q);
        const problems = E.issues[q.id] || [];
        const card = el('div', { class: 'ed-q' + (open ? ' open' : '') + (problems.length ? ' has-problem' : ''), dataset: { qid: String(q.id) } });
        const excerpt = App.rich.plain(typeof q.text === 'string' ? q.text : App.loc(q.text)).replace(/\s+/g, ' ').slice(0, 90) || App.t('edEmptyText');
        const summary = el('button', { type: 'button', class: 'ed-q-head', aria: { expanded: open ? 'true' : 'false' }, onclick: () => { if (E.open.has(q.id)) E.open.delete(q.id); else E.open.add(q.id); replaceCard(q.id); } },
            el('span', { class: 'ed-q-num', text: String(i + 1) }),
            el('span', { class: 'ed-q-text', text: excerpt }),
            el('span', { class: 'chip', text: App.t('type_' + type) }),
            problems.length ? el('span', { class: 'chip warn', text: problems.map(p => App.t('issue_' + p)).join(' · ') }) : null,
            icon('chevron', 16));
        card.appendChild(summary);
        if (!open) return card;
        const body = el('div', { class: 'ed-q-body' });
        const simple = isSimple(q);

        if (!simple) {
            body.appendChild(el('p', { class: 'hint', text: App.t('edJsonHint') }));
            const ta = el('textarea', { class: 'ed-json', rows: 12, spellcheck: false, 'aria-label': 'JSON' });
            ta.value = hideImages(JSON.stringify(q, null, 1));
            const msg = el('p', { class: 'hint', role: 'alert' });
            ta.addEventListener('input', () => {
                try {
                    const parsed = JSON.parse(showImages(ta.value));
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object expected');
                    const idx = qIndexById(q.id);
                    if (parsed.id === undefined) parsed.id = q.id;
                    d.questions[idx] = parsed; msg.textContent = ''; touch();
                } catch (e) { msg.textContent = 'JSON: ' + e.message; msg.style.color = 'var(--error)'; }
            });
            body.appendChild(ta); body.appendChild(msg);
        } else {
            const upd = fn => { fn(); touch(); };
            // topic + type + difficulty + points
            const topicSel = el('select', { id: 'edq-topic-' + q.id });
            Object.keys(d.topics).forEach(k => topicSel.appendChild(el('option', { value: k, text: typeof d.topics[k] === 'string' ? d.topics[k] : App.loc(d.topics[k]) })));
            topicSel.value = q.topic;
            topicSel.addEventListener('change', () => upd(() => { q.topic = topicSel.value; }));
            const typeSel = el('select', { id: 'edq-type-' + q.id });
            SIMPLE.forEach(t => typeSel.appendChild(el('option', { value: t, text: App.t('type_' + t) })));
            typeSel.value = type;
            typeSel.addEventListener('change', () => { changeType(q, typeSel.value); touch(); replaceCard(q.id); });
            const diff = el('select', { id: 'edq-diff-' + q.id });
            [['', '—'], [1, App.t('diffEasy')], [2, App.t('diffMedium')], [3, App.t('diffHard')]].forEach(([v, l]) => diff.appendChild(el('option', { value: String(v), text: l })));
            diff.value = q.difficulty ? String(q.difficulty) : '';
            diff.addEventListener('change', () => upd(() => { if (diff.value) q.difficulty = Number(diff.value); else delete q.difficulty; }));
            body.appendChild(el('div', { class: 'ed-q-row' },
                el('div', { class: 'field' }, el('label', { for: topicSel.id, text: App.t('edTopic') }), topicSel),
                el('div', { class: 'field' }, el('label', { for: typeSel.id, text: App.t('edType') }), typeSel),
                el('div', { class: 'field' }, el('label', { for: diff.id, text: App.t('edDifficulty') }), diff)));

            // text with image button
            const text = el('textarea', { id: 'edq-text-' + q.id, rows: 3 });
            text.value = hideImages(q.text || '');
            text.addEventListener('input', () => upd(() => { q.text = showImages(text.value); card.querySelector('.ed-q-text').textContent = App.rich.plain(text.value).replace(/\s+/g, ' ').slice(0, 90) || App.t('edEmptyText'); }));
            const imgInput = el('input', { type: 'file', accept: 'image/*', class: 'hidden', 'aria-label': App.t('edAddImage') });
            imgInput.addEventListener('change', async () => {
                const f = imgInput.files[0]; if (!f) return;
                try {
                    const uri = await imageToDataUri(f);
                    const key = hideImages('(' + uri + ')').slice(1, -1);
                    const pos = text.selectionStart === undefined ? text.value.length : text.selectionStart;
                    text.value = text.value.slice(0, pos) + '\n![' + (f.name || 'image').replace(/[\[\]()]/g, '') + '](' + key + ')\n' + text.value.slice(pos);
                    text.dispatchEvent(new Event('input'));
                } catch (e) { App.ui.toast(App.t('edImageFail'), 4000); }
                imgInput.value = '';
            });
            body.appendChild(el('div', { class: 'field' },
                el('label', { for: text.id, text: App.t('edText') }), text,
                el('div', { class: 'toolbar' }, App.ui.btn(App.t('edAddImage'), 'upload', 'btn-ghost btn-sm', () => imgInput.click()), imgInput),
                el('p', { class: 'hint', text: App.t('edRichHint') })));

            // answers
            if (type === 'single' || type === 'multiple') {
                const multi = type === 'multiple';
                const ans = Array.isArray(q.answer) ? q.answer : [q.answer];
                const list = el('div', { class: 'ed-options' });
                q.options.forEach((o, k) => {
                    const inp = el('input', { type: 'text', value: hideImages(o), 'aria-label': App.t('edOption', { n: LETTERS[k] }) });
                    inp.addEventListener('input', () => upd(() => { q.options[k] = showImages(inp.value); }));
                    const mark = el('input', { type: multi ? 'checkbox' : 'radio', name: 'edq-ans-' + q.id, checked: ans.includes(k), 'aria-label': App.t('edCorrect', { n: LETTERS[k] }) });
                    mark.addEventListener('change', () => upd(() => {
                        const cur = Array.isArray(q.answer) ? q.answer.slice() : [q.answer];
                        q.answer = multi ? (mark.checked ? cur.concat(k).filter((x, p, a) => a.indexOf(x) === p).sort((a, b) => a - b) : cur.filter(x => x !== k)) : [k];
                    }));
                    list.appendChild(el('div', { class: 'ed-option' },
                        el('label', { class: 'ed-correct', title: App.t('edCorrect', { n: LETTERS[k] }) }, mark, el('span', { text: LETTERS[k] })),
                        inp,
                        App.ui.btn('', 'x', 'btn-ghost btn-sm', () => {
                            if (q.options.length <= 2) return;
                            q.options.splice(k, 1);
                            q.answer = (Array.isArray(q.answer) ? q.answer : [q.answer]).filter(x => x !== k).map(x => x > k ? x - 1 : x);
                            touch(); replaceCard(q.id);
                        }, { title: App.t('deleteBtn'), 'aria-label': App.t('deleteBtn') })));
                });
                body.appendChild(el('div', { class: 'field' }, el('label', { text: App.t(multi ? 'edOptionsMulti' : 'edOptionsSingle') }), list,
                    q.options.length < 6 ? App.ui.btn(App.t('edAddOption'), 'star', 'btn-ghost btn-sm', () => { q.options.push(''); touch(); replaceCard(q.id); }) : null));
            } else if (type === 'truefalse') {
                const wrap = el('div', { class: 'ed-tf' });
                [[true, App.t('tfTrue')], [false, App.t('tfFalse')]].forEach(([val, label]) => {
                    const r = el('input', { type: 'radio', name: 'edq-tf-' + q.id, checked: q.answer === val });
                    r.addEventListener('change', () => upd(() => { q.answer = val; }));
                    wrap.appendChild(el('label', { class: 'check-inline' }, r, el('span', { text: label })));
                });
                body.appendChild(el('div', { class: 'field' }, el('label', { text: App.t('edCorrectAnswer') }), wrap));
            } else {
                const a = typeof q.answer === 'object' && q.answer !== null ? q.answer : { value: q.answer };
                const setA = patch => upd(() => { const cur = typeof q.answer === 'object' && q.answer !== null ? q.answer : { value: q.answer }; const n = Object.assign({}, cur, patch); Object.keys(n).forEach(k => { if (n[k] === '' || n[k] === undefined || (k === 'tolerance' && !n[k])) delete n[k]; }); q.answer = (Object.keys(n).length === 1 && 'value' in n) ? n.value : n; });
                const val = el('input', { type: 'number', step: 'any', value: a.value === undefined ? '' : a.value, id: 'edq-val-' + q.id }); val.addEventListener('input', () => setA({ value: val.value === '' ? 0 : Number(val.value) }));
                const tol = el('input', { type: 'number', step: 'any', min: 0, value: a.tolerance || '' }); tol.addEventListener('input', () => setA({ tolerance: Number(tol.value) || 0 }));
                const unit = el('input', { type: 'text', value: a.unit || '', maxLength: 20 }); unit.addEventListener('input', () => setA({ unit: unit.value }));
                body.appendChild(el('div', { class: 'ed-q-row' },
                    el('div', { class: 'field' }, el('label', { for: val.id, text: App.t('edValue') }), val),
                    el('div', { class: 'field' }, el('label', { text: App.t('edTolerance') }), tol),
                    el('div', { class: 'field' }, el('label', { text: App.t('unit') }), unit)));
            }

            const expl = el('textarea', { id: 'edq-expl-' + q.id, rows: 2 });
            expl.value = hideImages(q.explanation || '');
            expl.addEventListener('input', () => upd(() => { q.explanation = showImages(expl.value); }));
            body.appendChild(el('div', { class: 'field' }, el('label', { for: expl.id, text: App.t('edExplanation') }), expl));
        }

        body.appendChild(el('div', { class: 'toolbar ed-q-tools' },
            App.ui.btn('', 'chevron', 'btn-ghost btn-sm', () => moveQ(q.id, -1), { title: App.t('moveUp'), 'aria-label': App.t('moveUp'), disabled: i === 0 }),
            App.ui.btn('', 'chevron', 'btn-ghost btn-sm flip', () => moveQ(q.id, 1), { title: App.t('moveDown'), 'aria-label': App.t('moveDown'), disabled: i === d.questions.length - 1 }),
            App.ui.btn(App.t('edDuplicate'), 'layers', 'btn-ghost btn-sm', () => { const c = App.util.clone(q); c.id = nextId(); d.questions.splice(i + 1, 0, c); E.open.add(c.id); touch(); App.ui.renderLibrary(); }),
            App.ui.btn(App.t('deleteBtn'), 'trash', 'btn-danger btn-sm', () => { if (d.questions.length <= 1) return; d.questions.splice(i, 1); E.open.delete(q.id); touch(); App.ui.renderLibrary(); })));
        card.appendChild(body);
        return card;
    }

    function replaceCard(id) {
        const idx = qIndexById(id);
        const old = E.cards[id];
        if (idx < 0 || !old) return;
        const fresh = questionCard(E.draft.questions[idx], idx);
        old.replaceWith(fresh);
        E.cards[id] = fresh;
        refreshValidation();
    }
    function moveQ(id, delta) {
        const arr = E.draft.questions, i = qIndexById(id), j = i + delta;
        if (j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        touch(); App.ui.renderLibrary();
    }
    function changeType(q, type) {
        const prev = App.questionType(q);
        if (type === 'single' || type === 'multiple') {
            if (!Array.isArray(q.options) || q.options.length < 2) q.options = ['', ''];
            let a = Array.isArray(q.answer) ? q.answer.filter(x => Number.isInteger(x) && x < q.options.length) : [];
            if (!a.length) a = [0];
            if (type === 'single') a = [a[0]];
            q.answer = a;
        } else if (type === 'truefalse') { delete q.options; q.answer = true; }
        else { delete q.options; q.answer = 0; }
        q.type = type;
        if (prev === type) return;
    }

    // ---------------------------------------------------------------- export dialog
    // exam: raw (or normalized) exam object. opts.raw: it can be written as a .exam file.
    App.ui.exportExamDialog = function (exam, opts) {
        opts = opts || {};
        const multiLang = JSON.stringify(exam).includes('"it":') && JSON.stringify(exam).includes('"en":');
        const langSel = el('select', { id: 'exp-lang' });
        [['en', 'English'], ['it', 'Italiano']].forEach(([v, l]) => langSel.appendChild(el('option', { value: v, text: l })));
        langSel.value = App.lang;
        const note = el('p', { class: 'hint', id: 'exp-note' });
        const fname = ext => (exam.id || 'exam') + ext;
        const run = (kind) => {
            const lang = langSel.value;
            let r;
            if (kind === 'exam') { App.ui.download(fname('.exam'), App.library.toFileText(exam), 'application/octet-stream'); note.textContent = App.t('expDone'); return; }
            if (kind === 'csv') { r = App.convert.toCSV(exam, lang); App.ui.download(fname('.csv'), r.text, 'text/csv'); }
            else if (kind === 'md') { r = App.convert.toMarkdown(exam, lang); App.ui.download(fname('.md'), r.text, 'text/markdown'); }
            else { App.ui.download(fname('-anki.txt'), App.convert.toAnki(exam, lang), 'text/plain'); r = { skipped: [] }; }
            note.textContent = App.t('expDone') + (r.skipped.length ? ' ' + App.t('expSkipped', { n: r.skipped.length }) : '');
        };
        const body = el('div', {},
            el('p', { class: 'hint', text: App.t('expIntro') }),
            multiLang ? el('div', { class: 'field' }, el('label', { for: 'exp-lang', text: App.t('expLanguage') }), langSel, el('p', { class: 'hint', text: App.t('expLangHint') })) : null,
            el('div', { class: 'exp-grid' },
                opts.raw ? App.ui.btn('.exam', 'download', 'btn-block', () => run('exam'), { id: 'exp-exam' }) : null,
                App.ui.btn('CSV', 'download', 'btn-secondary btn-block', () => run('csv'), { id: 'exp-csv' }),
                App.ui.btn('Markdown', 'download', 'btn-secondary btn-block', () => run('md'), { id: 'exp-md' }),
                App.ui.btn('Anki (TSV)', 'download', 'btn-secondary btn-block', () => run('anki'), { id: 'exp-anki' })),
            note);
        return App.ui.modal({ title: App.t('expTitle'), body, actions: [{ label: App.t('closeBtn'), cls: 'btn-ghost' }] });
    };
})();
