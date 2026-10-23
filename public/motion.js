// Vida na página: revelações ao rolar (GSAP), celular com parallax, cards com brilho
// e a arte 3D de fundo (Three.js). Nada aqui é obrigatório: se uma biblioteca não
// carregar, a página continua funcionando e tudo fica visível.
// Princípios em docs/design-system.md (seção 5).
//
// Versões da LP pela rota (motion sempre ligado, cada uma com sua arte 3D):
//   /fichas  → ficha de poker preta e dourada
//   /spin    → tambor do Spin Suprema com os multiplicadores
//   /        → padrão: ficha, respeitando a preferência de menos movimento do sistema

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const ROUTE = (location.pathname.match(/^[/](fichas|spin)[/]?$/) || [])[1] || '';
const ART = ROUTE === 'spin' ? 'spin' : 'chip';
const forceMotion = /[?&]motion=on(?:&|$)/.test(location.search) || Boolean(ROUTE);
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

// ---------- Arte 3D de fundo: acompanha a rolagem e pode ser arrastada ----------

// Caminho da arte ao longo da página (p = 0 topo, 1 fim): x/y em fração da meia-largura/meia-altura visível.
const PATH = [
  { p: 0.00, x: -0.66, y: -0.18, s: 1.00 },
  { p: 0.32, x: 0.72, y: 0.18, s: 0.82 },
  { p: 0.64, x: -0.70, y: 0.00, s: 0.72 },
  { p: 1.00, x: 0.00, y: 0.10, s: 1.05 },
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
const GOLD = '#efa144';

const makeTexture = (THREE, cv) => {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
};

// --- Ficha de poker: disco preto, listras douradas na borda, ♠ e o nome do clube ---

function chipFaceTexture(THREE, label) {
  const size = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const c = size / 2;

  g.fillStyle = '#141416';
  g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();

  for (let i = 0; i < 8; i++) { // marcas da borda, como numa ficha de cassino
    const a0 = (i / 8) * Math.PI * 2 - Math.PI / 24;
    g.fillStyle = GOLD;
    g.beginPath();
    g.arc(c, c, c, a0, a0 + Math.PI / 12);
    g.arc(c, c, c * 0.84, a0 + Math.PI / 12, a0, true);
    g.closePath();
    g.fill();
  }
  const ring = (r, w, color) => { g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); };
  ring(c * 0.84, 10, GOLD);
  ring(c * 0.66, 6, GOLD);
  ring(c * 0.62, 2, 'rgba(239, 161, 68, .5)');

  g.fillStyle = GOLD;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${Math.round(size * 0.3)}px "Segoe UI Symbol", "Apple Symbols", "Montserrat", Arial, sans-serif`;
  g.fillText('♠', c, c - size * 0.015);
  g.font = `800 ${Math.round(size * 0.065)}px "Montserrat", Arial, sans-serif`;
  g.fillStyle = '#ffffff';
  g.fillText('SUPREMA', c, c + size * 0.21);
  g.font = `700 ${Math.round(size * 0.04)}px "Montserrat", Arial, sans-serif`;
  g.fillStyle = GOLD;
  g.fillText(label, c, c + size * 0.275);
  g.fillText('POKER', c, c - size * 0.255);
  return makeTexture(THREE, cv);
}

function buildChip(THREE) {
  const R = 1.55, H = 0.26;
  const clubLabel = ($('[data-bind="club-id"]')?.textContent || '').trim();
  const face = new THREE.MeshStandardMaterial({ map: chipFaceTexture(THREE, clubLabel ? `CLUBE ${clubLabel}` : 'CLUBE'), metalness: 0.35, roughness: 0.4 });
  const side = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, metalness: 0.45, roughness: 0.5 });
  const chip = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 96, 1, false), [side, face, face]);
  const gold = new THREE.MeshStandardMaterial({ color: 0xefa144, metalness: 0.7, roughness: 0.3, emissive: 0x2a1a05 });
  for (let i = 0; i < 8; i++) {
    chip.add(new THREE.Mesh(new THREE.CylinderGeometry(R + 0.006, R + 0.006, H + 0.004, 24, 1, true, (i / 8) * Math.PI * 2 - Math.PI / 24, Math.PI / 12), gold));
  }
  const tilt = new THREE.Group();
  tilt.add(chip);
  let spin = 0;
  return {
    root: tilt,
    hitRadius: R,
    // arrastar na horizontal faz a ficha girar mais
    impulse: (dx) => { spin += dx * 1.5; },
    update: (dt, t, progress) => {
      spin *= 1 - Math.min(1, dt * 1.2);
      chip.rotation.y += dt * 0.45 + spin * dt;
      tilt.rotation.x = -1.15 + progress * 0.85 + Math.sin(t * 0.4) * 0.06;
      tilt.rotation.z = Math.sin(t * 0.3) * 0.12;
    },
  };
}

// --- Tambor do Spin Suprema: multiplicadores em verde feltro com molduras douradas ---

const MULTIPLIERS = ['2×', '5×', '10×', '100×', '1.000×', '50.000×'];

function reelTexture(THREE) {
  const W = 3072, Hh = 768; // largura = volta do tambor, altura = comprimento (eixo)
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = Hh;
  const g = cv.getContext('2d');
  const seg = W / MULTIPLIERS.length;
  MULTIPLIERS.forEach((label, i) => {
    const x0 = i * seg;
    const grad = g.createLinearGradient(x0, 0, x0 + seg, 0);
    grad.addColorStop(0, '#0a3320');
    grad.addColorStop(0.5, '#15663d');
    grad.addColorStop(1, '#0a3320');
    g.fillStyle = grad;
    g.fillRect(x0, 0, seg, Hh);
    g.fillStyle = GOLD; // divisórias e bordas douradas
    g.fillRect(x0, 0, 8, Hh);
    g.fillRect(x0, 0, seg, 26);
    g.fillRect(x0, Hh - 26, seg, 26);
    g.fillStyle = 'rgba(0, 0, 0, .35)'; // sombra interna (profundidade do tambor)
    g.fillRect(x0, 26, seg, 40);
    g.fillRect(x0, Hh - 66, seg, 40);

    g.save(); // o texto corre ao longo do eixo: lê-se na horizontal quando o tambor está deitado
    g.translate(x0 + seg / 2, Hh / 2);
    g.rotate(Math.PI / 2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${label.length > 5 ? 230 : 300}px "Antonio", "Montserrat", Arial, sans-serif`;
    g.fillStyle = 'rgba(0, 0, 0, .45)';
    g.fillText(label, 8, 10);
    g.fillStyle = i === MULTIPLIERS.length - 1 ? GOLD : '#ffffff';
    g.fillText(label, 0, 0);
    g.restore();
  });
  return makeTexture(THREE, cv);
}

function buildReel(THREE) {
  const R = 1.25, L = 2.6;
  const side = new THREE.MeshStandardMaterial({ map: reelTexture(THREE), metalness: 0.15, roughness: 0.55 });
  const cap = new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.5, roughness: 0.45 });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 72, 1, false), [side, cap, cap]);
  const gold = new THREE.MeshStandardMaterial({ color: 0xefa144, metalness: 0.75, roughness: 0.28, emissive: 0x2a1a05 });
  for (const y of [-L / 2, L / 2]) { // aros dourados nas pontas
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.01, 0.07, 16, 72), gold);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = y;
    drum.add(rim);
  }
  const holder = new THREE.Group(); // deita o tambor: o eixo fica na horizontal
  holder.rotation.z = Math.PI / 2;
  holder.add(drum);
  // Tampas fixas com a face da ficha: ficam paradas enquanto o tambor gira
  const faceTex = chipFaceTexture(THREE, 'SPIN');
  faceTex.center.set(0.5, 0.5);
  faceTex.rotation = -Math.PI / 2;
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, metalness: 0.35, roughness: 0.4 });
  for (const sgn of [-1, 1]) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R - 0.01, 72), faceMat);
    disc.position.y = sgn * (L / 2 + 0.003);
    disc.rotation.x = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;
    holder.add(disc);
  }
  const root = new THREE.Group();
  root.add(holder);
  // Janela do rolo: duas barras douradas fixas na frente do tambor
  for (const y of [-0.72, 0.72]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(L + 0.1, 0.08, 0.08), gold);
    bar.position.set(0, y, R + 0.04);
    root.add(bar);
  }
  let spin = 0, angle = 0;
  return {
    root,
    hitRadius: 1.5,
    // arrastar na vertical gira o rolo
    impulse: (dx, dy) => { spin += dy * 2.2; },
    update: (dt, t, progress) => {
      spin *= 1 - Math.min(1, dt * 1.4);
      angle += dt * 0.35 + spin * dt;
      drum.rotation.y = angle + progress * Math.PI * 3; // rolar a página gira o tambor
      root.rotation.y = -0.22 + Math.sin(t * 0.3) * 0.05;
      root.rotation.x = 0.1 + Math.sin(t * 0.4) * 0.04;
    },
  };
}

async function init3D() {
  const canvas = $('#chip3d');
  if (!canvas) return;
  if (reduceMotion || !isDesktop() || !window.WebGLRenderingContext) { canvas.remove(); return; }

  let THREE;
  try {
    THREE = await import('https://cdnjs.cloudflare.com/ajax/libs/three.js/0.170.0/three.module.min.js');
  } catch {
    canvas.remove();
    return;
  }
  try { await document.fonts?.ready; } catch { /* segue com a fonte padrão */ }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    canvas.remove();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.z = 7.5;

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(3, 5, 6);
  scene.add(key);
  const warm = new THREE.PointLight(0xefa144, 60, 30);
  warm.position.set(-4, -2, 4);
  scene.add(warm);

  const art = ART === 'spin' ? buildReel(THREE) : buildChip(THREE);
  const group = new THREE.Group(); // posição e escala (caminho + arraste)
  group.add(art.root);
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
  const overArt = (e) => {
    const c = group.position.clone().project(camera);
    const sx = ((c.x + 1) / 2) * w;
    const sy = ((1 - c.y) / 2) * h;
    const radiusPx = (art.hitRadius * group.scale.x / halfHeight()) * (h / 2);
    return Math.hypot(e.clientX - sx, e.clientY - sy) < radiusPx;
  };
  const freeArea = (e) => visible && !e.target.closest?.(INTERACTIVE) && $('#sheet')?.hidden !== false;

  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !freeArea(e) || !overArt(e)) return;
    dragging = true;
    pointerToWorld(e, hit);
    grabOffset.copy(group.position).sub(hit);
    document.body.classList.add('grabbing');
    e.preventDefault();
  });
  window.addEventListener('pointermove', (e) => {
    if (dragging) {
      pointerToWorld(e, hit);
      const bx = drag.x, by = drag.y;
      drag.copy(hit).add(grabOffset).sub(target);
      art.impulse(drag.x - bx, drag.y - by);
      return;
    }
    if (!finePointer) return;
    const over = freeArea(e) && overArt(e);
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
  let t = 0;
  const frame = (now) => {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;

    pathAt(progress, pathOut);
    target.set(pathOut.x * halfWidth(), pathOut.y * halfHeight(), 0);
    targetScale = pathOut.s;
    if (!dragging) drag.multiplyScalar(1 - Math.min(1, dt * 3)); // volta devagar ao lugar

    group.position.x += (target.x + drag.x - group.position.x) * Math.min(1, dt * 4);
    group.position.y += (target.y + drag.y - group.position.y) * Math.min(1, dt * 4);
    const s = group.scale.x + (targetScale - group.scale.x) * Math.min(1, dt * 3);
    group.scale.setScalar(s);

    art.update(dt, t, progress);
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
  init3D();
}
// app.js avisa quando a configuração chegou e os blocos do fluxo certo já estão visíveis.
document.addEventListener('lp:ready', boot, { once: true });
// Se a configuração demorar ou falhar, anima mesmo assim o que está na página.
setTimeout(boot, 2500);
