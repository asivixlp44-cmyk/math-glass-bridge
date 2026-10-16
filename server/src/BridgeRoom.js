import { Room } from 'colyseus';
import { GameState, PlayerState } from './schema.js';
import {
    getProfile, markDirty, saveProfiles, adoptGuestProgress, loadProfile, releaseProfile,
    topProfiles, claimGrants, queueGrant, USE_DB,
} from './profiles.js';
import { verifyBloxityToken, BUX_MODE } from './bloxity.js';
import {
    CFG, WORLD, BR, STAGES, ISLANDS, STAGE_COUNT, STAGES_PER_WORLD, SPOTS, STAIRS, CHESTS, CRATES, TRAILS, GEARS, PRODUCTS, PASSES, QUESTS, FREE, DAILY, CODES, KITS, SKINS, WHEEL,
    stageQuestions, rowZ, paneX, stageOpen, stageAtZ, shownOption, stageScore, chestCash, rowCash, chestCashFor, hasMod, freeRevive,
    dailyStatus, dayKey, crateDef, rollPet, petDef, petSlots, bestPets, trailIndex, rollWheel, rewardText, fmt, comma, clamp,
} from '../../shared/config.js';

const GREEN = '#7dff6b', RED = '#ff5a5a', GOLD = '#ffd028', BLUE = '#6fe0ff', PINK = '#ff8fd0';

// Empty string when the player left the name box blank
function cleanName(name) {
    return String(name || '').replace(/[^\w .\-]/g, '').trim().slice(0, 20);
}
const randomName = () => 'Player' + Math.floor(1000 + Math.random() * 9000);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
// Guest ids come from the browser; they can never claim a Bloxity identity
const guestUid = (uid, fallback) => String(uid || fallback).replace(/^legion_/, 'guest_').slice(0, 64);
const cleanAvatar = (av) => (typeof av === 'string' && av.length <= 2000 ? av : '');
const near = (pl, x, z, r) => Math.abs(pl.x - x) <= r && Math.abs(pl.z - z) <= r;
const newSeed = () => (Math.random() * 0x7fffffff) | 0;
// The far end of the journey (the Golden Throne island)
const MAX_Z = ISLANDS[ISLANDS.length - 1].z0 + ISLANDS[ISLANDS.length - 1].d + 100;

export const liveRooms = new Set();

// One shared world. Movement is client-side; everything that changes progress
// (which glass was right, Cash, Wins, pets, purchases) is decided here.
export class BridgeRoom extends Room {
    maxClients = CFG.maxPlayers;

    onCreate() {
        liveRooms.add(this);
        this.setState(new GameState());
        this.setPatchRate(50);
        this.sessions = new Map();
        this.joinCount = 0;

        const on = (type, fn) => this.onMessage(type, (client, m) => {
            const s = this.sessions.get(client.sessionId);
            if (s) fn.call(this, s, m || {}, client);
        });
        on('move', this.onMove);
        on('run', this.onRun);
        on('step', this.onStep);
        on('revive', this.onRevive);
        on('crumble', this.onCrumble);
        on('rebirth', this.onRebirth);
        on('giveup', this.onGiveUp);
        on('finish', this.onFinish);
        on('hatch', this.onHatch);
        on('equip', this.onEquip);
        on('equipBest', this.onEquipBest);
        on('deletePet', this.onDeletePet);
        on('trail', this.onTrail);
        on('gear', this.onGear);
        on('spin', this.onSpin);
        on('chest', this.onChest);
        on('code', this.onCode);
        on('free', this.onFree);
        on('daily', this.onDaily);
        on('buy', this.onBuy);
        on('tutorial', this.onTutorial);
        on('friends', this.onFriends);
        on('avatar', this.onAvatar);
        on('emote', this.onEmote);
        on('chat', this.onChat);
        this.onMessage('auth', (client, m) => this.onBloxityLogin(client, m));

        this.setSimulationInterval((dt) => this.tick(dt), 250);
        this.clock.setInterval(() => this.broadcastBoards(), 10000);
        // Bux purchases made while the player was on another pod (or offline)
        if (USE_DB) this.clock.setInterval(() => this.applyQueuedGrants(), 5000);
    }

    // A Bloxity token is verified with the Bloxity API; anyone else joins as a guest
    async onAuth(client, options) {
        const legion = options && options.token ? await verifyBloxityToken(options.token) : null;
        return legion ? { legion } : { guest: true };
    }

    async onJoin(client, options, auth) {
        options = options || {};
        const guest = guestUid(options.uid, client.sessionId);
        let uid = guest, name = cleanName(options.name);
        if (auth && auth.legion) {
            uid = 'legion_' + auth.legion.id;
            name = cleanName(auth.legion.name) || name;
            await adoptGuestProgress(uid, guest, name);
        }
        await loadProfile(uid);
        const profile = getProfile(uid, name, randomName());
        const player = new PlayerState();
        player.name = profile.name;
        player.av = cleanAvatar(options.av);
        player.x = WORLD.spawn.x; player.y = WORLD.spawn.y; player.z = WORLD.spawn.z; player.ry = 0;
        player.kit = this.joinCount % KITS.length;
        player.skin = (this.joinCount * 3) % SKINS.length;
        this.joinCount++;
        this.state.players.set(client.sessionId, player);
        const s = {
            id: client.sessionId, client, profile, player, run: null, lastStep: 0,
            joinedAt: Date.now(), freeClaimed: {}, cooldowns: new Map(), guest, lastChat: 0, friends: 0,
        };
        this.sessions.set(client.sessionId, s);
        this.syncPublic(s);
        client.send('hello', { now: Date.now(), bux: BUX_MODE, bloxity: uid.startsWith('legion_') });
        this.sendProfile(s);
        this.broadcastBoards(client);
        if (USE_DB) this.applyQueuedGrants();
    }

    // A dropped connection keeps the player in the world for 30 s so the client can reconnect
    onDrop(client) {
        this.allowReconnection(client, 30);
    }
    onReconnect(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        s.client = client;
        client.send('hello', { now: Date.now(), bux: BUX_MODE, bloxity: s.profile.uid.startsWith('legion_') });
        this.sendProfile(s);
        if (s.run) client.send('runStart', { k: s.run.k, seed: s.run.seed, path: s.run.path, row: s.run.row, resume: true });
        this.broadcastBoards(client);
    }

    onLeave(client) {
        const s = this.sessions.get(client.sessionId);
        if (s) s.profile.lastSeen = Date.now();
        this.state.players.delete(client.sessionId);
        this.sessions.delete(client.sessionId);
        markDirty();
        if (s && !isOnline(s.profile.uid)) releaseProfile(s.profile.uid, isOnline);
    }

    // Colyseus awaits this on SIGTERM, which is how Legion stops a pod on every deploy
    onDispose() {
        for (const s of this.sessions.values()) s.profile.lastSeen = Date.now();
        liveRooms.delete(this);
        markDirty();
        return saveProfiles();
    }

    async applyQueuedGrants() {
        const uids = [...this.sessions.values()].map((s) => s.profile.uid);
        let grants = [];
        try { grants = await claimGrants(uids); } catch (e) { return console.warn('[DB] grants:', e.message); }
        for (const g of grants) {
            const s = [...this.sessions.values()].find((x) => x.profile.uid === g.uid);
            if (s) { this.grant(s, g.kind, g.key); continue; }
            // Left between the query and now: put it back for their next visit
            queueGrant(g.uid, g.name, g.kind, g.key, g.tx).catch(() => {});
        }
        if (grants.length) saveProfiles();
    }

    // ----- helpers -----
    syncPublic(s) {
        const p = s.profile, pl = s.player;
        pl.cash = p.cash; pl.wins = p.wins; pl.answers = p.answers;
        pl.trail = trailIndex(p.trail);
        pl.pets = (p.equipped || []).join('|');
        pl.vip = !!p.passes.VIP;
        pl.k = s.run ? s.run.k : -1;
        pl.stage = Math.min(255, p.stage || 0);
        pl.rebirths = p.rebirths || 0;
        pl.row = s.run ? s.run.row : 0;
        pl.streak = s.run ? s.run.streak : 0;
    }
    sendProfile(s) {
        const p = s.profile;
        s.client.send('profile', {
            cash: p.cash, totalCash: p.totalCash, wins: p.wins, answers: p.answers, bestStreak: p.bestStreak, stage: p.stage || 0, rebirths: p.rebirths || 0,
            passes: p.passes, quest: p.quest, hatched: p.hatched, trails: p.trails, trail: p.trail, pets: p.pets, equipped: p.equipped,
            codes: p.codes, gears: p.gears, pathTokens: p.pathTokens, reviveTokens: p.reviveTokens, spins: p.spins, wheelAt: p.wheelAt,
            playtime: Math.floor(p.playtime || 0), chestAt: p.chestAt, boostUntil: p.boostUntil, claimedPack: p.claimedPack,
            seenTutorial: p.seenTutorial, freeClaimed: s.freeClaimed, joinedAt: s.joinedAt, daily: dailyStatus(p, Date.now()), friends: s.friends,
        });
    }
    toast(s, text, color) { s.client.send('toast', { text, color }); }
    cooldown(s, key, seconds) {
        const now = Date.now();
        if ((s.cooldowns.get(key) || 0) > now) return false;
        s.cooldowns.set(key, now + seconds * 1000);
        return true;
    }
    changed(s) {
        this.checkQuest(s);
        this.syncPublic(s); this.sendProfile(s); markDirty();
    }
    addCash(s, n) {
        n = Math.floor(n);
        if (!(n > 0)) return 0;
        s.profile.cash += n;
        s.profile.totalCash += n;
        markDirty();
        return n;
    }
    grantReward(s, r) {
        const p = s.profile;
        if (r.cash) this.addCash(s, r.cash);
        if (r.crate) this.hatch(s, crateDef(r.crate), true);
        if (r.boost) p.boostUntil = Math.max(Date.now(), p.boostUntil || 0) + r.boost * 60000;
        if (r.path) this.givePath(s, r.path);
    }
    // Quest chain: completes automatically and pays its reward
    checkQuest(s) {
        const p = s.profile;
        for (let guard = 0; guard < QUESTS.length; guard++) {
            const q = QUESTS[p.quest];
            if (!q || (p[q.stat] || 0) < q.n) return;
            p.quest++;
            this.grantReward(s, q.reward);
            s.client.send('quest', { text: q.text, reward: rewardText(q.reward), tutorialDone: p.quest === 3 });
            this.sendProfile(s);
        }
    }

    // ----- simulation -----
    tick(dt) {
        for (const s of this.sessions.values()) {
            const p = s.profile, before = Math.floor((p.playtime || 0) / 60);
            p.playtime = (p.playtime || 0) + dt / 1000;
            // Keeps the playtime clocks (Lucky Wheel, Free! gifts) in step on the client
            if (Math.floor(p.playtime / 60) !== before) this.sendProfile(s);
        }
    }

    broadcastBoards(target) {
        const top = (key) => topProfiles(key).map((p) => ({ n: p.name, v: Math.floor(p[key] || 0) }));
        const msg = { stage: top('best'), wins: top('wins'), cash: top('totalCash') };
        if (target) target.send('boards', msg); else this.broadcast('boards', msg);
    }

    // ----- movement -----
    onMove(s, m) {
        if (!finite(m.x) || !finite(m.y) || !finite(m.z)) return;
        const pl = s.player;
        pl.x = clamp(m.x, -WORLD.halfX - 40, WORLD.halfX + 40);
        pl.y = clamp(m.y, -400, 800);
        pl.z = clamp(m.z, WORLD.zMin - 40, MAX_Z);
        pl.ry = finite(m.ry) ? m.ry : 0;
        pl.anim = clamp(m.a | 0, 0, 3);
        // Walked (or teleported) away from the run's stage: the run is over
        if (s.run && !s.run.fallen) {
            const st = STAGES[s.run.k];
            if (pl.z < st.startZ - 12 || pl.z > st.endZ + ISLANDS[st.k + 1].d + 8) this.endRun(s);
        }
    }

    // ----- the stages -----
    // Standing on a stage's start (the lobby pad or a checkpoint island) asks for a run: the server picks the seed
    onRun(s, m) {
        const k = m.k | 0, st = STAGES[k];
        if (!st) return;
        const p = s.profile, pl = s.player;
        if (!stageOpen(k, p)) {
            if (this.cooldown(s, 'locked', 2)) this.toast(s, 'Clear Stage ' + k + ' first!', RED);
            return;
        }
        const halfW = k === 0 ? st.W / 2 + 6 : ISLANDS[k].w / 2 + 4;
        if (Math.abs(pl.x - st.startX) > halfW || Math.abs(pl.z - (st.startZ + st.startD / 2)) > st.startD / 2 + 8 || pl.y < st.y - 4) return;
        if (s.run && s.run.k === k && !s.run.fallen) {
            if (s.run.row === 0) s.client.send('runStart', { k, seed: s.run.seed, path: s.run.path, row: 0 });
            return;
        }
        if (!this.cooldown(s, 'run', 0.6)) return;
        this.startRun(s, k);
    }
    startRun(s, k) {
        const st = STAGES[k], p = s.profile;
        const seed = newSeed();
        s.run = {
            k, seed, qs: stageQuestions(st.level, seed, st.rows, st.choices), row: 0, streak: 0, mistakes: 0,
            fallen: false, freeUsed: false, path: false, skipped: false, wrongS: -1,
        };
        if (p.pathTokens > 0) { p.pathTokens--; s.run.path = true; }
        p.runs = (p.runs || 0) + 1;
        s.client.send('runStart', { k, seed, path: s.run.path, row: 0 });
        this.syncPublic(s);
        markDirty();
    }
    endRun(s) {
        if (!s.run) return;
        s.run = null;
        this.syncPublic(s);
    }

    // The player landed on pane s of row r: right answer pays, wrong answer breaks the glass.
    // On Shuffle stages the numbers move, so the pane is judged at the time the client stepped (t).
    onStep(s, m, client) {
        const run = s.run;
        if (!run || run.fallen || (m.k | 0) !== run.k) return;
        const r = m.r | 0, side = m.s | 0, k = run.k, st = STAGES[k];
        if (r !== run.row || side < 0 || side >= st.choices) return;
        const now = Date.now();
        if (now - s.lastStep < CFG.stepCooldown * 1000) return;
        const pl = s.player;
        if (Math.abs(pl.z - (rowZ(st, r) + BR.depth / 2)) > BR.pitch + 2 || Math.abs(pl.x - paneX(st, side)) > st.pw + 2) return;
        s.lastStep = now;
        const t = finite(m.t) && Math.abs(m.t - now) < 1500 ? m.t : now;
        const qq = run.qs[r], p = s.profile;
        if (qq.options[shownOption(st, r, side, t)] === qq.answer) {
            run.row++; run.streak++;
            p.answers++;
            if (run.streak > (p.bestStreak || 0)) p.bestStreak = run.streak;
            const got = this.addCash(s, rowCash(k, p, now, s.friends, run.streak));
            client.send('right', { r, n: got, streak: run.streak });
            this.syncPublic(s);
            if (p.answers <= 12 || p.answers % 10 === 0 || run.streak % 5 === 0) this.changed(s);
        } else {
            this.fall(s, side);
            client.send('wrong', { r, s: side, answer: qq.answer, reveal: qq.reveal, free: freeRevive(st, p, run), tokens: p.reviveTokens });
            this.broadcast('shatter', { k, r, s: side, id: client.sessionId }, { except: client });
        }
    }
    fall(s, side) {
        const run = s.run;
        run.fallen = true; run.streak = 0; run.mistakes++; run.wrongS = side;
        s.profile.wrong = (s.profile.wrong || 0) + 1;
        this.syncPublic(s);
        markDirty();
    }
    // Crumbling Glass / Time Limit: the pane broke under the player (they waited too long)
    onCrumble(s, m, client) {
        const run = s.run;
        if (!run || run.fallen || (m.k | 0) !== run.k) return;
        const st = STAGES[run.k];
        if (!hasMod(st, 'crumble') && !hasMod(st, 'timer')) return;
        this.fall(s, -1);
        client.send('fell', { free: freeRevive(st, s.profile, run), tokens: s.profile.reviveTokens });
    }

    // Revive: first one each run is free (always with Infinite Revives), then Revive tokens / Bux
    onRevive(s) {
        const run = s.run, p = s.profile;
        if (!run || !run.fallen) return;
        if (freeRevive(STAGES[run.k], p, run)) run.freeUsed = true;
        else if (p.reviveTokens > 0) p.reviveTokens--;
        else { s.client.send('offer', { kind: 'product', key: 'Revive' }); return; }
        this.revive(s);
    }
    revive(s) {
        const run = s.run;
        run.fallen = false;
        s.client.send('revived', { k: run.k, r: run.row, wrongS: run.wrongS, free: freeRevive(STAGES[run.k], s.profile, run) });
        this.syncPublic(s);
        this.sendProfile(s);
    }
    onGiveUp(s) { this.endRun(s); }

    // Reaching the next island clears the stage: every row answered (or a Skip Stage)
    onFinish(s, m, client) {
        const run = s.run, k = m.k | 0;
        if (!run || run.k !== k || run.fallen) return;
        const st = STAGES[k];
        if (run.row < st.rows && !run.skipped) return;
        const pl = s.player, isl = ISLANDS[k + 1];
        if (pl.z < st.endZ - 3 || pl.z > isl.z0 + isl.d + 2 || Math.abs(pl.x - isl.x) > isl.w / 2 + 4) return;
        const p = s.profile;
        const cash = this.addCash(s, chestCashFor(k, p, Date.now(), s.friends));
        p.wins += st.wins;
        const first = k + 1 > (p.stage || 0);
        p.stage = Math.max(p.stage || 0, k + 1);
        p.best = stageScore(p);
        const world = st.idx === STAGES_PER_WORLD - 1;
        client.send('cleared', { k, cash, wins: st.wins, perfect: run.mistakes === 0 && !run.skipped, streak: run.streak, world, first, done: k + 1 >= STAGE_COUNT });
        if (world && first) this.broadcast('announce', { text: s.profile.name + ' finished World ' + (st.w + 1) + '!', color: GOLD }, { except: client });
        this.endRun(s);
        this.changed(s);
    }
    // Rebirth on the Golden Throne after the last stage: back to Stage 1 with +50% Cash forever
    onRebirth(s) {
        const p = s.profile;
        if ((p.stage || 0) < STAGE_COUNT) return this.toast(s, 'Clear all ' + STAGE_COUNT + ' stages to Rebirth!', RED);
        p.rebirths = (p.rebirths || 0) + 1;
        p.stage = 0;
        p.best = stageScore(p);
        this.endRun(s);
        s.client.send('reborn', { rebirths: p.rebirths });
        this.broadcast('announce', { text: '🔄 ' + p.name + ' was REBORN! (x' + p.rebirths + ')', color: PINK });
        this.changed(s);
    }

    // ----- crates and pets -----
    onHatch(s, m) {
        const crate = crateDef(m.id);
        if (!crate || crate.product) return;
        if (!near(s.player, SPOTS.crates.x, SPOTS.crates.z, 20)) return;
        if (!this.cooldown(s, 'hatch', 1.2)) return;
        if (s.profile.pets.length >= CFG.petBag) return this.toast(s, 'Your pet bag is full! Delete some pets.', RED);
        if (s.profile.cash < crate.cost) return this.toast(s, 'You need $' + comma(crate.cost - s.profile.cash) + ' more Cash!', RED);
        s.profile.cash -= crate.cost;
        this.hatch(s, crate, false);
        this.changed(s);
    }
    hatch(s, crate, free) {
        const p = s.profile;
        if (!crate) return null;
        if (p.pets.length >= CFG.petBag) { this.toast(s, 'Your pet bag is full!', RED); return null; }
        const id = rollPet(crate, Math.random);
        p.pets.push(id);
        p.hatched = (p.hatched || 0) + 1;
        // A new pet better than one you have equipped goes on right away
        const eq = p.equipped, slots = petSlots(p);
        if (eq.length < slots) eq.push(id);
        else {
            let worst = 0;
            eq.forEach((e, i) => { if ((petDef(e) || { b: 0 }).b < (petDef(eq[worst]) || { b: 0 }).b) worst = i; });
            if ((petDef(id) || { b: 0 }).b > (petDef(eq[worst]) || { b: 0 }).b) eq[worst] = id;
        }
        s.client.send('hatched', { crate: crate.id, pet: id, free: !!free });
        markDirty();
        return id;
    }
    onEquip(s, m) {
        const p = s.profile, id = String(m.id || '');
        if (!petDef(id)) return;
        if (m.on) {
            const owned = p.pets.filter((x) => x === id).length, used = p.equipped.filter((x) => x === id).length;
            if (used >= owned) return;
            if (p.equipped.length >= petSlots(p)) return this.toast(s, 'Only ' + petSlots(p) + ' pets can follow you!', RED);
            p.equipped.push(id);
        } else {
            const i = p.equipped.indexOf(id);
            if (i < 0) return;
            p.equipped.splice(i, 1);
        }
        this.changed(s);
    }
    onEquipBest(s) {
        s.profile.equipped = bestPets(s.profile.pets, petSlots(s.profile));
        this.changed(s);
    }
    onDeletePet(s, m) {
        const p = s.profile, id = String(m.id || '');
        const i = p.pets.lastIndexOf(id);
        if (i < 0) return;
        p.pets.splice(i, 1);
        const owned = p.pets.filter((x) => x === id).length;
        while (p.equipped.filter((x) => x === id).length > owned) p.equipped.splice(p.equipped.indexOf(id), 1);
        this.changed(s);
    }

    // ----- trails and gears -----
    onTrail(s, m) {
        const t = TRAILS.find((x) => x.id === m.id);
        if (!t) return;
        const p = s.profile;
        const owned = t.id === 'None' || p.trails[t.id] || (t.pass && p.passes[t.pass]);
        if (!owned) {
            if (t.pass) { s.client.send('offer', { kind: 'pass', key: t.pass }); return; }
            if (p.cash < t.cost) return this.toast(s, 'You need $' + comma(t.cost - p.cash) + ' more Cash!', RED);
            p.cash -= t.cost;
            p.trails[t.id] = true;
            this.toast(s, t.id + ' Trail unlocked! x' + t.mult + ' Cash', GREEN);
            s.client.send('fx', { kind: 'buy' });
        }
        p.trail = t.id;
        this.changed(s);
    }
    // Buys a gear (Cash) or puts one in your hand ('' puts it away)
    onGear(s, m) {
        const p = s.profile, id = String(m.id || '');
        if (!id) { s.player.gear = ''; return; }
        const g = GEARS.find((x) => x.id === id);
        if (!g) return;
        if (!p.gears[id]) {
            if (!m.buy) return;
            if (p.cash < g.cost) return this.toast(s, 'You need $' + comma(g.cost - p.cash) + ' more Cash!', RED);
            p.cash -= g.cost;
            p.gears[id] = true;
            this.toast(s, g.name + ' bought! It is in your hotbar.', GREEN);
            s.client.send('fx', { kind: 'buy' });
            this.changed(s);
            return;
        }
        if (!m.buy) s.player.gear = id;
    }

    // ----- Lucky Wheel and chests -----
    onSpin(s) {
        const p = s.profile;
        if (!this.cooldown(s, 'spin', 4)) return;
        if ((p.playtime || 0) >= (p.wheelAt || 0)) p.wheelAt = (p.playtime || 0) + CFG.wheelEvery;
        else if (p.spins > 0) p.spins--;
        else { s.client.send('offer', { kind: 'product', key: 'LuckySpin' }); return; }
        const i = rollWheel(Math.random), w = WHEEL[i];
        s.client.send('spun', { i });
        // Paid when the wheel stops on the client (about 4 s), so the toast lines up
        this.clock.setTimeout(() => {
            if (!this.sessions.has(s.id)) return;
            this.grantReward(s, { cash: w.cash, crate: w.crate, boost: w.boost, path: w.path });
            this.toast(s, 'Lucky Wheel: ' + w.label + '!', GOLD);
            this.changed(s);
        }, 4300);
        this.sendProfile(s);
        markDirty();
    }
    onChest(s, m) {
        const id = m.id === 'stairs' ? 'stairs' : 'space';
        const p = s.profile, pl = s.player;
        const spot = id === 'stairs' ? SPOTS.stairs : SPOTS.spaceChest;
        if (!near(pl, spot.x, spot.z, id === 'stairs' ? 16 : 10)) return;
        if (id === 'stairs' && pl.y < STAIRS.steps * STAIRS.rise - 8) return;
        const now = Date.now(), at = (p.chestAt && p.chestAt[id]) || 0;
        if (at > now) { if (this.cooldown(s, 'chestmsg', 2)) this.toast(s, CHESTS[id].name + ' refills in ' + Math.ceil((at - now) / 60000) + ' min', BLUE); return; }
        p.chestAt = p.chestAt || {};
        p.chestAt[id] = now + CHESTS[id].every * 1000;
        const got = this.addCash(s, chestCash(id, p));
        s.client.send('chested', { id, cash: got });
        this.changed(s);
    }

    onCode(s, m) {
        if (typeof m.code !== 'string' || !this.cooldown(s, 'code', 1)) return;
        const code = m.code.trim().toUpperCase().slice(0, 24);
        const r = CODES[code];
        if (!r) return this.toast(s, 'Invalid code!', RED);
        if (s.profile.codes[code]) return this.toast(s, 'Code already redeemed!', BLUE);
        s.profile.codes[code] = true;
        this.grantReward(s, r);
        this.toast(s, 'Code redeemed: ' + rewardText(r) + '!', GREEN);
        s.client.send('fx', { kind: 'confetti' });
        this.changed(s);
    }
    onFree(s, m) {
        const i = m.i | 0, r = FREE[i];
        if (!r || s.freeClaimed[i]) return;
        if ((Date.now() - s.joinedAt) / 60000 < r.min) return;
        s.freeClaimed[i] = true;
        this.grantReward(s, r);
        this.toast(s, 'Free gift: ' + rewardText(r) + '!', GREEN);
        s.client.send('fx', { kind: 'confetti' });
        this.changed(s);
    }
    onDaily(s) {
        const p = s.profile, now = Date.now();
        const st = dailyStatus(p, now);
        if (!st.ready) return this.toast(s, 'Come back tomorrow for the next reward!', BLUE);
        const r = DAILY[st.day];
        p.dailyStreak = (p.dailyDay === dayKey(now - 86400000) ? p.dailyStreak : 0) + 1;
        p.dailyDay = dayKey(now);
        this.grantReward(s, r);
        this.toast(s, 'Day ' + (st.day + 1) + ' reward: ' + rewardText(r) + '!', GREEN);
        s.client.send('fx', { kind: 'confetti' });
        this.changed(s);
    }
    onTutorial(s) {
        if (!s.profile.seenTutorial) { s.profile.seenTutorial = true; this.sendProfile(s); markDirty(); }
    }
    // Friend Boost: Bloxity friends in this server, counted by the client and capped here
    onFriends(s, m) {
        const others = this.sessions.size - 1;
        s.friends = clamp(m.n | 0, 0, Math.min(CFG.friendMax, others));
        this.sendProfile(s);
    }

    // ----- purchases -----
    // Demo mode grants for free. In Bux mode (LEGION_WEBHOOK_SECRET set) only the webhook grants.
    onBuy(s, m) {
        if (BUX_MODE) return this.toast(s, 'Purchases use Bux - log in to Bloxity', BLUE);
        this.grant(s, m.kind, m.key);
    }
    givePath(s, n) {
        const run = s.run;
        if (run && !run.fallen && !run.path) {
            run.path = true;
            s.client.send('path', { k: run.k });
            n--;
        }
        if (n > 0) {
            s.profile.pathTokens = (s.profile.pathTokens || 0) + n;
            this.toast(s, 'Show Path saved for your next run!', PINK);
        }
    }
    // s is a live session, or a stand-in { profile, client: { send() {} } } for offline players
    grant(s, kind, key) {
        const p = s.profile;
        if (kind === 'pass') {
            const pass = PASSES[key];
            if (!pass) return false;
            if (p.passes[key]) { this.toast(s, pass.name + ' already owned!', BLUE); return true; }
            p.passes[key] = true;
            if (key === 'RainbowTrail') p.trail = 'Rainbow';
            this.toast(s, pass.name + ' unlocked!', GREEN);
        } else {
            const prod = PRODUCTS[key];
            if (!prod) return false;
            if (key === 'StarterPack') {
                if (p.claimedPack) { this.toast(s, 'Starter Pack already claimed!', BLUE); return true; }
                p.claimedPack = true;
                this.hatch(s, crateDef('Basic'), true);
            }
            if (prod.cash) { this.addCash(s, prod.cash); this.toast(s, '+$' + comma(prod.cash) + ' Cash!', GOLD); }
            if (key === 'CashBoost') {
                p.boostUntil = Math.max(Date.now(), p.boostUntil || 0) + CFG.boostMinutes * 60000;
                this.toast(s, 'x2 Cash for 15 minutes!', GOLD);
            }
            if (key === 'MythicCrate') this.hatch(s, crateDef('Mythic'), true);
            if (prod.pet) {
                p.pets.push(prod.pet);
                p.equipped = bestPets(p.pets, petSlots(p));
                s.client.send('hatched', { crate: 'Store', pet: prod.pet, free: true });
            }
            if (key === 'LuckySpin') { p.spins = (p.spins || 0) + 1; this.toast(s, 'Lucky Spin ready! Open the wheel.', GOLD); }
            if (key === 'ShowPath') this.givePath(s, 1);
            if (key === 'Revive') {
                p.reviveTokens = (p.reviveTokens || 0) + 1;
                if (s.run && s.run.fallen) { p.reviveTokens--; this.revive(s); }
            }
            if (key === 'SkipToEnd' && s.player) this.skipToEnd(s);
            if (key === 'KillAll' && s.player) this.killAll(s);
        }
        s.client.send('fx', { kind: 'confetti' });
        if (s.player) this.changed(s); else markDirty();
        return true;
    }
    // Skip Stage: the stage you are on (or your checkpoint stage from the lobby)
    skipToEnd(s) {
        const p = s.profile, pl = s.player;
        let k = s.run ? s.run.k : pl.z < BR.padZ0 ? Math.min(p.stage || 0, STAGE_COUNT - 1) : stageAtZ(pl.z);
        if (!stageOpen(k, p)) k = Math.min(p.stage || 0, STAGE_COUNT - 1);
        if (!s.run || s.run.k !== k) this.startRun(s, k);
        s.run.fallen = false;
        s.run.skipped = true;
        s.client.send('skipTo', { k });
        this.syncPublic(s);
    }
    // Kill All: the glass under every other player on a stage shatters
    killAll(s) {
        let n = 0;
        for (const o of this.sessions.values()) {
            if (o === s || !o.run || o.run.fallen) continue;
            const st = STAGES[o.run.k];
            if (o.player.z < st.z0 - 1 || o.player.z > st.endZ) continue;
            const run = o.run;
            run.fallen = true; run.streak = 0; run.wrongS = -1;
            o.client.send('killed', { by: s.profile.name, free: freeRevive(st, o.profile, run), tokens: o.profile.reviveTokens });
            this.syncPublic(o);
            n++;
        }
        this.broadcast('announce', { text: '💀 ' + s.profile.name + ' used KILL ALL!' + (n ? ' (' + n + ' fell)' : ''), color: RED, kill: true });
    }

    // ----- Bloxity -----
    // Logged in to Bloxity after joining: move this session onto the Bloxity profile
    async onBloxityLogin(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || s.authing) return;
        s.authing = true;
        const legion = await verifyBloxityToken(m.token);
        s.authing = false;
        if (!legion || !this.sessions.has(client.sessionId)) return;
        const uid = 'legion_' + legion.id;
        if (s.profile.uid === uid) return;
        const name = cleanName(legion.name) || s.profile.name;
        const guestProfile = s.profile;
        await adoptGuestProgress(uid, guestProfile.uid, name);
        await loadProfile(uid);
        if (!this.sessions.has(client.sessionId)) return;
        s.profile = getProfile(uid, name, randomName());
        if (!isOnline(guestProfile.uid)) releaseProfile(guestProfile.uid, isOnline);
        s.player.name = s.profile.name;
        this.changed(s);
        client.send('authed', { name: s.profile.name });
        this.toast(s, 'Logged in as ' + s.profile.name, GREEN);
        this.broadcastBoards();
    }
    onAvatar(s, m) { s.player.av = cleanAvatar(m.av); }
    // Emote ids are opaque catalogue ids; other players play the same clip
    onEmote(s, m, client) {
        if (typeof m.id !== 'string' || m.id.length > 40) return;
        this.broadcast('emote', { s: client.sessionId, id: m.id }, { except: client });
    }
    onChat(s, m, client) {
        if (typeof m.text !== 'string') return;
        const now = Date.now();
        if (now - s.lastChat < 800) return;
        s.lastChat = now;
        const text = m.text.replace(/\s+/g, ' ').trim().slice(0, 120);
        if (text) this.broadcast('chat', { s: client.sessionId, name: s.profile.name, text });
    }
}

function isOnline(uid) {
    for (const room of liveRooms) for (const s of room.sessions.values()) if (s.profile.uid === uid) return true;
    return false;
}

// Grants a Bux purchase confirmed by the Bloxity webhook, whether or not the player is online
export async function grantPurchase(uid, name, kind, key, tx) {
    for (const room of liveRooms) {
        for (const s of room.sessions.values()) {
            if (s.profile.uid === uid) return room.grant(s, kind, key);
        }
    }
    // Not on this pod: the pod hosting them (or their next join) applies it
    if (USE_DB) { await queueGrant(uid, name, kind, key, tx); return true; }
    const profile = getProfile(uid, name, randomName());
    const stub = { profile, client: { send() {} } };
    const proto = BridgeRoom.prototype;
    return proto.grant.call({
        toast() {}, addCash: proto.addCash, hatch: proto.hatch, checkQuest() {}, sendProfile() {}, changed() {},
        givePath(st, n) { st.profile.pathTokens = (st.profile.pathTokens || 0) + n; },
    }, stub, kind, key);
}
void CRATES; void fmt;
