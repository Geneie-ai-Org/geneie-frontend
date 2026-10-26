import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { Equal, Repeat } from 'lucide-react';
import { Citation, Citations } from '@/components/agents/citations';
import { ApprovalCard } from '@/components/agents/approval-card';
import { NumberTicker } from '@/components/motion/number-ticker';
import { Marquee } from '@/components/motion/marquee';

const LINE = 'hsl(var(--wb-line))';

const BUILT_ON = ['ClinVar', 'gnomAD', 'InterVar', 'ANNOVAR', 'Exomiser', 'HPO'];

const SOURCE_PREFIX = 'principles-source';
const SOURCES = [
  { id: 'row-4812', title: 'Row 4812 · chr2:166071092 C>T', domain: 'sample.vcf' },
  { id: 'row-4813', title: 'Row 4813 · chr2:166071340 G>A', domain: 'sample.vcf' },
];

// beUI Citations: numbered markers in the answer that jump to the rows listed under it.
function TraceableVisual() {
  return (
    <div
      className="-ml-2.5 flex-1 rounded-xl border px-3 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.05)] [&_.truncate]:font-mono [&_.truncate]:text-xs"
      style={{ borderColor: LINE, background: 'hsl(var(--wb-card))' }}
    >
      <p className="px-1 text-base leading-6">
        Two pathogenic variants in SCN1A
        <Citation citationId="row-4812" index={1} idPrefix={SOURCE_PREFIX} />
        <Citation citationId="row-4813" index={2} idPrefix={SOURCE_PREFIX} />.
      </p>
      <div className="mt-3 border-t pt-2" style={{ borderColor: LINE }}>
        <Citations citations={SOURCES} idPrefix={SOURCE_PREFIX} title="Sources" defaultOpen />
      </div>
    </div>
  );
}

// beUI NumberTicker: the same file run three times lands on the same score every time.
function DeterministicVisual() {
  return (
    <div
      className="flex flex-1 flex-col rounded-xl border px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.05)]"
      style={{ borderColor: LINE, background: 'hsl(var(--wb-card))' }}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Repeat className="size-4" />
        <span className="font-medium">Runs</span>
        <span className="grid size-5 place-items-center rounded-full bg-muted text-[10px] font-semibold tabular-nums">3</span>
        <span className="ml-auto font-mono text-xs">sample.vcf</span>
      </div>
      <div className="mt-3 grid grid-cols-3 divide-x border-t py-3" style={{ borderColor: LINE }}>
        {[1, 2, 3].map((run) => (
          <div key={run} className="px-3 first:pl-0 last:pr-0" style={{ borderColor: LINE }}>
            <p className="text-[13px] leading-5 text-muted-foreground">Run {run}</p>
            <NumberTicker value={0.97} decimals={2} duration={1.1} stagger={0.06} className="text-[1.75rem] font-semibold leading-9 tabular-nums" />
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t pt-2.5 text-[13px] leading-5 text-muted-foreground" style={{ borderColor: LINE }}>
        <span>SCN1A · Exomiser combined score</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[hsl(var(--brand-700))] dark:text-[hsl(var(--brand-300))]">
          <Equal className="size-3.5" />
          Identical
        </span>
      </div>
    </div>
  );
}

// Follows its content's height with a gentle ease (slower than the component's own springs, which read as snappy here),
// so a card whose content changes grows and shrinks instead of snapping.
function AnimatedHeight({ children, reduce, minHeight = 0 }) {
  const inner = useRef(null);
  const [height, setHeight] = useState('auto');
  useLayoutEffect(() => {
    const el = inner.current;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div initial={false} animate={{ height }} transition={reduce ? { duration: 0 } : { duration: 0.6, ease: [0.4, 0, 0.2, 1] }} className="box-content overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(16,24,40,0.07),0_1px_1px_rgba(16,24,40,0.04)]" style={{ borderColor: LINE, background: 'hsl(var(--wb-card))' }}>
      <div ref={inner} className="flex flex-col" style={{ minHeight }}>{children}</div>
    </motion.div>
  );
}

// beUI ApprovalCard: the analyst step, flipping between waiting and confirmed while it is on screen.
function ReviewableVisual({ on, reduce }) {
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (reduce) { setConfirmed(true); return undefined; }
    if (!on) return undefined;
    const first = setTimeout(() => setConfirmed(true), 1400);
    const t = setInterval(() => setConfirmed((c) => !c), 3600);
    return () => { clearInterval(t); clearTimeout(first); };
  }, [on, reduce]);
  // While waiting, the card fills the room the other two boxes make, so the three line up; confirmed, it shrinks to its content.
  const room = useRef(null);
  const [fill, setFill] = useState(0);
  useLayoutEffect(() => {
    const el = room.current;
    const measure = () => setFill(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const props = {
    title: 'SCN1A c.664C>T',
    description: 'ACMG pathogenic · seizures match the phenotype. Next step: confirm against the source evidence.',
    approveLabel: 'Confirm as analyst',
    // The surface (background, border, shadow) belongs to the animated wrapper, so it shrinks as one piece with the content.
    className: 'flex-1 bg-transparent',
  };
  // The pending card is the tall one. An invisible copy of it holds the space, so the page below does not move while
  // the live card shrinks to its confirmed state and grows back.
  return (
    <div ref={room} className="relative grid flex-1 content-start">
      <div aria-hidden="true" inert className="invisible [grid-area:1/1]">
        <ApprovalCard {...props} status="pending" />
      </div>
      {/* Out of flow, so its size never feeds back into the room it is measured against. */}
      <div className="absolute inset-x-0 top-0">
        <AnimatedHeight reduce={reduce} minHeight={confirmed ? 0 : Math.max(0, fill - 2)}>
          <ApprovalCard {...props} status={confirmed ? 'approved' : 'pending'} onApprove={() => setConfirmed(true)} />
        </AnimatedHeight>
      </div>
    </div>
  );
}

const PRINCIPLES = [
  {
    title: 'Traceable',
    body: 'Every answer points back to the rows it came from, so you can check it against your file.',
    Visual: TraceableVisual,
  },
  {
    title: 'Deterministic',
    body: 'Annotation, ACMG classification and phenotype ranking run in established tools, not in the language model.',
    Visual: DeterministicVisual,
  },
  {
    title: 'Reviewable',
    body: 'Candidates arrive with the reasons they ranked and a suggested next step. An analyst confirms before anything is reported.',
    Visual: ReviewableVisual,
  },
];

/**
 * "Built to be checked": three properties, each shown with a beUI component doing the thing (Citations, NumberTicker,
 * ApprovalCard), then a marquee of the sources the pipelines are built on. With reduced motion the review card
 * shows its confirmed state and nothing loops. All data is synthetic.
 */
export default function PrinciplesSection() {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const seen = useInView(ref, { once: true, amount: 0.3 });
  const on = seen || reduce;

  return (
    <div ref={ref}>
      <div className="grid gap-8 sm:gap-12 lg:grid-cols-3 lg:gap-10">
        {PRINCIPLES.map(({ title, body, Visual }, i) => (
          <div key={title} className="flex flex-col">
            <motion.div
              aria-hidden="true"
              className="h-px origin-left"
              style={{ background: 'hsl(var(--brand-500))' }}
              initial={false}
              animate={{ scaleX: on ? 1 : 0 }}
              transition={{ duration: reduce ? 0 : 0.8, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : i * 0.12 }}
            />
            <p aria-hidden="true" className="mt-3 text-[13px] leading-5 tabular-nums sm:mt-4 text-[var(--text-tertiary)]">{String(i + 1).padStart(2, '0')}</p>
            <h3 className="mt-2 text-xl font-medium leading-6 lg:text-2xl lg:leading-8">{title}</h3>
            <p className="mt-2 max-w-sm text-base leading-6 text-muted-foreground lg:min-h-[4.5rem]">{body}</p>
            <div className="mt-6 hidden flex-1 flex-col sm:flex"><Visual on={on} reduce={reduce} /></div>
          </div>
        ))}
      </div>
      <div className="mt-8 flex items-center gap-5 border-t pt-5 sm:mt-14 sm:pt-6" style={{ borderColor: LINE }}>
        <span className="shrink-0 text-base font-medium leading-6">Built on</span>
        <Marquee speed={32} gap="2.5rem" className="min-w-0 flex-1">
          {BUILT_ON.map((name) => <span key={name} className="text-base leading-6 text-muted-foreground">{name}</span>)}
        </Marquee>
      </div>
    </div>
  );
}
