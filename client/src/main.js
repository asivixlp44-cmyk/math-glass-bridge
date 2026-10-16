import { Client } from '@colyseus/sdk';
import {
    T, V3, $, canvas, renderer, scene, camera, sun, solids, triggers, prompts, tickers,
    billboard, buildRig, animRig, airPose, fallPose, mergeStatic, confettiAt, floatText, updateEffects, lerpAngle, blobShadow, groundBelow,
} from './engine.js';
import { S, actions, net } from './state.js';
import { initAudio, startMusic, sfx, sfxRight, setVolume, duckMusic } from './audio.js';
import * as BX from './bloxity.js';
import { createAvatar, loadBase, packAvatar, unpackAvatar, avatarStats } from './avatar.js';
import { pad, pollGamepad, rumble, onGamepadConnection } from './gamepad.js';
import { render, setSpeedLines, updateFx, dust, sparkleColumn, ring, fireworks, setQuality, emitTrail, cashBurst, setDanger, autoTune } from './fx.js';
import { updateSky, setWorld } from './sky.js';
import { buildWorld, SPAWN, refreshWorld, renderBoards, updateWorld, teleportSpot, syncPlaytime, spinWorldWheel } from './world.js';
import {
    buildStageSolids, primeStages, updateStages, startRun, endRun, judge, markRight, shatter, crackPane, showPath, safeSpot, question,
} from './stages.js';
import { PetPack } from './pets.js';
import {
    updateHud, toast, announce, bigText, buy, closeModal, openModal, modalOpen, refreshModal, promptEl, promptTxtEl, popGain, notice,
    showHatch, tutorialComplete, animateCounters, flash, showRevive, hideRevive, reviveOpen, tickRevive, setCalc, calcOpen, calcKeyboard,
    spinWheelUI, buyOpen,
} from './ui.js';
import {
    CFG, BR, STAGES, ISLANDS, STAGE_COUNT, STAGES_PER_WORLD, WORLDS, MODS, CRATES, QUESTS, TUTORIAL_STEPS, KITS, SKINS, TRAILS, GEARS,
    paneAt, rowTop, stageAtZ, stageOpen, checkpointPos, worldOf, crateDef, trailDef, gearDef, speedMult, fmt, comma, money, clamp, hasMod, modLabel,
} from '../../shared/config.js';

// =====================================================================================
// Local player
// =====================================================================================
const HW = 1, PH = 5, STEP = 1.7;
const P = {
    pos: SPAWN.clone(), vel: new V3(), onGround: false, ground: null, facing: 0, moving: false,
    lastJumpT: -9, airTime: 0, animPhase: 0, lastStepSfx: 0, squash: 1, squashV: 0, trailT: 0, hv: new V3(),
    falling: false, fallT: 0, fallY0: 0, frozen: false, returning: false, judged: '',
    crumbleKey: '', crumbleT: 0, grace: 0, groundY: 0,
};
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let shake = 0;
function addShake(a) { if (!reduceMotion) shake = Math.min(1.2, shake + a); }
let rig, blob;
const myPets = new PetPack();
let myGear = '';
let reviveInfo = null;

// ----- Bloxity avatars -----
function dressRig(group, avatar) {
    group.children.forEach((c) => { if (!c.isSprite && !c.userData.keep) c.visible = false; });
    group.add(avatar.root);
    group.userData.blox = avatar;
}
let localAvatar = null, localAvatarReq = 0;
async function setupLocalAvatar() {
    const req = ++localAvatarReq;
    const a = await createAvatar(BX.currentAvatar(), BX.getSkinTextureUrl());
    if (!a) return;
    if (req !== localAvatarReq || !rig) { a.dispose(); return; }
    if (localAvatar) localAvatar.dispose();
    localAvatar = a;
    dressRig(rig, a);
}
function syncMyAvatar() {
    const av = BX.currentAvatar();
    if (localAvatar && av) { localAvatar.setProportions(av.proportions); localAvatar.setEquipped(av, BX.getSkinTextureUrl()); }
    net.send('avatar', { av: packAvatar(av) });
}
async function playEmoteOn(avatar, id) {
    if (!avatar) return;
    const cat = await BX.loadEmotes();
    const e = cat.get(id);
    if (e && e.clip) avatar.playEmote(e.clip);
}
function chatBubble(group, text) {
    if (!group) return;
    if (group.userData.bubble) { group.remove(group.userData.bubble); group.userData.bubble.material.map.dispose(); }
    const b = billboard([{ t: '💬 ' + text, c: '#ffffff', s: '#16121f', px: 44 }], 9, 1024, new V3(0, 9.4, 0), group);
    group.userData.bubble = b;
    setTimeout(() => { if (group.userData.bubble === b) { group.remove(b); b.material.map.dispose(); group.userData.bubble = null; } }, 5000);
}
const lookOf = (kit, skin) => { const k = KITS[kit % KITS.length]; return { ...k, skin: k.skin || SKINS[skin % SKINS.length] }; };

function buildPlayer() {
    if (rig) scene.remove(rig);
    rig = buildRig(lookOf(0, 0));
    scene.add(rig);
    rig.position.copy(P.pos);
    if (!blob) blob = blobShadow();
    localAvatar = null;
    setupLocalAvatar();
}

// =====================================================================================
// Collision (glass and rails are skipped while you fall through broken glass)
// =====================================================================================
const skipSolid = (c) => c.off || c.camOnly || (P.falling && (c.glass || c.rail));
function overlapsBox(c, x, y, z) {
    return c.max.x > x - HW && c.min.x < x + HW && c.max.y > y && c.min.y < y + PH && c.max.z > z - HW && c.min.z < z + HW;
}
// The solids around the player this frame (the stages are thousands of studs long)
let phys = [];
function gatherSolids(reach) { phys = solids.near(P.pos.z - reach, P.pos.z + reach).slice(); }
function freeAt(x, y, z) {
    for (const c of phys) if (!skipSolid(c) && overlapsBox(c, x, y, z)) return false;
    return true;
}
function moveAxis(axis, d) {
    if (d === 0) return;
    const p = P.pos;
    p[axis] += d;
    for (const c of phys) {
        if (skipSolid(c) || !overlapsBox(c, p.x, p.y, p.z)) continue;
        if (axis === 'y') {
            if (d < 0) { p.y = c.max.y; P.vel.y = Math.max(0, P.vel.y); P.onGround = true; P.ground = c; }
            else { p.y = c.min.y - PH - 1e-4; if (P.vel.y > 0) P.vel.y = 0; }
        } else {
            const rise = c.max.y - p.y;
            if (rise > 0 && rise <= STEP && (P.onGround || P.vel.y <= 0) && freeAt(p.x, c.max.y + 0.01, p.z)) { p.y = c.max.y + 0.001; continue; }
            if (d > 0) p[axis] = c.min[axis] - HW - 1e-4; else p[axis] = c.max[axis] + HW + 1e-4;
        }
    }
}

function teleport(pos, yaw) {
    P.pos.copy(pos); P.vel.set(0, 0, 0); P.hv.set(0, 0, 0);
    P.facing = yaw || 0; cam.yaw = (yaw || 0) + Math.PI;
    P.falling = false; P.frozen = false; P.fallT = 0; P.judged = '';
    setDanger(0); duckMusic(false);
    for (const t of triggers) t.inside = overlapsBox(t, pos.x, pos.y, pos.z);
    sendMove(true);
}
const toSpawn = () => teleport(SPAWN, 0);
// Back to a stage's checkpoint (its start island, or in front of the lobby pad for stage 1)
function toCheckpoint(k) {
    const p = checkpointPos(k);
    teleport(new V3(p.x, p.y, p.z), 0);
}

// =====================================================================================
// The run: a stage's start -> glass rows -> the next checkpoint island
// =====================================================================================
const onGlassZone = () => {
    const k = stageAtZ(P.pos.z);
    if (k < 0) return false;
    const st = STAGES[k];
    return P.pos.z > st.z0 - 1.5 && P.pos.z < st.endZ;
};
function endRunLocal() {
    if (S.run) endRun(S.run.k);
    S.run = null;
    reviveInfo = null;
    hideRevive();
}
actions.startPad = (k) => {
    if (P.returning) return;
    if (S.run && S.run.k === k && !S.run.fallen) return;
    if (!stageOpen(k, S)) { notice('Clear Stage ' + k + ' first!'); sfx('deny'); return; }
    if (S.run) endRunLocal();
    sendMove(true);
    net.send('run', { k });
};
actions.finish = (k) => {
    const run = S.run;
    if (!run || run.k !== k || run.fallen || run.finishing) return;
    if (run.row < STAGES[k].rows && !run.skipped) return;
    run.finishing = true;
    sendMove(true);
    net.send('finish', { k });
    // If the server says no (a position hiccup), let the trigger try again
    setTimeout(() => { if (S.run === run) run.finishing = false; }, 1500);
};
actions.continueRun = () => {
    if (S.run) { net.send('giveup'); endRunLocal(); }
    const k = Math.min(STAGE_COUNT, S.stage || 0);
    toCheckpoint(k);
    sfx('whoosh'); sparkleColumn(P.pos, 0x7dff6b);
    const w = worldOf(Math.min(STAGE_COUNT - 1, k));
    if (k >= STAGE_COUNT) bigText('👑 GOLDEN THRONE', '#ffe14a', 'Sit on the throne to Rebirth');
    else bigText('STAGE ' + (k + 1), w.css, w.icon + ' ' + w.name);
};
actions.throne = () => { if ((S.stage || 0) >= STAGE_COUNT) openModal('rebirth'); };
// Standing on the glass: judge the pane under your feet once per row
function judgeStep(t) {
    const run = S.run;
    if (!run || run.fallen || P.falling || !P.onGround || !P.ground || !P.ground.glass) return;
    const k = run.k, st = STAGES[k];
    if (P.ground.glass.k !== k) return;
    const pane = paneAt(st, P.pos.x, P.pos.z);
    if (!pane || pane.r !== run.row || Math.abs(P.pos.y - rowTop(st, pane.r)) > 0.35) return;
    const key = pane.r + ':' + pane.s;
    if (P.judged === key) return;
    P.judged = key;
    sendMove(true);
    net.send('step', { k, r: pane.r, s: pane.s, t: net.now() });
    if (judge(k, pane.r, pane.s)) {
        markRight(k, pane.r, pane.s);
        run.row = pane.r + 1; run.streak++;
        sfxRight(run.streak);
        P.squashV -= 3;
        if (run.row >= st.rows) { bigText('🏁 LAST ROW!', '#ffe14a', 'Run to the checkpoint!'); sfx('unlock'); }
    } else {
        startFall(k, pane.r, pane.s, t);
    }
}
// Crumbling Glass: the pane you stand on cracks, then breaks
function crumbleStep(dt, t) {
    const run = S.run;
    if (!run || run.fallen || P.falling || !hasMod(STAGES[run.k], 'crumble')) { P.crumbleKey = ''; return; }
    if (P.grace > 0) { P.grace -= dt; P.crumbleKey = ''; return; }
    const g = P.onGround && P.ground && P.ground.glass;
    if (!g || g.k !== run.k || g.r >= run.row) { P.crumbleKey = ''; return; }
    const key = g.r + ':' + g.s;
    if (key !== P.crumbleKey) { P.crumbleKey = key; P.crumbleT = 0; crackPane(run.k, g.r, g.s); sfx('tick'); return; }
    P.crumbleT += dt;
    if (P.crumbleT >= STAGES[run.k].crumble) {
        P.crumbleKey = '';
        net.send('crumble', { k: run.k, r: g.r });
        startFall(run.k, g.r, g.s, t);
    }
}
// Time Limit: every row has to be answered in time; the clock only runs while you are on the glass
let timerRow = -1, timerLeft = 0, timerShown = null;
function timerStep(dt, t) {
    const run = S.run;
    timerShown = null;
    if (!run || run.fallen || P.falling || !hasMod(STAGES[run.k], 'timer')) { timerRow = -1; return; }
    const st = STAGES[run.k];
    if (run.row >= st.rows) return;
    if (run.row !== timerRow || !onGlassZone()) { timerRow = onGlassZone() ? run.row : -1; timerLeft = st.timer; }
    if (timerRow < 0) { timerShown = st.timer; return; }
    const before = Math.ceil(timerLeft);
    timerLeft -= dt;
    timerShown = Math.max(0, timerLeft);
    if (timerLeft <= 3 && Math.ceil(timerLeft) !== before) sfx('tick');
    if (timerLeft <= 0) {
        timerRow = -1;
        const g = P.onGround && P.ground && P.ground.glass;
        net.send('crumble', { k: run.k, r: g ? g.r : run.row });
        bigText('⏱️ TIME UP!', '#ff5a5a');
        startFall(run.k, g ? g.r : -1, g ? g.s : -1, t);
    }
}
function startFall(k, r, s, t) {
    if (P.falling) return;
    if (r >= 0 && s >= 0) shatter(k, r, s, true);
    P.falling = true; P.fallT = 0; P.fallY0 = P.pos.y; P.onGround = false; P.ground = null;
    P.vel.y = 6; P.hv.multiplyScalar(0.3);
    if (S.run) { S.run.fallen = true; S.run.streak = 0; }
    sfx('crack'); setTimeout(() => sfx('fall'), 120);
    flash('red'); addShake(0.6); rumble(0.9, 400);
    duckMusic(true);
    void t;
}
actions.revive = () => {
    const run = S.run;
    if (!run || !run.fallen) return;
    const info = reviveInfo || {};
    if (info.free || S.passes.InfiniteRevive || S.reviveTokens > 0) net.send('revive');
    else buy('product', 'Revive');
};
actions.giveUp = () => {
    const k = S.run ? S.run.k : Math.min(STAGE_COUNT - 1, S.stage || 0);
    net.send('giveup');
    endRunLocal();
    sfx('whoosh');
    toCheckpoint(k);
};
// The stage intro: "STAGE 7" + world + modifier (tips from an older intro are cancelled)
let introTips = [];
function stageIntro(k) {
    const st = STAGES[k], w = WORLDS[st.w], ml = modLabel(st);
    bigText('STAGE ' + (k + 1) + (st.boss ? ' · BOSS' : ''), st.boss ? '#ff6b8a' : w.css, ml || w.icon + ' ' + w.name);
    for (const id of introTips) clearTimeout(id);
    introTips = st.mods.filter((m) => m !== 'none').map((m, i) => setTimeout(() => { if (S.run && S.run.k === k) toast(MODS[m].icon + ' ' + MODS[m].hint, '#ffb35a'); }, 1200 + i * 2600));
}

// =====================================================================================
// Actions triggered by world objects and panels
// =====================================================================================
actions.hatch = (id) => {
    const c = crateDef(id);
    if (!c) return;
    if (c.product) { buy('product', c.product); return; }
    if (S.cash < c.cost) { notice('You need ' + money(c.cost - S.cash) + ' more Cash!'); sfx('deny'); return; }
    sendMove(true);
    net.send('hatch', { id });
};
actions.chest = (id) => { sendMove(true); net.send('chest', { id }); };
actions.teleport = (id) => {
    if (/^s\d+$/.test(id) && !stageOpen(+id.slice(1), S)) { notice('Clear Stage ' + id.slice(1) + ' first!'); sfx('deny'); return; }
    if (S.run) { net.send('giveup'); endRunLocal(); }
    const pos = teleportSpot(id);
    teleport(pos, 0); sfx('whoosh'); sparkleColumn(pos, 0xc46bff);
};
actions.openPanel = (kind) => { if (!modalOpen()) openModal(kind); };
actions.gear = (id) => {
    const g = gearDef(id);
    if (!g) return;
    if (!S.gears[id]) { openModal('gears'); return; }
    myGear = myGear === id ? '' : id;
    net.send('gear', { id: myGear });
    setCalc(myGear === 'calc');
    sfx('click');
};

// =====================================================================================
// Guide arrows (tutorial): a trail of arrowheads to the 1st Grade start pad
// =====================================================================================
const GUIDE_N = 9, GUIDE_GAP = 3.6;
const guideArrows = (() => {
    const shape = new T.Shape();
    shape.moveTo(0, 1.6); shape.lineTo(1.25, -1.1); shape.lineTo(0, -0.45); shape.lineTo(-1.25, -1.1); shape.closePath();
    const geo = new T.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 1 });
    geo.translate(0, 0, -0.17);
    const m = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0xff6bd5, emissiveIntensity: 0.6 });
    const list = [];
    for (let i = 0; i < GUIDE_N; i++) { const a = new T.Mesh(geo, m); a.visible = false; scene.add(a); list.push(a); }
    return list;
})();
let guidePhase = 0;
const guideGoal = new V3(), guideDir = new V3();
function updateGuide(dt) {
    guidePhase = (guidePhase + dt * 5) % GUIDE_GAP;
    const q = QUESTS[S.quest];
    const show = q && S.quest < TUTORIAL_STEPS && q.goal === 'bridge' && !S.run && P.onGround && P.pos.z < BR.padZ0 && P.pos.y < 3;
    if (!show) { for (const m of guideArrows) m.visible = false; return; }
    guideGoal.set(STAGES[0].x, 0, BR.padZ0 + 6);
    guideDir.subVectors(guideGoal, P.pos).setY(0);
    const len = guideDir.length();
    guideDir.normalize();
    const yaw = Math.atan2(guideDir.x, guideDir.z);
    guideArrows.forEach((m, i) => {
        const d = 3 + i * GUIDE_GAP + guidePhase;
        m.visible = d < len - 2;
        if (!m.visible) return;
        m.position.set(P.pos.x + guideDir.x * d, P.pos.y + 1.1, P.pos.z + guideDir.z * d);
        m.rotation.order = 'YXZ';
        m.rotation.set(-1.15, yaw, 0);
        const fade = Math.min(1, (len - 2 - d) / 4, d / 4);
        m.scale.setScalar(0.55 + 0.45 * Math.max(0, fade));
    });
}

// =====================================================================================
// Other players
// =====================================================================================
const remotes = new Map();
let joinSynced = false;
class Remote {
    constructor(p) {
        this.rig = buildRig(lookOf(p.kit, p.skin));
        this.rig.position.set(p.x, p.y, p.z);
        this.rig.rotation.y = p.ry;
        scene.add(this.rig);
        this.pets = new PetPack();
        this.labelText = '';
        this.label = billboard([{ t: p.name, c: '#ffffff', s: '#16121f', px: 56 }], 6, 512, new V3(0, 7.8, 0), this.rig);
        this.phase = Math.random() * 6;
        this.av = null; this.blox = null; this.dead = false; this.trailT = 0;
        this.setAvatar(p.av);
    }
    setAvatar(av) {
        this.av = av;
        const data = av ? unpackAvatar(av) : null;
        if (this.blox) { this.blox.setProportions(data && data.proportions); this.blox.setEquipped(data || {}); return; }
        if (this.loading) return;
        this.loading = true;
        createAvatar(data).then((a) => {
            this.loading = false;
            if (!a) return;
            if (this.dead) { a.dispose(); return; }
            this.blox = a;
            dressRig(this.rig, a);
            if (this.av !== av) this.setAvatar(this.av);
        });
    }
    update(p, dt, t) {
        const r = this.rig;
        const k = 1 - Math.exp(-dt * 12);
        const far = (r.position.x - p.x) ** 2 + (r.position.z - p.z) ** 2 + (r.position.y - p.y) ** 2 > 900;
        if (far) r.position.set(p.x, p.y, p.z);
        else { r.position.x += (p.x - r.position.x) * k; r.position.y += (p.y - r.position.y) * k; r.position.z += (p.z - r.position.z) * k; }
        r.rotation.y = lerpAngle(r.rotation.y, p.ry, k);
        if (p.av !== this.av) this.setAvatar(p.av);
        const air = p.anim >= 2;
        if (this.blox) this.blox.update(dt, { moving: p.anim === 1, air, speed: CFG.walkSpeed, t });
        if (p.anim === 3) fallPose(r, t);
        else if (air) airPose(r);
        else { this.phase += dt * (p.anim === 1 ? 14 : 0); animRig(r, this.phase, p.anim === 1 ? 0.9 : 0); }
        const tr = TRAILS[p.trail] || TRAILS[0];
        if (tr.colors.length && (air || p.anim === 1)) {
            this.trailT -= dt;
            if (this.trailT <= 0) { this.trailT = 0.06; emitTrail(r.position, tr.colors, 1); }
        }
        this.pets.set(p.pets ? p.pets.split('|') : []);
        this.pets.update(r.position, r.rotation.y, dt, t);
        const text = p.name + '|' + p.stage + '|' + p.rebirths + '|' + p.vip + '|' + (p.k >= 0 ? p.streak : -1);
        if (text !== this.labelText) {
            this.labelText = text;
            const lines = [{ t: (p.vip ? '👑 ' : '') + p.name, c: p.vip ? '#ffe14a' : '#ffffff', s: '#16121f', px: 50 },
                { t: '🏁 Stage ' + Math.min(STAGE_COUNT, p.stage + 1) + (p.rebirths ? '  🔄' + p.rebirths : ''), c: '#7dff6b', s: '#16121f', px: 40 }];
            if (p.k >= 0 && p.streak >= 3) lines.push({ t: '🔥 x' + p.streak, c: '#ffb35a', s: '#16121f', px: 40 });
            this.label.userData.set(lines);
        }
    }
    dispose() {
        this.dead = true;
        if (this.blox) this.blox.dispose();
        this.pets.dispose();
        scene.remove(this.rig);
    }
}
function syncRemotes(dt, t) {
    const room = net.room;
    if (!room || !room.state || !room.state.players) return;
    const seen = new Set();
    room.state.players.forEach((p, id) => {
        if (id === room.sessionId) {
            const oldWins = S.wins;
            S.name = p.name; S.cash = p.cash; S.wins = p.wins; S.answers = p.answers; S.stage = p.stage; S.rebirths = p.rebirths;
            if (S.wins !== oldWins) { refreshWorld(); refreshModal(); }
            return;
        }
        seen.add(id);
        let r = remotes.get(id);
        if (!r) {
            r = new Remote(p); remotes.set(id, r);
            if (joinSynced) BX.playerJoined(p.name); else BX.playerInRoom(p.name);
        }
        r.update(p, dt, t);
    });
    for (const [id, r] of remotes) if (!seen.has(id)) { r.dispose(); remotes.delete(id); }
    joinSynced = true;
}

// Friend Boost: Bloxity friends who are in this server right now (the server caps it)
let friendNames = null;
async function countFriends() {
    if (!net.room || !BX.identity().loggedIn) return;
    try {
        if (!friendNames) friendNames = new Set((await BX.getFriends()).flatMap((f) => [f.displayName, f.username].filter(Boolean).map((n) => n.toLowerCase())));
    } catch (e) { return; }
    let n = 0;
    net.room.state.players.forEach((p, id) => { if (id !== net.room.sessionId && friendNames.has(String(p.name).toLowerCase())) n++; });
    if (n !== S.friends) net.send('friends', { n });
}
setInterval(countFriends, 20000);

// =====================================================================================
// Networking
// =====================================================================================
const BLOXITY_GAME_ID = import.meta.env.VITE_BLOXITY_GAME_ID || '';
const ON_BLOXITY_HOST = /.play.bloxity.io$/.test(location.hostname);
const DEV_CHANNEL = /.dev.play.bloxity.io$/.test(location.hostname);
const SERVER_URL = import.meta.env.VITE_SERVER_URL
    || (ON_BLOXITY_HOST ? `https://${location.hostname.replace(/.play.bloxity.io$/, '.host.bloxity.io')}`
        : BLOXITY_GAME_ID ? `https://${BLOXITY_GAME_ID}.host.bloxity.io`
        : import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2621` : location.origin);
async function serverEndpoint() {
    if (!BLOXITY_GAME_ID) return SERVER_URL;
    const r = await BX.resolveEndpoint(BLOXITY_GAME_ID, DEV_CHANNEL ? 'preview' : undefined);
    if (r && r.cold) $('#loading').textContent = 'Waking up a server…';
    return (r && r.endpoint) || SERVER_URL;
}
let lastMoveSent = 0, lastMoveKey = '';
function sendMove(force) {
    const now = performance.now();
    if (!force && now - lastMoveSent < 66) return;
    const a = P.falling ? 3 : !P.onGround ? 2 : P.moving ? 1 : 0;
    const m = { x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), ry: +P.facing.toFixed(3), a };
    const key = m.x + ',' + m.y + ',' + m.z + ',' + m.ry + ',' + a;
    if (!force && key === lastMoveKey && now - lastMoveSent < 500) return;
    lastMoveKey = key; lastMoveSent = now;
    net.send('move', m);
}

function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
function playerUid() {
    let uid = storageGet('mgb_uid');
    if (!uid) {
        uid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
        storageSet('mgb_uid', uid);
    }
    return uid;
}

async function connect(name) {
    const client = new Client(await serverEndpoint());
    const id = BX.identity();
    const room = await client.joinOrCreate('bridge', {
        uid: playerUid(), name: name || id.name, token: id.token, av: packAvatar(BX.currentAvatar()),
    });
    net.room = room;
    joinSynced = false;
    room.onMessage('hello', (m) => { net.offset = m.now - Date.now(); net.bux = !!m.bux; net.bloxity = !!m.bloxity; });
    room.onMessage('authed', () => { net.bloxity = true; friendNames = null; setTimeout(countFriends, 1000); });
    room.onMessage('emote', (m) => { const r = remotes.get(m.s); if (r) playEmoteOn(r.blox, m.id); });
    room.onMessage('chat', (m) => {
        toast(m.name + ': ' + m.text, '#ffffff');
        chatBubble(m.s === room.sessionId ? rig : remotes.get(m.s) && remotes.get(m.s).rig, m.text);
    });
    BX.updateRoom(room.roomId);
    BX.gameplayStart();
    let firstProfile = true;
    room.onMessage('profile', (m) => {
        Object.assign(S, m);
        syncPlaytime();
        refreshWorld(); refreshModal();
        if (firstProfile) {
            firstProfile = false;
            if (!S.seenTutorial) net.send('tutorial');
            else if (S.daily && S.daily.ready) setTimeout(() => toast('📅 Daily reward ready!', '#ffd028'), 2500);
            setTimeout(countFriends, 3000);
        }
    });
    room.onMessage('toast', (m) => { if (/^You need/.test(m.text)) notice(m.text); else toast(m.text, m.color); });
    room.onMessage('announce', (m) => { announce(m.text, m.color); if (m.kill) sfx('alarm'); });
    // ----- the run -----
    room.onMessage('runStart', (m) => {
        const st = STAGES[m.k];
        if (!st) return;
        S.run = { k: m.k, row: m.row || 0, streak: 0, fallen: false, path: !!m.path, skipped: false, free: true };
        P.judged = ''; P.crumbleKey = '';
        startRun(m.k, m.seed, { row: m.row || 0, path: m.path });
        if (!m.resume) {
            sfx('gate');
            stageIntro(m.k);
            if (m.path) setTimeout(() => bigText('👣 SHOW PATH!', '#ffe14a', 'Follow the gold glass'), 1800);
        }
    });
    room.onMessage('right', (m) => {
        const run = S.run;
        if (!run) return;
        run.row = Math.max(run.row, m.r + 1);
        run.streak = m.streak;
        popGain('+$' + fmt(m.n), m.streak >= 10 ? 'big' : '');
        sfx('coin');
        cashBurst(P.pos, 6);
        if (m.streak > 0 && m.streak % 5 === 0) { bigText('🔥 x' + m.streak + ' STREAK!', '#ffb35a'); ring(P.pos, 0xff8a3a, 10, 0.8); }
        refreshModal();
    });
    room.onMessage('wrong', (m) => {
        const run = S.run;
        if (!run) return;
        run.fallen = true; run.streak = 0;
        reviveInfo = { reveal: m.reveal, answer: m.answer, free: m.free, tokens: m.tokens };
        if (!P.falling) startFall(run.k, m.r, m.s, 0);
        sfx('wrong');
    });
    room.onMessage('fell', (m) => {
        const run = S.run;
        if (!run) return;
        run.fallen = true; run.streak = 0;
        reviveInfo = { crumble: true, free: m.free, tokens: m.tokens };
        if (!P.falling) startFall(run.k, -1, -1, 0);
    });
    room.onMessage('killed', (m) => {
        const run = S.run;
        if (!run) return;
        run.fallen = true; run.streak = 0;
        reviveInfo = { by: m.by, free: m.free, tokens: m.tokens };
        const g = P.ground && P.ground.glass;
        startFall(run.k, g ? g.r : -1, g ? g.s : -1, 0);
        bigText('💀 KILLED!', '#ff5a5a', 'by ' + m.by);
    });
    room.onMessage('shatter', (m) => {
        const r = remotes.get(m.id);
        if (r && r.rig.position.distanceToSquared(P.pos) < 250 * 250) {
            shatter(m.k, m.r, m.s, false);
            if (r.rig.position.distanceToSquared(P.pos) < 70 * 70) sfx('crack');
        }
    });
    room.onMessage('revived', (m) => {
        const run = S.run;
        if (!run) return;
        run.fallen = false; run.row = m.r;
        reviveInfo = null;
        hideRevive();
        const pos = safeSpot(m.k, m.r);
        teleport(pos, 0);
        P.grace = 2.5;
        sfx('revive'); sparkleColumn(pos, 0xff6bd5); ring(pos, 0xff6bd5, 8, 0.7);
        timerRow = -1;
        bigText('❤️ REVIVED!', '#ff8fd0', hasMod(STAGES[m.k], 'crumble') || hasMod(STAGES[m.k], 'timer') ? 'Keep moving!' : 'Try another pane!');
    });
    room.onMessage('path', (m) => {
        if (S.run && S.run.k === m.k) { S.run.path = true; showPath(m.k); bigText('👣 SHOW PATH!', '#ffe14a', 'Follow the gold glass'); }
    });
    room.onMessage('skipTo', (m) => {
        if (!S.run || S.run.k !== m.k) return;
        S.run.skipped = true; S.run.fallen = false;
        hideRevive();
        const isl = ISLANDS[m.k + 1];
        teleport(new V3(isl.x, isl.top + 0.05, isl.z0 + 5), 0);
        sfx('whoosh'); sparkleColumn(P.pos, 0x7dff6b);
        setTimeout(() => actions.finish(m.k), 150);
        setTimeout(() => { if (S.run && S.run.k === m.k && S.run.skipped) actions.finish(m.k); }, 1800);
    });
    room.onMessage('cleared', (m) => {
        const st = STAGES[m.k], isl = ISLANDS[m.k + 1];
        const at = new V3(isl.x, isl.top + 3, isl.z0 + 8);
        endRunLocal();
        if (m.world) {
            const w = WORLDS[st.w];
            bigText('🏆 WORLD ' + (st.w + 1) + ' COMPLETE!', '#ffe14a', '+' + money(m.cash) + '  ·  +' + m.wins + ' Wins');
            sfx('chest'); setTimeout(() => sfx('cheer'), 300); rumble(0.8, 600); flash('gold');
            fireworks(at, 12, () => sfx('firework'));
            cashBurst(at, 30); confettiAt(at);
            if (!m.done) {
                const nw = WORLDS[Math.min(WORLDS.length - 1, st.w + 1)];
                setTimeout(() => { bigText(nw.icon + ' ' + nw.name.toUpperCase(), nw.css, 'World ' + (st.w + 2) + ' · harder math!'); sfx('unlock'); }, 2600);
            }
            void w;
        } else {
            bigText(m.perfect ? '🌟 PERFECT!' : '✔ STAGE ' + (m.k + 1) + ' CLEARED!', m.perfect ? '#ffe14a' : '#7dff6b', '+' + money(m.cash) + '  ·  checkpoint saved');
            sfx('chest'); flash('gold'); rumble(0.5, 300);
            cashBurst(at, 16); confettiAt(at);
            fireworks(at, 3, () => sfx('firework'));
        }
        floatText('+' + money(m.cash), '#7dff6b', at.clone().setY(at.y + 6), 8);
        if (m.done) setTimeout(() => { bigText('👑 ALL ' + STAGE_COUNT + ' STAGES!', '#ffe14a', 'Sit on the Golden Throne to Rebirth'); sfx('cheer'); }, 2600);
    });
    room.onMessage('reborn', (m) => {
        closeModal();
        bigText('🔄 REBORN!', '#ff8fd0', 'x' + (1 + m.rebirths * CFG.rebirthBonus) + ' Cash forever');
        sfx('revive'); fireworks(P.pos, 10, () => sfx('firework'));
        setTimeout(() => { toCheckpoint(0); sfx('whoosh'); }, 2500);
    });
    // ----- shops and rewards -----
    room.onMessage('hatched', (m) => { closeModal(); showHatch(m.crate, m.pet); });
    room.onMessage('offer', (m) => buy(m.kind, m.key));
    room.onMessage('spun', (m) => { spinWheelUI(m.i); spinWorldWheel(m.i); });
    room.onMessage('chested', (m) => {
        bigText('+' + money(m.cash), '#7dff6b', m.id === 'stairs' ? 'Rainbow Stairs Chest' : 'Space Chest');
        sfx('chest'); cashBurst(P.pos, 24); confettiAt(P.pos.clone().add(new V3(0, 4, 0)));
    });
    room.onMessage('quest', (m) => {
        toast('✅ ' + m.text + ' ' + m.reward, '#7dff6b'); sfx('buy');
        if (m.tutorialDone) { tutorialComplete(); confettiAt(P.pos.clone().add(new V3(0, 4, 0))); }
    });
    room.onMessage('fx', (m) => {
        confettiAt(P.pos.clone().add(new V3(0, 4, 0)));
        sparkleColumn(P.pos, 0xffd028);
        sfx('buy');
    });
    room.onMessage('boards', renderBoards);
    room.onDrop(() => { $('#reconnecting').hidden = false; });
    room.onReconnect(() => { $('#reconnecting').hidden = true; toast('Reconnected!', '#7dff6b'); });
    room.onLeave((code, reason) => {
        console.warn('[net] left room', code, reason || '');
        net.room = null;
        $('#reconnecting').hidden = true;
        if (code !== 1000) $('#offline').hidden = false;
    });
    return room;
}

// =====================================================================================
// Camera & input
// =====================================================================================
const cam = { yaw: Math.PI, pitch: 0.34, dist: 24, target: new V3() };
let camSens = 1;
const keys = {};
const touchMove = { x: 0, y: 0 };
let touchJump = false, running = false;

addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') { if (e.key === 'Enter') e.target.blur(); return; }
    if (running && calcOpen() && !modalOpen()) {
        if (e.key === 'Escape') { actions.gear('calc'); e.preventDefault(); return; }
        if (e.key === 'c' || e.key === 'C') { calcKeyboard({ key: 'Escape' }); }
        if (calcKeyboard(e)) { e.preventDefault(); return; }
    }
    keys[e.code] = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code === 'KeyE' && running) usePrompt();
    if (running && !modalOpen() && /^Digit[1-3]$/.test(e.code)) actions.gear(GEARS[+e.code.slice(5) - 1].id);
    if (running && reviveOpen() && (e.code === 'KeyR' || e.code === 'Enter')) actions.revive();
    if (e.code === 'Escape') {
        if (!$('#buy').hidden) $('#buyCancel').click();
        else if (!$('#modal').hidden) closeModal();
        else if (running && BX.isEmbedded()) BX.showPortalMenu();
    }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const drags = new Map();
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); drags.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.focus(); });
canvas.addEventListener('pointermove', (e) => {
    const d = drags.get(e.pointerId);
    if (!d) return;
    const k = (e.pointerType === 'touch' ? 0.008 : 0.005) * camSens;
    cam.yaw -= (e.clientX - d.x) * k;
    cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * k, -0.6, 1.4);
    d.x = e.clientX; d.y = e.clientY;
});
const endDrag = (e) => drags.delete(e.pointerId);
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 2, 8, 70); e.preventDefault(); }, { passive: false });

if (isTouch) document.body.classList.add('touch');
(function joystick() {
    const stick = $('#stick'), knob = $('#knob');
    let id = null;
    const set = (e) => {
        const r = stick.getBoundingClientRect();
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const max = r.width / 2, l = Math.hypot(dx, dy);
        if (l > max) { dx *= max / l; dy *= max / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        touchMove.x = dx / max; touchMove.y = dy / max;
    };
    stick.addEventListener('pointerdown', (e) => { id = e.pointerId; stick.setPointerCapture(id); set(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; touchMove.x = touchMove.y = 0; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    const jb = $('#jumpBtn');
    jb.addEventListener('pointerdown', (e) => { e.preventDefault(); jb.setPointerCapture(e.pointerId); touchJump = true; });
    jb.addEventListener('pointerup', () => { touchJump = false; });
    jb.addEventListener('pointercancel', () => { touchJump = false; });
})();

// The camera ignores glass, rails and invisible walls (they would yank it in)
function rayHit(o, d, maxT) {
    let best = maxT;
    const z0 = Math.min(o.z, o.z + d.z * maxT) - 2, z1 = Math.max(o.z, o.z + d.z * maxT) + 2;
    for (const c of solids.near(z0, z1)) {
        if (c.off || c.glass || c.rail || c.inv) continue;
        let t0 = 0, t1 = best, hit = true;
        for (const a of ['x', 'y', 'z']) {
            if (Math.abs(d[a]) < 1e-9) { if (o[a] < c.min[a] || o[a] > c.max[a]) { hit = false; break; } continue; }
            let ta = (c.min[a] - o[a]) / d[a], tb = (c.max[a] - o[a]) / d[a];
            if (ta > tb) { const q = ta; ta = tb; tb = q; }
            t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
            if (t0 > t1) { hit = false; break; }
        }
        if (hit && t0 > 0 && t0 < best) best = t0;
    }
    return best;
}
const camDir = new V3(), camGoal = new V3(), camPos = new V3(), lookTmp = new V3();
const ATTRACT_LOOK = new V3(0, 10, 120);
let intro = null, baseFov = camera.fov;
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
function updateCamera(dt) {
    if (!running) {
        const t = performance.now() / 1000;
        camera.position.set(Math.sin(t * 0.06) * 150, 70 + Math.sin(t * 0.1) * 10, 60 + Math.cos(t * 0.06) * 170);
        camera.lookAt(ATTRACT_LOOK);
        baseFov = camera.fov;
        return;
    }
    // While falling the camera stays up by the glass and watches you drop
    const ty = P.falling ? Math.max(P.pos.y + 4.5, P.fallY0 - 6) : P.pos.y + 4.5;
    cam.target.lerp(camGoal.set(P.pos.x, ty, P.pos.z), 1 - Math.exp(-dt * (P.falling ? 6 : 16)));
    const pitch = P.falling ? Math.max(cam.pitch, 0.75) : cam.pitch;
    const cp = Math.cos(pitch);
    camDir.set(Math.sin(cam.yaw) * cp, Math.sin(pitch), Math.cos(cam.yaw) * cp);
    const dist = Math.max(3, rayHit(cam.target, camDir, cam.dist) - 0.8);
    camPos.copy(cam.target).addScaledVector(camDir, dist);
    if (!P.falling && camPos.y < P.pos.y - 2) camPos.y = P.pos.y - 2;
    if (intro) {
        intro.t += dt;
        const k = ease(Math.min(1, intro.t / intro.dur));
        camera.position.lerpVectors(intro.from, camPos, k);
        camera.lookAt(lookTmp.lerpVectors(ATTRACT_LOOK, cam.target, k));
        if (intro.t >= intro.dur) intro = null;
    } else {
        camera.position.copy(camPos);
        camera.lookAt(P.falling ? lookTmp.set(P.pos.x, P.pos.y + 2, P.pos.z) : cam.target);
    }
    if (shake > 0.001) {
        const s = shake * shake * 0.9;
        camera.position.x += (Math.random() * 2 - 1) * s;
        camera.position.y += (Math.random() * 2 - 1) * s;
        shake = Math.max(0, shake - dt * 2.2);
    }
    const want = (innerWidth < innerHeight ? 85 : 70) + (P.falling ? 8 : 0) + clamp(Math.hypot(P.hv.x, P.hv.z) - 30, 0, 20) * 0.3;
    baseFov += (want - baseFov) * Math.min(1, dt * 5);
    if (Math.abs(camera.fov - baseFov) > 0.01) { camera.fov = baseFov; camera.updateProjectionMatrix(); }
    sun.position.set(P.pos.x + 60, Math.max(P.pos.y, 0) + 120, P.pos.z - 50);
    sun.target.position.set(P.pos.x, Math.max(P.pos.y, 0), P.pos.z);
}

// Proximity prompts
let activePrompt = null;
const projV = new V3();
const promptKey = promptEl.querySelector('kbd');
const usingPad = () => pad.connected && performance.now() - pad.lastUsed < 8000;
function updatePrompt() {
    let best = null, bd = Infinity;
    if (!P.falling) for (const p of prompts) {
        const d = p.pos.distanceTo(P.pos);
        if (d < p.r && d < bd) { bd = d; best = p; }
    }
    activePrompt = best;
    if (!best) { promptEl.hidden = true; return; }
    projV.copy(best.pos).setY(best.pos.y + 2).project(camera);
    if (projV.z > 1) { promptEl.hidden = true; return; }
    promptEl.hidden = false;
    promptEl.style.left = ((projV.x + 1) / 2 * innerWidth) + 'px';
    promptEl.style.top = ((1 - projV.y) / 2 * innerHeight) + 'px';
    const txt = best.label();
    if (promptTxtEl.textContent !== txt) promptTxtEl.textContent = txt;
    const key = usingPad() ? 'X' : 'E';
    if (promptKey.textContent !== key) promptKey.textContent = key;
}
function usePrompt() { if (activePrompt) activePrompt.act(); }
promptEl.addEventListener('click', usePrompt);

// Controller buttons: popups and panels first, then gameplay shortcuts
const shown = (sel) => { const e = $(sel); return !!e && !e.hidden; };
function focusStep(container, dir) {
    const items = [...container.querySelectorAll('button:not(:disabled), input, .pet')];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    const next = items[i < 0 ? 0 : (i + dir + items.length) % items.length];
    next.focus({ preventScroll: false });
    next.scrollIntoView({ block: 'nearest' });
}
function padButtons() {
    const p = pad.pressed;
    if (!p.size) return;
    const overlay = ['#start', '#offline', '#buy', '#modal'].find(shown);
    if (overlay) pad.jump = false;
    if (overlay === '#start') { if ((p.has('A') || p.has('START')) && shown('#playBtn')) play(); return; }
    if (overlay === '#offline') { if (p.has('A')) $('#reconnectBtn').click(); return; }
    if (overlay === '#buy') { if (p.has('A')) $('#buyOk').click(); else if (p.has('B')) $('#buyCancel').click(); return; }
    if (overlay === '#modal') {
        const body = $('#modal');
        const el = document.activeElement;
        const onSlider = el && el.type === 'range' && body.contains(el);
        if (onSlider && (p.has('LEFT') || p.has('RIGHT'))) {
            el.value = Number(el.value) + (p.has('RIGHT') ? 5 : -5);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }
        if (p.has('DOWN') || p.has('RIGHT')) focusStep(body, 1);
        else if (p.has('UP') || p.has('LEFT')) focusStep(body, -1);
        else if (p.has('A') && el && body.contains(el) && (el.tagName === 'BUTTON' || el.classList.contains('pet'))) el.click();
        else if (['B', 'Y', 'LB', 'RB', 'BACK', 'START'].some((b) => p.has(b))) { closeModal(); canvas.focus(); }
        return;
    }
    if (!running) return;
    if (reviveOpen()) { if (p.has('A')) actions.revive(); else if (p.has('B')) actions.giveUp(); return; }
    if (p.has('X')) usePrompt();
    if (p.has('Y')) openModal('shop');
    if (p.has('LB')) openModal('pets');
    if (p.has('RB')) openModal('gears');
    if (p.has('BACK')) openModal('teleport');
    if (p.has('START')) openModal('settings');
    if (p.has('UP')) cam.dist = clamp(cam.dist - 4, 8, 70);
    if (p.has('DOWN')) cam.dist = clamp(cam.dist + 4, 8, 70);
    if (['Y', 'LB', 'RB', 'BACK', 'START'].some((b) => p.has(b))) focusStep($('#modal'), 1);
}
onGamepadConnection((g, on) => {
    if (running) toast(on ? '🎮 Controller connected' : '🎮 Controller disconnected', on ? '#7dff6b' : '#ffb51c');
});

// =====================================================================================
// Main update
// =====================================================================================
let clockT = 0, hudT = 0, curWorld = -1;
const tmpF = new V3(), tmpR = new V3(), mv = new V3();

function update(dt) {
    clockT += dt;
    const t = clockT;
    const gear = gearDef(myGear);

    let f = 0, r = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) r += 1;
    if (keys.KeyA || keys.ArrowLeft) r -= 1;
    f -= touchMove.y + pad.ly; r += touchMove.x + pad.lx;
    cam.yaw -= pad.rx * 2.8 * dt;
    cam.pitch = clamp(cam.pitch + pad.ry * 1.8 * dt, -0.6, 1.4);
    tmpF.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    tmpR.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    mv.set(0, 0, 0).addScaledVector(tmpF, f).addScaledVector(tmpR, r);
    if (mv.lengthSq() > 1) mv.normalize();
    if (P.returning || P.falling || modalOpen()) mv.set(0, 0, 0);
    P.moving = mv.lengthSq() > 0.01;

    // No jumping on the glass: every row has to be stepped on
    const onGlass = onGlassZone();
    const held = !!(keys.Space || touchJump || pad.jump) && !modalOpen();
    if (held && P.onGround && !P.returning && !P.falling && t - P.lastJumpT > 0.15) {
        if (onGlass) { if (t - P.lastJumpT > 1.2) { P.lastJumpT = t; notice('No jumping on the glass! Step on every row.'); } }
        else {
            const g = CFG.gravity * (gear && gear.gravity ? gear.gravity : 1);
            P.vel.y = Math.sqrt(2 * g * CFG.jumpHeight);
            P.onGround = false; P.lastJumpT = t;
            sendMove(true); sfx('jump'); P.squashV += 6; dust(P.pos, 5, 0.7);
        }
    }

    const grav = CFG.gravity * (gear && gear.gravity && !onGlass ? gear.gravity : 1) * (P.falling ? 0.75 : 1);
    if (!P.frozen) P.vel.y -= grav * dt;
    if (P.vel.y < -200) P.vel.y = -200;
    const speed = CFG.walkSpeed * speedMult(S) * (gear && gear.speed ? gear.speed : 1);
    const grip = P.onGround ? 30 : 12;
    P.hv.x += (mv.x * speed - P.hv.x) * Math.min(1, dt * grip);
    P.hv.z += (mv.z * speed - P.hv.z) * Math.min(1, dt * grip);
    if (P.frozen) { P.hv.set(0, 0, 0); P.vel.y = 0; }
    const vx = P.hv.x, vz = P.hv.z;
    gatherSolids(6 + Math.abs(vz) * dt);
    const dist = Math.max(Math.abs(vx), Math.abs(vz), Math.abs(P.vel.y)) * dt;
    const n = Math.max(1, Math.ceil(dist / 0.6));
    const sdt = dt / n;
    const wasGround = P.ground, wasOn = P.onGround;
    P.onGround = false; P.ground = null;
    for (let i = 0; i < n; i++) {
        moveAxis('x', vx * sdt);
        moveAxis('z', vz * sdt);
        moveAxis('y', P.vel.y * sdt);
    }
    if (!P.onGround && wasGround && P.vel.y <= 0 && P.vel.y > -40 && !P.falling) {
        const y0 = P.pos.y;
        moveAxis('y', -0.3);
        if (!P.onGround) P.pos.y = y0;
    }
    if (P.onGround) {
        if (!wasOn && P.airTime > 0.3) {
            sfx('land');
            dust(P.pos, P.airTime > 0.9 ? 14 : 7, P.airTime > 0.9 ? 1.5 : 1);
            P.squashV -= Math.min(10, 3 + P.airTime * 5);
            if (P.airTime > 1.5) addShake(0.25);
            sendMove(true);
        }
        P.airTime = 0;
        P.groundY = P.pos.y;
        judgeStep(t);
    } else P.airTime += dt;
    crumbleStep(dt, t);
    timerStep(dt, t);
    if (P.moving) P.facing = lerpAngle(P.facing, Math.atan2(mv.x, mv.z), 1 - Math.exp(-dt * 14));

    // Falling through broken glass: the Revive popup, then back to the lobby
    if (P.falling) {
        P.fallT += dt;
        setDanger(Math.min(1, P.fallT * 1.5) * (0.6 + Math.sin(t * 10) * 0.15));
        if (P.pos.y < P.fallY0 - 55 && !P.frozen) P.frozen = true;
        if (P.fallT > 1.1 && !reviveOpen() && S.run && reviveInfo) showRevive(reviveInfo);
        if (P.fallT > 1.1 && !S.run) { actions.giveUp(); }
        if (tickRevive(dt)) actions.giveUp();
        if (P.fallT > 1.1 + CFG.reviveSecs + 3 && !reviveOpen()) actions.giveUp();
    } else if (P.pos.y < P.groundY - 90) { actions.giveUp(); }

    // Walked into a gap left by broken glass: that counts as stepping on it
    if (S.run && !S.run.fallen && !P.falling && onGlass) {
        const st = STAGES[S.run.k];
        if (P.pos.y < st.y - 3) {
            const pane = paneAt(st, P.pos.x, P.pos.z);
            if (pane) net.send('step', { k: S.run.k, r: pane.r, s: pane.s, t: net.now() });
            startFall(S.run.k, -1, -1, t);
        }
    }
    // Walked away from the run's stage (back to the lobby): the run is over
    if (S.run && !S.run.fallen && !P.returning) {
        const st = STAGES[S.run.k];
        if (P.pos.z < st.startZ - 10) endRunLocal();
    }
    // Entering a new world changes the sky, the dust and the fog
    const here = P.pos.z < BR.padZ0 ? 0 : worldOf(stageAtZ(P.pos.z)).id;
    const wi = WORLDS.findIndex((w) => w.id === here);
    if (wi !== curWorld) { curWorld = Math.max(0, wi); setWorld(curWorld); }

    if (!P.falling) for (const tr of triggers.near(P.pos.z - 12, P.pos.z + 12)) {
        const inside = overlapsBox(tr, P.pos.x, P.pos.y, P.pos.z);
        if (inside && !tr.inside && tr.enter) tr.enter();
        tr.inside = inside;
    }

    const trail = trailDef(S.trail);
    if (trail.colors.length && (!P.onGround || P.moving) && !P.frozen) {
        P.trailT -= dt;
        if (P.trailT <= 0) { P.trailT = 0.04; emitTrail(P.pos, trail.colors, 1); }
    }

    updateGuide(dt);
    updateEffects(dt);
    updateFx(dt);
    updateSky(dt, t);
    updateWorld(dt, t);
    updateStages(dt, t, P.pos);
    for (const fn of tickers) fn(dt, t);
    syncRemotes(dt, t);
    autoTune(dt);

    rig.position.copy(P.pos);
    rig.rotation.y = P.facing;
    const runAnim = P.moving && P.onGround;
    P.animPhase += dt * (P.onGround ? (runAnim ? 14 * Math.min(1.6, speed / CFG.walkSpeed) : 4) : 0);
    if (P.falling) fallPose(rig, t);
    else if (P.onGround) animRig(rig, P.animPhase, runAnim ? 0.9 : 0); else airPose(rig);
    if (localAvatar) localAvatar.update(dt, { moving: runAnim, air: !P.onGround, speed, t });
    if (P.falling) rig.rotation.z = Math.sin(t * 3) * 0.3; else rig.rotation.z = 0;
    const stepN = Math.floor(P.animPhase / Math.PI);
    if (runAnim && stepN !== P.lastStepSfx) sfx(P.ground && P.ground.glass ? 'glassStep' : 'step');
    P.lastStepSfx = stepN;
    P.squashV += (1 - P.squash) * 180 * dt;
    P.squashV *= Math.exp(-12 * dt);
    P.squash = clamp(P.squash + P.squashV * dt, 0.7, 1.3);
    rig.scale.set(1 / Math.sqrt(P.squash), P.squash, 1 / Math.sqrt(P.squash));
    // Soft round shadow under the feet (it is what grounds you on the glass)
    const gy = P.falling ? -Infinity : groundBelow(P.pos.x, P.pos.y + 0.5, P.pos.z);
    blob.visible = gy > -50;
    if (blob.visible) {
        const h = P.pos.y - gy;
        blob.position.set(P.pos.x, gy + 0.06, P.pos.z);
        blob.scale.setScalar(Math.max(1.5, 3.6 - h * 0.12));
        blob.material.opacity = Math.max(0.15, 1 - h * 0.06);
    }
    setSpeedLines(P.vel.y < -60 ? Math.min(1, (-P.vel.y - 60) / 60) : 0, dt);
    myPets.set(S.equipped);
    myPets.update(P.pos, P.facing, dt, t);

    sendMove(false);
    updatePrompt();
    animateCounters(dt);
    hudT -= dt;
    if (hudT <= 0) {
        hudT = 0.1;
        const room = net.room;
        updateHud({
            players: room && room.state && room.state.players, myId: room && room.sessionId,
            question: S.run && S.run.row < STAGES[S.run.k].rows ? question(S.run.k, S.run.row) : null,
            gear: myGear, here: P.pos.z < BR.padZ0 ? -1 : stageAtZ(P.pos.z), timer: timerShown,
        });
        refreshWorld();
    }
}

// =====================================================================================
// Boot
// =====================================================================================
let lastFrame = 0, loadingSignaled = false, fpsAcc = 0, fpsFrames = 0, showFps = false, fpsLast = 0;
function frame(now) {
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    fpsAcc += (now - (lastFrame || now)) / 1000; fpsFrames++;
    if (fpsAcc >= 0.5) { fpsLast = Math.round(fpsFrames / fpsAcc); if (showFps) $('#fps').textContent = fpsLast + ' FPS'; fpsAcc = 0; fpsFrames = 0; }
    lastFrame = now;
    if (!loadingSignaled) { loadingSignaled = true; BX.triggerAllSettings(); }
    pollGamepad();
    padButtons();
    if (running) update(dt);
    else { const t = now / 1000; for (const fn of tickers) fn(dt, t); updateSky(dt, t); updateStages(dt, t, P.pos); }
    updateCamera(dt);
    render();
    requestAnimationFrame(frame);
}

let joining = false;
async function play() {
    if (joining || running) return;
    joining = true;
    const err = $('#connectErr'), retry = $('#playBtn');
    err.hidden = true; retry.hidden = true;
    $('#loading').hidden = false;
    $('#loading').textContent = 'Joining…';
    BX.loadingStep('Joining a server…');
    initAudio();
    try {
        await waitForLogin(1500);
        const saved = (storageGet('mgb_name') || '').slice(0, 20);
        const room = await connect(BX.identity().loggedIn ? '' : saved);
        const me = room.state.players && room.state.players.get(room.sessionId);
        S.name = me ? me.name : S.name;
    } catch (e) {
        console.error(e);
        joining = false;
        $('#loading').hidden = true;
        err.hidden = false;
        err.textContent = 'Could not reach the game server. Check your connection and try again.';
        retry.hidden = false;
        BX.loadingEnd();
        return;
    }
    joining = false;
    intro = { t: 0, dur: 2.4, from: camera.position.clone() };
    running = true;
    startMusic();
    $('#start').hidden = true;
    $('#hud').hidden = false;
    $('#touch').hidden = !isTouch;
    if (!rig) buildPlayer();
    toSpawn();
    showTips();
    canvas.focus();
    BX.loadingEnd();
}
function waitForLogin(ms) {
    if (!BX.bloxity.ready || BX.identity().loggedIn) return Promise.resolve();
    return new Promise((res) => {
        const t0 = performance.now();
        (function check() { if (BX.identity().loggedIn || performance.now() - t0 > ms) res(); else setTimeout(check, 100); })();
    });
}
function showTips() {
    const el = $('#tips');
    const k = (key, what) => `<span><kbd>${key}</kbd>${what}</span>`;
    el.innerHTML = pad.connected
        ? k('L', 'Walk') + k('A', 'Jump / Revive') + k('X', 'Interact') + k('R', 'Camera')
        : isTouch
            ? '<span>Walk onto the glass with the right answer · drag to look</span>'
            : k('WASD', 'Walk') + k('Space', 'Jump') + k('E', 'Interact') + k('1-3', 'Gears') + k('Drag', 'Camera');
    el.hidden = false; el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 9000);
    setTimeout(() => { el.hidden = true; }, 9900);
}
function unlockAudioOnGesture() {
    const unlock = () => { initAudio(); startMusic(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); removeEventListener('touchstart', unlock); };
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock); addEventListener('touchstart', unlock);
}

// Portal settings only apply when the game runs inside bloxity.io (standalone has its own panel)
function wirePortalSettings() {
    const embedded = (fn) => (v) => { if (BX.isEmbedded()) fn(v); };
    const pct = (v) => clamp((parseInt(v, 10) || 0) / 100, 0, 1);
    BX.listenSetting('master_volume', embedded((v) => setVolume('master', pct(v))));
    BX.listenSetting('music_volume', embedded((v) => setVolume('music', pct(v))));
    BX.listenSetting('graphics_quality', embedded((v) => setQuality(v === 'Low' ? 'low' : v === 'Medium' ? 'medium' : 'high')));
    BX.listenSetting('camera_sensitivity', embedded((v) => { camSens = clamp(parseFloat(v) || 1, 0.1, 5); }));
    BX.listenSetting('show_fps', (v) => { showFps = v === 'true'; $('#fps').hidden = !showFps; });
}
function wirePortalEvents() {
    BX.onPortalEvent((event, data) => {
        if (event === 'respawn_request') { if (running) actions.giveUp(); }
        else if (event === 'chat_message_sent' && data) net.send('chat', { text: String(data) });
        else if (event === 'play_emote' && data) { playEmoteOn(localAvatar, String(data)); net.send('emote', { id: String(data) }); }
    });
    BX.onAvatarChanged(() => syncMyAvatar());
    BX.onProportionsChanged(() => syncMyAvatar());
}
function showIdentity(id) {
    const avail = BX.bloxity.ready;
    $('#acct').hidden = !avail;
    if (!avail) return;
    $('#acctName').textContent = id.name || 'Guest';
    $('#acctBtn').textContent = id.loggedIn ? 'Log out' : 'Log in';
    const pfp = $('#acctPfp');
    pfp.hidden = !id.pfp;
    if (id.pfp) pfp.src = id.pfp;
}
function toggleLogin() { if (BX.identity().loggedIn) BX.logout(); else BX.login(); }

async function boot() {
    BX.initBloxity();
    BX.loadingStep('Loading fonts…');
    try { await Promise.race([document.fonts.load('700 40px Fredoka'), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fallback font */ }
    BX.loadingStep('Polishing the glass…');
    buildWorld();
    buildStageSolids();
    const batched = mergeStatic();
    primeStages();
    if (import.meta.env.DEV) console.info('[world] batched', batched.before, 'boxes into', batched.after, 'meshes');
    loadBase().catch(() => {});
    wirePortalSettings();
    wirePortalEvents();
    BX.loadCatalogPrices().then((changed) => { if (changed) refreshWorld(); });
    BX.onIdentity((id) => {
        showIdentity(id);
        if (net.room && id.loggedIn && id.token && !net.bloxity) net.send('auth', { token: id.token });
        if (net.room) { setupLocalAvatar(); syncMyAvatar(); }
    });
    $('#acctBtn').addEventListener('click', toggleLogin);
    $('#acctPfp').addEventListener('error', (e) => { e.target.hidden = true; });
    $('#playBtn').addEventListener('click', play);
    $('#reconnectBtn').addEventListener('click', () => location.reload());
    unlockAudioOnGesture();
    requestAnimationFrame(frame);
    play();
}
boot();

// Dev-only hooks for automated QA runs (stripped from production builds)
if (import.meta.env.DEV) {
    window.__qa = {
        P, S, net, actions, avatarStats, scene, cam, keys, openModal, remotes, camera, question,
        fps: () => fpsLast,
        draws: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, solids: solids.length }),
        teleport: (x, y, z, yaw) => teleport(new V3(x, y, z), yaw || 0),
        STAGES, ISLANDS, toCheckpoint,
        state: () => ({ x: P.pos.x, y: P.pos.y, z: P.pos.z, ground: P.onGround, falling: P.falling, cash: S.cash, wins: S.wins, run: S.run && { ...S.run }, answers: S.answers }),
    };
}
void CRATES; void buyOpen;
