import * as THREE from 'three';

// ---------------------------------------------------------------------------
// The crest: seven real components cut from crest.png (1254 x 1254).
// Pixel boxes come from pieces/manifest.json. World units: the crest is S wide.
// ---------------------------------------------------------------------------
const IMG = 1254;
const S = 10;
const K = S / IMG;
const HALF = IMG / 2;

// Back to front. `z` is the resting layer offset; `apart` is the opening pose
// (offset from home, in world units) for landscape and portrait layouts;
// `tilt` is the resting rotation while apart (degrees, kept small so every
// piece stays recognisable); `spin` is the extra rotation added during flight
// (full turns are invisible at the hold); `arc` bulges the flight path.
const PIECES = [
  { name: 'banner',   label: 'Garfield High School banner', x: 12,  y: 372, w: 1238, h: 849, z: -0.18,
    apart: { land: [0.6, -3.8, -1.0], port: [0, -7.05, -1.0] }, tilt: [16, 0, 4],
    spin: [-60, 0, 8],    arc: [0, -0.5, 2.6], start: 0.95, dur: 0.82 },
  { name: 'frame',    label: 'Shield frame',                x: 379, y: 277, w: 669,  h: 749, z: -0.06,
    apart: { land: [-1.4, 0.4, -2.5], port: [-0.4, -2.4, -2.0] }, tilt: [0, 24, 0],
    spin: [14, -50, 0],   arc: [0, 0.4, 3.0], start: 0.85, dur: 0.82 },
  { name: 'mountain', label: 'Mountain panel',              x: 420, y: 313, w: 614,  h: 346, z: 0,
    apart: { land: [5.2, 3.0, 1.4], port: [2.0, 4.3, 1.4] }, tilt: [0, -22, 6],
    spin: [20, 360, 0],   arc: [1.2, 1.0, 4.2], start: 1.9, dur: 0.64, panel: true },
  { name: 'needle',   label: 'Space Needle panel',          x: 451, y: 571, w: 256,  h: 422, z: 0,
    apart: { land: [6.4, 1.5, 1.8], port: [3.5, 2.85, 1.6] }, tilt: [0, -24, 0],
    spin: [-18, -360, 0], arc: [2.0, 0.2, 4.6], start: 2.15, dur: 0.64, panel: true },
  { name: 'shoe',     label: 'Winged shoe panel',           x: 721, y: 570, w: 256,  h: 421, z: 0,
    apart: { land: [7.2, -1.9, 1.4], port: [2.1, -0.8, 1.4] }, tilt: [0, -22, -4],
    spin: [16, 360, 0],   arc: [1.4, -0.8, 4.2], start: 2.4, dur: 0.64, panel: true },
  { name: 'g',        label: 'Gothic G and base',           x: 499, y: 13,  w: 458,  h: 324, z: 0.10,
    apart: { land: [-0.8, 1.7, 1.0], port: [-0.8, 5.0, 1.0] }, tilt: [0, 10, -12],
    spin: [-30, 0, -360], arc: [0.2, 1.8, 3.2], start: 1.15, dur: 0.82 },
  { name: 'bulldog',  label: 'Bulldog',                     x: 33,  y: 360, w: 434,  h: 714, z: 0.16,
    apart: { land: [-4.0, 0.9, 1.2], port: [0, 4.3, 1.0] }, tilt: [0, -18, 4],
    spin: [6, -42, -16],  arc: [-1.4, 0.8, 3.6], start: 1.05, dur: 0.82 },
];

const T_HOLD = 0.85;               // opening hold
const T_LOCK = 3.05;               // the crest is complete
const T_END = 3.5;                 // settle finished
const APART_SCALE_MAX = 0.9;

const DEG = Math.PI / 180;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
const easeInOutCubic = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const flashEl = $('#flash');
const captionEl = $('#caption');
const loadingEl = $('#loading');
const replayBtn = $('#replay');
const separateBtn = $('#separate');
const pauseBtn = $('#pause');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Renderer, camera, scene
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x08030f, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x08030f, 40, 80);
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
const rig = new THREE.Group();          // orbit + scale
const crest = new THREE.Group();        // the seven pieces
rig.add(crest);
scene.add(rig);

// ---------------------------------------------------------------------------
// Background: glow sprite, orbital rings, star field
// ---------------------------------------------------------------------------
function radialTexture(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: radialTexture(256, [[0, 'rgba(150,80,255,0.9)'], [0.35, 'rgba(110,40,200,0.45)'], [1, 'rgba(60,10,120,0)']]),
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35,
}));
glow.scale.set(18, 18, 1);
glow.position.z = -2.5;
rig.add(glow);

const rings = new THREE.Group();
const RING_SPECS = [[7.4, 1.25, 0.2, 0.3], [8.2, 1.42, -0.5, 0.22], [6.8, 1.1, 1.1, 0.16]];
for (const [r, rx, rz, op] of RING_SPECS) {
  const pts = new THREE.EllipseCurve(0, 0, r, r * 0.92, 0, Math.PI * 2, false, 0).getPoints(160);
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const ring = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: 0xb07cff, transparent: true, opacity: op, depthWrite: false }));
  ring.rotation.set(rx, 0, rz);
  ring.userData = { r, op };
  rings.add(ring);
}
rig.add(rings);

const pointVert = `
  attribute float aSize; attribute float aPhase; attribute float aLife;
  varying float vAlpha; uniform float uTime;
  void main() {
    float tw = 0.55 + 0.45 * sin(uTime * (0.8 + aPhase * 1.7) + aPhase * 40.0);
    vAlpha = tw * aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const pointFrag = `
  varying float vAlpha; uniform vec3 uColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.15, d) * vAlpha;
    gl_FragColor = vec4(uColor, a);
  }`;
function pointCloud(n, color) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(n), 1));
  geo.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(n), 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: pointVert, fragmentShader: pointFrag,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

const STAR_COUNT = 520;
const stars = pointCloud(STAR_COUNT, 0xc9a8ff);
{
  const p = stars.geometry.attributes.position.array;
  const sz = stars.geometry.attributes.aSize.array;
  const ph = stars.geometry.attributes.aPhase.array;
  const lf = stars.geometry.attributes.aLife.array;
  for (let i = 0; i < STAR_COUNT; i++) {
    p[i * 3] = (Math.random() - 0.5) * 70;
    p[i * 3 + 1] = (Math.random() - 0.5) * 50;
    p[i * 3 + 2] = -6 - Math.random() * 30;
    sz[i] = 0.5 + Math.random() * 1.6;
    ph[i] = Math.random();
    lf[i] = 0.35 + Math.random() * 0.5;
  }
}
scene.add(stars);

// Trails: sparks spawned behind pieces in flight.
const TRAIL_COUNT = 360;
const trail = pointCloud(TRAIL_COUNT, 0xd8b8ff);
const trailVel = new Float32Array(TRAIL_COUNT * 3);
const trailAge = new Float32Array(TRAIL_COUNT);   // seconds left; <= 0 is dead
let trailCursor = 0;
{
  const lf = trail.geometry.attributes.aLife.array;
  const ph = trail.geometry.attributes.aPhase.array;
  for (let i = 0; i < TRAIL_COUNT; i++) { lf[i] = 0; ph[i] = Math.random(); }
}
rig.add(trail);
const tmpV = new THREE.Vector3();
function spawnSpark(mesh, halfW, halfH) {
  const i = trailCursor;
  trailCursor = (trailCursor + 1) % TRAIL_COUNT;
  tmpV.set((Math.random() - 0.5) * halfW * 1.4, (Math.random() - 0.5) * halfH * 1.4, 0);
  mesh.localToWorld(tmpV);
  rig.worldToLocal(tmpV);
  const p = trail.geometry.attributes.position.array;
  p[i * 3] = tmpV.x; p[i * 3 + 1] = tmpV.y; p[i * 3 + 2] = tmpV.z;
  trailVel[i * 3] = (Math.random() - 0.5) * 1.2;
  trailVel[i * 3 + 1] = (Math.random() - 0.5) * 1.2;
  trailVel[i * 3 + 2] = (Math.random() - 0.5) * 1.2 - 0.6;
  trailAge[i] = 0.55 + Math.random() * 0.35;
  trail.geometry.attributes.aSize.array[i] = 0.8 + Math.random() * 1.8;
}
function updateTrail(dt) {
  const p = trail.geometry.attributes.position.array;
  const lf = trail.geometry.attributes.aLife.array;
  let any = false;
  for (let i = 0; i < TRAIL_COUNT; i++) {
    if (trailAge[i] <= 0) { lf[i] = 0; continue; }
    trailAge[i] -= dt;
    p[i * 3] += trailVel[i * 3] * dt;
    p[i * 3 + 1] += trailVel[i * 3 + 1] * dt;
    p[i * 3 + 2] += trailVel[i * 3 + 2] * dt;
    lf[i] = clamp(trailAge[i] / 0.5);
    any = true;
  }
  trail.geometry.attributes.position.needsUpdate = true;
  trail.geometry.attributes.aLife.needsUpdate = true;
  trail.geometry.attributes.aSize.needsUpdate = true;
  trail.visible = any;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
const LAYERS = 3;            // faux thickness behind each face
const LAYER_GAP = 0.035;
const loader = new THREE.TextureLoader();
const maxAniso = renderer.capabilities.getMaxAnisotropy();

async function buildPieces() {
  const textures = await Promise.all(PIECES.map((p) => loader.loadAsync(p.file || `pieces/${p.name}.png`)));
  PIECES.forEach((p, i) => {
    const tex = textures[i];
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;

    const w = p.w * K, h = p.h * K;
    const geo = new THREE.PlaneGeometry(w, h);
    const group = new THREE.Group();
    group.renderOrder = i;

    for (let l = LAYERS; l >= 1; l--) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, alphaTest: 0.08, depthWrite: true,
        color: new THREE.Color().setHSL(0.76, 0.75, 0.22 - l * 0.03),
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.z = -l * LAYER_GAP;
      m.renderOrder = i * 10 + (LAYERS - l);
      group.add(m);
    }
    const face = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, alphaTest: 0.08, depthWrite: true, side: THREE.FrontSide,
    }));
    face.renderOrder = i * 10 + LAYERS;
    group.add(face);

    p.home = new THREE.Vector3((p.x + p.w / 2 - HALF) * K, -(p.y + p.h / 2 - HALF) * K, p.z);
    p.halfW = w / 2; p.halfH = h / 2;
    p.group = group;
    p.face = face;
    p.phase = Math.random() * Math.PI * 2;
    p.fly = new THREE.Vector3();
    crest.add(group);
  });
}

// ---------------------------------------------------------------------------
// Layout: camera distance, apart poses and scale so everything fits
// ---------------------------------------------------------------------------
const layout = { portrait: false, apartScale: APART_SCALE_MAX, apartCenter: new THREE.Vector3(), yPan: 0 };

function computeLayout() {
  const W = innerWidth, H = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  layout.portrait = W / H < 0.9;

  const t = Math.tan(camera.fov / 2 * DEG);
  const headH = $('header').getBoundingClientRect().bottom;
  const footH = H - $('footer').getBoundingClientRect().top;
  const capH = 28;
  const usablePx = Math.max(120, H - headH - footH - capH);   // between the header and the caption
  const fh = layout.portrait ? 0.62 : 0.78;
  const fw = layout.portrait ? 0.84 : 0.78;
  const crestPx = Math.min(fw * W, fh * usablePx);            // assembled crest size on screen
  const visH = S * H / crestPx, visW = visH * camera.aspect;
  const dist = visH / (2 * t);
  const upp = visH / H;                          // world units per css px
  layout.yPan = -((footH + capH) - headH) / 2 * upp;   // content centre sits between header and controls
  camera.position.set(0, layout.yPan, dist);
  camera.lookAt(0, layout.yPan, 0);
  camera.updateProjectionMatrix();

  // Bounding box of the opening composition (no rotation) → scale + centre.
  const key = layout.portrait ? 'port' : 'land';
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of PIECES) {
    if (!p.home) continue;
    const [dx, dy] = p.apart[key];
    const cx = p.home.x + dx, cy = p.home.y + dy;
    x0 = Math.min(x0, cx - p.halfW); x1 = Math.max(x1, cx + p.halfW);
    y0 = Math.min(y0, cy - p.halfH); y1 = Math.max(y1, cy + p.halfH);
  }
  if (!isFinite(x0)) return;
  const usableH = usablePx * upp;
  layout.apartScale = Math.min(APART_SCALE_MAX, (visW * 0.94) / (x1 - x0), (usableH * 0.96) / (y1 - y0));
  layout.apartCenter.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
const state = {
  t: reducedMotion ? T_END : 0,   // timeline position
  dir: 1,
  speed: 1,
  playing: !reducedMotion,
  paused: false,
  sceneTime: 0,
  lastLock: false,
  settle: 0,                      // seconds since lock (for the landing punch)
};
const orbit = { x: 0, y: 0, vx: 0, vy: 0, dragging: false, lastX: 0, lastY: 0, idle: 0 };

let captionTimer = 0;
function setCaption(text) {
  if (captionEl.dataset.text === text) return;
  captionEl.dataset.text = text;
  captionEl.classList.add('swap');
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => { captionEl.textContent = text; captionEl.classList.remove('swap'); }, reducedMotion ? 0 : 180);
}
function captionFor(t) {
  if (t < T_HOLD) return 'Seven parts of the crest';
  if (t < 1.9) return 'Shield · Banner · Bulldog · G';
  if (t < T_LOCK) return 'Mountain · Space Needle · Winged shoe';
  return 'Garfield High School · Seattle';
}
function syncButtons() {
  const apart = state.t <= T_HOLD + 1e-3 && !(state.playing && state.dir === 1);
  const separating = state.playing && state.dir === -1;
  separateBtn.textContent = apart || separating ? 'Reassemble' : 'Separate';
  pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
  pauseBtn.setAttribute('aria-label', state.paused ? 'Resume animation' : 'Pause animation');
}

function replay() {
  state.t = 0; state.dir = 1; state.speed = 1; state.playing = true; state.paused = false;
  state.settle = 0;
  syncButtons();
}
function separateOrReassemble() {
  state.paused = false;
  if (state.t > T_HOLD + 1e-3) {           // assembled (or mid-flight): pull apart
    state.dir = -1; state.speed = 1.7; state.playing = true;
  } else {                                 // apart: assemble
    state.dir = 1; state.speed = 1; state.playing = true;
  }
  syncButtons();
}
function togglePause() {
  state.paused = !state.paused;
  syncButtons();
}
replayBtn.addEventListener('click', replay);
separateBtn.addEventListener('click', separateOrReassemble);
pauseBtn.addEventListener('click', togglePause);

function fireLock() {
  flashEl.classList.add('on');
  setTimeout(() => flashEl.classList.remove('on'), 90);
  state.settle = 0.0001;
}

function stepTimeline(dt) {
  if (!state.playing || state.paused) return;
  const prev = state.t;
  state.t += dt * state.dir * state.speed;
  if (state.dir === 1) {
    if (prev < T_LOCK && state.t >= T_LOCK) fireLock();
    if (state.t >= T_END) { state.t = T_END; state.playing = false; }
  } else if (state.t <= T_HOLD) {
    state.t = T_HOLD; state.playing = false;
  }
  if (!state.playing) syncButtons();
}

// Piece poses for timeline time t.
const tmpEuler = new THREE.Euler();
function posePieces(t, sceneTime) {
  const key = layout.portrait ? 'port' : 'land';
  const rm = reducedMotion ? 0 : 1;
  const apartness = 1 - smooth((t - T_HOLD) / (2.6 - T_HOLD));
  const sc = lerp(1, layout.apartScale, apartness);
  rig.scale.setScalar(sc);
  crest.position.set(-layout.apartCenter.x * apartness, -layout.apartCenter.y * apartness, 0);

  for (const p of PIECES) {
    if (!p.group) continue;
    const u = clamp((t - p.start) / p.dur);
    const ep = smoother(u);
    const er = easeInOutCubic(u);
    const away = 1 - ep;
    const [dx, dy, dz] = p.apart[key];

    // float while waiting
    const bob = away * rm;
    const fy = Math.sin(sceneTime * 1.1 + p.phase) * 0.10 * bob;
    const fr = Math.sin(sceneTime * 0.9 + p.phase) * 3 * bob;

    const arcX = layout.portrait ? 0.3 : 1;     // keep flight paths inside a narrow screen
    p.group.position.set(
      p.home.x + dx * away + p.arc[0] * arcX * Math.sin(Math.PI * u) * rm,
      p.home.y + dy * away + p.arc[1] * Math.sin(Math.PI * u) * rm + fy,
      p.home.z + dz * away + p.arc[2] * Math.sin(Math.PI * u) * rm,
    );
    // Tilt eases out linearly; a full-turn spin unwinds with it (invisible at
    // the hold), a partial spin is a swing that returns before landing.
    const ar = 1 - er;
    const bump = Math.sin(Math.PI * u);
    const rot = (i) => (p.tilt[i] * ar + (Math.abs(p.spin[i]) >= 360 ? p.spin[i] * ar : p.spin[i] * bump) * rm) * DEG;
    p.group.rotation.set(rot(0), rot(1) + fr * DEG, rot(2));
    // landing punch: tiny scale pop right after the piece settles
    let s = 1;
    if (rm && u >= 1 && t - (p.start + p.dur) < 0.45) {
      const q = (t - (p.start + p.dur)) / 0.45;
      s = 1 + 0.045 * Math.exp(-5 * q) * Math.sin(q * Math.PI * 3);
    }
    p.group.scale.setScalar(s);
    p.inFlight = u > 0 && u < 1;
  }
}

// ---------------------------------------------------------------------------
// Orbit (mouse + touch)
// ---------------------------------------------------------------------------
canvas.addEventListener('pointerdown', (e) => {
  orbit.dragging = true; orbit.lastX = e.clientX; orbit.lastY = e.clientY; orbit.vx = orbit.vy = 0;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!orbit.dragging) return;
  const dx = e.clientX - orbit.lastX, dy = e.clientY - orbit.lastY;
  orbit.lastX = e.clientX; orbit.lastY = e.clientY;
  const k = Math.min(0.008, (Math.PI * 2) / (1.4 * innerWidth));   // about one turn per 1.4 screen widths
  orbit.vy = dx * k; orbit.vx = dy * k;
  orbit.y += orbit.vy; orbit.x = clamp(orbit.x + orbit.vx, -0.7, 0.7);
  orbit.idle = 0;
});
const endDrag = () => { orbit.dragging = false; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('lostpointercapture', endDrag);

function updateOrbit(dt) {
  if (!orbit.dragging) {
    orbit.y += orbit.vy; orbit.x = clamp(orbit.x + orbit.vx, -0.7, 0.7);
    orbit.vx *= Math.pow(0.02, dt); orbit.vy *= Math.pow(0.02, dt);
    orbit.idle += dt;
    if (orbit.idle > 2.5) {          // drift home gently
      const k = 1 - Math.pow(0.35, dt);
      orbit.x = lerp(orbit.x, 0, k);
      orbit.y = lerp(orbit.y, Math.round(orbit.y / (Math.PI * 2)) * Math.PI * 2, k);
    }
  }
  const sway = reducedMotion ? 0 : 0.045 * Math.sin(state.sceneTime * 0.6) * (1 - smooth((T_LOCK - state.t) / 0.5));
  rig.rotation.set(orbit.x, orbit.y + sway, 0);
}

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!state.paused) state.sceneTime += dt;
  stepTimeline(dt);
  posePieces(state.t, state.sceneTime);
  updateOrbit(dt);
  setCaption(captionFor(state.t));

  // effects
  const assembled = smooth((state.t - 2.3) / 0.8);
  if (state.settle > 0 && !state.paused) state.settle += dt;
  const punch = state.settle > 0 ? Math.exp(-2.2 * state.settle) : 0;
  glow.material.opacity = 0.28 + 0.12 * assembled + 0.5 * punch + (reducedMotion ? 0 : 0.04 * Math.sin(state.sceneTime * 1.7));
  glow.scale.setScalar(16 + 3 * assembled + 6 * punch);
  rings.children.forEach((ring, i) => {
    const r = lerp(ring.userData.r, ring.userData.r * 0.82, assembled);
    ring.scale.setScalar(r / ring.userData.r);
    ring.material.opacity = ring.userData.op * (0.6 + 0.4 * assembled) + 0.25 * punch;
    if (!reducedMotion) ring.rotation.y += dt * (0.08 + i * 0.05) * (i % 2 ? -1 : 1);
  });
  if (!reducedMotion && !state.paused) stars.rotation.z += dt * 0.006;
  stars.material.uniforms.uTime.value = reducedMotion ? 0 : state.sceneTime;
  trail.material.uniforms.uTime.value = state.sceneTime;
  if (!reducedMotion && !state.paused) {
    for (const p of PIECES) if (p.inFlight) { spawnSpark(p.face, p.halfW, p.halfH); spawnSpark(p.face, p.halfW, p.halfH); }
    updateTrail(dt);
  }

  renderer.render(scene, camera);
}

// Debug/automation hook: seek the timeline deterministically.
window.__crest = {
  seek(t) { state.t = clamp(t, 0, T_END); state.playing = false; state.paused = false; state.settle = 0; syncButtons(); },
  get t() { return state.t; },
  get playing() { return state.playing && !state.paused; },
  state, orbit, layout, T_HOLD, T_LOCK, T_END,
};

(async () => {
  try {
    await buildPieces();
  } catch (err) {
    loadingEl.textContent = 'The crest images could not be loaded. Please refresh.';
    loadingEl.classList.add('error');
    console.error(err);
    return;
  }
  loadingEl.classList.add('done');
  computeLayout();
  addEventListener('resize', computeLayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(computeLayout);
  syncButtons();
  frame();
})();
