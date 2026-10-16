import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { T, V3, $, renderer, scene, camera, sun } from './engine.js';

// ----- quality presets -----
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
export const QUALITIES = {
    low: { label: 'Low', ratio: 0.85, shadows: false, bloom: false },
    medium: { label: 'Medium', ratio: 1, shadows: true, bloom: true },
    high: { label: 'High', ratio: 1.5, shadows: true, bloom: true },
};
let quality = isTouch ? 'medium' : 'high', chosen = false;
try { const q = localStorage.getItem('mgb_quality'); if (q) { quality = q; chosen = true; } } catch (e) { /* default */ }
if (!QUALITIES[quality]) quality = 'high';

// Neon materials are HDR (brighter than 1) so only they cross the bloom threshold;
// neutral tone mapping keeps every other colour close to its authored sRGB value.
renderer.toneMapping = T.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;

// Vignette + a touch of saturation, applied before tone mapping
const GradeShader = {
    uniforms: { tDiffuse: { value: null }, vig: { value: 0.28 }, sat: { value: 1.04 }, tint: { value: new T.Vector3(0, 0, 0) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float vig; uniform float sat; uniform vec3 tint; varying vec2 vUv;
        void main() {
            vec4 c = texture2D(tDiffuse, vUv);
            float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
            c.rgb = mix(vec3(l), c.rgb, sat);
            vec2 d = vUv - 0.5;
            c.rgb *= 1.0 - vig * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
            c.rgb += tint * smoothstep(0.1, 0.9, dot(d, d) * 2.6);
            gl_FragColor = c;
        }`,
};
let composer = null, bloomPass = null, gradePass = null;
function buildComposer() {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new T.Vector2(innerWidth / 2, innerHeight / 2), 0.3, 0.35, 1.0);
    composer.addPass(bloomPass);
    gradePass = new ShaderPass(GradeShader);
    composer.addPass(gradePass);
    composer.addPass(new OutputPass());
}
function applyQuality() {
    const q = QUALITIES[quality];
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.ratio));
    renderer.shadowMap.enabled = q.shadows;
    sun.castShadow = q.shadows;
    const size = quality === 'high' ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => { x.needsUpdate = true; }); } });
    if (q.bloom && !composer) buildComposer();
    resizeFx();
}
export function getQuality() { return quality; }
export function setQuality(q) {
    if (!QUALITIES[q]) return;
    quality = q; chosen = true;
    try { localStorage.setItem('mgb_quality', q); } catch (e) { /* ignore */ }
    applyQuality();
}
function resizeFx() {
    if (composer) {
        composer.setPixelRatio(renderer.getPixelRatio());
        composer.setSize(innerWidth, innerHeight);
        bloomPass.resolution.set(innerWidth / 2, innerHeight / 2);
    }
    lines.width = Math.round(innerWidth * Math.min(devicePixelRatio || 1, 1.5));
    lines.height = Math.round(innerHeight * Math.min(devicePixelRatio || 1, 1.5));
}
addEventListener('resize', resizeFx);

// Auto quality: if the frame rate stays low, step the quality down (unless the player picked one)
let slowT = 0, settleT = 4;
export function autoTune(dt) {
    if (chosen || document.hidden) return;
    settleT -= dt;
    if (settleT > 0) return;
    slowT = dt > 1 / 38 ? slowT + dt : Math.max(0, slowT - dt * 0.5);
    if (slowT > 4) {
        slowT = 0; settleT = 6;
        if (quality === 'high') quality = 'medium'; else if (quality === 'medium') quality = 'low'; else return;
        applyQuality();
        console.info('[fx] quality ->', quality);
    }
}
// Red edges while you fall (0..1)
let danger = 0;
export function setDanger(v) { danger = v; }
export function render() {
    if (QUALITIES[quality].bloom && composer) {
        gradePass.uniforms.tint.value.set(danger * 0.55, 0, danger * 0.05);
        composer.render();
    } else renderer.render(scene, camera);
}

// ----- speed lines (2D overlay) -----
const lines = $('#speedLines');
const lctx = lines.getContext('2d');
const streaks = Array.from({ length: 70 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), l: 0.1 + Math.random() * 0.25, w: 1 + Math.random() * 2.5 }));
let lineAmt = 0;
export function setSpeedLines(target, dt) {
    lineAmt += (target - lineAmt) * Math.min(1, dt * 6);
    const w = lines.width, h = lines.height;
    lctx.clearRect(0, 0, w, h);
    if (lineAmt < 0.02) return;
    const cx = w / 2, cy = h * 0.46, R = Math.hypot(w, h) / 2;
    lctx.lineCap = 'round';
    for (const s of streaks) {
        s.r += dt * (1.6 + s.l * 4);
        if (s.r > 1) { s.r = 0.35 + Math.random() * 0.2; s.a = Math.random() * Math.PI * 2; }
        const r0 = R * s.r, r1 = R * Math.min(1.1, s.r + s.l);
        lctx.strokeStyle = `rgba(255,255,255,${(0.7 * lineAmt * s.r).toFixed(3)})`;
        lctx.lineWidth = s.w;
        lctx.beginPath();
        lctx.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0);
        lctx.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1);
        lctx.stroke();
    }
}

// ----- soft sprite particles (dust, sparkles, fireworks) -----
export const softTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    return t;
})();
// Four-point twinkle for sparkles and coins
const starTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(32, 0); x.quadraticCurveTo(36, 28, 64, 32); x.quadraticCurveTo(36, 36, 32, 64); x.quadraticCurveTo(28, 36, 0, 32); x.quadraticCurveTo(28, 28, 32, 0); x.fill();
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    return t;
})();
const sprites = [];
const pool = [];
function spawn(pos, vel, color, size, life, opts) {
    opts = opts || {};
    let s = pool.pop();
    if (!s) { s = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthWrite: false })); }
    const m = s.material;
    m.map = opts.map || softTex;
    m.color.set(color);
    if (opts.hdr) m.color.multiplyScalar(opts.hdr);
    m.blending = opts.add ? T.AdditiveBlending : T.NormalBlending;
    m.opacity = opts.opacity || 1;
    m.rotation = opts.spin ? Math.random() * 6 : 0;
    m.needsUpdate = true;
    s.position.copy(pos); s.scale.setScalar(size);
    scene.add(s);
    sprites.push({ s, v: vel, life, max: life, grow: opts.grow || 0, grav: opts.grav || 0, drag: opts.drag || 0, size, fade0: opts.opacity || 1, spin: opts.spin || 0 });
}
export function dust(pos, n, strength) {
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = (2 + Math.random() * 4) * strength;
        spawn(new V3(pos.x + Math.cos(a) * 0.6, pos.y + 0.3, pos.z + Math.sin(a) * 0.6), new V3(Math.cos(a) * sp, 1.5 + Math.random() * 2, Math.sin(a) * sp),
            0xd8d0f8, 0.55 + Math.random() * 0.4, 0.35 + Math.random() * 0.2, { grow: 1.6, drag: 3.5, opacity: 0.35 });
    }
}
export function sparkleColumn(pos, color) {
    for (let i = 0; i < 22; i++) {
        const a = Math.random() * Math.PI * 2, r = 1.8 + Math.random() * 1.2;
        spawn(new V3(pos.x + Math.cos(a) * r, pos.y + Math.random() * 2, pos.z + Math.sin(a) * r), new V3(0, 7 + Math.random() * 8, 0),
            color, 0.35 + Math.random() * 0.35, 0.7 + Math.random() * 0.4, { map: starTex, add: true, hdr: 1.3, drag: 0.6, spin: 1 });
    }
}
// A ring of twinkles bursting from a glass pane you got right
export function sparkleBurst(pos, color, r) {
    for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2 + Math.random() * 0.3, sp = 6 + Math.random() * 6;
        spawn(new V3(pos.x + Math.cos(a) * r * 0.4, pos.y + 0.4, pos.z + Math.sin(a) * r * 0.4), new V3(Math.cos(a) * sp, 4 + Math.random() * 6, Math.sin(a) * sp),
            i % 3 ? color : 0xffffff, 0.45 + Math.random() * 0.4, 0.6 + Math.random() * 0.3, { map: starTex, add: true, hdr: 1.35, grav: 12, drag: 1.8, spin: 1 });
    }
}
// Trails: glowing motes left behind while you move
export function emitTrail(at, colors, n) {
    if (!colors || !colors.length) return;
    for (let i = 0; i < (n || 1); i++) {
        const c = colors[(Math.random() * colors.length) | 0];
        spawn(new V3(at.x + (Math.random() - 0.5) * 1.6, at.y + 0.4 + Math.random() * 1.6, at.z + (Math.random() - 0.5) * 1.6),
            new V3((Math.random() - 0.5) * 1.5, -0.5 - Math.random() * 1.5, (Math.random() - 0.5) * 1.5), c,
            0.55 + Math.random() * 0.5, 0.7 + Math.random() * 0.4, { add: true, hdr: 1.1, grow: -0.5, opacity: 0.8 });
    }
}
// Cash bills fluttering up (right answers, chests)
export function cashBurst(pos, n) {
    for (let i = 0; i < (n || 10); i++) {
        const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 5;
        spawn(new V3(pos.x, pos.y + 1, pos.z), new V3(Math.cos(a) * sp, 8 + Math.random() * 8, Math.sin(a) * sp),
            Math.random() < 0.7 ? 0x4ee86a : 0xffe14a, 0.5 + Math.random() * 0.4, 0.9 + Math.random() * 0.4, { map: starTex, add: true, hdr: 1.2, grav: 18, drag: 1.2, spin: 1 });
    }
}

// Expanding neon ring on the ground (right answers, landings)
const rings = [];
export function ring(pos, color, maxR, life) {
    const m = new T.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending });
    m.color.multiplyScalar(1.4);
    const mesh = new T.Mesh(new T.RingGeometry(0.8, 1, 48), m);
    mesh.rotation.x = -Math.PI / 2; mesh.position.copy(pos).setY(pos.y + 0.2);
    scene.add(mesh);
    rings.push({ mesh, t: 0, life: life || 0.7, maxR: maxR || 9 });
}

// Fireworks: a glowing rocket that bursts into coloured sparks
const rockets = [];
const FW_COLORS = [0xffd028, 0x46ec50, 0x28c8ff, 0xff3fa0, 0xc428ff, 0xff6e14];
export function fireworks(center, count, onBurst) {
    for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 12;
        rockets.push({
            p: new V3(center.x + Math.cos(a) * r, center.y + 1, center.z + Math.sin(a) * r),
            v: new V3((Math.random() * 2 - 1) * 3, 34 + Math.random() * 12, (Math.random() * 2 - 1) * 3),
            t: 0.7 + Math.random() * 0.3 + i * 0.18, trail: 0, color: FW_COLORS[(Math.random() * FW_COLORS.length) | 0], onBurst,
        });
    }
}
function burstFw(p, color) {
    for (let i = 0; i < 46; i++) {
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        const sp = 16 + Math.random() * 8;
        spawn(p.clone(), new V3(s * Math.cos(th) * sp, u * sp, s * Math.sin(th) * sp), i % 5 ? color : 0xffffff, 0.9 + Math.random() * 0.5, 1.1 + Math.random() * 0.5, { add: true, hdr: 1.6, grav: 14, drag: 1.4 });
    }
}

export function updateFx(dt) {
    for (let i = sprites.length - 1; i >= 0; i--) {
        const p = sprites[i];
        p.life -= dt;
        if (p.life <= 0) { scene.remove(p.s); pool.push(p.s); sprites.splice(i, 1); continue; }
        p.v.y -= p.grav * dt;
        if (p.drag) p.v.multiplyScalar(Math.exp(-p.drag * dt));
        p.s.position.addScaledVector(p.v, dt);
        const k = p.life / p.max;
        p.s.material.opacity = p.fade0 * Math.min(1, k * 2);
        if (p.spin) p.s.material.rotation += dt * 3;
        if (p.grow) p.s.scale.setScalar(Math.max(0.05, p.size * (1 + p.grow * (1 - k))));
    }
    for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.t += dt;
        const k = r.t / r.life;
        if (k >= 1) { scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); rings.splice(i, 1); continue; }
        const e = 1 - Math.pow(1 - k, 3);
        r.mesh.scale.setScalar(1 + e * r.maxR);
        r.mesh.material.opacity = 1 - k;
    }
    for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.v.y -= 20 * dt;
        r.p.addScaledVector(r.v, dt);
        r.trail -= dt;
        if (r.trail <= 0) { r.trail = 0.03; spawn(r.p.clone(), new V3(0, -2, 0), 0xffe7a8, 0.7, 0.35, { add: true, hdr: 1.4 }); }
        r.t -= dt;
        if (r.t <= 0) { burstFw(r.p, r.color); if (r.onBurst) r.onBurst(); rockets.splice(i, 1); }
    }
}

applyQuality();
