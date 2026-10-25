import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import AuthForm from '@/components/AuthForm';
import PixelBlast from '@/components/PixelBlast';
import { useTheme } from '@/hooks/useTheme';
import { useSeo } from '@/hooks/useSeo';

/** Frames of a rotating ASCII double helix: two strands that cross, with base pairs between them. */
const DNA_FRAMES = (() => {
  const frames = [];
  const rows = 24;
  const width = 30;
  const totalFrames = 60;
  const center = Math.floor(width / 2);
  const amplitude = 11;
  const pairs = [['A', 'T'], ['G', 'C'], ['T', 'A'], ['C', 'G'], ['A', 'T'], ['G', 'C']];

  for (let f = 0; f < totalFrames; f++) {
    const lines = [];
    for (let y = 0; y < rows; y++) {
      const phase = (y / rows) * Math.PI * 3 + (f / totalFrames) * Math.PI * 3;
      const sin = Math.sin(phase);
      const cos = Math.cos(phase);

      const x1 = center + Math.round(sin * amplitude);
      const x2 = center - Math.round(sin * amplitude);
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const strand1Front = cos > 0;
      const gap = right - left;
      const [b1, b2] = pairs[(y + f) % pairs.length];

      const chars = new Array(width).fill(' ');

      if (gap > 4) {
        for (let x = left + 1; x < right; x++) {
          const dl = x - left;
          const dr = right - x;
          if (dl === 2) chars[x] = b1;
          else if (dr === 2) chars[x] = b2;
          else chars[x] = '─';
        }
      } else if (gap > 2) {
        for (let x = left + 1; x < right; x++) chars[x] = '─';
      }

      if (gap <= 1) {
        chars[center] = '╳';
        if (gap === 1) {
          chars[left] = ' ';
          chars[right] = ' ';
        }
      } else if (strand1Front) {
        chars[x2] = '(';
        chars[x1] = ')';
      } else {
        chars[x1] = '(';
        chars[x2] = ')';
      }

      lines.push(chars.join(''));
    }
    frames.push(lines);
  }
  return frames;
})();

const DnaHelix = ({ animate }) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!animate) return undefined;
    const interval = setInterval(() => setFrame((prev) => (prev + 1) % DNA_FRAMES.length), 150);
    return () => clearInterval(interval);
  }, [animate]);

  return (
    <pre
      className="select-none font-mono text-[10px] leading-[1.15] text-[hsl(var(--brand-500))]"
      aria-hidden="true"
      style={{ opacity: 0.85, transform: 'rotate(45deg) scale(0.6)', transformOrigin: 'center center' }}
    >
      {DNA_FRAMES[frame].join('\n')}
    </pre>
  );
};

/** PixelBlast takes a hex colour, so resolve the active theme's `--brand-500` channels into one. */
function useBrandHex() {
  const { theme } = useTheme();
  const [hex, setHex] = useState('#4a8d88');
  useEffect(() => {
    const channels = getComputedStyle(document.documentElement).getPropertyValue('--brand-500').trim();
    const m = channels.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
    if (!m) return;
    const h = Number(m[1]);
    const s = Number(m[2]) / 100;
    const l = Number(m[3]) / 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(c * 255).toString(16).padStart(2, '0');
    };
    setHex(`#${f(0)}${f(8)}${f(4)}`);
  }, [theme]);
  return hex;
}

const AuthPage = () => {
  useSeo({
    title: 'Sign in — Geneie',
    description: 'Sign in to Geneie to upload variant files and analyze your genomic data.',
    path: '/auth',
    noindex: true,
  });
  const reduce = useReducedMotion();
  const brand = useBrandHex();

  const blast = (
    <PixelBlast
      variant="square"
      pixelSize={3}
      color={brand}
      patternScale={2}
      patternDensity={1}
      enableRipples={!reduce}
      rippleSpeed={0.3}
      rippleThickness={0.1}
      rippleIntensityScale={1}
      speed={reduce ? 0 : 0.5}
      transparent
      edgeFade={0.5}
    />
  );

  return (
    <div className="auth-np wb-scope flex min-h-dvh flex-col bg-background font-sans text-foreground lg:flex-row">
      {/* Left panel, 40%: shader, helix and one line. Desktop only. */}
      <div className="relative hidden w-full flex-col items-center justify-center overflow-hidden border-r border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-bg))] lg:flex lg:w-[40%]">
        <div className="absolute inset-0 z-0 opacity-70 dark:opacity-100">{blast}</div>
        <div className="relative z-10 flex flex-col items-center px-8 text-center">
          <div className="mb-8">
            <DnaHelix animate={!reduce} />
          </div>
          <h1 className="text-3xl font-medium leading-tight tracking-tight xl:text-4xl">
            Build on Genomic Data <br />
            without slowing down.
          </h1>
        </div>
      </div>

      {/* Right panel, 60%: the form. The shader sits behind it on small screens. */}
      <div className="relative flex flex-1 flex-col bg-background">
        <div className="pointer-events-none absolute inset-0 z-0 opacity-30 dark:opacity-35 lg:hidden">{blast}</div>

        <div className="absolute left-0 top-0 z-20 flex w-full items-center justify-between p-6 lg:justify-end lg:p-8">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[hsl(var(--wb-line-strong))] px-3 py-1.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500))] sm:min-h-0 lg:border-transparent"
          >
            Home
          </Link>
        </div>

        <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-20 sm:px-6 lg:px-8">
          <div className="w-full max-w-[400px]">
            <AuthForm />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AuthPage;
