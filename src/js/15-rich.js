/* Rich text for exam content: a small, SAFE markdown subset rendered with DOM APIs (never innerHTML).
   Supported: paragraphs/line breaks, **bold**, *italic*, `code`, ```fenced code```, lists, > quotes, tables,
   ![images](data: / https: / relative), [links](https://…), and $math$ (LaTeX subset → MathML).
   parse() builds a plain AST (testable without a DOM); toDom() turns it into nodes. */
(function () {
    const SAFE_IMG = /^(data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+\/=]+|https?:\/\/[^\s)]+|[\w.\-\/]+\.(png|jpe?g|gif|webp|svg))$/i;
    const SAFE_LINK = /^https?:\/\/[^\s]+$/i;
    const MATH_HINT = /[\\^_{}]/;

    // ------------------------------------------------------------------ math (LaTeX subset)
    const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω', Pi: 'Π' };
    const SYMS = { times: '×', cdot: '·', div: '÷', pm: '±', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', infty: '∞', sum: '∑', prod: '∏', int: '∫', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', in: '∈', ldots: '…', cdots: '⋯', degree: '°' };

    function parseMath(src) {
        let i = 0;
        const peek = () => src[i];
        function skipWs() { while (i < src.length && /\s/.test(src[i])) i++; }
        function group() {                      // {...} or a single token
            skipWs();
            if (peek() === '{') { i++; const r = seq('}'); i++; return r; }
            const a = atom();
            return a || { t: 'mrow', c: [] };
        }
        function atom() {
            skipWs();
            if (i >= src.length) return null;
            const ch = src[i];
            if (ch === '\\') {
                i++;
                let name = '';
                while (i < src.length && /[A-Za-z]/.test(src[i])) name += src[i++];
                if (!name && i < src.length) { const s = src[i++]; return { t: 'mo', v: s === '%' ? '%' : s }; }
                if (name === 'frac') { const a = group(), b = group(); return { t: 'mfrac', a, b }; }
                if (name === 'sqrt') { return { t: 'msqrt', a: group() }; }
                if (name === 'text' || name === 'mathrm') { skipWs(); let txt = ''; if (peek() === '{') { i++; while (i < src.length && src[i] !== '}') txt += src[i++]; i++; } return { t: 'mtext', v: txt }; }
                if (GREEK[name]) return { t: 'mi', v: GREEK[name] };
                if (SYMS[name]) return { t: 'mo', v: SYMS[name] };
                return { t: 'mi', v: name };
            }
            if (ch === '{') { i++; const r = seq('}'); i++; return r; }
            if (/[0-9.]/.test(ch)) { let n = ''; while (i < src.length && /[0-9.,]/.test(src[i]) && !(src[i] === ',' && !/[0-9]/.test(src[i + 1] || ''))) n += src[i++]; return { t: 'mn', v: n }; }
            if (/[A-Za-z]/.test(ch)) { i++; return { t: 'mi', v: ch }; }
            i++;
            return { t: 'mo', v: ch };
        }
        function scripts(base) {
            for (;;) {
                skipWs();
                if (peek() === '^') { i++; const s = group(); skipWs(); if (peek() === '_') { i++; const b = group(); base = { t: 'msubsup', base, sub: b, sup: s }; } else base = { t: 'msup', base, sup: s }; }
                else if (peek() === '_') { i++; const b = group(); skipWs(); if (peek() === '^') { i++; const s = group(); base = { t: 'msubsup', base, sub: b, sup: s }; } else base = { t: 'msub', base, sub: b }; }
                else return base;
            }
        }
        function seq(stop) {
            const items = [];
            for (;;) {
                skipWs();
                if (i >= src.length || (stop && peek() === stop)) break;
                const a = atom();
                if (!a) break;
                items.push(scripts(a));
            }
            return { t: 'mrow', c: items };
        }
        return seq(null);
    }

    // ------------------------------------------------------------------ inline
    function inline(text) {
        const out = [];
        let buf = '';
        const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
        let i = 0;
        while (i < text.length) {
            const rest = text.slice(i);
            let m;
            if (text[i] === '\n') { flush(); out.push({ t: 'br' }); i++; continue; }
            if (text[i] === '\\' && /[*`$\[\]!\\]/.test(text[i + 1] || '')) { buf += text[i + 1]; i += 2; continue; }
            if ((m = rest.match(/^`([^`\n]+)`/))) { flush(); out.push({ t: 'code', v: m[1] }); i += m[0].length; continue; }
            if ((m = rest.match(/^!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/))) {
                flush();
                if (SAFE_IMG.test(m[2])) out.push({ t: 'img', src: m[2], alt: m[1] }); else out.push({ t: 'text', v: m[1] || '[image]' });
                i += m[0].length; continue;
            }
            if ((m = rest.match(/^\[([^\]\n]+)\]\(([^)\s]+)\)/))) {
                flush();
                if (SAFE_LINK.test(m[2])) out.push({ t: 'a', href: m[2], c: inline(m[1]) }); else out.push({ t: 'text', v: m[1] });
                i += m[0].length; continue;
            }
            if ((m = rest.match(/^\*\*([^*\n]+?)\*\*/))) { flush(); out.push({ t: 'b', c: inline(m[1]) }); i += m[0].length; continue; }
            if ((m = rest.match(/^\*([^*\s][^*\n]*?)\*(?![*\w])/)) && (i === 0 || !/\w/.test(text[i - 1]))) { flush(); out.push({ t: 'i', c: inline(m[1]) }); i += m[0].length; continue; }
            if ((m = rest.match(/^\$([^$\n]+)\$/)) && MATH_HINT.test(m[1]) && !/^\s|\s$/.test(m[1])) { flush(); out.push({ t: 'math', m: parseMath(m[1]), block: false }); i += m[0].length; continue; }
            buf += text[i]; i++;
        }
        flush();
        return out;
    }

    // ------------------------------------------------------------------ blocks
    const isTableSep = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes('-');
    const splitRow = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

    function parse(text) {
        text = String(text === undefined || text === null ? '' : text).replace(/\r\n?/g, '\n');
        const lines = text.split('\n');
        const blocks = [];
        let para = [];
        const flushPara = () => { if (para.length) { blocks.push({ t: 'p', c: inline(para.join('\n')) }); para = []; } };
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            let m;
            if ((m = l.match(/^\s*```(\w*)\s*$/))) {
                flushPara();
                const code = [];
                i++;
                while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
                blocks.push({ t: 'codeblock', lang: m[1], v: code.join('\n') });
                continue;
            }
            if ((m = l.match(/^\s*\$\$(.+)\$\$\s*$/)) && MATH_HINT.test(m[1])) { flushPara(); blocks.push({ t: 'math', m: parseMath(m[1]), block: true }); continue; }
            if (/^\s*([-*_])\1{2,}\s*$/.test(l) && !para.length) { blocks.push({ t: 'hr' }); continue; }
            if (/^\s*>\s?/.test(l)) {
                flushPara();
                const q = [];
                while (i < lines.length && /^\s*>\s?/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
                i--;
                blocks.push({ t: 'quote', c: inline(q.join('\n')) });
                continue;
            }
            if (l.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
                flushPara();
                const head = splitRow(l);
                i += 2;
                const rows = [];
                while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
                i--;
                blocks.push({ t: 'table', head: head.map(inline), rows: rows.map(r => r.map(inline)) });
                continue;
            }
            if (/^\s*[-*•]\s+\S/.test(l) || /^\s*\d{1,2}[.)]\s+\S/.test(l)) {
                const ordered = /^\s*\d/.test(l);
                const re = ordered ? /^\s*\d{1,2}[.)]\s+(.*)$/ : /^\s*[-*•]\s+(.*)$/;
                // a list needs 2+ consecutive items, otherwise it is just text that starts with "1." or "-"
                let j = i, items = [];
                while (j < lines.length && re.test(lines[j])) { items.push(lines[j].match(re)[1]); j++; }
                if (items.length >= 2 || (items.length === 1 && !para.length && !ordered)) {
                    flushPara();
                    blocks.push({ t: ordered ? 'ol' : 'ul', items: items.map(inline) });
                    i = j - 1;
                    continue;
                }
            }
            if (!l.trim()) { flushPara(); continue; }
            para.push(l);
        }
        flushPara();
        return blocks;
    }

    // ------------------------------------------------------------------ plain text (search, labels)
    function plain(text) {
        return String(text === undefined || text === null ? '' : text)
            .replace(/```\w*\n?([\s\S]*?)```/g, '$1')
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            .replace(/\$\$?([^$]+)\$\$?/g, (all, m) => MATH_HINT.test(m) ? m : all)
            .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\\([*`$\[\]!\\])/g, '$1');
    }
    // true when the text has no markup at all (fast path: a plain text node)
    const isPlain = t => !/[`*$\[\]\n|>\-•]|\d[.)]\s|!\[/.test(String(t));

    // ------------------------------------------------------------------ DOM
    const MATHNS = 'http://www.w3.org/1998/Math/MathML';
    function mathDom(n) {
        const mk = (tag, txt) => { const e = document.createElementNS(MATHNS, tag); if (txt !== undefined) e.textContent = txt; return e; };
        const wrap = (tag, ...kids) => { const e = mk(tag); kids.forEach(k => e.appendChild(mathDom(k))); return e; };
        switch (n.t) {
            case 'mrow': { const e = mk('mrow'); n.c.forEach(c => e.appendChild(mathDom(c))); return e; }
            case 'mi': case 'mn': case 'mo': case 'mtext': return mk(n.t, n.v);
            case 'msup': return wrap('msup', n.base, n.sup);
            case 'msub': return wrap('msub', n.base, n.sub);
            case 'msubsup': return wrap('msubsup', n.base, n.sub, n.sup);
            case 'mfrac': return wrap('mfrac', n.a, n.b);
            case 'msqrt': return wrap('msqrt', n.a);
            default: return mk('mrow');
        }
    }
    function inlineDom(nodes, parent) {
        const { el } = App.util;
        nodes.forEach(n => {
            switch (n.t) {
                case 'text': parent.appendChild(document.createTextNode(n.v)); break;
                case 'br': parent.appendChild(document.createElement('br')); break;
                case 'code': parent.appendChild(el('code', { class: 'rich-code', text: n.v })); break;
                case 'b': { const e = document.createElement('strong'); inlineDom(n.c, e); parent.appendChild(e); break; }
                case 'i': { const e = document.createElement('em'); inlineDom(n.c, e); parent.appendChild(e); break; }
                case 'a': { const e = el('a', { href: n.href, target: '_blank', rel: 'noopener noreferrer' }); inlineDom(n.c, e); parent.appendChild(e); break; }
                case 'img': {
                    const img = el('img', { class: 'rich-img', src: n.src, alt: n.alt || '', loading: 'lazy', tabIndex: 0, role: 'button' });
                    img.addEventListener('click', () => App.rich.zoom(n.src, n.alt));
                    img.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); App.rich.zoom(n.src, n.alt); } });
                    parent.appendChild(img); break;
                }
                case 'math': { const m = document.createElementNS(MATHNS, 'math'); if (n.block) m.setAttribute('display', 'block'); m.appendChild(mathDom(n.m)); parent.appendChild(m); break; }
            }
        });
        return parent;
    }
    function blocksDom(blocks, parent) {
        const { el } = App.util;
        blocks.forEach(b => {
            switch (b.t) {
                case 'p': parent.appendChild(inlineDom(b.c, el('p'))); break;
                case 'codeblock': parent.appendChild(el('pre', { class: 'rich-pre' }, el('code', { text: b.v, class: b.lang ? 'lang-' + b.lang : '' }))); break;
                case 'ul': case 'ol': { const l = el(b.t); b.items.forEach(it => l.appendChild(inlineDom(it, el('li')))); parent.appendChild(l); break; }
                case 'quote': parent.appendChild(inlineDom(b.c, el('blockquote'))); break;
                case 'hr': parent.appendChild(el('hr')); break;
                case 'math': { const m = document.createElementNS(MATHNS, 'math'); m.setAttribute('display', 'block'); m.appendChild(mathDom(b.m)); parent.appendChild(el('div', { class: 'rich-math' }, m)); break; }
                case 'table': {
                    const t = el('table', { class: 'rich-table' });
                    const th = el('tr'); b.head.forEach(h => th.appendChild(inlineDom(h, el('th')))); t.appendChild(el('thead', {}, th));
                    const tb = el('tbody'); b.rows.forEach(r => { const tr = el('tr'); r.forEach(c => tr.appendChild(inlineDom(c, el('td')))); tb.appendChild(tr); }); t.appendChild(tb);
                    parent.appendChild(el('div', { class: 'rich-table-wrap' }, t)); break;
                }
            }
        });
        return parent;
    }

    App.rich = {
        parse, parseMath, plain, isPlain, SAFE_IMG,
        // Block rendering (question text, explanations): returns a <div class="rich">
        node(text) {
            const { el } = App.util;
            const t = String(text === undefined || text === null ? '' : text);
            const box = el('div', { class: 'rich' });
            if (isPlain(t)) { if (t) box.appendChild(el('p', { text: t })); return box; }
            return blocksDom(parse(t), box);
        },
        // Inline rendering (options, list items, table cells): returns a <span class="rich-inline">
        inline(text) {
            const { el } = App.util;
            const t = String(text === undefined || text === null ? '' : text);
            const box = el('span', { class: 'rich-inline' });
            if (isPlain(t)) { box.textContent = t; return box; }
            return inlineDom(inline(t), box);
        },
        // Click-to-zoom for images
        zoom(src, alt) {
            const { el } = App.util;
            const close = () => { dlg.remove(); document.removeEventListener('keydown', onKey); };
            const onKey = e => { if (e.key === 'Escape') close(); };
            const dlg = el('div', { class: 'lightbox', role: 'dialog', aria: { modal: 'true', label: alt || 'Image' }, onclick: close },
                el('img', { src, alt: alt || '' }), el('button', { type: 'button', class: 'lightbox-close', text: '✕', aria: { label: 'Close' }, onclick: close }));
            document.body.appendChild(dlg);
            document.addEventListener('keydown', onKey);
            dlg.querySelector('button').focus();
        }
    };
})();
