import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ArrowUpRight } from 'lucide-react';

/**
 * A quiet trace in the thread for work that landed in a workbench tab the user is not looking at.
 * One pill per tab; it goes away once the tab has been seen.
 */
export default function LandingPills({ pending, labels, onOpen }) {
  const reduce = useReducedMotion();
  const ids = Object.keys(pending || {});
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-wrap justify-center gap-1.5 px-4 pb-2" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {ids.map((tabId) => (
          <motion.button
            key={tabId}
            type="button"
            layout={!reduce}
            initial={reduce ? false : { opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            onClick={() => onOpen(tabId)}
            className="wb-landing-pill"
          >
            <span className="wb-landing-check" aria-hidden="true"><Check className="size-3" /></span>
            <span className="truncate">{pending[tabId].text}</span>
            <span className="wb-landing-open">
              Open {labels?.[tabId] || 'tab'}
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
