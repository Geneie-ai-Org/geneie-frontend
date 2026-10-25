import React, { useEffect, useRef } from 'react';

const HEIGHT = 44;
const WAVELENGTH = 120; // px per full twist
const RUNG_GAP = 10;
const SECONDS_PER_TURN = 9;

/**
 * Decorative double helix that spins about its own long axis: each strand's depth follows
 * the twist, so the front strand is thicker and stronger and the back one thinner and
 * fainter, and the base-pair rungs lengthen and shorten as it turns. Canvas, drawn in the
 * text colour (so it follows the theme), faded outward from the centre like the old texture band, hidden from assistive tech.
 * Static with reduced motion; paused while off screen.
 */
export default function HelixDivider({ className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let raf = 0;
    let visible = true;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(HEIGHT * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t) => {
      ctx.clearRect(0, 0, width, HEIGHT);
      ctx.strokeStyle = getComputedStyle(canvas).color;
      ctx.lineCap = 'round';
      const k = (Math.PI * 2) / WAVELENGTH;
      const shift = (t / 1000 / SECONDS_PER_TURN) * Math.PI * 2; // + sign: crossings travel right to left
      const mid = HEIGHT / 2;
      const amp = HEIGHT * 0.36;
      const yOf = (x, offset) => mid + amp * Math.sin(k * x + shift + offset);
      const zOf = (x, offset) => Math.cos(k * x + shift + offset); // +1 nearest the viewer

      const strand = (offset, front) => {
        for (let x = 0; x < width; x += 3) {
          const z = zOf(x, offset);
          if (z >= 0 !== front) continue;
          ctx.globalAlpha = 0.35 + 0.65 * ((z + 1) / 2);
          ctx.lineWidth = 1.2 + 1.3 * ((z + 1) / 2);
          ctx.beginPath();
          ctx.moveTo(x, yOf(x, offset));
          ctx.lineTo(x + 3, yOf(x + 3, offset));
          ctx.stroke();
        }
      };

      strand(0, false);
      strand(Math.PI, false);
      ctx.lineWidth = 1;
      for (let x = RUNG_GAP / 2; x < width; x += RUNG_GAP) {
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        ctx.moveTo(x, yOf(x, 0));
        ctx.lineTo(x, yOf(x, Math.PI));
        ctx.stroke();
      }
      strand(0, true);
      strand(Math.PI, true);
      ctx.globalAlpha = 1;
    };

    const tick = (t) => {
      draw(t);
      raf = visible && !reduce.matches ? requestAnimationFrame(tick) : 0;
    };
    const start = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    resize();
    start();
    const ro = new ResizeObserver(() => {
      resize();
      start();
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    io.observe(canvas);
    reduce.addEventListener('change', start);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      reduce.removeEventListener('change', start);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none block w-full text-[hsl(var(--brand-300))] opacity-70 dark:text-[hsl(var(--brand-500))] dark:opacity-50 ${className}`}
      style={{
        height: HEIGHT,
        WebkitMaskImage: 'radial-gradient(ellipse 55% 110% at 50% 50%, #000 0%, transparent 100%)',
        maskImage: 'radial-gradient(ellipse 55% 110% at 50% 50%, #000 0%, transparent 100%)',
      }}
    />
  );
}
