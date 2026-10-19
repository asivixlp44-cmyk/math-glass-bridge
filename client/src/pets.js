import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { T, V3, scene, mat, texFrom, FONT, NEON_BOOST, toLambert } from './engine.js';
import { petDef } from '../../shared/config.js';

// Little floating school-supply pets that follow their owner: a rounded body, ears, shiny eyes,
// a math symbol on the belly, and a glow ring for the rarer ones.
const BODY = new RoundedBoxGeometry(1.6, 1.4, 1.4, 3, 0.45);
const EAR = new T.ConeGeometry(0.3, 0.55, 4);
const EYE = new T.SphereGeometry(0.17, 10, 8);
const SHINE = new T.SphereGeometry(0.06, 6, 4);
const WING = new T.BoxGeometry(0.9, 0.1, 0.6);
const HORN = new T.ConeGeometry(0.14, 0.7, 8);
const BADGE = new T.CircleGeometry(0.36, 20);
const GLOW = { Epic: 0xc46bff, Legendary: 0xffd028, Mythic: 0xff4a6a, Limited: 0xff8fd0 };
const symCache = new Map();
function symTex(ch) {
    if (!symCache.has(ch)) {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const x = c.getContext('2d');
        x.fillStyle = '#ffffff'; x.beginPath(); x.arc(32, 32, 30, 0, Math.PI * 2); x.fill();
        x.font = FONT(700, 40); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#16121f';
        x.fillText(ch, 32, 35);
        symCache.set(ch, texFrom(c));
    }
    return symCache.get(ch);
}

export function buildPet(id) {
    const d = petDef(id);
    const g = new T.Group();
    if (!d) return g;
    const dark = d.c === 0x16121f || d.c === 0x5a3cff;
    const bodyMat = toLambert({ color: d.c, roughness: 0.45, metalness: 0.05, emissive: dark ? 0x2a1c6a : 0x000000 });
    const body = new T.Mesh(BODY, bodyMat); body.castShadow = true; g.add(body);
    const earMat = new T.MeshLambertMaterial({ color: new T.Color(d.c).multiplyScalar(0.8) });
    for (const sx of [-0.45, 0.45]) { const e = new T.Mesh(EAR, earMat); e.position.set(sx, 0.9, 0); g.add(e); }
    const eyeMat = mat(0x16121f), white = mat(0xffffff);
    for (const sx of [-0.35, 0.35]) {
        const e = new T.Mesh(EYE, eyeMat); e.position.set(sx, 0.2, -0.68); g.add(e);
        const s = new T.Mesh(SHINE, white); s.position.set(sx + 0.05, 0.27, -0.82); g.add(s);
    }
    const blush = mat(0xff8fb0);
    for (const sx of [-0.55, 0.55]) { const b = new T.Mesh(SHINE, blush); b.scale.set(2.2, 1.2, 1); b.position.set(sx, -0.05, -0.7); g.add(b); }
    const badge = new T.Mesh(BADGE, new T.MeshBasicMaterial({ map: symTex(d.sym || '+'), transparent: true }));
    badge.position.set(0, -0.36, -0.72); badge.rotation.y = Math.PI; g.add(badge);
    if (/Owl|Dragon|Brain/.test(d.id)) {
        for (const sx of [-1, 1]) { const w = new T.Mesh(WING, earMat); w.position.set(sx * 1.1, 0.2, 0.1); w.rotation.z = sx * 0.4; w.name = 'wing'; g.add(w); }
    }
    if (d.id === 'Golden Genius') { const h = new T.Mesh(HORN, mat(0xffd028, { neon: true })); h.position.set(0, 1.05, -0.3); h.rotation.x = -0.3; g.add(h); }
    const glow = GLOW[d.r];
    if (glow) {
        const ring = new T.Mesh(new T.TorusGeometry(1.25, 0.08, 6, 28), new T.MeshBasicMaterial({ color: new T.Color(glow).multiplyScalar(NEON_BOOST * 1.6) }));
        ring.rotation.x = Math.PI / 2; ring.position.y = -0.95; ring.name = 'ring'; g.add(ring);
    }
    g.scale.setScalar(1.15);
    return g;
}

// The pets following one character. ids is the equipped list; update() eases each pet
// to its slot behind the owner and bobs it up and down.
export class PetPack {
    constructor() { this.ids = ''; this.pets = []; }
    set(ids) {
        const key = (ids || []).join('|');
        if (key === this.ids) return;
        this.ids = key;
        for (const p of this.pets) scene.remove(p.g);
        this.pets = (ids || []).map((id, i) => {
            const g = buildPet(id);
            scene.add(g);
            return { g, i, pos: new V3(), init: false };
        });
    }
    update(pos, facing, dt, t) {
        const n = this.pets.length;
        const fx = Math.sin(facing), fz = Math.cos(facing);
        const rx = Math.cos(facing), rz = -Math.sin(facing);
        for (const p of this.pets) {
            const side = n === 1 ? 0 : (p.i - (n - 1) / 2) * 3.2;
            const back = 4 + (p.i % 2) * 0.8;
            const tx = pos.x - fx * back + rx * side, tz = pos.z - fz * back + rz * side;
            const ty = pos.y + 2.4 + Math.sin(t * 3 + p.i * 1.7) * 0.35;
            if (!p.init || p.pos.distanceToSquared(pos) > 3600) { p.pos.set(tx, ty, tz); p.init = true; }
            const k = 1 - Math.exp(-dt * 7);
            p.pos.x += (tx - p.pos.x) * k; p.pos.y += (ty - p.pos.y) * k; p.pos.z += (tz - p.pos.z) * k;
            p.g.position.copy(p.pos);
            p.g.rotation.y = facing + Math.PI;
            for (const c of p.g.children) {
                if (c.name === 'wing') c.rotation.z = Math.sign(c.position.x) * (0.3 + Math.sin(t * 14) * 0.5);
                if (c.name === 'ring') c.rotation.z = t * 2;
            }
        }
    }
    dispose() { for (const p of this.pets) scene.remove(p.g); this.pets = []; this.ids = ''; }
}
