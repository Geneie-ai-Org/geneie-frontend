import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import DitherHelixField from '@/components/DitherHelixField';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TITLE = "We'll be right back";
const BASES = 'ATGC';

/** The title resolves out of random A / T / G / C, left to right. The real text is always the accessible name. */
function useScramble(final, enabled) {
  const [text, setText] = useState(enabled ? final.replace(/[^ ]/g, (_, i) => BASES[(i * 7) % 4]) : final);
  useEffect(() => {
    if (!enabled) {
      setText(final);
      return undefined;
    }
    const start = performance.now() + 250;
    const per = 55;
    const dur = 420;
    let raf = 0;
    const tick = () => {
      const e = performance.now() - start;
      let out = '';
      let done = true;
      for (let i = 0; i < final.length; i += 1) {
        const ch = final[i];
        const at = i * per;
        if (ch === ' ' || e >= at + dur) out += ch;
        else {
          out += e < at ? BASES[(i * 7) % 4] : BASES[Math.floor(Math.random() * 4)];
          done = false;
        }
      }
      setText(out);
      if (!done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [final, enabled]);
  return text;
}

/**
 * Shown by BackendGate while the backend is unreachable. Deliberately vague: no reason, no countdown. The page checks
 * again on its own and the gate swaps the app back in as soon as the backend answers.
 */
export default function BackendDownScreen({ checking = false, onRetry }) {
  const reduce = useReducedMotion();
  const title = useScramble(TITLE, !reduce);
  return (
    <main
      aria-labelledby="backend-down-title"
      className="relative flex min-h-screen min-h-dvh w-full items-center justify-center overflow-hidden bg-background px-5 text-foreground"
    >
      <div className="absolute inset-0" aria-hidden="true">
        <DitherHelixField />
      </div>
      <div className="relative z-10 max-w-[460px] text-center">
        {/* A soft clearing behind the text so the dots never fight it. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-28 -inset-y-[70px] -z-10 opacity-80"
          style={{ background: 'radial-gradient(closest-side, hsl(var(--background)) 30%, transparent)' }}
        />
        <h1 id="backend-down-title" aria-label={TITLE} className="m-0 text-[clamp(25px,3.4vw,38px)] font-normal leading-[1.15] tracking-[-0.015em]">
          {title}
        </h1>
        <p className="mx-auto mt-2.5 max-w-[40ch] text-[15px] text-muted-foreground">Geneie will be back shortly.</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Button size="lg" className="h-10 rounded-full px-5 text-sm" onClick={onRetry} disabled={checking}>
            {checking ? 'Checking' : 'Try again'}
          </Button>
          <Link to="/" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-10 rounded-full px-5 text-sm')}>
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
