import { T, V3, scene, camera, renderer, texFrom, tickers } from './engine.js';
import { rngFrom, WORLDS } from '../../shared/config.js';

// Deep space around the journey. The nebula is expensive to compute, so it is baked once per
// world into a cube map and the sky just samples it (crossfading when you enter a new world).
// Twinkling stars, a ringed gas giant, a moon, asteroids, shooting stars, a glow in the abyss
// and world-tinted space dust (snow, embers, bubbles...) sit on top.
const rng = rngFrom(424242);

// ----- the nebula generator (only used to bake) -----
const genMat = new T.ShaderMaterial({
    uniforms: { ca: { value: new T.Color() }, cb: { value: new T.Color() }, low: { value: new T.Color() }, mid: { value: new T.Color() }, top: { value: new T.Color() } },
    vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
        uniform vec3 ca; uniform vec3 cb; uniform vec3 low; uniform vec3 mid; uniform vec3 top; varying vec3 vP;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float noise(vec3 x) {
            vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                       mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }
        void main() {
            vec3 d = normalize(vP);
            vec3 col = mix(low, mid, smoothstep(-0.6, 0.1, d.y));
            col = mix(col, top, smoothstep(0.1, 0.9, d.y));
            float n1 = fbm(d * 2.2), n2 = fbm(d * 3.1 + vec3(5.2, 1.3, 0.0));
            float band = exp(-pow((d.y - 0.18 + 0.25 * d.x) * 2.4, 2.0));
            col += ca * pow(smoothstep(0.42, 0.85, n1), 1.6) * (0.3 + band * 0.8);
            col += cb * pow(smoothstep(0.48, 0.9, n2), 1.8) * (0.22 + band * 0.7);
            col += vec3(0.8, 0.45, 0.35) * pow(smoothstep(0.62, 0.95, n1 * n2 * 1.6), 2.0) * 0.22;
            vec3 sp = d * 380.0; float st = hash(floor(sp));
            col += vec3(smoothstep(0.986, 1.0, st) * smoothstep(0.42, 0.0, length(fract(sp) - 0.5))) * (0.5 + 0.5 * band);
            gl_FragColor = vec4(col, 1.0);
        }`,
    side: T.BackSide, depthWrite: false,
});
const bakeScene = new T.Scene();
bakeScene.add(new T.Mesh(new T.SphereGeometry(100, 64, 32), genMat));
const targets = [0, 1].map(() => new T.WebGLCubeRenderTarget(512, { type: T.HalfFloatType, generateMipmaps: false }));
const cubeCam = new T.CubeCamera(1, 1000, targets[0]);
function bake(target, w) {
    const s = WORLDS[w].sky, lin = (h) => new T.Color(h);
    genMat.uniforms.ca.value.copy(lin(s.a)).multiplyScalar(0.75);
    genMat.uniforms.cb.value.copy(lin(s.b)).multiplyScalar(0.75);
    genMat.uniforms.low.value.copy(lin(s.low));
    genMat.uniforms.mid.value.copy(lin(s.mid));
    genMat.uniforms.top.value.copy(lin(s.top));
    cubeCam.renderTarget = target;
    const tm = renderer.toneMapping;
    renderer.toneMapping = T.NoToneMapping;
    cubeCam.update(renderer, bakeScene);
    renderer.toneMapping = tm;
}

// ----- the sky we see: two baked cubes and a crossfade -----
const skyMat = new T.ShaderMaterial({
    uniforms: { a: { value: targets[0].texture }, b: { value: targets[1].texture }, k: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform samplerCube a; uniform samplerCube b; uniform float k; varying vec3 vP;
        void main() { vec3 d = normalize(vP); gl_FragColor = vec4(mix(textureCube(a, d).rgb, textureCube(b, d).rgb, k), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }`,
    side: T.BackSide, depthWrite: false, fog: false,
});
const sky = new T.Mesh(new T.SphereGeometry(5000, 32, 16), skyMat);
sky.renderOrder = -10;
sky.frustumCulled = false;
scene.add(sky);
let shown = 0, cur = 0, fadeK = 0, fading = false, baked = false;

// ----- bright stars that twinkle (points, additive) -----
const starPts = (() => {
    const n = 1500, p = new Float32Array(n * 3), c = new Float32Array(n * 3), s = new Float32Array(n);
    const col = new T.Color();
    for (let i = 0; i < n; i++) {
        const u = rng() * 2 - 1, th = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        p.set([Math.cos(th) * r * 4200, u * 4200, Math.sin(th) * r * 4200], i * 3);
        col.setHSL(rng() < 0.7 ? 0.62 : rng() * 0.15 + 0.05, 0.5, 0.75 + rng() * 0.25);
        c.set([col.r, col.g, col.b], i * 3);
        s[i] = rng();
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(p, 3));
    g.setAttribute('color', new T.BufferAttribute(c, 3));
    g.setAttribute('seed', new T.BufferAttribute(s, 1));
    const m = new T.ShaderMaterial({
        uniforms: { time: { value: 0 }, scale: { value: 1 } },
        vertexShader: `attribute float seed; attribute vec3 color; uniform float time; uniform float scale; varying vec3 vC; varying float vA;
            void main() { vC = color; vA = 0.5 + 0.5 * sin(time * (1.0 + seed * 3.0) + seed * 60.0);
                vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_Position.z = gl_Position.w * 0.9999;
                gl_PointSize = (1.4 + seed * seed * 4.0) * scale; }`,
        fragmentShader: `varying vec3 vC; varying float vA; void main() { vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d));
            a += smoothstep(0.08, 0.0, abs(d.x)) * smoothstep(0.5, 0.0, abs(d.y)) * 0.4 + smoothstep(0.08, 0.0, abs(d.y)) * smoothstep(0.5, 0.0, abs(d.x)) * 0.4;
            gl_FragColor = vec4(vC * 1.2, a * vA);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }`,
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
    });
    const pts = new T.Points(g, m);
    pts.frustumCulled = false; pts.renderOrder = -9;
    scene.add(pts);
    return pts;
})();

// ----- planets and galaxies, far away (they follow the camera so they never get closer) -----
const far = new T.Group();
scene.add(far);
function bandTexture(colors, seed) {
    const r = rngFrom(seed);
    const c = document.createElement('canvas'); c.width = 64; c.height = 512;
    const x = c.getContext('2d');
    let y = 0;
    while (y < 512) { const h = 6 + r() * 34; x.fillStyle = colors[(r() * colors.length) | 0]; x.fillRect(0, y, 64, h + 1); y += h; }
    x.globalAlpha = 0.35;
    for (let i = 0; i < 40; i++) { x.fillStyle = colors[(r() * colors.length) | 0]; x.fillRect(0, r() * 512, 64, 2 + r() * 6); }
    return texFrom(c);
}
const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 60, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(0.35, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    return texFrom(c);
})();
function planet(pos, r, colors, seed, glow, ringCol) {
    const g = new T.Group();
    g.position.copy(pos);
    const body = new T.Mesh(new T.SphereGeometry(r, 48, 24), new T.MeshLambertMaterial({ map: bandTexture(colors, seed), fog: false }));
    body.rotation.z = 0.3;
    g.add(body);
    const halo = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: new T.Color(glow), transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, opacity: 0.8 }));
    halo.scale.setScalar(r * 2.9);
    g.add(halo);
    if (ringCol) {
        const rc = document.createElement('canvas'); rc.width = 256; rc.height = 4;
        const rx = rc.getContext('2d');
        const rr = rngFrom(seed + 7);
        for (let i = 0; i < 256; i++) { rx.fillStyle = `rgba(${ringCol},${(0.15 + rr() * 0.7) * (i > 20 && i < 240 ? 1 : 0.2)})`; rx.fillRect(i, 0, 1, 4); }
        const ringGeo = new T.RingGeometry(r * 1.35, r * 2.3, 96, 1);
        const pos2 = ringGeo.attributes.position, uv = ringGeo.attributes.uv, v = new V3();
        for (let i = 0; i < pos2.count; i++) { v.fromBufferAttribute(pos2, i); uv.setXY(i, (v.length() - r * 1.35) / (r * 0.95), 0.5); }
        const ringM = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ map: texFrom(rc), transparent: true, side: T.DoubleSide, depthWrite: false, fog: false }));
        ringM.rotation.x = -Math.PI / 2 + 0.35; ringM.rotation.y = 0.2;
        g.add(ringM);
    }
    far.add(g);
    tickers.push((dt) => { body.rotation.y += dt * 0.01; });
    return g;
}
planet(new V3(-1500, 520, 1900), 520, ['#ff8fd0', '#c46bff', '#8a3cff', '#ffb0e0', '#6a2cc8', '#ff6bb0'], 11, 0xc84ab8, '255,200,240');
planet(new V3(1300, 300, 1500), 150, ['#6fe0ff', '#3a8cff', '#9af0ff', '#2f6bd8'], 23, 0x3a90d0, null);
planet(new V3(700, -260, -2200), 260, ['#ffb35a', '#ff7a3a', '#ffd690', '#e85a2a'], 31, 0xc86a2a, '255,220,170');
const galaxyTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.translate(128, 128);
    const r = rngFrom(99);
    for (let i = 0; i < 2600; i++) {
        const arm = i % 2, t = r() * 4.2, a = t * 1.6 + arm * Math.PI + (r() - 0.5) * 0.5, d = t * 26 + (r() - 0.5) * 10;
        x.fillStyle = `rgba(${200 + r() * 55},${150 + r() * 80},255,${0.2 + r() * 0.45})`;
        x.fillRect(Math.cos(a) * d, Math.sin(a) * d * 0.55, 1.6, 1.6);
    }
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 40);
    g.addColorStop(0, 'rgba(255,240,220,0.9)'); g.addColorStop(1, 'rgba(255,200,255,0)');
    x.fillStyle = g; x.fillRect(-40, -40, 80, 80);
    return texFrom(c);
})();
for (const [x, y, z, s, rot] of [[2600, 1400, -800, 900, 0.5], [-2400, 900, -1800, 600, 2.1]]) {
    const sp = new T.Sprite(new T.SpriteMaterial({ map: galaxyTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, rotation: rot, opacity: 0.8 }));
    sp.position.set(x, y, z); sp.scale.setScalar(s);
    far.add(sp);
}

// ----- the abyss: a soft glow far below the glass -----
const abyss = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.6)'); g.addColorStop(0.4, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const m = new T.Mesh(new T.PlaneGeometry(2600, 2600), new T.MeshBasicMaterial({ map: texFrom(c), color: 0x8a3cff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
    m.rotation.x = -Math.PI / 2;
    scene.add(m);
    return m;
})();

// ----- asteroids drifting around (they recycle ahead of the player) -----
const ROCK = (() => {
    const g = new T.IcosahedronGeometry(1, 1);
    const p = g.attributes.position, v = new V3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.multiplyScalar(0.8 + Math.abs(Math.sin(v.x * 4.1 + v.y * 2.3 + v.z * 3.7)) * 0.35); p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals();
    return g;
})();
const ROCKS_N = 48;
const rockMesh = new T.InstancedMesh(ROCK, new T.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), ROCKS_N);
rockMesh.frustumCulled = false;
const rocks = [];
const rm4 = new T.Matrix4(), rq = new T.Quaternion(), re = new T.Euler(), rs = new V3(), rp = new V3(), rcol = new T.Color();
for (let i = 0; i < ROCKS_N; i++) {
    const s = 2 + rng() * rng() * 20;
    rocks.push({ ox: (rng() < 0.5 ? -1 : 1) * (90 + rng() * 300), oy: -90 + rng() * 200, oz: rng() * 1200 - 300, s: new V3(s, s * (0.7 + rng() * 0.5), s * (0.8 + rng() * 0.4)), r: new V3(rng() * 6, rng() * 6, rng() * 6), w: new V3((rng() - 0.5) * 0.2, (rng() - 0.5) * 0.2, 0), bob: rng() * 6 });
    rockMesh.setColorAt(i, rcol.setHex([0x4a3a78, 0x5a4890, 0x3a2e68, 0x6a5aa8][i % 4]));
}
scene.add(rockMesh);

// ----- shooting stars -----
const meteors = [];
const meteorMat = new T.MeshBasicMaterial({ color: new T.Color(0xcfe8ff).multiplyScalar(2), transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false });
const METEOR = new T.CylinderGeometry(0.0, 1.2, 1, 6, 1, true).rotateX(Math.PI / 2);
let nextMeteor = 3;

// ----- space dust near the camera, tinted and moving per world -----
const DUST = {
    station: { c: 0xbfb0ff, v: [0, 0.4, 0], size: 0.55 }, candy: { c: 0xffa0e0, v: [0, -0.8, 0], size: 0.7 }, ice: { c: 0xffffff, v: [0.6, -5, 0.3], size: 0.8 },
    jungle: { c: 0xb8ff7a, v: [0.2, 0.6, 0], size: 0.6 }, ocean: { c: 0x9af0ff, v: [0, 3.2, 0], size: 0.75 }, desert: { c: 0xffd890, v: [3, 0.2, 0], size: 0.5 },
    lava: { c: 0xff8a3a, v: [0, 3.5, 0], size: 0.65 }, cyber: { c: 0x5affe0, v: [0, -1.5, 0], size: 0.5 }, rainbow: { c: 0xffffff, v: [0, 0.8, 0], size: 0.65 },
    heaven: { c: 0xffe07a, v: [0, 0.5, 0], size: 0.7 },
};
const dust = (() => {
    const n = 360, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) p.set([(rng() - 0.5) * 200, (rng() - 0.5) * 120, (rng() - 0.5) * 200], i * 3);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3));
    const m = new T.PointsMaterial({ color: 0xbfb0ff, size: 0.55, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true, fog: false });
    const pts = new T.Points(g, m); pts.frustumCulled = false;
    scene.add(pts);
    return { pts, p, n, v: new V3(0, 0.4, 0) };
})();
const fogTarget = new T.Color(WORLDS[0].fog), abyssTarget = new T.Color(WORLDS[0].neon), dustTarget = new T.Color(DUST.station.c);

// Enter world w: bake its sky into the spare cube and fade to it
export function setWorld(w) {
    w = Math.max(0, Math.min(WORLDS.length - 1, w));
    if (!baked) { bake(targets[0], w); baked = true; cur = w; shown = 0; skyMat.uniforms.a.value = targets[0].texture; skyMat.uniforms.k.value = 0; }
    if (w === cur) return;
    cur = w;
    const spare = 1 - shown;
    bake(targets[spare], w);
    skyMat.uniforms.a.value = targets[shown].texture;
    skyMat.uniforms.b.value = targets[spare].texture;
    fadeK = 0; fading = true; shown = spare;
    const d = DUST[WORLDS[w].id];
    fogTarget.set(WORLDS[w].fog); abyssTarget.set(WORLDS[w].neon); dustTarget.set(d.c);
    dust.v.set(d.v[0], d.v[1], d.v[2]); dust.pts.material.size = d.size;
}

const tmp = new V3();
export function updateSky(dt, t) {
    if (!baked) setWorld(0);
    if (fading) {
        fadeK = Math.min(1, fadeK + dt / 2.5);
        skyMat.uniforms.k.value = fadeK;
        if (fadeK >= 1) { fading = false; skyMat.uniforms.a.value = targets[shown].texture; skyMat.uniforms.k.value = 0; }
    }
    starPts.material.uniforms.time.value = t;
    starPts.material.uniforms.scale.value = Math.min(2, (innerHeight / 900) * Math.min(devicePixelRatio || 1, 1.5));
    const c = camera.position;
    sky.position.copy(c);
    starPts.position.copy(c);
    far.position.copy(c);
    scene.fog.color.lerp(fogTarget, Math.min(1, dt * 1.5));
    abyss.material.color.lerp(abyssTarget, Math.min(1, dt * 1.5));
    abyss.position.set(c.x, Math.min(c.y - 300, -200), c.z + 200);
    abyss.material.opacity = 0.5 + Math.sin(t * 0.7) * 0.1;
    dust.pts.material.color.lerp(dustTarget, Math.min(1, dt * 1.5));
    // Asteroids ride along with the camera in a wide loop, so there are always some around
    for (let i = 0; i < ROCKS_N; i++) {
        const r = rocks[i];
        r.r.addScaledVector(r.w, dt);
        let z = r.oz - ((c.z * 0.85) % 1200);
        if (z < -300) z += 1200;
        rp.set(c.x * 0.6 + r.ox, c.y * 0.7 + r.oy + Math.sin(t * 0.3 + r.bob) * 3, c.z + z);
        rm4.compose(rp, rq.setFromEuler(re.set(r.r.x, r.r.y, r.r.z)), r.s);
        rockMesh.setMatrixAt(i, rm4);
    }
    rockMesh.instanceMatrix.needsUpdate = true;
    // Dust wraps around the camera
    const p = dust.p, v = dust.v;
    for (let i = 0; i < dust.n; i++) {
        const j = i * 3;
        p[j] += (v.x + Math.sin(t * 0.2 + i) * 0.5) * dt; p[j + 1] += v.y * dt; p[j + 2] += v.z * dt;
        const dx = p[j] - c.x, dy = p[j + 1] - c.y, dz = p[j + 2] - c.z;
        if (dx > 100) p[j] -= 200; else if (dx < -100) p[j] += 200;
        if (dy > 60) p[j + 1] -= 120; else if (dy < -60) p[j + 1] += 120;
        if (dz > 100) p[j + 2] -= 200; else if (dz < -100) p[j + 2] += 200;
    }
    dust.pts.geometry.attributes.position.needsUpdate = true;
    // Shooting stars every few seconds, far away across the sky
    nextMeteor -= dt;
    if (nextMeteor <= 0) {
        nextMeteor = 3 + Math.random() * 6;
        const m = new T.Mesh(METEOR, meteorMat);
        const a = Math.random() * Math.PI * 2;
        m.position.set(c.x + Math.cos(a) * 900, c.y + 250 + Math.random() * 500, c.z + Math.sin(a) * 900);
        const vel = new V3(-Math.cos(a) * 0.4 + (Math.random() - 0.5), -0.35 - Math.random() * 0.3, -Math.sin(a) * 0.4 + (Math.random() - 0.5)).normalize().multiplyScalar(900);
        m.scale.set(2.2, 2.2, 90);
        m.lookAt(tmp.copy(m.position).add(vel));
        scene.add(m);
        meteors.push({ m, v: vel, t: 1.2 });
    }
    for (let i = meteors.length - 1; i >= 0; i--) {
        const mt = meteors[i];
        mt.t -= dt;
        mt.m.position.addScaledVector(mt.v, dt);
        if (mt.t <= 0) { scene.remove(mt.m); meteors.splice(i, 1); }
    }
}
