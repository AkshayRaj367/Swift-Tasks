"use client";

import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { User, Sparkles, AlertTriangle, FileCode2, Copy, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { motion } from "framer-motion";

export function ChatMessageView({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isError = message.content.startsWith("⚠️");
  const isCancelled = message.content === "_(generation cancelled)_";
  const files = message.meta?.files as string[] | undefined;
  const [copied, setCopied] = useState(false);

  async function copyContent() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("group flex gap-3", isUser && "flex-row-reverse")}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md shadow-sm",
          isUser
            ? "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground"
            : isError
              ? "bg-destructive/15 text-destructive"
              : "bg-gradient-to-br from-muted to-muted/60 text-muted-foreground"
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : isError ? (
          <AlertTriangle className="h-3.5 w-3.5" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
      </div>
      <div className={cn("min-w-0 flex-1 space-y-1", isUser && "flex flex-col items-end")}>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="font-medium">{isUser ? "You" : "Assistant"}</span>
          <span>·</span>
          <span>{formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}</span>
          {!isUser && !isCancelled && (
            <button
              onClick={copyContent}
              className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
              title="Copy"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            </button>
          )}
        </div>
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            isUser
              ? "bg-primary text-primary-foreground"
              : isError
                ? "bg-destructive/10 text-destructive"
                : isCancelled
                  ? "bg-muted/50 text-muted-foreground italic"
                  : "bg-muted"
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        {files && files.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {Array.from(new Set(files)).map((f) => (
              <span
                key={f}
                className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                <FileCode2 className="h-2.5 w-2.5" />
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
