import { motion } from "framer-motion";
import { Upload, Type, ChevronRight, Image, Activity } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Status indicator component
function StatusIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
      <span
        className="w-2 h-2 rounded-full bg-primary animate-status-pulse"
        style={{ boxShadow: "0 0 8px oklch(0.72 0.17 145 / 0.8)" }}
      />
      <span className="text-xs font-mono tracking-wider text-muted-foreground/80 uppercase">
        AMMA OS ONLINE
      </span>
    </div>
  );
}

// Upload zone component
function UploadZone({
  onSelect,
}: {
  onSelect?: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    onSelect?.();
  };

  return (
    <motion.div
      className={cn(
        "relative flex flex-col items-center justify-center gap-4 p-12 rounded-xl border-2 border-border/50 bg-card/50 backdrop-blur-sm transition-all cursor-pointer",
        "group hover:border-primary/30 hover:bg-card/80",
        "focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-ring/30",
        isDragging && "border-primary/50 bg-primary/5 scale-[1.01]"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
    >
      {/* Decorative corner markers */}
      <div className="absolute top-3 left-3 w-4 h-4 border-t border-l border-primary/50" />
      <div className="absolute top-3 right-3 w-4 h-4 border-t border-r border-primary/50" />
      <div className="absolute bottom-3 left-3 w-4 h-4 border-b border-l border-primary/50" />
      <div className="absolute bottom-3 right-3 w-4 h-4 border-b border-r border-primary/50" />

      {/* Upload icon */}
      <motion.div
        className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center"
        whileHover={{ scale: 1.1, rotate: 5 }}
        whileTap={{ scale: 0.95 }}
      >
        <Upload className="w-8 h-8 text-primary" />
      </motion.div>

      {/* Text content */}
      <div>
        <p className="text-lg font-medium text-foreground">
          Upload Something
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Show Amma what you&apos;ve done.
        </p>
      </div>

      {/* Subtle hint text */}
      <p className="text-xs text-muted-foreground/50 font-mono">
        Drag & drop or click to browse
      </p>

      {/* Scanline overlay when dragging */}
      {isDragging && (
        <div className="absolute inset-0 rounded-xl bg-primary/10 backdrop-blur-[2px] pointer-events-none" />
      )}
    </motion.div>
  );
}

// Text input area component
function TextInputArea({
  value,
  onChange,
  onSubmit,
  isLoading,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  isLoading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="relative"
    >
      <textarea
        value={value}
        onChange={onChange}
        placeholder="Tell Amma what you&apos;ve done..."
        disabled={isLoading}
        className={cn(
          "w-full h-32 px-5 py-4 rounded-lg bg-card/50 border border-border/50 backdrop-blur-sm",
          "text-foreground placeholder:text-muted-foreground/50",
          "resize-none transition-all outline-none",
          "focus:border-primary/40 focus:ring-1 focus:ring-ring/20",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "font-mono text-sm leading-relaxed"
        )}
        rows={4}
      />

      {/* Scanline effect on textarea */}
      <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent pointer-events-none" />

      <Button
        onClick={onSubmit}
        disabled={!value.trim() || isLoading}
        className={cn(
          "mt-4 w-full h-12 text-base font-medium tracking-wide",
          "bg-primary hover:bg-primary/90 text-primary-foreground",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "transition-all duration-300",
          "shadow-lg shadow-primary/20",
          "group"
        )}
      >
        {isLoading ? (
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            <span className="font-mono tracking-wider">ANALYZING...</span>
          </motion.div>
        ) : (
          <span className="flex items-center gap-2">
            ASK AMMA
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </span>
        )}
      </Button>
    </motion.div>
  );
}

// Suggestion chip component
function SuggestionChip({
  text,
  onClick,
}: {
  text: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      className={cn(
        "group relative px-4 py-2 rounded-md border border-border/50 bg-card/30",
        "text-sm text-muted-foreground hover:text-foreground",
        "transition-all duration-200",
        "hover:border-primary/30 hover:bg-primary/5 hover:shadow-lg hover:shadow-primary/5",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Decorative line */}
      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity" />

      {text}
    </motion.button>
  );
}

// Main landing component
export default function Landing() {
  const [textInput, setTextInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const examplePrompts = [
    "My new gaming PC",
    "This outfit",
    "My exam marks",
    "My ₹80,000 purchase",
    "My bedroom",
    "Should I buy this?",
  ];

  const handleSubmit = () => {
    if (!textInput.trim()) return;
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
    }, 2000);
  };

  const handleSuggestionClick = (prompt: string) => {
    setTextInput(prompt);
  };

  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      {/* Background layers */}
      <div className="grid-bg" />
      <div className="scanline" />

      {/* Subtle radial glow */}
      <div
        className="fixed top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, oklch(0.72 0.17 145 / 0.06) 0%, transparent 70%)",
        }}
      />

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Status bar */}
        <div className="w-full">
          <StatusIndicator />
        </div>

        {/* Center content */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
          <div className="w-full max-w-4xl mx-auto">
            {/* Main heading */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-center mb-12"
            >
              <h1
                className="font-display text-7xl md:text-8xl lg:text-9xl text-foreground tracking-tight mb-4"
                style={{
                  textShadow: "0 0 40px oklch(0.985 0 0 / 0.1)",
                }}
              >
                AMMA OS
              </h1>
              <p
                className="text-xl md:text-2xl text-muted-foreground/80 font-light tracking-wide max-w-2xl mx-auto"
                style={{
                  letterSpacing: "0.02em",
                }}
              >
                The world&apos;s most advanced system for judging your life choices.
              </p>
              <p className="text-sm text-muted-foreground/60 mt-6 max-w-xl mx-auto leading-relaxed">
                Give Amma anything. A purchase. An outfit. Your marks. Your room.{" "}
                <span className="text-muted-foreground/80">A questionable decision.</span> Amma will analyze it.
              </p>
            </motion.div>

            {/* Main input card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="bg-card/80 backdrop-blur-md rounded-2xl border border-border/50 shadow-2xl"
            >
              {/* Card header */}
              <div className="px-8 pt-8 pb-4 border-b border-border/30">
                <h2 className="text-sm font-mono text-muted-foreground/70 tracking-widest uppercase">
                  What Would You Like Amma To Judge?
                </h2>
              </div>

              {/* Card content */}
              <div className="px-8 py-8">
                {/* Two column layout on desktop */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Option 1 - Image upload */}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-6 h-6 rounded border border-border/50 flex items-center justify-center">
                        <Image className="w-3 h-3 text-muted-foreground/60" />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground/60 uppercase tracking-wider">
                        Option 1
                      </span>
                    </div>
                    <UploadZone />
                  </div>

                  {/* Option 2 - Text input */}
                  <div className="flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-6 h-6 rounded border border-border/50 flex items-center justify-center">
                        <Type className="w-3 h-3 text-muted-foreground/60" />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground/60 uppercase tracking-wider">
                        Option 2
                      </span>
                    </div>
                    <TextInputArea
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      onSubmit={handleSubmit}
                      isLoading={isLoading}
                    />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Example prompts section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="mt-12 text-center"
            >
              <p className="text-xs font-mono text-muted-foreground/50 tracking-widest uppercase mb-4">
                Try Something
              </p>
              <div className="flex flex-wrap justify-center gap-3 stagger-children">
                {examplePrompts.map((prompt, index) => (
                  <SuggestionChip
                    key={index}
                    text={prompt}
                    onClick={() => handleSuggestionClick(prompt)}
                  />
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="w-full border-t border-border/30 py-6"
        >
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-mono text-muted-foreground/40 tracking-wider">
              AMMA OS v1.0.0 — CLASSIFIED
            </p>
            <p className="text-xs text-muted-foreground/30 font-light tracking-wide">
              Built to disappoint you, one choice at a time.
            </p>
          </div>
        </motion.footer>
      </div>
    </div>
  );
}
