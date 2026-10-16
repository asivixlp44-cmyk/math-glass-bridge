// The math on the glass. Every row of a stage is one question; the server and the client
// build exactly the same question from (level, seed, row), so the client can draw the numbers
// on the glass and the server can check which pane was the right one.
//
// level 0..9 is the world (difficulty), from adding to 10 up to algebra.
// A question:
// {
//   text: '7 + 1 = ?',       // the floating sign beside the row and the banner
//   reveal: '7 + 1 = 8',     // shown when you fall
//   answer: 8,
//   options: [10, 8],        // one per glass pane, player's left to right
//   correct: 1,              // index of the answer in options
// }
//
// Wrong panes are the classic mistakes (off by one, + instead of x, order of operations
// ignored ...) so a guess is never obviously wrong.

// Small deterministic generator (mulberry32)
export function rngFrom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function rowSeed(level, seed, row) {
    let h = (seed | 0) ^ Math.imul(row + 1, 0x9E3779B1) ^ Math.imul(level + 1, 0x85EBCA6B);
    h = Math.imul(h ^ (h >>> 16), 0x7FEB352D);
    h = Math.imul(h ^ (h >>> 15), 0x846CA68B);
    return (h ^ (h >>> 16)) >>> 0;
}
function tools(rnd) {
    return {
        int: (a, b) => a + Math.floor(rnd() * (b - a + 1)),
        chance: (p) => rnd() < p,
        pick: (list) => list[Math.floor(rnd() * list.length)],
        shuffle(list) {
            for (let i = list.length - 1; i > 0; i--) {
                const j = Math.floor(rnd() * (i + 1));
                [list[i], list[j]] = [list[j], list[i]];
            }
            return list;
        },
    };
}

// The answer plus `count - 1` wrong numbers: mistakes first, then close neighbours
function options(R, answer, mistakes, count, allowNeg) {
    const seen = new Set([answer]);
    const out = [answer];
    const add = (v) => {
        if (out.length >= count) return;
        v = Math.round(v);
        if (!Number.isFinite(v) || seen.has(v) || (v < 0 && !allowNeg)) return;
        seen.add(v); out.push(v);
    };
    for (const m of R.shuffle(mistakes.slice())) add(m);
    const spread = Math.max(2, Math.floor(Math.abs(answer) * 0.06));
    for (let g = 0; out.length < count && g < 100; g++) add(answer + R.int(1, spread) * (R.chance(0.5) ? -1 : 1));
    for (let n = answer + 1; out.length < count; n++) add(n);
    return out;
}
const q = (text, answer, mistakes, opts) => ({ text, answer, mistakes, ...(opts || {}) });
// Distinct numbers in [a, b]
function distinct(R, n, a, b, test) {
    const out = [];
    for (let g = 0; out.length < n && g < 400; g++) { const v = R.int(a, b); if (!out.includes(v) && (!test || test(v))) out.push(v); }
    return out;
}

// ----- generators: (R, tier 1..3, panes) -> { text, answer, mistakes | own, full?, reveal?, neg? } -----
const BIGGEST = (R, t, n) => { const v = distinct(R, n, 1, [20, 100, 999][t - 1]); const m = Math.max(...v); return q('Biggest number?', m, [], { full: true, own: v, reveal: m + ' is the biggest' }); };
const SMALLEST = (R, t, n) => { const v = distinct(R, n, 1, [20, 100, 999][t - 1]); const m = Math.min(...v); return q('Smallest number?', m, [], { full: true, own: v, reveal: m + ' is the smallest' }); };
const EVEN = (R, t, n) => {
    const top = [20, 60, 200][t - 1];
    const e = distinct(R, 1, 2, top, (v) => v % 2 === 0)[0];
    const odd = distinct(R, n - 1, 1, top, (v) => v % 2 === 1);
    return q('Pick the EVEN number', e, [], { full: true, own: [e, ...odd], reveal: e + ' is even' });
};
const GRADE1 = [
    (R, t) => { const a = R.int(1, 3 + t * 3), b = R.int(1, 3 + t * 2); return q(`${a} + ${b}`, a + b, [a + b + 1, a + b - 1, a + b + 2, Math.abs(a - b)]); },
    (R, t) => { const a = R.int(3, 5 + t * 4), b = R.int(1, a - 1); return q(`${a} - ${b}`, a - b, [a - b + 1, a - b - 1, a + b, a - b + 2]); },
    (R, t) => { const a = R.int(1, 4 + t * 2); return q(`${a} + ${a}`, a * 2, [a * 2 + 1, a * 2 - 1, a + 1, a * 2 + 2]); },
    (R, t) => { const a = R.int(1, 4) * 10, b = R.int(1, 2 + t) * 10; return t < 3 ? q(`${a / 10} + ${b / 10}`, (a + b) / 10, [(a + b) / 10 + 1, (a + b) / 10 - 1]) : q(`${a} + ${b}`, a + b, [a + b + 10, a + b - 10, a + b + 1]); },
];
const GRADE2 = [
    (R, t) => { const a = R.int(5, 10 + t * 5), b = R.int(3, 8 + t * 3); return q(`${a} + ${b}`, a + b, [a + b + 1, a + b - 1, a + b + 10, Math.abs(a - b)]); },
    (R, t) => { const a = R.int(10, 15 + t * 6), b = R.int(2, a - 3); return q(`${a} - ${b}`, a - b, [a - b + 1, a - b - 1, a + b, a - b + 10]); },
    BIGGEST, SMALLEST,
    (R, t) => { const a = R.int(2, 5 + t * 2), b = R.int(2, 5); return q(`${a} + ${a} + ${b}`, a * 2 + b, [a * 2 + b + 1, a + b, a * 2 + b - 1, a * 3]); },
];
const GRADE3 = [
    (R, t) => { const a = R.int(10, 20 + t * 15), b = R.int(5, 10 + t * 12); return q(`${a} + ${b}`, a + b, [a + b + 1, a + b - 1, a + b + 10, a + b - 10]); },
    (R, t) => { const a = R.int(20, 40 + t * 20), b = R.int(5, a - 6); return q(`${a} - ${b}`, a - b, [a - b + 1, a - b - 1, a - b + 10, a + b]); },
    (R, t) => { const a = R.int(2, 3 + t * 2), b = R.int(2, 10); return q(`${a} × ${b}`, a * b, [a + b, a * (b + 1), a * (b - 1), a * b + 1]); },
    (R, t) => { const m = R.int(2, 5 + t * 2), a = R.int(3, 9 + t * 3); return q(`? + ${a} = ${a + m}`, m, [m + 1, m - 1, a + m + a, m + 2], { full: true, reveal: `${m} + ${a} = ${a + m}` }); },
    (R, t) => { const d = R.int(2, 3 + t), n = R.int(2, 10); return q(`${d * n} ÷ ${d}`, n, [n + 1, n - 1, d * n - d, n + 2]); },
];
const GRADE4 = [...GRADE3.slice(2), EVEN,
    (R, t) => { const a = R.int(4, 9), b = R.int(4, 9 + t); return q(`${a} × ${b}`, a * b, [a * (b + 1), (a - 1) * b, a + b, a * b + 2]); },
];
const GRADE5 = [
    (R, t) => { const a = R.int(3, 6 + t * 2), b = R.int(4, 12); return q(`${a} × ${b}`, a * b, [a * (b + 1), a * (b - 1), (a + 1) * b, a * b + 2, a + b]); },
    (R, t) => { const d = R.int(3, 6 + t * 2), n = R.int(3, 12); return q(`${d * n} ÷ ${d}`, n, [n + 1, n - 1, n + 2, d]); },
    (R, t) => { const a = R.int(100, 300 + t * 200), b = R.int(40, 200 + t * 50); return q(`${a} + ${b}`, a + b, [a + b + 10, a + b - 10, a + b + 100, a + b + 1]); },
    (R, t) => { const a = R.int(150, 400 + t * 150), b = R.int(30, a - 40); return q(`${a} - ${b}`, a - b, [a - b + 10, a - b - 10, a - b + 1, a - b - 100]); },
    (R, t) => { const n = R.int(3, 8 + t * 2); return q(`${n}²`, n * n, [n * 2, n * n + n, (n - 1) * (n - 1), n * n + 1]); },
    (R, t) => { const [p, d] = R.pick([[50, 2], [25, 4], [10, 10]]), k = R.int(2, 6 + t * 3) * d; return q(`${p}% of ${k}`, k / d, [k / d + d, k / d * 2, k - k / d, k / d + 1]); },
    (R, t) => { const a = R.int(2, 5 + t), b = R.int(2, 9), c = R.int(1, 9); return q(`${a} × ${b} + ${c}`, a * b + c, [a * (b + c), a * b + c + 1, a + b + c, a * b - c]); },
];
const ELITE = [
    (R, t) => { const a = R.int(2, 9 + t * 3), b = R.int(2, 9), c = R.int(2, 6); return q(`${a} + ${b} × ${c}`, a + b * c, [(a + b) * c, a + b * c + 1, a * b + c, a + b + c]); },
    (R, t) => { const [b, e] = R.pick(t < 2 ? [[2, 4], [2, 5], [3, 3], [5, 2]] : [[2, 6], [2, 7], [3, 4], [4, 3], [5, 3], [10, 3]]); const v = b ** e; return q(`${b}${['', '', '²', '³', '⁴', '⁵', '⁶', '⁷'][e]}`, v, [b * e, v / b, v * b, v + b]); },
    (R, t) => { const n = R.int(4, 9 + t * 3); return q(`√${n * n}`, n, [n + 1, n - 1, n * 2, n * n / 2]); },
    (R, t) => { const p = R.pick([5, 15, 20, 30, 75]), k = R.int(2, 6 + t * 2) * 20; return q(`${p}% of ${k}`, (p * k) / 100, [(p * k) / 100 + 5, p + k / 10, (p * k) / 100 * 2, (p * k) / 100 - 2]); },
    (R, t) => { const [n, d] = R.pick([[3, 4], [2, 3], [3, 5], [5, 6], [2, 5]]), k = R.int(2, 4 + t * 2) * d; return q(`${n}/${d} of ${k}`, (k / d) * n, [k / d, (k / d) * n + d, k - (k / d) * n, (k / d) * (n + 1)]); },
    (R, t) => { const a = R.int(3, 9 + t * 3), b = R.int(a + 1, a + 12 + t * 4); return q(`-${a} + ${b}`, b - a, [a + b, b - a + 2, -(b - a), b - a - 1], { neg: true }); },
    (R, t) => { const a = R.int(2, 9), b = R.int(2, 9 + t); return q(`-${a} × -${b}`, a * b, [-(a * b), a * b + a, a + b, a * b - 1], { neg: true }); },
    (R, t) => { const x = R.int(2, 9 + t * 2), m = R.int(2, 6), c = R.int(1, 15); return q(`${m}x + ${c} = ${m * x + c}, x = ?`, x, [x + 1, x - 1, (m * x + c) - c, m + c, x * 2], { full: true, reveal: `x = ${x}` }); },
    (R, t) => { const a = R.int(11, 19 + t * 6), b = R.int(11, 15 + t * 2); return q(`${a} × ${b}`, a * b, [a * b + 10, a * b - 10, a * (b - 1), a * b + a]); },
];
const pickKinds = (pool, idx) => idx.map((i) => pool[i]);
// Per world (level): the question pool and the lowest tier
export const LEVELS = [
    { pool: GRADE1, tier: 1, name: 'Adding & taking away to 10' },
    { pool: GRADE2, tier: 1, name: 'Bigger sums, biggest & smallest' },
    { pool: GRADE3, tier: 1, name: 'Times tables & missing numbers' },
    { pool: GRADE4, tier: 2, name: 'Times tables, division & even numbers' },
    { pool: pickKinds(GRADE5, [0, 1, 2, 3]), tier: 1, name: 'Big sums, x12 tables & division' },
    { pool: GRADE5, tier: 2, name: 'Squares, percentages & two-step sums' },
    { pool: pickKinds(ELITE, [0, 3, 4, 1]), tier: 1, name: 'Order of operations & fractions' },
    { pool: pickKinds(ELITE, [5, 6, 2, 1]), tier: 2, name: 'Negatives, powers & roots' },
    { pool: pickKinds(ELITE, [7, 8, 0, 4]), tier: 2, name: 'Equations & big multiplication' },
    { pool: ELITE, tier: 3, name: 'Everything, hardest' },
];

// One question for row `row` of a stage (rows = the stage's length, choices = panes per row)
export function questionFor(level, seed, row, rows, choices, salt) {
    const rnd = rngFrom(rowSeed(level, seed, row) ^ Math.imul(salt | 0, 0x27D4EB2F));
    const R = tools(rnd);
    const L = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level))];
    const tier = Math.min(3, L.tier + (rows > 1 ? Math.floor((row / (rows - 1)) * 2.2) : 0));
    const pool = L.pool;
    const prevKind = row > 0 ? Math.floor(rngFrom(rowSeed(level, seed, row - 1) ^ 0x5bd1e995)() * pool.length) : -1;
    let kind = Math.floor(rngFrom(rowSeed(level, seed, row) ^ 0x5bd1e995 ^ (salt | 0))() * pool.length);
    if (kind === prevKind) kind = (kind + 1) % pool.length;
    const g = pool[kind](R, tier, choices);
    const opts = g.own ? g.own.slice(0, choices) : options(R, g.answer, g.mistakes, choices, !!g.neg);
    R.shuffle(opts);
    return {
        text: g.full ? g.text : g.text + ' = ?', reveal: g.reveal || g.text + ' = ' + g.answer,
        answer: g.answer, options: opts, correct: opts.indexOf(g.answer),
    };
}

// Every row of one run, with no question asked twice (a repeat is re-rolled with a new salt)
export function stageQuestions(level, seed, rows, choices) {
    const out = [], seen = new Set();
    for (let r = 0; r < rows; r++) {
        let qq = null;
        for (let salt = 0; salt < 10; salt++) {
            qq = questionFor(level, seed, r, rows, choices, salt);
            if (!seen.has(qq.text) || /Biggest|Smallest|EVEN/.test(qq.text)) break;
        }
        seen.add(qq.text);
        out.push(qq);
    }
    return out;
}
