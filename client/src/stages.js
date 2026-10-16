import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { T, V3, scene, solids, triggers, texFrom, FONT, mat, aabb, billboard, Batch, UNIT } from './engine.js';
import { actions, net } from './state.js';
import { sparkleBurst, ring } from './fx.js';
import {
    STAGES, ISLANDS, WORLDS, MODS, BR, CFG, STAGE_COUNT, STAGES_PER_WORLD, rowTop, rowZ, paneX, stageQuestions, shuffleShift, stageAtZ, hasMod, modLabel,
    rngFrom, money, fmt,
} from '../../shared/config.js';

// The journey: every stage of glass starts on a checkpoint island. Collision for every stage
// is built once (it is just boxes in a z index); the meshes are streamed: only the stages around
// the player exist on the GPU, and each one is a handful of draw calls (one instanced mesh for all
// its panes, one for its question signs, one merged mesh per material for the rest).

const COLS = 10;
// Cell width of the number atlas: smaller on the 4-pane stages (more cells, same memory)
const cellW = (st) => (st.choices >= 4 ? 128 : 160);
const SIGN_W = 512, SIGN_H = 120;
const STATE = { idle: 0, right: 1, wrong: 2, path: 3, dim: 4, crack: 5 };

// ----- glass shader -----
const glassVert = `
    attribute vec3 iColor; attribute float iCell; attribute float iState; attribute float iFlash;
    varying vec3 vColor; varying vec2 vTop; varying vec3 vN; varying vec3 vW; varying float vCell; varying float vState; varying float vFlash; varying float vFogDepth;
    void main() {
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vTop = vec2(0.5 - position.x, 0.5 + position.z);
        vColor = iColor; vCell = iCell; vState = iState; vFlash = iFlash;
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
    }`;
const glassFrag = `
    uniform sampler2D atlas; uniform vec2 grid; uniform vec2 size; uniform float time;
    uniform float dark; uniform float revealZ; uniform float ghost; uniform float crumble;
    uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
    varying vec3 vColor; varying vec2 vTop; varying vec3 vN; varying vec3 vW; varying float vCell; varying float vState; varying float vFlash; varying float vFogDepth;
    void main() {
        vec3 V = normalize(cameraPosition - vW);
        vec3 N = normalize(vN);
        float fres = pow(1.0 - clamp(abs(dot(V, N)), 0.0, 1.0), 2.5);
        float age = max(0.0, time - vFlash);
        float flash = exp(-age * 3.5);
        vec3 base = vColor;
        float darkK = dark > 0.5 ? smoothstep(revealZ, revealZ + 7.0, vW.z) : 0.0;
        float ghostK = 0.0;
        if (ghost > 0.5) ghostK = 1.0 - pow(max(0.0, sin(time * 1.25 - vW.z * 0.012)), 8.0);
        vec3 col; float a;
        if (N.y > 0.5) {
            vec2 e = min(vTop, 1.0 - vTop);
            float edgeD = min(e.x * size.x, e.y * size.y);
            float border = smoothstep(0.42, 0.05, edgeD) * (1.0 - darkK * 0.85);
            float inner = smoothstep(2.6, 0.0, edgeD);
            float sp = fract(vTop.x * 0.55 + vTop.y * 0.45 - time * 0.1 + vCell * 0.173);
            float sheen = smoothstep(0.05, 0.0, abs(sp - 0.5)) * 0.32 + smoothstep(0.22, 0.0, abs(sp - 0.5)) * 0.07;
            vec2 fg = abs(fract(vTop * size * 0.5) - 0.5);
            float frost = smoothstep(0.47, 0.5, max(fg.x, fg.y)) * 0.06;
            col = base * (0.36 + 0.3 * vTop.y) + vec3(sheen + frost);
            col += base * inner * 0.3;
            col += (base * 1.45 + 0.18) * border;
            a = 0.42 + inner * 0.25 + border * 0.9 + sheen * 0.35 + fres * 0.3;
            float cx = mod(vCell, grid.x), cy = floor(vCell / grid.x);
            vec2 uv = vec2((cx + vTop.x) / grid.x, 1.0 - (cy + 1.0 - vTop.y) / grid.y);
            vec4 num = texture2D(atlas, uv);
            if ((vState > 0.5 && vState < 1.5) || vState > 4.5) {
                col = mix(col, vec3(0.25, 1.0, 0.4), 0.3) + vec3(0.2, 1.0, 0.35) * (border * 0.8 + inner * 0.15 + flash * 0.6);
                float lum = dot(num.rgb, vec3(0.333));
                num.rgb = mix(num.rgb, vec3(0.55, 1.0, 0.6), 0.6 * smoothstep(0.4, 0.8, lum));
            } else if (vState > 1.5 && vState < 2.5) {
                col = mix(col, vec3(0.4, 0.04, 0.08), 0.7) + vec3(1.0, 0.12, 0.15) * border * 0.4;
                a *= 0.55; num.a *= 0.35;
            } else if (vState > 3.5) {
                col = mix(col, vec3(0.06, 0.05, 0.14), 0.72);
                a *= 0.7; num.a *= 0.45;
            } else if (vState > 2.5) {
                float p = 0.6 + 0.4 * sin(time * 6.0 + vCell);
                col = mix(col, vec3(1.0, 0.78, 0.15), 0.5) + vec3(1.5, 1.1, 0.2) * smoothstep(1.8, 0.0, edgeD) * p;
                a = max(a, 0.82);
            }
            if (vState > 4.5) {
                // Crumbling: cracks spread out from the middle, then it breaks
                float k = clamp(age / crumble, 0.0, 1.0);
                vec2 c = vTop - 0.5; float ang = atan(c.y, c.x), rad = length(c);
                float rays = smoothstep(0.93, 1.0, abs(sin(ang * 6.0 + 1.3))) * step(rad, k * 0.75);
                float rings = smoothstep(0.015, 0.0, abs(rad - k * 0.42));
                col = mix(col, vec3(1.0), clamp(rays + rings, 0.0, 1.0) * 0.85);
                col = mix(col, vec3(0.75, 0.12, 0.1), k * 0.4);
            }
            num.a *= (1.0 - darkK) * (1.0 - ghostK * 0.94);
            col = mix(col, base * 0.07, darkK * 0.9);
            a = mix(a, 0.3, max(darkK * 0.8, ghostK * 0.55));
            col += vec3(flash * 0.45);
            col = mix(col, min(num.rgb, vec3(0.92)), num.a);
            a = max(a, num.a);
        } else if (N.y < -0.5) {
            col = base * 0.45; a = 0.3;
        } else {
            col = base * (1.1 - darkK * 0.8) + vec3(0.12); a = 0.75;
            if (vState > 1.5 && vState < 2.5) col = vec3(0.5, 0.05, 0.1);
        }
        float fogF = smoothstep(fogNear, fogFar, vFogDepth);
        col = mix(col, fogColor, fogF);
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * (1.0 - fogF * 0.6));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    }`;
const signVert = `
    attribute float iCell; attribute float iRow;
    varying vec2 vUv; varying float vCell; varying float vRow; varying float vFogDepth;
    void main() {
        vUv = uv; vCell = iCell; vRow = iRow;
        vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
    }`;
const signFrag = `
    uniform sampler2D atlas; uniform vec2 grid; uniform float myRow; uniform float time; uniform float hide;
    uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
    varying vec2 vUv; varying float vCell; varying float vRow; varying float vFogDepth;
    void main() {
        float cx = mod(vCell, grid.x), cy = floor(vCell / grid.x);
        vec4 c = texture2D(atlas, vec2((cx + vUv.x) / grid.x, 1.0 - (cy + 1.0 - vUv.y) / grid.y));
        float k = 1.0 - hide;
        if (myRow >= 0.0) {
            if (vRow < myRow) k = 0.0;
            else if (vRow < myRow + 0.5) { c.rgb *= 1.08 + 0.08 * sin(time * 5.0); }
            else k *= 1.0 - clamp((vRow - myRow - 4.0) / 4.0, 0.0, 0.85);
        }
        float fogF = smoothstep(fogNear, fogFar, vFogDepth);
        float a = c.a * k * (1.0 - fogF);
        if (a < 0.01) discard;
        gl_FragColor = vec4(mix(c.rgb, fogColor, fogF * 0.7), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    }`;
const gateVert = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const gateFrag = `uniform vec3 color; uniform float time; uniform float open; varying vec2 vUv;
    void main() {
        float stripes = smoothstep(0.42, 0.5, abs(fract(vUv.x * 10.0 - vUv.y * 3.0 + time * 0.6) - 0.5));
        float scan = smoothstep(0.46, 0.5, abs(fract(vUv.y * 12.0 - time * 0.8) - 0.5));
        float edge = smoothstep(0.08, 0.0, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
        float a = (0.12 + stripes * 0.14 + scan * 0.08 + edge * 0.55) * (1.0 - open);
        gl_FragColor = vec4(color * (0.9 + edge * 0.6), a);
        #include <colorspace_fragment>
    }`;

// ----- atlases -----
function numberAtlas(V) {
    const st = V.st, n = st.rows * st.choices;
    const CELL_W = cellW(st), cellH = Math.round(CELL_W * BR.depth / st.pw);
    const rowsN = Math.ceil(n / COLS);
    if (!V.ncv) { V.ncv = document.createElement('canvas'); V.ncv.width = COLS * CELL_W; V.ncv.height = rowsN * cellH; }
    const x = V.ncv.getContext('2d');
    x.clearRect(0, 0, V.ncv.width, V.ncv.height);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    for (let r = 0; r < st.rows; r++) for (let s = 0; s < st.choices; s++) {
        const i = r * st.choices + s, cx = (i % COLS) * CELL_W, cy = Math.floor(i / COLS) * cellH;
        const t = String(V.qs[r].options[s]);
        let px = cellH * (t.length > 3 ? 0.46 : 0.62);
        x.font = FONT(700, px);
        while (x.measureText(t).width > CELL_W * 0.86 && px > 12) { px -= 2; x.font = FONT(700, px); }
        const mx = cx + CELL_W / 2, my = cy + cellH * 0.54;
        x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = px * 0.18; x.shadowOffsetY = px * 0.07;
        x.lineWidth = px * 0.26; x.strokeStyle = '#0c0820'; x.strokeText(t, mx, my);
        x.shadowBlur = 0; x.shadowOffsetY = 0;
        x.fillStyle = '#ffffff'; x.fillText(t, mx, my);
    }
    if (!V.ntex) { V.ntex = texFrom(V.ncv); V.ntex.anisotropy = 8; } else V.ntex.needsUpdate = true;
    return { tex: V.ntex, grid: new T.Vector2(COLS, rowsN) };
}
function signAtlas(V) {
    const st = V.st, cols = 2, rowsN = Math.ceil(st.rows / cols), wd = WORLDS[st.w];
    if (!V.scv) { V.scv = document.createElement('canvas'); V.scv.width = cols * SIGN_W; V.scv.height = rowsN * SIGN_H; }
    const x = V.scv.getContext('2d');
    x.clearRect(0, 0, V.scv.width, V.scv.height);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    for (let r = 0; r < st.rows; r++) {
        const cx = (r % cols) * SIGN_W, cy = Math.floor(r / cols) * SIGN_H;
        x.fillStyle = wd.css;
        x.beginPath(); x.roundRect(cx + 6, cy + 6, SIGN_W - 12, SIGN_H - 12, 26); x.fill();
        x.fillStyle = 'rgba(16,10,44,0.93)';
        x.beginPath(); x.roundRect(cx + 12, cy + 12, SIGN_W - 24, SIGN_H - 24, 21); x.fill();
        x.fillStyle = wd.css;
        x.beginPath(); x.roundRect(cx + 20, cy + 26, 66, SIGN_H - 52, 14); x.fill();
        x.font = FONT(700, 34); x.fillStyle = '#120c2a'; x.fillText(String(r + 1), cx + 53, cy + SIGN_H / 2 + 2);
        const t = V.qs[r].text;
        let px = 62;
        x.font = FONT(700, px);
        while (x.measureText(t).width > SIGN_W - 130 && px > 18) { px -= 2; x.font = FONT(700, px); }
        x.lineWidth = px * 0.18; x.strokeStyle = '#120c2a'; x.strokeText(t, cx + SIGN_W / 2 + 34, cy + SIGN_H / 2 + 3);
        x.fillStyle = '#ffffff'; x.fillText(t, cx + SIGN_W / 2 + 34, cy + SIGN_H / 2 + 3);
    }
    if (!V.stex) { V.stex = texFrom(V.scv); V.stex.anisotropy = 4; } else V.stex.needsUpdate = true;
    return { tex: V.stex, grid: new T.Vector2(cols, rowsN) };
}

// ----- shards (one instanced mesh for everything) -----
const SHARD_N = 220;
const SHARD_GEO = (() => { const g = new T.CylinderGeometry(0.9, 0.9, 0.12, 3); g.scale(1, 1, 0.7); return g; })();
const shardMat = new T.MeshPhongMaterial({ color: 0xffffff, shininess: 120, specular: 0xffffff, transparent: true, opacity: 0.8, emissive: 0x1a1438 });
const shardMesh = new T.InstancedMesh(SHARD_GEO, shardMat, SHARD_N);
shardMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
shardMesh.frustumCulled = false;
const shards = [];
const sm4 = new T.Matrix4(), sq = new T.Quaternion(), se = new T.Euler(), ss = new V3(), sc = new T.Color(), sp3 = new V3();
for (let i = 0; i < SHARD_N; i++) {
    shards.push({ p: new V3(), v: new V3(), r: new V3(), w: new V3(), s: 0, t: 0 });
    sm4.makeScale(0, 0, 0); shardMesh.setMatrixAt(i, sm4);
    shardMesh.setColorAt(i, sc.setHex(0xffffff));
}
scene.add(shardMesh);
let shardI = 0;
function spawnShards(cx, cy, cz, w, d, color, n) {
    for (let k = 0; k < n; k++) {
        const i = shardI++ % SHARD_N, s = shards[i];
        s.p.set(cx + (Math.random() - 0.5) * w * 0.9, cy, cz + (Math.random() - 0.5) * d * 0.9);
        s.v.set((s.p.x - cx) * 1.4 + (Math.random() - 0.5) * 4, -2 + Math.random() * 7, (s.p.z - cz) * 1.4 + (Math.random() - 0.5) * 4);
        s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        s.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
        s.s = 0.5 + Math.random() * 1.1;
        s.t = 2.2 + Math.random() * 0.8;
        shardMesh.setColorAt(i, sc.setHex(Math.random() < 0.3 ? 0xffffff : color).multiplyScalar(1.2));
    }
    shardMesh.instanceColor.needsUpdate = true;
}
function updateShards(dt) {
    let any = false;
    for (let i = 0; i < SHARD_N; i++) {
        const s = shards[i];
        if (s.t <= 0) continue;
        any = true;
        s.t -= dt;
        s.v.y -= 55 * dt;
        s.p.addScaledVector(s.v, dt);
        s.r.addScaledVector(s.w, dt);
        const k = s.t <= 0 ? 0 : s.s * Math.min(1, s.t * 1.5);
        sm4.compose(s.p, sq.setFromEuler(se.set(s.r.x, s.r.y, s.r.z)), ss.set(k, k, k));
        shardMesh.setMatrixAt(i, sm4);
    }
    if (any) shardMesh.instanceMatrix.needsUpdate = true;
}

// =====================================================================================
// Collision for every stage (built once at boot)
// =====================================================================================
export const paneSolids = [];   // [k][r * choices + s]
const gates = [];               // [k] gate solid
function islandWalls(isl, inX, inW, outX, outW) {
    const L = isl.x - isl.w / 2, R = isl.x + isl.w / 2, top = isl.top;
    const wall = (x, z, sx, sz) => { const w = aabb(x, top + 6, z, sx, 12, sz); w.rail = true; solids.add(w); };
    wall(L - 0.8, isl.z0 + isl.d / 2, 1.6, isl.d);
    wall(R + 0.8, isl.z0 + isl.d / 2, 1.6, isl.d);
    // Front and back edges, open where the bridges meet the island
    const edge = (z, ox, ow) => {
        const a = ox - ow / 2 - 1.2, b = ox + ow / 2 + 1.2;
        if (a > L) wall((L + a) / 2, z, a - L, 1.6);
        if (b < R) wall((b + R) / 2, z, R - b, 1.6);
        if (ow <= 0) wall(isl.x, z, isl.w, 1.6);
    };
    edge(isl.z0 - 0.8, inX, inW);
    edge(isl.z0 + isl.d + 0.8, outX, outW);
}
export function buildStageSolids() {
    // Stage 1's pad in front of the lobby
    const s0 = STAGES[0], PW = s0.W + 4;
    solids.add(aabb(s0.x, -1, (BR.padZ0 + s0.z0) / 2, PW, 2, s0.z0 - BR.padZ0));
    for (const sx of [-1, 1]) { const w = aabb(s0.x + sx * (PW / 2 + 0.7), 40, (BR.padZ0 + s0.z0) / 2, 1.4, 80, s0.z0 - BR.padZ0); w.inv = true; solids.add(w); }
    triggers.add({ ...aabb(s0.x, 2, (BR.padZ0 + s0.z0) / 2 + 2, PW - 2, 4, s0.z0 - BR.padZ0 - 4), enter: () => actions.startPad(0) });
    for (const st of STAGES) {
        const list = [];
        for (let r = 0; r < st.rows; r++) for (let s = 0; s < st.choices; s++) {
            const solid = aabb(paneX(st, s), rowTop(st, r) - BR.thick / 2, rowZ(st, r) + BR.depth / 2, st.pw, BR.thick, BR.depth);
            solid.glass = { k: st.k, r, s };
            solids.add(solid);
            list.push(solid);
        }
        paneSolids.push(list);
        for (let r = 0; r < st.rows; r++) {
            const top = rowTop(st, r), zc = rowZ(st, r) + BR.depth / 2 + 0.4;
            for (const side of [-1, 1]) {
                const w = aabb(st.x + side * (st.W / 2 + 1.7), top + 5, zc, 1.6, 12, BR.pitch + 0.2);
                w.rail = true; solids.add(w);
            }
        }
        const gate = aabb(st.x, st.y + 4, st.z0 - 0.4, st.W + 2, 8, 0.8);
        gate.inv = true; solids.add(gate); gates.push(gate);
    }
    for (let j = 1; j <= STAGE_COUNT; j++) {
        const isl = ISLANDS[j], prev = STAGES[j - 1], next = STAGES[j];
        solids.add(aabb(isl.x, isl.top - 1.5, isl.z0 + isl.d / 2, isl.w, 3, isl.d));
        islandWalls(isl, prev.x, prev.W, next ? next.x : isl.x, next ? next.W : 0);
        // Reaching the island clears the stage before it; its far end starts the next stage
        triggers.add({ ...aabb(isl.x, isl.top + 3, isl.z0 + 5, isl.w, 6, 10), enter: () => actions.finish(j - 1) });
        if (next) triggers.add({ ...aabb(isl.x, isl.top + 3, isl.z0 + isl.d - 8, isl.w - 4, 6, 12), enter: () => actions.startPad(j) });
        else triggers.add({ ...aabb(isl.x, isl.top + 3, isl.z0 + isl.d - 16, 16, 6, 16), enter: () => actions.throne() });
    }
}

// =====================================================================================
// Visuals, streamed per stage. Group j = island j (if j >= 1) + stage j's rows (if j < STAGE_COUNT).
// =====================================================================================
const loaded = new Map();
const run = { k: -1, seed: 0, qs: null, myRow: -1, path: false, hidden: new Set(), sides: {} };
const RAIL_STRUT = new T.CylinderGeometry(0.35, 0.35, 1, 10);
const G = {
    sph: new T.SphereGeometry(1, 16, 12), cyl: new T.CylinderGeometry(1, 1, 1, 14), cone: new T.ConeGeometry(1, 1, 14),
    pyr: new T.ConeGeometry(1, 1, 4), oct: new T.OctahedronGeometry(1, 0), tor: new T.TorusGeometry(1, 0.28, 8, 28),
    half: new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), rock: new T.IcosahedronGeometry(1, 0), knot: new T.TorusKnotGeometry(0.8, 0.22, 48, 8),
};
const arrowTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    x.translate(128, 128);
    x.beginPath(); x.moveTo(0, -110); x.lineTo(100, 0); x.lineTo(42, 0); x.lineTo(42, 110); x.lineTo(-42, 110); x.lineTo(-42, 0); x.lineTo(-100, 0); x.closePath();
    const g = x.createLinearGradient(0, -110, 0, 110); g.addColorStop(0, '#ffc0ec'); g.addColorStop(1, '#ff4aa8');
    x.fillStyle = g; x.fill();
    x.lineWidth = 10; x.strokeStyle = '#ffffff'; x.stroke();
    return texFrom(c);
})();

const ARCS = [0, 1, 2, 3, 4, 5].map((i) => new T.TorusGeometry(4 + i * 0.5, 0.25, 6, 24, Math.PI));
const GATE_ARCH = new T.TorusGeometry(1, 0.04, 8, 48, Math.PI);
// World-themed props floating around the path: (batch, x, y, z, scale, rng)
const PROPS = {
    station(bt, x, y, z, s, r) {
        if (r() < 0.5) { bt.box(3 * s, 2 * s, 2 * s, x, y, z, 0xc8c8e0, { decor: true }); bt.box(8 * s, 0.2 * s, 2.4 * s, x, y, z, 0x2f6bff, { decor: true }); bt.box(0.6 * s, 0.6 * s, 2.6 * s, x, y + 1.2 * s, z, 0x6fe0ff, { decor: true, neon: true, hdr: 1.3 }); }
        else bt.shape(G.oct, x, y, z, 2 * s, 2 * s, 2 * s, r() * 3, r() * 3, 0, mat(0x6fe0ff, { neon: true, hdr: 1.2 }), { neon: true });
    },
    candy(bt, x, y, z, s, r) {
        const c = [0xff5ab4, 0xffd23a, 0x7dff9a, 0x5ad8ff][(r() * 4) | 0];
        if (r() < 0.5) { bt.shape(G.cyl, x, y - 5 * s, z, 0.3 * s, 10 * s, 0.3 * s, 0, 0, 0, mat(0xffffff)); bt.shape(G.cyl, x, y + 1 * s, z, 3 * s, 0.8 * s, 3 * s, Math.PI / 2, r() * 3, 0, mat(c)); bt.shape(G.tor, x, y + 1 * s, z, 1.7 * s, 1.7 * s, 1.7 * s, 0, r() * 3, 0, mat(0xffffff)); }
        else { bt.shape(G.half, x, y, z, 3 * s, 3 * s, 3 * s, 0, 0, 0, mat(c)); bt.shape(G.sph, x, y + 3.2 * s, z, 0.5 * s, 0.5 * s, 0.5 * s, 0, 0, 0, mat(0xffffff)); }
    },
    ice(bt, x, y, z, s, r) {
        for (let i = 0; i < 3; i++) bt.shape(G.oct, x + (r() - 0.5) * 4 * s, y + i * 1.5 * s, z + (r() - 0.5) * 4 * s, 1.2 * s, (3 + r() * 4) * s, 1.2 * s, (r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6, mat(i % 2 ? 0xcff4ff : 0x7fd8ff, { shiny: true }), {});
        if (r() < 0.4) bt.shape(G.cone, x, y - 6 * s, z, 6 * s, 10 * s, 6 * s, Math.PI, 0, 0, mat(0xeaf8ff));
    },
    jungle(bt, x, y, z, s, r) {
        if (r() < 0.6) {
            bt.shape(G.cyl, x, y, z, 0.6 * s, 8 * s, 0.6 * s, 0, 0, (r() - 0.5) * 0.3, mat(0x8a5a32));
            for (let i = 0; i < 5; i++) bt.shape(G.cone, x + Math.cos(i * 1.26) * 2.2 * s, y + 4 * s, z + Math.sin(i * 1.26) * 2.2 * s, 1.2 * s, 5 * s, 0.4 * s, Math.PI / 2 + 0.5, -i * 1.26, 0, mat(0x2fae36));
        } else { bt.box(6 * s, 3 * s, 6 * s, x, y, z, 0x8a8a6a, { decor: true }); bt.box(4 * s, 3 * s, 4 * s, x, y + 3 * s, z, 0x9a9a7a, { decor: true }); bt.box(2 * s, 2 * s, 2 * s, x, y + 5.5 * s, z, 0x7dff6b, { decor: true, neon: true, hdr: 1.2 }); }
    },
    ocean(bt, x, y, z, s, r) {
        if (r() < 0.5) { const c = [0xff6a8a, 0xffa03a, 0xc86aff][(r() * 3) | 0]; for (let i = 0; i < 4; i++) bt.shape(G.cyl, x + (r() - 0.5) * 3 * s, y + i * s, z + (r() - 0.5) * 3 * s, 0.5 * s, (3 + r() * 3) * s, 0.5 * s, (r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8, mat(c)); }
        else { bt.shape(G.half, x, y, z, 2.6 * s, 2 * s, 2.6 * s, 0, 0, 0, mat(0x7fe8ff, { neon: true, hdr: 1.15 }), { neon: true }); for (let i = 0; i < 5; i++) bt.shape(G.cyl, x + Math.cos(i * 1.26) * 1.6 * s, y - 2.2 * s, z + Math.sin(i * 1.26) * 1.6 * s, 0.12 * s, 4 * s, 0.12 * s, 0, 0, 0, mat(0x9af0ff)); }
    },
    desert(bt, x, y, z, s, r) {
        if (r() < 0.6) bt.shape(G.pyr, x, y, z, 6 * s, 7 * s, 6 * s, 0, Math.PI / 4, 0, mat(0xe8c070));
        else { bt.shape(G.cyl, x, y, z, 0.9 * s, 7 * s, 0.9 * s, 0, 0, 0, mat(0x3aa04a)); bt.shape(G.cyl, x + 1.6 * s, y + 0.5 * s, z, 0.6 * s, 3 * s, 0.6 * s, 0, 0, 0, mat(0x3aa04a)); bt.shape(G.cyl, x - 1.6 * s, y + 1.2 * s, z, 0.6 * s, 2.4 * s, 0.6 * s, 0, 0, 0, mat(0x3aa04a)); }
    },
    lava(bt, x, y, z, s, r) {
        if (r() < 0.5) { bt.shape(G.cone, x, y, z, 6 * s, 8 * s, 6 * s, 0, 0, 0, mat(0x3a2626)); bt.shape(G.cone, x, y + 3.6 * s, z, 2 * s, 1 * s, 2 * s, Math.PI, 0, 0, mat(0xff5a1a, { neon: true, hdr: 1.3 }), { neon: true }); }
        else bt.shape(G.rock, x, y, z, 3 * s, 2.4 * s, 3 * s, r() * 3, r() * 3, 0, mat(r() < 0.3 ? 0xff6a2a : 0x3a2222, r() < 0.3 ? { neon: true, hdr: 1.15 } : undefined));
    },
    cyber(bt, x, y, z, s, r) {
        const h = (8 + r() * 14) * s;
        bt.box(3 * s, h, 3 * s, x, y, z, 0x1a1a30, { decor: true });
        for (let i = 0; i < 3; i++) bt.box(3.1 * s, 0.25 * s, 3.1 * s, x, y - h / 2 + (i + 1) * h / 4, z, [0x3affd8, 0xff3ad8, 0x3a8cff][i], { decor: true, neon: true, hdr: 1.25 });
    },
    rainbow(bt, x, y, z, s, r) {
        if (r() < 0.5) {
            const cols = [0xff3a3a, 0xff9a1e, 0xffe14a, 0x46ec50, 0x28c8ff, 0x8a5cff];
            const ry = r() * 3;
            cols.forEach((c, i) => bt.shape(ARCS[i], x, y, z, s, s, s, 0, ry, 0, mat(c, { neon: true, hdr: 1.1 }), { neon: true }));
        } else bt.shape(G.oct, x, y, z, 1.6 * s, 1.6 * s, 1.6 * s, 0, r() * 3, 0, mat(0xffe14a, { neon: true, hdr: 1.25 }), { neon: true });
    },
    heaven(bt, x, y, z, s, r) {
        if (r() < 0.6) for (let i = 0; i < 5; i++) bt.shape(G.sph, x + (i - 2) * 2.4 * s, y + (r() - 0.3) * 1.5 * s, z + (r() - 0.5) * 2 * s, (2 + r()) * s, (1.4 + r() * 0.6) * s, (2 + r()) * s, 0, 0, 0, mat(i % 2 ? 0xffffff : 0xfff4d0));
        else { bt.shape(G.cyl, x, y, z, 1.2 * s, 10 * s, 1.2 * s, 0, 0, 0, mat(0xffe07a, { shiny: true })); bt.shape(G.tor, x, y + 6 * s, z, 1.6 * s, 1.6 * s, 1.6 * s, Math.PI / 2, 0, 0, mat(0xffd028, { neon: true, hdr: 1.2 }), { neon: true }); }
    },
};
function sprite(lines, w, pos, group) {
    const sp = billboard(lines, w, 1024, pos, group);
    sp.userData.own = true;
    return sp;
}
function buildRows(V, bt) {
    const st = V.st, wd = WORLDS[st.w], n = st.rows * st.choices;
    // Panes
    const geo = new T.BoxGeometry(1, BR.thick, 1);
    const iColor = new Float32Array(n * 3), iCell = new Float32Array(n), iState = new Float32Array(n), iFlash = new Float32Array(n).fill(-99);
    geo.setAttribute('iColor', new T.InstancedBufferAttribute(iColor, 3));
    geo.setAttribute('iCell', new T.InstancedBufferAttribute(iCell, 1));
    geo.setAttribute('iState', new T.InstancedBufferAttribute(iState, 1));
    geo.setAttribute('iFlash', new T.InstancedBufferAttribute(iFlash, 1));
    const material = new T.ShaderMaterial({
        uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, {
            atlas: { value: null }, grid: { value: new T.Vector2(COLS, 1) }, size: { value: new T.Vector2(st.pw, BR.depth) }, time: { value: 0 },
            dark: { value: hasMod(st, 'dark') ? 1 : 0 }, revealZ: { value: -1e9 }, ghost: { value: hasMod(st, 'ghost') ? 1 : 0 }, crumble: { value: st.crumble },
        }]),
        vertexShader: glassVert, fragmentShader: glassFrag, transparent: true, depthWrite: false, fog: true,
    });
    const im = new T.InstancedMesh(geo, material, n);
    im.frustumCulled = false;
    const col = new T.Color();
    V.matrices = [];
    for (let r = 0; r < st.rows; r++) for (let s = 0; s < st.choices; s++) {
        const i = r * st.choices + s;
        sm4.compose(sp3.set(paneX(st, s), rowTop(st, r) - BR.thick / 2, rowZ(st, r) + BR.depth / 2), sq.identity(), ss.set(st.pw, 1, BR.depth));
        im.setMatrixAt(i, sm4);
        V.matrices.push(sm4.clone());
        col.setHex(wd.palette[(r * 3 + s * 5 + st.k) % wd.palette.length]);
        iColor.set([col.r, col.g, col.b], i * 3);
        iCell[i] = i;
    }
    im.renderOrder = 2;
    V.group.add(im);
    V.im = im; V.attr = { iState, iFlash, iCell };
    // Question signs, just outside the rail on the player's left
    const sgeo = new T.PlaneGeometry(1, 1);
    const sCell = new Float32Array(st.rows), sRow = new Float32Array(st.rows);
    sgeo.setAttribute('iCell', new T.InstancedBufferAttribute(sCell, 1));
    sgeo.setAttribute('iRow', new T.InstancedBufferAttribute(sRow, 1));
    const smat = new T.ShaderMaterial({
        uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, { atlas: { value: null }, grid: { value: new T.Vector2(2, 1) }, myRow: { value: -1 }, time: { value: 0 }, hide: { value: 0 } }]),
        vertexShader: signVert, fragmentShader: signFrag, transparent: true, depthWrite: false, fog: true, side: T.DoubleSide,
    });
    const signs = new T.InstancedMesh(sgeo, smat, st.rows);
    signs.frustumCulled = false;
    const sw = st.choices >= 3 ? 7.5 : 9, sh = sw * SIGN_H / SIGN_W, yaw = 0.45;
    const tilt = new T.Quaternion().setFromEuler(new T.Euler(-0.12, Math.PI + yaw, 0, 'YXZ'));
    const sx = st.x + st.W / 2 + 1.5 + (sw / 2) * Math.cos(yaw);
    for (let r = 0; r < st.rows; r++) {
        sm4.compose(sp3.set(sx, rowTop(st, r) + 4.4, rowZ(st, r) + BR.depth * 0.5), tilt, ss.set(sw, sh, 1));
        signs.setMatrixAt(r, sm4);
        sCell[r] = r; sRow[r] = r;
    }
    signs.renderOrder = 4;
    V.group.add(signs);
    V.signs = signs;
    // Steel frame, rails with a neon strip, struts into the void
    const L = -st.W / 2 - 1.1, R = st.W / 2 + 1.1, beam = 0x2a2350;
    const beamM = mat(beam, { shiny: true }), railM = mat(wd.rail), neonM = mat(wd.neon, { neon: true, hdr: 1.25 });
    for (let r = 0; r < st.rows; r++) {
        const top = rowTop(st, r), z0 = rowZ(st, r), zc = z0 + BR.depth / 2 + 0.4;
        bt.shape(UNIT, st.x, top - 1.05, z0 + 0.2, st.W + 2.6, 0.5, 0.7, 0, 0, 0, beamM);
        bt.shape(UNIT, st.x, top - 1.05, z0 + BR.depth - 0.2, st.W + 2.6, 0.5, 0.7, 0, 0, 0, beamM);
        for (let s = 0; s <= st.choices; s++) {
            const xs = s === 0 ? st.x + st.W / 2 + 0.5 : s === st.choices ? st.x - st.W / 2 - 0.5 : (paneX(st, s - 1) + paneX(st, s)) / 2;
            bt.shape(UNIT, xs, top - 0.95, zc, 0.6, 0.6, BR.pitch, 0, 0, 0, beamM);
        }
        for (const side of [L, R]) {
            const x = st.x + side;
            bt.shape(UNIT, x, top + 1.6, z0, 0.7, 3.6, 0.7, 0, 0, 0, railM, { cast: true });
            bt.shape(UNIT, x, top + 3.3, zc, 0.5, 0.5, BR.pitch, 0, 0, 0, railM);
            bt.shape(UNIT, x, top + 1.6, zc, 0.3, 0.3, BR.pitch, 0, 0, 0, railM);
            bt.shape(UNIT, x, top + 3.62, zc, 0.14, 0.14, BR.pitch, 0, 0, 0, neonM, { neon: true });
        }
        if (r % 5 === 2) for (const side of [L, R]) bt.shape(RAIL_STRUT, st.x + side * 0.8, top - 71, zc, 1, 140, 1, 0, 0, 0, beamM);
    }
    // Gate: posts, bar and the force field across row 0
    const z1 = st.z0;
    for (const sxx of [-1, 1]) bt.shape(UNIT, st.x + sxx * (st.W / 2 + 1.6), st.y + 4.5, z1 - 0.4, 1.2, 9, 1.2, 0, 0, 0, beamM, { cast: true });
    bt.shape(UNIT, st.x, st.y + 9.4, z1 - 0.4, st.W + 4.4, 1.2, 1.2, 0, 0, 0, beamM);
    bt.shape(UNIT, st.x, st.y + 8.7, z1 - 0.4, st.W + 4.4, 0.25, 1.3, 0, 0, 0, neonM, { neon: true });
    const gm = new T.ShaderMaterial({
        uniforms: { color: { value: new T.Color(wd.color) }, time: { value: 0 }, open: { value: 0 } },
        vertexShader: gateVert, fragmentShader: gateFrag, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
    });
    const field = new T.Mesh(new T.PlaneGeometry(st.W + 2, 8), gm);
    field.position.set(st.x, st.y + 4, z1 - 0.4);
    V.group.add(field);
    V.gate = { field, open: 0 };
    // "STAGE 7" over the gate, with the modifier
    const ml = modLabel(st);
    const lines = [{ t: 'STAGE ' + (st.k + 1) + (st.boss ? '  ·  BOSS' : ''), c: st.boss ? '#ff6b8a' : '#ffffff', s: '#16121f', px: 110 }, { t: wd.icon + ' ' + wd.name, c: wd.css, s: '#16121f', px: 64 }];
    if (ml) lines.push({ t: ml, c: '#ffb35a', s: '#16121f', px: 52 });
    sprite(lines, 15, new V3(st.x, st.y + 15, z1 - 1), V.group);
    // Floating props along both sides of the stage
    const rng = rngFrom(7919 * (st.k + 1));
    const make = PROPS[wd.id];
    const len = st.endZ - st.z0;
    for (let i = 0; i < 10; i++) {
        const side = i % 2 ? 1 : -1, z = st.z0 + (i + rng()) / 10 * len;
        make(bt, st.x + side * (st.W / 2 + 16 + rng() * 45), st.y + (rng() - 0.55) * 40, z, 1 + rng() * 1.4, rng);
    }
}
function buildPad(V, bt) {
    const st = STAGES[0], PW = st.W + 4, zc = (BR.padZ0 + st.z0) / 2, wd = WORLDS[0];
    bt.box(PW, 2, st.z0 - BR.padZ0, st.x, -1, zc, 0x5a3ac8, { studs: true, decor: true });
    for (const sx of [-1, 1]) bt.box(0.4, 0.3, st.z0 - BR.padZ0, st.x + sx * PW / 2, 0.05, zc, wd.neon, { neon: true, decor: true, hdr: 1.3 });
    const arrow = new T.Mesh(new T.PlaneGeometry(7, 7), new T.MeshBasicMaterial({ map: arrowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.85 }));
    arrow.rotation.x = -Math.PI / 2; arrow.rotation.z = Math.PI; arrow.position.set(st.x, 0.05, zc - 1);
    arrow.userData.own = true;
    V.group.add(arrow);
    sprite([{ t: 'START HERE', c: '#ffffff', s: '#16121f', px: 100 }, { t: STAGE_COUNT + ' stages · ' + WORLDS.length + ' worlds', c: '#ffe14a', s: '#16121f', px: 56 }], 16, new V3(st.x, 22, BR.padZ0 + 2), V.group);
}
// Checkpoint island j
const CHEST_BODY = new RoundedBoxGeometry(7, 4.2, 4.6, 3, 0.5);
const CHEST_LID = new RoundedBoxGeometry(7.2, 1.8, 4.8, 3, 0.6);
function buildIsland(V, bt) {
    const isl = ISLANDS[V.j], j = V.j, wd = WORLDS[Math.min(WORLDS.length - 1, Math.floor(j / STAGES_PER_WORLD))];
    const prevW = WORLDS[Math.floor((j - 1) / STAGES_PER_WORLD)];
    const zc = isl.z0 + isl.d / 2, top = isl.top;
    bt.box(isl.w, 3, isl.d, isl.x, top - 1.5, zc, isl.last ? 0xfff0c8 : isl.worldStart ? wd.island : prevW.island, { studs: true, decor: true });
    const neonM = mat(wd.neon, { neon: true, hdr: 1.25 });
    bt.shape(UNIT, isl.x, top + 0.05, isl.z0 + 0.2, isl.w + 0.4, 0.25, 0.4, 0, 0, 0, neonM, { neon: true });
    bt.shape(UNIT, isl.x, top + 0.05, isl.z0 + isl.d - 0.2, isl.w + 0.4, 0.25, 0.4, 0, 0, 0, neonM, { neon: true });
    for (const sx of [-1, 1]) bt.shape(UNIT, isl.x + sx * isl.w / 2, top + 0.05, zc, 0.4, 0.25, isl.d, 0, 0, 0, neonM, { neon: true });
    // Rock underneath with a few glowing crystals
    bt.shape(G.cone, isl.x, top - 3 - 14, zc, isl.w * 0.55, 28, isl.d * 0.55, Math.PI, 0, 0, mat(0x3a2e6a));
    const rng = rngFrom(104729 * j);
    for (let i = 0; i < 4; i++) bt.shape(G.oct, isl.x + (rng() - 0.5) * isl.w * 0.6, top - 6 - rng() * 12, zc + (rng() - 0.5) * isl.d * 0.5, 1.4, 4 + rng() * 4, 1.4, 0, rng() * 3, 0, mat(wd.neon, { neon: true, hdr: 1.15 }), { neon: true });
    // Low glowing posts at the corners
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        bt.shape(G.cyl, isl.x + dx * (isl.w / 2 - 2), top + 1.2, zc + dz * (isl.d / 2 - 2), 0.5, 2.4, 0.5, 0, 0, 0, mat(0x2a2350, { shiny: true }), { cast: true });
        bt.shape(G.sph, isl.x + dx * (isl.w / 2 - 2), top + 2.8, zc + dz * (isl.d / 2 - 2), 0.7, 0.7, 0.7, 0, 0, 0, mat(wd.neon, { neon: true, hdr: 1.2 }), { neon: true });
    }
    // A couple of themed props on the island
    const make = PROPS[wd.id];
    for (const sx of [-1, 1]) make(bt, isl.x + sx * (isl.w / 2 - 6), top + 3, zc + (rng() - 0.5) * 8, 0.6, rng);
    // Checkpoint banner
    // Off to the side, so it never sits between the camera and you at the checkpoint
    sprite([{ t: '✔ CHECKPOINT', c: '#7dff6b', s: '#16121f', px: 80 }, { t: 'Stage ' + j + ' cleared', c: '#ffffff', s: '#16121f', px: 56 }], 9, new V3(isl.x - isl.w / 2 + 7, top + 7, isl.z0 + 6), V.group);
    if (isl.worldStart || isl.last) {
        // A big world gateway: arch, chest and the new world's name
        const w2 = isl.last ? WORLDS[WORLDS.length - 1] : wd;
        for (const sx of [-1, 1]) bt.shape(UNIT, isl.x + sx * (isl.w / 2 - 3), top + 10, zc, 2.4, 20, 2.4, 0, 0, 0, mat(0xffffff, { shiny: true }), { cast: true });
        bt.shape(GATE_ARCH, isl.x, top + 20, zc, isl.w / 2 - 3, isl.w / 2 - 3, isl.w / 2 - 3, 0, 0, 0, mat(w2.neon, { neon: true, hdr: 1.25 }), { neon: true });
        sprite(isl.last
            ? [{ t: '👑 GOLDEN THRONE 👑', c: '#ffe14a', s: '#16121f', px: 100, glow: '#ffb51c' }, { t: 'You cleared all ' + STAGE_COUNT + ' stages!', c: '#ffffff', s: '#16121f', px: 60 }]
            : [{ t: 'WORLD ' + (Math.floor(j / STAGES_PER_WORLD) + 1), c: '#ffffff', s: '#16121f', px: 80 }, { t: w2.icon + ' ' + w2.name.toUpperCase(), c: w2.css, s: '#16121f', px: 110, glow: w2.css }],
        22, new V3(isl.x, top + 27, zc), V.group);
        const wood = new T.MeshStandardMaterial({ color: 0x8a4a22, roughness: 0.6 });
        const gold = new T.MeshStandardMaterial({ color: 0xffc83a, roughness: 0.3, metalness: 0.8, emissive: 0x5a3800, emissiveIntensity: 0.35 });
        wood.userData.own = gold.userData.own = true;
        const cz = isl.z0 + 12;
        const g = new T.Group(); g.position.set(isl.x + isl.w / 2 - 9, top, cz); g.rotation.y = -0.5; V.group.add(g);
        const body = new T.Mesh(CHEST_BODY, wood); body.position.y = 2.1; body.castShadow = true; g.add(body);
        for (const sx of [-2.6, 2.6]) { const band = new T.Mesh(new T.BoxGeometry(0.7, 4.3, 4.75), gold); band.position.set(sx, 2.1, 0); g.add(band); }
        const lid = new T.Mesh(CHEST_LID, wood); lid.position.set(0, 5.1, -0.6); lid.rotation.x = -0.6; g.add(lid);
        const coins = new T.Mesh(new T.SphereGeometry(2.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffd23a, { shiny: true }));
        coins.scale.set(1, 0.4, 0.6); coins.position.y = 4.1; g.add(coins);
        if (isl.last) {
            // The throne: a golden seat on steps
            bt.box(14, 2, 10, isl.x, top + 1, isl.z0 + isl.d - 14, 0xffd028, { decor: true, shiny: true, cast: true });
            bt.box(8, 3, 6, isl.x, top + 3.5, isl.z0 + isl.d - 14, 0xffe07a, { decor: true, shiny: true, cast: true });
            bt.box(8, 10, 1.5, isl.x, top + 9, isl.z0 + isl.d - 11.5, 0xffd028, { decor: true, shiny: true, cast: true });
            sprite([{ t: '🔄 REBIRTH', c: '#ff8fd0', s: '#16121f', px: 100 }, { t: 'Sit on the throne!', c: '#ffffff', s: '#16121f', px: 56 }], 12, new V3(isl.x, top + 17, isl.z0 + isl.d - 14), V.group);
        }
    }
}

function relabel(V) {
    if (!V.st) return;
    V.qs = stageQuestions(V.st.level, V.seed, V.st.rows, V.st.choices);
    const na = numberAtlas(V), sa = signAtlas(V);
    V.im.material.uniforms.atlas.value = na.tex; V.im.material.uniforms.grid.value.copy(na.grid);
    V.signs.material.uniforms.atlas.value = sa.tex; V.signs.material.uniforms.grid.value.copy(sa.grid);
    V.shift = new Int8Array(V.st.rows).fill(-1);
}
function resetPanes(V) {
    if (!V.st) return;
    const { iState, iFlash, iCell } = V.attr;
    iState.fill(STATE.idle); iFlash.fill(-99);
    for (let i = 0; i < iCell.length; i++) iCell[i] = i;
    for (let i = 0; i < V.matrices.length; i++) V.im.setMatrixAt(i, V.matrices[i]);
    V.im.instanceMatrix.needsUpdate = true;
    for (const a of ['iState', 'iFlash', 'iCell']) V.im.geometry.attributes[a].needsUpdate = true;
}
// The run's visual state, re-applied whenever its stage gets (re)built
function applyRun(V) {
    if (!V.st) return;
    const mine = run.k === V.j;
    V.seed = mine ? run.seed : (V.seed || ((Math.random() * 0x7fffffff) | 0));
    resetPanes(V);
    relabel(V);
    if (!mine) return;
    for (let r = 0; r < run.myRow; r++) markRow(V, r, false);
    for (const i of run.hidden) { sm4.makeScale(0, 0, 0); V.im.setMatrixAt(i, sm4); }
    V.im.instanceMatrix.needsUpdate = true;
    if (run.path) showPathOn(V);
}
function buildVisual(j) {
    const V = { j, st: STAGES[j] || null, group: new T.Group(), seed: 0 };
    scene.add(V.group);
    const bt = new Batch();
    if (j === 0) buildPad(V, bt);
    if (j >= 1) buildIsland(V, bt);
    if (V.st) buildRows(V, bt);
    // Batch.box adds solids unless decor; everything here is decor (collision is built at boot)
    bt.build(V.group);
    loaded.set(j, V);
    applyRun(V);
    return V;
}
function disposeVisual(V) {
    scene.remove(V.group);
    V.group.traverse((o) => {
        if (o.geometry && !o.isSprite && o.geometry !== UNIT && !Object.values(G).includes(o.geometry) && o.geometry !== CHEST_BODY && o.geometry !== CHEST_LID) o.geometry.dispose();
        if (o.material) {
            if (o.isSprite) { o.material.map && o.material.map.dispose(); o.material.dispose(); }
            else if (o.material.isShaderMaterial || (o.material.userData && o.material.userData.own)) o.material.dispose();
        }
    });
    if (V.ntex) V.ntex.dispose();
    if (V.stex) V.stex.dispose();
    loaded.delete(V.j);
}

// ----- run API -----
let clockT = 0;
function setState(V, i, st, flash) {
    V.attr.iState[i] = st;
    if (flash) V.attr.iFlash[i] = clockT;
    V.im.geometry.attributes.iState.needsUpdate = true;
    V.im.geometry.attributes.iFlash.needsUpdate = true;
}
function markRow(V, r, flash) {
    const q = V.qs[r], ch = V.st.choices;
    for (let s = 0; s < ch; s++) {
        const i = r * ch + s;
        if (run.hidden.has(i)) continue;
        // On shuffle stages the right pane is the one you stepped on (the numbers move)
        const right = hasMod(V.st, 'shuffle') ? (run.sides[r] !== undefined ? run.sides[r] === s : V.qs[r].options[(s + shuffleShift(net.now(), r, ch, V.st.shuffleMs)) % ch] === q.answer) : s === q.correct;
        setState(V, i, right ? STATE.right : STATE.wrong, flash && right);
    }
}
function showPathOn(V) {
    if (hasMod(V.st, 'shuffle')) return; // the path moves with the numbers there
    for (let r = Math.max(0, run.myRow); r < V.st.rows; r++) {
        for (let s = 0; s < V.st.choices; s++) {
            const i = r * V.st.choices + s;
            if (!run.hidden.has(i)) setState(V, i, s === V.qs[r].correct ? STATE.path : STATE.dim, s === V.qs[r].correct);
        }
    }
}
// My run started on stage k with the server's seed (row: rows already answered on a resume)
export function startRun(k, seed, opts) {
    opts = opts || {};
    if (run.k >= 0 && run.k !== k) endRun(run.k);
    run.k = k; run.seed = seed; run.myRow = opts.row || 0; run.path = !!opts.path; run.hidden = new Set(); run.sides = {};
    for (const s of paneSolids[k]) s.off = false;
    gates[k].off = true;
    const V = loaded.get(k) || buildVisual(k);
    applyRun(V);
}
export function endRun(k) {
    if (k < 0 || run.k !== k) return;
    for (const i of run.hidden) paneSolids[k][i].off = false;
    gates[k].off = false;
    run.k = -1; run.qs = null; run.myRow = -1; run.path = false; run.hidden = new Set(); run.sides = {};
    const V = loaded.get(k);
    if (V) { V.seed = (Math.random() * 0x7fffffff) | 0; resetPanes(V); relabel(V); }
}
const visual = (k) => loaded.get(k) || null;
export const question = (k, r) => { const V = visual(k); return V && V.qs ? V.qs[r] || null : null; };
export const runStage = () => run.k;
// Local prediction of a step (the server has the final word)
export function judge(k, r, s) {
    const V = visual(k), q = question(k, r);
    if (!V || !q) return false;
    const shown = hasMod(V.st, 'shuffle') ? (s + shuffleShift(net.now(), r, V.st.choices, V.st.shuffleMs)) % V.st.choices : s;
    return q.options[shown] === q.answer;
}
export function markRight(k, r, s) {
    const V = visual(k);
    run.myRow = Math.max(run.myRow, r + 1);
    run.sides[r] = s;
    if (!V) return;
    markRow(V, r, true);
    const st = V.st;
    const x = paneX(st, s), y = rowTop(st, r), z = rowZ(st, r) + BR.depth / 2;
    sparkleBurst(new V3(x, y + 0.3, z), 0x7dff6b, st.pw);
    ring(new V3(x, y + 0.3, z), 0x46ec50, 6, 0.6);
}
// The glass breaks: hide the pane, drop its solid (mine), throw shards
export function shatter(k, r, s, mine) {
    const st = STAGES[k];
    if (!st || r < 0 || s < 0) return;
    const i = r * st.choices + s, V = visual(k);
    const x = paneX(st, s), y = rowTop(st, r) - BR.thick / 2, z = rowZ(st, r) + BR.depth / 2;
    const color = WORLDS[st.w].palette[(r * 3 + s * 5 + st.k) % WORLDS[st.w].palette.length];
    if (mine) {
        run.hidden.add(i);
        paneSolids[k][i].off = true;
        if (V) { sm4.makeScale(0, 0, 0); V.im.setMatrixAt(i, sm4); V.im.instanceMatrix.needsUpdate = true; }
        spawnShards(x, y, z, st.pw, BR.depth, color, 46);
    } else {
        if (V) setState(V, i, V.attr.iState[i], true);
        spawnShards(x, y - 0.4, z, st.pw, BR.depth, color, 26);
    }
}
// Crumbling Glass: start the crack animation on the pane you stand on
export function crackPane(k, r, s) {
    const V = visual(k);
    if (V) setState(V, r * V.st.choices + s, STATE.crack, true);
}
export function showPath(k) { run.path = true; const V = visual(k); if (V) showPathOn(V); }
// Where a revive puts you: the right pane of the row before (or the stage's start)
export function safeSpot(k, r) {
    const st = STAGES[k];
    if (r <= 0) return new V3(st.x, st.y + 0.6, st.z0 - 4);
    const V = visual(k), q = question(k, r - 1);
    let s = q ? q.correct : 0;
    if (hasMod(st, 'shuffle') && run.sides[r - 1] !== undefined) s = run.sides[r - 1];
    void V;
    return new V3(paneX(st, s), rowTop(st, r - 1) + 0.05, rowZ(st, r - 1) + BR.depth / 2);
}

// ----- per frame: streaming, shuffles, dark reveal, gates -----
let buildQueue = [];
export function updateStages(dt, t, pos) {
    clockT = t;
    const cs = pos.z < BR.padZ0 ? 0 : stageAtZ(pos.z);
    // Wanted: one behind, the current one and two ahead (and the island after the last)
    const want = [];
    for (let j = cs - 1; j <= cs + 2; j++) if (j >= 0 && j <= STAGE_COUNT) want.push(j);
    if (run.k >= 0 && !want.includes(run.k)) want.push(run.k);
    for (const [j, V] of loaded) if (j < cs - 2 || j > cs + 3) { if (j !== run.k) disposeVisual(V); }
    buildQueue = want.filter((j) => !loaded.has(j)).sort((a, b) => Math.abs(a - cs) - Math.abs(b - cs));
    if (buildQueue.length) buildVisual(buildQueue[0]);
    const now = net.now();
    for (const V of loaded.values()) {
        if (!V.st) continue;
        const u = V.im.material.uniforms;
        u.time.value = t;
        V.signs.material.uniforms.time.value = t;
        const mine = run.k === V.j;
        V.signs.material.uniforms.myRow.value = mine ? run.myRow : -1;
        // Lights Out: the glass lights up a couple of rows ahead of you
        if (hasMod(V.st, 'dark')) u.revealZ.value = mine ? Math.max(pos.z, V.st.z0) + BR.pitch * 2.2 : V.st.z0 - 50;
        // Shuffle: move the numbers between the panes of each row
        if (hasMod(V.st, 'shuffle')) {
            let changed = false;
            const ch = V.st.choices;
            for (let r = 0; r < V.st.rows; r++) {
                if (mine && r < run.myRow) continue;
                const sh = shuffleShift(now, r, ch, V.st.shuffleMs);
                if (sh === V.shift[r]) continue;
                V.shift[r] = sh; changed = true;
                for (let s = 0; s < ch; s++) {
                    const i = r * ch + s;
                    V.attr.iCell[i] = r * ch + (s + sh) % ch;
                    if (mine && r - run.myRow < 3 && V.attr.iState[i] === STATE.idle) V.attr.iFlash[i] = t;
                }
            }
            if (changed) { V.im.geometry.attributes.iCell.needsUpdate = true; V.im.geometry.attributes.iFlash.needsUpdate = true; }
        }
        const g = V.gate, open = mine ? 1 : 0;
        g.open += (open - g.open) * Math.min(1, dt * 5);
        g.field.material.uniforms.open.value = g.open;
        g.field.material.uniforms.time.value = t;
        g.field.visible = g.open < 0.98;
    }
    updateShards(dt);
}
// Build the first stages right away (before the first frame)
export function primeStages() { for (const j of [0, 1]) if (!loaded.has(j)) buildVisual(j); }
void money; void fmt; void triggers;
