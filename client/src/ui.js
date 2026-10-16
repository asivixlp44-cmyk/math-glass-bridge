import { $ } from './engine.js';
import { S, net, actions } from './state.js';
import * as BX from './bloxity.js';
import { sfx, getVolumes, setVolume } from './audio.js';
import { QUALITIES, getQuality, setQuality } from './fx.js';
import { fillIcons } from './icons.js';
import { playtimeNow } from './world.js';
import {
    CFG, STAGES, WORLDS, MODS, STAGE_COUNT, STAGES_PER_WORLD, PRODUCTS, PASSES, QUESTS, TUTORIAL_STEPS, FREE, DAILY, TRAILS, PETS, CRATES, RARITY, TELEPORTS, GEARS, WHEEL,
    cashMult, passMult, petMult, petSlots, petDef, trailDef, crateDef, streakMult, mathRush, eventLeft, stageOpen, rebirthMult, rewardText, modLabel,
    fmt, comma, money, clock,
} from '../../shared/config.js';

// Bux coin + amount (our own strings only; never user text)
const bux = (n) => '<i class="bx" aria-hidden="true"></i>' + fmt(n);
const cashIc = '<i data-icon="cash"></i>';
function setHtml(node, html) { if (node && node.innerHTML !== html) node.innerHTML = html; }
function setText(node, text) { if (node && node.textContent !== text) node.textContent = text; }

const el = {
    cash: $('#cashVal'), wins: $('#winsVal'), shade: $('#progShade'), heads: $('#progHeads'), prize: $('#progPrize'),
    qBanner: $('#qBanner'), qRow: $('#qRow'), qText: $('#qText'), qOpts: $('#qOpts'), qTimer: $('#qTimer'),
    streak: $('#streakPill'), streakTxt: $('#streakTxt'), rush: $('#rushPill'), rushTxt: $('#rushTxt'), boost: $('#boostPill'), boostTxt: $('#boostTxt'),
    wheelBadge: $('#wheelBadge'), giftBadge: $('#giftBadge'), dailyBadge: $('#dailyBadge'), friend: $('#friendVal'),
    giftBtn: $('[data-open="free"]'), giftLbl: $('[data-open="free"] .o1'),
    quest: $('#questLine'), chip: $('#stageChip'), cont: $('#btnContinue'), prompt: $('#promptBtn'), promptTxt: $('#promptTxt'), hotbar: $('#hotbar'), pathBtn: $('#pathBtn'),
};
export const promptEl = el.prompt, promptTxtEl = el.promptTxt;
fillIcons();

// ----- HUD -----
const shown = { cash: null, wins: null };
function bump(node) { const s = node.closest('.bump-me'); if (!s) return; s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); }
// Cash and Wins count up smoothly to their new values
function ease(key, target, node, dt, pre) {
    if (shown[key] === null) shown[key] = target;
    if (shown[key] === target) return;
    if (target > shown[key] && Math.random() < dt * 12) bump(node);
    const diff = target - shown[key];
    shown[key] = Math.abs(diff) < 1 ? target : shown[key] + diff * Math.min(1, dt * 8);
    if (Math.abs(target - shown[key]) < Math.max(1, target * 0.001)) shown[key] = target;
    setText(node, (pre || '') + (shown[key] < 1e7 ? comma(shown[key]) : fmt(shown[key])));
}
export function animateCounters(dt) {
    ease('cash', S.cash, el.cash, dt, '$');
    ease('wins', S.wins, el.wins, dt);
}

const giftsReady = () => {
    const mins = (net.now() - S.joinedAt) / 60000;
    return FREE.filter((r, i) => mins >= r.min && !S.freeClaimed[i]).length;
};
// Seconds until the next unclaimed Free! gift unlocks (-1 when every gift is unlocked)
const nextGiftIn = () => {
    const secs = (net.now() - S.joinedAt) / 1000;
    for (let i = 0; i < FREE.length; i++) if (!S.freeClaimed[i] && secs < FREE[i].min * 60) return FREE[i].min * 60 - secs;
    return -1;
};
let giftsSeen = 0;
export const wheelReady = () => playtimeNow() >= (S.wheelAt || 0) || S.spins > 0;

// Top progress bar: the 5 stages of the world you are in, with everyone in that world on it
const headEls = new Map();
function updateHeads(players, myId, world) {
    const seen = new Set();
    let mine = null;
    if (players) players.forEach((p, id) => {
        const k = p.k >= 0 ? p.k : Math.min(STAGE_COUNT - 1, p.stage || 0);
        if (Math.floor(k / STAGES_PER_WORLD) !== world || (p.k < 0 && id !== myId && !(p.stage > 0))) return;
        seen.add(id);
        let h = headEls.get(id);
        if (!h) { h = document.createElement('div'); h.className = 'head o1'; el.heads.appendChild(h); headEls.set(id, h); }
        const st = STAGES[k];
        const pos = ((k % STAGES_PER_WORLD) + (p.k >= 0 ? Math.min(1, p.row / st.rows) : 0)) / STAGES_PER_WORLD;
        h.style.left = (pos * 100) + '%';
        h.style.background = WORLDS[world].css;
        h.classList.toggle('me', id === myId);
        setText(h, (p.name || '?').slice(0, 1).toUpperCase());
        h.title = p.name;
        if (id === myId) mine = pos;
    });
    for (const [id, h] of headEls) if (!seen.has(id)) { h.remove(); headEls.delete(id); }
    el.shade.style.width = ((1 - (mine === null ? 0 : mine)) * 100) + '%';
}

let tutDoneUntil = 0;
export function tutorialComplete() { tutDoneUntil = performance.now() + 6000; }
let lastQKey = '';
export function updateHud(info) {
    const now = net.now();
    const run = S.run;
    const here = run ? run.k : info.here >= 0 ? info.here : Math.min(STAGE_COUNT - 1, S.stage || 0);
    const world = Math.floor(here / STAGES_PER_WORLD), wd = WORLDS[world];
    updateHeads(info.players, info.myId, world);
    setText(el.prize, money(STAGES[world * STAGES_PER_WORLD + STAGES_PER_WORLD - 1].chest));
    const chip = 'WORLD ' + (world + 1) + ' ' + wd.icon + ' ' + wd.name.toUpperCase() + '  ·  STAGE ' + (here + 1) + '/' + STAGE_COUNT;
    setText(el.chip, chip); el.chip.style.color = wd.css;
    const ck = Math.min(STAGE_COUNT - 1, S.stage || 0);
    setText(el.cont, (S.stage >= STAGE_COUNT ? '👑 Throne' : '▶ Stage ' + (ck + 1)));
    // Question banner while you are on the glass
    const q = run && !run.fallen && !run.skipped && info.question;
    el.qBanner.hidden = !q;
    if (q) {
        const key = run.k + '|' + run.row + '|' + q.text;
        if (key !== lastQKey) {
            lastQKey = key;
            const st = STAGES[run.k], ml = modLabel(st);
            setText(el.qRow, 'Stage ' + (run.k + 1) + '  ·  Row ' + (run.row + 1) + ' / ' + st.rows + (ml ? '  ·  ' + ml : ''));
            setText(el.qText, q.text);
            el.qOpts.innerHTML = '';
            el.qBanner.classList.remove('pop'); void el.qBanner.offsetWidth; el.qBanner.classList.add('pop');
        }
    } else lastQKey = '';
    // Time Limit countdown
    const tl = q ? info.timer : null;
    el.qTimer.hidden = tl === null || tl === undefined;
    if (!el.qTimer.hidden) { setText(el.qTimer, '⏱️ ' + Math.ceil(tl) + 's'); el.qTimer.classList.toggle('low', tl <= 3); }
    const ql = q ? '' : questLine();
    el.quest.hidden = !ql;
    if (ql) setText(el.quest, ql);
    // Streak
    const st = run ? run.streak : 0;
    el.streak.hidden = st < 2;
    if (st >= 2) setText(el.streakTxt, 'x' + st + ' STREAK  +' + Math.round((streakMult(st + 1) - 1) * 100) + '% Cash');
    el.streak.classList.toggle('hot', st >= 10);
    // Event and boost pills
    const live = mathRush(now);
    el.rush.hidden = !live;
    if (live) setText(el.rushTxt, 'MATH RUSH x2 CASH ' + clock(eventLeft(now)));
    const bl = (S.boostUntil - now) / 1000;
    el.boost.hidden = bl <= 0;
    if (bl > 0) setText(el.boostTxt, 'x2 CASH ' + clock(bl));
    setText(el.friend, '+' + Math.round(Math.min(CFG.friendMax, S.friends || 0) * CFG.friendBoost * 100) + '%');
    el.pathBtn.classList.toggle('armed', !!(run && run.path) || S.pathTokens > 0);
    // Badges
    const gifts = giftsReady();
    el.giftBadge.hidden = gifts === 0; setText(el.giftBadge, String(gifts));
    // The Free! button counts down to the next gift and pulses when one is ready
    const giftLeft = gifts > 0 ? -1 : nextGiftIn();
    setText(el.giftLbl, giftLeft >= 0 ? clock(giftLeft) : 'Free!');
    el.giftLbl.classList.toggle('gift-clock', giftLeft >= 0);
    el.giftBtn.classList.toggle('gift-ready', gifts > 0);
    if (gifts > giftsSeen && S.joinedAt) toast('🎁 A free gift is ready! Tap Free! to claim it', '#7dff6b');
    giftsSeen = gifts;
    el.dailyBadge.hidden = !(S.daily && S.daily.ready);
    el.wheelBadge.hidden = !wheelReady();
    document.querySelectorAll('[data-pass]').forEach((n) => {
        const k = n.dataset.pass;
        const pv = n.querySelector('.pv');
        if (pv) setHtml(pv, S.passes[k] ? 'OWNED' : bux(PASSES[k].price));
        n.classList.toggle('owned', !!S.passes[k]);
    });
    document.querySelectorAll('#topBtns [data-product]').forEach((n) => setHtml(n.querySelector('.pv'), fmt(PRODUCTS[n.dataset.product].price)));
    renderHotbar(info.gear);
    if (!$('#modal').hidden && LIVE.has(modalKind)) liveRefresh();
}

export function toast(text, color) {
    const d = document.createElement('div');
    d.className = 'toast o'; d.textContent = text; d.style.color = color || '#fff';
    const box = $('#toasts');
    box.appendChild(d);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), 2400);
}
export function announce(text, color) {
    const a = $('#announce');
    a.textContent = text; a.style.color = color || '#fff';
    a.classList.remove('show'); void a.offsetWidth; a.classList.add('show');
}
// "+$20" popups that float up near the middle of the screen
export function popGain(text, kind, x, y) {
    const box = $('#gains');
    if (box.children.length > 12) box.firstChild.remove();
    const d = document.createElement('div');
    d.className = 'gain o' + (kind ? ' ' + kind : '');
    d.innerHTML = cashIc + '<span></span>';
    d.lastChild.textContent = text;
    fillIcons(d);
    d.style.left = (x !== undefined ? x : 44 + Math.random() * 10) + '%';
    d.style.top = (y !== undefined ? y : 40 + Math.random() * 8) + '%';
    box.appendChild(d);
    setTimeout(() => d.remove(), 1000);
}
export function bigText(text, color, sub) {
    const d = $('#bigText');
    d.textContent = text; d.style.color = color || '#fff';
    if (sub) { const s = document.createElement('small'); s.textContent = sub; s.style.color = '#ffffff'; d.appendChild(s); }
    d.classList.remove('show'); void d.offsetWidth; d.classList.add('show');
}
let noticeTimer;
export function notice(text) {
    const n = $('#notice');
    n.textContent = text;
    n.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { n.hidden = true; }, 2600);
}
export function flash(kind) {
    const f = $('#flash');
    f.classList.remove('show', 'gold', 'red'); void f.offsetWidth; f.classList.add('show');
    if (kind) f.classList.add(kind);
}

// ----- Revive popup -----
let reviveT = 0, reviveMax = CFG.reviveSecs, reviveOn = false;
export function showRevive(info) {
    reviveOn = true; reviveT = reviveMax;
    $('#revive').hidden = false;
    const ans = $('#reviveAns');
    if (info.reveal) { ans.hidden = false; ans.innerHTML = ''; ans.append('The answer was '); const bb = document.createElement('b'); bb.textContent = String(info.answer); ans.append(bb); ans.append('  (' + info.reveal + ')'); }
    else if (info.by) { ans.hidden = false; ans.textContent = '💀 ' + info.by + ' used Kill All!'; }
    else if (info.crumble) { ans.hidden = false; ans.textContent = '⏳ The glass crumbled! Keep moving.'; }
    else ans.hidden = true;
    const free = info.free;
    $('#reviveFree').hidden = !free;
    setHtml($('#reviveLbl'), free ? 'Revive' : info.tokens > 0 ? 'Revive (' + info.tokens + ')' : 'Revive ' + bux(PRODUCTS.Revive.price));
}
export function hideRevive() { reviveOn = false; $('#revive').hidden = true; }
export const reviveOpen = () => reviveOn;
// Returns true once the bar has run out
export function tickRevive(dt) {
    if (!reviveOn) return false;
    reviveT -= dt;
    $('#reviveFill').style.width = Math.max(0, reviveT / reviveMax * 100) + '%';
    return reviveT <= 0;
}
$('#reviveBtn').addEventListener('click', () => actions.revive());
$('#btnContinue').addEventListener('click', () => actions.continueRun());
$('#reviveSkip').addEventListener('click', () => actions.giveUp());

// ----- Hotbar (gears) -----
let hotKey = '';
function renderHotbar(gear) {
    const key = GEARS.map((g) => (S.gears[g.id] ? 1 : 0)).join('') + '|' + gear + '|' + (S.cash >= 1e9 ? 1 : 0);
    if (key === hotKey) return;
    hotKey = key;
    el.hotbar.innerHTML = '';
    GEARS.forEach((g, i) => {
        const b = document.createElement('button');
        const owned = !!S.gears[g.id];
        b.className = 'slot' + (owned ? '' : ' locked') + (gear === g.id ? ' on' : '');
        b.innerHTML = `<kbd>${i + 1}</kbd><i data-icon="${['calc', 'bolt', 'coil'][i]}"></i>` + (owned ? '' : '<span class="lock o1"></span>');
        if (!owned) b.querySelector('.lock').textContent = money(g.cost);
        b.title = g.name + ' - ' + g.desc;
        b.setAttribute('aria-label', g.name);
        b.addEventListener('click', () => actions.gear(g.id));
        el.hotbar.appendChild(b);
    });
    fillIcons(el.hotbar);
}

// ----- Calculator gear -----
const calc = { expr: '', out: '0' };
const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '=', '+', 'C', '⌫', '(', ')'];
(function buildCalc() {
    const keys = $('#calcKeys');
    for (const k of KEYS) {
        const b = document.createElement('button');
        b.className = 'btn o1 ' + (k === '=' ? 'g-green' : /[÷×−+]/.test(k) ? 'g-yellow' : k === 'C' || k === '⌫' ? 'g-red' : 'g-grey');
        b.textContent = k;
        b.tabIndex = -1;
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); calcKey(k); });
        keys.appendChild(b);
    }
})();
function calcEval(s) {
    const src = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
    if (!/^[\d+\-*/().\s]*$/.test(src) || !src.trim()) return null;
    // Tiny recursive-descent parser (no eval)
    let i = 0;
    const peek = () => src[i], eat = () => src[i++];
    const skip = () => { while (src[i] === ' ') i++; };
    function num() {
        skip();
        if (peek() === '(') { eat(); const v = expr(); skip(); if (peek() === ')') eat(); return v; }
        if (peek() === '-') { eat(); return -num(); }
        let t = '';
        while (i < src.length && /[\d.]/.test(peek())) t += eat();
        if (!t) throw new Error('bad');
        return parseFloat(t);
    }
    function term() { let v = num(); for (;;) { skip(); const c = peek(); if (c === '*' || c === '/') { eat(); const r = num(); v = c === '*' ? v * r : v / r; } else return v; } }
    function expr() { let v = term(); for (;;) { skip(); const c = peek(); if (c === '+' || c === '-') { eat(); const r = term(); v = c === '+' ? v + r : v - r; } else return v; } }
    try { const v = expr(); return i >= src.length && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null; } catch (e) { return null; }
}
export function calcKey(k) {
    sfx('calc');
    if (k === 'C') { calc.expr = ''; calc.out = '0'; }
    else if (k === '⌫') calc.expr = calc.expr.slice(0, -1);
    else if (k === '=') { const v = calcEval(calc.expr); calc.out = v === null ? 'Error' : String(v); if (v !== null) { $('#calcExpr').textContent = calc.expr + ' ='; calc.expr = String(v); renderCalc(true); return; } }
    else if (calc.expr.length < 24) calc.expr += k;
    renderCalc();
}
function renderCalc(keepExpr) {
    if (!keepExpr) $('#calcExpr').textContent = '';
    $('#calcOut').textContent = calc.expr || calc.out;
}
export function setCalc(on) { $('#calc').hidden = !on; }
export const calcOpen = () => !$('#calc').hidden;
// Keyboard typing into the calculator while it is in your hand
export function calcKeyboard(e) {
    const map = { '*': '×', '/': '÷', '-': '−', '+': '+', Enter: '=', '=': '=', Backspace: '⌫', Escape: 'C', '.': '.', '(': '(', ')': ')' };
    if (/^\d$/.test(e.key)) { calcKey(e.key); return true; }
    if (map[e.key] && (e.key !== 'Escape')) { calcKey(map[e.key]); return true; }
    return false;
}

// Crate opening: the crate shakes, then the pet card pops out
let hatchQueue = [], hatching = false;
export function showHatch(crateId, petId) {
    hatchQueue.push({ crateId, petId });
    if (!hatching) nextHatch();
}
function nextHatch() {
    const h = hatchQueue.shift();
    if (!h) { hatching = false; $('#hatch').hidden = true; return; }
    hatching = true;
    const d = petDef(h.petId) || PETS[0];
    $('#hatch').hidden = false;
    $('#hatchBox').hidden = false; $('#hatchCard').hidden = true;
    $('#hatchBox').textContent = h.crateId === 'Mythic' ? '🎁' : h.crateId === 'Store' ? '🦄' : '📦';
    sfx('shake');
    setTimeout(() => {
        $('#hatchBox').hidden = true; $('#hatchCard').hidden = false;
        $('#hatchIc').textContent = d.ic;
        $('#hatchName').textContent = d.id;
        $('#hatchRar').textContent = d.r; $('#hatchRar').style.color = RARITY[d.r];
        $('#hatchBoost').textContent = '+' + d.b + 'x Cash';
        sfx('hatch');
        flash(d.b >= 2 ? 'gold' : '');
        setTimeout(nextHatch, 1900);
    }, 1100);
}
$('#hatch').addEventListener('pointerdown', () => { if (!$('#hatchCard').hidden) nextHatch(); });

// ----- purchases (free in the web demo; the server grants them) -----
let pendingBuy = null;
export function buy(kind, key) {
    if (kind === 'pass' && S.passes[key]) { toast(PASSES[key].name + ' already owned!', '#6fe0ff'); return; }
    const item = kind === 'pass' ? PASSES[key] : PRODUCTS[key];
    if (!item) return;
    if (net.bux) { buyBux(kind, key); return; }
    pendingBuy = { kind, key };
    $('#buyItem').textContent = item.name;
    setHtml($('#buyCost'), bux(item.price) + ' Bux');
    $('#buy').hidden = false;
}
async function buyBux(kind, key) {
    const r = await BX.buyWithBux(kind, key);
    if (r.success) { toast('Purchase complete!', '#7dff6b'); return; }
    if (r.error && !/cancel/i.test(r.error)) toast(r.error, '#ff5a5a');
}
$('#buyOk').addEventListener('click', () => {
    $('#buy').hidden = true;
    if (pendingBuy) net.send('buy', pendingBuy);
    pendingBuy = null;
});
$('#buyCancel').addEventListener('click', () => { $('#buy').hidden = true; pendingBuy = null; });
document.querySelectorAll('[data-pass]').forEach((b) => b.addEventListener('click', () => buy('pass', b.dataset.pass)));
document.querySelectorAll('#topBtns [data-product]').forEach((b) => b.addEventListener('click', () => buy('product', b.dataset.product)));
export const buyOpen = () => !$('#buy').hidden;

// ----- panels -----
let modalKind = null;
export function openModal(kind) { modalKind = kind; renderModal(); $('#modal').hidden = false; }
export function closeModal() { $('#modal').hidden = true; modalKind = null; }
export function refreshModal() { if (!$('#modal').hidden) renderModal(); }
export const modalOpen = () => !$('#modal').hidden || !$('#hatch').hidden || !$('#buy').hidden;
$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') closeModal(); });
document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openModal(b.dataset.open)));
$('#btnShop').addEventListener('click', () => openModal('shop'));
document.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('.btn')) sfx('click'); });

function rowCard(ic, name, desc, btnText, btnClass, onClick, disabled) {
    const d = document.createElement('div');
    d.className = 'row-card';
    d.innerHTML = '<div class="ic"></div><div><div class="nm o1"></div><div class="ds"></div></div><button class="btn o1"></button>';
    d.querySelector('.ic').textContent = ic;
    d.querySelector('.nm').textContent = name;
    d.querySelector('.ds').textContent = desc;
    const b = d.querySelector('button');
    b.classList.add(btnClass);
    setHtml(b, btnText); b.disabled = !!disabled;
    b.addEventListener('click', onClick);
    return d;
}
function sec(text) { const d = document.createElement('div'); d.className = 'sec'; d.textContent = text; return d; }
function para(text) { const p = document.createElement('p'); p.className = 'desc'; p.textContent = text; return p; }
function shopCard(o) {
    const c = document.createElement('div');
    c.className = 'card' + (o.on ? ' on' : '');
    c.style.background = o.bg || '';
    c.innerHTML = '<span class="rar o1"></span><span class="art"></span><span class="mx o1"></span>';
    c.querySelector('.rar').textContent = o.rarity || '';
    c.querySelector('.rar').style.color = RARITY[o.rarity] || '#ffffff';
    c.querySelector('.art').textContent = o.art;
    c.querySelector('.mx').textContent = o.mx;
    for (const b of o.btns) {
        const btn = document.createElement('button');
        btn.className = 'btn o1 ' + b.cls;
        setHtml(btn, b.html); btn.disabled = !!b.disabled;
        btn.addEventListener('click', b.fn);
        c.appendChild(btn);
    }
    return c;
}

const TITLES = {
    shop: 'SHOP', pets: 'PETS', gears: 'GEARS', trails: 'TRAILS', wheel: 'LUCKY WHEEL', teleport: 'TELEPORT', daily: 'Daily Rewards',
    free: 'FREE!', quests: 'QUESTS', codes: 'CODES', settings: 'SETTINGS', friends: 'FRIENDS', rebirth: 'REBIRTH',
};
const LIVE = new Set(['free', 'pets', 'trails', 'gears', 'wheel']);
function renderModal() {
    const body = $('#modalBody');
    $('#modalTitle').textContent = TITLES[modalKind] || '';
    body.innerHTML = '';
    const fn = {
        shop: renderShop, pets: renderPets, gears: renderGears, trails: renderTrails, wheel: renderWheel, teleport: renderTeleport,
        daily: renderDaily, free: renderFree, quests: renderQuests, codes: renderCodes, settings: renderSettings, friends: renderFriends,
        rebirth: renderRebirth,
    }[modalKind];
    if (fn) fn(body);
    fillIcons(body);
}
let liveKey = '';
function liveRefresh() {
    if (modalKind === 'wheel' && wheelSpinning) return;
    const key = modalKind + '|' + S.cash + '|' + S.pets.length + '|' + S.equipped.join(',') + '|' + S.trail + '|' + JSON.stringify(S.gears)
        + '|' + Math.floor((net.now() - S.joinedAt) / 1000) + '|' + JSON.stringify(S.freeClaimed) + '|' + Math.floor(playtimeNow()) + '|' + S.spins;
    if (key === liveKey) return;
    liveKey = key;
    const focusId = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fid : null;
    renderModal();
    if (focusId) { const f = $('#modalBody [data-fid="' + focusId + '"]'); if (f) f.focus(); }
}

function renderShop(body) {
    body.appendChild(sec('Bridge power-ups'));
    for (const k of ['ShowPath', 'SkipToEnd', 'KillAll', 'Revive']) {
        const p = PRODUCTS[k];
        body.appendChild(rowCard(p.ic, p.name, p.desc, bux(p.price), k === 'KillAll' ? 'g-red' : 'g-purple', () => buy('product', k)));
    }
    body.appendChild(sec('Game passes'));
    for (const k of Object.keys(PASSES)) {
        const p = PASSES[k], owned = !!S.passes[k];
        body.appendChild(rowCard(p.ic, p.name, p.desc, owned ? 'OWNED' : bux(p.price), owned ? 'g-grey' : 'g-pink', () => buy('pass', k), owned));
    }
    body.appendChild(sec('Cash'));
    for (const k of ['Cash10K', 'Cash100K', 'Cash1M']) body.appendChild(rowCard(PRODUCTS[k].ic, PRODUCTS[k].name, 'Spend it on crates, trails and gears', bux(PRODUCTS[k].price), 'g-green', () => buy('product', k)));
    body.appendChild(rowCard(PRODUCTS.CashBoost.ic, PRODUCTS.CashBoost.name, PRODUCTS.CashBoost.desc, bux(PRODUCTS.CashBoost.price), 'g-yellow', () => buy('product', 'CashBoost')));
    body.appendChild(sec('Pets & spins'));
    for (const k of ['MythicCrate', 'GoldenGenius', 'LuckySpin']) body.appendChild(rowCard(PRODUCTS[k].ic, PRODUCTS[k].name, PRODUCTS[k].desc, bux(PRODUCTS[k].price), 'g-purple', () => buy('product', k)));
    if (!S.claimedPack) body.appendChild(rowCard('🎒', 'Starter Pack', PRODUCTS.StarterPack.desc, bux(PRODUCTS.StarterPack.price), 'g-pink', () => buy('product', 'StarterPack')));
}
// Pets: crates at the top, then your bag
function renderPets(body) {
    const eq = S.equipped || [], slots = petSlots(S);
    const g = document.createElement('div'); g.className = 'cards';
    for (const c of CRATES) {
        const btn = c.product
            ? { cls: 'g-purple', html: bux(PRODUCTS[c.product].price), fn: () => buy('product', c.product) }
            : { cls: 'g-green', html: money(c.cost), disabled: S.cash < c.cost, fn: () => { closeModal(); actions.teleport('crates'); toast('Walk up to the ' + c.name + ' and press E!', '#ffe14a'); } };
        g.appendChild(shopCard({ art: '📦', mx: c.name, rarity: c.odds[c.odds.length - 1][0] + ' ' + c.odds[c.odds.length - 1][1] + '%', btns: [btn], bg: 'linear-gradient(#ffffff,#' + c.color.toString(16).padStart(6, '0') + ')' }));
    }
    body.appendChild(g);
    body.appendChild(para('Pets: ' + S.pets.length + '/' + CFG.petBag + ' · Equipped ' + eq.length + '/' + slots + ' · Total x' + (Math.round(petMult(S) * 100) / 100) + ' Cash'));
    const acts = document.createElement('div'); acts.className = 'pet-acts';
    acts.innerHTML = '<button class="btn g-green o1" data-fid="best">Equip Best</button>';
    acts.children[0].addEventListener('click', () => net.send('equipBest'));
    body.appendChild(acts);
    if (!S.pets.length) { body.appendChild(para('No pets yet! Open a Basic Crate at the CRATES stall.')); return; }
    const counts = new Map();
    for (const id of S.pets) counts.set(id, (counts.get(id) || 0) + 1);
    const ids = [...counts.keys()].sort((a, b) => (petDef(b) || { b: 0 }).b - (petDef(a) || { b: 0 }).b);
    const grid = document.createElement('div'); grid.className = 'petgrid';
    for (const id of ids) {
        const d = petDef(id); if (!d) continue;
        const nEq = eq.filter((x) => x === id).length, n = counts.get(id);
        const c = document.createElement('div');
        c.className = 'pet' + (nEq ? ' eq' : '');
        c.dataset.fid = 'p' + id;
        c.tabIndex = 0;
        c.innerHTML = '<span class="cnt o1"></span><span class="pi"></span><span class="pn o1"></span><span class="pb o1"></span><button class="btn g-red del o1" aria-label="Delete one">✕</button>';
        c.querySelector('.cnt').textContent = (nEq ? nEq + '/' : '') + 'x' + n;
        c.querySelector('.pi').textContent = d.ic;
        c.querySelector('.pn').textContent = d.id; c.querySelector('.pn').style.color = RARITY[d.r];
        c.querySelector('.pb').textContent = '+' + d.b + 'x';
        c.addEventListener('click', (e) => {
            if (e.target.closest('.del')) return;
            net.send('equip', { id, on: nEq < n && eq.length < slots ? true : !nEq });
        });
        c.querySelector('.del').addEventListener('click', () => net.send('deletePet', { id }));
        grid.appendChild(c);
    }
    body.appendChild(grid);
}
function renderGears(body) {
    body.appendChild(para('Gears go in your hotbar. Press 1, 2 or 3 (or tap the slot) to hold one.'));
    for (const g of GEARS) {
        const owned = !!S.gears[g.id];
        body.appendChild(rowCard(g.ic, g.name, g.desc, owned ? 'OWNED' : cashIc + fmt(g.cost), owned ? 'g-grey' : 'g-green',
            () => net.send('gear', { id: g.id, buy: true }), owned || S.cash < g.cost));
    }
}
function renderTrails(body) {
    body.appendChild(para('Trails follow you everywhere and multiply your Cash!'));
    const g = document.createElement('div'); g.className = 'cards';
    for (const t of TRAILS) {
        if (t.id === 'None') continue;
        const owned = S.trails[t.id] || (t.pass && S.passes[t.pass]);
        const on = S.trail === t.id;
        const btns = [];
        if (owned) btns.push({ cls: on ? 'g-grey' : 'g-green', html: on ? 'EQUIPPED' : 'EQUIP', disabled: on, fn: () => net.send('trail', { id: t.id }) });
        else if (t.pass) btns.push({ cls: 'g-purple', html: bux(PASSES[t.pass].price), fn: () => buy('pass', t.pass) });
        else btns.push({ cls: 'g-green', html: cashIc + fmt(t.cost), disabled: S.cash < t.cost, fn: () => net.send('trail', { id: t.id }) });
        g.appendChild(shopCard({ rarity: t.rarity, art: t.ic, mx: 'x' + t.mult + ' Cash', on, btns, bg: 'linear-gradient(#ffffff,#dfe4f4)' }));
    }
    body.appendChild(g);
    if (S.trail !== 'None') {
        const off = document.createElement('button'); off.className = 'btn g-grey o1'; off.style.cssText = 'font-size:1rem;padding:0.35rem';
        off.textContent = 'Unequip trail'; off.addEventListener('click', () => net.send('trail', { id: 'None' }));
        body.appendChild(off);
    }
}
// Lucky Wheel: conic-gradient disc; the server picks the prize and the disc spins to it
let wheelSpinning = false, wheelRot = 0;
function renderWheel(body) {
    const n = WHEEL.length, seg = 360 / n;
    const w = document.createElement('div'); w.className = 'wheel-box';
    const stops = WHEEL.map((s, i) => `${s.color} ${(i - 0.5) * seg}deg ${(i + 0.5) * seg}deg`).join(',');
    w.innerHTML = `<div class="wheel-wrap"><div class="pointer"></div><div class="wheel-disc" id="wheelDisc" style="background:conic-gradient(from ${-seg / 2}deg, ${WHEEL.map((s, i) => `${s.color} ${i * seg}deg ${(i + 1) * seg}deg`).join(',')});transform:rotate(${wheelRot}deg)"></div><div class="wheel-hub">SPIN</div></div>`;
    void stops;
    const disc = w.querySelector('#wheelDisc');
    WHEEL.forEach((s, i) => {
        const sp = document.createElement('span'); sp.className = 'o1';
        sp.textContent = s.label;
        sp.style.transform = `rotate(${i * seg - 90}deg)`;
        disc.appendChild(sp);
    });
    const left = Math.max(0, (S.wheelAt || 0) - playtimeNow());
    const free = left <= 0;
    const status = para(free ? 'Your free spin is ready!' : S.spins > 0 ? 'Spins left: ' + S.spins : 'Next free spin in ' + clock(left) + ' of playtime');
    w.appendChild(status);
    const go = document.createElement('button');
    go.className = 'btn o ' + (free || S.spins > 0 ? 'g-green' : 'g-purple');
    setHtml(go, free ? 'FREE SPIN!' : S.spins > 0 ? 'SPIN!' : 'Buy a spin ' + bux(PRODUCTS.LuckySpin.price));
    go.disabled = wheelSpinning;
    go.addEventListener('click', () => {
        if (wheelSpinning) return;
        if (free || S.spins > 0) net.send('spin'); else buy('product', 'LuckySpin');
    });
    w.appendChild(go);
    body.appendChild(w);
}
export function spinWheelUI(i) {
    const seg = 360 / WHEEL.length;
    if (modalKind !== 'wheel') openModal('wheel');
    wheelSpinning = true;
    const base = wheelRot - (wheelRot % 360);
    wheelRot = base + 360 * 6 - i * seg;
    const disc = $('#wheelDisc');
    if (disc) { void disc.offsetWidth; disc.style.transform = `rotate(${wheelRot}deg)`; }
    // Ticks slow down with the wheel
    let tt = 0;
    const tick = () => { if (tt > 3.9) return; sfx('tick'); const k = tt / 4; tt += 0.05 + k * k * 0.45; setTimeout(tick, (0.05 + k * k * 0.45) * 1000); };
    tick();
    setTimeout(() => { wheelSpinning = false; flash('gold'); sfx('buy'); refreshModal(); }, 4100);
}
function renderTeleport(body) {
    const g = document.createElement('div'); g.className = 'tp-grid';
    for (const t of TELEPORTS) {
        const b = document.createElement('button');
        b.className = 'btn o1 g-purple';
        b.textContent = t.ic + ' ' + t.name;
        b.addEventListener('click', () => { closeModal(); actions.teleport(t.id); });
        g.appendChild(b);
    }
    body.appendChild(g);
    body.appendChild(sec('Stages (checkpoints)'));
    for (let w = 0; w < WORLDS.length; w++) {
        const wd = WORLDS[w];
        const row = document.createElement('div'); row.className = 'stage-row';
        const lbl = document.createElement('div'); lbl.className = 'stage-world o1'; lbl.textContent = wd.icon + ' ' + wd.name; lbl.style.color = wd.css;
        row.appendChild(lbl);
        for (let i = 0; i < STAGES_PER_WORLD; i++) {
            const k = w * STAGES_PER_WORLD + i, open = stageOpen(k, S), cleared = k < (S.stage || 0);
            const b = document.createElement('button');
            b.className = 'btn o1 stage-btn ' + (cleared ? 'g-green' : open ? 'g-yellow' : 'g-grey');
            b.textContent = open ? String(k + 1) : '🔒';
            b.disabled = !open;
            b.title = 'Stage ' + (k + 1) + (modLabel(STAGES[k]) ? ' · ' + modLabel(STAGES[k]) : '');
            b.addEventListener('click', () => { closeModal(); actions.teleport('s' + k); });
            row.appendChild(b);
        }
        body.appendChild(row);
    }
}
function renderRebirth(body) {
    const ready = (S.stage || 0) >= STAGE_COUNT;
    const cur = rebirthMult(S), next = cur + CFG.rebirthBonus;
    const w = document.createElement('div');
    w.className = 'rebirth-box';
    w.innerHTML = `<div class="big o">🔄 ${comma(S.rebirths || 0)} Rebirths</div>
        <div class="mult o"><span style="color:#ff5a5a">x${cur} Cash</span><span>➜</span><span style="color:#7dff6b">x${next} Cash</span></div>
        <p>Rebirth sends you back to Stage 1 with a permanent +50% Cash bonus. You keep your Cash, Wins, pets, trails, gears and passes.</p>
        <p style="color:${ready ? '#7dff6b' : '#ffb51c'};font-weight:700">${ready ? 'You cleared all ' + STAGE_COUNT + ' stages. Ready to rebirth!' : 'Clear all ' + STAGE_COUNT + ' stages to rebirth (cleared ' + (S.stage || 0) + ')'}</p>`;
    const b = document.createElement('button');
    b.className = 'btn o ' + (ready ? 'g-green' : 'g-grey');
    b.textContent = 'REBIRTH';
    b.disabled = !ready;
    b.addEventListener('click', () => net.send('rebirth'));
    w.appendChild(b);
    body.appendChild(w);
}
function renderFree(body) {
    const mins = (net.now() - S.joinedAt) / 60000;
    body.appendChild(para('Free gifts for playing! Keep clearing stages to unlock them all.'));
    FREE.forEach((r, i) => {
        const claimed = !!S.freeClaimed[i];
        const ready = mins >= r.min;
        const btn = claimed ? 'Claimed' : ready ? 'CLAIM' : clock(r.min * 60 - mins * 60);
        const card = rowCard(r.crate ? '📦' : r.cash ? '💵' : r.path ? '👣' : r.revives ? '❤️' : '⚡', rewardText(r) + (r.big ? ' ⭐' : ''), 'Play for ' + r.min + ' min', btn,
            claimed ? 'g-grey' : ready ? 'g-green' : 'g-blue', () => { if (!claimed && ready) net.send('free', { i }); }, claimed || !ready);
        card.querySelector('button').dataset.fid = 'g' + i;
        body.appendChild(card);
    });
}
function renderDaily(body) {
    const d = S.daily || { ready: false, day: 0 };
    const w = document.createElement('div');
    w.className = 'daily';
    w.innerHTML = '<p class="desc">Log in every day! Miss a day and the streak starts over.</p><div class="grid"></div>';
    const grid = w.querySelector('.grid');
    DAILY.forEach((r, i) => {
        const done = d.ready ? i < d.day : i <= d.day;
        const today = d.ready && i === d.day;
        const c = document.createElement('div');
        c.className = 'day' + (done ? ' done' : '') + (today ? ' today' : '') + (i === DAILY.length - 1 ? ' big' : '');
        c.innerHTML = '<b class="o1"></b><span class="di"></span><small class="o1"></small>' + (done ? '<i>✔</i>' : '');
        c.querySelector('b').textContent = 'Day ' + (i + 1);
        c.querySelector('.di').textContent = r.crate ? '📦' : r.boost ? '⚡' : '💵';
        c.querySelector('small').textContent = rewardText(r).replace(' & ', ' + ');
        grid.appendChild(c);
    });
    const claim = document.createElement('button');
    claim.className = 'btn o1 ' + (d.ready ? 'g-green' : 'g-grey');
    claim.textContent = d.ready ? 'CLAIM DAY ' + (d.day + 1) : 'Come back tomorrow!';
    claim.disabled = !d.ready;
    claim.addEventListener('click', () => net.send('daily'));
    w.appendChild(claim);
    body.appendChild(w);
}
const statValue = (stat) => S[stat] || 0;
function renderQuests(body) {
    QUESTS.forEach((q, i) => {
        if (i < S.quest - 2 || i > S.quest + 4) return;
        const done = i < S.quest, cur = i === S.quest;
        const v = Math.min(statValue(q.stat), q.n);
        const r = document.createElement('div');
        r.className = 'quest-row' + (done ? ' done' : '') + (cur ? ' cur' : '');
        r.innerHTML = '<span></span><span class="o1"></span><small class="o1"></small>' + (cur ? '<div class="qbar"><div></div></div>' : '');
        r.children[0].textContent = done ? '✅' : cur ? '⭐' : '🔒';
        r.children[1].textContent = q.text + (cur ? ' (' + comma(v) + '/' + comma(q.n) + ')' : '');
        r.children[2].textContent = rewardText(q.reward);
        if (cur) r.querySelector('.qbar div').style.width = (v / q.n * 100) + '%';
        body.appendChild(r);
    });
    if (S.quest >= QUESTS.length) body.appendChild(para('All quests done. You are a Math Genius!'));
}
// The current quest as a short line (used by the tutorial banner)
export function questLine() {
    if (performance.now() < tutDoneUntil) return 'Tutorial complete! Enjoy the game';
    const q = QUESTS[S.quest];
    if (!q || S.quest >= TUTORIAL_STEPS) return '';
    return q.text + (q.n > 1 ? ' (' + comma(Math.min(statValue(q.stat), q.n)) + '/' + comma(q.n) + ')' : '');
}
function renderCodes(body) {
    body.appendChild(para('Got a code? Type it in for free rewards!'));
    const row = document.createElement('div');
    row.className = 'code-row';
    row.innerHTML = '<input id="codeIn" maxlength="24" placeholder="ENTER CODE" aria-label="Code" autocomplete="off"><button class="btn g-green o1" id="codeGo">Redeem</button>';
    const go = () => { const v = row.querySelector('input').value.trim(); if (v) net.send('code', { code: v }); row.querySelector('input').value = ''; };
    row.querySelector('button').addEventListener('click', go);
    row.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); e.stopPropagation(); });
    body.appendChild(row);
    body.appendChild(para('Try: RELEASE · MATH · GLASS · BRIDGE · LEGION · BLOXITY'));
}
function renderSettings(body) {
    const vols = getVolumes();
    const w = document.createElement('div');
    w.className = 'settings';
    w.innerHTML = `
        <label class="set-row o1" for="volMusic"><span>🎵 Music</span><input id="volMusic" type="range" min="0" max="100" value="${Math.round(vols.music * 100)}"></label>
        <label class="set-row o1" for="volSfx"><span>🔊 Sounds</span><input id="volSfx" type="range" min="0" max="100" value="${Math.round(vols.sfx * 100)}"></label>
        <div class="set-row o1"><span>✨ Graphics</span><div class="seg" role="radiogroup" aria-label="Graphics quality"></div></div>
        <p class="set-note">Low turns off glow and shadows for older phones.</p>`;
    w.querySelector('#volMusic').addEventListener('input', (e) => setVolume('music', e.target.value / 100));
    w.querySelector('#volSfx').addEventListener('input', (e) => setVolume('sfx', e.target.value / 100));
    const seg = w.querySelector('.seg');
    for (const [key, q] of Object.entries(QUALITIES)) {
        const b = document.createElement('button');
        b.className = 'btn o1 ' + (getQuality() === key ? 'g-green' : 'g-grey');
        b.textContent = q.label;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(getQuality() === key));
        b.addEventListener('click', () => { setQuality(key); renderModal(); });
        seg.appendChild(b);
    }
    body.appendChild(w);
    body.appendChild(sec('Your stats'));
    const m = cashMult(S, net.now(), S.friends);
    body.appendChild(para('Stage ' + Math.min(STAGE_COUNT, (S.stage || 0) + 1) + '/' + STAGE_COUNT + ' · Rebirths: ' + comma(S.rebirths || 0) + ' · Right answers: ' + comma(S.answers) + ' · Best streak: ' + comma(S.bestStreak) + ' · Wins: ' + comma(S.wins)));
    body.appendChild(para('Cash multiplier: x' + (Math.round(m * 100) / 100) + ' (passes x' + passMult(S) + ', rebirths x' + rebirthMult(S) + ', trail x' + trailDef(S.trail).mult + ', pets x' + (Math.round(petMult(S) * 100) / 100) + ')'));
}
// Bloxity friends with presence, a shareable invite link and per-friend invites
function renderFriends(body) {
    const note = (text) => { const p = document.createElement('p'); p.className = 'set-note'; p.textContent = text; body.appendChild(p); return p; };
    if (!BX.bloxity.ready) { note('Bloxity is not available right now.'); return; }
    const id = BX.identity();
    note('Every Bloxity friend in your server gives +10% Cash (up to +50%).');
    const link = document.createElement('div');
    link.className = 'invite-row';
    link.innerHTML = '<input id="inviteLink" readonly aria-label="Invite link"><button class="btn g-green o1" id="copyInvite">Copy link</button>';
    body.appendChild(link);
    const input = link.querySelector('input');
    input.value = BX.getInviteLink();
    link.querySelector('button').addEventListener('click', async () => {
        input.select();
        try { await navigator.clipboard.writeText(input.value); toast('Invite link copied!', '#7dff6b'); }
        catch (e) { toast('Select the link and copy it', '#ffb51c'); }
    });
    if (!id.loggedIn) {
        note('Log in with Bloxity to see your friends and invite them into this server.');
        const b = document.createElement('button');
        b.className = 'btn g-blue o1'; b.textContent = 'Log in with Bloxity';
        b.addEventListener('click', () => BX.login());
        body.appendChild(b);
        return;
    }
    const loading = note('Loading friends…');
    BX.getFriends().then((friends) => {
        if (modalKind !== 'friends') return;
        loading.remove();
        if (!friends.length) { note('No friends yet. Share the invite link above!'); return; }
        const order = { 'in-game': 0, online: 1, away: 2, offline: 3 };
        friends.sort((a, b) => (order[a.presence && a.presence.status] ?? 4) - (order[b.presence && b.presence.status] ?? 4));
        for (const f of friends) {
            const st = (f.presence && f.presence.status) || 'offline';
            const where = st === 'in-game' && f.presence.gameName ? 'Playing ' + f.presence.gameName : st;
            const dot = st === 'offline' ? '⚫' : st === 'away' ? '🟡' : '🟢';
            body.appendChild(rowCard(dot, f.displayName || f.username, where, 'Invite', 'g-green', async (e) => {
                e.currentTarget.disabled = true;
                const ok = await BX.inviteFriend(f._id);
                toast(ok ? 'Invite sent to ' + (f.displayName || f.username) : 'Could not send the invite', ok ? '#7dff6b' : '#ff5a5a');
            }));
        }
    });
}
void crateDef;
