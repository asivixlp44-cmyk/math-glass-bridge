import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
    T, V3, scene, mat, box, aabb, UNIT, solids, triggers, prompts, tickers, texFrom, billboard, FONT, studMat,
} from './engine.js';
import { S, actions, net } from './state.js';
import { buildPet } from './pets.js';
import {
    WORLD, BR, STAGES, STAGE_COUNT, SPOTS, STAIRS, CHESTS, CRATES, PRODUCTS, WHEEL, chestCash, checkpointPos, worldOf,
    fmt, money, clock, rngFrom,
} from '../../shared/config.js';

export const SPAWN = new V3(WORLD.spawn.x, WORLD.spawn.y, WORLD.spawn.z);
const HX = WORLD.halfX, Z0 = WORLD.zMin, Z1 = WORLD.zMax;
const rng = rngFrom(20261016);

// Rounded sign panel with outlined text, as a flat plane
function panelCanvas(lines, W, H, bg, border) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    const r = H * 0.16;
    if (bg !== 'none') {
        x.fillStyle = border || 'rgba(255,255,255,0.85)';
        x.beginPath(); x.roundRect(0, 0, W, H, r); x.fill();
        x.fillStyle = bg || '#1c1a2e';
        x.beginPath(); x.roundRect(H * 0.05, H * 0.05, W - H * 0.1, H - H * 0.1, r * 0.8); x.fill();
    }
    const sum = lines.reduce((a, l) => a + l.px * 1.1, 0);
    const sc = Math.min(W / 512, (H * 0.86) / sum);
    let y = (H - sum * sc) / 2;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    for (const l of lines) {
        const lp = l.px * sc;
        let px = lp;
        x.font = FONT(700, px);
        while (x.measureText(l.t).width > W * 0.9 && px > 10) { px -= 2; x.font = FONT(700, px); }
        const cy = y + lp * 0.58;
        x.lineWidth = Math.max(4, px * 0.2); x.strokeStyle = '#16121f'; x.strokeText(l.t, W / 2, cy);
        x.fillStyle = l.c || '#ffffff'; x.fillText(l.t, W / 2, cy);
        y += lp * 1.1;
    }
    return cv;
}
function panel(lines, w, h, pos, rotY, opts) {
    opts = opts || {};
    const W = 1024, H = Math.round(W * h / w);
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: texFrom(panelCanvas(lines, W, H, opts.bg, opts.border)), transparent: true, toneMapped: false, side: opts.double ? T.DoubleSide : T.FrontSide }));
    m.position.copy(pos); m.rotation.y = rotY || 0;
    scene.add(m);
    m.userData.set = (nl) => { m.material.map.dispose(); m.material.map = texFrom(panelCanvas(nl, W, H, opts.bg, opts.border)); m.material.needsUpdate = true; };
    return m;
}
function bigWords(lines, worldW, pos, parent) {
    return billboard(lines.map((l) => ({ t: l.t, c: l.c, s: '#16121f', px: l.px || 80, glow: l.glow })), worldW, 1024, pos, parent);
}
const CYL = new T.CylinderGeometry(1, 1, 1, 32);
function mesh(geo, material, sx, sy, sz, x, y, z, cast) {
    const m = new T.Mesh(geo, material);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    if (cast) m.castShadow = true;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix();
    scene.add(m);
    return m;
}
function neon(sx, sy, sz, x, y, z, color, hdr) { return box(sx, sy, sz, x, y, z, color, { neon: true, decor: true, hdr: hdr || 2 }); }

// =====================================================================================
// The floating plaza: studded tiles (one instanced mesh), a rock underneath, rails all round
// =====================================================================================
const TILE = 6;
const TILE_GEO = new RoundedBoxGeometry(TILE - 0.2, 1.2, TILE - 0.2, 2, 0.35);
function tileFloor() {
    const nx = Math.floor((HX * 2) / TILE), nz = Math.floor((Z1 - Z0) / TILE);
    const studs = studMat(0xffffff, 3, 3).map.clone(); studs.needsUpdate = true; studs.repeat.set(3, 3);
    const im = new T.InstancedMesh(TILE_GEO, new T.MeshLambertMaterial({ color: 0xffffff, map: studs }), nx * nz);
    const m4 = new T.Matrix4(), c = new T.Color();
    let i = 0;
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
        const cx = -HX + (a + 0.5) * TILE, cz = Z0 + (b + 0.5) * TILE;
        let hex = 0x6a40c8;                                   // violet
        if (Math.abs(cx) < 12) hex = 0x3a5ae0;                 // blue avenue from spawn to the bridge
        if (Math.abs(cx) >= 12 && Math.abs(cx) < 15) hex = 0xf2eaff;
        if (cz > Z1 - 16) hex = (a + b) % 2 ? 0x3a5ae0 : 0x3050d0; // the blue strip in front of the bridge
        if (Math.hypot(cx - SPAWN.x, cz - SPAWN.z) < 12) hex = 0xe85ab8;  // pink spawn
        if (Math.hypot(cx - SPOTS.crates.x, cz - SPOTS.crates.z) < 14 || Math.hypot(cx - SPOTS.gears.x, cz - SPOTS.gears.z) < 12) hex = 0xff5ac8;
        if (Math.hypot(cx - SPOTS.trails.x, cz - SPOTS.trails.z) < 12 || Math.hypot(cx - SPOTS.wheel.x, cz - SPOTS.wheel.z) < 12) hex = 0x2fd0c8;
        m4.makeTranslation(cx, -0.6 - (((a * 7 + b * 13) % 5) * 0.015), cz);
        im.setMatrixAt(i, m4);
        c.setHex(hex).offsetHSL(0, 0, (((a * 31 + b * 17) % 7) - 3) * 0.008);
        im.setColorAt(i, c);
        i++;
    }
    im.receiveShadow = true;
    scene.add(im);
    solids.add(aabb(0, -2, (Z0 + Z1) / 2, HX * 2, 4, Z1 - Z0));
    // Thick white rim and a rocky underside
    box(HX * 2 + 3, 3, Z1 - Z0 + 3, 0, -2.7, (Z0 + Z1) / 2, 0xe8deff, { decor: true });
    neon(HX * 2 + 3.2, 0.25, 0.3, 0, -1.3, Z0 - 1.6, 0xff6bd5);
    neon(0.3, 0.25, Z1 - Z0 + 3.2, -HX - 1.6, -1.3, (Z0 + Z1) / 2, 0xff6bd5);
    neon(0.3, 0.25, Z1 - Z0 + 3.2, HX + 1.6, -1.3, (Z0 + Z1) / 2, 0xff6bd5);
    const rock = new T.Mesh(new T.CylinderGeometry(1, 0.15, 1, 9, 3), new T.MeshLambertMaterial({ color: 0x3a2e6a, flatShading: true }));
    const rp = rock.geometry.attributes.position, v = new V3();
    for (let k = 0; k < rp.count; k++) { v.fromBufferAttribute(rp, k); if (v.y < 0.45) { v.x *= 0.85 + rng() * 0.3; v.z *= 0.85 + rng() * 0.3; } rp.setXYZ(k, v.x, v.y, v.z); }
    rock.geometry.computeVertexNormals();
    rock.scale.set(HX * 1.05, 70, (Z1 - Z0) * 0.62); rock.position.set(0, -39, (Z0 + Z1) / 2);
    rock.matrixAutoUpdate = false; rock.updateMatrix();
    scene.add(rock);
    // Glowing crystals hanging under the island
    const crystalGeo = new T.OctahedronGeometry(1, 0);
    for (let k = 0; k < 26; k++) {
        const a = rng() * Math.PI * 2, r = 0.3 + rng() * 0.55;
        const col = [0xff6bd5, 0x6fe0ff, 0xc46bff][k % 3];
        const cm = new T.Mesh(crystalGeo, mat(col, { neon: true, hdr: 1.6 }));
        cm.scale.set(1.5 + rng() * 2, 4 + rng() * 9, 1.5 + rng() * 2);
        cm.position.set(Math.cos(a) * HX * r, -8 - rng() * 30 * (1 - r), (Z0 + Z1) / 2 + Math.sin(a) * (Z1 - Z0) * 0.5 * r);
        cm.matrixAutoUpdate = false; cm.updateMatrix();
        scene.add(cm);
    }
}
// Pink-and-white rails round the plaza, open where the bridge pads start
function fence() {
    const H = 3.4, post = 0xf4d8ff, glow = 0xff6bd5;
    const gaps = [[STAGES[0].x - STAGES[0].W / 2 - 2, STAGES[0].x + STAGES[0].W / 2 + 2]];
    const run = (x0, z0, x1, z1) => {
        const len = Math.hypot(x1 - x0, z1 - z0), alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        box(alongX ? len : 0.5, 0.5, alongX ? 0.5 : len, cx, H, cz, post, { decor: true });
        box(alongX ? len : 0.3, 0.3, alongX ? 0.3 : len, cx, H * 0.5, cz, post, { decor: true });
        neon(alongX ? len : 0.15, 0.15, alongX ? 0.15 : len, cx, H + 0.33, cz, glow);
        const n = Math.max(1, Math.round(len / 6));
        for (let i = 0; i <= n; i++) box(0.7, H + 0.4, 0.7, x0 + (x1 - x0) * i / n, (H + 0.4) / 2, z0 + (z1 - z0) * i / n, post, { decor: true, cast: true });
        // Invisible wall, much higher than any jump
        const wall = aabb(cx, 40, cz, alongX ? len : 1.4, 80, alongX ? 1.4 : len);
        wall.inv = true;
        solids.add(wall);
    };
    run(-HX, Z0, HX, Z0);
    run(-HX, Z0, -HX, Z1);
    run(HX, Z0, HX, Z1);
    let x = -HX;
    for (const [a, b] of gaps) { run(x, Z1, a, Z1); x = b; }
    run(x, Z1, HX, Z1);
}

// =====================================================================================
// Spawn, the logo and floating math symbols
// =====================================================================================
function buildSpawn() {
    const g = new T.Mesh(new T.CylinderGeometry(10, 10.6, 0.5, 48), mat(0xffffff, { shiny: true }));
    g.position.set(SPAWN.x, 0.25, SPAWN.z); g.receiveShadow = true; scene.add(g);
    const ringM = new T.Mesh(new T.TorusGeometry(10.2, 0.25, 8, 64), mat(0xff6bd5, { neon: true, hdr: 2.2 }));
    ringM.rotation.x = Math.PI / 2; ringM.position.set(SPAWN.x, 0.55, SPAWN.z); scene.add(ringM);
    const inner = new T.Mesh(new T.RingGeometry(5.5, 6, 48), new T.MeshBasicMaterial({ color: new T.Color(0x6fe0ff).multiplyScalar(2), transparent: true, opacity: 0.8, side: T.DoubleSide }));
    inner.rotation.x = -Math.PI / 2; inner.position.set(SPAWN.x, 0.52, SPAWN.z); scene.add(inner);
    tickers.push((dt, t) => { inner.scale.setScalar(1 + Math.sin(t * 2) * 0.08); inner.material.opacity = 0.55 + Math.sin(t * 2) * 0.25; });
    solids.add(aabb(SPAWN.x, 0.25, SPAWN.z, 14, 0.5, 14));
}
function buildLogo() {
    const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 640;
    const x = cv.getContext('2d');
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    const line = (t, y, px, grad, glow) => {
        x.font = FONT(700, px);
        x.shadowColor = glow; x.shadowBlur = px * 0.18;
        x.lineWidth = px * 0.2; x.strokeStyle = '#120c2a'; x.strokeText(t, 1024, y);
        x.shadowBlur = 0;
        const g = x.createLinearGradient(0, y - px / 2, 0, y + px / 2);
        grad.forEach((c, i) => g.addColorStop(i / (grad.length - 1), c));
        x.fillStyle = g; x.fillText(t, 1024, y);
        x.lineWidth = px * 0.035; x.strokeStyle = 'rgba(255,255,255,0.8)'; x.strokeText(t, 1024, y);
    };
    line('MATH', 150, 240, ['#fff6a8', '#ffd028', '#ff9a1e'], '#ffb51c');
    line('GLASS BRIDGE', 440, 270, ['#d8f8ff', '#6fe0ff', '#3a8cff'], '#28c8ff');
    const tex = texFrom(cv);
    const m = new T.Mesh(new T.PlaneGeometry(96, 30), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, side: T.DoubleSide }));
    m.position.set(0, 52, 150); m.rotation.y = Math.PI;
    scene.add(m);
    tickers.push((dt, t) => { m.position.y = 52 + Math.sin(t * 0.8) * 1.2; m.rotation.z = Math.sin(t * 0.5) * 0.015; });
}
const SYMBOLS = ['+', '−', '×', '÷', 'π', '√', '∞', '=', '%', '²', '∑', '7', '3', '9'];
function floatingSymbols() {
    const list = [];
    for (let i = 0; i < 16; i++) {
        const col = ['#ff6bd5', '#6fe0ff', '#ffe14a', '#7dff6b', '#c46bff'][i % 5];
        const sp = billboard([{ t: SYMBOLS[i % SYMBOLS.length], c: col, s: '#16121f', px: 200, glow: col }], 7 + rng() * 6, 256,
            new V3(-150 + rng() * 300, 20 + rng() * 60, -110 + rng() * 380));
        sp.material.opacity = 0.7;
        list.push({ sp, y0: sp.position.y, ph: rng() * 6 });
    }
    tickers.push((dt, t) => { for (const s of list) { s.sp.position.y = s.y0 + Math.sin(t * 0.6 + s.ph) * 2.5; s.sp.material.rotation = Math.sin(t * 0.4 + s.ph) * 0.25; } });
}
// Neon lamp posts along the avenue
function lamps() {
    const orb = new T.SphereGeometry(1, 16, 12);
    for (let z = SPAWN.z + 16; z < 14; z += 16) {
        for (const sx of [-16, 16]) {
            box(0.6, 7, 0.6, sx, 3.5, z, 0x2a2350, { cast: true, shiny: true });
            const o = new T.Mesh(orb, mat(sx < 0 ? 0xff6bd5 : 0x6fe0ff, { neon: true, hdr: 2.4 }));
            o.position.set(sx, 7.6, z); o.scale.setScalar(0.9); scene.add(o);
        }
    }
}

// =====================================================================================
// Booths (candy-striped awnings, like the reference's CRATES / GEARS stalls)
// =====================================================================================
const stripeTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 16;
    const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#ff3a5a'; x.fillRect(i * 16, 0, 16, 16); }
    const t = texFrom(c); t.wrapS = T.RepeatWrapping; t.repeat.set(3, 1);
    return t;
})();
function booth(x, z, rotY, color, title, sub) {
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
    const part = (sx, sy, sz, px, py, pz, c, o) => { const m = new T.Mesh(UNIT, o && o.m ? o.m : mat(c, o)); m.scale.set(sx, sy, sz); m.position.set(px, py, pz); m.castShadow = !(o && o.neon); m.receiveShadow = true; g.add(m); return m; };
    part(14, 3.2, 3, 0, 1.6, -1.5, color, { shiny: true });
    part(14.4, 0.5, 3.4, 0, 3.4, -1.5, 0xffffff);
    part(14, 11, 1, 0, 5.5, 5, color);
    part(1, 11, 1, -6.8, 5.5, 0, 0xffffff); part(1, 11, 1, 6.8, 5.5, 0, 0xffffff);
    const awning = part(15, 0.8, 9, 0, 11.2, 0.6, 0, { m: new T.MeshLambertMaterial({ map: stripeTex }) });
    awning.rotation.x = -0.16;
    part(15.2, 0.3, 0.3, 0, 10.4, -3.9, 0xffd028, { neon: true, hdr: 2 });
    const sign = panel([{ t: title, px: 110, c: '#ffffff' }].concat(sub ? [{ t: sub, px: 56, c: '#ffe14a' }] : []), 13, 3.8, new V3(0, 13.4, -3.6), Math.PI, { bg: '#1c1450', border: '#ffd028' });
    scene.remove(sign); g.add(sign);
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const [cx, cz] = at(0, -1.5), [bx, bz] = at(0, 5);
    const along = Math.abs(c) > 0.5;
    solids.add(aabb(cx, 1.6, cz, along ? 14 : 3, 3.2, along ? 3 : 14));
    solids.add(aabb(bx, 5.5, bz, along ? 14 : 1, 11, along ? 1 : 14));
    // The awning stops the camera (but not you)
    const [ax, az] = at(0, 0.6);
    const aw = aabb(ax, 12, az, along ? 15 : 9, 3.6, along ? 9 : 15);
    aw.camOnly = true;
    solids.add(aw);
    return g;
}
function npc(x, z, rotY, shirt, hat) {
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
    const part = (sx, sy, sz, px, py, pz, c) => { const m = new T.Mesh(UNIT, mat(c)); m.scale.set(sx, sy, sz); m.position.set(px, py, pz); m.castShadow = true; g.add(m); return m; };
    part(1, 2, 1, -0.55, 1, 0, 0x1c1c22); part(1, 2, 1, 0.55, 1, 0, 0x1c1c22);
    part(2.2, 2.2, 1.1, 0, 3.1, 0, shirt);
    part(0.9, 2.1, 0.9, -1.6, 3.1, 0, shirt); part(0.9, 2.1, 0.9, 1.6, 3.1, 0, shirt);
    part(1.6, 1.6, 1.6, 0, 5, 0, 0xffd23a);
    for (const ex of [-0.35, 0.35]) part(0.25, 0.3, 0.1, ex, 5.2, -0.8, 0x16121f);
    part(0.7, 0.12, 0.1, 0, 4.7, -0.8, 0x16121f);
    if (hat) { part(2.2, 0.3, 2.2, 0, 5.9, 0, hat); part(1.5, 1, 1.5, 0, 6.5, 0, hat); }
    tickers.push((dt, t) => { g.position.y = Math.abs(Math.sin(t * 2 + x)) * 0.12; });
    return g;
}

// ----- crates: four big glowing crates in front of the CRATES stall -----
const crateItems = [];
function buildCrates() {
    const s = SPOTS.crates;
    booth(s.x + 10, s.z, Math.PI / 2, 0xe8283c, 'CRATES', 'Pets multiply your Cash!');
    npc(s.x + 13, s.z, Math.PI / 2, 0xe8283c, 0xff3a5a);
    CRATES.forEach((c, i) => {
        const cx = s.x - 4, cz = s.z - 13.5 + i * 9;
        box(7, 0.8, 7, cx, 0.4, cz, 0xffffff, { studs: true });
        const g = new T.Group(); g.position.set(cx, 3.2, cz); scene.add(g);
        const body = new T.Mesh(new RoundedBoxGeometry(4.4, 3.4, 4.4, 3, 0.6), new T.MeshStandardMaterial({ color: c.color, roughness: 0.35, metalness: 0.2 }));
        body.castShadow = true; g.add(body);
        const lid = new T.Mesh(new RoundedBoxGeometry(4.8, 0.9, 4.8, 2, 0.35), new T.MeshStandardMaterial({ color: new T.Color(c.color).multiplyScalar(0.75), roughness: 0.35 }));
        lid.position.y = 1.9; g.add(lid);
        const q = billboard([{ t: '?', c: '#ffffff', s: '#16121f', px: 160 }], 2.4, 256, new V3(0, 0.1, -2.3), g);
        void q;
        const glow = new T.Mesh(new T.TorusGeometry(3.4, 0.16, 8, 40), mat(c.product ? 0xff6bd5 : 0xffd028, { neon: true, hdr: 2.2 }));
        glow.rotation.x = Math.PI / 2; glow.position.set(cx, 0.95, cz); scene.add(glow);
        const price = c.product ? { t: fmt(PRODUCTS[c.product].price) + ' Bux', c: '#ff8fd0', px: 64 } : { t: money(c.cost), c: '#7dff6b', px: 64 };
        bigWords([{ t: c.name, c: '#ffffff', px: 80 }, price], 8.5, new V3(cx, 8.6, cz));
        solids.add(aabb(cx, 3, cz, 4.6, 4, 4.6));
        tickers.push((dt, t) => { g.rotation.y = Math.sin(t * 0.8 + i) * 0.35; g.position.y = 3.2 + Math.sin(t * 2 + i) * 0.2; });
        prompts.push({ pos: new V3(cx - 4, 0, cz), r: 6, label: () => 'Open ' + c.name + (c.product ? '' : ' (' + money(c.cost) + ')'), act: () => actions.hatch(c.id) });
        crateItems.push({ c, g });
    });
}
// A few pets showing off on the counter
function petDisplay() {
    const s = SPOTS.crates;
    ['Pi Panda', 'Galaxy Brain', 'Infinity Kitty'].forEach((id, i) => {
        const p = buildPet(id);
        p.position.set(s.x + 9, 5.6, s.z - 4 + i * 4); p.rotation.y = -Math.PI / 2; scene.add(p);
        tickers.push((dt, t) => { p.position.y = 5.6 + Math.sin(t * 2.4 + i) * 0.3; p.rotation.y = -Math.PI / 2 + Math.sin(t + i) * 0.4; });
    });
}
function buildGears() {
    const s = SPOTS.gears;
    booth(s.x + 10, s.z, Math.PI / 2, 0x2f6bff, 'GEARS', 'Speed Coil · Gravity Coil');
    npc(s.x + 13, s.z, Math.PI / 2, 0x2f6bff, 0x1c1450);
    // Coils on display
    const coil = new T.TorusKnotGeometry(0.9, 0.22, 64, 8, 2, 7);
    [[0xffd028, -3.5], [0x6fe0ff, 3.5]].forEach(([c, dz], i) => {
        const m = new T.Mesh(coil, mat(c, { neon: true, hdr: 1.7 }));
        m.position.set(s.x + 9, 5, s.z + dz); scene.add(m);
        tickers.push((dt, t) => { m.rotation.y = t * 1.5 + i; m.position.y = 5 + Math.sin(t * 2 + i) * 0.3; });
    });
    prompts.push({ pos: new V3(s.x, 0, s.z), r: 9, label: () => 'Gear Shop', act: () => actions.openPanel('gears') });
}
function buildTrails() {
    const s = SPOTS.trails;
    booth(s.x - 10, s.z, -Math.PI / 2, 0x8a3cff, 'TRAILS', 'x1.1 · x1.25 · x1.5 Cash');
    npc(s.x - 13, s.z, -Math.PI / 2, 0x8a3cff, 0xffd028);
    prompts.push({ pos: new V3(s.x, 0, s.z), r: 9, label: () => 'Trail Shop', act: () => actions.openPanel('trails') });
}

// =====================================================================================
// Lucky Wheel
// =====================================================================================
let wheel = null, wheelLabel = null;
function wheelCanvas() {
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const x = c.getContext('2d');
    const n = WHEEL.length, R = 500;
    x.translate(512, 512);
    for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + (i - 0.5) * (Math.PI * 2 / n), a1 = a0 + Math.PI * 2 / n;
        x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R, a0, a1); x.closePath();
        x.fillStyle = WHEEL[i].color; x.fill();
        x.lineWidth = 10; x.strokeStyle = '#ffffff'; x.stroke();
        x.save(); x.rotate((a0 + a1) / 2);
        x.font = FONT(700, 54); x.textAlign = 'right'; x.textBaseline = 'middle'; x.lineJoin = 'round';
        x.lineWidth = 10; x.strokeStyle = '#16121f'; x.strokeText(WHEEL[i].label, R - 34, 0);
        x.fillStyle = '#ffffff'; x.fillText(WHEEL[i].label, R - 34, 0);
        x.restore();
    }
    x.beginPath(); x.arc(0, 0, R, 0, Math.PI * 2); x.lineWidth = 22; x.strokeStyle = '#ffd028'; x.stroke();
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; x.fillStyle = i % 2 ? '#ffffff' : '#ff6bd5'; x.beginPath(); x.arc(Math.cos(a) * R, Math.sin(a) * R, 12, 0, Math.PI * 2); x.fill(); }
    x.beginPath(); x.arc(0, 0, 80, 0, Math.PI * 2); x.fillStyle = '#16121f'; x.fill();
    x.font = FONT(700, 52); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffe14a'; x.fillText('SPIN', 0, 2);
    return c;
}
function buildWheel() {
    const s = SPOTS.wheel;
    const g = new T.Group(); g.position.set(s.x - 6, 0, s.z); g.rotation.y = Math.PI / 2; scene.add(g);
    for (const sx of [-4, 4]) { const leg = new T.Mesh(UNIT, mat(0x2a2350, { shiny: true })); leg.scale.set(1, 16, 1); leg.position.set(sx, 8, -0.8); leg.rotation.z = sx > 0 ? 0.18 : -0.18; leg.castShadow = true; g.add(leg); }
    const disc = new T.Mesh(new T.CircleGeometry(8, 64), new T.MeshBasicMaterial({ map: texFrom(wheelCanvas()), toneMapped: false }));
    disc.position.set(0, 15, 0.2); g.add(disc);
    const backM = new T.Mesh(new T.CylinderGeometry(8.4, 8.4, 0.8, 64), mat(0x1c1450, { shiny: true }));
    backM.rotation.x = Math.PI / 2; backM.position.set(0, 15, -0.3); g.add(backM);
    const rimM = new T.Mesh(new T.TorusGeometry(8.3, 0.25, 8, 80), mat(0xffd028, { neon: true, hdr: 2 }));
    rimM.position.set(0, 15, 0.25); g.add(rimM);
    const pointer = new T.Mesh(new T.ConeGeometry(0.9, 2.2, 3), mat(0xff3a5a, { neon: true, hdr: 1.6 }));
    pointer.rotation.z = Math.PI; pointer.position.set(0, 23.6, 0.5); g.add(pointer);
    solids.add(aabb(s.x - 6, 8, s.z, 2.5, 16, 10));
    wheel = { disc, rot: 0, target: 0, spinning: false };
    wheelLabel = bigWords([{ t: 'LUCKY WHEEL', c: '#ffe14a', px: 90 }, { t: 'FREE SPIN!', c: '#7dff6b', px: 64 }], 12, new V3(s.x - 6, 26.5, s.z));
    prompts.push({ pos: new V3(s.x, 0, s.z), r: 9, label: () => 'Lucky Wheel', act: () => actions.openPanel('wheel') });
}
// Spin the world wheel so segment i ends under the pointer
export function spinWorldWheel(i) {
    if (!wheel) return;
    const seg = Math.PI * 2 / WHEEL.length;
    const base = wheel.rot - (wheel.rot % (Math.PI * 2));
    wheel.target = base + Math.PI * 2 * 5 + i * seg;
    wheel.from = wheel.rot; wheel.t = 0; wheel.spinning = true;
}

// =====================================================================================
// Rainbow Stairs: a spiral of floating rainbow steps around a pink truss, a chest on top
// =====================================================================================
let stairsChestLabel = null, spaceChestLabel = null;
function truss(x, z, h) {
    const c = 0xe8a8ff;
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) box(0.5, h, 0.5, x + dx, h / 2, z + dz, c, { decor: true, cast: true });
    for (let y = 2; y < h; y += 4) {
        box(3.7, 0.35, 0.35, x, y, z - 1.6, c, { decor: true }); box(3.7, 0.35, 0.35, x, y, z + 1.6, c, { decor: true });
        box(0.35, 0.35, 3.7, x - 1.6, y, z, c, { decor: true }); box(0.35, 0.35, 3.7, x + 1.6, y, z, c, { decor: true });
    }
    solids.add(aabb(x, h / 2, z, 3.6, h, 3.6));
}
function smallChest(x, y, z, scale) {
    const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(scale || 1); scene.add(g);
    const wood = mat(0x8a4a22), gold = new T.MeshStandardMaterial({ color: 0xffc83a, roughness: 0.25, metalness: 0.85, emissive: 0x6a4000, emissiveIntensity: 0.4 });
    const b = new T.Mesh(new RoundedBoxGeometry(3.6, 2.2, 2.4, 2, 0.3), wood); b.position.y = 1.1; b.castShadow = true; g.add(b);
    const l = new T.Mesh(new RoundedBoxGeometry(3.7, 1, 2.5, 2, 0.35), wood); l.position.y = 2.6; g.add(l);
    for (const sx of [-1.3, 1.3]) { const band = new T.Mesh(new T.BoxGeometry(0.4, 3.3, 2.55), gold); band.position.set(sx, 1.6, 0); g.add(band); }
    const lk = new T.Mesh(new T.BoxGeometry(0.6, 0.7, 0.2), gold); lk.position.set(0, 2.1, -1.3); g.add(lk);
    const glow = new T.Mesh(new T.CylinderGeometry(2.6, 3, 0.15, 32), mat(0xffd028, { neon: true, hdr: 1.6 })); glow.position.y = 0.08; g.add(glow);
    tickers.push((dt, t) => { g.rotation.y = Math.sin(t * 0.7 + x) * 0.25; });
    return g;
}
function buildStairs() {
    const s = SPOTS.stairs, n = STAIRS.steps;
    truss(s.x, s.z, n * STAIRS.rise + 2);
    const RAIN = [0xff3a3a, 0xff9a1e, 0xffe14a, 0x46ec50, 0x28c8ff, 0x3a62ff, 0x8a3cff, 0xff4ad0];
    for (let i = 0; i < n; i++) {
        const a = i * 0.56, y = (i + 1) * STAIRS.rise;
        const x = s.x + Math.cos(a) * STAIRS.radius * 0.95, z = s.z + Math.sin(a) * STAIRS.radius * 0.95;
        box(5, 0.9, 4.6, x, y - 0.45, z, RAIN[i % RAIN.length], { cast: true, shiny: true });
        neon(5.1, 0.12, 0.2, x, y + 0.02, z - 2.3, 0xffffff, 1.4);
    }
    const top = (n + 1) * STAIRS.rise;
    box(10, 1, 10, s.x, top - 0.5, s.z, 0xffffff, { studs: true, cast: true });
    for (const [dx, dz, w, d] of [[0, -5, 10, 0.3], [0, 5, 10, 0.3], [-5, 0, 0.3, 10], [5, 0, 0.3, 10]]) neon(w, 0.3, d, s.x + dx, top + 0.1, s.z + dz, 0xff6bd5);
    smallChest(s.x, top, s.z, 1.3);
    stairsChestLabel = bigWords([{ t: money(CHESTS.stairs.cash), c: '#7dff6b', px: 80 }, { t: 'READY TO CLAIM!', c: '#ffe14a', px: 50 }], 8, new V3(s.x, top + 7.5, s.z));
    prompts.push({ pos: new V3(s.x, top, s.z), r: 7, label: () => 'Claim Rainbow Stairs Chest', act: () => actions.chest('stairs') });
    bigWords([{ t: 'RAINBOW STAIRS', c: '#ffffff', px: 100, glow: '#ff6bd5' }], 15, new V3(s.x, 12, s.z - 14));
}
function buildSpaceChest() {
    const s = SPOTS.spaceChest;
    box(8, 0.8, 8, s.x, 0.4, s.z, 0xffffff, { studs: true });
    smallChest(s.x, 0.8, s.z, 1.1);
    solids.add(aabb(s.x, 2, s.z, 4.2, 4, 3));
    spaceChestLabel = bigWords([{ t: money(CHESTS.space.cash), c: '#7dff6b', px: 80 }, { t: 'READY TO CLAIM!', c: '#ffe14a', px: 50 }], 7, new V3(s.x, 7.5, s.z));
    prompts.push({ pos: new V3(s.x, 0, s.z), r: 7, label: () => 'Claim Space Chest', act: () => actions.chest('space') });
}

// =====================================================================================
// Continue portal: a glowing ring that takes you to your checkpoint
// =====================================================================================
let portalLabel = null;
function buildPortal() {
    const p = SPOTS.portal;
    const g = new T.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = Math.PI / 2; scene.add(g);
    const ringM = new T.Mesh(new T.TorusGeometry(6, 0.8, 12, 48), mat(0x7dff6b, { neon: true, hdr: 1.25 }));
    ringM.position.y = 7; g.add(ringM);
    const swirlTex = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const x = c.getContext('2d'); x.translate(128, 128);
        for (let i = 0; i < 6; i++) {
            x.rotate(Math.PI / 3);
            const gr = x.createLinearGradient(0, 0, 120, 0); gr.addColorStop(0, 'rgba(180,255,170,0.9)'); gr.addColorStop(1, 'rgba(40,200,255,0)');
            x.fillStyle = gr; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(60, -50, 125, 0); x.quadraticCurveTo(60, -20, 0, 0); x.fill();
        }
        return texFrom(c);
    })();
    const swirl = new T.Mesh(new T.CircleGeometry(5.4, 40), new T.MeshBasicMaterial({ map: swirlTex, transparent: true, depthWrite: false, side: T.DoubleSide, opacity: 0.85 }));
    swirl.position.y = 7; g.add(swirl);
    box(5, 1, 5, p.x, 0.5, p.z, 0x2a2350, { decor: true, shiny: true });
    tickers.push((dt, t) => { swirl.rotation.z -= dt * 1.6; ringM.rotation.z = Math.sin(t) * 0.1; });
    portalLabel = bigWords([{ t: '▶ CONTINUE', c: '#7dff6b', px: 90 }, { t: 'Stage 1', c: '#ffffff', px: 56 }], 12, new V3(p.x, 16, p.z));
    prompts.push({ pos: new V3(p.x, 0, p.z), r: 8, label: () => 'Continue from Stage ' + (Math.min(STAGE_COUNT - 1, S.stage || 0) + 1), act: () => actions.continueRun() });
}

// =====================================================================================
// Leaderboards: Most Wins, Most Cash, Most Answers
// =====================================================================================
const boards = {};
const BOARD_LOOK = {
    stage: { title: 'Top Stage', col: '#6fe0ff', rim: 0x28c8ff, unit: 'STAGE' },
    wins: { title: 'Top Wins', col: '#ffd028', rim: 0xffb51c, unit: 'WINS' },
    cash: { title: 'Top Cash', col: '#7dff6b', rim: 0x46ec50, unit: 'CASH' },
};
function leaderboard(kind, x, z, rotY) {
    const L = BOARD_LOOK[kind];
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
    for (const sx of [-5.5, 5.5]) { const p = new T.Mesh(UNIT, mat(0x2a2350, { shiny: true })); p.scale.set(1, 6, 1); p.position.set(sx, 3, -0.4); p.castShadow = true; g.add(p); }
    const rimM = new T.Mesh(UNIT, mat(L.rim, { neon: true, hdr: 1.2 })); rimM.scale.set(14, 18, 0.6); rimM.position.set(0, 15, -0.5); g.add(rimM);
    const back = new T.Mesh(UNIT, mat(0x161238)); back.scale.set(13, 17, 0.8); back.position.set(0, 15, -0.2); g.add(back);
    const cv = document.createElement('canvas'); cv.width = 384; cv.height = 512;
    const tex = texFrom(cv);
    const scr = new T.Mesh(new T.PlaneGeometry(12.4, 16.2), new T.MeshBasicMaterial({ map: tex, toneMapped: false }));
    scr.position.set(0, 15, 0.25); g.add(scr);
    solids.add(aabb(x, 3, z, 13, 6, 2));
    boards[kind] = { cv, tex, rows: [], kind };
}
let boardsAt = performance.now();
// 'Stage 17' or '2R · 12' (each rebirth counts as all the stages)
const stageLabel = (v) => (v >= STAGE_COUNT ? Math.floor(v / STAGE_COUNT) + 'R · ' + (v % STAGE_COUNT) : String(v));
function drawBoard(b) {
    const L = BOARD_LOOK[b.kind];
    const x = b.cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#221a52'); g.addColorStop(1, '#120c30');
    x.fillStyle = g; x.fillRect(0, 0, 384, 512);
    x.fillStyle = L.col; x.fillRect(0, 0, 384, 56);
    x.font = FONT(700, 34); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6; x.strokeStyle = '#16121f'; x.strokeText(L.title, 192, 30); x.fillStyle = '#ffffff'; x.fillText(L.title, 192, 30);
    x.font = FONT(700, 18); x.fillStyle = '#9d97d0';
    x.textAlign = 'left'; x.fillText('#', 14, 74); x.fillText('NAME', 50, 74);
    x.textAlign = 'right'; x.fillText(L.unit, 372, 74);
    if (!b.rows.length) { x.textAlign = 'center'; x.fillStyle = '#cfc4f2'; x.font = FONT(700, 24); x.fillText('Be the first!', 192, 250); }
    x.font = FONT(700, 23);
    b.rows.forEach((r, i) => {
        const y = 104 + i * 38;
        x.fillStyle = r.you ? 'rgba(70,236,80,0.28)' : i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.09)';
        x.fillRect(6, y - 17, 372, 34);
        x.fillStyle = i === 0 ? '#ffd028' : i === 1 ? '#dfe4f0' : i === 2 ? '#e0925a' : '#ffffff';
        x.textAlign = 'left'; x.fillText(String(i + 1), 14, y);
        x.fillStyle = r.you ? '#7dff6b' : '#ffffff'; x.fillText(r.n.slice(0, 14), 50, y);
        x.textAlign = 'right'; x.fillStyle = L.col; x.fillText(b.kind === 'cash' ? '$' + fmt(r.v) : b.kind === 'stage' ? stageLabel(r.v) : fmt(r.v), 372, y);
    });
    const left = Math.max(0, Math.ceil(10 - (performance.now() - boardsAt) / 1000));
    x.font = 'italic ' + FONT(700, 18); x.textAlign = 'center'; x.fillStyle = '#ffd028';
    x.fillText('Refreshing in ' + left + 's', 192, 494);
    b.tex.needsUpdate = true;
}
export function renderBoards(msg) {
    if (!boards.wins || !msg) return;
    boardsAt = performance.now();
    for (const kind of Object.keys(BOARD_LOOK)) {
        const b = boards[kind];
        b.rows = (msg[kind] || []).map((r) => ({ n: r.n, v: r.v, you: r.n === S.name }));
        drawBoard(b);
    }
}
setInterval(() => { for (const k of Object.keys(boards)) drawBoard(boards[k]); }, 1000);

// =====================================================================================
// Live state: bridge locks, chest timers, the wheel
// =====================================================================================
let lockKey = '', chestKey = '';
const playStart = { at: performance.now(), base: 0 };
export function syncPlaytime() { playStart.at = performance.now(); playStart.base = S.playtime || 0; }
export const playtimeNow = () => playStart.base + (performance.now() - playStart.at) / 1000;
export function refreshWorld() {
    const key = String(S.stage || 0);
    if (key !== lockKey && portalLabel) {
        lockKey = key;
        const k = Math.min(STAGE_COUNT - 1, S.stage || 0), w = worldOf(k);
        portalLabel.userData.set([{ t: '▶ CONTINUE', c: '#7dff6b', s: '#16121f', px: 90 }, { t: 'Stage ' + (k + 1) + '  ' + w.icon + ' ' + w.name, c: w.css, s: '#16121f', px: 56 }]);
    }
    const now = net.now();
    const left = (id) => Math.max(0, ((S.chestAt && S.chestAt[id]) || 0) - now) / 1000;
    const wheelLeft = Math.max(0, (S.wheelAt || 0) - playtimeNow());
    const ck = Math.ceil(left('stairs')) + '|' + Math.ceil(left('space')) + '|' + Math.ceil(wheelLeft) + '|' + (S.spins || 0) + '|' + S.wins;
    if (ck === chestKey) return;
    chestKey = ck;
    const lbl = (id) => { const l = left(id); return [{ t: money(chestCash(id, S)), c: '#7dff6b', s: '#16121f', px: 80 }, l > 0 ? { t: 'WAIT ' + clock(l), c: '#ff6b8a', s: '#16121f', px: 50 } : { t: 'READY TO CLAIM!', c: '#ffe14a', s: '#16121f', px: 50 }]; };
    if (stairsChestLabel) stairsChestLabel.userData.set(lbl('stairs'));
    if (spaceChestLabel) spaceChestLabel.userData.set(lbl('space'));
    if (wheelLabel) wheelLabel.userData.set([{ t: 'LUCKY WHEEL', c: '#ffe14a', s: '#16121f', px: 90 },
        wheelLeft <= 0 || S.spins > 0 ? { t: 'FREE SPIN!', c: '#7dff6b', s: '#16121f', px: 64 } : { t: 'Free spin in ' + clock(wheelLeft), c: '#ffffff', s: '#16121f', px: 56 }]);
}
export function updateWorld(dt, t) {
    if (wheel && wheel.spinning) {
        wheel.t += dt / 4;
        const k = Math.min(1, wheel.t), e = 1 - Math.pow(1 - k, 4);
        wheel.rot = wheel.from + (wheel.target - wheel.from) * e;
        if (k >= 1) wheel.spinning = false;
        wheel.disc.rotation.z = wheel.rot;
    }
}

// Where the Teleport menu sends you
export function teleportSpot(id) {
    if (/^s\d+$/.test(id)) { const p = checkpointPos(+id.slice(1)); return new V3(p.x, p.y, p.z); }
    if (id === 'crates') return new V3(SPOTS.crates.x - 12, 0.6, SPOTS.crates.z);
    if (id === 'gears') return new V3(SPOTS.gears.x - 8, 0.6, SPOTS.gears.z);
    if (id === 'stairs') return new V3(SPOTS.stairs.x - 12, 0.6, SPOTS.stairs.z - 4);
    return SPAWN.clone();
}

export function buildWorld() {
    tileFloor();
    fence();
    buildSpawn();
    buildLogo();
    floatingSymbols();
    buildCrates();
    petDisplay();
    buildGears();
    buildTrails();
    buildWheel();
    buildStairs();
    buildSpaceChest();
    buildPortal();
    const bz = SPOTS.boards.z;
    for (const [i, kind] of ['stage', 'wins', 'cash'].entries()) leaderboard(kind, SPOTS.boards.x - 16 + i * 16, bz, 0);
    bigWords([{ t: 'LEADERBOARDS', c: '#ffe14a', px: 100, glow: '#ffb51c' }], 20, new V3(SPOTS.boards.x, 27, bz));
    for (const k of Object.keys(boards)) drawBoard(boards[k]);
    refreshWorld();
    void triggers; void mesh; void CYL; void lamps;
}
