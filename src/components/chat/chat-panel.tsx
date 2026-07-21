"use client";

// ChatPanel — conversation history + live generation log + prompt input.
// Reads from the per-project store, so it's automatically isolated.

import { getProjectStore } from "@/store/project-stores";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EXAMPLE_PROMPTS } from "@/lib/constants";
import { ChatMessageView } from "@/components/chat/chat-message";
import { GenerationLog } from "@/components/chat/generation-log";
import {
  Send,
  Square,
  Sparkles,
  ChevronDown,
  FileCode2,
  Terminal,
  Clock,
  Hash,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export function ChatPanel({
  projectId,
  sendPrompt,
  stopGeneration,
  compact,
}: {
  projectId: string;
  sendPrompt: (prompt: string) => Promise<void>;
  stopGeneration: () => Promise<void>;
  compact?: boolean;
}) {
  const useStore = getProjectStore(projectId);
  const messages = useStore((s) => s.messages);
  const live = useStore((s) => s.live);
  const project = useStore((s) => s.project);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const isRunning = live.isRunning;

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    const el = scrollRef.current?.querySelector?.("[data-radix-scroll-area-viewport]");
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, live.tokens, live.filesCompleted, live.completedFiles.length]);

  async function handleSubmit() {
    const prompt = input.trim();
    if (!prompt || isRunning) return;
    setInput("");
    await sendPrompt(prompt);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // Listen for Cmd+Enter global generate shortcut.
  useEffect(() => {
    function onGenerate() {
      const prompt = input.trim();
      if (prompt && !isRunning) {
        setInput("");
        void sendPrompt(prompt);
      }
    }
    window.addEventListener("swifttasks:generate", onGenerate);
    return () => window.removeEventListener("swifttasks:generate", onGenerate);
  }, [input, isRunning, sendPrompt]);

  // Retry last user prompt.
  async function retryLast() {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser || isRunning) return;
    await sendPrompt(lastUser.content);
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="truncate">{project?.name ?? "Chat"}</span>
        </div>
        <div className="flex items-center gap-2">
          {isRunning ? (
            <div className="flex items-center gap-2 text-[11px] text-amber-600 dark:text-amber-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
              generating…
            </div>
          ) : (
            messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-[11px] text-muted-foreground"
                onClick={retryLast}
                title="Retry last prompt"
              >
                <RotateCcw className="h-3 w-3" /> Retry
              </Button>
            )
          )}
        </div>
      </div>

      {/* Body */}
      <ScrollArea ref={scrollRef} className="flex-1">
        <div className={cn("space-y-4", compact ? "p-3" : "max-w-2xl mx-auto p-6")}>
          {messages.length === 0 && !isRunning && (
            <EmptyChatState onPick={(p) => sendPrompt(p)} compact={compact} />
          )}

          {messages.map((m) => (
            <ChatMessageView key={m.id} message={m} />
          ))}

          {/* Live generation log */}
          {(isRunning || live.tokens || live.completedFiles.length > 0 || live.error) && (
            <GenerationLog projectId={projectId} onStop={stopGeneration} />
          )}
        </div>
      </ScrollArea>

      {/* Prompt input */}
      <div className="shrink-0 border-t bg-background p-3">
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to build, or ask for a change…"
            disabled={isRunning}
            className="min-h-[60px] max-h-[200px] resize-none pr-24 text-sm"
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            {isRunning ? (
              <Button size="sm" variant="destructive" className="h-7 gap-1.5" onClick={stopGeneration}>
                <Square className="h-3 w-3 fill-current" /> Stop
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-7 gap-1.5"
                onClick={handleSubmit}
                disabled={!input.trim()}
              >
                <Send className="h-3 w-3" /> Generate
              </Button>
            )}
          </div>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-1 text-[10px] text-muted-foreground">
          <span>
            <kbd className="rounded bg-muted px-1 py-0.5 font-mono">Enter</kbd> send ·{" "}
            <kbd className="rounded bg-muted px-1 py-0.5 font-mono">⌘↵</kbd> generate ·{" "}
            <kbd className="rounded bg-muted px-1 py-0.5 font-mono">⇧↵</kbd> newline
          </span>
          {project && (
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <Hash className="h-2.5 w-2.5" />
                {project.modelConfig.model}
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyChatState({
  onPick,
  compact,
}: {
  onPick: (p: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("space-y-4", compact ? "" : "pt-8")}>
      {!compact && (
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">What should we build?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Describe your app, or pick a starting point below.
          </p>
        </div>
      )}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <ChevronDown className="h-3 w-3" /> Examples
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {EXAMPLE_PROMPTS.slice(0, 6).map((ex) => (
            <button
              key={ex.title}
              onClick={() => onPick(ex.prompt)}
              className="group rounded-md border bg-card p-2.5 text-left text-xs transition-colors hover:border-primary/40 hover:bg-accent/50"
            >
              <div className="font-medium">{ex.title}</div>
              <div className="mt-0.5 line-clamp-1 text-muted-foreground">{ex.prompt}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
