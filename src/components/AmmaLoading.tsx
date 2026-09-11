import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const STAGES = [
  "RECEIVING SUBMISSION...",
  "ANALYZING DECISION...",
  "CHECKING FINANCIAL RESPONSIBILITY...",
  "CONSULTING RELATIVES...",
  "AMMA HAS REACHED A CONCLUSION.",
] as const;

/**
 * Full-screen loading sequence shown while /api/amma is judging.
 * Stages advance on a timer; the final stage holds until the response arrives.
 */
export function AmmaLoading() {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    // Advance one stage every ~1.1s; last stage holds until results arrive.
    const timer = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length - 1));
    }, 1100);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div
      className="relative z-20 min-h-screen bg-background/97 backdrop-blur-md flex flex-col items-center justify-center px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Decorative corner markers */}
      <div className="absolute top-6 left-6 w-6 h-6 border-t border-l border-primary/40" />
      <div className="absolute top-6 right-6 w-6 h-6 border-t border-r border-primary/40" />
      <div className="absolute bottom-6 left-6 w-6 h-6 border-b border-l border-primary/40" />
      <div className="absolute bottom-6 right-6 w-6 h-6 border-b border-r border-primary/40" />

      <p className="text-xs font-mono text-muted-foreground/70 tracking-widest uppercase mb-8">
        Judgment in progress
      </p>

      <div className="w-full max-w-md font-mono text-sm space-y-3">
        {STAGES.map((stage, index) => {
          const isActive = index === stageIndex;
          const isDone = index < stageIndex;
          return (
            <motion.div
              key={stage}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: index <= stageIndex ? 1 : 0.15, x: 0 }}
              transition={{ duration: 0.35 }}
              className="flex items-center gap-3"
            >
              {isDone ? (
                <span className="text-primary">✓</span>
              ) : isActive ? (
                <span className="w-2 h-2 rounded-full bg-primary animate-status-pulse shrink-0" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-border shrink-0" />
              )}
              <span
                className={
                  isActive
                    ? "text-foreground tracking-wide"
                    : isDone
                      ? "text-muted-foreground/80 tracking-wide"
                      : "text-muted-foreground/40 tracking-wide"
                }
              >
                {stage}
              </span>
              {isActive && (
                <span className="text-primary animate-pulse ml-0.5">▊</span>
              )}
            </motion.div>
          );
        })}
      </div>

      <motion.p
        className="mt-10 text-xs text-muted-foreground/60 italic font-light tracking-wide"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
      >
        No choice escapes review.
      </motion.p>
    </motion.div>
  );
}
