import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AuthForm from '@/components/AuthForm';
import PixelBlast from '@/components/PixelBlast';
import ClickSpark from '@/components/ClickSpark';

const DNA_FRAMES = (() => {
  const frames = [];
  const rows = 24;
  const width = 30;

  const totalFrames = 60;
  const center = Math.floor(width / 2);
  const amplitude = 11;
  const pairs = [['A','T'],['G','C'],['T','A'],['C','G'],['A','T'],['G','C']];

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
        for (let x = left + 1; x < right; x++) {
          chars[x] = '─';
        }
      }

      if (gap <= 1) {
        chars[center] = '╳';
        if (gap === 1) { chars[left] = ' '; chars[right] = ' '; }
      } else {
        if (strand1Front) {
          chars[x2] = '(';
          chars[x1] = ')';
        } else {
          chars[x1] = '(';
          chars[x2] = ')';
        }
      }

      lines.push(chars.join(''));
    }
    frames.push(lines);
  }
  return frames;
})();

const DnaHelix = () => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % DNA_FRAMES.length);
    }, 150);
    return () => clearInterval(interval);
  }, []);

  return (
    <pre
      className="font-mono text-[11px] leading-[1.15] text-[#2F7F7A]/80 select-none"
      aria-hidden="true"
      style={{ transform: 'rotate(45deg) scale(0.6)', transformOrigin: 'center center' }}
    >
      {DNA_FRAMES[frame].join('\n')}
    </pre>
  );
};

const AuthPage = () => {

  return (
    <ClickSpark sparkColor="#2F7F7A" sparkSize={12} sparkRadius={20} sparkCount={8} duration={400}>
      <div className="min-h-dvh flex flex-col lg:flex-row bg-black font-sans selection:bg-[#2F7F7A]/30">

        {/* ==================== LEFT PANEL (Approx 40%) ==================== */}
        <div className="relative hidden w-full lg:flex lg:w-[40%] flex-col items-center justify-center overflow-hidden bg-[#050505] border-r border-zinc-900">

          {/* PixelBlast Background */}
          <div className="absolute inset-0 z-0">
            <PixelBlast
              variant="square"
              pixelSize={3}
              color="#2F7F7A"
              patternScale={2}
              patternDensity={1}
              enableRipples
              rippleSpeed={0.3}
              rippleThickness={0.1}
              rippleIntensityScale={1}
              speed={0.5}
              transparent
              edgeFade={0.5}
            />
          </div>

          {/* Foreground Text/Logo */}
          <div className="relative z-10 flex flex-col items-center text-center px-8">
            <div className="mb-8">
              <DnaHelix />
            </div>
            <h1 className="text-3xl xl:text-4xl font-medium tracking-tight text-white leading-tight">
              Build on Genomic Data <br />
              without slowing down.
            </h1>
          </div>
        </div>

        {/* ==================== RIGHT PANEL (Approx 60%) ==================== */}
        <div className="relative flex flex-1 flex-col bg-black">

          {/* PixelBlast background on mobile only */}
          <div className="absolute inset-0 z-0 lg:hidden pointer-events-none">
            <PixelBlast
              variant="square"
              pixelSize={3}
              color="#2F7F7A"
              patternScale={2}
              patternDensity={1}
              enableRipples
              rippleSpeed={0.3}
              rippleThickness={0.1}
              rippleIntensityScale={1}
              speed={0.5}
              transparent
              edgeFade={0.5}
            />
          </div>

          {/* Top Navigation */}
          <div className="absolute top-0 left-0 w-full p-6 lg:p-8 flex items-center justify-between z-20 lg:hidden">
            <Link
              to="/"
              className="text-sm font-medium text-zinc-400 hover:text-white transition-colors flex items-center gap-2 border border-zinc-700 rounded-md px-3 py-1.5"
            >
Home
            </Link>
          </div>

          {/* Main Form Container */}
          <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-20">
            <div className="w-full max-w-[400px]">
              <AuthForm />
            </div>
          </main>

        </div>

      </div>
    </ClickSpark>
  );
};

export default AuthPage;
