"use client";

// StatusBar — sticky footer showing global + active-project status.
// (Sticky-footer rule: sits at the bottom via the flex column layout.)

import { useAppStore } from "@/store/app-store";
import { getProjectStore } from "@/store/project-stores";
import { Sparkles, ShieldCheck, Activity, Keyboard, Command } from "lucide-react";
import { useEffect, useState } from "react";

export function StatusBar() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const apiKeys = useAppStore((s) => s.apiKeys);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const [cryptoOk, setCryptoOk] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setCryptoOk(d.crypto))
      .catch(() => setCryptoOk(false));
  }, []);

  let status: string = "Ready";
  let isRunning = false;
  if (activeProjectId) {
    try {
      const st = getProjectStore(activeProjectId).getState();
      if (st.live.isRunning) {
        isRunning = true;
        status = `Generating: ${st.live.step || "…"} · ${st.live.filesCompleted} files · ~${st.live.tokensUsed} tokens`;
      } else if (st.live.error) {
        status = `Error: ${st.live.error}`;
      } else if (st.project) {
        status = `${st.project.name} · ${st.files.length} files · ${st.messages.length} messages`;
      }
    } catch {
      /* store not ready */
    }
  }

  const defaultKey = apiKeys.find((k) => k.isDefault);

  return (
    <footer className="mt-auto flex h-7 shrink-0 items-center justify-between border-t bg-background px-3 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-primary" />
          Swift Tasks
        </span>
        <span className="hidden items-center gap-1 sm:flex">
          <Activity className={isRunning ? "h-3 w-3 animate-pulse text-amber-500" : "h-3 w-3 text-emerald-500"} />
          <span className="max-w-[400px] truncate">{status}</span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          className="hidden items-center gap-1 transition-colors hover:text-foreground md:flex"
          onClick={() => setCommandPaletteOpen(true)}
          title="Command palette"
        >
          <Command className="h-3 w-3" />
          <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[9px]">⌘K</kbd>
        </button>
        <span className="hidden items-center gap-1 md:flex">
          <ShieldCheck className={cryptoOk ? "h-3 w-3 text-emerald-500" : "h-3 w-3 text-muted-foreground"} />
          {cryptoOk ? "encryption ok" : "encryption?"}
        </span>
        {defaultKey && (
          <span className="hidden items-center gap-1 md:flex">
            {defaultKey.provider} · {defaultKey.model}
          </span>
        )}
      </div>
    </footer>
  );
}
