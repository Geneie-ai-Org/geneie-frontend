import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * A small track that drains over `seconds`, matching a panel's auto-close timer so the countdown
 * is visible. Transform only. With reduced motion the bar is not drawn (the sentence beside it
 * already says the panel closes by itself).
 */
export default function AutoCloseBar({ seconds = 5 }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <div className="wb-track mx-auto mt-4 w-24" aria-hidden="true">
      <motion.div
        className="h-full origin-left rounded-full bg-[hsl(var(--brand-300))]"
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: seconds, ease: 'linear' }}
      />
    </div>
  );
}
