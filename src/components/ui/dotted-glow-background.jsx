/**
 * Dotted glow background — a canvas grid of dots that each pulse at their own pace, the
 * brightest ones glowing.
 *
 * Ported from Aceternity UI's DottedGlowBackground
 * (https://ui.aceternity.com/components/dotted-glow-background). Same drawing loop and props.
 * Changes: JSX; colors are given as CSS custom properties and resolved through a probe
 * element (the app's tokens can be `hsl(var(--primary))`, which a canvas can't parse);
 * under reduced motion it draws one still frame instead of animating.
 * Place it first inside a `position: relative` container and give the content after it
 * `position: relative` so it paints above the canvas.
 */
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/** Resolve any CSS color (including var(...) chains) to an rgb() string a canvas accepts. */
function resolveColor(el, cssColor) {
  const probe = document.createElement('span');
  probe.style.color = cssColor;
  probe.style.display = 'none';
  el.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value || cssColor;
}

export function DottedGlowBackground({
  className,
  style,
  gap = 12,
  radius = 2,
  color = 'rgba(0,0,0,0.7)',
  glowColor = 'rgba(0, 170, 255, 0.85)',
  opacity = 0.6,
  backgroundOpacity = 0,
  speedMin = 0.4,
  speedMax = 1.3,
  speedScale = 1,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const [resolved, setResolved] = useState({ color, glow: glowColor });

  // Re-resolve the colors when the theme class on <html> changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const compute = () =>
      setResolved({ color: resolveColor(container, color), glow: resolveColor(container, glowColor) });
    compute();
    const mo = new MutationObserver(compute);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => mo.disconnect();
  }, [color, glowColor]);

  useEffect(() => {
    const el = canvasRef.current;
    const container = containerRef.current;
    if (!el || !container) return undefined;
    const ctx = el.getContext('2d');
    if (!ctx) return undefined;

    let raf = 0;
    let stopped = false;
    let isVisible = true;
    const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), 2);

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      el.width = Math.max(1, Math.floor(width * dpr));
      el.height = Math.max(1, Math.floor(height * dpr));
      el.style.width = `${Math.floor(width)}px`;
      el.style.height = `${Math.floor(height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    let dots = [];
    const regenDots = () => {
      dots = [];
      const { width, height } = container.getBoundingClientRect();
      const cols = Math.ceil(width / gap) + 2;
      const rows = Math.ceil(height / gap) + 2;
      const min = Math.min(speedMin, speedMax);
      const max = Math.max(speedMin, speedMax);
      for (let i = -1; i < cols; i++) {
        for (let j = -1; j < rows; j++) {
          const x = i * gap + (j % 2 === 0 ? 0 : gap * 0.5); // offset every other row
          const y = j * gap;
          const phase = Math.random() * Math.PI * 2;
          const speed = min + Math.random() * Math.max(max - min, 0);
          dots.push({ x, y, phase, speed });
        }
      }
    };

    const ro = new ResizeObserver(() => {
      resize();
      regenDots();
    });
    ro.observe(container);
    resize();
    regenDots();

    const draw = (now) => {
      if (stopped) return;
      if (!isVisible) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const { width, height } = container.getBoundingClientRect();
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.globalAlpha = opacity;

      if (backgroundOpacity > 0) {
        const grad = ctx.createRadialGradient(
          width * 0.5, height * 0.4, Math.min(width, height) * 0.1,
          width * 0.5, height * 0.5, Math.max(width, height) * 0.7
        );
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, `rgba(0,0,0,${Math.min(Math.max(backgroundOpacity, 0), 1)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      ctx.save();
      ctx.fillStyle = resolved.color;
      const time = (now / 1000) * Math.max(speedScale, 0);
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        // Linear triangle wave 0..1..0 for an even glow / dim.
        const mod = (time * d.speed + d.phase) % 2;
        const lin = mod < 1 ? mod : 2 - mod;
        const a = 0.25 + 0.55 * lin;
        if (a > 0.6) {
          ctx.shadowColor = resolved.glow;
          ctx.shadowBlur = 6 * ((a - 0.6) / 0.4);
        } else {
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = a * opacity;
        ctx.beginPath();
        ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (!reduceMotion) raf = requestAnimationFrame(draw);
    };

    const io = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.1 }
    );
    io.observe(container);
    raf = requestAnimationFrame(draw);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, [gap, radius, resolved, opacity, backgroundOpacity, speedMin, speedMax, speedScale, reduceMotion]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={className}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...style }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}

export default DottedGlowBackground;
