import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { Check, Copy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Small interaction pieces shared by the workbench tabs. Everything respects reduced motion
 * (it renders the final state) and only animates opacity, transform and stroke offsets.
 */

/** A number that rolls to its new value (variants in scope after a filter, etc.). */
export function CountUp({ value, startAt, duration = 0.7, className }) {
  const reduce = useReducedMotion();
  const start = Number.isFinite(Number(startAt)) ? Number(startAt) : value;
  const [shown, setShown] = useState(Number.isFinite(Number(start)) ? Number(start) : 0);
  const from = useRef(shown);
  useEffect(() => {
    const to = Number(value);
    if (!Number.isFinite(to)) return undefined;
    if (reduce || from.current === to) { from.current = to; setShown(to); return undefined; }
    const controls = animate(from.current, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(Math.round(v)),
      onComplete: () => { from.current = to; setShown(to); },
    });
    return () => { from.current = shown; controls.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce, duration]);
  return <span className={className}>{shown.toLocaleString()}</span>;
}

/**
 * Status glyph for a pipeline stage: dashed ring (pending), spinning arc (running),
 * ring + drawn check (done), ring + drawn cross (failed). The key replays the draw on a change.
 */
export function StageMark({ state = 'pending', size = 22, className }) {
  const tone = {
    pending: 'text-muted-foreground',
    running: 'text-[var(--info)]',
    done: 'text-[hsl(var(--brand-500))]',
    failed: 'text-[var(--error)]',
  }[state] || 'text-muted-foreground';
  return (
    <svg key={state} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`${tone} ${className || ''}`}>
      {state === 'pending' ? <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.5 3.5" opacity="0.7" /> : null}
      {state === 'running' ? (
        <g className="wb-spin">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" opacity="0.2" />
          <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </g>
      ) : null}
      {state === 'done' ? (
        <>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" className="wb-draw wb-draw-ring" />
          <path d="M7.8 12.4l3 3 5.4-6.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="wb-draw wb-draw-check" />
        </>
      ) : null}
      {state === 'failed' ? (
        <>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" className="wb-draw wb-draw-ring" />
          <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="wb-draw wb-draw-check" />
        </>
      ) : null}
    </svg>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Shared interaction primitives (the "motion lab" set). Presentation only; every one respects
 * reduced motion and uses opacity/transform/height only.
 * ---------------------------------------------------------------------------------------------- */

export const SPRING = { type: 'spring', stiffness: 520, damping: 38 };
const EASE = [0.22, 1, 0.36, 1];

/** Smoothly opens/closes a block of content (accordions, event logs, expandable cards). */
export function Collapse({ open, children, className, id }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="c"
          id={id}
          initial={reduce ? false : { height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.24, ease: EASE }}
          style={{ overflow: 'hidden' }}
          className={className}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Rotating chevron wrapper: pass `open`; the icon turns 90deg (right-pointing) or 180deg (down-pointing). */
export function Turn({ open, deg = 90, children, className }) {
  const reduce = useReducedMotion();
  return (
    <motion.span className={cn('inline-flex', className)} animate={{ rotate: open ? deg : 0 }} transition={{ duration: reduce ? 0 : 0.2, ease: EASE }}>
      {children}
    </motion.span>
  );
}

/** Wrap a list of removable chips: they spring in and shrink out, and the row re-flows. */
export function ChipList({ children, className }) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {React.Children.map(children, (c) => c)}
    </AnimatePresence>
  );
}
export function PopIn({ children, className, ...rest }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      layout={reduce ? false : 'position'}
      initial={reduce ? false : { opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
      transition={SPRING}
      className={className}
      {...rest}
    >
      {children}
    </motion.span>
  );
}

/**
 * A sliding selection marker for lists: render inside the selected row (the row is `relative`).
 * Rows in the same list share `group` so the marker glides from the old row to the new one.
 */
export function SelectionMarker({ group = 'sel', bar = true, tint = true }) {
  const reduce = useReducedMotion();
  const t = reduce ? { duration: 0 } : SPRING;
  return (
    <>
      {tint ? <motion.span aria-hidden="true" layoutId={`${group}-bg`} transition={t} className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[hsl(var(--wb-row-sel,var(--brand-100)))]" /> : null}
      {bar ? <motion.span aria-hidden="true" layoutId={`${group}-bar`} transition={t} className="pointer-events-none absolute inset-y-1.5 left-0 z-[1] w-[3px] rounded-full bg-[hsl(var(--brand-500))]" /> : null}
    </>
  );
}

/**
 * A button that morphs through idle -> running -> done (-> error). The icon and label swap with a
 * small slide; done draws a check. The parent owns `state`. Wraps the shared pill Button.
 * labels: { idle, running, done, error }; icons: { idle } (a lucide component) optional.
 */
export function StateButton({ state = 'idle', labels, icon: Icon, onClick, disabled, className, variant = 'default', size, ...rest }) {
  const reduce = useReducedMotion();
  const label = labels[state] ?? labels.idle;
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled || state === 'running'}
      aria-live="polite"
      className={cn('gap-2 overflow-hidden', className)}
      {...rest}
    >
      <span className="relative inline-flex size-4 items-center justify-center" aria-hidden="true">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={state}
            className="inline-flex"
            initial={reduce ? false : { opacity: 0, y: 8, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.8 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
          >
            {state === 'running' ? <span className="wb-spin-inline" /> : state === 'done' ? <Check className="size-4 wb-draw-lucide" strokeWidth={2.2} /> : state === 'error' ? <X className="size-4" /> : Icon ? <Icon className="size-4" /> : null}
          </motion.span>
        </AnimatePresence>
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={label}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: reduce ? 0 : 0.16 }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}

/** Copy button: the label slides to "Copied" with a check for ~1.6s. `getText` may be sync or async. */
export function CopyButton({ getText, label = 'Copy', copiedLabel = 'Copied', onCopied, variant = 'outline', size, className, disabled, ...rest }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  const reduce = useReducedMotion();
  const run = async () => {
    try {
      const text = await getText();
      if (text == null) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied?.();
    } catch {
      toast.error('Could not copy');
    }
  };
  return (
    <Button type="button" variant={variant} size={size} onClick={run} disabled={disabled} className={cn('overflow-hidden', className)} {...rest}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={copied ? 'y' : 'n'}
          className="inline-flex items-center gap-1.5"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: reduce ? 0 : 0.16 }}
        >
          {copied ? <Check className="size-3.5 wb-draw-lucide" strokeWidth={2.2} aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          {copied ? copiedLabel : label}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}

/**
 * Hold-to-confirm: press and hold, a fill rises; release early and it snaps back. Keyboard: hold
 * Space or Enter. `onConfirm` fires once at the end. Tone `danger` fills with the error colour.
 */
export function HoldButton({ children, doneLabel = 'Done', holdMs = 1200, onConfirm, tone = 'danger', disabled, className, icon: Icon }) {
  const reduce = useReducedMotion();
  const progress = useMotionValue(0);
  const [done, setDone] = useState(false);
  const [holding, setHolding] = useState(false);
  const anim = useRef(null);
  const [pct, setPct] = useState(0);
  useEffect(() => progress.on('change', (v) => setPct(v)), [progress]);

  const start = () => {
    if (disabled || done) return;
    setHolding(true);
    anim.current?.stop();
    anim.current = animate(progress, 1, {
      duration: reduce ? 0.01 : holdMs / 1000,
      ease: 'linear',
      onComplete: () => {
        setDone(true);
        setHolding(false);
        onConfirm?.();
        setTimeout(() => { setDone(false); progress.set(0); }, 1400);
      },
    });
  };
  const cancel = () => {
    if (done) return;
    setHolding(false);
    anim.current?.stop();
    animate(progress, 0, { duration: 0.2, ease: EASE });
  };
  const fill = tone === 'danger' ? 'var(--error)' : 'hsl(var(--brand-solid))';
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } }}
      onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') cancel(); }}
      onBlur={cancel}
      aria-label={typeof children === 'string' ? `${children}. Press and hold to confirm.` : undefined}
      className={cn(
        'relative inline-flex h-8 select-none items-center justify-center gap-1.5 overflow-hidden rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] px-3.5 text-[13px] font-medium text-foreground outline-none transition-transform duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
        holding && 'scale-[0.98]',
        className
      )}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-full origin-left" style={{ background: fill, opacity: 0.16, transform: `scaleX(${pct})` }} />
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] origin-left" style={{ background: fill, transform: `scaleX(${pct})` }} />
      <span className="relative inline-flex items-center gap-1.5" style={{ color: done ? fill : undefined }}>
        {done ? <Check className="size-3.5 wb-draw-lucide" strokeWidth={2.2} aria-hidden="true" /> : Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
        {done ? doneLabel : children}
      </span>
    </button>
  );
}

/**
 * Undo toast with a burning fuse. `undoToast('Filter removed', () => restore())` shows it for
 * ~5s; hovering pauses the fuse; Undo calls the callback once. Uses sonner's custom toasts.
 */
function FuseToast({ id, message, onUndo, ms }) {
  const [left, setLeft] = useState(100);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    let raf; let used = 0; let last = performance.now();
    const tick = (n) => {
      if (!paused) used += n - last;
      last = n;
      const p = 100 - (used / ms) * 100;
      setLeft(Math.max(0, p));
      if (p <= 0) toast.dismiss(id); else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, ms, id]);
  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative flex min-w-[240px] items-center gap-4 overflow-hidden rounded-2xl border border-[hsl(var(--wb-line))] bg-popover py-2.5 pl-4 pr-2.5 text-[13px] text-foreground shadow-[var(--shadow-md)]"
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => { onUndo?.(); toast.dismiss(id); }}
        className="h-7 rounded-full border border-[hsl(var(--wb-line-strong))] px-3 text-[13px] font-medium text-[hsl(var(--brand-700))] outline-none transition-colors duration-150 hover:bg-[hsl(var(--brand-50))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))]"
      >
        Undo
      </button>
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-[hsl(var(--brand-100))]">
        <span className="block h-full bg-[hsl(var(--brand-500))]" style={{ width: `${reduce ? 100 : left}%` }} />
      </span>
    </div>
  );
}
export function undoToast(message, onUndo, ms = 5000) {
  return toast.custom((id) => <FuseToast id={id} message={message} onUndo={onUndo} ms={ms} />, { duration: ms + 400 });
}

/** A dismissible notice that collapses out (height + fade) so the content below slides up. */
export function Dismissible({ show, children, className }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="n"
          layout={!reduce}
          initial={reduce ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: reduce ? 0 : 0.22, ease: EASE }}
          style={{ overflow: 'hidden' }}
          className={className}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
export { MotionConfig };
