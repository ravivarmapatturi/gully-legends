// 3D match view (Three.js). Draws the stadium and animates whatever the engine decided.
// It never decides outcomes; it is handed an engine event and plays it out.
// Characters: Quaternius Universal Animation Library mannequin (CC0), tinted per team.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';

const Z_BAT = 8.6, Z_BOWL = -8.6, CENTER = new THREE.Vector3(0, 0, 4);
const BALL_Z = 9.0; // where the ball meets the bat, just in front of the popping crease
const BATTER_POS = new THREE.Vector3(-0.28, 0, 9.4);
const R_INNER = 24, R_DEEP = 57, R_ROPE = 62;
const ZONE_ANG = { fine: -150, square: -95, midwkt: -55, longon: -15, longoff: 15, cover: 55, point: 95, third: 150 };
const TV_POS = new THREE.Vector3(0, 7.2, -20), TV_LOOK = new THREE.Vector3(0, 0.2, 6.2);

let renderer, scene, camera, clock, base, canvasEl;
let running = false, fast = false, quality = 'high';
const actors = { fielders: [] };
let ball, ballShadow, pitchMark, trailPts = [], trail;
let stumpsBat = [], bailsBat = [];
const tasks = new Set();
const camGoal = { pos: TV_POS.clone(), look: TV_LOOK.clone(), speed: 3, followBall: false };
const camLook = TV_LOOK.clone();
let colors = { bat: '#1f5fbf', bowl: '#e67e22' };

const dirOf = ang => new THREE.Vector3(Math.sin(ang * Math.PI / 180), 0, -Math.cos(ang * Math.PI / 180));
const zonePoint = (zone, r) => CENTER.clone().add(dirOf(ZONE_ANG[zone]).multiplyScalar(r));
const wait = ms => new Promise(res => setTimeout(res, fast ? 0 : ms));

// ---------- Init ----------
export async function init(canvas, opts = {}) {
  canvasEl = canvas;
  quality = opts.quality || 'high';
  renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality === 'high' ? 2 : 1.25));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0x9ec3e6, 120, 260);
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 600);
  camera.position.copy(TV_POS); camera.lookAt(TV_LOOK);
  clock = new THREE.Clock();

  buildLights(); buildGround(); buildStadium(); buildPitchProps();

  const gltf = await new GLTFLoader().loadAsync(opts.model || 'assets/players.glb');
  base = gltf;
  buildActors();
  buildBall();
  resize();
  addEventListener('resize', resize);
  running = true;
  renderer.setAnimationLoop(frame);
}

export function resize() {
  if (!renderer) return;
  const w = canvasEl.clientWidth || innerWidth, h = canvasEl.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Portrait phones need a wider lens to keep the pitch in frame.
  camera.fov = camera.aspect < 0.8 ? 38 : 28;
  camera.updateProjectionMatrix();
}
export function setFast(v) { fast = v; }
export function pause() { running = false; renderer && renderer.setAnimationLoop(null); }
export function resume() { if (renderer && !running) { running = true; clock.getDelta(); renderer.setAnimationLoop(frame); } }

// ---------- Environment ----------
function skyTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#2f6fb3'); gr.addColorStop(0.55, '#8fc0ea'); gr.addColorStop(1, '#dfeefa');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function buildLights() {
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x3c6b2c, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(-30, 60, -20);
  sun.target.position.set(0, 0, 4);
  sun.castShadow = true;
  const s = quality === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.set(s, s);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 160 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
}

function grassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  // Mowing stripes across the ground, plus fine noise so it doesn't look flat.
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#3f8f3a' : '#4aa043'; g.fillRect(0, i * 64, 1024, 64); }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${20 + Math.random() * 40},${70 + Math.random() * 60},${20 + Math.random() * 30},0.18)`;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; return t;
}

function buildGround() {
  const ground = new THREE.Mesh(new THREE.CircleGeometry(R_ROPE + 8, 96),
    new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  // Inner circle marking.
  const ring = new THREE.Mesh(new THREE.RingGeometry(R_INNER + 3.8, R_INNER + 4.0, 128),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(CENTER.x, 0.02, CENTER.z); scene.add(ring);
  // Boundary rope.
  const rope = new THREE.Mesh(new THREE.TorusGeometry(R_ROPE, 0.18, 8, 160),
    new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 }));
  rope.rotation.x = -Math.PI / 2; rope.position.set(CENTER.x, 0.15, CENTER.z); rope.castShadow = true; scene.add(rope);
  // Outer apron.
  const apron = new THREE.Mesh(new THREE.RingGeometry(R_ROPE + 8, R_ROPE + 16, 96),
    new THREE.MeshStandardMaterial({ color: 0x2f6e2c, roughness: 1 }));
  apron.rotation.x = -Math.PI / 2; apron.position.set(CENTER.x, 0.01, CENTER.z); scene.add(apron);
}

function adTexture() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 64;
  const g = c.getContext('2d');
  const ads = [['GULLY LEGENDS', '#f5c518', '#0a1a30'], ['FIELD CHESS', '#ffffff', '#c0392b'], ['READ THE GAP', '#0a1a30', '#2ecc71'], ['PLAY FAIR · PLAY FREE', '#ffffff', '#1f5fbf']];
  for (let i = 0; i < 8; i++) {
    const [txt, fg, bg] = ads[i % ads.length];
    g.fillStyle = bg; g.fillRect(i * 256, 0, 256, 64);
    g.fillStyle = fg; g.font = '900 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, i * 256 + 128, 34);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(-3, 1); return t;
}

function buildStadium() {
  // Advertising boards just outside the rope.
  const boards = new THREE.Mesh(new THREE.CylinderGeometry(R_ROPE + 6, R_ROPE + 6, 1.1, 128, 1, true),
    new THREE.MeshStandardMaterial({ map: adTexture(), side: THREE.BackSide, roughness: 0.5, emissive: 0x111111 }));
  boards.position.set(CENTER.x, 0.55, CENTER.z); scene.add(boards);

  // Tiered stands as stacked open cylinders.
  const standMat = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.9, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const r = R_ROPE + 16 + i * 4.2;
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(r + 4.2, r, 3, 96, 1, true), standMat);
    tier.position.set(CENTER.x, 1.5 + i * 3, CENTER.z); scene.add(tier);
  }
  // Roof ring.
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(R_ROPE + 46, R_ROPE + 36, 2, 96, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.7, side: THREE.DoubleSide }));
  roof.position.set(CENTER.x, 22, CENTER.z); scene.add(roof);

  // Crowd: one instanced mesh, thousands of spectators for a single draw call.
  const n = quality === 'high' ? 9000 : 4500;
  const bodyG = new THREE.CylinderGeometry(0.2, 0.26, 0.75, 6); bodyG.translate(0, 0.38, 0);
  const headG = new THREE.SphereGeometry(0.15, 8, 6); headG.translate(0, 0.92, 0);
  for (const g of [bodyG, headG]) { g.deleteAttribute('uv'); }
  const crowd = new THREE.InstancedMesh(mergeGeometries([bodyG, headG]), new THREE.MeshLambertMaterial(), n);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  const palette = ['#e74c3c', '#f1c40f', '#3498db', '#ecf0f1', '#9b59b6', '#1abc9c', '#e67e22', '#2c3e50', '#ff7ab6', '#ffffff'];
  for (let i = 0; i < n; i++) {
    const tier = i % 6, a = Math.random() * Math.PI * 2, r = R_ROPE + 17.5 + tier * 4.2 + Math.random() * 3.4;
    const x = CENTER.x + Math.cos(a) * r, z = CENTER.z + Math.sin(a) * r, y = 3.0 + tier * 3 + Math.random() * 0.15;
    m.makeRotationY(-a + Math.PI / 2); m.setPosition(x, y, z);
    crowd.setMatrixAt(i, m); crowd.setColorAt(i, col.set(palette[Math.floor(Math.random() * palette.length)]).multiplyScalar(0.75 + Math.random() * 0.35));
  }
  scene.add(crowd);

  // Floodlight towers.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, metalness: 0.6, roughness: 0.4 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff5d6, emissiveIntensity: 2.2 });
  for (const a of [45, 135, 225, 315]) {
    const rad = a * Math.PI / 180, x = CENTER.x + Math.cos(rad) * 112, z = CENTER.z + Math.sin(rad) * 112;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1, 46, 8), poleMat);
    pole.position.set(x, 23, z); scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 1), lampMat);
    lamp.position.set(x, 47, z); lamp.lookAt(CENTER.x, 0, CENTER.z); scene.add(lamp);
  }
}

function pitchTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 1024;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 128, 0);
  gr.addColorStop(0, '#c9ad78'); gr.addColorStop(0.5, '#ddc28e'); gr.addColorStop(1, '#c9ad78');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 1024);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(110,80,40,${Math.random() * 0.12})`; g.fillRect(Math.random() * 128, Math.random() * 1024, 2, 2); }
  g.fillStyle = 'rgba(255,255,255,0.95)';
  // Creases: popping (1.22m from stumps) and bowling crease at each end. 1024px = 22m.
  const px = m => (m + 11) / 22 * 1024;
  for (const z of [-10.06, 10.06]) g.fillRect(14, px(z) - 2, 100, 4);
  for (const z of [-8.84, 8.84]) g.fillRect(0, px(z) - 2, 128, 4);
  for (const z of [-10.06, 10.06]) { g.fillRect(18, px(z) - 40, 3, 80); g.fillRect(107, px(z) - 40, 3, 80); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function buildPitchProps() {
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 22), new THREE.MeshStandardMaterial({ map: pitchTexture(), roughness: 0.9 }));
  pitch.rotation.x = -Math.PI / 2; pitch.position.y = 0.012; pitch.receiveShadow = true;
  scene.add(pitch);
  stumpsBat = stumpSet(10.06, true);
  stumpSet(-10.06, false);
  pitchMark = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.2, 24), new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.95 }));
  pitchMark.rotation.x = -Math.PI / 2; pitchMark.position.y = 0.03; pitchMark.visible = false;
  scene.add(pitchMark);
}

function stumpSet(z, keep) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xf3e3b5, roughness: 0.5 });
  const set = [];
  for (const x of [-0.11, 0, 0.11]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.71, 8), mat);
    s.position.set(x, 0.355, z); s.castShadow = true; scene.add(s); set.push(s);
  }
  for (const x of [-0.055, 0.055]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.11, 6), mat);
    b.rotation.z = Math.PI / 2; b.position.set(x, 0.72, z); scene.add(b);
    if (keep) bailsBat.push(b);
  }
  return set;
}

// ---------- Characters ----------
function makeActor(color, kit = {}) {
  const obj = SkeletonUtils.clone(base.scene);
  const body = new THREE.Color(color), trim = new THREE.Color(kit.trim || '#f4f4f4');
  obj.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.frustumCulled = false;
    const name = o.material.name;
    o.material = new THREE.MeshStandardMaterial({ color: name === 'M_Main' ? body : trim, roughness: 0.55, metalness: 0.05 });
  });
  const mixer = new THREE.AnimationMixer(obj);
  const actions = {};
  for (const clip of base.animations) actions[clip.name] = mixer.clipAction(clip);
  const a = { obj, mixer, actions, cur: null, color, bones: {} };
  obj.traverse(o => { if (o.isBone) a.bones[o.name] = o; });
  if (kit.helmet) attach(a, 'DEF-head', helmet(), [0, 0.1, 0.0]);
  if (kit.cap) attach(a, 'DEF-head', cap(color), [0, 0.17, 0.02]);
  if (kit.bat) a.bat = attach(a, 'DEF-handR', bat(), [0, 0.06, 0.02], [0, 0, 0]);
  if (kit.freeBat) { a.freeBat = freeBat(); scene.add(a.freeBat); a.bs = { mode: 'stance', t: 0 }; }
  if (kit.pads) { attach(a, 'DEF-shinL', pad(), [0, 0.2, 0.05]); attach(a, 'DEF-shinR', pad(), [0, 0.2, 0.05]); }
  if (kit.gloves) { attach(a, 'DEF-handL', glove(), [0, 0.05, 0]); attach(a, 'DEF-handR', glove(), [0, 0.05, 0]); }
  scene.add(obj);
  play(a, kit.idle || 'Idle_Loop');
  return a;
}

function attach(a, bone, mesh, pos, rot) {
  const b = a.obj.getObjectByName(bone);
  if (!b) return null;
  // Bones are scaled in this rig; undo it so props keep real-world size.
  const ws = new THREE.Vector3(); b.getWorldScale(ws);
  mesh.scale.divide(ws);
  mesh.position.set(pos[0] / ws.x, pos[1] / ws.y, pos[2] / ws.z);
  if (rot) mesh.rotation.set(...rot);
  b.add(mesh); return mesh;
}
function helmet() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.118, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
    new THREE.MeshStandardMaterial({ color: 0x0d2a5c, roughness: 0.35, metalness: 0.2 }));
  const grill = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.007, 6, 16, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xcfd6dd, metalness: 0.8, roughness: 0.3 }));
  grill.position.set(0, -0.05, 0.07); grill.rotation.set(0.2, 0, Math.PI);
  g.add(shell, grill); return g;
}
function cap(color) {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.01, 14, 1, false, -Math.PI / 2, Math.PI), mat);
  peak.position.set(0, 0, 0.06);
  g.add(top, peak); return g;
}
function bat() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.8 }));
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.56, 0.04), new THREE.MeshStandardMaterial({ color: 0xead7a8, roughness: 0.55 }));
  handle.position.y = 0.0; blade.position.y = 0.42;
  handle.castShadow = blade.castShadow = true;
  g.add(handle, blade); return g;
}
function pad() {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }));
  m.castShadow = true; return m;
}
function glove() {
  return new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }));
}

function play(a, name, o = {}) {
  const next = a.actions[name];
  if (!next) return;
  if (a.cur === next && !o.restart) return next;
  next.reset();
  next.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  next.clampWhenFinished = !!o.once;
  next.timeScale = o.speed || 1;
  if (o.at) next.time = o.at;
  next.play();
  if (a.cur && a.cur !== next) a.cur.crossFadeTo(next, o.fade ?? 0.18, false);
  a.cur = next;
  return next;
}
function face(a, target) {
  const p = a.obj.position;
  a.obj.rotation.y = Math.atan2(target.x - p.x, target.z - p.z);
}

function buildActors() {
  for (const k of ['striker', 'nonStriker', 'bowler', 'keeper', 'umpire']) if (actors[k]) scene.remove(actors[k].obj);
  for (const f of actors.fielders) scene.remove(f.obj);
  actors.fielders = [];
  if (actors.striker && actors.striker.freeBat) scene.remove(actors.striker.freeBat);
  actors.striker = makeActor(colors.bat, { helmet: true, freeBat: true, pads: true, gloves: true, idle: 'Idle_Loop' });
  actors.nonStriker = makeActor(colors.bat, { helmet: true, bat: true, pads: true, gloves: true });
  actors.bowler = makeActor(colors.bowl, { cap: true });
  actors.keeper = makeActor(colors.bowl, { helmet: true, pads: true, gloves: true, idle: 'Crouch_Idle_Loop' });
  actors.umpire = makeActor('#f2f2f2', { trim: '#20252b', cap: true });
  for (let i = 0; i < 9; i++) actors.fielders.push(makeActor(colors.bowl, { cap: true, idle: 'Crouch_Idle_Loop' }));
  resetPositions();
}

let fieldSpots = [];
export function setField(field) {
  fieldSpots = [];
  if (field.slip) fieldSpots.push({ zone: 'slip', pos: new THREE.Vector3(1.4, 0, 12.6) });
  for (const z of field.inner) fieldSpots.push({ zone: z, deep: false, pos: zonePoint(z, R_INNER) });
  for (const z of field.deep) fieldSpots.push({ zone: z, deep: true, pos: zonePoint(z, R_DEEP) });
  resetPositions();
}

export function setTeams(batColor, bowlColor) {
  colors = { bat: batColor, bowl: bowlColor };
  if (!base) return;
  buildActors();
}

function resetPositions() {
  if (!actors.striker) return;
  const s = actors.striker;
  s.obj.position.copy(BATTER_POS); s.obj.rotation.y = Math.PI / 2; // side-on, chest to the off side
  play(s, 'Idle_Loop'); s.bs = { mode: 'stance', t: 0 };
  const n = actors.nonStriker;
  n.obj.position.set(-1.1, 0, Z_BOWL - 0.6); face(n, new THREE.Vector3(-1.1, 0, 20)); play(n, 'Idle_Loop');
  const b = actors.bowler;
  b.obj.position.set(0.7, 0, -24); face(b, new THREE.Vector3(0.4, 0, 0)); play(b, 'Idle_Loop');
  const k = actors.keeper;
  k.obj.position.set(0.1, 0, 12.4); face(k, new THREE.Vector3(0, 0, 0)); play(k, 'Crouch_Idle_Loop');
  const u = actors.umpire;
  u.obj.position.set(-2.6, 0, -11.5); face(u, new THREE.Vector3(0, 0, 20)); play(u, 'Idle_Loop');
  actors.fielders.forEach((f, i) => {
    const spot = fieldSpots[i];
    f.obj.visible = !!spot;
    if (!spot) return;
    f.obj.position.copy(spot.pos); f.home = spot.pos.clone(); f.spot = spot;
    face(f, new THREE.Vector3(0, 0, Z_BAT)); play(f, 'Crouch_Idle_Loop');
  });
  for (const st of stumpsBat) { st.rotation.set(0, 0, 0); st.position.y = 0.355; }
  bailsBat.forEach((bl, i) => { bl.position.set(i ? 0.055 : -0.055, 0.72, 10.06); bl.rotation.set(0, 0, Math.PI / 2); });
  pitchMark.visible = false;
  ball && (ball.visible = false, ballShadow.visible = false);
  camGoal.pos.copy(TV_POS); camGoal.look.copy(TV_LOOK); camGoal.speed = 4; camGoal.followBall = false;
}

// ---------- Ball ----------
function buildBall() {
  ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.35, emissive: 0x330000 }));
  ball.castShadow = true; ball.visible = false; scene.add(ball);
  ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
  ballShadow.rotation.x = -Math.PI / 2; ballShadow.visible = false; scene.add(ballShadow);
  const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 16 }, () => new THREE.Vector3()));
  trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
  trail.frustumCulled = false; trail.visible = false; scene.add(trail);
}
function setBall(p) {
  ball.position.copy(p); ball.visible = true;
  ballShadow.position.set(p.x, 0.02, p.z); ballShadow.visible = true;
  trailPts.push(p.clone()); if (trailPts.length > 16) trailPts.shift();
  const arr = trail.geometry.attributes.position;
  for (let i = 0; i < 16; i++) { const q = trailPts[Math.max(0, trailPts.length - 16 + i)] || p; arr.setXYZ(i, q.x, q.y, q.z); }
  arr.needsUpdate = true; trail.visible = true;
}

// Tween runner: fn(t in 0..1) each frame for `dur` seconds.
function tween(dur, fn) {
  return new Promise(res => {
    if (fast) { fn(1); return res(); }
    const t0 = { e: 0 };
    const task = dt => { t0.e += dt; const t = Math.min(t0.e / dur, 1); fn(t); if (t >= 1) { tasks.delete(task); res(); } };
    tasks.add(task);
  });
}
const ease = t => 1 - (1 - t) * (1 - t);
function arc(a, b, h, t) { const p = a.clone().lerp(b, t); p.y = a.y + (b.y - a.y) * t + h * 4 * t * (1 - t); return p; }

// ---------- Delivery ----------
const LINE_X = { off: 0.32, stumps: 0.02, leg: -0.3 };   // off side = +x for a right-hander
const LENGTH_Z = { yorker: 8.4, full: 6.4, good: 4.2, short: 1.2 };
const ARRIVE_Y = { yorker: 0.12, full: 0.55, good: 0.95, short: 1.55 };
let lastDel = null;

// Bowler runs in and releases; the ball travels to just before the bat.
// pauseAtBat: true when the user still has to choose a shot (freeze before contact).
export async function bowlDelivery(del, opts = {}) {
  resetPositions();
  lastDel = del;
  trailPts = [];
  const b = actors.bowler, spin = opts.kind === 'spin';
  const start = new THREE.Vector3(0.7, 0, spin ? -16 : -24), crease = new THREE.Vector3(0.45, 0, -9.6);
  b.obj.position.copy(start); face(b, crease);
  play(b, 'Sprint_Loop', { speed: spin ? 0.8 : 1.1 });
  await tween(spin ? 0.9 : 1.15, t => b.obj.position.copy(start.clone().lerp(crease, t)));
  play(b, 'Spell_Simple_Shoot', { once: true, speed: 1.3 });
  actors.striker.bs = { mode: 'lift', t: 0 }; // backlift as the ball is released
  await wait(160);
  const x = LINE_X[del.line], zB = del.fullToss ? 9.4 : LENGTH_Z[del.length];
  const rel = new THREE.Vector3(0.55, 2.25, -8.9), bounce = new THREE.Vector3(x * 0.8, 0.05, zB);
  const arrive = new THREE.Vector3(x, del.fullToss ? 0.9 : ARRIVE_Y[del.length], BALL_Z);
  const flight = spin ? 0.95 : 0.62;
  pitchMark.position.set(bounce.x, 0.03, Math.min(bounce.z, 8.5)); pitchMark.visible = !del.fullToss;
  camGoal.pos.set(0, 6.2, -17); camGoal.look.set(0, 0.4, 7); camGoal.speed = 1.6;
  if (del.fullToss || del.length === 'yorker') {
    await tween(flight, t => setBall(arc(rel, arrive, 0.35, t)));
  } else {
    const f1 = (zB - rel.z) / (arrive.z - rel.z);
    await tween(flight * f1, t => setBall(arc(rel, bounce, 0.2, t)));
    const top = Math.max(arrive.y, 0.4);
    await tween(flight * (1 - f1) * (opts.pauseAtBat ? 0.7 : 1), t => {
      const tt = opts.pauseAtBat ? t * 0.7 : t;
      setBall(arc(bounce, arrive, (top - arrive.y) * 0.3 + 0.1, tt));
    });
  }
  play(b, 'Jog_Fwd_Loop', { speed: 0.6 });
  tween(0.8, t => b.obj.position.copy(crease.clone().lerp(new THREE.Vector3(1.6, 0, -5), t))).then(() => play(b, 'Idle_Loop'));
  return { arrive };
}

// ---------- Shot ----------
// ev: engine event. Plays the batter's swing, the ball's path and the fielding.
export async function playShot(ev) {
  const del = lastDel || ev.delivery;
  const x = LINE_X[del.line];
  const contact = new THREE.Vector3(x, del.fullToss ? 0.9 : ARRIVE_Y[del.length], BALL_Z);
  const s = actors.striker, shot = ev.shot || { type: 'defend' };
  const out = ev.outcome === 'NB' ? ev.hit : ev.outcome;
  const missed = (out === 'W' && ev.how !== 'caught' && ev.how !== 'run out') || (out === '0' && shot.type !== 'defend' && Math.random() < 0.5);

  // Swing toward the chosen zone; the bat reaches the ball ~45% into the swing.
  s.bs = { mode: 'swing', t: 0, ang: shot.zone ? ZONE_ANG[shot.zone] : 0, kind: shot.type, dur: shot.type === 'defend' ? 0.36 : 0.42 };
  await wait(shot.type === 'defend' ? 150 : 190);

  if (missed) {
    // Beaten: ball carries on to the stumps or the keeper.
    const end = ev.how === 'bowled' ? new THREE.Vector3(0, 0.4, 10.06) : new THREE.Vector3(0.15, 0.7, 12.3);
    await tween(0.28, t => setBall(contact.clone().lerp(end, t)));
    if (ev.how === 'bowled') knockStumps();
    else if (ev.how === 'lbw') { play(actors.bowler, 'Jump_Start', { once: true }); }
    await afterBall(ev, out);
    return;
  }

  const zone = shot.zone || 'longon';
  const dir = dirOf(ZONE_ANG[zone] + (Math.random() - 0.5) * 14);
  let land, h, dur;
  const fielder = nearestFielder(zone, shot.type === 'lofted' || out === '2' || out === '3');
  if (shot.type === 'defend') { land = contact.clone().add(new THREE.Vector3(0, -contact.y + 0.05, -2.2)); h = 0.2; dur = 0.6; }
  else if (out === '6') { land = CENTER.clone().add(dir.clone().multiplyScalar(R_ROPE + 14)); land.y = 6; h = 22; dur = 2.2; }
  else if (out === '4') { land = CENTER.clone().add(dir.clone().multiplyScalar(R_ROPE)); land.y = 0.1; h = shot.type === 'lofted' ? 9 : 0.6; dur = 1.5; }
  else if (out === 'W') { land = (fielder ? fielder.obj.position.clone() : CENTER.clone().add(dir.clone().multiplyScalar(R_DEEP))); land.y = 1.6; h = shot.type === 'lofted' ? 16 : 1.5; dur = shot.type === 'lofted' ? 2.0 : 0.5; }
  else {
    const r = out === '0' ? R_INNER * 0.9 : out === '1' ? R_INNER + 4 : R_DEEP - 6;
    land = CENTER.clone().add(dir.clone().multiplyScalar(r)); land.y = 0.1;
    h = shot.type === 'lofted' ? 8 : 0.5; dur = out === '0' ? 0.7 : out === '1' ? 1.1 : 1.6;
  }

  // Camera follows big hits.
  if (out === '6' || out === '4' || (shot.type === 'lofted' && out !== '0') || out === '2' || out === '3') {
    // Behind-the-batter view down the line of the shot, tracking the ball.
    camGoal.speed = 2.2; camGoal.followBall = true;
    camGoal.pos.copy(contact).add(dir.clone().multiplyScalar(-9)).add(new THREE.Vector3(0, out === '6' ? 7 : 5, 0));
  }

  // Fielder chases or settles under it.
  if (fielder && out !== '6') {
    const meet = land.clone().setY(0);
    if (out === '4') meet.copy(fielder.obj.position.clone().lerp(meet, 0.55));
    face(fielder, meet); play(fielder, 'Sprint_Loop');
    const from = fielder.obj.position.clone();
    tween(dur * 0.95, t => fielder.obj.position.copy(from.clone().lerp(meet, ease(t)))).then(() => {
      if (out === 'W') play(fielder, 'Jump_Start', { once: true });
      else if (out === '0') play(fielder, 'Roll', { once: true });
      else play(fielder, 'PickUp_Table', { once: true });
    });
  }

  // Batters run for 1s, 2s and 3s.
  const runs = out === '1' || out === '2' || out === '3' ? +out : 0;
  const running = runs ? runBetween(runs) : Promise.resolve();

  await tween(dur, t => setBall(arc(contact, land, h, ease(t))));
  if (out === '6' || out === '4') celebrate(out);
  if (out === 'W') { ball.visible = false; ballShadow.visible = false; }
  await running;
  await afterBall(ev, out);
}

function nearestFielder(zone, preferDeep) {
  let best = null, bestD = 1e9;
  const target = zonePoint(zone, preferDeep ? R_DEEP : R_INNER);
  for (const f of actors.fielders) {
    if (!f.obj.visible) continue;
    const d = f.obj.position.distanceTo(target);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

async function runBetween(n) {
  const a = actors.striker, b = actors.nonStriker;
  const A = a.obj.position.clone(), B = b.obj.position.clone();
  play(a, 'Sprint_Loop'); play(b, 'Sprint_Loop');
  for (let i = 0; i < n; i++) {
    const [fa, ta] = i % 2 ? [new THREE.Vector3(0.6, 0, Z_BOWL), new THREE.Vector3(0.6, 0, Z_BAT)] : [A, new THREE.Vector3(0.6, 0, Z_BOWL)];
    const [fb, tb] = i % 2 ? [new THREE.Vector3(-0.8, 0, Z_BAT), new THREE.Vector3(-0.8, 0, Z_BOWL)] : [B, new THREE.Vector3(-0.8, 0, Z_BAT)];
    face(a, ta); face(b, tb);
    await tween(1.05, t => { a.obj.position.copy(fa.clone().lerp(ta, t)); b.obj.position.copy(fb.clone().lerp(tb, t)); });
  }
  play(a, 'Idle_Loop'); play(b, 'Idle_Loop');
}

function knockStumps() {
  stumpsBat.forEach((s, i) => tween(0.5, t => { s.rotation.z = (i - 1) * 0.9 * t; s.rotation.x = 0.6 * t; }));
  bailsBat.forEach((b, i) => {
    const from = b.position.clone(), to = from.clone().add(new THREE.Vector3((i - 0.5) * 1.4, -0.7, 1.6));
    tween(0.7, t => { b.position.copy(arc(from, to, 0.9, t)); b.rotation.x = t * 8; });
  });
}

function celebrate(out) {
  play(actors.striker, out === '6' ? 'Dance_Loop' : 'Jump_Start', { once: out !== '6' });
}

async function afterBall(ev, out) {
  if (out === 'W') {
    play(actors.bowler, 'Jump_Loop');
    for (const f of actors.fielders.slice(0, 3)) play(f, 'Jump_Loop');
    if (ev.how !== 'run out') { actors.striker.bs = { mode: 'hold', t: 0.6 }; play(actors.striker, 'Hit_Chest', { once: true }); }
    await wait(1100);
  } else await wait(out === '6' ? 900 : 450);
  trail.visible = false;
}

// Wide: ball sails past, keeper collects.
export async function playWide(del) {
  const x = del.line === 'leg' ? -1.4 : 1.6;
  await tween(0.4, t => setBall(new THREE.Vector3(x * t, 0.9, Z_BAT - 0.1 + t * 3.5)));
  await wait(300);
}

// ---------- Frame ----------
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const task of [...tasks]) task(dt);
  actors.striker && [actors.striker, actors.nonStriker, actors.bowler, actors.keeper, actors.umpire, ...actors.fielders].forEach(a => a.mixer.update(dt));
  if (actors.striker) updateBatter(actors.striker, dt);
  const k = 1 - Math.exp(-camGoal.speed * dt);
  if (camGoal.followBall && ball.visible) camGoal.look.copy(ball.position);
  camera.position.lerp(camGoal.pos, k);
  camLook.lerp(camGoal.look, camGoal.followBall ? 1 - Math.exp(-8 * dt) : k);
  if (ball.visible) ball.scale.setScalar(Math.max(1, camera.position.distanceTo(ball.position) / 22));
  camera.lookAt(camLook);
  renderer.render(scene, camera);
}

// Debug hook for screenshots / tuning.
export function _debug() { return { scene, camera, actors, THREE, camGoal, camLook }; }

// ---------- Batting rig ----------
// The bat is its own object animated through cricket poses; both arms reach for the handle
// with two-bone IK. Poses are in the batter's local frame: +X = towards the bowler,
// +Z = the way the chest faces (off side), +Y = up. Right-handed batter.
function freeBat() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.8 }));
  handle.position.y = -0.15;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.108, 0.56, 0.045), new THREE.MeshStandardMaterial({ color: 0xead7a8, roughness: 0.55 }));
  blade.position.y = -0.58;
  const sticker = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.002), new THREE.MeshStandardMaterial({ color: 0xc0392b }));
  sticker.position.set(0, -0.42, -0.024);
  handle.castShadow = blade.castShadow = true;
  g.add(handle, blade, sticker);
  return g; // origin = top of the handle, bat points down local -Y, face = local -Z
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const POSE = {
  stance: { grip: V(0.0, 0.94, 0.3), dir: V(-0.12, -1, 0.04) },
  lift:   { grip: V(-0.12, 1.22, 0.22), dir: V(-0.8, 0.55, -0.05) },
};
function shotPoses(ang, kind) {
  const r = ang * Math.PI / 180, sd = V(Math.cos(r), 0, Math.sin(r));
  if (kind === 'defend') return [{ grip: V(0.24, 0.82, 0.38), dir: V(0.18, -1, 0.06) }, { grip: V(0.26, 0.84, 0.38), dir: V(0.2, -1, 0.06) }];
  const horizontal = Math.abs(ang) >= 70 && Math.abs(ang) < 135;
  const glance = Math.abs(ang) >= 135;
  let impact;
  if (glance) impact = { grip: V(0.12, 0.85, 0.36), dir: V(0.15, -1, Math.sign(ang) * 0.5) };
  else if (horizontal) impact = { grip: V(0.12, 1.1, 0.36).add(sd.clone().multiplyScalar(0.08)), dir: V(1, -0.25, 0) };
  else impact = { grip: V(0.2, 0.95, 0.36).add(sd.clone().multiplyScalar(0.1)), dir: sd.clone().multiplyScalar(kind === 'lofted' ? 0.55 : 0.25).add(V(0, -1, 0)) };
  const follow = kind === 'lofted'
    ? { grip: V(0.05, 1.55, 0.2).add(sd.clone().multiplyScalar(0.1)), dir: sd.clone().multiplyScalar(-0.4).add(V(-0.3, 0.8, -0.2)) }
    : { grip: V(0.08, 1.4, 0.24).add(sd.clone().multiplyScalar(0.08)), dir: sd.clone().multiplyScalar(-0.3).add(V(-0.2, 0.7, -0.35)) };
  return [impact, follow];
}
const smooth = u => u * u * (3 - 2 * u);
function mixPose(a, b, u) {
  u = smooth(Math.min(Math.max(u, 0), 1));
  return { grip: a.grip.clone().lerp(b.grip, u), dir: a.dir.clone().normalize().lerp(b.dir.clone().normalize(), u).normalize() };
}

function currentPose(bs) {
  if (bs.mode === 'stance') return POSE.stance;
  if (bs.mode === 'lift') return mixPose(POSE.stance, POSE.lift, bs.t / 0.35);
  if (bs.mode === 'swing') {
    if (!bs.poses) bs.poses = shotPoses(bs.ang, bs.kind);
    const u = bs.t / bs.dur;
    return u < 0.45 ? mixPose(POSE.lift, bs.poses[0], u / 0.45) : mixPose(bs.poses[0], bs.poses[1], (u - 0.45) / 0.55);
  }
  if (bs.mode === 'hold') return bs.last || POSE.stance;
  if (bs.mode === 'return') return mixPose(bs.last || POSE.stance, POSE.stance, bs.t / 0.45);
  return POSE.stance;
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
function updateBatter(a, dt) {
  const bs = a.bs;
  bs.t += dt;
  if (bs.mode === 'swing' && bs.t >= bs.dur) { bs.last = currentPose({ ...bs, t: bs.dur }); a.bs = { mode: 'hold', t: 0, last: bs.last }; }
  else if (bs.mode === 'hold' && bs.t >= 0.6) a.bs = { mode: 'return', t: 0, last: bs.last };
  else if (bs.mode === 'return' && bs.t >= 0.45) a.bs = { mode: 'stance', t: 0 };
  const pose = currentPose(a.bs);

  a.obj.updateMatrixWorld(true);
  const toWorld = p => p.clone().applyMatrix4(a.obj.matrixWorld);
  const rotW = d => d.clone().transformDirection(a.obj.matrixWorld);

  // Place the bat: origin at the grip, local -Y along the pose direction, face towards the chest side.
  const gripW = toWorld(pose.grip), dirW = rotW(pose.dir);
  const fwd = rotW(V(0, 0, 1));
  const yAxis = dirW.clone().negate();
  const zAxis = fwd.clone().negate().sub(yAxis.clone().multiplyScalar(fwd.clone().negate().dot(yAxis))).normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  _m.makeBasis(xAxis, yAxis, zAxis);
  a.freeBat.position.copy(gripW);
  a.freeBat.quaternion.setFromRotationMatrix(_m);

  // Slight crouch and a head turned towards the bowler.
  const spine = a.bones['DEF-spine001'];
  if (spine && a.bs.mode !== 'hold') spine.rotateX(0.18);
  // Hands on the handle: top (left) hand near the top, bottom (right) hand below it.
  const topGrip = gripW.clone().add(dirW.clone().multiplyScalar(0.05));
  const lowGrip = gripW.clone().add(dirW.clone().multiplyScalar(0.17));
  a.obj.updateMatrixWorld(true);
  solveArm(a, 'L', topGrip, toWorld(V(0.6, 0.6, 0.5)));
  solveArm(a, 'R', lowGrip, toWorld(V(-0.5, 0.5, 0.6)));
  lookAt(a.bones['DEF-head'] || a.bones['DEF-neck'], V(0, 1.6, -20));
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
function aimBone(bone, childWorld, targetWorld) {
  const bw = bone.getWorldPosition(new THREE.Vector3());
  const cur = childWorld.clone().sub(bw).normalize(), des = targetWorld.clone().sub(bw).normalize();
  if (cur.lengthSq() < 1e-8 || des.lengthSq() < 1e-8) return;
  const delta = new THREE.Quaternion().setFromUnitVectors(cur, des);
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parent.invert().multiply(delta.multiply(world)));
  bone.updateMatrixWorld(true);
}
function solveArm(a, side, target, pole) {
  const up = a.bones['DEF-upper_arm' + side], fo = a.bones['DEF-forearm' + side], ha = a.bones['DEF-hand' + side];
  if (!up || !fo || !ha) return;
  const S = up.getWorldPosition(_a.clone()), E = fo.getWorldPosition(_b.clone()), W = ha.getWorldPosition(_c.clone());
  const la = S.distanceTo(E), lb = E.distanceTo(W);
  const toT = target.clone().sub(S);
  const d = Math.min(Math.max(toT.length(), 0.05), la + lb - 0.001);
  const dir = toT.normalize();
  const cosA = Math.min(Math.max((la * la + d * d - lb * lb) / (2 * la * d), -1), 1), sinA = Math.sqrt(1 - cosA * cosA);
  const pp = pole.clone().sub(S); const perp = pp.sub(dir.clone().multiplyScalar(pp.dot(dir)));
  if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0);
  perp.normalize();
  const elbow = S.clone().add(dir.clone().multiplyScalar(la * cosA)).add(perp.multiplyScalar(la * sinA));
  aimBone(up, E, elbow);
  aimBone(fo, ha.getWorldPosition(new THREE.Vector3()), S.clone().add(dir.multiplyScalar(d)));
}
function lookAt(bone, targetWorld) {
  if (!bone) return;
  const bw = bone.getWorldPosition(new THREE.Vector3());
  const wq = bone.getWorldQuaternion(new THREE.Quaternion());
  // The head's forward is its local +Z in this rig; turn it (yaw only) to face the target.
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(wq); fwd.y = 0; fwd.normalize();
  const want = targetWorld.clone().sub(bw); want.y = 0; want.normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(fwd, want);
  const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parent.invert().multiply(delta.multiply(wq)));
  bone.updateMatrixWorld(true);
}
