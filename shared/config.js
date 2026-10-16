// Game data shared by the client and the Colyseus server.
// Clone target: Roblox "Math Glass Bridge" (reference/Gameplay.mp4).
//
// The loop: a long journey of glass bridges through space. Every row is a math question with a
// number on each glass pane: step on the right answer and earn Cash, step on the wrong one and
// the glass shatters under you. Every stage ends on a checkpoint island (your progress is saved)
// and the math gets harder every stage. 20 stages in 2 worlds of 10, each world ending on a boss
// stage with a big chest, then Rebirth for a permanent Cash bonus and do it again.
export { questionFor, stageQuestions, rngFrom, LEVELS } from './questions.js';

export const CFG = {
    walkSpeed: 20,
    gravity: 150,
    jumpHeight: 6.5,
    maxPlayers: 24,
    voidY: -70,
    reviveSecs: 6,          // the Revive bar
    petSlots: 3,
    petBag: 60,
    stepCooldown: 0.12,     // fastest the server takes answers from one player (s)
    eventCycle: 30 * 60,    // MATH RUSH: the last 5 minutes of every 30 are x2 Cash
    eventLive: 5 * 60,
    friendBoost: 0.1,
    friendMax: 5,
    boostMinutes: 15,
    streakStep: 0.05,       // +5% Cash per answer in a row...
    streakMax: 1,           // ...up to +100%
    wheelEvery: 10 * 60,    // a free Lucky Wheel spin every 10 minutes of playtime
    crumbleSecs: 2.0,       // Crumbling Glass: a pane breaks this long after you step on it (1.6 s in World 2)
    shuffleMs: 2200,        // Shuffle: the numbers swap panes this often (1.8 s in World 2)
    rebirthBonus: 0.5,      // +50% Cash per rebirth
};

// ---------------------------------------------------------------------------------
// Worlds (10 stages each) and stage modifiers
// ---------------------------------------------------------------------------------
export const MODS = {
    none: { name: '', icon: '', hint: '' },
    dark: { name: 'LIGHTS OUT', icon: '🌑', hint: 'The glass only lights up right in front of you' },
    crumble: { name: 'CRUMBLING GLASS', icon: '⏳', hint: 'Every pane breaks 2 seconds after you step on it. Keep moving!' },
    shuffle: { name: 'SHUFFLE', icon: '🔀', hint: 'The numbers swap panes every 2 seconds. Step when the right one is under you!' },
    ghost: { name: 'GHOST GLASS', icon: '👻', hint: 'The numbers only show up in flashes. Remember them!' },
    timer: { name: 'TIME LIMIT', icon: '⏱️', hint: 'Answer every row in time, or the glass under you breaks!' },
};
// Every world theme the game knows. The game uses the ones listed in WORLD_IDS (in order),
// so swapping or adding a world is a one-line change there.
export const ALL_WORLDS = [
    { id: 'station', name: 'Space Station', icon: '🛰️', color: 0x6fe0ff, css: '#6fe0ff', palette: [0xff3a5a, 0x2fe06a, 0x2f8bff, 0xb04aff, 0xff9a1e, 0x18d8e8],
        rail: 0xe8dcff, neon: 0x6fe0ff, island: 0x6a5ae0, sky: { a: 0x8c1fa0, b: 0x0d5a8c, low: 0x140838, mid: 0x0a0628, top: 0x020110 }, fog: 0x1a1250, mods: ['none', 'none'] },
    { id: 'candy', name: 'Candy Land', icon: '🍭', color: 0xff8fd0, css: '#ff8fd0', palette: [0xff5ab4, 0xffd23a, 0x7dff9a, 0xff8a5a, 0xc48cff, 0x5ad8ff],
        rail: 0xffe0f0, neon: 0xff6bd5, island: 0xff9ad0, sky: { a: 0xc02a8a, b: 0x7a3ad0, low: 0x2a0a30, mid: 0x180626, top: 0x060210 }, fog: 0x3a1040, mods: ['dark', 'none'] },
    { id: 'ice', name: 'Ice Kingdom', icon: '❄️', color: 0x9ae8ff, css: '#9ae8ff', palette: [0x7fe8ff, 0x5ab4ff, 0xdff6ff, 0x8a9aff, 0x5affe0, 0xb0c8ff],
        rail: 0xeaf8ff, neon: 0x9ae8ff, island: 0xcfeeff, sky: { a: 0x2a8ac8, b: 0x6a4ad0, low: 0x0a2040, mid: 0x06122a, top: 0x020614 }, fog: 0x18304a, mods: ['crumble', 'dark'] },
    { id: 'jungle', name: 'Jungle Temple', icon: '🌴', color: 0x7dff6b, css: '#7dff6b', palette: [0x46ec50, 0xd8e83a, 0x2fc8a0, 0xff9a3a, 0x8aff5a, 0x3ab8ff],
        rail: 0xe8dcb0, neon: 0x7dff6b, island: 0x5ab84a, sky: { a: 0x2a9a4a, b: 0x1a5a8a, low: 0x0a2a14, mid: 0x06180c, top: 0x020804 }, fog: 0x10301a, mods: ['shuffle', 'crumble'] },
    { id: 'ocean', name: 'Deep Ocean', icon: '🐠', color: 0x28c8ff, css: '#5ad8ff', palette: [0x18c8e8, 0x2f8bff, 0x5affc8, 0xff8a6a, 0x8a6aff, 0xffd23a],
        rail: 0xd8f4ff, neon: 0x28c8ff, island: 0x2a7ad0, sky: { a: 0x0a6aa0, b: 0x1a3ab0, low: 0x041838, mid: 0x020c24, top: 0x010410 }, fog: 0x0a2440, mods: ['ghost', 'shuffle'] },
    { id: 'desert', name: 'Desert Pyramids', icon: '🏜️', color: 0xffc83a, css: '#ffd86a', palette: [0xffb43a, 0xff7a3a, 0xffe07a, 0x3ad8c8, 0xe85a8a, 0xc8a0ff],
        rail: 0xfff0d0, neon: 0xffb43a, island: 0xe8b85a, sky: { a: 0xc06a2a, b: 0x8a3a6a, low: 0x301808, mid: 0x1c0c06, top: 0x080402 }, fog: 0x3a2410, mods: ['crumble', 'ghost'] },
    { id: 'lava', name: 'Lava Core', icon: '🌋', color: 0xff6a3a, css: '#ff8a5a', palette: [0xff4a2a, 0xff9a1e, 0xffd23a, 0xe82a6a, 0xff6a3a, 0xb04aff],
        rail: 0x5a3a3a, neon: 0xff5a2a, island: 0x4a2a2a, sky: { a: 0xc0281a, b: 0x8a1a4a, low: 0x300804, mid: 0x1c0402, top: 0x080100 }, fog: 0x3a0e08, mods: ['shuffle', 'crumble'] },
    { id: 'cyber', name: 'Cyber City', icon: '🤖', color: 0x3affd8, css: '#5affe0', palette: [0x3affd8, 0xff3ad8, 0x3a8cff, 0xd8ff3a, 0xa03aff, 0xff3a6a],
        rail: 0x3a3a5a, neon: 0x3affd8, island: 0x2a2a4a, sky: { a: 0x1aa0a0, b: 0xa01a9a, low: 0x061818, mid: 0x040a14, top: 0x01020a }, fog: 0x082028, mods: ['dark', 'shuffle'] },
    { id: 'rainbow', name: 'Rainbow Galaxy', icon: '🌈', color: 0xc46bff, css: '#d08aff', palette: [0xff3a3a, 0xff9a1e, 0xffe14a, 0x46ec50, 0x28c8ff, 0x8a5cff],
        rail: 0xffffff, neon: 0xc46bff, island: 0x8a5cff, sky: { a: 0xa02ad0, b: 0x2a6ad0, low: 0x1a0838, mid: 0x0c0424, top: 0x040110 }, fog: 0x200c40, mods: ['ghost', 'crumble'] },
    { id: 'heaven', name: 'Golden Heaven', icon: '👑', color: 0xffd028, css: '#ffe14a', palette: [0xffd028, 0xfff0a0, 0xffb43a, 0xffffff, 0xffe07a, 0x8ad8ff],
        rail: 0xfff4d0, neon: 0xffd028, island: 0xfff0c8, sky: { a: 0xc0a03a, b: 0x6a8ad0, low: 0x2a2410, mid: 0x181408, top: 0x060402 }, fog: 0x30280c, mods: ['shuffle', 'dark'] },
];
export const WORLD_IDS = ['station', 'candy'];
export const WORLDS = WORLD_IDS.map((id) => ALL_WORLDS.find((w) => w.id === id));
export const STAGES_PER_WORLD = 10;
export const STAGE_COUNT = WORLDS.length * STAGES_PER_WORLD;
// The modifiers of every stage ('+' combines them). Each world ends on a boss stage.
export const STAGE_MODS = [
    // World 1: stages 1-10
    'none', 'none', 'dark', 'timer', 'crumble', 'none', 'shuffle', 'ghost', 'timer', 'dark+crumble',
    // World 2: stages 11-20
    'ghost', 'shuffle', 'timer', 'dark+shuffle', 'crumble', 'ghost+timer', 'shuffle+crumble', 'dark+timer', 'ghost+crumble', 'dark+shuffle+timer',
];

// ---------------------------------------------------------------------------------
// Stage geometry (studs). +z is "forward" from the lobby. Facing forward, +x is on your left.
// Stage k: its start platform (the lobby pad for stage 0, else checkpoint island k), then its rows.
// Row r of stage k: front edge at z0 + r * pitch, top at y + (r + 1) * rise. The rows end on
// island k + 1, which is the finish of stage k and the start of stage k + 1.
// ---------------------------------------------------------------------------------
export const BR = {
    pitch: 8.8, depth: 8, rise: 0.45, gap: 1.0, thick: 0.6,
    padZ0: 40, padD: 14,              // the lobby pad in front of stage 1
    islandD: 36, islandW: 50,         // checkpoint islands
    finalD: 70,                       // the Golden Throne after the last stage
};
const PANE_W = { 2: 10, 3: 8, 4: 7, 5: 6 };
export const perRowCash = (k) => Math.floor(15 * Math.pow(1.38, k));
function niceRound(v) { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1)); return Math.round(v / p) * p; }
export const STAGES = [];
export const ISLANDS = [null]; // ISLANDS[j] = island j (1..STAGE_COUNT): start of stage j, finish of stage j-1
{
    const xs = [];
    for (let k = 0; k < STAGE_COUNT; k++) xs.push(k < 5 ? 0 : Math.round(Math.sin(k * 0.9) * 11));
    let z = BR.padZ0, y = 0, startD = BR.padD, startX = 0;
    for (let k = 0; k < STAGE_COUNT; k++) {
        const w = Math.floor(k / STAGES_PER_WORLD), idx = k % STAGES_PER_WORLD, world = WORLDS[w];
        const boss = idx === STAGES_PER_WORLD - 1;
        // 11 rows on Stage 1 up to 29 on the last boss; 2 panes, then 3, 4 and 5
        const rows = 11 + Math.floor(k * 0.75) + (boss ? 4 : 0);
        const choices = k < 2 ? 2 : k < 5 ? 3 : k < 10 ? (boss || k % 2 ? 4 : 3) : k < 15 ? 4 : (boss || k % 2 ? 5 : 4);
        const pw = PANE_W[choices], W = choices * pw + (choices - 1) * BR.gap;
        const mods = (STAGE_MODS[k] || 'none').split('+');
        const mod = mods[0];
        const cash = perRowCash(k);
        // The math level (0..9) climbs fast: the hardest questions start around Stage 18
        const level = Math.min(9, Math.floor(k * 0.55));
        const st = {
            k, w, idx, level, rows, choices, pw, W, mod, mods, boss, x: xs[k], y,
            timer: Math.max(8, Math.round(13 - k * 0.25)),   // Time Limit: seconds per row
            crumble: w === 0 ? CFG.crumbleSecs : 1.6,
            shuffleMs: w === 0 ? CFG.shuffleMs : 1800,
            startZ: z, startD, startX, z0: z + startD,
            cash, chest: niceRound(cash * rows * (boss ? 12 : 4)), wins: boss ? 5 : 1,
        };
        void world;
        st.endZ = st.z0 + (rows - 1) * BR.pitch + BR.depth + 0.6;
        st.endY = y + (rows + 1) * BR.rise;
        STAGES.push(st);
        // The island after it
        const last = k === STAGE_COUNT - 1;
        const ix = last ? xs[k] : (xs[k] + xs[k + 1]) / 2;
        const isl = { j: k + 1, z0: st.endZ, d: last ? BR.finalD : BR.islandD, top: st.endY, x: ix, w: BR.islandW + (last ? 20 : 0), worldStart: !last && (k + 1) % STAGES_PER_WORLD === 0, last };
        ISLANDS.push(isl);
        z = isl.z0; y = isl.top; startD = isl.d; startX = ix;
    }
}
export const rowTop = (st, r) => st.y + (r + 1) * BR.rise;
export const rowZ = (st, r) => st.z0 + r * BR.pitch;
export const paneX = (st, s) => st.x + st.W / 2 - st.pw / 2 - s * (st.pw + BR.gap);
// Which pane (row r, side s) of stage st a point stands on, or null
export function paneAt(st, x, z) {
    const r = Math.floor((z - st.z0) / BR.pitch);
    if (r < 0 || r >= st.rows || z - rowZ(st, r) > BR.depth) return null;
    for (let s = 0; s < st.choices; s++) if (Math.abs(x - paneX(st, s)) <= st.pw / 2) return { r, s };
    return null;
}
// The stage whose start platform or rows contain z, or -1 in the lobby
export function stageAtZ(z) {
    if (z < BR.padZ0) return -1;
    let lo = 0, hi = STAGE_COUNT - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (STAGES[m].startZ <= z) lo = m; else hi = m - 1; }
    return lo;
}
// Where a stage's checkpoint is (respawn spot)
export function checkpointPos(k) {
    if (k <= 0) return { x: 0, y: 0.6, z: BR.padZ0 - 8 };
    const isl = ISLANDS[Math.min(k, STAGE_COUNT)];
    return { x: isl.x, y: isl.top + 0.05, z: isl.z0 + 10 };
}
export const stageOpen = (k, p) => k >= 0 && k <= Math.min(STAGE_COUNT - 1, p.stage || 0);
export const worldOf = (k) => WORLDS[Math.min(WORLDS.length - 1, Math.floor(Math.max(0, k) / STAGES_PER_WORLD))];
export const hasMod = (st, m) => st.mods.includes(m);
// "🌑 LIGHTS OUT + ⏱️ TIME LIMIT" (empty for a plain stage)
export const modLabel = (st) => st.mods.filter((m) => m !== 'none').map((m) => MODS[m].icon + ' ' + MODS[m].name).join(' + ');
// Shuffle stages: which option pane s shows at server time t (ms)
export const shuffleShift = (t, r, choices, ms) => Math.floor((t + r * 737) / (ms || CFG.shuffleMs)) % choices;
export const shownOption = (st, r, s, t) => (hasMod(st, 'shuffle') ? (s + shuffleShift(t, r, st.choices, st.shuffleMs)) % st.choices : s);
// Free revives: once per stage in World 1 only (always with the Infinite Revives pass)
export const freeRevive = (st, p, run) => !!(p.passes && p.passes.InfiniteRevive) || (st.w === 0 && !run.freeUsed);

// ---------------------------------------------------------------------------------
// The lobby (studs)
// ---------------------------------------------------------------------------------
export const WORLD = {
    halfX: 84, zMin: -74, zMax: BR.padZ0,
    spawn: { x: 0, y: 0.6, z: -52 },
};
export const SPOTS = {
    crates: { x: 58, z: -36 },
    gears: { x: 58, z: -8 },
    trails: { x: -58, z: -8 },
    wheel: { x: -56, z: -40 },
    boards: { x: -38, z: -69 },
    spaceChest: { x: 22, z: -58 },
    stairs: { x: 70, z: 24 },          // the Rainbow Stairs tower (chest on top)
    portal: { x: -24, z: -34 },        // the Continue portal (to your checkpoint)
};
export const STAIRS = { steps: 26, radius: 10, rise: 2.6 };
export const CHESTS = {
    space: { name: 'Space Chest', cash: 1500, every: 15 * 60 },
    stairs: { name: 'Rainbow Stairs Chest', cash: 5000, every: 10 * 60 },
};
export const chestCash = (id, p) => Math.floor(CHESTS[id].cash * (1 + Math.min(STAGE_COUNT, p.stage || 0) * 0.5) * rebirthMult(p));

// Places in the Teleport menu (stages are listed in their own grid)
export const TELEPORTS = [
    { id: 'spawn', name: 'Lobby', ic: '🏠' },
    { id: 'crates', name: 'Crates', ic: '📦' },
    { id: 'gears', name: 'Gears', ic: '⚙️' },
    { id: 'stairs', name: 'Rainbow Stairs', ic: '🌈' },
];

// ---------------------------------------------------------------------------------
// Pets (from crates), trails and gears. Pets and trails multiply your Cash.
// ---------------------------------------------------------------------------------
export const RARITY = {
    Common: '#c8d0e0', Uncommon: '#7dff6b', Rare: '#28c8ff', Epic: '#c46bff', Legendary: '#ffd028', Mythic: '#ff4a6a', Limited: '#ff8fd0',
};
export const PETS = [
    { id: 'Pencil Pup', r: 'Common', b: 0.1, c: 0xffc83a, ic: '🐶', sym: '✏' },
    { id: 'Eraser Cat', r: 'Common', b: 0.15, c: 0xff8fb0, ic: '🐱', sym: '▭' },
    { id: 'Ruler Bunny', r: 'Uncommon', b: 0.25, c: 0x7fe8ff, ic: '🐰', sym: '📏' },
    { id: 'Abacus Bear', r: 'Uncommon', b: 0.4, c: 0xc8823a, ic: '🐻', sym: '+' },
    { id: 'Protractor Fox', r: 'Rare', b: 0.7, c: 0xff8a1e, ic: '🦊', sym: '∠' },
    { id: 'Compass Owl', r: 'Rare', b: 1.1, c: 0x9a7aff, ic: '🦉', sym: '○' },
    { id: 'Calculator Dragon', r: 'Epic', b: 2.2, c: 0x2fd84a, ic: '🐲', sym: '=' },
    { id: 'Pi Panda', r: 'Epic', b: 4, c: 0xf4f4f4, ic: '🐼', sym: 'π' },
    { id: 'Galaxy Brain', r: 'Legendary', b: 8, c: 0x5a3cff, ic: '🧠', sym: '∑' },
    { id: 'Infinity Kitty', r: 'Mythic', b: 20, c: 0x16121f, ic: '😼', sym: '∞' },
    { id: 'Golden Genius', r: 'Limited', b: 50, c: 0xffd028, ic: '🦄', sym: '★' },
];
export const petDef = (id) => PETS.find((p) => p.id === id) || null;
export const CRATES = [
    { id: 'Basic', name: 'Basic Crate', cost: 2500, color: 0x3a8cff, odds: [['Pencil Pup', 60], ['Eraser Cat', 35], ['Ruler Bunny', 5]] },
    { id: 'Galaxy', name: 'Galaxy Crate', cost: 40000, color: 0x8a3cff, odds: [['Ruler Bunny', 50], ['Abacus Bear', 35], ['Protractor Fox', 14], ['Compass Owl', 1]] },
    { id: 'Genius', name: 'Genius Crate', cost: 400000, color: 0xffb51c, odds: [['Protractor Fox', 55], ['Compass Owl', 35], ['Calculator Dragon', 9.5], ['Pi Panda', 0.5]] },
    { id: 'Mythic', name: 'Mythic Crate', product: 'MythicCrate', color: 0xff3fa0, odds: [['Calculator Dragon', 55], ['Pi Panda', 35], ['Galaxy Brain', 9], ['Infinity Kitty', 1]] },
];
export const crateDef = (id) => CRATES.find((b) => b.id === id) || null;
export function rollPet(crate, rnd) {
    const total = crate.odds.reduce((a, o) => a + o[1], 0);
    let r = rnd() * total;
    for (const [id, w] of crate.odds) { r -= w; if (r <= 0) return id; }
    return crate.odds[crate.odds.length - 1][0];
}
export function petMult(p) {
    let m = 1;
    for (const id of p.equipped || []) { const d = petDef(id); if (d) m += d.b; }
    return m;
}
export const petSlots = (p) => CFG.petSlots + (p.passes && p.passes.VIP ? 1 : 0);
export function bestPets(pets, n) {
    return (pets || []).slice().sort((a, b) => (petDef(b) ? petDef(b).b : 0) - (petDef(a) ? petDef(a).b : 0)).slice(0, n);
}

export const TRAILS = [
    { id: 'None', cost: 0, mult: 1, colors: [] },
    { id: 'Chalk', cost: 6000, mult: 1.1, rarity: 'Common', colors: [0xffffff, 0xe8f0ff], ic: '🖍️' },
    { id: 'Pencil', cost: 30000, mult: 1.25, rarity: 'Uncommon', colors: [0xffd23a, 0xff9a1e, 0xffffff], ic: '✏️' },
    { id: 'Plus', cost: 150000, mult: 1.5, rarity: 'Rare', colors: [0x46ec50, 0x7dff6b, 0xffffff], ic: '➕' },
    { id: 'Laser', cost: 750000, mult: 1.8, rarity: 'Epic', colors: [0xff3a5a, 0xff8fd0, 0xffffff], ic: '🔴' },
    { id: 'Galaxy', cost: 4000000, mult: 2.2, rarity: 'Legendary', colors: [0xc28cff, 0x6a3cff, 0x6fe0ff], ic: '🌌' },
    { id: 'Rainbow', pass: 'RainbowTrail', mult: 2.5, rarity: 'Mythic', colors: [0xff3a3a, 0xff9a1e, 0xffe14a, 0x46ec50, 0x28c8ff, 0x8a5cff], ic: '🌈' },
];
export const trailDef = (id) => TRAILS.find((t) => t.id === id) || TRAILS[0];
export const trailIndex = (id) => Math.max(0, TRAILS.findIndex((t) => t.id === id));

// Gears sit in the hotbar (1-3). The Calculator is free; the coils are bought with Cash.
export const GEARS = [
    { id: 'calc', name: 'Calculator', cost: 0, ic: '🧮', desc: 'Pocket calculator for the hard rows' },
    { id: 'speed', name: 'Speed Coil', cost: 12000, ic: '⚡', desc: 'Walk 35% faster while it is in your hand', speed: 1.35 },
    { id: 'gravity', name: 'Gravity Coil', cost: 30000, ic: '🪐', desc: 'Floaty moon jumps (not on the glass!)', gravity: 0.5 },
];
export const gearDef = (id) => GEARS.find((g) => g.id === id) || null;

// ---------------------------------------------------------------------------------
// Cash multipliers: passes, VIP, rebirths, pets, trail, streak, event, boost, friends
// ---------------------------------------------------------------------------------
export const passMult = (p) => (p.passes && p.passes.DoubleCash ? 2 : 1) * (p.passes && p.passes.VIP ? 1.5 : 1);
export const rebirthMult = (p) => 1 + (p.rebirths || 0) * CFG.rebirthBonus;
export const mathRush = (now) => ((now / 1000) % CFG.eventCycle) >= CFG.eventCycle - CFG.eventLive;
export function eventLeft(now) {
    const ph = (now / 1000) % CFG.eventCycle, start = CFG.eventCycle - CFG.eventLive;
    return ph >= start ? CFG.eventCycle - ph : start - ph;
}
export function cashMult(p, now, friends) {
    let m = passMult(p) * rebirthMult(p) * trailDef(p.trail).mult * petMult(p);
    if (mathRush(now)) m *= 2;
    if (now < (p.boostUntil || 0)) m *= 2;
    m *= 1 + Math.min(CFG.friendMax, friends || 0) * CFG.friendBoost;
    return m;
}
export const streakMult = (streak) => 1 + Math.min(CFG.streakMax, Math.max(0, streak - 1) * CFG.streakStep);
export const rowCash = (k, p, now, friends, streak) => Math.max(1, Math.floor(STAGES[k].cash * cashMult(p, now, friends) * streakMult(streak)));
export const chestCashFor = (k, p, now, friends) => Math.floor(STAGES[k].chest * cashMult(p, now, friends));
// Leaderboard score for "Top Stage": every rebirth counts as all the stages
export const stageScore = (p) => (p.rebirths || 0) * STAGE_COUNT + (p.stage || 0);

// ---------------------------------------------------------------------------------
// Lucky Wheel
// ---------------------------------------------------------------------------------
export const WHEEL = [
    { label: '$2K', cash: 2000, w: 26, color: '#46ec50' },
    { label: 'Basic Crate', crate: 'Basic', w: 16, color: '#3a8cff' },
    { label: '$10K', cash: 10000, w: 16, color: '#ffd028' },
    { label: 'x2 Cash', boost: 5, w: 14, color: '#ff3fa0' },
    { label: '$25K', cash: 25000, w: 10, color: '#ff8a1e' },
    { label: 'Show Path', path: 1, w: 9, color: '#c46bff' },
    { label: '$100K', cash: 100000, w: 4, color: '#ff3a3a' },
    { label: 'Galaxy Crate', crate: 'Galaxy', w: 5, color: '#6a3cff' },
];
export function rollWheel(rnd) {
    const total = WHEEL.reduce((a, s) => a + s.w, 0);
    let r = rnd() * total;
    for (let i = 0; i < WHEEL.length; i++) { r -= WHEEL[i].w; if (r <= 0) return i; }
    return 0;
}

// ---------------------------------------------------------------------------------
// Store (Bux)
// ---------------------------------------------------------------------------------
export const PRODUCTS = {
    ShowPath: { name: 'Show Path', price: 15, ic: '👣', desc: 'The right glass glows gold for your next stage' },
    SkipToEnd: { name: 'Skip Stage', price: 29, ic: '⏭️', desc: 'Jump straight to the end of the stage you are on' },
    KillAll: { name: 'Kill All', price: 49, ic: '💀', desc: 'Shatter the glass under every other player!' },
    Revive: { name: 'Revive', price: 5, ic: '❤️', desc: 'Back on the glass right where you fell' },
    Cash10K: { name: '+$10K Cash', price: 9, cash: 10000, ic: '💵' },
    Cash100K: { name: '+$100K Cash', price: 49, cash: 100000, ic: '💰' },
    Cash1M: { name: '+$1M Cash', price: 199, cash: 1000000, ic: '🏦' },
    CashBoost: { name: 'x2 Cash (15 min)', price: 15, ic: '⚡', desc: 'Double Cash from every right answer for 15 minutes' },
    MythicCrate: { name: 'Mythic Crate', price: 79, ic: '🎁', desc: 'Calculator Dragon, Pi Panda, Galaxy Brain or the Infinity Kitty!' },
    GoldenGenius: { name: 'Golden Genius (Limited)', price: 149, pet: 'Golden Genius', ic: '🦄', desc: 'Limited pet: +50x Cash' },
    LuckySpin: { name: 'Lucky Spin', price: 9, ic: '🎡', desc: 'One more spin of the Lucky Wheel' },
    StarterPack: { name: 'Starter Pack', price: 9, cash: 5000, ic: '🎒', desc: '+$5K Cash and a Basic Crate, once' },
};
export const PASSES = {
    DoubleCash: { name: '2x Cash', price: 49, ic: '💵', desc: 'x2 Cash from every right answer and chest, forever' },
    Speed: { name: '2x Speed', price: 25, ic: '👟', desc: 'Run much faster, everywhere' },
    VIP: { name: 'VIP', price: 99, ic: '👑', desc: 'x1.5 Cash, a gold VIP tag and +1 pet slot' },
    InfiniteRevive: { name: 'Infinite Revives', price: 79, ic: '♾️', desc: 'Every revive is free, forever' },
    RainbowTrail: { name: 'Rainbow Trail', price: 39, ic: '🌈', desc: 'x2.5 Cash rainbow trail' },
};
export const speedMult = (p) => (p.passes && p.passes.Speed ? 1.6 : 1);
// Bloxity Bux SKUs: create these in the game's IAP catalog on bloxity.io (prices live there)
export const SKUS = {
    product: {
        ShowPath: 'show_path', SkipToEnd: 'skip_stage', KillAll: 'kill_all', Revive: 'revive',
        Cash10K: 'cash_10k', Cash100K: 'cash_100k', Cash1M: 'cash_1m', CashBoost: 'cash_boost',
        MythicCrate: 'mythic_crate', GoldenGenius: 'golden_genius', LuckySpin: 'lucky_spin', StarterPack: 'starter_pack',
    },
    pass: {
        DoubleCash: 'pass_double_cash', Speed: 'pass_speed', VIP: 'pass_vip', InfiniteRevive: 'pass_infinite_revive', RainbowTrail: 'pass_rainbow_trail',
    },
};
export function skuLookup(sku) {
    for (const kind of ['product', 'pass']) for (const [key, s] of Object.entries(SKUS[kind])) if (s === sku) return { kind, key };
    return null;
}

// Quest chain. The first three are the tutorial (shown across the top with guide arrows).
export const TUTORIAL_STEPS = 3;
export const QUESTS = [
    { text: 'Walk onto the glass and pick the right answer!', stat: 'answers', n: 1, reward: { cash: 300 }, goal: 'stage' },
    { text: 'Clear Stage 1!', stat: 'stage', n: 1, reward: { cash: 600 }, goal: 'stage' },
    { text: 'Reach Stage 3!', stat: 'stage', n: 2, reward: { cash: 1000 }, goal: 'stage' },
    { text: 'Open a Basic Crate!', stat: 'hatched', n: 1, reward: { cash: 1500 } },
    { text: 'Clear Stage 5!', stat: 'stage', n: 5, reward: { cash: 5000 } },
    { text: 'Get a streak of 15 right answers!', stat: 'bestStreak', n: 15, reward: { crate: 'Basic' } },
    { text: 'Finish World 1 (beat the Stage 10 boss)!', stat: 'stage', n: 10, reward: { cash: 50000 } },
    { text: 'Answer 250 questions right!', stat: 'answers', n: 250, reward: { crate: 'Galaxy' } },
    { text: 'Clear Stage 15!', stat: 'stage', n: 15, reward: { cash: 250000 } },
    { text: 'Get a streak of 30!', stat: 'bestStreak', n: 30, reward: { crate: 'Genius' } },
    { text: 'Finish World 2 (clear all 20 stages)!', stat: 'stage', n: 20, reward: { cash: 3000000 } },
    { text: 'Rebirth once!', stat: 'rebirths', n: 1, reward: { cash: 5000000 } },
    { text: 'Answer 5,000 questions right!', stat: 'answers', n: 5000, reward: { cash: 25000000 } },
    { text: 'Rebirth 5 times!', stat: 'rebirths', n: 5, reward: { cash: 100000000 } },
];

// Daily login streak: claim once per (UTC) day; missing a day starts over at Day 1
export const DAILY = [
    { cash: 1000 }, { crate: 'Basic' }, { cash: 5000 }, { boost: 10 }, { cash: 25000 }, { crate: 'Galaxy' }, { cash: 100000, path: 2 },
];
export const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
export function dailyStatus(p, now) {
    const today = dayKey(now), yesterday = dayKey(now - 86400000);
    if (p.dailyDay === today) return { ready: false, day: (p.dailyStreak - 1) % DAILY.length };
    const streak = p.dailyDay === yesterday ? p.dailyStreak : 0;
    return { ready: true, day: streak % DAILY.length };
}

// Free! gifts: session playtime rewards (minutes since joining)
export const FREE = [
    { min: 1, cash: 500 }, { min: 3, cash: 1500 }, { min: 6, crate: 'Basic' }, { min: 10, boost: 5 },
    { min: 15, cash: 10000 }, { min: 25, path: 1 }, { min: 40, crate: 'Galaxy' }, { min: 60, cash: 100000 },
];

// Redeem codes (case-insensitive, once per player)
export const CODES = {
    RELEASE: { cash: 5000 },
    MATH: { cash: 1000 },
    GLASS: { boost: 5 },
    BRIDGE: { crate: 'Basic' },
    LEGION: { cash: 2500 },
    BLOXITY: { path: 1 },
};

// Fallback blocky look (before the Bloxity body loads)
export const KITS = [
    { shirt: 0x1c1c22, shorts: 0x26302a, socks: 0x26302a, hair: 0xa8521e, skin: 0xf2efe6 },
    { shirt: 0x2f7bff, shorts: 0x2b3340, socks: 0x2b3340, hair: 0x3a2618 },
    { shirt: 0xe82434, shorts: 0x1c1c22, socks: 0x1c1c22, hair: 0x1a1410 },
    { shirt: 0x28c43c, shorts: 0x2b3340, socks: 0x2b3340, hair: 0xe6c878 },
    { shirt: 0x8a1cff, shorts: 0x1c1c22, socks: 0x1c1c22, hair: 0x3a2618 },
    { shirt: 0xf5f5f5, shorts: 0x2b3340, socks: 0x2b3340, hair: 0xd8641e },
];
export const SKINS = [0xf5d29a, 0xe1af87, 0xc88c5f, 0x8c5a3c, 0xf0c8a0];

// Reward text shared by toasts and panels ({ cash, crate, boost, path })
export function rewardText(r) {
    return [r.cash ? '+$' + fmt(r.cash) : '', r.crate ? (crateDef(r.crate) || {}).name : '', r.boost ? r.boost + ' min x2 Cash' : '',
        r.path ? (r.path > 1 ? r.path + 'x ' : '') + 'Show Path' : ''].filter(Boolean).join(' & ');
}

const SUF = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp'];
// 2700 -> "2.7K", 1000000 -> "1M", 950 -> "950"
export function fmt(v) {
    v = Math.floor(v || 0);
    if (v < 1000) return String(v);
    let i = -1, s = v;
    while (s >= 1000 && i < SUF.length - 1) { s /= 1000; i++; }
    const t = s >= 100 ? String(Math.floor(s)) : (Math.floor(s * 10) / 10).toFixed(1).replace(/\.0$/, '');
    return t + SUF[i];
}
export const fmtMult = (m) => (m < 1000 ? String(Math.round(m * 100) / 100) : fmt(m)) + 'x';
export const comma = (v) => Math.floor(v || 0).toLocaleString('en-US');
export const money = (v) => '$' + (v < 1e6 ? comma(v) : fmt(v));
export function clock(s) {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
