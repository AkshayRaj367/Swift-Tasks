"use client";

// GenerationLog — the live "watch the code get written" panel.
// Shows: current step, progress bar, tokens used, files completed, elapsed time,
// per-file collapsible diffs, and the raw token stream (terminal view).

import { getProjectStore } from "@/store/project-stores";
import { useEffect, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Terminal,
  FileCode2,
  ChevronRight,
  Check,
  Loader2,
  AlertTriangle,
  Hash,
  Clock,
  Files,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export function GenerationLog({
  projectId,
  onStop,
}: {
  projectId: string;
  onStop: () => void;
}) {
  const useStore = getProjectStore(projectId);
  const live = useStore((s) => s.live);
  const [elapsed, setElapsed] = useState(0);
  const [showTerminal, setShowTerminal] = useState(true);

  // Elapsed timer.
  useEffect(() => {
    if (!live.isRunning) return;
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(id);
  }, [live.isRunning]);

  const streamingPaths = Object.keys(live.filesStreaming);

  // Rough progress estimate: based on tokens (cap at ~4000 tokens for a typical gen).
  const progress = Math.min(95, Math.round((live.tokensUsed / 4000) * 100));
  const isDone = !live.isRunning && !live.error;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="overflow-hidden rounded-lg border bg-card shadow-sm"
    >
      {/* Header / status bar */}
      <div className="border-b bg-muted/30 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md",
                live.error
                  ? "bg-destructive/15 text-destructive"
                  : live.isRunning
                    ? "bg-amber-500/15 text-amber-500"
                    : "bg-emerald-500/15 text-emerald-500"
              )}
            >
              {live.error ? (
                <AlertTriangle className="h-4 w-4" />
              ) : live.isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium">
                {live.error
                  ? "Generation failed"
                  : live.isRunning
                    ? live.step || "Generating…"
                    : isDone
                      ? `Completed · ${live.filesCompleted} file${live.filesCompleted === 1 ? "" : "s"}`
                      : "Ready"}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <Stat icon={<Clock className="h-2.5 w-2.5" />} value={`${elapsed}s`} />
                <Stat icon={<Hash className="h-2.5 w-2.5" />} value={`~${live.tokensUsed}`} />
                <Stat icon={<Files className="h-2.5 w-2.5" />} value={live.filesCompleted} />
              </div>
            </div>
          </div>
          {live.isRunning && (
            <Button size="sm" variant="destructive" className="h-7 gap-1 px-2 text-[11px]" onClick={onStop}>
              <Square className="h-2.5 w-2.5 fill-current" /> Stop
            </Button>
          )}
        </div>

        {/* Progress bar */}
        {live.isRunning && (
          <div className="mt-2 space-y-1">
            <Progress value={progress} className="h-1" />
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>streaming…</span>
              <span>{progress}%</span>
            </div>
          </div>
        )}
      </div>

      {live.error && (
        <div className="border-b bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="flex-1 break-words">{live.error}</span>
          </div>
        </div>
      )}

      {/* Completed files */}
      {live.completedFiles.length > 0 && (
        <div className="border-b">
          <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Files written ({live.completedFiles.length})
          </div>
          <div className="flex flex-wrap gap-1 px-3 pb-2">
            {live.completedFiles.map((p) => (
              <motion.div
                key={p}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                <Badge variant="secondary" className="gap-1 font-mono text-[10px]">
                  <Check className="h-2.5 w-2.5 text-emerald-500" />
                  {p}
                </Badge>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* In-progress files */}
      {streamingPaths.map((path) => (
        <Collapsible key={path} defaultOpen className="border-b last:border-0">
          <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40">
            <ChevronRight className="h-3 w-3 transition-transform [[data-state=open]>&]:rotate-90" />
            <FileCode2 className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono">{path}</span>
            <Loader2 className="ml-auto h-3 w-3 animate-spin text-amber-500" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="max-h-48 overflow-auto bg-muted/20 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
              <code>{live.filesStreaming[path] || "(empty)"}</code>
            </pre>
          </CollapsibleContent>
        </Collapsible>
      ))}

      {/* Raw token terminal */}
      {live.tokens && (
        <Collapsible open={showTerminal} onOpenChange={setShowTerminal}>
          <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/40">
            <Terminal className="h-3 w-3" />
            Token stream
            <span className="ml-auto font-normal normal-case text-muted-foreground/60">
              {live.tokens.length.toLocaleString()} chars
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="max-h-64 overflow-auto bg-zinc-950 px-3 py-2 font-mono text-[11px] leading-relaxed text-emerald-400/90">
              <code className="whitespace-pre-wrap break-words">{live.tokens.slice(-4000)}</code>
              {live.isRunning && <span className="terminal-cursor" />}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}
    </motion.div>
  );
}

function Stat({
  icon,
  value,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-0.5 tabular-nums">
      {icon}
      {value}
    </span>
  );
}
