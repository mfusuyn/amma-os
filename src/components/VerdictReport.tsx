import { motion } from "framer-motion";
import {
  ArrowLeft,
  Banknote,
  Eye,
  Gavel,
  MessageSquareText,
  Scale,
  Square,
  Users,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AmmaJudgment } from "@/lib/ammaTypes";

/** Relative-comparison section with a browser-native speak/stop toggle. */
function RelativeComparisonSection({
  text,
  index,
}: {
  text: string;
  index: number;
}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [supported]);

  const toggle = useCallback(() => {
    if (!supported) return;
    if (isSpeaking) {
      stop();
      return;
    }
    // If something else is queued (e.g. a prior run), clear it first.
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  }, [supported, isSpeaking, stop, text]);

  // Stop speech when navigating away from the report.
  useEffect(() => stop, [stop]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 + index * 0.12, duration: 0.45 }}
      className="relative bg-card/40 border border-border/40 rounded-lg p-5 md:p-6"
    >
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-primary">
          <Users className="w-3.5 h-3.5" />
        </span>
        <h3 className="text-xs font-mono tracking-widest uppercase text-foreground/85">
          Relative Comparison
        </h3>
        {supported && (
          <button
            type="button"
            aria-label={
              isSpeaking
                ? "Stop reading relative comparison"
                : "Read relative comparison aloud"
            }
            title={isSpeaking ? "Stop" : "Read aloud"}
            onClick={toggle}
            className={cn(
              "relative ml-auto flex items-center justify-center w-7 h-7 rounded-md border transition-colors",
              isSpeaking
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40",
            )}
          >
            {isSpeaking ? (
              <Square className="w-3 h-3" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
            {isSpeaking && (
              <span className="absolute inset-0 rounded-md border border-primary/40 animate-ping pointer-events-none" />
            )}
          </button>
        )}
      </div>
      <p className="text-sm md:text-[15px] text-muted-foreground leading-relaxed whitespace-pre-line">
        {text}
      </p>
    </motion.section>
  );
}

function ReportSection({
  icon,
  label,
  text,
  index,
}: {
  icon: React.ReactNode;
  label: string;
  text: string;
  index: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 + index * 0.12, duration: 0.45 }}
      className="relative bg-card/40 border border-border/40 rounded-lg p-5 md:p-6"
    >
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-primary">{icon}</span>
        <h3 className="text-xs font-mono tracking-widest uppercase text-foreground/85">
          {label}
        </h3>
      </div>
      <p className="text-sm md:text-[15px] text-muted-foreground leading-relaxed whitespace-pre-line">
        {text}
      </p>
    </motion.section>
  );
}

export function VerdictReport({
  judgment,
  onJudgeSomethingElse,
}: {
  judgment: AmmaJudgment;
  onJudgeSomethingElse: () => void;
}) {
  const approved = judgment.verdict === "APPROVED";

  const sections = [
    { label: "What Amma Sees", text: judgment.whatAmmaSees },
    { label: "Analysis", text: judgment.analysis.join("\n\n") },
    { label: "Financial Damage", text: judgment.financialDamage },
    { label: "Amma's Concern", text: judgment.ammasConcern },
    { label: "Relative Comparison", text: judgment.relativeComparison },
  ];

  const sectionIcons: Record<string, React.ReactNode> = {
    "What Amma Sees": <Eye className="w-3.5 h-3.5" />,
    Analysis: <MessageSquareText className="w-3.5 h-3.5" />,
    "Financial Damage": <Banknote className="w-3.5 h-3.5" />,
    "Amma's Concern": <Scale className="w-3.5 h-3.5" />,
    "Relative Comparison": <Users className="w-3.5 h-3.5" />,
  };

  return (
    <motion.div
      className="relative min-h-screen flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header block */}
      <div className="grid-bg" />
      <div className="scanline" />
      <div className="relative z-10 flex-1 flex flex-col items-center px-4 py-12 md:py-16">
        <div className="w-full max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <p className="text-xs font-mono text-muted-foreground/70 tracking-widest uppercase mb-3">
              AMMA OS
            </p>
            <h1
              className="font-display text-4xl md:text-5xl text-foreground tracking-tight"
              style={{ textShadow: "0 0 40px oklch(0.985 0 0 / 0.08)" }}
            >
              VERDICT REPORT
            </h1>
            <p className="text-xs font-mono text-muted-foreground/60 tracking-wider mt-3">
              Issued under full maternal authority
            </p>
          </motion.div>

          {/* Verdict banner */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className={cn(
              "relative rounded-xl border p-6 md:p-8 text-center overflow-hidden",
              approved
                ? "border-primary/50 bg-primary/10"
                : "border-destructive/60 bg-destructive/10",
            )}
          >
            <div className="flex items-center justify-center gap-3 mb-3">
              <Gavel
                className={cn(
                  "w-5 h-5",
                  approved ? "text-primary" : "text-destructive",
                )}
              />
              <span className="text-xs font-mono tracking-widest uppercase text-muted-foreground/80">
                {approved ? "Approved by Amma" : "Rejected by Amma"}
              </span>
            </div>
            <p
              className={cn(
                "font-display text-5xl md:text-6xl tracking-tight",
                approved ? "text-primary" : "text-destructive",
              )}
              style={{
                textShadow: approved
                  ? "0 0 40px oklch(0.72 0.17 145 / 0.25)"
                  : "0 0 40px oklch(0.577 0.245 27.325 / 0.25)",
              }}
            >
              {judgment.verdict}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-3 font-light italic">
              {approved
                ? "Amma is… impressed. Statistically."
                : "Amma knew it. She always knows."}
            </p>
          </motion.div>

          {/* Sections */}
          <div className="mt-6 space-y-4">
            {sections.map((s, i) =>
              s.label === "Relative Comparison" ? (
                <RelativeComparisonSection
                  key={s.label}
                  text={s.text}
                  index={i}
                />
              ) : (
                <ReportSection
                  key={s.label}
                  icon={sectionIcons[s.label]}
                  label={s.label}
                  text={s.text}
                  index={i}
                />
              ),
            )}
          </div>

          {/* Verdict reason */}
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.95, duration: 0.45 }}
            className="mt-6 relative bg-primary/5 border border-primary/30 rounded-lg p-5 md:p-6"
          >
            <div className="flex items-center gap-2.5 mb-3">
              <Gavel className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-xs font-mono tracking-widest uppercase text-foreground/85">
                Verdict Reason
              </h3>
            </div>
            <p className="text-sm md:text-[15px] text-muted-foreground leading-relaxed">
              {judgment.verdictReason}
            </p>
            <p className="mt-3 text-xs font-mono text-muted-foreground/60 tracking-wide italic">
              — AMMA OS
            </p>
          </motion.section>

          {/* Judge something else */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.05, duration: 0.45 }}
            className="mt-10 flex justify-center"
          >
            <Button
              onClick={onJudgeSomethingElse}
              variant="outline"
              size="lg"
              className={cn(
                "h-12 px-8 font-mono tracking-widest uppercase text-sm",
                "border-primary/40 hover:border-primary/70 hover:bg-primary/10 hover:text-primary",
                "transition-all duration-300 group",
              )}
            >
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
              Judge Something Else
            </Button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
