import { AnimatePresence, motion } from "framer-motion";
import { Upload, Type, ChevronRight, Image as ImageIcon, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AmmaLoading } from "@/components/AmmaLoading";
import { VerdictReport } from "@/components/VerdictReport";
import { Button } from "@/components/ui/button";
import {
  ammaErrorFromCode,
  fileToDownscaledDataUrl,
  submitToAmma,
  validateImageFile,
  type AmmaJudgment,
  type AmmaSubmitError,
} from "@/lib/amma";
import { cn } from "@/lib/utils";

type AmmaView = "input" | "loading" | "result";

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

// Upload zone component — real file selection with preview
function UploadZone({
  selectedFile,
  previewUrl,
  onFileSelect,
  onClear,
  disabled,
}: {
  selectedFile: File | null;
  previewUrl: string | null;
  onFileSelect: (file: File) => void;
  onClear: () => void;
  disabled: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFileSelect(file);
  };

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const hasFile = selectedFile !== null && previewUrl !== null;

  return (
    <motion.div
      className={cn(
        "relative flex flex-col items-center justify-center gap-4 p-12 rounded-xl border-2 border-border/40 bg-card/60 backdrop-blur-sm transition-all cursor-pointer",
        "group hover:border-primary/40 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5",
        "focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-ring/30",
        isDragging && "border-primary/60 bg-primary/8 scale-[1.01]",
        hasFile && "border-primary/40",
        disabled && "opacity-60 cursor-not-allowed"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      whileHover={disabled ? undefined : { scale: 1.005 }}
      whileTap={disabled ? undefined : { scale: 0.995 }}
    >
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelect(file);
          e.target.value = "";
        }}
      />

      {/* Decorative corner markers */}
      <div className="absolute top-3 left-3 w-4 h-4 border-t border-l border-primary/50" />
      <div className="absolute top-3 right-3 w-4 h-4 border-t border-r border-primary/50" />
      <div className="absolute bottom-3 left-3 w-4 h-4 border-b border-l border-primary/50" />
      <div className="absolute bottom-3 right-3 w-4 h-4 border-b border-r border-primary/50" />

      {hasFile ? (
        <>
          {/* Image preview */}
          <div className="relative w-full max-w-[240px]">
            <img
              src={previewUrl!}
              alt={selectedFile!.name}
              className="w-full h-36 object-cover rounded-lg border border-border/50"
            />
            <button
              type="button"
              aria-label="Remove image"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-card border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-center max-w-full px-2">
            <p className="text-sm text-foreground truncate font-mono">
              {selectedFile!.name}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1 font-mono tracking-wide">
              Ready for judgment
            </p>
          </div>
        </>
      ) : (
        <>
          {/* Upload icon */}
          <motion.div
            className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center ring-1 ring-primary/20"
            whileHover={disabled ? undefined : { scale: 1.1, rotate: 5 }}
            whileTap={disabled ? undefined : { scale: 0.95 }}
          >
            <Upload className="w-8 h-8 text-primary" />
          </motion.div>

          {/* Text content */}
          <div>
            <p className="text-lg font-medium text-foreground">
              Upload Something
            </p>
            <p className="text-xs text-muted-foreground/60 mt-3 font-mono tracking-wide">
              Upload a photo
            </p>
          </div>

          {/* Subtle hint text */}
          <p className="text-xs text-muted-foreground/60 font-mono">
            Drag & drop or click to browse
          </p>
        </>
      )}

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
        "group relative px-4 py-2 rounded-md border border-border/50 bg-card/40 text-muted-foreground",
        "text-sm transition-all duration-200",
        "hover:border-primary/40 hover:bg-primary/8 hover:shadow-lg hover:shadow-primary/10 hover:text-foreground",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
        "hover:scale-[1.03] hover:-translate-y-0.5"
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Decorative line */}
      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

      <span className="relative z-10">{text}</span>
    </motion.button>
  );
}

// Main landing component
export default function Landing() {
  const [view, setView] = useState<AmmaView>("input");
  const [textInput, setTextInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [judgment, setJudgment] = useState<AmmaJudgment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const examplePrompts = [
    "My new gaming PC",
    "This outfit",
    "My exam marks",
    "My ₹80,000 purchase",
    "My bedroom",
    "Should I buy this?",
  ];

  const clearFile = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const handleFileSelect = (file: File) => {
    const error = validateImageFile(file);
    if (error) {
      toast.error(error);
      return;
    }
    clearFile();
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const submitText = () => {
    if (!textInput.trim()) {
      toast.error(ammaErrorFromCode("EMPTY_INPUT"));
      return;
    }
    runJudgment({ mode: "text", text: textInput });
  };

  const submitImage = () => {
    if (!selectedFile) {
      toast.error(ammaErrorFromCode("INVALID_IMAGE"));
      return;
    }
    const error = validateImageFile(selectedFile);
    if (error) {
      toast.error(error);
      clearFile();
      return;
    }
    runJudgment({ mode: "image", file: selectedFile, text: textInput.trim() || undefined });
  };

  const runJudgment = async (submission: Parameters<typeof submitToAmma>[0]) => {
    setIsSubmitting(true);
    setView("loading");
    try {
      const result = await submitToAmma(submission);
      setJudgment(result);
      // Hold the final loading stage briefly so the sequence completes on screen.
      await new Promise((r) => setTimeout(r, 600));
      setView("result");
    } catch (err) {
      const ammaErr = err as AmmaSubmitError;
      toast.error(ammaErr?.message ?? ammaErrorFromCode("SERVER_ERROR"), { duration: 7000 });
      setView("input");
    } finally {
      setIsSubmitting(false);
    }
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

        <AnimatePresence mode="wait">
          {view === "input" && (
            <motion.div
              key="input-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-center px-4 py-16"
            >
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
                  <p className="text-xs text-muted-foreground/80 mt-3 italic tracking-wide max-w-md mx-auto">
                    She already has an opinion.
                  </p>
                </motion.div>

                {/* Main input card */}
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.2 }}
                  className="bg-card/85 backdrop-blur-md rounded-2xl border border-border/60 shadow-xl shadow-black/20"
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
                            <ImageIcon className="w-3 h-3 text-muted-foreground/60" />
                          </div>
                          <span className="text-xs font-mono text-foreground/80 uppercase tracking-wider">
                            SHOW AMMA
                          </span>
                        </div>
                        <UploadZone
                          selectedFile={selectedFile}
                          previewUrl={previewUrl}
                          onFileSelect={handleFileSelect}
                          onClear={clearFile}
                          disabled={isSubmitting}
                        />
                        {/* Submit image button — appears once a photo is chosen */}
                        <Button
                          onClick={submitImage}
                          disabled={!selectedFile || isSubmitting}
                          className={cn(
                            "mt-4 w-full h-12 text-base font-medium tracking-wide",
                            "bg-primary hover:bg-primary/90 text-primary-foreground",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            "transition-all duration-300",
                            "shadow-lg shadow-primary/20",
                            "group"
                          )}
                        >
                          <span className="flex items-center gap-2">
                            ASK AMMA
                            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                          </span>
                        </Button>
                      </div>

                      {/* Option 2 - Text input */}
                      <div className="flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-6 h-6 rounded border border-border/50 flex items-center justify-center">
                            <Type className="w-3 h-3 text-muted-foreground/60" />
                          </div>
                          <span className="text-xs font-mono text-foreground/80 uppercase tracking-wider">
                            TELL AMMA
                          </span>
                        </div>
                        <TextInputArea
                          value={textInput}
                          onChange={(e) => setTextInput(e.target.value)}
                          onSubmit={submitText}
                          isLoading={isSubmitting}
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
                  <p className="text-xs font-mono text-muted-foreground/60 tracking-widest uppercase mb-4">
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
            </motion.div>
          )}

          {view === "loading" && (
            <motion.div
              key="loading-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex"
            >
              <AmmaLoading />
            </motion.div>
          )}

          {view === "result" && judgment && (
            <motion.div
              key="result-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex"
            >
              <VerdictReport
                judgment={judgment}
                onJudgeSomethingElse={() => {
                  setJudgment(null);
                  setView("input");
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

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
