// Кабинет восприятия — сцена, пост-шейдер и интерактивные иллюзии.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { BIASES, BIAS_TYPES, BRAIN_REGIONS, BRAIN_FUNCS } from './data/content.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fmt = (v, d = 0) => v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });

const RM = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = RM.matches;
RM.addEventListener?.('change', (e) => { reduced = e.matches; });

const ACCENT_RGB = { cobalt: [0, 0.278, 0.671], red: [0.89, 0, 0.133], lemon: [1, 0.957, 0.31] };
const ACCENT_CSS = { cobalt: '#0047ab', red: '#e30022', lemon: '#fff44f' };
const INK = '#0d0d0d', PAPER = '#f4f2ed';
const VERDICT = { ok: 'проверено', disputed: 'спорно', refuted: 'опровергнуто' };

const state = {
  mode: 'illusion',
  pointer: { x: innerWidth / 2, y: innerHeight / 2, inside: false, touchUntil: 0 },
  section: null,
  accent: 'cobalt',
};

// ——————————————————— общий раздел: режим, навигация, прогресс ———————————————————

const camSections = $$('[data-cam]');
const chapters = $$('section.chapter');
const halls = $$('section.hall');

function setMode(mode) {
  state.mode = mode;
  document.body.classList.toggle('mode-schema', mode === 'schema');
  document.body.classList.toggle('mode-illusion', mode === 'illusion');
  $$('.mode__btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  redrawers.forEach((f) => f());
}
$$('.mode__btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
const redrawers = []; // иллюзии, которые перерисовываются при смене режима

function buildNav() {
  const mk = (list, secs) => secs.forEach((s) => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="#${s.id}"><span>${s.dataset.num}</span><span>${s.dataset.title}</span></a>`;
    list.append(li);
  });
  mk($('#nav-chapters'), chapters);
  mk($('#nav-halls'), halls);
  const btn = $('.navbtn'), nav = $('#nav');
  const close = () => { nav.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => {
    const open = nav.hidden;
    nav.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) nav.querySelector('a')?.focus();
  });
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !nav.hidden) { close(); btn.focus(); } });
}
buildNav();

// кольца прогресса: 10 глав + общее кольцо залов
const ringSecs = [...chapters.map((s) => [s]), halls];
function buildRings() {
  const svg = $('#rings-svg');
  const n = ringSecs.length;
  let html = '';
  ringSecs.forEach((_, i) => {
    const r = 45 - i * (36 / n);
    const c = 2 * Math.PI * r;
    html += `<circle class="bg" cx="50" cy="50" r="${r.toFixed(2)}"/><circle class="fg" cx="50" cy="50" r="${r.toFixed(2)}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${c.toFixed(2)}" data-c="${c.toFixed(2)}"/>`;
  });
  svg.innerHTML = html;
}
buildRings();

let layout = [];
function measure() {
  layout = camSections.map((s) => ({ el: s, top: s.offsetTop, h: s.offsetHeight }));
}

function updateProgress(vc) {
  const fgs = $$('.rings .fg');
  let curTitle = 'Обложка';
  ringSecs.forEach((grp, i) => {
    const top = grp[0].offsetTop, bottom = grp[grp.length - 1].offsetTop + grp[grp.length - 1].offsetHeight;
    const p = clamp((vc - top) / (bottom - top));
    const c = +fgs[i].dataset.c;
    fgs[i].setAttribute('stroke-dashoffset', (c * (1 - p)).toFixed(2));
    const cur = vc >= top && vc < bottom;
    fgs[i].classList.toggle('cur', cur);
    if (cur) curTitle = grp.length > 1 ? 'Залы кабинета' : grp[0].dataset.title;
  });
  $('#rings-label').textContent = curTitle;
  const active = layout.findLast?.((l) => l.top <= vc) ?? layout.filter((l) => l.top <= vc).pop();
  $$('.nav__list a').forEach((a) => a.setAttribute('aria-current', String(active && a.getAttribute('href') === '#' + active.el.id)));
  if (active) {
    const acc = active.el.dataset.accent || 'cobalt';
    if (acc !== state.accent) {
      state.accent = acc;
      document.body.dataset.accent = acc;
    }
  }
}

// ——————————————————— заголовки, искажённые волной ———————————————————

const warpHeads = [];
function splitWarp() {
  $$('.warp').forEach((h) => {
    const text = h.textContent.trim();
    const words = text.split(/\s+/);
    let i = 0;
    const inner = words.map((w) => `<span class="w">${[...w].map((c) => `<span class="ch" style="--i:${i++}">${c}</span>`).join('')}</span>`).join(' ');
    h.innerHTML = `<span class="sr">${text}</span><span aria-hidden="true">${inner}</span>`;
    warpHeads.push({ el: h, chars: $$('.ch', h), visible: false, amp: -1 });
  });
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    const w = warpHeads.find((x) => x.el === e.target);
    if (w) w.visible = e.isIntersecting;
  }));
  warpHeads.forEach((w) => io.observe(w.el));
}
splitWarp();

// длинные слова заголовков не должны вылезать за плашку (узкие экраны)
function fitHeads() {
  warpHeads.forEach(({ el }) => {
    el.style.fontSize = '';
    const avail = el.clientWidth;
    const widest = Math.max(...$$('.w', el).map((w) => w.offsetWidth));
    if (widest > avail && avail > 0) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = Math.floor(fs * avail / widest * 0.97) + 'px';
    }
  });
}
fitHeads();
document.fonts?.ready.then(fitHeads);
addEventListener('resize', fitHeads);

function updateWarp(t) {
  const vh = innerHeight;
  for (const w of warpHeads) {
    if (!w.visible) continue;
    const r = w.el.getBoundingClientRect();
    const cy = r.top + r.height / 2;
    // в зоне чтения (верхние ~2/3 экрана) буквы выпрямляются
    let amp = reduced ? 0 : smooth(vh * 0.12, vh * 0.5, Math.abs(cy - vh * 0.38));
    amp = Math.round(amp * 100) / 100;
    if (amp === 0 && w.amp === 0) continue;
    w.amp = amp;
    w.chars.forEach((c, i) => {
      if (amp === 0) { c.style.removeProperty('--dy'); c.style.removeProperty('--sk'); c.style.removeProperty('--sy'); return; }
      const ph = i * 0.62 + t * 0.9;
      c.style.setProperty('--dy', (Math.sin(ph) * 11 * amp).toFixed(2) + 'px');
      c.style.setProperty('--sk', (Math.cos(ph * 0.8) * 16 * amp).toFixed(2) + 'deg');
      c.style.setProperty('--sy', (1 + Math.sin(ph * 1.3 + 1) * 0.28 * amp).toFixed(3));
    });
  }
}

// ——————————————————— кляксы Роршаха и значки-мишени ———————————————————

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
let blotN = 0;
function blotSVG(seed) {
  const r = rng(seed * 9301 + 49297);
  const id = 'bl' + blotN++;
  let shapes = '';
  const n = 7 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) {
    const x = 50 + 3 + r() * 36, y = 14 + r() * 72;
    const rx = 4 + r() * 13, ry = 3 + r() * 11;
    const cls = i === 2 ? 'acc' : 'ink';
    const a = (r() * 180).toFixed(0);
    shapes += `<ellipse class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" transform="rotate(${a} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    shapes += `<ellipse class="${cls}" cx="${(100 - x).toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" transform="rotate(${-a} ${(100 - x).toFixed(1)} ${y.toFixed(1)})"/>`;
  }
  // ось сгиба — чернила вдоль центра
  shapes += `<ellipse class="ink" cx="50" cy="${(40 + r() * 20).toFixed(1)}" rx="${(5 + r() * 5).toFixed(1)}" ry="${(18 + r() * 16).toFixed(1)}"/>`;
  // брызги
  for (let i = 0; i < 5; i++) {
    const x = 60 + r() * 34, y = 8 + r() * 84, rr = 0.8 + r() * 2.2;
    shapes += `<circle class="ink" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}"/><circle class="ink" cx="${(100 - x).toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}"/>`;
  }
  const sc = (0.6 + r() * 0.8).toFixed(2);
  return `<svg class="blot" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <defs><filter id="${id}" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="b"/>
      <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="g"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="${seed % 97}" result="n"/>
      <feDisplacementMap in="g" in2="n" scale="${(5 * sc).toFixed(1)}" xChannelSelector="R" yChannelSelector="G"/>
    </filter></defs>
    <g class="spread"><g filter="url(#${id})">${shapes}</g></g></svg>`;
}

function targetSVG(v) {
  const rings = '<circle cx="16" cy="16" r="14"/><circle cx="16" cy="16" r="9.5"/><circle cx="16" cy="16" r="5"/>';
  if (v === 'ok') return `<svg class="target" viewBox="0 0 32 32" aria-hidden="true">${rings}<circle class="hit" cx="16" cy="16" r="3.2"/></svg>`;
  if (v === 'disputed') return `<svg class="target" viewBox="0 0 32 32" aria-hidden="true">${rings}<circle class="hit" cx="22.5" cy="10.5" r="3.2"/></svg>`;
  return `<svg class="target" viewBox="0 0 32 32" aria-hidden="true">${rings}<path class="x" d="M24 3l6 6M30 3l-6 6"/></svg>`;
}
function verdictHTML(v) { return `${targetSVG(v)}<span>${VERDICT[v]}</span>`; }

function decorate(root = document) {
  $$('[data-seed]', root).forEach((b) => { if (!b.firstChild) b.innerHTML = blotSVG(+b.dataset.seed); });
  $$('[data-v]', root).forEach((card) => {
    const v = card.dataset.v;
    $$('.fact__v', card).forEach((p) => { if (!p.firstChild) p.innerHTML = verdictHTML(v); });
  });
}

// ——————————————————— появление, счётчики ———————————————————

function countUp(el) {
  const target = +el.dataset.count, dec = +(el.dataset.dec || 0);
  if (reduced) { el.textContent = fmt(target, dec); return; }
  const t0 = performance.now(), dur = 1300;
  const step = (now) => {
    const p = clamp((now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(target * e, dec);
    if (p < 1) requestAnimationFrame(step);
  };
  el.textContent = fmt(0, dec);
  requestAnimationFrame(step);
}
const revealIO = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  const el = e.target;
  revealIO.unobserve(el);
  el.classList.add('is-in');
  if (el.dataset.count) countUp(el);
  if (el.classList.contains('bar__fill')) el.style.setProperty('--p', 1);
}), { threshold: 0.25 });
function observeReveals(root = document) {
  $$('.fact, .vcard, .myth, .bcard, [data-count]', root).forEach((el) => revealIO.observe(el));
  $$('.bar__fill', root).forEach((el) => { el.style.setProperty('--p', 0); revealIO.observe(el); });
}

// ——————————————————— 3D: комната Эймса ———————————————————

const P = new THREE.Vector3(0, 1.6, 9);     // «глазок»
const K = 0.1;                              // сила проективного искажения
const ROOM = { x0: -4, x1: 4, y0: 0, y1: 4.5, z0: -6, z1: 3 };
// Проективное преобразование, сохраняющее лучи из P: из глазка картинка не меняется
const toReal = (v) => { const d = v.clone().sub(P); return P.clone().add(d.multiplyScalar(1 / (1 + K * d.x))); };
const sAt = (x) => 1 / (1 + K * (x - P.x));

const FIG = { x: 3.35, z: -4.9, h: 2.75 };
const figL = toReal(new THREE.Vector3(-FIG.x, 0, FIG.z));
const figR = toReal(new THREE.Vector3(FIG.x, 0, FIG.z));
const ROOM_C = new THREE.Vector3(-1.2, 1.2, -7.5);

const CAMS = {
  hero: { p: [0, 1.6, 9], l: [0, 2.0, -6] },
  entry: { p: [-0.5, 7.5, 13], l: [-2.2, 0.6, -7] },
  perception: { p: [-9.5, 2.6, 5.5], l: [-0.5, 1.4, -6] },
  attention: { p: [-1.2, 15, -2.5], l: [-1.2, 0, -7.5] },
  memory: { p: [5.2, 1.3, 2.2], l: [-5, 1.9, -12] },
  emotions: { p: [-2.4, 1.1, 1.2], l: [4, 1.4, -4] },
  systems: { p: [0.9, 2.0, 9.6], l: [0, 2.0, -6] },
  biases: { p: [10, 7, 6], l: [-1.5, 0.8, -7] },
  stress: { p: [-11, 8, -4], l: [0.5, 0.6, -6] },
  replication: { p: [3, 5, -20], l: [-1.5, 1.2, -5] },
  final: { p: [0, 1.6, 9], l: [0, 2.0, -6] },
};
function hallCam(k) {
  const a = 0.5 + k * 0.42;
  const r = 25;
  return { p: [ROOM_C.x + Math.sin(a) * r, 15 + Math.sin(k) * 2, ROOM_C.z + Math.cos(a) * r], l: [ROOM_C.x, 1, ROOM_C.z] };
}

let scene3d = null;

function makeTexture(draw, w, h, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function surface(origin, uDir, vDir, uLen, vLen, segU, segV, tex, uvScale, tone) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= segV; j++) {
    for (let i = 0; i <= segU; i++) {
      const u = i / segU, v = j / segV;
      const pv = origin.clone().addScaledVector(uDir, u * uLen).addScaledVector(vDir, v * vLen);
      const pr = toReal(pv);
      pos.push(pr.x, pr.y, pr.z);
      uv.push(u * uvScale[0], v * uvScale[1]);
    }
  }
  for (let j = 0; j < segV; j++) for (let i = 0; i < segU; i++) {
    const a = j * (segU + 1) + i, b = a + 1, c = a + segU + 1, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, color: new THREE.Color(tone, tone, tone) });
  return new THREE.Mesh(g, m);
}

function buildRoom() {
  const scene = new THREE.Scene();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const { x0, x1, y0, y1, z0, z1 } = ROOM;

  const checker = makeTexture((g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#000'; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2);
  }, 256, 256);
  const stripes = makeTexture((g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#000';
    const band = [10, 22, 36, 54, 36, 22];
    let y = 0;
    band.forEach((b) => { g.fillRect(0, y, w, b * 0.5); y += b * 0.5 + (70 - b) * 0.5; });
  }, 16, 256);
  const back = makeTexture((g, w, h) => {
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#000';
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 5, h);
    const win = (cx) => {
      const s = 150;
      for (let k = 0; k < 6; k++) {
        const q = s - k * 26;
        g.fillStyle = k % 2 ? '#fff' : '#000';
        g.fillRect(cx - q / 2, 150 - q / 2 - 10, q, q);
      }
    };
    win(w * 0.25); win(w * 0.75);
    g.fillStyle = '#000'; g.fillRect(0, h - 26, w, 26);
  }, 1024, 576, false);

  scene.add(surface(V(x0, y0, z0), V(0, 0, 1), V(1, 0, 0), z1 - z0, x1 - x0, 24, 24, checker, [(z1 - z0) / 2, (x1 - x0) / 2], 1));
  scene.add(surface(V(x0, y0, z0), V(1, 0, 0), V(0, 1, 0), x1 - x0, y1 - y0, 24, 12, back, [1, 1], 0.95));
  scene.add(surface(V(x0, y0, z0), V(0, 0, 1), V(0, 1, 0), z1 - z0, y1 - y0, 24, 12, stripes, [1, (y1 - y0) / 1.1], 0.85));
  scene.add(surface(V(x1, y0, z0), V(0, 0, 1), V(0, 1, 0), z1 - z0, y1 - y0, 24, 12, stripes, [1, (y1 - y0) / 1.1], 0.85));

  // две одинаковые фигуры
  const prof = [[0, 0], [0.22, 0], [0.22, 0.035], [0.15, 0.09], [0.12, 0.42], [0.17, 0.6], [0.165, 0.69], [0.07, 0.75], [0.055, 0.78], [0.1, 0.82], [0.115, 0.88], [0.095, 0.95], [0.045, 0.99], [0, 1]]
    .map(([r, y]) => new THREE.Vector2(r * FIG.h, y * FIG.h));
  const figGeo = new THREE.LatheGeometry(prof, 40);
  const figMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  [figL, figR].forEach((p) => { const m = new THREE.Mesh(figGeo, figMat); m.position.copy(p); scene.add(m); });
  return scene;
}

function buildLines(res) {
  const scene = new THREE.Scene();
  const { x0, x1, y0, y1, z0, z1 } = ROOM;
  const box = [
    [x0, y0, z0, x1, y0, z0], [x0, y1, z0, x1, y1, z0], [x0, y0, z0, x0, y1, z0], [x1, y0, z0, x1, y1, z0],
    [x0, y0, z0, x0, y0, z1], [x1, y0, z0, x1, y0, z1], [x0, y1, z0, x0, y1, z1], [x1, y1, z0, x1, y1, z1],
    [x0, y0, z1, x0, y1, z1], [x1, y0, z1, x1, y1, z1],
  ];
  const seg = (arr, mat) => {
    const g = new LineSegmentsGeometry();
    g.setPositions(arr);
    const l = new LineSegments2(g, mat);
    l.computeLineDistances();
    scene.add(l);
    return l;
  };
  const real = [], ghost = [];
  box.forEach(([a, b, c, d, e, f]) => {
    const p = toReal(new THREE.Vector3(a, b, c)), q = toReal(new THREE.Vector3(d, e, f));
    real.push(p.x, p.y, p.z, q.x, q.y, q.z);
    ghost.push(a, b, c, d, e, f);
  });
  const mReal = new LineMaterial({ color: 0x0d0d0d, linewidth: 3, resolution: res });
  const mGhost = new LineMaterial({ color: 0x0047ab, linewidth: 2, dashed: true, dashSize: 0.35, gapSize: 0.25, resolution: res });
  seg(real, mReal);
  seg(ghost, mGhost);
  // лучи из глазка к макушкам фигур
  const rays = [];
  [figL, figR].forEach((f) => {
    const top = f.clone(); top.y += FIG.h;
    rays.push(P.x, P.y, P.z, top.x, top.y, top.z, P.x, P.y, P.z, f.x, f.y, f.z);
  });
  const mRay = new LineMaterial({ color: 0x0d0d0d, linewidth: 1.5, dashed: true, dashSize: 0.2, gapSize: 0.2, resolution: res });
  seg(rays, mRay);
  // «линейка»: реальный рост фигур одинаков
  const rule = [];
  [figL, figR].forEach((f) => {
    const x = f.x + 0.95;
    rule.push(x, f.y, f.z, x, f.y + FIG.h, f.z);
    rule.push(x - 0.25, f.y, f.z, x + 0.25, f.y, f.z, x - 0.25, f.y + FIG.h, f.z, x + 0.25, f.y + FIG.h, f.z);
  });
  const mRule = new LineMaterial({ color: 0xff0000, linewidth: 4, resolution: res });
  seg(rule, mRule);
  // глазок: кольцо
  const ring = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2, b = ((i + 1) / 32) * Math.PI * 2;
    ring.push(P.x + Math.cos(a) * 0.35, P.y + Math.sin(a) * 0.35, P.z, P.x + Math.cos(b) * 0.35, P.y + Math.sin(b) * 0.35, P.z);
  }
  seg(ring, mRule);
  return { scene, mats: [mReal, mGhost, mRay, mRule] };
}

const POST_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FS = `
precision highp float;
uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D tLines;
uniform vec2 uMouse; uniform float uDpr, uTime, uSchema, uLensOn, uLensR, uBulge, uNear, uFar;
uniform vec3 uAccent, uInk, uPaper;
varying vec2 vUv;
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
float linDepth(float d){ float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
float band(float x, float w){ float f = fract(x); float aa = fwidth(x) * 0.9 + 1e-4; return 1.0 - smoothstep(w - aa, w + aa, f); }
void main(){
  vec2 px = gl_FragCoord.xy / uDpr;
  vec2 m = uMouse / uDpr;
  vec4 sc = texture2D(tScene, vUv);
  vec4 ln = texture2D(tLines, vUv);
  float dep = linDepth(texture2D(tDepth, vUv).x);
  bool fig = sc.a > 0.5 && sc.r > 0.7 && sc.g < 0.25 && sc.b < 0.25;

  // линза
  float ld = length(px - m);
  float lens = uLensOn * (1.0 - smoothstep(uLensR - 1.5, uLensR + 1.5, ld));
  float ring = uLensOn * (1.0 - smoothstep(1.2, 2.8, abs(ld - uLensR)));

  // фон: шахматная сетка, выгнутая к курсору, медленно «дышит»
  vec2 dm = px - m;
  float r2 = dot(dm, dm);
  vec2 q = m + dm * (1.0 - uBulge * 0.55 * exp(-r2 / (2.0 * 210.0 * 210.0)));
  float breathe = 1.0 + 0.045 * sin(uTime * 0.42);
  float cell = 38.0 * breathe;
  vec2 cq = q / cell + vec2(0.0, 0.08 * sin(q.x / 160.0 + uTime * 0.2));
  vec2 fq = fract(cq);
  float aa = fwidth(cq.x) * 1.2;
  float cx = smoothstep(0.5 - aa, 0.5 + aa, fq.x);
  float cy = smoothstep(0.5 - aa, 0.5 + aa, fq.y);
  float chk = cx * (1.0 - cy) + cy * (1.0 - cx);
  vec3 bgOp = mix(uPaper, uInk, chk);
  // тонкая сетка-чертёж для режима схемы
  vec2 gq = px / 24.0;
  vec2 gl = abs(fract(gq - 0.5) - 0.5) / fwidth(gq);
  float grid = 1.0 - min(min(gl.x, gl.y), 1.0);
  vec3 bgPlain = mix(uPaper, uInk, grid * 0.12);

  // сцена в оп-арт: полосы переменной толщины + муар от глубины
  float L = lum(sc.rgb);
  float phase = (px.y + 3.2 * sin(px.x * 0.013 + uTime * 0.23) + dep * 2.4) / 7.0;
  float w = clamp(1.0 - L, 0.07, 0.93);
  float ink = band(phase, w);
  float moire = band((px.x * 0.12 + px.y * 0.994) / 5.2 + dep * 0.6, 0.5);
  vec3 op = mix(uPaper, uInk, ink);
  op = mix(op, mix(op, uInk, moire), 0.10 * (1.0 - L));
  if (fig) op = mix(uAccent, uInk, band(phase, 0.28));
  vec3 plain = mix(uPaper, sc.rgb, 0.78);
  if (fig) plain = uAccent;

  vec3 sceneOp = sc.a > 0.5 ? op : bgOp;
  vec3 scenePlain = sc.a > 0.5 ? plain : bgPlain;
  float k = max(uSchema, lens);
  vec3 col = mix(sceneOp, scenePlain, k);
  vec3 lineCol = ln.r > 0.6 && ln.g < 0.3 ? uAccent : ln.rgb;
  col = mix(col, lineCol, ln.a * k);
  col = mix(col, uInk, ring);
  gl_FragColor = vec4(col, 1.0);
}`;

function initScene() {
  const canvas = $('#stage');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    document.body.classList.add('no-webgl');
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  const dpr = Math.min(devicePixelRatio || 1, innerWidth < 720 ? 1.5 : 1.25);
  renderer.setPixelRatio(dpr);

  const scene = buildRoom();
  const res = new THREE.Vector2(1, 1);
  const lines = buildLines(res);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  camera.position.copy(P);

  const mkRT = (depth) => {
    const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 0 });
    if (depth) { rt.depthTexture = new THREE.DepthTexture(1, 1); rt.depthTexture.type = THREE.UnsignedIntType; }
    return rt;
  };
  const rtA = mkRT(true), rtB = mkRT(false);

  const post = new THREE.ShaderMaterial({
    vertexShader: POST_VS, fragmentShader: POST_FS,
    uniforms: {
      tScene: { value: rtA.texture }, tDepth: { value: rtA.depthTexture }, tLines: { value: rtB.texture },
      uMouse: { value: new THREE.Vector2() }, uDpr: { value: dpr }, uTime: { value: 0 },
      uSchema: { value: 0 }, uLensOn: { value: 0 }, uLensR: { value: 96 }, uBulge: { value: 1 },
      uNear: { value: camera.near }, uFar: { value: camera.far },
      uAccent: { value: new THREE.Color(...ACCENT_RGB.cobalt) },
      uInk: { value: new THREE.Color(INK) }, uPaper: { value: new THREE.Color(PAPER) },
    },
    depthTest: false, depthWrite: false,
  });
  const postScene = new THREE.Scene();
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const labels = [
    { p: P.clone(), t: 'Глазок: только отсюда комната выглядит прямоугольной' },
    { p: toReal(new THREE.Vector3(ROOM.x0, ROOM.y1, ROOM.z0)), t: `Этот угол в ${fmt(sAt(ROOM.x0) / sAt(ROOM.x1), 1)} раза дальше от глазка, чем правый` },
    { p: figL.clone().add(new THREE.Vector3(0, FIG.h * 1.02, 0)), t: 'Та же фигура — просто дальше, поэтому «карлик»' },
    { p: figR.clone().add(new THREE.Vector3(0, FIG.h * 1.02, 0)), t: 'Ближе к глазку — поэтому «великан». Красные линейки: рост одинаковый' },
    { p: toReal(new THREE.Vector3(0.8, 0, -1.5)), t: 'Пол наклонён, клетки — трапеции, которые из глазка выглядят квадратами' },
    { p: new THREE.Vector3(ROOM.x1, ROOM.y1, ROOM.z1), t: 'Пунктир — прямоугольная комната, которую «достраивает» мозг' },
  ];
  const lblRoot = $('#labels');
  labels.forEach((l) => { l.el = document.createElement('div'); l.el.className = 'lbl'; l.el.textContent = l.t; lblRoot.append(l.el); });

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    const bw = Math.floor(w * dpr), bh = Math.floor(h * dpr);
    rtA.setSize(bw, bh); rtB.setSize(bw, bh);
    res.set(bw, bh);
    lines.mats.forEach((m) => m.resolution.set(bw, bh));
    camera.aspect = w / h;
    // на узком экране шире угол обзора; из глазка иллюзия от этого не ломается
    camera.fov = w / h < 0.8 ? 74 : w / h < 1.2 ? 60 : 44;
    camera.updateProjectionMatrix();
    post.uniforms.uLensR.value = w < 720 ? 74 : 96;
  }
  resize();
  addEventListener('resize', resize);

  return { renderer, scene, lines, camera, rtA, rtB, post, postScene, postCam, labels, dpr };
}

const camPos = new THREE.Vector3().copy(P), camLook = new THREE.Vector3(0, 2, -6);
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
let schemaK = 0, lensK = 0, accentCol = new THREE.Color(...ACCENT_RGB.cobalt);
let hallCounter = new Map();
halls.forEach((h, i) => hallCounter.set(h, i));

function camKey(i) {
  const el = layout[i].el;
  const key = el.dataset.cam;
  if (key === 'hall') return hallCam(hallCounter.get(el));
  const c = CAMS[key];
  if (wideView && (key === 'hero' || key === 'final' || key === 'systems')) return { p: c.p, l: [c.l[0] - 3.4, c.l[1], c.l[2]] };
  return c;
}
let wideView = innerWidth / innerHeight > 1.1 && innerWidth > 900;
addEventListener('resize', () => { wideView = innerWidth / innerHeight > 1.1 && innerWidth > 900; });

function cameraTarget(vc) {
  let i = 0;
  while (i < layout.length - 1 && layout[i + 1].top <= vc) i++;
  const a = camKey(i);
  const b = i < layout.length - 1 ? camKey(i + 1) : a;
  const span = i < layout.length - 1 ? layout[i + 1].top - layout[i].top : layout[i].h;
  const p = clamp((vc - layout[i].top) / span);
  const t = smooth(0.42, 1, p);
  tmpA.set(lerp(a.p[0], b.p[0], t), lerp(a.p[1], b.p[1], t), lerp(a.p[2], b.p[2], t));
  tmpB.set(lerp(a.l[0], b.l[0], t), lerp(a.l[1], b.l[1], t), lerp(a.l[2], b.l[2], t));
  return i;
}

let S = null;
let last = performance.now(), time = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!reduced) time += dt;
  const vc = scrollY + innerHeight * 0.5;
  if (S) {
    const idx = cameraTarget(vc);
    // режим схемы: у глазка отодвигаем камеру, чтобы показать настоящую геометрию
    const near = clamp(1 - tmpA.distanceTo(P) / 3);
    tmpA.x += schemaK * near * 5.5; tmpA.y += schemaK * near * 3.2; tmpA.z += schemaK * near * 2.5;
    // лёгкий параллакс от курсора — сдвигает с точки иллюзии
    if (!reduced && state.pointer.inside) {
      const px = state.pointer.x / innerWidth - 0.5, py = state.pointer.y / innerHeight - 0.5;
      tmpA.x += px * 0.9; tmpA.y -= py * 0.5;
    }
    const k = reduced ? 1 : 1 - Math.exp(-dt * 5);
    camPos.lerp(tmpA, k); camLook.lerp(tmpB, k);
    const cam = S.camera;
    cam.position.copy(camPos);
    cam.up.set(0, 1, 0);
    if (Math.abs(camPos.x - camLook.x) < 0.01 && Math.abs(camPos.z - camLook.z) < 0.01) cam.up.set(0, 0, -1);
    cam.lookAt(camLook);

    const wantSchema = state.mode === 'schema' ? 1 : 0;
    schemaK = reduced ? wantSchema : lerp(schemaK, wantSchema, 1 - Math.exp(-dt * 4));
    const touchLens = performance.now() < state.pointer.touchUntil;
    const wantLens = state.mode === 'illusion' && (state.pointer.inside || touchLens) ? 1 : 0;
    lensK = lerp(lensK, wantLens, reduced ? 1 : 1 - Math.exp(-dt * 8));
    accentCol.lerp(new THREE.Color(...ACCENT_RGB[state.accent]), reduced ? 1 : 1 - Math.exp(-dt * 3));

    const u = S.post.uniforms;
    u.uTime.value = time;
    u.uSchema.value = schemaK;
    u.uLensOn.value = lensK;
    u.uBulge.value = reduced ? 0 : 1;
    u.uMouse.value.set(state.pointer.x * S.dpr, (innerHeight - state.pointer.y) * S.dpr);
    u.uAccent.value.copy(accentCol);
    S.lines.mats[1].color.copy(state.accent === 'lemon' ? new THREE.Color(INK) : accentCol);

    const r = S.renderer;
    r.setRenderTarget(S.rtA); r.clear(); r.render(S.scene, cam);
    r.setRenderTarget(S.rtB); r.clear(); r.render(S.lines.scene, cam);
    r.setRenderTarget(null); r.render(S.postScene, S.postCam);

    // совпадение с глазком
    const match = clamp(1 - cam.position.distanceTo(P) / 4);
    $('#hud-match').textContent = Math.round(match * 100) + '%';

    // подписи режима «схема»
    const inChapters = layout[idx] && layout[idx].el.dataset.cam !== 'hall';
    S.labels.forEach((l) => {
      tmpA.copy(l.p).project(cam);
      const onScreen = tmpA.z < 1 && Math.abs(tmpA.x) < 0.92 && Math.abs(tmpA.y) < 0.9;
      const show = state.mode === 'schema' && inChapters && onScreen && !(l.p === S.labels[0].p && match > 0.9);
      l.el.classList.toggle('on', show);
      if (show) l.el.style.transform = `translate(${((tmpA.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - tmpA.y) / 2 * innerHeight).toFixed(1)}px) translate(-50%, calc(-100% - 14px))`;
    });
  }
  updateProgress(vc);
  updateWarp(time);
  requestAnimationFrame(frame);
}

addEventListener('pointermove', (e) => {
  state.pointer.x = e.clientX; state.pointer.y = e.clientY;
  if (e.pointerType === 'mouse') state.pointer.inside = true;
  else state.pointer.touchUntil = performance.now() + 1400;
}, { passive: true });
addEventListener('pointerdown', (e) => {
  state.pointer.x = e.clientX; state.pointer.y = e.clientY;
  if (e.pointerType !== 'mouse') state.pointer.touchUntil = performance.now() + 1400;
}, { passive: true });
document.documentElement.addEventListener('mouseleave', () => { state.pointer.inside = false; });

// ——————————————————— иллюзии ———————————————————

// Мюллер-Лайер
function initML() {
  const svg = $('.ml'), lenIn = $('#ml-len'), angIn = $('#ml-ang'), out = $('#ml-out');
  const L0 = 280, fl = 42;
  let revealed = false;
  const draw = () => {
    const a = lerp(90, 32, +angIn.value / 100) * Math.PI / 180;
    const Lb = +lenIn.value;
    const line = (x1, y, x2, dir) => { // dir: +1 — «хвосты» наружу, -1 — «стрелки»
      const dx = Math.cos(a) * fl * dir, dy = Math.sin(a) * fl;
      return `<path d="M${x1} ${y}H${x2}M${x2} ${y}l${dx.toFixed(1)} ${-dy.toFixed(1)}M${x2} ${y}l${dx.toFixed(1)} ${dy.toFixed(1)}M${x1} ${y}l${(-dx).toFixed(1)} ${-dy.toFixed(1)}M${x1} ${y}l${(-dx).toFixed(1)} ${dy.toFixed(1)}" stroke="${INK}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
    };
    const xt = 300 - L0 / 2, xb = 300 - Lb / 2;
    $('.ml__top', svg).innerHTML = line(xt, 70, xt + L0, 1);
    $('.ml__bot', svg).innerHTML = line(xb, 190, xb + Lb, -1);
    $('.ml__guides', svg).innerHTML =
      `<path d="M${xt} 30V230M${xt + L0} 30V230" stroke="${ACCENT_CSS[state.accent]}" stroke-width="3" stroke-dasharray="6 6"/>` +
      `<rect x="${xt}" y="112" width="${L0}" height="8" fill="${INK}"/><text x="300" y="104" text-anchor="middle" font-size="15" font-family="Onest,sans-serif">верхняя: ${L0}</text>` +
      `<rect x="${xb}" y="232" width="${Lb}" height="8" fill="${ACCENT_CSS[state.accent] === '#fff44f' ? INK : ACCENT_CSS[state.accent]}"/><text x="300" y="256" text-anchor="middle" font-size="15" font-family="Onest,sans-serif">нижняя: ${Lb}</text>`;
    svg.classList.toggle('ml--reveal', revealed);
  };
  [lenIn, angIn].forEach((i) => i.addEventListener('input', () => { revealed = false; out.textContent = ''; draw(); }));
  svg.addEventListener('click', () => { revealed = !revealed; draw(); });
  $('#ml-check').addEventListener('click', () => {
    revealed = true; draw();
    const Lb = +lenIn.value, diff = (Lb - L0) / L0 * 100;
    const ang = +angIn.value;
    let msg;
    if (Math.abs(diff) < 3) msg = `Почти точно: нижняя ${Lb} против ${L0}. Вы справились — возможно, помогло знание об иллюзии. Но и теперь, глядя на них, трудно отделаться от ощущения разной длины.`;
    else if (diff > 0) msg = `Нижняя линия длиннее верхней на ${fmt(diff, 0)}% (${Lb} против ${L0}), хотя казалась равной. Так и проявляется иллюзия: «стрелки» внутрь делают отрезок короче на вид, и вы его «дотянули».`;
    else msg = `Нижняя линия короче верхней на ${fmt(-diff, 0)}% (${Lb} против ${L0}). Если она казалась равной, иллюзия сработала: «хвосты» наружу удлиняют верхнюю.`;
    if (ang < 15) msg += ' При почти прямых концах иллюзия слабеет — попробуйте усилить угол.';
    out.textContent = msg;
  });
  draw();
  redrawers.push(draw);
}

// Шахматная доска Адельсона
function initAdelson() {
  const cv = $('.adelson'), g = cv.getContext('2d'), ctx = $('#ad-ctx'), br = $('#ad-bridge');
  const S = 62, O = { x: 300, y: 64 };
  const e1 = { x: S * 0.78, y: S * 0.43 }, e2 = { x: -S * 0.78, y: S * 0.43 };
  const pt = (i, j) => ({ x: O.x + i * e1.x + j * e2.x, y: O.y + i * e1.y + j * e2.y });
  const quad = (i, j) => { const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath(); };
  const A = [1, 2], B = [3, 3], LIGHT = 200, DARK = 120, SH = 0.4; // 200 × (1 − 0,4) = 120
  let bridge = false;
  const draw = () => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const v = (i + j) % 2 === 0 ? LIGHT : DARK;
      g.beginPath(); quad(i, j); g.fillStyle = `rgb(${v},${v},${v})`; g.fill();
    }
    // бортик доски
    g.beginPath(); const c0 = pt(0, 5), c1 = pt(5, 5), c2 = pt(5, 0);
    g.moveTo(c0.x, c0.y); g.lineTo(c1.x, c1.y); g.lineTo(c1.x, c1.y + 22); g.lineTo(c0.x, c0.y + 22); g.closePath(); g.fillStyle = '#5a5a5a'; g.fill();
    g.beginPath(); g.moveTo(c1.x, c1.y); g.lineTo(c2.x, c2.y); g.lineTo(c2.x, c2.y + 22); g.lineTo(c1.x, c1.y + 22); g.closePath(); g.fillStyle = '#8a8a8a'; g.fill();
    // тень: ядро с постоянной плотностью покрывает клетку B целиком
    g.save();
    g.setTransform(e1.x, e1.y, e2.x, e2.y, O.x, O.y);
    g.translate(3.5, 3.35); g.scale(0.95, 1.25);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, 1.75);
    grd.addColorStop(0, `rgba(0,0,0,${SH})`); grd.addColorStop(1 / 1.75, `rgba(0,0,0,${SH})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 1.75, 0, Math.PI * 2); g.fill();
    g.restore();
    // цилиндр
    const base = pt(3.7, 1.7), rx = 40, ry = 20, hgt = 150;
    const acc = ACCENT_CSS[state.accent];
    const lg = g.createLinearGradient(base.x - rx, 0, base.x + rx, 0);
    lg.addColorStop(0, '#0d0d0d'); lg.addColorStop(0.35, acc); lg.addColorStop(0.7, acc); lg.addColorStop(1, '#0d0d0d');
    g.fillStyle = lg;
    g.beginPath(); g.ellipse(base.x, base.y, rx, ry, 0, 0, Math.PI); g.lineTo(base.x - rx, base.y - hgt); g.lineTo(base.x + rx, base.y - hgt); g.closePath(); g.fill();
    g.beginPath(); g.ellipse(base.x, base.y - hgt, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = acc; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
    // мост между A и B
    const ca = pt(A[0] + 0.5, A[1] + 0.5), cb = pt(B[0] + 0.5, B[1] + 0.5);
    if (bridge) { g.strokeStyle = `rgb(${DARK},${DARK},${DARK})`; g.lineWidth = 18; g.beginPath(); g.moveTo(ca.x, ca.y); g.lineTo(cb.x, cb.y); g.stroke(); }
    // убираем контекст
    const t = +ctx.value / 100;
    if (t > 0) {
      g.save(); g.beginPath(); g.rect(0, 0, cv.width, cv.height); quad(...A); quad(...B);
      if (bridge) { const nx = -(cb.y - ca.y), ny = cb.x - ca.x, nl = Math.hypot(nx, ny), w = 9; g.moveTo(ca.x + nx / nl * w, ca.y + ny / nl * w); g.lineTo(ca.x - nx / nl * w, ca.y - ny / nl * w); g.lineTo(cb.x - nx / nl * w, cb.y - ny / nl * w); g.lineTo(cb.x + nx / nl * w, cb.y + ny / nl * w); g.closePath(); }
      g.fillStyle = `rgba(255,255,255,${t})`; g.fill('evenodd'); g.restore();
    }
    // подписи
    const tag = (p, s) => { g.beginPath(); g.arc(p.x, p.y, 15, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke(); g.fillStyle = INK; g.font = '700 16px Unbounded, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, p.x, p.y + 1); };
    tag(ca, 'A'); tag(cb, 'B');
    if (state.mode === 'schema') {
      g.font = '500 15px Onest, sans-serif'; g.textAlign = 'left'; g.fillStyle = INK;
      g.fillText(`A: RGB ${DARK}, ${DARK}, ${DARK}`, 16, 380); g.fillText(`B: RGB ${DARK}, ${DARK}, ${DARK}`, 16, 404);
      g.fillText('Мозг «вычитает» тень: B должна быть светлой клеткой.', 16, 428);
    }
  };
  ctx.addEventListener('input', draw);
  const toggle = () => { bridge = !bridge; br.setAttribute('aria-pressed', String(bridge)); draw(); };
  br.addEventListener('click', toggle);
  cv.addEventListener('click', toggle);
  document.fonts?.ready.then(draw);
  draw();
  redrawers.push(draw);
}

// «Платье»
function initDress() {
  const cv = $('.dress'), g = cv.getContext('2d'), inp = $('#dress-light');
  const C1 = '#8b92c6', C2 = '#6b5a36';
  $('#dress-s1').style.background = C1; $('#dress-s2').style.background = C2;
  $('#dress-h1').textContent = C1; $('#dress-h2').textContent = C2;
  const out = $('#dress-out');
  const note = document.createElement('p'); note.className = 'note'; out.after(note);
  let isolate = false;
  const mix = (a, b, t) => { const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16)), pb = b.match(/\w\w/g).map((h) => parseInt(h, 16)); return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], t))).join(',')})`; };
  const draw = () => {
    const t = +inp.value / 100, W = cv.width, H = cv.height;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, mix('9fb0d8', 'f2c56a', t)); bg.addColorStop(1, mix('3e4a6c', '7a5520', t));
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // подсказка источника света
    if (t < 0.5) { g.fillStyle = `rgba(235,244,255,${0.9 - t})`; g.fillRect(420, 30, 130, 180); g.strokeStyle = '#2b3550'; g.lineWidth = 4; g.strokeRect(420, 30, 130, 180); g.beginPath(); g.moveTo(485, 30); g.lineTo(485, 210); g.moveTo(420, 120); g.lineTo(550, 120); g.stroke(); }
    else { const rg = g.createRadialGradient(90, 60, 5, 90, 60, 200); rg.addColorStop(0, `rgba(255,236,170,${(t - 0.5) * 1.8})`); rg.addColorStop(1, 'rgba(255,236,170,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); g.beginPath(); g.arc(90, 60, 22, 0, Math.PI * 2); g.fillStyle = '#fff6d8'; g.fill(); }
    // силуэт платья с полосами неизменных цветов
    g.save();
    g.beginPath(); g.moveTo(250, 40); g.lineTo(350, 40); g.lineTo(362, 150); g.lineTo(420, 330); g.lineTo(180, 330); g.lineTo(238, 150); g.closePath(); g.clip();
    for (let y = 40, k = 0; y < 330; k++) { const hh = k % 2 ? 16 : 30; g.fillStyle = k % 2 ? C2 : C1; g.fillRect(170, y, 260, hh); y += hh; }
    g.restore();
    if (isolate || state.mode === 'schema') {
      g.fillStyle = '#fff'; g.fillRect(16, 250, 150, 94); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(16, 250, 150, 94);
      g.fillStyle = C1; g.fillRect(28, 262, 58, 70); g.fillStyle = C2; g.fillRect(96, 262, 58, 70);
      g.fillStyle = INK; g.font = '500 13px Onest, sans-serif'; g.fillText('на белом', 60, 246);
    }
    note.textContent = t < 0.4
      ? 'Сцена подсказывает синеватую тень и яркий свет сзади. Если мозг «вычитает» синеву, полосы легче увидеть бело-золотыми.'
      : t > 0.6
        ? 'Сцена подсказывает тёплую лампу. Если мозг «вычитает» желтизну, полосы легче увидеть сине-чёрными.'
        : 'Подсказка об освещении неоднозначна — как на исходной фотографии. У реконструкции эффект слабее, чем у оригинала, и срабатывает не у всех.';
  };
  inp.addEventListener('input', draw);
  cv.addEventListener('click', () => { isolate = !isolate; draw(); });
  draw();
  redrawers.push(draw);
}

// Слепота невнимания
function initGorilla() {
  const cv = $('.gorilla__cv'), g = cv.getContext('2d');
  const W = cv.width, H = cv.height, R = 14, DUR = 20;
  const ov = $('#gor-overlay'), form = $('#gor-form'), out = $('#gor-out');
  let balls = [], hits = 0, t0 = 0, running = false, highlight = false;
  const blot = [[0, 0, 26, 20], [18, -10, 16, 14], [-18, -10, 16, 14], [26, 12, 12, 10], [-26, 12, 12, 10], [0, 22, 10, 14]];
  const init = () => {
    const r = rng(Date.now() % 100000);
    balls = [];
    for (let i = 0; i < 8; i++) {
      const a = r() * Math.PI * 2, sp = 80 + r() * 40;
      balls.push({ x: 40 + r() * (W - 80), y: 40 + r() * (H - 80), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, white: i < 4 });
    }
    hits = 0;
  };
  const drawBlot = (x, y) => {
    g.fillStyle = highlight ? ACCENT_CSS[state.accent] : '#7a7a7a';
    blot.forEach(([dx, dy, rx, ry]) => { g.beginPath(); g.ellipse(x + dx, y + dy, rx, ry, 0, 0, Math.PI * 2); g.fill(); });
    if (highlight) { g.lineWidth = 3; g.strokeStyle = INK; g.beginPath(); g.arc(x, y + 4, 48, 0, Math.PI * 2); g.stroke(); }
  };
  const render = (t) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.lineWidth = 4; g.strokeStyle = INK; g.strokeRect(2, 2, W - 4, H - 4);
    // неожиданный объект: с 7-й по 13-ю секунду пересекает поле справа налево
    if (t > 7 && t < 13) drawBlot(W + 60 - (t - 7) / 6 * (W + 120), H / 2 + 10);
    balls.forEach((b) => {
      g.beginPath(); g.arc(b.x, b.y, R, 0, Math.PI * 2);
      g.fillStyle = b.white ? '#fff' : INK; g.fill();
      g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    });
    g.fillStyle = INK; g.font = '500 15px Onest, sans-serif';
    g.fillText(`${Math.max(0, Math.ceil(DUR - t))} с`, W - 50, 24);
  };
  const step = (now) => {
    if (!running) return;
    const t = (now - t0) / 1000;
    const dt = Math.min(0.05, (now - (step.last || now)) / 1000); step.last = now;
    balls.forEach((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt;
      let hit = false;
      if (b.x < R + 4) { b.x = R + 4; b.vx *= -1; hit = true; }
      if (b.x > W - R - 4) { b.x = W - R - 4; b.vx *= -1; hit = true; }
      if (b.y < R + 4) { b.y = R + 4; b.vy *= -1; hit = true; }
      if (b.y > H - R - 4) { b.y = H - R - 4; b.vy *= -1; hit = true; }
      if (hit && b.white && !highlight) hits++;
    });
    render(t);
    if (t >= DUR) { running = false; if (!highlight) { form.hidden = false; $('#gor-count').focus(); } else { ov.hidden = false; $('#gor-start').textContent = 'Пройти ещё раз'; } return; }
    requestAnimationFrame(step);
  };
  const start = (hl) => {
    highlight = hl; init(); ov.hidden = true; form.hidden = true; if (!hl) out.innerHTML = '';
    running = true; t0 = performance.now(); step.last = t0; requestAnimationFrame(step);
  };
  $('#gor-start').addEventListener('click', () => start(false));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = +$('#gor-count').value, saw = form.querySelector('[name="gor-saw"]:checked').value === 'yes';
    form.hidden = true;
    out.innerHTML = `<div class="verdict-box"><p>Касаний белых кругов было <b>${hits}</b>, вы насчитали <b>${n}</b>.</p>
      <p>${saw ? 'Вы заметили необычное — отлично.' : 'Вы ничего необычного не заметили.'} Между 7-й и 13-й секундой через всё поле медленно проползла серая <b>клякса</b>. В похожем опыте со сложной задачей подсчёта значительная часть людей не видит такой объект [12]. Если вы заметили — это нормально: слепота невнимания случается не всегда и не у всех.</p>
      <button type="button" class="btn" id="gor-replay">Показать ещё раз с подсветкой</button></div>`;
    $('#gor-replay').addEventListener('click', () => start(true));
  });
  init(); render(0);
}

// Ложные воспоминания (DRM)
function initDRM() {
  const words = ['кровать', 'отдых', 'бодрствовать', 'усталость', 'сновидение', 'проснуться', 'дрёма', 'одеяло', 'храпеть', 'подушка', 'покой', 'зевать'];
  const test = [['подушка', 1], ['сон', 0, true], ['храпеть', 1], ['стол', 0], ['зевать', 1], ['будильник', 0], ['окно', 0], ['одеяло', 1]];
  const scr = $('#drm-screen'), fs = $('#drm-test'), btn = $('#drm-check'), out = $('#drm-out');
  test.forEach(([w]) => { const l = document.createElement('label'); l.innerHTML = `<input type="checkbox" value="${w}"> ${w}`; fs.append(l); });
  $('#drm-start').addEventListener('click', () => {
    let i = 0;
    scr.textContent = '';
    scr.setAttribute('aria-live', 'polite');
    const tick = () => {
      if (i < words.length) { scr.textContent = words[i++]; setTimeout(tick, 1300); return; }
      scr.textContent = 'Список закончился';
      fs.hidden = false; btn.hidden = false; fs.querySelector('input').focus();
    };
    tick();
  });
  btn.addEventListener('click', () => {
    const picked = new Set($$('input:checked', fs).map((i) => i.value));
    const lure = picked.has('сон');
    const items = test.map(([w, was, isLure]) => `<li class="${isLure ? 'lure' : ''} ${!was && !isLure ? 'miss' : ''}">${w}${was ? ' — был' : isLure ? ' — не было!' : ' — не было'}${picked.has(w) ? ' ✓' : ''}</li>`).join('');
    out.innerHTML = `<div class="verdict-box"><ul class="drm-res">${items}</ul>
      <p>${lure ? 'Вы отметили слово <b>«сон»</b>. Его в списке не было.' : 'Слово <b>«сон»</b> вы не отметили — хорошо. Его в списке не было.'}
      Все слова списка связаны со сном, и мозг, запоминая смысл, «достраивает» главное слово. В опытах Редигера и Макдермотт такое критическое слово узнавали почти так же часто, как настоящие, и с высокой уверенностью [17].</p></div>`;
    btn.hidden = true;
  });
}

// Эмоции: одно состояние — разные теории
function initEmotion() {
  const out = $('#emo-out'), ar = $('#emo-arousal');
  const CTX = {
    exam: { label: 'перед экзаменом', sch: 'тревогу', app: 'Если оценка «я не готов, а ставки высоки» — это угроза и тревога. Если «я готов, это шанс» — вызов и азарт.', con: 'тревогу, азарт или раздражение' },
    date: { label: 'перед свиданием', sch: 'влюблённость или волнение', app: 'Если оценка «это важно для меня и может получиться» — радостное волнение. Если «меня отвергнут» — страх.', con: 'предвкушение, смущение или тревогу' },
    street: { label: 'на тёмной улице', sch: 'страх', app: 'Оценка «мне может грозить опасность, и я не контролирую ситуацию» ведёт к страху. Увидев знакомого, оценка — и эмоция — меняется за секунду.', con: 'страх — или облегчение, если шаги окажутся соседскими' },
  };
  const draw = () => {
    const c = CTX[$('[name="emo-ctx"]:checked').value];
    const a = +ar.value;
    const lvl = a < 30 ? 'слабое' : a < 70 ? 'заметное' : 'сильное';
    out.innerHTML = `
      <div class="theory"><h4>Джеймс — Ланге (1884)</h4><p>Сначала тело: сердце колотится, дыхание сбивается — и восприятие этих изменений <i>и есть</i> эмоция. Здесь — ${lvl} телесное возбуждение, значит и переживание ${lvl}. <span class="src">Слабое место: разные эмоции могут сопровождаться похожими телесными реакциями [27].</span></p></div>
      <div class="theory"><h4>Двухфакторная теория (Шехтер и Сингер, 1962)</h4><p>Эмоция = возбуждение + объяснение из ситуации. Возбуждение ${c.label} мозг, скорее всего, назовёт так: «${c.sch}». <span class="src">Классический опыт 1962 года воспроизводится плохо [28].</span></p></div>
      <div class="theory"><h4>Теории оценки (Лазарус, Шерер)</h4><p>Решает не тело, а оценка: важно ли это для меня, справлюсь ли я. ${c.app} <span class="src">Хорошо описывает разницу эмоций, спорно, насколько оценка сознательна [25, 26].</span></p></div>
      <div class="theory"><h4>Конструирование эмоций (Барретт)</h4><p>Мозг предсказывает состояние тела и категоризирует его с помощью понятий из опыта и культуры. Одно и то же ${lvl} возбуждение может стать чем угодно: ${c.con}. <span class="src">Влиятельная, но спорная теория; критики указывают на устойчивые сходства эмоций у разных культур [23, 24].</span></p></div>`;
  };
  $$('[name="emo-ctx"]').forEach((r) => r.addEventListener('change', draw));
  ar.addEventListener('input', draw);
  draw();
}

// Задача про биту и мяч
function initCRT() {
  $('#crt-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = parseFloat(String($('#crt-ans').value).replace(',', '.'));
    const out = $('#crt-out');
    let msg;
    if (Math.abs(v - 5) < 0.01) msg = '<p><b>Верно: 5 рублей.</b> Мяч 5, бита 105, вместе 110. Если в голове сначала мелькнуло «10» — это и была быстрая система, а проверила её медленная.</p>';
    else if (Math.abs(v - 10) < 0.01) msg = '<p><b>«10» — самый частый ответ, но неверный.</b> Проверим: если мяч 10, то бита 110, а вместе 120. Верно — 5 рублей: мяч 5, бита 105. Ответ «10» приходит сам собой; чтобы его отвергнуть, нужна проверка.</p>';
    else msg = `<p>Ответ ${fmt(v, 2).replace(/,00$/, '')} ₽ — неверно. Верно: <b>5 рублей</b> (мяч 5, бита 105, вместе 110). Интуитивная ловушка здесь — ответ «10».</p>`;
    out.innerHTML = `<div class="verdict-box">${msg}</div>`;
  });
}

// Задача Уосона 2–4–6
function initWason() {
  const form = $('#wason-form'), log = $('#wason-log'), guess = $('#wason-guess'), out = $('#wason-out');
  const tries = [];
  const fits = (a, b, c) => a < b && b < c;
  const typical = (a, b, c) => b - a === c - b && b > a; // «растут с одинаковым шагом»
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const [a, b, c] = $$('input', form).map((i) => parseFloat(i.value.replace(',', '.')));
    if ([a, b, c].some(Number.isNaN)) return;
    const ok = fits(a, b, c);
    tries.push({ a, b, c, ok });
    const li = document.createElement('li');
    li.className = ok ? 'yes' : 'no';
    li.textContent = `${fmt(a, a % 1 ? 1 : 0)}, ${fmt(b, b % 1 ? 1 : 0)}, ${fmt(c, c % 1 ? 1 : 0)} — ${ok ? 'подходит' : 'не подходит'}`;
    log.append(li);
    guess.hidden = false;
    $$('input', form).forEach((i) => { i.value = ''; });
    $('input', form).focus();
  });
  $('#wason-submit').addEventListener('click', () => {
    const r = guess.querySelector('[name="wason-r"]:checked');
    if (!r) { out.innerHTML = '<p>Выберите вариант правила.</p>'; return; }
    const neg = tries.filter((t) => !typical(t.a, t.b, t.c)).length;
    const right = r.value === 'asc';
    out.innerHTML = `<div class="verdict-box"><p>${right ? '<b>Верно!</b> Правило — любые три числа по возрастанию.' : '<b>Не угадали.</b> Правило — <b>любые три числа по возрастанию</b>. Подходит и 1, 2, 3, и 5, 70, 900.'}</p>
      <p>Вы проверили ${tries.length} ${plural(tries.length, 'тройку', 'тройки', 'троек')}; из них ${neg} ${plural(neg, 'нарушала', 'нарушали', 'нарушали')} гипотезу «шаг одинаковый». ${neg === 0 ? 'Все ваши проверки <i>подтверждали</i> гипотезу — поэтому ответ «да» ничего не мог опровергнуть.' : 'Хорошая стратегия — пробовать тройки, которые по вашей гипотезе <i>не</i> должны подходить.'}</p>
      <p>Это и есть предвзятость подтверждения: мы ищем примеры «за», а не «против». В исходном эксперименте Питера Уосона большинство участников сначала называли более узкое правило [34, 35].</p></div>`;
  });
}
function plural(n, one, few, many) { const m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return one; if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few; return many; }

// Якорение
function initAnchor() {
  const numEl = $('#anc-num'), form = $('#anc-form'), out = $('#anc-out'), spin = $('#anc-spin');
  let anchor = 0;
  spin.addEventListener('click', () => {
    anchor = Math.random() < 0.5 ? 10 : 65;
    spin.disabled = true;
    const done = () => { numEl.textContent = anchor; $('#anc-n2').textContent = anchor; form.hidden = false; };
    if (reduced) { done(); return; }
    let k = 0;
    const iv = setInterval(() => { numEl.textContent = Math.floor(Math.random() * 100); if (++k > 8) { clearInterval(iv); done(); } }, 110);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const est = +$('#anc-est').value;
    form.hidden = true;
    out.innerHTML = `<div class="verdict-box"><p>Правильный ответ: из 193 стран — членов ООН 54 находятся в Африке, это около <b>28%</b>. Ваша оценка — ${est}%, а якорь был ${anchor}.</p>
      <p>Колесо было «подкручено»: оно выдаёт только 10 или 65 — как в опыте Тверски и Канемана. Там люди, которым выпало 10, в среднем называли 25%, а которым выпало 65 — 45% [33]. Заведомо случайное число сдвигало ответ на 20 пунктов.</p>
      <p class="note">По одному ответу нельзя сказать, повлиял ли якорь именно на вас: эффект виден при сравнении групп.</p></div>`;
  });
}

// Даннинг — Крюгер: график из шума
function initDK() {
  const svg = $('.dk'), rel = $('#dk-rel'), rOut = $('#dk-r');
  let seed = 7;
  const gauss = (r) => { const u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const draw = () => {
    const rho = +rel.value / 100;
    rOut.textContent = fmt(rho, 2);
    const r = rng(seed), N = 1600;
    const ppl = [];
    for (let i = 0; i < N; i++) {
      const skill = gauss(r);
      const score = skill + gauss(r) * 0.9;
      const selfLatent = rho * skill + Math.sqrt(1 - rho * rho) * gauss(r);
      ppl.push({ score, selfLatent });
    }
    const rank = (key) => { const s = [...ppl].sort((a, b) => a[key] - b[key]); s.forEach((p, i) => { p[key + 'P'] = (i + 0.5) / N * 100; }); };
    rank('score'); rank('selfLatent');
    // самооценка: «выше среднего» — сдвиг вверх и сжатие к середине
    ppl.forEach((p) => { p.self = clamp(58 + (p.selfLatentP - 50) * 0.55, 0, 100); });
    const qs = [0, 1, 2, 3].map((q) => {
      const g = ppl.filter((p) => Math.min(3, Math.floor(p.scoreP / 25)) === q);
      return { real: g.reduce((s, p) => s + p.scoreP, 0) / g.length, self: g.reduce((s, p) => s + p.self, 0) / g.length };
    });
    const narrow = svg.clientWidth < 520, VW = narrow ? 380 : 600;
    svg.setAttribute('viewBox', `0 0 ${VW} 320`);
    const X = (i) => (narrow ? 80 : 110) + i * (narrow ? 84 : 140), Y = (v) => 280 - v * 2.4;
    let h = '';
    [0, 25, 50, 75, 100].forEach((v) => { h += `<line class="grid" x1="44" x2="${VW - 10}" y1="${Y(v)}" y2="${Y(v)}"/><text x="36" y="${Y(v) + 5}" text-anchor="end">${v}</text>`; });
    h += `<line class="axis" x1="44" x2="${VW - 10}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    ['1-я', '2-я', '3-я', '4-я'].forEach((s, i) => { h += `<text x="${X(i)}" y="304" text-anchor="middle">${s}${narrow ? '' : ' четверть'}</text>`; });
    if (narrow) h += `<text x="${VW - 10}" y="18" text-anchor="end">четверти по баллам →</text>`;
    h += `<text x="14" y="18">процентиль</text>`;
    const poly = qs.map((q, i) => `${X(i)},${Y(q.real)}`).concat(qs.slice().reverse().map((q, i) => `${X(3 - i)},${Y(q.self)}`)).join(' ');
    h += `<polygon class="gap" points="${poly}"/>`;
    h += `<polyline class="l-real" points="${qs.map((q, i) => `${X(i)},${Y(q.real)}`).join(' ')}"/>`;
    h += `<polyline class="l-self" points="${qs.map((q, i) => `${X(i)},${Y(q.self)}`).join(' ')}"/>`;
    qs.forEach((q, i) => {
      h += `<circle class="pt" cx="${X(i)}" cy="${Y(q.real)}" r="6" fill="${INK}"><title>Реальный: ${fmt(q.real, 0)}</title></circle>`;
      h += `<circle class="pt" cx="${X(i)}" cy="${Y(q.self)}" r="6" fill="#fff"><title>Самооценка: ${fmt(q.self, 0)}</title></circle>`;
    });
    h += `<text x="${X(3) - 10}" y="${Y(qs[3].real) + 24}" text-anchor="end">реальный</text>`;
    h += `<text x="${X(0) + 12}" y="${Y(qs[0].self) - 10}">самооценка</text>`;
    svg.innerHTML = h;
    svg.setAttribute('aria-label', `График: по четвертям реальный процентиль ${qs.map((q) => fmt(q.real, 0)).join(', ')}; самооценка ${qs.map((q) => fmt(q.self, 0)).join(', ')}`);
  };
  rel.addEventListener('input', draw);
  $('#dk-reroll').addEventListener('click', () => { seed = (seed * 16807) % 2147483647; draw(); });
  new ResizeObserver(() => draw()).observe(svg);
  draw();
}

// Ось стресса и кортизол
function initStress() {
  const hpa = $('.hpa');
  const nodes = [['Гипоталамус', 'КРГ'], ['Гипофиз', 'АКТГ'], ['Надпочечники', 'кортизол'], ['Органы и мозг', 'эффекты']];
  const drawHPA = () => {
    const narrow = hpa.clientWidth < 520;
    let h = `<defs><marker id="hpa-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="${INK}"/></marker></defs>`;
    if (narrow) {
      hpa.setAttribute('viewBox', '0 0 360 380');
      nodes.forEach(([n, s], i) => {
        const y = 10 + i * 88;
        h += `<g class="node"><rect x="20" y="${y}" width="210" height="58" rx="4"/><text x="125" y="${y + 25}" text-anchor="middle">${n}</text><text x="125" y="${y + 46}" text-anchor="middle" font-weight="400">↓ ${s}</text></g>`;
        if (i < 3) h += `<path class="arrow" d="M125 ${y + 60}V${y + 86}"/>`;
      });
      h += `<path class="fb" d="M232 215C300 200 300 60 232 40"/><path class="fb" d="M232 225C280 210 280 140 232 128"/>`;
      h += `<text class="fbt" x="296" y="130" text-anchor="middle" transform="rotate(90 296 130)">обратная связь</text>`;
      h += `<text class="fbt" x="180" y="372" text-anchor="middle">Быстрый путь (адреналин) не показан</text>`;
    } else {
      hpa.setAttribute('viewBox', '0 0 600 190');
      nodes.forEach(([n, s], i) => {
        const x = 10 + i * 148;
        h += `<g class="node"><rect x="${x}" y="70" width="130" height="58" rx="4"/><text x="${x + 65}" y="95" text-anchor="middle">${n}</text><text x="${x + 65}" y="116" text-anchor="middle" font-weight="400">↓ ${s}</text></g>`;
        if (i < 3) h += `<path class="arrow" d="M${x + 132} 99H${x + 146}"/>`;
      });
      h += `<path class="fb" d="M380 70C380 20 300 20 232 20C160 20 90 20 75 66"/><path class="fb" d="M370 70C350 38 260 38 232 66"/>`;
      h += `<text class="fbt" x="300" y="14" text-anchor="middle">отрицательная обратная связь</text>`;
      h += `<text class="fbt" x="300" y="170" text-anchor="middle">Быстрый путь (адреналин) на схеме не показан</text>`;
    }
    hpa.innerHTML = h;
  };
  drawHPA();
  new ResizeObserver(drawHPA).observe(hpa);

  const svg = $('.cort');
  let VW = 600;
  const X = (hr) => 60 + (hr - 6) / 24 * (VW - 80), Y = (v) => 220 - v * 170;
  const base = (hr) => { const t = hr - 7; if (t < 0) return 0.18; return 0.18 + 0.7 * Math.exp(-Math.pow((t - 0.6) / 0.5, 2)) * (t < 0.6 ? 1 : 0) + (t >= 0.6 ? 0.7 * Math.exp(-(t - 0.6) / 4.5) : 0) + 0.05; };
  const curves = {
    calm: base,
    acute: (hr) => base(hr) + 0.45 * Math.exp(-Math.pow((hr - 14.6) / 0.55, 2)),
    chronic: (hr) => 0.32 + (base(hr) - 0.23) * 0.45,
  };
  const draw = () => {
    const k = $('[name="cort"]:checked').value;
    const f = curves[k];
    VW = svg.clientWidth < 520 ? 380 : 600;
    svg.setAttribute('viewBox', `0 0 ${VW} 260`);
    const pts = [], bpts = [];
    for (let hr = 6; hr <= 30; hr += 0.1) { pts.push(`${X(hr).toFixed(1)},${Y(f(hr)).toFixed(1)}`); bpts.push(`${X(hr).toFixed(1)},${Y(base(hr)).toFixed(1)}`); }
    let s = `<line class="axis" x1="60" x2="${VW - 20}" y1="220" y2="220"/><line class="axis" x1="60" x2="60" y1="30" y2="220"/>`;
    (VW < 500 ? [6, 18, 30] : [6, 12, 18, 24, 30]).forEach((hr) => { s += `<text x="${X(hr)}" y="242" text-anchor="middle">${String(hr % 24).padStart(2, '0')}:00</text>`; });
    s += `<text x="12" y="22">кортизол (условно)</text>`;
    if (k !== 'calm') s += `<polyline class="base" points="${bpts.join(' ')}"/>`;
    s += `<polyline class="curve" points="${pts.join(' ')}"/>`;
    const note = { calm: ['8', 'пик после пробуждения'], acute: ['14.6', 'острый стресс: подъём и возврат'], chronic: ['12', 'суточный ритм сглажен'] }[k];
    const nx = X(+note[0]) + 10;
    s += `<text x="${Math.min(nx, VW - 10)}" y="${Y(f(+note[0])) - 12}" text-anchor="${nx > VW - 200 ? 'end' : 'start'}">${note[1]}</text>`;
    if (k !== 'calm') s += `<text x="${VW - 20}" y="${Y(base(22)) + 26}" text-anchor="end" fill="${INK}" opacity=".7">пунктир — обычный день</text>`;
    svg.innerHTML = s;
  };
  $$('[name="cort"]').forEach((r) => r.addEventListener('change', draw));
  new ResizeObserver(() => draw()).observe(svg);
  draw();
}

// ——————————————————— залы ———————————————————

function initBrain() {
  const svg = $('#brain-svg'), info = $('#brain-info'), fns = $('#brain-fns');
  let h = `<defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="8" fill="${INK}" opacity=".18"/></pattern></defs>`;
  h += '<path d="M72,232 C62,152 122,72 232,57 C332,42 442,62 506,120 C556,165 566,230 540,275 C520,310 480,318 450,312 C430,330 395,338 360,330 C330,350 280,352 250,335 C200,340 150,330 120,300 C96,284 76,262 72,232 Z" fill="url(#hatch)" stroke="none"/>';
  const regEl = (r) => {
    const cls = `reg ${r.kind === 'deep' ? 'deep' : ''} ${r.band ? 'band' : ''}`;
    const attrs = `class="${cls}" data-id="${r.id}" tabindex="0" role="button" aria-label="${r.n}"`;
    if (r.path) return `<path ${attrs} d="${r.path}"/>`;
    if (r.band) return `<path ${attrs} d="${r.band}"/>`;
    const [cx, cy, rx, ry] = r.ellipse;
    return `<ellipse ${attrs} cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
  };
  BRAIN_REGIONS.filter((r) => r.kind === 'cortex' && r.path).forEach((r) => { h += regEl(r); });
  BRAIN_REGIONS.filter((r) => r.kind === 'cortex' && r.ellipse).forEach((r) => { h += regEl(r); });
  BRAIN_REGIONS.filter((r) => r.kind === 'deep').forEach((r) => { h += regEl(r); });
  [[150, 150, 'лобная доля'], [420, 118, 'теменная'], [520, 214, 'затылочная'], [300, 318, 'височная'], [488, 356, 'мозжечок'], [60, 420, '← лоб']].forEach(([x, y, t]) => { h += `<text x="${x}" y="${y}" text-anchor="middle">${t}</text>`; });
  svg.innerHTML = h;
  // «лоб» / «затылок» поверх областей не мешают кликам — pointer-events: none в CSS

  BRAIN_FUNCS.forEach((f) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = f.n; b.dataset.fn = f.id; b.setAttribute('aria-pressed', 'false');
    fns.append(b);
  });
  const clear = () => { $$('.reg', svg).forEach((e) => e.classList.remove('on', 'sel')); $$('.chip', fns).forEach((c) => c.setAttribute('aria-pressed', 'false')); };
  const byId = Object.fromEntries(BRAIN_REGIONS.map((r) => [r.id, r]));
  fns.addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    clear();
    b.setAttribute('aria-pressed', 'true');
    const f = BRAIN_FUNCS.find((x) => x.id === b.dataset.fn);
    f.r.forEach((id) => $(`.reg[data-id="${id}"]`, svg)?.classList.add('on'));
    info.innerHTML = `<h4>${f.n}</h4><p>${f.d}</p><p class="note">Участвуют: ${f.r.map((id) => byId[id].n.toLowerCase()).join(', ')}.</p>`;
  });
  const pick = (el) => {
    clear();
    const r = byId[el.dataset.id];
    el.classList.add('on', 'sel');
    const inF = BRAIN_FUNCS.filter((f) => f.r.includes(r.id)).map((f) => f.n.toLowerCase());
    info.innerHTML = `<h4>${r.n}</h4><p>${r.d}</p>${inF.length ? `<p class="note">На схеме участвует в функциях: ${inF.join(', ')}.</p>` : ''}`;
  };
  svg.addEventListener('click', (e) => { const el = e.target.closest('.reg'); if (el) pick(el); });
  svg.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('reg')) { e.preventDefault(); pick(e.target); } });
}

function initCatalog() {
  const root = $('#bias-catalog'), count = $('#bias-count');
  root.innerHTML = BIASES.map((b, i) => `
    <article class="bcard" data-type="${b.t}" data-v="${b.v}">
      <div class="bcard__top"><div class="fact__blot" data-seed="${300 + i * 7}"></div><div><p class="bcard__type">${BIAS_TYPES[b.t]}</p><h3>${b.n}</h3></div></div>
      <p class="fact__v"></p>
      <p>${b.d}</p>
      <p class="ex">${b.e}</p>
      <p class="fact__src">Источники: ${b.s.map((n) => `<a href="#src-${n}">[${n}]</a>`).join(' ')}</p>
    </article>`).join('');
  decorate(root);
  const apply = (f) => {
    let n = 0;
    $$('.bcard', root).forEach((c) => { const on = f === 'all' || c.dataset.type === f; c.hidden = !on; if (on) { n++; c.classList.add('is-in'); } });
    count.textContent = `Показано карточек: ${n}`;
  };
  $$('.filter .chip').forEach((c) => c.addEventListener('click', () => {
    $$('.filter .chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
    apply(c.dataset.filter);
  }));
  apply('all');
  $$('.bcard', root).forEach((c) => c.classList.remove('is-in'));
}

async function initMap() {
  const { WORLD } = await import('./data/world.js');
  const cv = $('#map-cv'), g = cv.getContext('2d'), tip = $('#map-tip'), stage = $('.map__stage');
  const W = WORLD.w, H = WORLD.h;
  const ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const cells = new Int16Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const a = WORLD.grid[i * 2], b = WORLD.grid[i * 2 + 1];
    cells[i] = a === '.' ? -2 : a === '-' ? -1 : ALPH.indexOf(a) * 62 + ALPH.indexOf(b);
  }
  const C = WORLD.countries;
  let metric = 'a', hover = -1, cell = 4;
  const dom = { a: [2, 7], d: [2, 6.5] };
  const rad = (v) => Math.sqrt(clamp((v - dom[metric][0]) / (dom[metric][1] - dom[metric][0]), 0.04, 1));
  const name = { a: 'тревожные расстройства', d: 'депрессивные расстройства' };
  const worldEl = $('#map-world');
  const setWorld = () => {
    worldEl.innerHTML = `В среднем по миру (2017): <b><span data-count="${WORLD.world[metric]}" data-dec="1">${fmt(WORLD.world[metric], 1)}</span>%</b> — ${name[metric]}`;
    const c = $('[data-count]', worldEl); if (c) countUp(c);
  };
  const size = () => {
    const w = stage.clientWidth;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cell = w / W;
    cv.width = Math.round(w * dpr); cv.height = Math.round(cell * H * dpr);
    cv.style.height = (cell * H) + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  };
  const draw = () => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, W * cell, H * cell);
    const acc = ACCENT_CSS[state.accent];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = cells[y * W + x];
      if (v === -2) continue;
      const cx = (x + 0.5) * cell, cy = (y + 0.5) * cell;
      if (v === -1) { g.fillStyle = '#b8b5ad'; g.fillRect(cx - 0.6, cy - 0.6, 1.2, 1.2); continue; }
      const r = rad(C[v][metric]) * cell * 0.56;
      if (v === hover) {
        g.fillStyle = acc; g.fillRect(x * cell, y * cell, cell + 0.3, cell + 0.3);
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
      } else {
        g.beginPath(); g.arc(cx, cy, Math.max(r, 0.5), 0, Math.PI * 2); g.fillStyle = INK; g.fill();
      }
    }
  };
  const legend = () => {
    const vals = metric === 'a' ? [2.5, 3.5, 5, 6.5] : [2.5, 3.5, 4.5, 6];
    $('#map-legend').innerHTML = `<span>${name[metric]}, % населения:</span>` + vals.map((v) => {
      const d = Math.max(3, rad(v) * 16 * 1.12);
      return `<span><span class="dot" style="width:${d.toFixed(1)}px;height:${d.toFixed(1)}px"></span>${fmt(v, 1)}</span>`;
    }).join('') + '<span><span class="nd"></span>нет данных</span>';
  };
  const showTip = (idx, px, py) => {
    if (idx < 0) { tip.hidden = true; return; }
    const c = C[idx];
    const ch = (a, b) => { const d = a - b; return (d > 0 ? '+' : d < 0 ? '−' : '±') + fmt(Math.abs(d), 2); };
    tip.innerHTML = `<h4>${c.n}</h4><dl>
      <dt>Тревожные</dt><dd>${fmt(c.a, 1)}%</dd>
      <dt>Депрессивные</dt><dd>${fmt(c.d, 1)}%</dd>
      ${c.f != null ? `<dt>депрессия: женщины</dt><dd>${fmt(c.f, 1)}%</dd><dt>депрессия: мужчины</dt><dd>${fmt(c.m, 1)}%</dd>` : ''}
      ${c.a90 != null ? `<dt>с 1990 г., тревога</dt><dd>${ch(c.a, c.a90)} п.п.</dd><dt>с 1990 г., депрессия</dt><dd>${ch(c.d, c.d90)} п.п.</dd>` : ''}
    </dl><p class="note" style="margin:6px 0 0">Оценка GBD 2017. Диагностика в странах различается.</p>`;
    tip.hidden = false;
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = px + 16, y = py + 16;
    if (x + tw > sw) x = px - tw - 16;
    if (x < 0) x = 4;
    if (y + th > sh) y = Math.max(4, py - th - 16);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  };
  const at = (e) => {
    const r = cv.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const x = Math.floor(px / cell), y = Math.floor(py / cell);
    let v = x >= 0 && x < W && y >= 0 && y < H ? cells[y * W + x] : -2;
    if (v < 0) { // ближайшая страна в радиусе клетки — для маленьких стран и касаний
      outer: for (let d = 1; d <= 2; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < W && yy >= 0 && yy < H && cells[yy * W + xx] >= 0) { v = cells[yy * W + xx]; break outer; }
      }
    }
    return { v: v >= 0 ? v : -1, px, py };
  };
  cv.addEventListener('pointermove', (e) => { const { v, px, py } = at(e); if (v !== hover) { hover = v; draw(); } showTip(v, px, py); });
  cv.addEventListener('pointerdown', (e) => { const { v, px, py } = at(e); hover = v; draw(); showTip(v, px, py); });
  cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { hover = -1; draw(); tip.hidden = true; } });
  $$('.seg__btn').forEach((b) => b.addEventListener('click', () => {
    metric = b.dataset.metric;
    $$('.seg__btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    legend(); setWorld(); draw(); tip.hidden = true;
  }));
  const tb = $('#map-table tbody');
  tb.innerHTML = [...C].sort((a, b) => a.n.localeCompare(b.n, 'ru')).map((c) => `<tr><td>${c.n}</td><td>${fmt(c.a, 1)}</td><td>${fmt(c.d, 1)}</td></tr>`).join('');
  legend(); setWorld(); size();
  new ResizeObserver(size).observe(stage);
  redrawers.push(draw);
}

// ——————————————————— запуск ———————————————————

decorate();
observeReveals();
initML(); initAdelson(); initDress(); initGorilla(); initDRM(); initEmotion(); initCRT(); initWason(); initAnchor(); initDK(); initStress();
initBrain(); initCatalog();

const mapIO = new IntersectionObserver((es) => {
  if (es.some((e) => e.isIntersecting)) { mapIO.disconnect(); initMap().catch((err) => { console.error(err); $('#map-world').textContent = 'Не удалось загрузить данные карты.'; }); }
}, { rootMargin: '600px' });
mapIO.observe($('#hall-map'));

measure();
addEventListener('resize', measure);
new ResizeObserver(measure).observe(document.body);
try { S = initScene(); } catch (e) { console.error(e); document.body.classList.add('no-webgl'); S = null; }
if (!S) { const h = $('.hud'); if (h) h.hidden = true; }
requestAnimationFrame(frame);
