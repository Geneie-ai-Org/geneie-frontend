import React, { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { EASE_OUT } from '@/lib/ease';

const LINE = 'hsl(var(--wb-line))';

export const LIMITS = [
  {
    cut: 'diagnose',
    title: 'It does not diagnose',
    body: 'Geneie is a decision-support tool, not a diagnostic device. Qualified professionals interpret every result.',
  },
  {
    cut: 'score',
    title: 'It does not let the model score',
    body: 'The language model translates and explains. Scoring and classification come only from the pipelines.',
  },
  {
    cut: 'upload first, agree later',
    title: 'Patient data is handled by agreement',
    body: 'Before any identifiable sample is uploaded, we agree handling, retention and deletion with your lab in writing. Until then, use de-identified or synthetic data.',
  },
];

/**
 * "Where Geneie draws the line": one rule drawn across the section, three limits hanging from it. Each limit shows
 * the thing Geneie will not do struck through, then the plain rule. The rule and the strikes draw when the section
 * scrolls in; with reduced motion they are simply drawn. Under lg every limit carries its own short rule.
 */
export default function DrawsTheLine() {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const seen = useInView(ref, { once: true, amount: 0.35 });
  const on = seen || reduce;
  const draw = (delay) => ({ duration: reduce ? 0 : 0.7, ease: EASE_OUT, delay: reduce ? 0 : delay });

  return (
    <div ref={ref}>
      <div className="relative grid gap-12 lg:grid-cols-3 lg:gap-10">
        <motion.div
          aria-hidden="true"
          className="absolute left-0 right-0 top-0 hidden h-px origin-left lg:block"
          style={{ background: 'linear-gradient(90deg, hsl(var(--brand-500)) 0%, hsl(var(--brand-500)) 62%, hsl(var(--brand-500) / 0) 100%)' }}
          initial={false}
          animate={{ scaleX: on ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 1.1, ease: EASE_OUT }}
        />
        {LIMITS.map((item, i) => (
          <div key={item.title} className="relative lg:pt-8">
            <motion.div
              aria-hidden="true"
              className="mb-6 h-px origin-left lg:hidden"
              style={{ background: 'hsl(var(--brand-500))' }}
              initial={false}
              animate={{ scaleX: on ? 1 : 0 }}
              transition={draw(i * 0.12)}
            />
            {/* The node sits on the line: a ring with a filled centre that pops as the line reaches it. */}
            <span aria-hidden="true" className="absolute -top-[6px] left-0 hidden h-[13px] w-[13px] lg:block">
              <motion.span
                className="block h-full w-full rounded-full border-2"
                style={{ borderColor: 'hsl(var(--brand-500))', background: 'hsl(var(--wb-bg))' }}
                initial={false}
                animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.3 }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 18, delay: 0.4 + i * 0.35 }}
              />
              <motion.span
                className="absolute inset-[3.5px] rounded-full"
                style={{ background: 'hsl(var(--brand-500))' }}
                initial={false}
                animate={{ scale: on ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : 0.3, ease: EASE_OUT, delay: reduce ? 0 : 0.6 + i * 0.35 }}
              />
            </span>
            <p aria-hidden="true" className="relative inline-block text-[1.75rem] font-medium leading-9 tracking-[-0.01em] text-[var(--text-tertiary)] lg:text-[2rem] lg:leading-10">
              {item.cut}
              <motion.span
                className="absolute left-0 right-0 top-1/2 h-[2px] origin-left"
                style={{ background: 'hsl(var(--brand-500))' }}
                initial={false}
                animate={{ scaleX: on ? 1 : 0 }}
                transition={draw(0.9 + i * 0.25)}
              />
            </p>
            <h3 className="mt-4 text-xl font-medium leading-6 lg:text-2xl lg:leading-8">{item.title}</h3>
            <p className="mt-2 max-w-sm text-base leading-6 text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-12 border-t pt-6" style={{ borderColor: LINE }}>
        <p className="max-w-2xl text-base leading-6 text-muted-foreground">
          Application data is encrypted at rest and in transit and stored in AWS Mumbai. You can delete a conversation at any time, or ask us to delete your whole account.
        </p>
      </div>
    </div>
  );
}
