// Vida na página: revelações ao rolar (GSAP), celular com parallax, cards com brilho
// e a esfera 3D de fundo (Three.js). Nada aqui é obrigatório: se uma biblioteca não
// carregar, a página continua funcionando e tudo fica visível.
// Princípios em docs/design-system.md (seção 5).

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const forceMotion = /[?&]motion=on(?:&|$)/.test(location.search); // para ver tudo mesmo com o sistema pedindo menos movimento
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches && !forceMotion;
const finePointer = window.matchMedia('(pointer: fine)').matches;
const isDesktop = () => window.innerWidth >= 900;

if (reduceMotion) document.documentElement.classList.add('no-motion');

// ---------- Revelação com stagger ----------

function revealAll() {
  $$('.reveal').forEach((el) => el.classList.add('in'));
}

function initReveal() {
  if (reduceMotion || !window.gsap || !window.ScrollTrigger) return revealAll();
  gsap.registerPlugin(ScrollTrigger);

  // Agrupa por seção: os itens de uma mesma seção entram em sequência (90 ms entre eles).
  const groups = new Map();
  $$('.reveal').forEach((el) => {
    if (el.closest('[hidden]')) { el.classList.add('in'); return; } // fluxo que não está ativo
    const key = el.closest('section, footer') || document.body;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(el);
  });

  groups.forEach((items, container) => {
    gsap.set(items, { autoAlpha: 0, y: 30 });
    gsap.to(items, {
      autoAlpha: 1,
      y: 0,
      duration: 0.9,
      ease: 'expo.out',
      stagger: 0.09,
      scrollTrigger: { trigger: container, start: 'top 82%', once: true },
      onComplete: () => {
        items.forEach((el) => el.classList.add('in'));
        gsap.set(items, { clearProps: 'transform' }); // libera o hover dos cards
      },
    });
  });

  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
}

// ---------- Celular: flutua (CSS), inclina com o mouse e acompanha a rolagem ----------

function initPhone() {
  const stage = $('#phone-stage');
  const visual = $('#hero-visual');
  if (!stage || !visual || reduceMotion) return;

  let rx = 0, ry = 0, tx = 0, ty = 0, sy = 0, raf = 0;
  const paint = () => {
    raf = 0;
    rx += (tx - rx) * 0.08;
    ry += (ty - ry) * 0.08;
    stage.style.transform = `translate3d(0, ${sy.toFixed(1)}px, 0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    if (Math.abs(tx - rx) > 0.05 || Math.abs(ty - ry) > 0.05) raf = requestAnimationFrame(paint);
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };

  if (finePointer) {
    visual.addEventListener('pointermove', (e) => {
      const r = visual.getBoundingClientRect();
      tx = -((e.clientY - r.top) / r.height - 0.5) * 12;
      ty = ((e.clientX - r.left) / r.width - 0.5) * 16;
      schedule();
    });
    visual.addEventListener('pointerleave', () => { tx = 0; ty = 0; schedule(); });
  }
  window.addEventListener('scroll', () => {
    sy = Math.min(window.scrollY * 0.14, 110);
    schedule();
  }, { passive: true });
}

// ---------- Brilho que segue o cursor nos cards ----------

function initGlow() {
  if (!finePointer) return;
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.('.glow-card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
}

// ---------- Esfera 3D: wireframe dourado deformado por ruído, ligada à rolagem e arrastável ----------

// Simplex noise 3D (Ashima Arts / Stefan Gustavson, licença MIT)
const NOISE_GLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}`;

const VERTEX = `
uniform float uTime;
uniform float uStrength;
uniform float uDensity;
varying float vDisp;
${NOISE_GLSL}
void main() {
  float n = snoise(position * uDensity + vec3(uTime * 0.35, uTime * 0.25, uTime * 0.2));
  vDisp = n;
  vec3 p = position + normal * n * uStrength;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAGMENT = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vDisp;
void main() {
  float a = uOpacity * (0.4 + 0.6 * smoothstep(-1.0, 1.0, vDisp));
  gl_FragColor = vec4(uColor, a);
}`;

// Caminho da esfera ao longo da página (p = 0 topo, 1 fim): x em fração da meia-largura visível.
const PATH = [
  { p: 0.00, x: -0.66, y: -0.18, s: 0.92 },
  { p: 0.32, x: 0.72, y: 0.18, s: 0.76 },
  { p: 0.64, x: -0.70, y: 0.00, s: 0.66 },
  { p: 1.00, x: 0.00, y: 0.10, s: 1.00 },
];
const smooth = (t) => t * t * (3 - 2 * t);
function pathAt(p, out) {
  let a = PATH[0], b = PATH[PATH.length - 1];
  for (let i = 0; i < PATH.length - 1; i++) {
    if (p >= PATH[i].p && p <= PATH[i + 1].p) { a = PATH[i]; b = PATH[i + 1]; break; }
  }
  const t = b.p === a.p ? 0 : smooth((p - a.p) / (b.p - a.p));
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.s = a.s + (b.s - a.s) * t;
  return out;
}

const INTERACTIVE = 'a, button, input, textarea, select, label, summary, details, .sheet, .glow-card, .pill, .wa-float, .topbar, .toast';

async function initSphere() {
  const canvas = $('#sphere');
  if (!canvas) return;
  if (reduceMotion || !isDesktop() || !window.WebGLRenderingContext) { canvas.remove(); return; }

  let THREE;
  try {
    THREE = await import('https://cdnjs.cloudflare.com/ajax/libs/three.js/0.170.0/three.module.min.js');
  } catch {
    canvas.remove();
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    canvas.remove();
    return;
  }
  renderer.setPixelRatio(1); // 1x basta para um wireframe de fundo e poupa GPU
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
  camera.position.z = 7;

  const gold = new THREE.Color('#efa144');
  const uTime = { value: 0 };
  const uDensity = { value: 1.35 };
  const wire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.5, 9),
    new THREE.ShaderMaterial({
      uniforms: { uTime, uDensity, uStrength: { value: 0.36 }, uColor: { value: gold }, uOpacity: { value: 0.28 } },
      vertexShader: VERTEX, fragmentShader: FRAGMENT,
      wireframe: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.36, 5),
    new THREE.ShaderMaterial({
      uniforms: { uTime, uDensity, uStrength: { value: 0.3 }, uColor: { value: gold }, uOpacity: { value: 0.045 } },
      vertexShader: VERTEX, fragmentShader: FRAGMENT,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  const group = new THREE.Group();
  group.add(core);
  group.add(wire);
  scene.add(group);

  // Estado: alvo pela rolagem + deslocamento do arraste (que volta sozinho)
  let w = 1, h = 1, progress = 0, dragging = false, hover = false, visible = true;
  const target = new THREE.Vector3();
  const drag = new THREE.Vector3();
  const grabOffset = new THREE.Vector3();
  const hit = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const pathOut = { x: 0, y: 0, s: 1 };
  let targetScale = 1;

  const halfWidth = () => Math.tan((camera.fov * Math.PI) / 360) * camera.position.z * camera.aspect;
  const halfHeight = () => Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;

  const resize = () => {
    w = window.innerWidth;
    h = window.innerHeight;
    visible = isDesktop();
    canvas.style.display = visible ? '' : 'none';
    if (!visible) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  const readProgress = () => {
    const max = document.documentElement.scrollHeight - h;
    progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  };
  readProgress();
  window.addEventListener('scroll', readProgress, { passive: true });

  const pointerToWorld = (e, out) => {
    ndc.set((e.clientX / w) * 2 - 1, -(e.clientY / h) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    ray.ray.intersectPlane(plane, out);
    return out;
  };
  const overSphere = (e) => {
    const c = group.position.clone().project(camera);
    const sx = ((c.x + 1) / 2) * w;
    const sy = ((1 - c.y) / 2) * h;
    const radiusPx = (1.5 * group.scale.x / halfHeight()) * (h / 2);
    return Math.hypot(e.clientX - sx, e.clientY - sy) < radiusPx * 0.95;
  };
  const freeArea = (e) => visible && !e.target.closest?.(INTERACTIVE) && $('#sheet')?.hidden !== false;

  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !freeArea(e) || !overSphere(e)) return;
    dragging = true;
    pointerToWorld(e, hit);
    grabOffset.copy(group.position).sub(hit);
    document.body.classList.add('grabbing');
    e.preventDefault();
  });
  window.addEventListener('pointermove', (e) => {
    if (dragging) {
      pointerToWorld(e, hit);
      drag.copy(hit).add(grabOffset).sub(target);
      return;
    }
    if (!finePointer) return;
    const over = freeArea(e) && overSphere(e);
    if (over !== hover) {
      hover = over;
      document.body.classList.toggle('can-grab', over);
    }
  }, { passive: true });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('grabbing');
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);

  let last = performance.now();
  const frame = (now) => {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    uTime.value += dt;

    pathAt(progress, pathOut);
    target.set(pathOut.x * halfWidth(), pathOut.y * halfHeight(), 0);
    targetScale = pathOut.s;
    if (!dragging) drag.multiplyScalar(1 - Math.min(1, dt * 3)); // volta devagar ao lugar

    group.position.x += (target.x + drag.x - group.position.x) * Math.min(1, dt * 4);
    group.position.y += (target.y + drag.y - group.position.y) * Math.min(1, dt * 4);
    const s = group.scale.x + (targetScale - group.scale.x) * Math.min(1, dt * 3);
    group.scale.setScalar(s);
    group.rotation.y += dt * (dragging ? 0.6 : 0.18);
    group.rotation.x = Math.sin(uTime.value * 0.2) * 0.15 + progress * 0.7;

    renderer.render(scene, camera);
  };
  requestAnimationFrame(frame);
}

// ---------- Início ----------

let started = false;
function boot() {
  if (started) return;
  started = true;
  initReveal();
  initPhone();
  initGlow();
  initSphere();
}
// app.js avisa quando a configuração chegou e os blocos do fluxo certo já estão visíveis.
document.addEventListener('lp:ready', boot, { once: true });
// Se a configuração demorar ou falhar, anima mesmo assim o que está na página.
setTimeout(boot, 2500);
