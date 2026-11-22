import React, { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { useTheme } from '@/hooks/useTheme';

/**
 * Full-bleed canvas: a Bayer-dithered field of square dots with a big twisting DNA helix behind the content.
 *
 * A light field is sampled once per cell, compared with an 8x8 ordered-dither matrix, and a square dot is drawn where
 * the light wins. Dots take one of three cool steps (blue) or three warm steps (orange). The helix is a ribbon with
 * glowing backbone edges and dense rows of small square bases between them. Bases facing the viewer are sharp and
 * bright, the ones behind are dim and soft, and warm clusters drift across the front-facing ones. A soft aurora and a
 * little dust sit underneath, and dots brighten under the pointer. The area behind the content is dimmed so text stays
 * readable. Layout comes from the canvas size, so it adapts to any screen. Decorative only (aria-hidden).
 */

const COOL = { light: ['#c9d4f0', '#8fa9e8', '#2f5fd0'], dark: ['#17314d', '#2f78b8', '#8fd3ff'] };
const WARM = { light: ['#f3c9a8', '#ee8a4c', '#d9481b'], dark: ['#6d3b22', '#e47c3c', '#ff5a3c'] };
const FRAME_MS = 33; // 30 fps

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const G = (d, w) => Math.exp(-(d * d) / (w * w));
const hash = (a, b) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const B8 = (() => {
  let M = [[0, 2], [3, 1]];
  let n = 2;
  while (n < 8) {
    const N = n * 2;
    const R = Array.from({ length: N }, () => Array(N).fill(0));
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const v = M[y][x] * 4;
        R[y][x] = v;
        R[y][x + n] = v + 2;
        R[y + n][x] = v + 3;
        R[y + n][x + n] = v + 1;
      }
    }
    M = R;
    n = N;
  }
  return Float32Array.from(M.flat().map((v) => (v + 0.5) / 64));
})();

let HOT = 0; // set by helixV: 1 when the winning dot should be warm

function layoutFor(W, H) {
  const m = Math.min(W, H);
  const land = W / H > 1.15;
  const cell = Math.max(4, Math.min(6, Math.round(m / 150)));
  const wd = Math.max(cell * 1.7, m * 0.011);
  const A = Math.min(W * (land ? 0.24 : 0.4), H * (land ? 0.34 : 0.22), land ? 300 : 260);
  return {
    cell,
    helix: {
      ax: W * 0.56, ay: -H * 0.06, bx: W * 0.44, by: H * 1.06, A,
      turns: land ? 1.1 : 1.5, rowsPerTurn: 60, spin: 0.5, w: wd * 0.9, floor: 0.32,
      N: Math.max(7, Math.round((2 * A) / (cell * 2.6))),
    },
    mask: {
      x: W * 0.5, y: H * 0.48,
      rx: land ? Math.min(W * 0.3, 400) : W * 0.52,
      ry: land ? Math.min(H * 0.24, 160) : Math.min(H * 0.2, 150),
    },
  };
}

function helixV(px, py, t, h, cell) {
  HOT = 0;
  const dx = h.bx - h.ax;
  const dy = h.by - h.ay;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const rx = px - h.ax;
  const ry = py - h.ay;
  const along = rx * ux + ry * uy;
  const s = -rx * uy + ry * ux;
  if (along < -10 || along > len + 10 || Math.abs(s) > h.A + h.w * 4) return 0;
  const pitch = len / h.turns;
  const K = (Math.PI * 2) / pitch;
  const spin = t * h.spin;
  // Backbones: two glowing edges, the one facing the viewer thicker and brighter.
  const a = spin + along * K;
  const s1 = h.A * Math.sin(a);
  const d1 = 0.5 + 0.5 * Math.cos(a);
  const d2 = 1 - d1;
  let v = Math.max(G(s - s1, h.w * (0.7 + 0.7 * d1)) * (0.4 + 0.6 * d1), G(s + s1, h.w * (0.7 + 0.7 * d2)) * (0.4 + 0.6 * d2));
  // Rungs: dense rows of small square bases across the ribbon, at fixed spots along the axis.
  const gap = pitch / h.rowsPerTurn;
  const jf = along / gap;
  const j = Math.round(jf);
  const ay = Math.abs(jf - j) * gap;
  const thick = Math.max(cell * 0.8, gap * 0.2);
  if (ay < thick * 1.7) {
    const aj = j * gap * K + spin;
    const half = h.A * Math.sin(aj);
    const cj = Math.cos(aj);
    const aw = Math.abs(half);
    const N = h.N;
    let kk;
    let uk;
    if (aw < h.w * 0.6) {
      kk = Math.floor(N / 2);
      uk = 0;
    } else {
      const u = s / half;
      if (Math.abs(u) > 1.04) return v;
      kk = Math.min(N - 1, Math.max(0, Math.round(((u + 1) / 2) * N - 0.5)));
      uk = -1 + (2 * (kk + 0.5)) / N;
    }
    const ds = Math.abs(s - uk * half);
    const f = 0.5 + 0.5 * uk * cj; // how much this base faces the viewer, 0..1
    const blur = 1.2 * (1 - f); // depth of field: far bases are soft
    const pb = aw < h.w * 0.6 ? h.w : (2 * aw) / N;
    const bsz = Math.max(cell * 0.5, pb * 0.3);
    const lvl = (0.62 + 0.38 * hash(j, kk)) * (0.24 + 0.76 * f);
    let b = G(ds, bsz * (1 + blur)) * G(ay, thick * 0.9 * (1 + blur * 0.5)) * lvl * 1.3;
    // Warm clusters drift over the front-facing bases.
    const n = 0.5 + 0.5 * Math.sin(j * 0.33 + kk * 0.85 + t * 0.55) * Math.sin(j * 0.19 - kk * 0.42 - t * 0.33);
    const warm = f > 0.4 && n > 0.74;
    if (warm) b *= 1.35;
    if (b > v) {
      v = b;
      HOT = warm ? 1 : 0;
    }
  }
  return v;
}

function fieldAt(px, py, t, intro, ci, cj, L, W, H, ptr) {
  const q = Math.hypot((px - L.mask.x) / L.mask.rx, (py - L.mask.y) / L.mask.ry);
  const m = smooth(0.75, 1.5, q);
  // Soft aurora, then sparse dust. Both keep clear of the content.
  const u = px / W;
  const y = py / H;
  const band = Math.sin(u * 5 + t * 0.4 + Math.sin(y * 4 + t * 0.3) * 0.9);
  let v = (0.36 * Math.max(0, band) * G(y - 0.62, 0.28) + 0.04) * 0.85;
  const st = hash(ci, cj);
  if (st < 0.0022) v = Math.max(v, 0.34 + 0.3 * Math.sin(t * 1.4 + st * 900));
  if (ptr.k > 0.01) v += ptr.k * 0.5 * G(Math.hypot(px - ptr.x, py - ptr.y), Math.max(110, Math.min(W, H) * 0.16));
  v *= 0.05 + 0.95 * m;
  const hv = helixV(px, py, t, L.helix, L.cell) * (L.helix.floor + (1 - L.helix.floor) * m);
  if (hv > v) v = hv;
  else HOT = 0;
  return v * intro;
}

export default function DitherHelixField({ className = '' }) {
  const canvasRef = useRef(null);
  const reduce = useReducedMotion();
  const { isDark } = useTheme();

  useEffect(() => {
    const cvs = canvasRef.current;
    const ctx = cvs?.getContext('2d');
    if (!cvs || !ctx) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const mode = isDark ? 'dark' : 'light';
    const pal = [...COOL[mode], ...WARM[mode]];
    const ptr = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, k: 0, kt: 0 };
    const t0 = performance.now();
    let W = 0;
    let H = 0;
    let cols = 0;
    let rows = 0;
    let L = null;
    let cap = 0;
    let bx = [];
    let dirty = true;
    let raf = 0;
    let last = 0;

    const resize = () => {
      W = cvs.clientWidth;
      H = cvs.clientHeight;
      if (!W || !H) return;
      L = layoutFor(W, H);
      cols = Math.ceil(W / L.cell);
      rows = Math.ceil(H / L.cell);
      cvs.width = Math.round(W * dpr);
      cvs.height = Math.round(H * dpr);
      const need = cols * rows * 2;
      if (cap < need) {
        cap = need;
        bx = Array.from({ length: 6 }, () => new Int16Array(cap));
      }
      dirty = true;
    };

    const draw = (now) => {
      if (!L) return;
      const t = reduce ? 3 : (now - t0) / 1000;
      const intro = reduce ? 1 : smooth(0, 1.4, t);
      ptr.x += (ptr.tx - ptr.x) * 0.22;
      ptr.y += (ptr.ty - ptr.y) * 0.22;
      ptr.k += (ptr.kt - ptr.k) * 0.12;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const n = [0, 0, 0, 0, 0, 0];
      const cell = L.cell;
      for (let j = 0; j < rows; j += 1) {
        const py = (j + 0.5) * cell;
        const jb = (j & 7) * 8;
        for (let i = 0; i < cols; i += 1) {
          const v = fieldAt((i + 0.5) * cell, py, t, intro, i, j, L, W, H, ptr);
          if (v <= 0.03 || v <= B8[jb + (i & 7)]) continue;
          const b = (v < 0.4 ? 0 : v < 0.72 ? 1 : 2) + (HOT ? 3 : 0);
          const k = n[b];
          bx[b][k] = i;
          bx[b][k + 1] = j;
          n[b] = k + 2;
        }
      }
      for (let b = 0; b < 6; b += 1) {
        const sz = cell * (b % 3 === 2 ? 0.86 : 0.74);
        const o = (cell - sz) / 2;
        ctx.fillStyle = pal[b];
        ctx.beginPath();
        for (let k = 0; k < n[b]; k += 2) ctx.rect(bx[b][k] * cell + o, bx[b][k + 1] * cell + o, sz, sz);
        ctx.fill();
      }
    };

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      if (reduce && !dirty) return;
      last = now;
      dirty = false;
      draw(now);
    };

    const onMove = (e) => {
      const r = cvs.getBoundingClientRect();
      ptr.tx = e.clientX - r.left;
      ptr.ty = e.clientY - r.top;
      ptr.kt = 1;
      if (ptr.x < -1e3) {
        ptr.x = ptr.tx;
        ptr.y = ptr.ty;
      }
      dirty = true;
    };
    const onLeave = (e) => {
      if (!e.relatedTarget) {
        ptr.kt = 0;
        dirty = true;
      }
    };

    const ro = new ResizeObserver(resize);
    ro.observe(cvs);
    resize();
    window.addEventListener('pointermove', onMove);
    document.addEventListener('pointerout', onLeave);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onLeave);
    };
  }, [isDark, reduce]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`block h-full w-full ${className}`} />;
}
