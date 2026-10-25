/* Viaje espacial en WebGL ligado al scroll.
   Si WebGL o el CDN fallan, el fondo CSS (.sky-fallback) sigue visible. */
import * as THREE from 'three';

const canvas = document.getElementById('space');
const root = document.documentElement;
const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
const isPaused = () => document.body.classList.contains('motion-paused') || reduceMQ.matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const small = () => Math.min(innerWidth, innerHeight) < 700;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: (devicePixelRatio || 1) < 2, powerPreference: 'high-performance' });
} catch (err) {
  root.classList.add('no-webgl');
  console.warn('[space] WebGL no disponible:', err);
}

if (renderer) init();

function init() {
  const START_Z = 30;
  const TRAVEL = 1400;
  const Z_MIN = START_Z - TRAVEL - 420;
  const Z_RANGE = TRAVEL + 520;
  const MOBILE = small();

  renderer.setClearColor(0x04050c, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x04050c, 0.0042);
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1600);
  camera.position.set(0, 0, START_Z);

  scene.add(new THREE.AmbientLight(0x4a5480, 1.1));
  const sun = new THREE.DirectionalLight(0xd6e0ff, 1.6);
  sun.position.set(-1, 1.2, 1.4);
  scene.add(sun);

  const uniforms = {
    uTime: { value: 0 },
    uPR: { value: 1 },
    uShift: { value: 0 },
    uZMin: { value: Z_MIN },
    uRange: { value: Z_RANGE },
    uStretch: { value: 0 },
    uAlpha: { value: 0 }
  };

  /* ---------- Textura radial reutilizable ---------- */
  const glow = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,.45)');
    grd.addColorStop(0.6, 'rgba(255,255,255,.08)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const sprite = (color, scale, opacity) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    s.scale.set(scale, scale, 1);
    return s;
  };

  /* ---------- Estrellas + estelas ---------- */
  const STARS = MOBILE ? 2600 : 6200;
  const STREAKS = MOBILE ? 700 : 1600;
  const pos = new Float32Array(STARS * 3), size = new Float32Array(STARS), seed = new Float32Array(STARS), col = new Float32Array(STARS * 3);
  const palette = [new THREE.Color(0xc9d6ff), new THREE.Color(0x9fb6ff), new THREE.Color(0xd8c4ff), new THREE.Color(0xa9f3ff), new THREE.Color(0xffffff)];
  for (let i = 0; i < STARS; i++) {
    const r = 18 + Math.pow(Math.random(), 0.7) * 420, a = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.sin(a) * r * 0.62;
    pos[i * 3 + 2] = Z_MIN + Math.random() * Z_RANGE;
    size[i] = 0.6 + Math.pow(Math.random(), 3) * 3.2;
    seed[i] = Math.random();
    const c = palette[(Math.random() * palette.length) | 0];
    col.set([c.r, c.g, c.b], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  starGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const wrapGLSL = 'vec3 p = position; p.z = mod(p.z + uShift - uZMin, uRange) + uZMin;';
  const stars = new THREE.Points(starGeo, new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aSize; attribute float aSeed; attribute vec3 aColor;
      uniform float uTime, uPR, uShift, uZMin, uRange;
      varying vec3 vColor; varying float vA;
      void main(){
        ${wrapGLSL}
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float tw = 0.62 + 0.38 * sin(uTime * (0.5 + aSeed * 1.8) + aSeed * 40.0);
        vColor = aColor;
        vA = tw * smoothstep(720.0, 140.0, -mv.z) * smoothstep(0.5, 6.0, -mv.z);
        gl_PointSize = aSize * uPR * (240.0 / max(1.0, -mv.z)) + 0.6 * uPR;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor, a * a * vA);
      }`
  }));
  stars.frustumCulled = false;
  scene.add(stars);

  const sPos = new Float32Array(STREAKS * 6), sTail = new Float32Array(STREAKS * 2);
  for (let i = 0; i < STREAKS; i++) {
    for (let k = 0; k < 2; k++) {
      sPos.set([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], (i * 2 + k) * 3);
      sTail[i * 2 + k] = k;
    }
  }
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  streakGeo.setAttribute('aTail', new THREE.BufferAttribute(sTail, 1));
  const streaks = new THREE.LineSegments(streakGeo, new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aTail;
      uniform float uShift, uZMin, uRange, uStretch, uAlpha;
      varying float vA;
      void main(){
        ${wrapGLSL}
        p.z -= aTail * uStretch;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = (1.0 - aTail * 0.92) * uAlpha * smoothstep(520.0, 60.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA;
      void main(){ gl_FragColor = vec4(0.72, 0.8, 1.0, vA); }`
  }));
  streaks.frustumCulled = false;
  scene.add(streaks);

  /* ---------- Nebulosas ---------- */
  const nebulaColors = [0x3a5bff, 0x7b4dff, 0x1fb8ff, 0xff4fa0, 0xffa040, 0x4d7bff, 0x9a5cff, 0x22d6c4];
  const nebulae = [];
  for (let i = 0; i < 16; i++) {
    const s = sprite(nebulaColors[i % nebulaColors.length], 220 + Math.random() * 380, 0.1 + Math.random() * 0.12);
    const side = i % 2 ? 1 : -1;
    s.position.set(side * (60 + Math.random() * 160), (Math.random() - 0.5) * 140, START_Z - 120 - (i / 16) * TRAVEL - Math.random() * 80);
    nebulae.push(s);
    scene.add(s);
  }

  /* ---------- Núcleo (hero): el "sistema de agentes" ---------- */
  const fresnelVS = `
    varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){
      vP = position;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`;
  const core = new THREE.Group();
  const coreUniforms = { uTime: uniforms.uTime, uC1: { value: new THREE.Color(0x6f8cff) }, uC2: { value: new THREE.Color(0xc89bff) } };
  const coreShell = new THREE.Mesh(new THREE.IcosahedronGeometry(6.4, 3), new THREE.ShaderMaterial({
    uniforms: coreUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: fresnelVS,
    fragmentShader: `
      uniform float uTime; uniform vec3 uC1, uC2;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.2);
        float band = 0.5 + 0.5 * sin(vP.y * 2.4 + uTime * 0.8 + sin(vP.x * 1.3 + uTime * 0.4));
        vec3 c = mix(uC1, uC2, band);
        gl_FragColor = vec4(c * (0.25 + f * 1.4), 0.12 + f * 0.85);
      }`
  }));
  const coreInner = new THREE.Mesh(new THREE.IcosahedronGeometry(4.2, 4), new THREE.ShaderMaterial({
    uniforms: coreUniforms,
    vertexShader: fresnelVS,
    fragmentShader: `
      uniform float uTime; uniform vec3 uC1, uC2;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        float f = pow(1.0 - max(dot(vN, vV), 0.0), 3.0);
        float n = 0.5 + 0.5 * sin(vP.x * 3.1 + uTime) * sin(vP.y * 2.7 - uTime * 0.7) * sin(vP.z * 2.3 + uTime * 0.5);
        vec3 c = mix(vec3(0.03, 0.04, 0.12), mix(uC1, uC2, n), 0.25 + n * 0.35) + f * uC2 * 0.9;
        gl_FragColor = vec4(c, 1.0);
      }`
  }));
  const coreWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(6.5, 1)),
    new THREE.LineBasicMaterial({ color: 0x9db4ff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  const coreHalo = sprite(0x6f7dff, 44, 0.55);
  core.add(coreHalo, coreInner, coreShell, coreWire);

  const rings = [];
  [[10.5, 0.04, 0x7aa2ff, [1.2, 0.2, 0]], [13.5, 0.03, 0xb48cff, [0.4, -0.7, 0.3]], [17, 0.025, 0x6ff0ff, [-0.9, 0.5, 0.1]]].forEach(([r, tube, color, rot]) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 160), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.set(rot[0], rot[1], rot[2]);
    rings.push(m);
    core.add(m);
  });

  // Agentes en órbita conectados al núcleo, con pulsos de datos.
  const AGENTS = 9;
  const agentGeo = new THREE.OctahedronGeometry(0.42, 0);
  const agents = [];
  const agentColors = [0x7aa2ff, 0xb48cff, 0x6ff0ff];
  for (let i = 0; i < AGENTS; i++) {
    const m = new THREE.Mesh(agentGeo, new THREE.MeshBasicMaterial({ color: agentColors[i % 3] }));
    const h = sprite(agentColors[i % 3], 3.2, 0.7);
    m.add(h);
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const ref = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(axis, ref).normalize();
    const v = new THREE.Vector3().crossVectors(axis, u).normalize();
    agents.push({ m, u, v, r: 9.5 + Math.random() * 8.5, speed: (0.18 + Math.random() * 0.25) * (i % 2 ? 1 : -1), phase: Math.random() * Math.PI * 2, pulse: Math.random() });
    core.add(m);
  }
  const linkPos = new Float32Array(AGENTS * 6);
  const links = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x9fb2ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  links.geometry.setAttribute('position', new THREE.BufferAttribute(linkPos, 3));
  links.frustumCulled = false;
  core.add(links);
  const pulsePos = new Float32Array(AGENTS * 3);
  const pulses = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xe6ecff, size: 0.55, map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pulses.geometry.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3));
  pulses.frustumCulled = false;
  core.add(pulses);
  scene.add(core);

  /* ---------- Planetas (laboratorio) ---------- */
  const planetVS = fresnelVS;
  const planetFS = `
    uniform float uTime, uBands, uSeed, uFade; uniform vec3 uC1, uC2, uC3;
    varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){
      vec3 q = normalize(vP);
      float w = sin(q.y * uBands + sin(q.x * 3.0 + uSeed) * 1.6 + sin(q.z * 5.0 + uTime * 0.05 + uSeed) * 0.8);
      float w2 = sin(q.y * uBands * 2.3 + q.x * 4.0 + uSeed * 3.0);
      vec3 base = mix(uC1, uC2, 0.5 + 0.5 * w);
      base = mix(base, uC3, smoothstep(0.6, 1.0, w2) * 0.35);
      vec3 L = normalize(vec3(-0.55, 0.55, 0.65));
      float diff = max(dot(vN, L), 0.0);
      float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.6);
      vec3 c = base * (0.07 + 0.95 * diff) + uC2 * f * 0.85;
      gl_FragColor = vec4(mix(vec3(0.016, 0.02, 0.047), c, uFade), 1.0);
    }`;
  const atmoFS = `
    uniform vec3 uC2; uniform float uFade; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){
      float f = pow(1.0 - abs(dot(vN, vV)), 3.0);
      gl_FragColor = vec4(uC2, f * 0.9 * uFade);
    }`;
  const ringFS = `
    uniform vec3 uC1, uC2; uniform float uIn, uOut, uFade; varying float vR;
    void main(){
      float t = (vR - uIn) / (uOut - uIn);
      float bands = 0.55 + 0.45 * sin(t * 42.0) * sin(t * 9.0 + 1.3);
      float edge = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.8, t);
      gl_FragColor = vec4(mix(uC1, uC2, t), bands * edge * 0.55 * uFade);
    }`;
  const PLANETS = [
    { id: 'deep-quota', c1: 0x2c2a16, c2: 0xd9e85c, c3: 0xff9a3d, r: 9, bands: 10, ring: false },
    { id: 'dados-del-pozo', c1: 0x0d2c2b, c2: 0x2fd1b0, c3: 0xe0b25a, r: 7.5, bands: 7, ring: true },
    { id: 'black-evac', c1: 0x1a1018, c2: 0xff7a59, c3: 0x7aa2ff, r: 10, bands: 14, ring: false },
    { id: 'skybreaker', c1: 0x15263c, c2: 0x6fc3ff, c3: 0xffb547, r: 8, bands: 6, ring: true },
    { id: 'one-more-horde', c1: 0x16240f, c2: 0x9cff6b, c3: 0xff5fa2, r: 9.5, bands: 11, ring: false }
  ];
  const planets = PLANETS.map((P, i) => {
    const g = new THREE.Group();
    const u = { uTime: uniforms.uTime, uFade: { value: 0 }, uBands: { value: P.bands }, uSeed: { value: i * 1.7 + 0.3 }, uC1: { value: new THREE.Color(P.c1) }, uC2: { value: new THREE.Color(P.c2) }, uC3: { value: new THREE.Color(P.c3) } };
    const body = new THREE.Mesh(new THREE.SphereGeometry(P.r, MOBILE ? 40 : 64, MOBILE ? 28 : 48), new THREE.ShaderMaterial({ uniforms: u, vertexShader: planetVS, fragmentShader: planetFS }));
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(P.r * 1.12, 48, 32), new THREE.ShaderMaterial({ uniforms: u, vertexShader: planetVS, fragmentShader: atmoFS, transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    const halo = sprite(P.c2, P.r * 5, 0.16);
    g.add(body, atmo, halo);
    if (P.ring) {
      const inner = P.r * 1.45, outer = P.r * 2.35;
      const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 128, 1), new THREE.ShaderMaterial({
        uniforms: { uC1: u.uC2, uC2: u.uC3, uIn: { value: inner }, uOut: { value: outer }, uFade: u.uFade },
        vertexShader: 'varying float vR; void main(){ vR = length(position.xy); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: ringFS,
        transparent: true, side: THREE.DoubleSide, depthWrite: false
      }));
      ring.rotation.set(1.25, 0.2, 0.35);
      g.add(ring);
    }
    g.userData = { body, halo, fade: u.uFade, spin: 0.04 + i * 0.012 };
    scene.add(g);
    return g;
  });

  /* ---------- Red de nodos (método) ---------- */
  const network = new THREE.Group();
  const NODES = MOBILE ? 46 : 80;
  const nodes = [];
  for (let i = 0; i < NODES; i++) {
    const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 46;
    nodes.push(new THREE.Vector3(Math.cos(a) * r * 1.35, Math.sin(a) * r * 0.75, (Math.random() - 0.5) * 140));
  }
  const edges = [];
  nodes.forEach((n, i) => {
    nodes.map((m, j) => [j, n.distanceToSquared(m)]).filter(([j]) => j !== i).sort((x, y) => x[1] - y[1]).slice(0, 2)
      .forEach(([j]) => { if (i < j || !edges.some(e => e[0] === j && e[1] === i)) edges.push([i, j]); });
  });
  const ePos = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], k) => { ePos.set([nodes[a].x, nodes[a].y, nodes[a].z, nodes[b].x, nodes[b].y, nodes[b].z], k * 6); });
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  network.add(new THREE.LineSegments(eGeo, new THREE.LineBasicMaterial({ color: 0x8aa0ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false })));
  const nGeo = new THREE.BufferGeometry().setFromPoints(nodes);
  network.add(new THREE.Points(nGeo, new THREE.PointsMaterial({ color: 0xc5d2ff, size: 1.4, map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  scene.add(network);

  /* ---------- Cinturón de asteroides (recorrido) ---------- */
  const ROCKS = MOBILE ? 110 : 240;
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x737ca0, flatShading: true }), ROCKS);
  const rockData = [];
  for (let i = 0; i < ROCKS; i++) {
    const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 60;
    rockData.push({
      p: new THREE.Vector3(Math.cos(a) * r * 1.4, Math.sin(a) * r * 0.8, (Math.random() - 0.5) * 260),
      s: 0.3 + Math.pow(Math.random(), 3) * 2.6,
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: (Math.random() - 0.5) * 0.8
    });
  }
  const rockGroup = new THREE.Group();
  rockGroup.add(rocks);
  scene.add(rockGroup);
  const dummy = new THREE.Object3D();
  function updateRocks(t) {
    rockData.forEach((d, i) => {
      dummy.position.copy(d.p);
      dummy.rotation.set(d.rot.x + t * d.spin, d.rot.y + t * d.spin * 0.7, d.rot.z);
      dummy.scale.setScalar(d.s);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    });
    rocks.instanceMatrix.needsUpdate = true;
  }
  updateRocks(0);

  /* ---------- Portal final (contacto) ---------- */
  const gate = new THREE.Group();
  const gateMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  gate.add(new THREE.Mesh(new THREE.TorusGeometry(30, 0.22, 8, 220), gateMat(0x9db4ff, 0.9)));
  gate.add(new THREE.Mesh(new THREE.TorusGeometry(34, 0.08, 6, 220), gateMat(0xb48cff, 0.6)));
  gate.add(new THREE.Mesh(new THREE.TorusGeometry(26, 0.05, 6, 220), gateMat(0x6ff0ff, 0.5)));
  gate.add(sprite(0x5a6cff, 150, 0.25));
  const GP = MOBILE ? 500 : 1100;
  const gp = new Float32Array(GP * 3);
  for (let i = 0; i < GP; i++) {
    const a = Math.random() * Math.PI * 2, r = 30 + (Math.random() - 0.5) * 7 * Math.random();
    gp.set([Math.cos(a) * r, Math.sin(a) * r, (Math.random() - 0.5) * 3], i * 3);
  }
  const gpGeo = new THREE.BufferGeometry();
  gpGeo.setAttribute('position', new THREE.BufferAttribute(gp, 3));
  const gateDust = new THREE.Points(gpGeo, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 0.5, map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  gate.add(gateDust);
  scene.add(gate);

  /* ---------- Colocación según el layout ---------- */
  let maxScroll = 1;
  const camZAt = p => START_Z - p * TRAVEL;
  const progressAt = (el, frac = 0.5) => {
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return clamp((r.top + scrollY + r.height * frac - innerHeight * 0.5) / maxScroll, 0, 1);
  };
  function layout() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 1.75));
    renderer.setSize(w, h, false);
    uniforms.uPR.value = renderer.getPixelRatio();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    maxScroll = Math.max(1, document.documentElement.scrollHeight - h);
    const wide = camera.aspect > 1.15;

    if (wide) { core.position.set(16 * Math.min(1.25, camera.aspect / 1.6), 4, -6); core.scale.setScalar(1); }
    else { core.position.set(10, 13, -24); core.scale.setScalar(0.75); }

    planets.forEach((g, i) => {
      const el = document.getElementById(PLANETS[i].id);
      const z = camZAt(progressAt(el)) - 62;
      const side = i % 2 ? -1 : 1;
      g.position.set(side * (wide ? 40 + camera.aspect * 4 : 17), (i % 2 ? 9 : -8), z);
    });
    network.position.set(0, 0, camZAt(progressAt(document.getElementById('metodo'), 0.45)) - 20);
    rockGroup.position.set(0, 0, camZAt(progressAt(document.getElementById('recorrido'), 0.5)) - 30);
    gate.position.set(0, wide ? 0 : 4, camZAt(1) - 78);
    dirty = true;
  }

  /* ---------- Entrada ---------- */
  let px = 0, py = 0, cx = 0, cy = 0;
  addEventListener('pointermove', e => {
    px = e.clientX / innerWidth - 0.5;
    py = e.clientY / innerHeight - 0.5;
  }, { passive: true });

  let scrollP = 0, dirty = true;
  const readScroll = () => { scrollP = clamp(scrollY / maxScroll, 0, 1); dirty = true; };
  addEventListener('scroll', readScroll, { passive: true });
  let resizeT = 0;
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { layout(); readScroll(); }, 120); }, { passive: true });
  // El layout cambia cuando cargan fuentes o imágenes.
  if ('ResizeObserver' in window) new ResizeObserver(() => { layout(); readScroll(); }).observe(document.body);
  document.addEventListener('motionchange', () => { dirty = true; });

  let warpT = 0;
  document.addEventListener('warp', () => { if (!isPaused()) warpT = 1; });

  /* ---------- Bucle ---------- */
  let last = performance.now(), time = 0, camZ = START_Z, prevZ = START_Z, vel = 0, shown = false;
  const look = new THREE.Vector3();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    const paused = isPaused();
    if (paused && !dirty) return;
    dirty = false;

    const target = camZAt(scrollP);
    if (paused) {
      camZ = target; vel = 0; warpT = 0; cx = 0; cy = 0;
    } else {
      time += dt;
      camZ += (target - camZ) * (1 - Math.pow(0.002, dt));
      vel = vel * 0.85 + ((prevZ - camZ) / Math.max(dt, 0.001)) * 0.15;
      cx += (px * 7 - cx) * (1 - Math.pow(0.05, dt));
      cy += (-py * 4.5 - cy) * (1 - Math.pow(0.05, dt));
      warpT = Math.max(0, warpT - dt / 2.6);
    }
    prevZ = camZ;
    const speed = Math.abs(vel);
    const warpE = warpT > 0 ? Math.sin(Math.min(1, warpT) * Math.PI) : 0;

    uniforms.uTime.value = time;
    if (!paused) uniforms.uShift.value = (uniforms.uShift.value + dt * (1.6 + warpE * 520)) % Z_RANGE;
    uniforms.uStretch.value = Math.min(70, speed * 0.09) + warpE * 160;
    uniforms.uAlpha.value = Math.min(0.85, speed / 260) + warpE * 0.9;

    const shake = warpE * 0.35;
    camera.position.set(cx + (Math.random() - 0.5) * shake, cy + (Math.random() - 0.5) * shake, camZ);
    look.set(cx * 0.35, cy * 0.35, camZ - 100);
    camera.lookAt(look);
    const fov = 60 + Math.min(9, speed * 0.018) + warpE * 22;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

    // Núcleo
    core.rotation.y = time * 0.08 + px * 0.4;
    core.rotation.x = py * 0.25;
    coreShell.rotation.y = -time * 0.12;
    coreWire.rotation.set(time * 0.05, time * 0.09, 0);
    rings.forEach((r, i) => { r.rotation.z += paused ? 0 : dt * (0.08 + i * 0.05) * (i % 2 ? -1 : 1); });
    agents.forEach((a, i) => {
      const ang = a.phase + time * a.speed;
      a.m.position.copy(a.u).multiplyScalar(Math.cos(ang) * a.r).addScaledVector(a.v, Math.sin(ang) * a.r);
      a.m.rotation.set(time * 0.9, time * 0.6, 0);
      linkPos.set([0, 0, 0, a.m.position.x, a.m.position.y, a.m.position.z], i * 6);
      const f = (a.pulse + time * 0.35) % 1;
      pulsePos.set([a.m.position.x * f, a.m.position.y * f, a.m.position.z * f], i * 3);
    });
    links.geometry.attributes.position.needsUpdate = true;
    pulses.geometry.attributes.position.needsUpdate = true;
    // Visible solo cerca del inicio
    core.visible = camZ > -260;

    planets.forEach(g => {
      // Los ShaderMaterial no usan la niebla: se funden a mano según la distancia.
      const ahead = camZ - g.position.z;
      const fade = clamp((340 - ahead) / 160, 0, 1) * clamp((ahead + 30) / 30, 0, 1);
      g.visible = fade > 0.001;
      g.userData.fade.value = fade;
      g.userData.halo.material.opacity = 0.16 * fade;
      g.userData.body.rotation.y = time * g.userData.spin;
      g.rotation.z = Math.sin(time * 0.1) * 0.05;
    });
    network.rotation.z = time * 0.03;
    if (!paused) updateRocks(time);
    gate.rotation.z = time * 0.05;
    gateDust.rotation.z = -time * 0.12;

    renderer.render(scene, camera);
    if (!shown) { shown = true; root.classList.add('webgl-ready'); }
  }

  layout();
  readScroll();
  camZ = prevZ = camZAt(scrollP);
  requestAnimationFrame(frame);
}
