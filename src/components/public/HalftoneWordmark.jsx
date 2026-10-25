import React, { useEffect, useRef } from 'react';

const WARM = [232, 140, 50];
const SPRING_K = 600; // 1/s^2, rest pull
const SPRING_C = 14; // 1/s, damping (underdamped: dots overshoot a little)
const POINTER_RADIUS = 120;
const POINTER_FORCE = 26000;
const SHOCK_SPEED = 720; // px/s
const SHOCK_WIDTH = 70;
const SHOCK_FORCE = 110000;
const SHOCK_LIFE = 1.4; // s
const WARM_AT = 20; // px of displacement that reads fully warm

/**
 * Oversized wordmark made of halftone dots, cropped by the bottom edge of its box. The dots part
 * around the pointer on springs and warm in colour while displaced; a click sends a shock ring
 * through the letters. Canvas, base colour is the text colour (so it follows the theme), hidden
 * from assistive tech. Static with reduced motion; the loop idles once the dots settle and
 * pauses while off screen.
 */
export default function HalftoneWordmark({ text = 'Geneie', className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    probe.canvas.width = probe.canvas.height = 1;

    let width = 0;
    let height = 0;
    let n = 0;
    let pitch = 8;
    let rx; let ry; let rr; // rest position and radius
    let dx; let dy; let vx; let vy; let warm; // spring state
    let raf = 0;
    let visible = true;
    let last = 0;
    let pointer = null;
    let shocks = [];
    let base = [0, 0, 0];
    let alive = true;

    const readBase = () => {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = getComputedStyle(canvas).color;
      probe.fillRect(0, 0, 1, 1);
      const d = probe.getImageData(0, 0, 1, 1).data;
      base = [d[0], d[1], d[2]];
    };

    const build = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      if (!width) return;
      const face = (px) => `800 ${px}px "Geist Variable", Inter, sans-serif`;
      const sample = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      sample.font = face(100);
      const fs = Math.min(440, (100 * width * 0.97) / sample.measureText(text).width);
      height = Math.round(fs * 0.68);
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      sample.canvas.width = Math.ceil(width);
      sample.canvas.height = height;
      sample.font = face(fs);
      sample.textAlign = 'center';
      sample.textBaseline = 'alphabetic';
      sample.fillStyle = '#000';
      sample.fillText(text, width / 2, height + fs * 0.1); // baseline below the edge: bottom of the letters is cropped
      const { data } = sample.getImageData(0, 0, sample.canvas.width, height);

      pitch = Math.max(5, Math.round(fs / 38));
      const xs = []; const ys = []; const rs = [];
      for (let y = pitch / 2; y < height; y += pitch) {
        for (let x = pitch / 2; x < width; x += pitch) {
          let cov = 0;
          for (let j = -1; j <= 1; j++) {
            for (let i = -1; i <= 1; i++) {
              const px = Math.min(sample.canvas.width - 1, Math.max(0, Math.round(x + i * pitch * 0.3)));
              const py = Math.min(height - 1, Math.max(0, Math.round(y + j * pitch * 0.3)));
              cov += data[(py * sample.canvas.width + px) * 4 + 3] / 255;
            }
          }
          cov /= 9;
          if (cov < 0.15) continue;
          xs.push(x); ys.push(y); rs.push(pitch * 0.47 * Math.sqrt(cov));
        }
      }
      n = xs.length;
      rx = Float32Array.from(xs); ry = Float32Array.from(ys); rr = Float32Array.from(rs);
      dx = new Float32Array(n); dy = new Float32Array(n);
      vx = new Float32Array(n); vy = new Float32Array(n);
      warm = new Float32Array(n);
    };

    const draw = () => {
      readBase();
      ctx.clearRect(0, 0, width, height);
      const rest = `rgb(${base[0]},${base[1]},${base[2]})`;
      ctx.fillStyle = rest;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (warm[i] >= 0.03) continue;
        const x = rx[i] + dx[i]; const y = ry[i] + dy[i];
        ctx.moveTo(x + rr[i], y);
        ctx.arc(x, y, rr[i], 0, Math.PI * 2);
      }
      ctx.fill();
      for (let i = 0; i < n; i++) {
        const w = warm[i];
        if (w < 0.03) continue;
        const r = Math.round(base[0] + (WARM[0] - base[0]) * w);
        const g = Math.round(base[1] + (WARM[1] - base[1]) * w);
        const b = Math.round(base[2] + (WARM[2] - base[2]) * w);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(rx[i] + dx[i], ry[i] + dy[i], rr[i] * (1 + w * 0.25), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = (dt) => {
      let moving = false;
      for (const s of shocks) s.t += dt;
      shocks = shocks.filter((s) => s.t < SHOCK_LIFE);
      for (let i = 0; i < n; i++) {
        const x = rx[i] + dx[i]; const y = ry[i] + dy[i];
        let ax = -SPRING_K * dx[i] - SPRING_C * vx[i];
        let ay = -SPRING_K * dy[i] - SPRING_C * vy[i];
        if (pointer) {
          const px = rx[i] - pointer.x; const py = ry[i] - pointer.y;
          const d = Math.hypot(px, py);
          if (d < POINTER_RADIUS && d > 0.01) {
            const f = (1 - d / POINTER_RADIUS) ** 2 * POINTER_FORCE;
            ax += (px / d) * f; ay += (py / d) * f;
          }
        }
        for (const s of shocks) {
          const sx = rx[i] - s.x; const sy = ry[i] - s.y;
          const d = Math.hypot(sx, sy);
          const off = Math.abs(d - s.t * SHOCK_SPEED);
          if (off < SHOCK_WIDTH && d > 0.01) {
            const f = (1 - off / SHOCK_WIDTH) * (1 - s.t / SHOCK_LIFE) * SHOCK_FORCE;
            ax += (sx / d) * f; ay += (sy / d) * f;
          }
        }
        vx[i] += ax * dt; vy[i] += ay * dt;
        dx[i] += vx[i] * dt; dy[i] += vy[i] * dt;
        const target = Math.min(1, Math.hypot(dx[i], dy[i]) / WARM_AT);
        warm[i] = target > warm[i] ? target : Math.max(target, warm[i] - dt * 1.2);
        if (Math.abs(dx[i]) + Math.abs(dy[i]) > 0.05 || Math.abs(vx[i]) + Math.abs(vy[i]) > 0.5 || warm[i] > 0.01) moving = true;
      }
      return moving || pointer !== null || shocks.length > 0;
    };

    const tick = (t) => {
      const dt = Math.min(1 / 30, (t - last) / 1000 || 1 / 60);
      last = t;
      const active = step(dt);
      draw();
      raf = alive && visible && active && !reduce.matches ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => {
      if (reduce.matches || !visible || raf) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const local = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onMove = (e) => { pointer = local(e); wake(); };
    const onLeave = () => { pointer = null; wake(); };
    const onDown = (e) => {
      if (reduce.matches) return;
      shocks.push({ ...local(e), t: 0 });
      wake();
    };

    const rebuild = () => {
      if (!alive) return;
      build();
      if (n) draw();
    };

    let builtWidth = 0;
    const ro = new ResizeObserver(() => {
      if (canvas.clientWidth === builtWidth) return;
      builtWidth = canvas.clientWidth;
      rebuild();
    });
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) wake(); });
    const mo = new MutationObserver(() => { if (n) draw(); }); // theme flip while idle
    const onReduce = () => { if (reduce.matches) { dx.fill(0); dy.fill(0); vx.fill(0); vy.fill(0); warm.fill(0); shocks = []; pointer = null; } rebuild(); };

    document.fonts.load(`800 100px "Geist Variable"`).catch(() => {}).then(() => {
      builtWidth = canvas.clientWidth;
      rebuild();
      ro.observe(canvas);
    });
    io.observe(canvas);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    reduce.addEventListener('change', onReduce);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      reduce.removeEventListener('change', onReduce);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
    };
  }, [text]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`block w-full touch-pan-y select-none text-[hsl(var(--brand-300))] opacity-80 dark:text-[hsl(var(--brand-500))] dark:opacity-60 ${className}`}
    />
  );
}
