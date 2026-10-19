import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const T = THREE;
export const V3 = THREE.Vector3;
export const $ = (s) => document.querySelector(s);
export const hexCss = (h) => '#' + h.toString(16).padStart(6, '0');

// ----- renderer, scene, camera, lights -----
export const canvas = $('#view');
export const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;

export const scene = new T.Scene();
// Deep space: the sky dome (sky.js) draws the nebula; fog fades the far ends of the bridges into it
export const SPACE = 0x0b0a2a;
scene.background = new T.Color(SPACE);
scene.fog = new T.Fog(0x1a1250, 260, 1100);

export const camera = new T.PerspectiveCamera(70, 1, 0.3, 9000);
function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 85 : 70;
    camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// Lit like Bloxity's top games: sky / ground fill, a little ambient and the sun, no tone mapping
export const hemi = new T.HemisphereLight(0xd8d4ff, 0x3a2a7a, 1.1);
export const amb = new T.AmbientLight(0xffffff, 0.45);
scene.add(hemi, amb);
export const sun = new T.DirectionalLight(0xfff3e0, 1.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 300 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// ----- materials & textures -----
export const UNIT = new T.BoxGeometry(1, 1, 1);
// neon stays at its own colour (there is no bloom pass to feed)
export const NEON_BOOST = 1;
// Matte materials only: PBR settings (roughness, metal, normal maps, environment) are dropped
const PBR_ONLY = ['roughness', 'metalness', 'roughnessMap', 'metalnessMap', 'normalMap', 'normalScale', 'normalMapType', 'envMap', 'envMapIntensity', 'clearcoat', 'clearcoatRoughness', 'sheen', 'sheenColor', 'sheenRoughness', 'ior', 'transmission', 'thickness', 'iridescence', 'specularIntensity', 'specularColor'];
export function toLambert(p) {
    const q = { ...(p || {}) };
    for (const k of PBR_ONLY) delete q[k];
    return new T.MeshLambertMaterial(q);
}
const matCache = new Map();
export function mat(color, o) {
    o = o || {};
    const key = color + '|' + (o.neon ? 1 : 0) + '|' + (o.opacity || 1) + '|' + (o.shiny ? 1 : 0) + '|' + (o.hdr || 0);
    let m = matCache.get(key);
    if (!m) {
        m = o.neon ? new T.MeshBasicMaterial({ color })
            : o.shiny ? toLambert({ color, roughness: 0.35, metalness: 0.25 })
                : new T.MeshLambertMaterial({ color });
        if (o.neon) m.color.multiplyScalar(NEON_BOOST); // (o.hdr only fed the old bloom pass)
        if (o.opacity && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
        m.userData.fold = true; // a shared colour: the world batcher may bake it into vertex colours
        matCache.set(key, m);
    }
    return m;
}
export function texFrom(cv) {
    const t = new T.CanvasTexture(cv);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
}
const studCanvas = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#cfcfd8'; x.beginPath(); x.arc(33, 35, 17, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(31, 31, 16, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#dcdce6'; x.lineWidth = 2; x.strokeRect(1, 1, 62, 62);
    return c;
})();
const studBase = texFrom(studCanvas);
studBase.wrapS = studBase.wrapT = T.RepeatWrapping;
studBase.anisotropy = renderer.capabilities.getMaxAnisotropy();
export function studMat(color, rx, rz) {
    rx = Math.max(1, Math.round(rx)); rz = Math.max(1, Math.round(rz));
    const key = 'stud|' + color + '|' + rx + '|' + rz;
    let m = matCache.get(key);
    if (!m) {
        const t = studBase.clone(); t.needsUpdate = true; t.repeat.set(rx, rz);
        m = new T.MeshLambertMaterial({ color, map: t });
        matCache.set(key, m);
    }
    return m;
}

// ----- world collections -----
// Solids and triggers are bucketed along z, so a query only looks at what is near the player
// (the stages stretch thousands of studs ahead).
const BUCKET = 24;
class ZIndex extends Array {
    constructor() { super(); this.buckets = new Map(); this.stamp = 0; this.out = []; }
    add(o) {
        this.push(o);
        const b0 = Math.floor(o.min.z / BUCKET), b1 = Math.floor(o.max.z / BUCKET);
        for (let b = b0; b <= b1; b++) {
            let list = this.buckets.get(b);
            if (!list) { list = []; this.buckets.set(b, list); }
            list.push(o);
        }
        return o;
    }
    // Everything that may overlap the z range [z0, z1]
    near(z0, z1) {
        const out = this.out; out.length = 0;
        const st = ++this.stamp;
        const b0 = Math.floor(z0 / BUCKET), b1 = Math.floor(z1 / BUCKET);
        for (let b = b0; b <= b1; b++) {
            const list = this.buckets.get(b);
            if (!list) continue;
            for (const o of list) if (o._st !== st) { o._st = st; out.push(o); }
        }
        return out;
    }
    static get [Symbol.species]() { return Array; }
}
export const solids = new ZIndex();   // {min,max, off?, glass?, rail?, inv?, camOnly?}
export const triggers = new ZIndex(); // {min,max,enter,inside}
export const prompts = [];  // {pos,r,label(),act()}
export const tickers = [];  // per-frame callbacks (dt, t)
export const addSolid = (o) => solids.add(o);
export const addTrigger = (o) => triggers.add(o);

export function aabb(x, y, z, sx, sy, sz) {
    return { min: new V3(x - sx / 2, y - sy / 2, z - sz / 2), max: new V3(x + sx / 2, y + sy / 2, z + sz / 2) };
}

// box(sx,sy,sz, x,y,z, color, {studs, neon, opacity, decor, cast, shiny})
export function box(sx, sy, sz, x, y, z, color, o) {
    o = o || {};
    let m;
    if (o.studs) {
        const side = mat(color), top = studMat(color, sx / 2, sz / 2);
        m = new T.Mesh(UNIT, [side, side, top, side, side, side]);
    } else {
        m = new T.Mesh(UNIT, mat(color, o));
    }
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    if (!o.neon) m.receiveShadow = true;
    if (o.cast) m.castShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    scene.add(m);
    if (!o.decor) solids.add(aabb(x, y, z, sx, sy, sz));
    return m;
}

// ----- text -----
export const FONT = (w, px) => `${w || 700} ${px}px Fredoka, "Arial Rounded MT Bold", sans-serif`;
export function textCanvas(lines, W) {
    const pad = 12;
    let H = pad * 2;
    for (const l of lines) H += l.px * 1.2;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = Math.ceil(H);
    const x = cv.getContext('2d');
    let y = pad;
    for (const l of lines) {
        let px = l.px;
        x.font = FONT(l.w, px);
        while (x.measureText(l.t).width > W - 28 && px > 8) { px -= 2; x.font = FONT(l.w, px); }
        x.textAlign = 'center'; x.textBaseline = 'middle';
        const cy = y + l.px * 0.62;
        if (l.glow) { x.shadowColor = l.glow; x.shadowBlur = px * 0.35; }
        if (l.s) { x.lineJoin = 'round'; x.lineWidth = Math.max(4, px * 0.22); x.strokeStyle = l.s; x.strokeText(l.t, W / 2, cy); }
        x.shadowBlur = 0;
        if (l.grad) {
            const g = x.createLinearGradient(0, cy - px / 2, 0, cy + px / 2);
            l.grad.forEach((c, i) => g.addColorStop(i / (l.grad.length - 1), c));
            x.fillStyle = g;
        } else x.fillStyle = l.c || '#fff';
        x.fillText(l.t, W / 2, cy);
        y += l.px * 1.2;
    }
    return cv;
}
export function billboard(lines, worldW, W, pos, parent) {
    W = W || 512;
    const cv = textCanvas(lines, W);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: texFrom(cv), transparent: true, depthWrite: false, toneMapped: false }));
    sp.scale.set(worldW, worldW * cv.height / cv.width, 1);
    if (pos) sp.position.copy(pos);
    sp.userData.set = (nl) => {
        const c2 = textCanvas(nl, W);
        sp.material.map.dispose();
        sp.material.map = texFrom(c2);
        sp.material.needsUpdate = true;
        sp.scale.set(worldW, worldW * c2.height / c2.width, 1);
    };
    (parent || scene).add(sp);
    return sp;
}

// ----- blocky fallback character rigs -----
function buildHair(part, c) {
    // Big messy Roblox-style hair: a puffy crown with strands falling over the face and neck
    const c2 = new THREE.Color(c).offsetHSL(0, 0, 0.1).getHex(), c3 = new THREE.Color(c).offsetHSL(0, 0, -0.12).getHex();
    part(1.6, 0.55, 1.6, 0, 5.38, -0.05, c);
    part(1.3, 0.35, 1.3, 0.05, 5.72, -0.1, c2);
    part(1.6, 1.3, 0.45, 0, 4.85, -0.6, c3);
    for (const sx of [-1, 1]) part(0.36, 1.1, 1.35, sx * 0.76, 4.9, -0.05, c);
    const strands = [[-0.55, 0.62, c2], [-0.18, 0.75, c], [0.2, 0.68, c3], [0.56, 0.58, c2]];
    for (const [x, h, col] of strands) part(0.4, h * 0.6, 0.3, x, 5.2 - h * 0.25, 0.64, col);
}
export function buildRig(d) {
    const g = new T.Group();
    const part = (sx, sy, sz, x, y, z, c, parent) => {
        const m = new T.Mesh(UNIT, mat(c)); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; (parent || g).add(m); return m;
    };
    part(2, 2, 1, 0, 3, 0, d.shirt);
    part(2.02, 0.12, 1.02, 0, 2.06, 0, d.shorts);
    const head = new T.Group(); g.add(head);
    part(1.2, 1.2, 1.2, 0, 4.6, 0, d.skin, head);
    for (const sx of [-0.26, 0.26]) {
        part(0.26, 0.24, 0.04, sx, 4.72, 0.605, 0xffffff, head);
        part(0.13, 0.18, 0.04, sx + (sx > 0 ? -0.04 : 0.04), 4.71, 0.625, 0x1a1420, head);
    }
    part(0.36, 0.07, 0.04, 0, 4.34, 0.64, 0x6b2a2a, head);
    buildHair((sx, sy, sz, x, y, z, c) => part(sx, sy, sz, x, y, z, c, head), d.hair);
    const legs = [], arms = [];
    for (const side of [-0.5, 0.5]) {
        const p = new T.Group(); p.position.set(side, 2, 0); g.add(p);
        part(1, 0.9, 1, 0, -0.45, 0, d.shorts, p);
        part(0.98, 1.1, 0.98, 0, -1.45, 0, d.socks, p);
        part(1.05, 0.38, 1.3, 0, -1.84, 0.12, d.shoes || 0x141418, p);
        legs.push(p);
    }
    for (const side of [-1.5, 1.5]) {
        const p = new T.Group(); p.position.set(side, 3.9, 0); g.add(p);
        part(1, 0.8, 1, 0, -0.4, 0, d.shirt, p);
        part(0.98, 1.2, 0.98, 0, -1.4, 0, d.skin, p);
        arms.push(p);
    }
    g.userData.legs = legs; g.userData.arms = arms; g.userData.head = head;
    return g;
}
export function animRig(g, phase, amt) {
    const s = Math.sin(phase) * amt;
    const u = g.userData;
    u.legs[0].rotation.x = s; u.legs[1].rotation.x = -s;
    u.arms[0].rotation.x = -s * 0.9; u.arms[1].rotation.x = s * 0.9;
}
export function airPose(g) {
    const u = g.userData;
    u.legs[0].rotation.x = 0.5; u.legs[1].rotation.x = -0.3;
    u.arms[0].rotation.x = -2.6; u.arms[1].rotation.x = -2.6;
}
// Arms and legs flailing while you fall through broken glass
export function fallPose(g, t) {
    const u = g.userData, w = Math.sin(t * 18);
    u.legs[0].rotation.x = 0.6 + w * 0.5; u.legs[1].rotation.x = -0.6 - w * 0.5;
    u.arms[0].rotation.x = -2.8 + w * 0.6; u.arms[1].rotation.x = -2.8 - w * 0.6;
}

// ----- soft round shadow under a character (reads on glass, where real shadows do not) -----
const blobTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return texFrom(c);
})();
export function blobShadow() {
    const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 3;
    scene.add(m);
    return m;
}
// Top of the highest solid under (x, z) that is below y (for blob shadows), or -Infinity
export function groundBelow(x, y, z) {
    let best = -Infinity;
    for (const c of solids.near(z - 1, z + 1)) {
        if (c.off || c.camOnly || c.max.y > y + 0.2 || c.max.y <= best) continue;
        if (x > c.min.x && x < c.max.x && z > c.min.z && z < c.max.z) best = c.max.y;
    }
    return best;
}

// ----- particles & floating text -----
const particles = [];
export function burst(pos, color, size, count) {
    for (let i = 0; i < (count || 26); i++) {
        const m = new T.Mesh(UNIT, mat(i % 3 ? color : 0xffffff));
        m.scale.setScalar((size || 1) * (0.5 + Math.random() * 0.5));
        m.position.copy(pos);
        scene.add(m);
        particles.push({ m, v: new V3((Math.random() * 2 - 1) * 25, Math.random() * 30 + 5, (Math.random() * 2 - 1) * 25), t: 1.2 });
    }
}
export function confettiAt(pos) {
    for (const c of [0xffd028, 0x46ec50, 0x28c8ff, 0xe82434, 0xc428ff]) burst(pos, c, 0.4, 12);
}
const floaters = [];
export function floatText(text, color, pos, size) {
    const sp = billboard([{ t: text, c: color, s: '#16121f', px: 70 }], size || 5, 512, pos);
    floaters.push({ sp, t: 1.1 });
}
export function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.t -= dt; p.v.y -= 80 * dt;
        p.m.position.addScaledVector(p.v, dt);
        p.m.rotation.x += dt * 5; p.m.rotation.y += dt * 4;
        if (p.t <= 0) { scene.remove(p.m); particles.splice(i, 1); }
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        f.t -= dt; f.sp.position.y += dt * 4; f.sp.material.opacity = Math.min(1, f.t * 2);
        if (f.t <= 0) { scene.remove(f.sp); f.sp.material.map.dispose(); f.sp.material.dispose(); floaters.splice(i, 1); }
    }
}

export function lerpAngle(a, b, k) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
}

// ----- static batching -----
// The world is built from hundreds of unit boxes that never move again. Merge every one
// that shares a material (and shadow flags) into a single mesh.
export function mergeStatic() {
    const groups = new Map();
    for (const m of scene.children) {
        if (!m.isMesh || m.matrixAutoUpdate || m.geometry !== UNIT || Array.isArray(m.material) || !m.visible) continue;
        const key = m.material.uuid + '|' + (m.castShadow ? 1 : 0) + (m.receiveShadow ? 1 : 0);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(m);
    }
    let before = 0, after = 0;
    for (const list of groups.values()) {
        before += list.length;
        if (list.length < 2) { after += list.length; continue; }
        for (let i = 0; i < list.length; i += 400) {
            const part = list.slice(i, i + 400);
            const geos = part.map((m) => UNIT.clone().applyMatrix4(m.matrix));
            const merged = new T.Mesh(mergeGeometries(geos), part[0].material);
            merged.castShadow = part[0].castShadow; merged.receiveShadow = part[0].receiveShadow;
            merged.matrixAutoUpdate = false;
            for (const g of geos) g.dispose();
            for (const m of part) scene.remove(m);
            scene.add(merged);
            after++;
        }
    }
    return { before, after };
}

// ----- per-stage static batching -----
// Collects boxes and arbitrary geometries for one stage and merges them by material into a few
// meshes inside one group, so a whole stage can be shown, hidden or thrown away at once.
const tmpM4 = new T.Matrix4(), tmpQ = new T.Quaternion(), tmpS = new V3(), tmpP = new V3();
export class Batch {
    constructor() { this.groups = new Map(); }
    add(geo, matrix, material, flags) {
        const key = material.uuid + '|' + (flags && flags.cast ? 1 : 0);
        let g = this.groups.get(key);
        if (!g) { g = { material, cast: !!(flags && flags.cast), recv: !(flags && flags.neon), geos: [] }; this.groups.set(key, g); }
        const c = geo.index ? geo.toNonIndexed() : geo.clone();
        for (const name of Object.keys(c.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') c.deleteAttribute(name);
        c.applyMatrix4(matrix);
        g.geos.push(c);
    }
    // Same signature as box(), plus a solid when not decor
    box(sx, sy, sz, x, y, z, color, o) {
        o = o || {};
        const material = o.studs ? studMat(color, sx / 2, sz / 2) : mat(color, o);
        this.add(UNIT, tmpM4.compose(tmpP.set(x, y, z), tmpQ.identity(), tmpS.set(sx, sy, sz)), material, o);
        if (!o.decor) solids.add(aabb(x, y, z, sx, sy, sz));
    }
    shape(geo, x, y, z, sx, sy, sz, rx, ry, rz, material, o) {
        tmpQ.setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0));
        this.add(geo, tmpM4.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)), material, o);
    }
    build(parent) {
        for (const g of this.groups.values()) {
            if (!g.geos.length) continue;
            const m = new T.Mesh(mergeGeometries(g.geos), g.material);
            m.castShadow = g.cast; m.receiveShadow = g.recv;
            m.matrixAutoUpdate = false;
            for (const x of g.geos) x.dispose();
            parent.add(m);
        }
        this.groups.clear();
    }
}
