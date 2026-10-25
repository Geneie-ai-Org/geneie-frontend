// Helix variant of the beUI loader: https://beui.dev/components/motion/loader (variant="helix").
// Only the helix is vendored, not the other 16 variants, to keep the bundle small.
"use client";

import { motion, useReducedMotion } from "motion/react";
import { EASE_IN_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

const ROWS = 7;

/** Two strands of dots crossing as they turn. Inherits text colour; `size` is the square in px, `speed` the seconds per turn. */
export function HelixLoader({ size = 32, speed = 1, label = "Loading", className }) {
  const reduce = useReducedMotion();
  const dot = size * 0.14;
  const amp = size * 0.32;
  return (
    <span role="status" aria-label={label} className={cn("inline-flex items-center justify-center text-foreground", className)}>
      <span className="relative" style={{ width: size, height: size }}>
        {Array.from({ length: ROWS }, (_, r) => {
          const top = (r / (ROWS - 1)) * (size - dot);
          const delay = (r / ROWS) * speed;
          const base = { width: dot, height: dot, left: size / 2 - dot / 2, top };
          const transition = { duration: speed, ease: EASE_IN_OUT, repeat: Infinity, delay };
          return (
            <span key={r}>
              <motion.span
                className="absolute rounded-full bg-current"
                style={base}
                animate={reduce ? { opacity: [0.4, 1, 0.4] } : { x: [amp, -amp, amp], scale: [1, 0.5, 1], opacity: [1, 0.45, 1] }}
                transition={transition}
              />
              <motion.span
                className="absolute rounded-full bg-current"
                style={base}
                animate={reduce ? { opacity: [0.4, 1, 0.4] } : { x: [-amp, amp, -amp], scale: [0.5, 1, 0.5], opacity: [0.45, 1, 0.45] }}
                transition={transition}
              />
            </span>
          );
        })}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
