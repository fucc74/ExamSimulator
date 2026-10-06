/* Question types. Each handler implements:
     prepare(def, ctx)            -> runtime item (shuffles, normalizes the answer)
     hasAnswer(item, value)       -> bool
     isCorrect(item, value)       -> bool
     render(ctx)                  -> DOM node; ctx = {item, value, onChange(value,{silent}), locked, reveal, uid}
     renderReview(item, value)    -> DOM node (answers with correct/wrong marks)
     validateDef(def, path, rep)  -> adds problems with rep.error(path, msg) / rep.warn(path, msg)
   Custom types can be added with App.registerType(name, handler). */
(function () {
    const { el, shuffle, sameSet, isObj } = App.util;
    const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

    App.util.isLoc = v => typeof v === 'string' ? v.trim().length > 0
        : (isObj(v) && Object.keys(v).length > 0 && Object.values(v).every(x => typeof x === 'string' && x.trim().length > 0));

    App.questionType = function (def) {
        if (def.type) return def.type;
        if (Array.isArray(def.parts)) return 'scenario';
        if (Array.isArray(def.pairs)) return 'matching';
        if (Array.isArray(def.items)) return 'ordering';
        if (typeof def.answer === 'boolean') return 'truefalse';
        if (isObj(def.answer) && 'value' in def.answer) return 'numeric';
        const a = Array.isArray(def.answer) ? def.answer : [def.answer];
        return a.length > 1 ? 'multiple' : 'single';
    };

    const textOf = d => d.text !== undefined ? d.text : d.question;

    function baseItem(def, ctx) {
        return {
            uid: def.uid !== undefined ? String(def.uid) : String(def.id),
            id: def.id, topic: def.topic, text: textOf(def), explanation: def.explanation,
            difficulty: def.difficulty, tags: def.tags, source: def.source, estimatedSec: def.estimatedSec
        };
    }

    function prepareAny(def, ctx) {
        const type = App.questionType(def);
        const h = App.types[type];
        if (!h) throw new Error('Unknown question type "' + type + '"');
        const item = h.prepare(def, ctx || {});
        item.kind = item.kind || type;
        return item;
    }
    App.prepareQuestion = prepareAny;
    App.typeHandler = item => App.types[item.kind];

    // ---- single / multiple / truefalse ---------------------------------------------------
    function choicePrepare(def, ctx, multi) {
        const item = baseItem(def, ctx);
        const identity = def.options.map((_, i) => i);
        const keep = def.shuffle === false || ctx.shuffleOptions === false;
        const order = keep ? identity : shuffle(identity);
        const answers = (Array.isArray(def.answer) ? def.answer : [def.answer]);
        item.options = order.map(i => def.options[i]);
        item.answer = answers.map(a => order.indexOf(a)).sort((a, b) => a - b);
        item.kind = multi ? 'multiple' : 'single';
        return item;
    }

    function choiceRender(multi) {
        return function (ctx) {
            const { item, value, onChange, locked, reveal, uid } = ctx;
            let current = multi ? (Array.isArray(value) ? [...value] : []) : value;
            const isPicked = i => multi ? current.includes(i) : current === i;
            const group = el('div', { class: 'options-list', role: multi ? 'group' : 'radiogroup' });
            const labels = [];

            const paint = () => labels.forEach((lab, i) => {
                let cls = 'option-card' + (isPicked(i) ? ' selected' : '');
                if (reveal && item.answer.includes(i)) cls += ' correct-reveal';
                else if (reveal && isPicked(i)) cls += ' incorrect-reveal';
                lab.className = cls;
                lab.querySelector('input').checked = isPicked(i);
            });

            item.options.forEach((opt, i) => {
                const input = el('input', { type: multi ? 'checkbox' : 'radio', name: 'opt-' + uid, class: 'option-input', disabled: !!locked, checked: isPicked(i) });
                input.addEventListener('change', () => {
                    if (multi) {
                        current = current.includes(i) ? current.filter(x => x !== i) : [...current, i].sort((a, b) => a - b);
                        onChange(current, { silent: true });
                    } else {
                        current = i;
                        onChange(i, { silent: true });
                    }
                    paint();
                });
                const lab = el('label', { class: 'option-card', dataset: { index: i } },
                    input,
                    el('span', { class: 'option-marker', text: LETTERS[i] }),
                    el('span', { class: 'option-text', text: App.loc(opt) }));
                labels.push(lab);
                group.appendChild(lab);
            });
            paint();
            return group;
        };
    }

    function choiceReview(item, value) {
        const chosen = Array.isArray(value) ? value : (value === undefined ? [] : [value]);
        const box = el('div', { class: 'review-options' });
        item.options.forEach((opt, k) => {
            let cls = 'review-option';
            if (item.answer.includes(k)) cls += ' review-correct';
            else if (chosen.includes(k)) cls += ' review-wrong';
            box.appendChild(el('p', { class: cls }, el('strong', { text: LETTERS[k] + ': ' }), App.loc(opt)));
        });
        return box;
    }

    function choiceValidate(multi) {
        return function (def, path, rep) {
            if (!Array.isArray(def.options) || def.options.length < 2 || def.options.length > 6) {
                rep.error(path + '.options', 'must be a list of 2 to 6 options'); return;
            }
            def.options.forEach((o, i) => { if (!App.util.isLoc(o)) rep.error(path + '.options[' + i + ']', 'must be a non-empty string or {en,it} object'); });
            const a = Array.isArray(def.answer) ? def.answer : [def.answer];
            if (!a.length || a.some(x => !Number.isInteger(x))) { rep.error(path + '.answer', 'must be a list of option indexes (0-based)'); return; }
            a.forEach(x => { if (x < 0 || x >= def.options.length) rep.error(path + '.answer', 'index ' + x + ' is out of range (' + def.options.length + ' options)'); });
            if (new Set(a).size !== a.length) rep.error(path + '.answer', 'contains duplicate indexes');
            if (multi && a.length < 2) rep.error(path + '.answer', 'type "multiple" needs at least 2 correct answers');
            if (!multi && a.length !== 1) rep.error(path + '.answer', 'type "single" needs exactly 1 correct answer (use "multiple" otherwise)');
            if (multi) {
                const txt = App.loc(textOf(def)) + ' ' + (isObj(textOf(def)) ? Object.values(textOf(def)).join(' ') : '');
                if (!/select|choose|seleziona|scegli|\b(two|three|four|five|due|tre|quattro|cinque|[2-5])\b/i.test(txt)) rep.warn(path + '.text', 'multiple-answer question should say how many answers to select');
            }
        };
    }

    App.registerType('single', {
        prepare: (d, c) => choicePrepare(d, c, false),
        hasAnswer: (it, v) => v !== undefined,
        isCorrect: (it, v) => v !== undefined && it.answer.includes(v) && it.answer.length === 1,
        render: choiceRender(false), renderReview: choiceReview, validateDef: choiceValidate(false)
    });
    App.registerType('multiple', {
        prepare: (d, c) => choicePrepare(d, c, true),
        hasAnswer: (it, v) => Array.isArray(v) && v.length > 0,
        isCorrect: (it, v) => Array.isArray(v) && sameSet(v, it.answer),
        render: choiceRender(true), renderReview: choiceReview, validateDef: choiceValidate(true)
    });
    App.registerType('truefalse', {
        prepare(def, ctx) {
            const d = Object.assign({}, def, {
                options: def.options || [{ en: 'True', it: 'Vero' }, { en: 'False', it: 'Falso' }],
                answer: typeof def.answer === 'boolean' ? [def.answer ? 0 : 1] : def.answer,
                shuffle: false
            });
            const item = choicePrepare(d, ctx, false);
            item.kind = 'single';
            return item;
        },
        validateDef(def, path, rep) {
            if (typeof def.answer !== 'boolean' && !(Array.isArray(def.answer) && def.answer.length === 1)) {
                rep.error(path + '.answer', 'true/false questions need answer: true or false');
            }
        }
    });

    // ---- ordering ------------------------------------------------------------------------
    App.registerType('ordering', {
        prepare(def, ctx) {
            const item = baseItem(def, ctx);
            item.items = def.items;
            const n = def.items.length;
            let perm = shuffle([...Array(n).keys()]);
            for (let tries = 0; tries < 10 && perm.every((x, i) => x === i); tries++) perm = shuffle(perm);
            item.shownOrder = perm;
            return item;
        },
        hasAnswer: (it, v) => Array.isArray(v),
        isCorrect: (it, v) => Array.isArray(v) && v.length === it.items.length && v.every((x, i) => x === i),
        render(ctx) {
            const { item, onChange, locked, reveal } = ctx;
            let order = Array.isArray(ctx.value) ? [...ctx.value] : [...item.shownOrder];
            const wrap = el('div', { class: 'ordering' });
            const hint = el('p', { class: 'type-hint', text: App.t('hintOrdering') });
            const list = el('ol', { class: 'ordering-list' });
            wrap.appendChild(hint);
            wrap.appendChild(list);
            let focusPos = null, focusDir = null;

            function draw() {
                list.textContent = '';
                order.forEach((idx, p) => {
                    let cls = 'ordering-row';
                    if (reveal) cls += idx === p ? ' row-ok' : ' row-bad';
                    const up = el('button', { type: 'button', class: 'mini-btn', text: '↑', disabled: locked || p === 0, aria: { label: App.t('moveUp') } });
                    const down = el('button', { type: 'button', class: 'mini-btn', text: '↓', disabled: locked || p === order.length - 1, aria: { label: App.t('moveDown') } });
                    const move = (to) => {
                        const tmp = order[p]; order[p] = order[to]; order[to] = tmp;
                        focusPos = to; focusDir = to > p ? 'down' : 'up';
                        onChange([...order], { silent: true });
                        draw();
                    };
                    up.addEventListener('click', () => move(p - 1));
                    down.addEventListener('click', () => move(p + 1));
                    list.appendChild(el('li', { class: cls },
                        el('span', { class: 'order-pos', text: String(p + 1) }),
                        el('span', { class: 'order-text', text: App.loc(item.items[idx]) }),
                        el('span', { class: 'order-btns' }, up, down)));
                });
                if (focusPos !== null) {
                    const row = list.children[focusPos];
                    const btns = row.querySelectorAll('button');
                    const target = (focusDir === 'down' ? btns[1] : btns[0]);
                    (target && !target.disabled ? target : (btns[0].disabled ? btns[1] : btns[0])).focus();
                    focusPos = null;
                }
            }
            draw();
            if (reveal) {
                wrap.appendChild(el('p', { class: 'type-hint', text: App.t('correctAnswer') + ':' }));
                wrap.appendChild(el('ol', { class: 'ordering-list correct-order' }, ...item.items.map((t, i) =>
                    el('li', { class: 'ordering-row row-ok' }, el('span', { class: 'order-pos', text: String(i + 1) }), el('span', { class: 'order-text', text: App.loc(t) })))));
            }
            return wrap;
        },
        renderReview(item, value) {
            const order = Array.isArray(value) ? value : null;
            const box = el('div', { class: 'review-options' });
            box.appendChild(el('p', { class: 'type-hint', text: App.t('yourAnswer') + ':' }));
            if (!order) box.appendChild(el('p', { class: 'review-option review-wrong', text: '—' }));
            else order.forEach((idx, p) => box.appendChild(el('p', { class: 'review-option ' + (idx === p ? 'review-correct' : 'review-wrong') }, el('strong', { text: (p + 1) + '. ' }), App.loc(item.items[idx]))));
            box.appendChild(el('p', { class: 'type-hint', text: App.t('correctAnswer') + ':' }));
            item.items.forEach((t, i) => box.appendChild(el('p', { class: 'review-option review-correct' }, el('strong', { text: (i + 1) + '. ' }), App.loc(t))));
            return box;
        },
        validateDef(def, path, rep) {
            if (!Array.isArray(def.items) || def.items.length < 2 || def.items.length > 10) { rep.error(path + '.items', 'must list 2 to 10 items in the CORRECT order'); return; }
            def.items.forEach((o, i) => { if (!App.util.isLoc(o)) rep.error(path + '.items[' + i + ']', 'must be a non-empty string or {en,it} object'); });
        }
    });

    // ---- matching ------------------------------------------------------------------------
    App.registerType('matching', {
        prepare(def, ctx) {
            const item = baseItem(def, ctx);
            item.lefts = def.pairs.map(p => p.left);
            item.rights = def.pairs.map(p => p.right);
            item.rightOrder = shuffle([...Array(def.pairs.length).keys()]);
            return item;
        },
        hasAnswer: (it, v) => Array.isArray(v) && v.some(x => x >= 0),
        isCorrect: (it, v) => Array.isArray(v) && v.length === it.lefts.length && v.every((x, i) => x === i),
        render(ctx) {
            const { item, onChange, locked, reveal } = ctx;
            const val = Array.isArray(ctx.value) ? [...ctx.value] : item.lefts.map(() => -1);
            const wrap = el('div', { class: 'matching' }, el('p', { class: 'type-hint', text: App.t('hintMatching') }));
            item.lefts.forEach((left, i) => {
                const sel = el('select', { class: 'match-select', disabled: !!locked, aria: { label: App.loc(left) } });
                sel.appendChild(el('option', { value: '-1', text: App.t('chooseOne') }));
                item.rightOrder.forEach(r => sel.appendChild(el('option', { value: String(r), text: App.loc(item.rights[r]) })));
                sel.value = String(val[i]);
                sel.addEventListener('change', () => { val[i] = parseInt(sel.value, 10); onChange([...val], { silent: true }); });
                let cls = 'match-row';
                if (reveal) cls += val[i] === i ? ' row-ok' : ' row-bad';
                const row = el('div', { class: cls }, el('span', { class: 'match-left', text: App.loc(left) }), sel);
                if (reveal && val[i] !== i) row.appendChild(el('span', { class: 'match-correct', text: '→ ' + App.loc(item.rights[i]) }));
                wrap.appendChild(row);
            });
            return wrap;
        },
        renderReview(item, value) {
            const v = Array.isArray(value) ? value : [];
            const box = el('div', { class: 'review-options' });
            item.lefts.forEach((left, i) => {
                const ok = v[i] === i;
                const chosen = v[i] >= 0 && v[i] !== undefined ? App.loc(item.rights[v[i]]) : '—';
                box.appendChild(el('p', { class: 'review-option ' + (ok ? 'review-correct' : 'review-wrong') },
                    el('strong', { text: App.loc(left) + ' → ' }), ok ? chosen : chosen + '  (' + App.t('correctAnswer') + ': ' + App.loc(item.rights[i]) + ')'));
            });
            return box;
        },
        validateDef(def, path, rep) {
            if (!Array.isArray(def.pairs) || def.pairs.length < 2 || def.pairs.length > 8) { rep.error(path + '.pairs', 'must be a list of 2 to 8 {left, right} pairs'); return; }
            def.pairs.forEach((p, i) => {
                if (!p || !App.util.isLoc(p.left) || !App.util.isLoc(p.right)) rep.error(path + '.pairs[' + i + ']', 'needs non-empty "left" and "right"');
            });
        }
    });

    // ---- numeric -------------------------------------------------------------------------
    function numAnswer(def) {
        const a = isObj(def.answer) ? def.answer : { value: def.answer };
        return { value: Number(a.value), tolerance: Number(a.tolerance || 0), unit: a.unit || def.unit || '' };
    }
    function parseNum(s) {
        const n = parseFloat(String(s).trim().replace(/\s/g, '').replace(',', '.'));
        return isNaN(n) ? null : n;
    }
    App.registerType('numeric', {
        prepare(def, ctx) { const item = baseItem(def, ctx); item.numeric = numAnswer(def); return item; },
        hasAnswer: (it, v) => typeof v === 'string' && v.trim().length > 0,
        isCorrect(it, v) {
            const n = parseNum(v === undefined ? '' : v);
            return n !== null && Math.abs(n - it.numeric.value) <= it.numeric.tolerance + 1e-12;
        },
        render(ctx) {
            const { item, value, onChange, locked, reveal } = ctx;
            const input = el('input', { type: 'text', class: 'numeric-input', inputMode: 'decimal', autocomplete: 'off', value: value || '', disabled: !!locked, aria: { label: App.t('hintNumeric') } });
            input.addEventListener('input', () => onChange(input.value, { silent: true }));
            const wrap = el('div', { class: 'numeric' }, el('p', { class: 'type-hint', text: App.t('hintNumeric') }),
                el('div', { class: 'numeric-row' }, input, item.numeric.unit ? el('span', { class: 'numeric-unit', text: item.numeric.unit }) : null));
            if (reveal) {
                const ok = App.types.numeric.isCorrect(item, value);
                input.classList.add(ok ? 'row-ok' : 'row-bad');
                wrap.appendChild(el('p', { class: 'review-option review-correct', text: App.t('correctAnswer') + ': ' + item.numeric.value + (item.numeric.tolerance ? ' (±' + item.numeric.tolerance + ')' : '') + (item.numeric.unit ? ' ' + item.numeric.unit : '') }));
            }
            return wrap;
        },
        renderReview(item, value) {
            const ok = App.types.numeric.isCorrect(item, value);
            return el('div', { class: 'review-options' },
                el('p', { class: 'review-option ' + (ok ? 'review-correct' : 'review-wrong'), text: App.t('yourAnswer') + ': ' + (value || '—') }),
                el('p', { class: 'review-option review-correct', text: App.t('correctAnswer') + ': ' + item.numeric.value + (item.numeric.tolerance ? ' (±' + item.numeric.tolerance + ')' : '') + (item.numeric.unit ? ' ' + item.numeric.unit : '') }));
        },
        validateDef(def, path, rep) {
            const a = numAnswer(def);
            if (!isFinite(a.value)) rep.error(path + '.answer', 'must be a number or {value, tolerance, unit}');
            if (!isFinite(a.tolerance) || a.tolerance < 0) rep.error(path + '.answer.tolerance', 'must be a non-negative number');
        }
    });

    // ---- scenario (one context, several sub-questions; correct only if all parts are) ----
    App.registerType('scenario', {
        prepare(def, ctx) {
            const item = baseItem(def, ctx);
            item.context = def.context;
            item.parts = def.parts.map(p => prepareAny(Object.assign({ topic: def.topic, uid: (def.uid !== undefined ? def.uid : def.id) + '#p' }, p), ctx));
            return item;
        },
        hasAnswer: (it, v) => Array.isArray(v) && it.parts.some((p, i) => App.types[p.kind].hasAnswer(p, v[i])),
        isCorrect: (it, v) => Array.isArray(v) && it.parts.every((p, i) => App.types[p.kind].isCorrect(p, v[i])),
        render(ctx) {
            const { item, onChange, locked, reveal, uid } = ctx;
            const val = Array.isArray(ctx.value) ? [...ctx.value] : item.parts.map(() => undefined);
            const wrap = el('div', { class: 'scenario' });
            if (item.context) wrap.appendChild(el('div', { class: 'scenario-context', text: App.loc(item.context) }));
            item.parts.forEach((part, i) => {
                const h = App.types[part.kind];
                const box = el('div', { class: 'scenario-part' },
                    el('h4', { class: 'scenario-part-title', text: App.t('sub', { n: i + 1 }) + ' — ' + App.loc(part.text) }),
                    h.render({
                        item: part, value: val[i], locked, reveal, uid: uid + '-p' + i,
                        onChange: (v, o) => { val[i] = v; onChange([...val], { silent: true }); }
                    }));
                if (reveal && part.explanation) box.appendChild(el('p', { class: 'part-expl', text: App.loc(part.explanation) }));
                wrap.appendChild(box);
            });
            return wrap;
        },
        renderReview(item, value) {
            const v = Array.isArray(value) ? value : [];
            const wrap = el('div', { class: 'scenario' });
            if (item.context) wrap.appendChild(el('div', { class: 'scenario-context', text: App.loc(item.context) }));
            item.parts.forEach((part, i) => {
                wrap.appendChild(el('h4', { class: 'scenario-part-title', text: App.t('sub', { n: i + 1 }) + ' — ' + App.loc(part.text) }));
                wrap.appendChild(App.types[part.kind].renderReview(part, v[i]));
            });
            return wrap;
        },
        validateDef(def, path, rep) {
            if (!Array.isArray(def.parts) || def.parts.length < 2) { rep.error(path + '.parts', 'a scenario needs at least 2 parts'); return; }
            if (def.context !== undefined && !App.util.isLoc(def.context)) rep.error(path + '.context', 'must be a non-empty string or {en,it} object');
            def.parts.forEach((p, i) => {
                const t = App.questionType(p);
                const pp = path + '.parts[' + i + ']';
                if (t === 'scenario') { rep.error(pp, 'scenarios cannot be nested'); return; }
                if (!App.types[t]) { rep.error(pp + '.type', 'unknown question type "' + t + '"'); return; }
                if (!App.util.isLoc(textOf(p))) rep.error(pp + '.text', 'is required');
                if (App.types[t].validateDef) App.types[t].validateDef(p, pp, rep);
            });
        }
    });
})();
