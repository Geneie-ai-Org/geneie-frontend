import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, Copy, Download } from 'lucide-react';
import Reveal from '@/components/public/Reveal';
import { TextReveal } from '@/components/motion/text-reveal';
import { DrawPath, curve } from '@/components/public/ProductTour';
import { EASE_OUT } from '@/lib/ease';
import { acquireLenis, releaseLenis, setScrollResistance } from '@/lib/smoothScroll';
import Snap from 'lenis/snap';

const LINE = 'hsl(var(--wb-line))';
// Detent: moving away from a settled proof, wheel movement is scaled from MIN up to 1 over WELL x the gap between proofs.
const MIN_FACTOR = 0.25;
const WELL = 0.2;

/* ------------------------------------------------------------- proofs */

function ClinicianProof() {
  const rows = [
    { gene: 'SCN1A', v: 'c.664C>T', label: 'Primary candidate', tone: 'brand', why: 'ACMG pathogenic · seizures match the phenotype' },
    { gene: 'KCNQ2', v: 'c.1342G>A', label: 'Strong candidate', tone: 'brand', why: 'ACMG likely pathogenic · partial phenotype overlap' },
    { gene: 'STXBP1', v: 'c.902+1G>A', label: 'Follow-up', why: 'ACMG pathogenic · review against the source evidence' },
  ];
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        <span className="wb-chip" data-tone="brand">HP:0001250 Seizure</span>
        <span className="wb-chip" data-tone="brand">HP:0001252 Hypotonia</span>
      </div>
      <ol className="mt-5 divide-y" style={{ borderColor: LINE }}>
        {rows.map((r, i) => (
          <li key={r.gene} className="py-3 first:pt-0" style={{ borderColor: LINE }}>
            <div className="flex items-center gap-3">
              <span
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
                style={i === 0 ? { background: 'hsl(var(--brand-solid))', color: 'hsl(var(--primary-foreground))' } : { border: `1px solid ${LINE}`, color: 'hsl(var(--muted-foreground))' }}
              >
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="font-semibold">{r.gene}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">{r.v}</span>
                </div>
                <span className="wb-chip shrink-0" data-tone={r.tone}>{r.label}</span>
              </div>
            </div>
            <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{r.why}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ResearcherProof() {
  const rows = [
    ['KCNQ2', 'c.1342G>A', 'missense', '0.00002'],
    ['KCNQ2', 'c.881C>T', 'missense', '0.00001'],
    ['KCNQ2', 'c.637C>T', 'stop gained', 'absent'],
  ];
  const action = 'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] leading-5 text-muted-foreground';
  return (
    <div className="space-y-6">
      <p className="ml-auto w-fit max-w-[85%] rounded-[1.25rem] rounded-br-md px-4 py-3 text-base leading-6" style={{ background: 'hsl(var(--brand-solid))', color: 'hsl(var(--primary-foreground))' }}>
        Which rare variants are in KCNQ2?
      </p>
      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border sm:inline-flex"
          style={{ borderColor: LINE, background: 'hsl(var(--wb-pill))' }}
        >
          <img src="/geneie-g.svg" alt="" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base leading-6">Found 3 rare variants in KCNQ2, all with gnomAD allele frequency below 0.0001.</p>
          <div className="mt-4 overflow-x-auto rounded-2xl border" style={{ borderColor: LINE }}>
            <table className="w-full text-left text-xs leading-5 sm:min-w-[22rem] sm:text-sm sm:leading-6">
              <thead className="text-[13px] leading-5 text-muted-foreground" style={{ background: 'hsl(var(--wb-pill))' }}>
                <tr>
                  <th className="px-2.5 sm:px-4 py-2 font-normal">Gene</th>
                  <th className="px-2.5 sm:px-4 py-2 font-normal">Variant</th>
                  <th className="hidden px-2.5 py-2 font-normal sm:table-cell sm:px-4">Consequence</th>
                  <th className="px-2.5 sm:px-4 py-2 text-right font-normal">gnomAD AF</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r[1]} className="border-t" style={{ borderColor: LINE }}>
                    <td className="px-2.5 py-2 font-semibold sm:px-4 sm:py-2.5">{r[0]}</td>
                    <td className="px-2.5 py-2 font-mono text-xs text-muted-foreground sm:px-4 sm:py-2.5">{r[1]}</td>
                    <td className="hidden px-2.5 py-2 text-muted-foreground sm:table-cell sm:px-4 sm:py-2.5">{r[2]}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground sm:px-4 sm:py-2.5">{r[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 hidden text-base leading-6 text-muted-foreground sm:block">
            Two are missense. c.637C&gt;T is a stop gain and is absent from gnomAD, so it is the one to look at first.
          </p>
          <div className="mt-4 hidden flex-wrap gap-2 sm:flex" aria-hidden="true">
            <span className={action} style={{ borderColor: LINE }}><Copy className="h-3.5 w-3.5" />Copy insight</span>
            <span className={action} style={{ borderColor: LINE }}><Download className="h-3.5 w-3.5" />Export to Excel</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CounselorProof() {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 border-b pb-2" style={{ borderColor: LINE }}>
        <span className="font-semibold">Case report</span>
        <span className="wb-chip">Draft</span>
      </div>
      <p className="mt-4">
        <span className="font-semibold">SCN1A</span> <span className="font-mono text-xs text-muted-foreground">c.664C&gt;T</span>
      </p>
      <p className="mt-1 text-[13px] leading-5 text-muted-foreground">Pathogenic · analyst to confirm</p>
      <div className="mt-4 space-y-2" aria-hidden="true">
        <div className="h-1.5 w-full rounded-full" style={{ background: 'hsl(var(--wb-pill))' }} />
        <div className="h-1.5 w-11/12 rounded-full" style={{ background: 'hsl(var(--wb-pill))' }} />
        <div className="h-1.5 w-2/3 rounded-full" style={{ background: 'hsl(var(--wb-pill))' }} />
      </div>
      <p className="mt-4 text-[13px] leading-5 text-muted-foreground">
        <span className="text-foreground">Suggested next step:</span> confirm against the source evidence.
      </p>
    </div>
  );
}

function BioinformaticianProof() {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs">
        <span className="wb-chip">FASTQ</span>
        <span className="h-px flex-1" style={{ background: 'hsl(var(--brand-300))' }} />
        <span className="wb-chip" data-tone="brand">Read QC</span>
        <span className="h-px flex-1" style={{ background: 'hsl(var(--brand-300))' }} />
        <span className="wb-chip">VCF</span>
      </div>
      <div className="mt-5 flex items-baseline justify-between text-xs text-muted-foreground">
        <span>Quality along the read</span>
        <span>Q30 94%</span>
      </div>
      <svg viewBox="0 0 400 124" role="img" aria-label="Illustrative per-base quality curves for read 1 and read 2" className="mt-1 h-auto w-full text-foreground">
        {[[16, 'Q40'], [56, 'Q30'], [96, 'Q20']].map(([y, l]) => (
          <g key={l}>
            <line x1="30" x2="396" y1={y} y2={y} stroke={LINE} strokeDasharray={l === 'Q30' ? '4 4' : undefined} />
            <text x="0" y={y + 4} fontSize="10" fill="currentColor" opacity="0.55">{l}</text>
          </g>
        ))}
        <DrawPath delay={200} d={curve(30, 396, 30, 36, 1.2)} fill="none" stroke="hsl(var(--brand-300))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <DrawPath delay={100} d={curve(30, 396, 26, 22, 1)} fill="none" stroke="hsl(var(--brand-500))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <text x="30" y="118" fontSize="10" fill="currentColor" opacity="0.55">1</text>
        <text x="396" y="118" fontSize="10" textAnchor="end" fill="currentColor" opacity="0.55">150 bp</text>
      </svg>
    </div>
  );
}

const ROLES = [
  {
    id: 'clinician',
    label: 'clinician',
    need: 'rank candidates from a phenotype.',
    body: 'Describe the patient’s clinical picture in free text. HPO terms are derived and Exomiser ranks germline candidates, with the reasons for each rank shown next to it.',
    Proof: ClinicianProof,
  },
  {
    id: 'researcher',
    label: 'researcher',
    need: 'ask about a gene without writing a query.',
    body: 'Ask about genes, consequences, inheritance or frequency without writing a query. Copy insights or export filtered variant tables to Excel.',
    Proof: ResearcherProof,
  },
  {
    id: 'counselor',
    label: 'genetic counselor',
    need: 'review a draft report against the source.',
    body: 'Review a draft case report that lists the candidate variants, their evidence and a suggested next step. Download it as a PDF to check against the source.',
    Proof: CounselorProof,
  },
  {
    id: 'bioinformatician',
    label: 'bioinformatician',
    need: 'go from FASTQ reads to a VCF.',
    body: 'Start from FASTQ reads. Geneie aligns them, calls variants and reports read quality as part of the run, then hands you a VCF to annotate and filter.',
    Proof: BioinformaticianProof,
  },
];

const HEADER_PX = 56; // the sticky site header the pinned block sits under
const STEP_VH = 60; // scroll distance, in viewport heights, between one role's settled point and the next
// Each role is settled for HOLD of its step (scrolling there changes nothing: the detent), then changes over the rest.
const HOLD = 0.65;
const TAIL = 0.4; // steps of dwell after the last role before the pin lets go
const SETTLE_MS = 140;

/**
 * Phones: the whole section (heading included) pins under the header, and the role morphs in place (the word, the
 * need clause, the line of text and the proof) as scroll passes each step. Same idea as the desktop version:
 * scrolling away from a settled role takes a long pull, the change itself takes a short one, and when scrolling stops
 * mid-change the page settles on the nearest role. Native touch scrolling stays in charge (Lenis only animates the settle).
 * The bars show the step and jump to it. Reduced motion: no settling, and the content just swaps.
 */
function WhoItsForPhone({ heading }) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const track = useRef(null);
  const role = ROLES[index];
  const Proof = role.Proof;

  const step = () => (window.innerHeight * STEP_VH) / 100;
  // Scroll offset of the track at which role i is settled.
  const settledY = (i) => window.scrollY + track.current.getBoundingClientRect().top - HEADER_PX + step() * i;

  useEffect(() => {
    let timer = 0;
    let touching = false;
    const progress = () => (HEADER_PX - track.current.getBoundingClientRect().top) / step(); // 0 at the first role's settled point

    const pick = () => {
      if (!track.current) return;
      const next = Math.max(0, Math.min(ROLES.length - 1, Math.round(progress())));
      setIndex((cur) => (cur === next ? cur : next));
    };

    // After scrolling stops mid-change, glide to the nearest role. Skipped while a finger is down or when pinned out of range.
    const settle = () => {
      if (touching || !track.current) return;
      const p = progress();
      if (p < 0 || p > ROLES.length - 1) return;
      const nearest = Math.round(p);
      if (Math.abs(p - nearest) <= HOLD / 2) return; // already in a hold: leave it
      const y = settledY(nearest);
      if (lenis) lenis.scrollTo(y, { duration: 0.55 });
      else window.scrollTo({ top: y, behavior: 'smooth' });
    };

    const lenis = reduce ? null : acquireLenis();
    const onScroll = () => {
      pick();
      clearTimeout(timer);
      if (!reduce) timer = setTimeout(settle, SETTLE_MS);
    };
    const down = () => { touching = true; clearTimeout(timer); };
    const up = () => { touching = false; clearTimeout(timer); if (!reduce) timer = setTimeout(settle, SETTLE_MS); };

    pick();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', pick);
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchend', up, { passive: true });
    window.addEventListener('touchcancel', up, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', pick);
      window.removeEventListener('touchstart', down);
      window.removeEventListener('touchend', up);
      window.removeEventListener('touchcancel', up);
      if (lenis) releaseLenis();
    };
  }, [reduce]);

  const jump = (i) => {
    const y = settledY(i);
    window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <div
      ref={track}
      // Pinned height, plus a step per role to scroll through and a short dwell on the last one.
      style={{ height: `calc((100svh - ${HEADER_PX}px) + ${(ROLES.length - 1 + TAIL) * STEP_VH}svh)` }}
    >
      <div
        className="sticky flex flex-col justify-center overflow-hidden"
        style={{ top: HEADER_PX, height: `calc(100svh - ${HEADER_PX}px)` }}
      >
        <div className="pb-2">{heading}</div>
        <div className="flex items-center gap-2" role="group" aria-label="Roles">
          {ROLES.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onClick={() => jump(i)}
              aria-label={`Show ${r.label}`}
              aria-current={i === index}
              className="group -my-3 flex min-h-11 flex-1 items-center outline-none"
            >
              <span
                className="h-0.5 w-full rounded-full transition-colors duration-300 group-focus-visible:ring-2 group-focus-visible:ring-[hsl(var(--brand-500))]"
                style={{ background: i <= index ? 'hsl(var(--brand-500))' : 'hsl(var(--wb-line))' }}
              />
            </button>
          ))}
        </div>

        {/* The whole block is centred in the pinned height. Invisible copies of every role share the cell with the live one,
            so it is always as tall as the tallest role: a short proof leaves no hole and the heading never shifts. */}
        <div className="grid grid-cols-[minmax(0,1fr)] pt-2">
          <div className="min-w-0 self-start [grid-area:1/1]">
            <div aria-live="polite">
              <p className="text-2xl font-medium leading-8 tracking-[-0.01em] text-balance">
                <span>I’m a </span>
                <span className="inline-flex text-[hsl(var(--brand-500))] underline decoration-[hsl(var(--brand-300))] decoration-2 underline-offset-[0.18em]">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={role.id}
                      initial={reduce ? false : { opacity: 0, y: '0.25em' }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, y: '-0.25em' }}
                      transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
                    >
                      {role.label}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </p>
              <TextReveal key={role.id} text={`and I need to ${role.need}`} stagger={0.03} blur={6} className="mt-1 min-h-[4.5rem] text-2xl font-medium leading-8 tracking-[-0.01em] text-muted-foreground text-balance" />
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={role.id}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.22, ease: EASE_OUT }}
              >
                <p className="mt-3 text-base leading-6 text-muted-foreground">{role.body}</p>
                <div className="wb-card pub-card mt-5 p-4" style={{ borderRadius: 20 }}>
                  <Proof />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          {ROLES.map((r) => {
            const Ghost = r.Proof;
            return (
              <div key={r.id} aria-hidden="true" inert className="pointer-events-none invisible min-w-0 [grid-area:1/1]">
                <p className="text-2xl font-medium leading-8 tracking-[-0.01em] text-balance">I’m a {r.label}</p>
                <p className="mt-1 min-h-[4.5rem] text-2xl font-medium leading-8 tracking-[-0.01em] text-balance">and I need to {r.need}</p>
                <p className="mt-3 text-base leading-6">{r.body}</p>
                <div className="wb-card pub-card mt-5 p-4" style={{ borderRadius: 20 }}><Ghost /></div>
              </div>
            );
          })}
        </div>
        <p className="pt-3 text-[13px] leading-5 text-[var(--text-tertiary)]">Synthetic data, illustration only.</p>
      </div>
    </div>
  );
}

/** Mounts only the layout for the current width, so the sticky, snapping desktop version never runs on a phone. */
export default function WhoItsFor({ heading }) {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setDesktop(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return desktop ? (
    <>
      <Reveal className="mb-8 lg:mb-12">{heading}</Reveal>
      <WhoItsForDesktop />
    </>
  ) : (
    <WhoItsForPhone heading={heading} />
  );
}

const SENTENCE = 'text-[1.75rem] font-medium leading-9 tracking-[-0.01em] text-balance lg:text-[2rem] lg:leading-10';

/**
 * "Who it's for": a sticky sentence on the left, four proofs scrolling past on the right. The role whose
 * proof reaches the sticky block becomes the sentence's role (the word and the need clause morph); scrolling is the
 * only control. Lenis settles the page on the nearest proof. Under lg the left side does not stick; each role stacks
 * as its own sentence, text and proof. Reduced motion: no morph. All content is synthetic.
 */
function WhoItsForDesktop() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [moved, setMoved] = useState(false); // the scroll cue goes once the visitor has seen a role change
  const root = useRef(null);
  const panels = useRef([]);
  const shown = useRef(0);
  const lenisRef = useRef(null);
  const leftRef = useRef(null);
  const anchors = useRef([]);
  const [tail, setTail] = useState(0); // space under the last proof so the column ends exactly where the stuck left block does
  const role = ROLES[index];

  // The active role is the last proof whose top has reached the middle of the screen, so the sentence only
  // changes once its proof is up beside it, never while that proof is still below.
  useEffect(() => {
    const pick = () => {
      const mid = window.innerHeight / 2;
      let best = 0;
      panels.current.forEach((el, i) => {
        if (el && el.lastElementChild.getBoundingClientRect().top <= mid) best = i; // the proof itself, not its padding
      });
      if (best === shown.current) return;
      shown.current = best;
      setIndex(best);
      setMoved(true);
    };
    pick(); // four rect reads per scroll event are cheap, and state only changes when the role does
    window.addEventListener('scroll', pick, { passive: true });
    window.addEventListener('resize', pick);
    return () => {
      window.removeEventListener('scroll', pick);
      window.removeEventListener('resize', pick);
    };
  }, []);

  // Scroll position at which a proof sits level with the stuck left block (the block's sticky `top`).
  const levelWith = (i) => {
    const proof = panels.current[i]?.lastElementChild;
    const stuck = parseFloat(getComputedStyle(leftRef.current).top) || 0;
    return window.scrollY + proof.getBoundingClientRect().top - stuck;
  };

  // The left block lets go of its sticky spot when the right column ends. Sizing the end of the column to the left
  // block's height makes that happen exactly when the last proof is level with it, so the section then moves as one.
  useEffect(() => {
    const left = leftRef.current;
    const lastProof = panels.current[ROLES.length - 1]?.lastElementChild;
    if (!left || !lastProof || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setTail(Math.max(0, Math.round(left.offsetHeight - lastProof.offsetHeight)));
    measure();
    document.fonts?.ready.then(measure); // text metrics settle once the fonts are in
    const ro = new ResizeObserver(measure);
    ro.observe(left);
    ro.observe(lastProof);
    return () => ro.disconnect();
  }, []);

  // Lenis smooths the scroll and settles it on the nearest proof (proximity, so the page can still be scrolled
  // past). Desktop only, where the left side sticks. Snapping is live only between the first and last proof,
  // where the left block is already stuck: entering and leaving the section scroll freely, so the left side
  // just sticks (plain CSS) and only the proofs on the right settle.
  useEffect(() => {
    const el = root.current;
    const wide = window.matchMedia('(min-width: 1024px)');
    if (!el || !wide.matches) return undefined;
    const lenis = acquireLenis();
    if (!lenis) return undefined;
    lenisRef.current = lenis;
    const snap = new Snap(lenis, {
      type: 'proximity',
      distanceThreshold: '30%',
      debounce: 150,
      duration: 0.9,
      easing: (t) => 1 - (1 - t) ** 4,
    });
    let removers = [];
    const place = () => {
      removers.forEach((remove) => remove());
      anchors.current = panels.current.filter(Boolean).map((_, i) => Math.round(levelWith(i)));
      removers = anchors.current.map((value) => snap.add(value));
    };
    place();
    snap.stop();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    const gate = ({ scroll }) => {
      const stops = [...snap.snaps.values()].map((item) => item.value);
      if (!stops.length) return;
      const inside = scroll >= Math.min(...stops) - 1 && scroll <= Math.max(...stops) + 1;
      if (inside === snap.isStopped) (inside ? snap.start() : snap.stop());
    };
    const off = lenis.on('scroll', gate);
    setScrollResistance((data) => {
      if (!data.event || data.event.type !== 'wheel') return;
      const stops = anchors.current;
      if (stops.length < 2) return;
      const target = lenis.targetScroll;
      const first = stops[0];
      const last = stops[stops.length - 1];
      if ((target <= first && data.deltaY < 0) || (target >= last && data.deltaY > 0)) return; // leaving the section
      const gap = (last - first) / (stops.length - 1);
      const nearest = stops.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
      const away = target - nearest;
      if (away !== 0 && Math.sign(away) !== Math.sign(data.deltaY)) return; // heading toward a proof: free
      const t = Math.min(1, Math.abs(away) / (gap * WELL));
      const factor = MIN_FACTOR + (1 - MIN_FACTOR) * t * t * (3 - 2 * t);
      data.deltaY *= factor;
    });
    return () => {
      setScrollResistance(null);
      off();
      ro.disconnect();
      removers.forEach((remove) => remove());
      snap.destroy();
      lenisRef.current = null;
      releaseLenis();
    };
  }, []);

  return (
    <div ref={root} className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
      {/* Desktop: the sticky, morphing sentence. */}
      <div ref={leftRef} className="hidden self-start lg:sticky lg:top-[max(6rem,calc(50vh-12rem))] lg:block">
        <div aria-live="polite" className={`${SENTENCE} lg:min-h-[8rem]`}>
          <div className="relative flex flex-wrap items-baseline gap-x-3">
            <span>I’m a</span>
            <span className="inline-flex min-h-11 items-baseline text-[hsl(var(--brand-500))] underline decoration-[hsl(var(--brand-300))] decoration-2 underline-offset-[0.18em]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={role.id}
                  initial={reduce ? false : { opacity: 0, y: '0.25em' }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: '-0.25em' }}
                  transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
                >
                  {role.label}
                </motion.span>
              </AnimatePresence>
            </span>
          </div>
          <TextReveal key={role.id} text={`and I need to ${role.need}`} stagger={0.035} blur={6} className="mt-1 text-muted-foreground" />
        </div>

        <p className="mt-6 min-h-[4.5rem] max-w-md text-base leading-6 text-muted-foreground">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={role.id}
              className="block"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.18, ease: EASE_OUT }}
            >
              {role.body}
            </motion.span>
          </AnimatePresence>
        </p>

        <div className="mt-8 h-5">
          <AnimatePresence>
            {!moved && !reduce && (
              <motion.p
                aria-hidden="true"
                className="inline-flex items-center gap-1.5 text-[13px] leading-5 text-muted-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
              >
                Scroll to explore
                <motion.span animate={{ y: [0, 4, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} className="inline-flex">
                  <ChevronDown className="h-4 w-4" />
                </motion.span>
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-4 text-[13px] leading-5 text-[var(--text-tertiary)]">One file in, four ways to work from it. Synthetic data, illustration only.</p>
      </div>

      {/* The proofs: ordinary scrolling content. Under lg each carries its own sentence and text. */}
      <div>
        {ROLES.map((r, i) => {
          const Proof = r.Proof;
          return (
            <div
              key={r.id}
              ref={(el) => { panels.current[i] = el; }}
              data-i={i}
              // The last panel ends just below its proof, so the sticky left side lets go right after the last role.
              className={`flex flex-col justify-start border-t py-10 first:border-t-0 first:pt-0 lg:border-t-0 lg:py-[4.5rem] lg:first:pt-0 ${i === ROLES.length - 1 ? 'lg:pb-[var(--tail)]' : ''}`}
              style={{ borderColor: LINE, '--tail': `${tail}px` }}
            >
              <div className="mb-6 lg:hidden">
                <p className={SENTENCE}>
                  I’m a <span className="text-[hsl(var(--brand-500))]">{r.label}</span>
                  <span className="block text-muted-foreground">and I need to {r.need}</span>
                </p>
                <p className="mt-3 text-base leading-6 text-muted-foreground">{r.body}</p>
              </div>
              <div
                className={`wb-card pub-card p-5 transition-opacity duration-300 sm:p-6 ${i === index || reduce ? 'lg:opacity-100' : 'lg:opacity-40'}`}
                style={{ borderRadius: 20 }}
              >
                <Proof />
              </div>
            </div>
          );
        })}
        <p className="mt-2 text-[13px] leading-5 text-[var(--text-tertiary)] lg:hidden">One file in, four ways to work from it. Synthetic data, illustration only.</p>
      </div>
    </div>
  );
}
