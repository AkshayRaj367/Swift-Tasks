"use client";

// WelcomeScreen — shown when no project is selected. Offers example prompts
// that create a project and immediately start generation.
// Features an animated aurora gradient background and polished card design.

import { useAppStore } from "@/store/app-store";
import { EXAMPLE_PROMPTS, PROVIDERS } from "@/lib/constants";
import {
  Sparkles,
  ArrowRight,
  Zap,
  ShieldCheck,
  Boxes,
  Plus,
  Search,
  Keyboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

const EXAMPLE_ICONS: Record<string, string> = {
  " calc": "🧮",
  " list": "📋",
  " clock": "⏱️",
  " palette": "🎨",
  " weather": "🌤️",
  " markdown": "📝",
};

export function WelcomeScreen({ onPick }: { onPick: (prompt: string) => void }) {
  const upsertProject = useAppStore((s) => s.upsertProject);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setPendingPrompt = useAppStore((s) => s.setPendingPrompt);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const apiKeys = useAppStore((s) => s.apiKeys);
  const projects = useAppStore((s) => s.projects);
  const { toast } = useToast();
  const [creating, setCreating] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  async function startWithPrompt(prompt: string, name: string) {
    setCreating(prompt);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      const { project } = await res.json();
      upsertProject(project);
      setActiveProjectId(project.id);
      if (prompt.trim()) {
        setPendingPrompt({ projectId: project.id, prompt });
      }
      onPick(prompt);
    } catch (err) {
      toast({
        title: "Failed to start",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setCreating(null);
    }
  }

  const hasKey = apiKeys.some((k) => k.isValid && k.provider !== "platform");

  return (
    <div className="aurora-bg flex flex-1 items-center justify-center overflow-y-auto bg-gradient-to-br from-background via-background to-muted/20 p-6">
      <div className="mx-auto w-full max-w-5xl">
        {/* Hero */}
        <motion.div
          initial={mounted ? { opacity: 0, y: 20 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-10 text-center"
        >
          <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-xl shadow-primary/20">
            <Sparkles className="h-8 w-8" />
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Describe it.{" "}
            <span className="gradient-text">Watch it get built.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-sm text-muted-foreground sm:text-base">
            Swift Tasks turns a natural-language description into a complete, runnable web app —
            streaming the code live as it&apos;s written, with an instant sandboxed preview.
            Bring your own key, or use the built-in demo model.
          </p>
        </motion.div>

        {/* Feature pills */}
        <motion.div
          initial={mounted ? { opacity: 0, y: 20 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <FeaturePill
            icon={<Zap className="h-4 w-4" />}
            title="Live token streaming"
            desc="Watch the code typed token-by-token."
            color="from-amber-500/20 to-amber-500/5"
          />
          <FeaturePill
            icon={<Boxes className="h-4 w-4" />}
            title="Isolated projects"
            desc="Each project keeps its own context."
            color="from-emerald-500/20 to-emerald-500/5"
          />
          <FeaturePill
            icon={<ShieldCheck className="h-4 w-4" />}
            title="BYOK, encrypted"
            desc="Your keys, AES-256 at rest."
            color="from-rose-500/20 to-rose-500/5"
          />
        </motion.div>

        {/* Quick actions bar */}
        <motion.div
          initial={mounted ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mb-6 flex flex-wrap items-center justify-center gap-2"
        >
          {!hasKey && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs">
              <span className="text-amber-600 dark:text-amber-400">
                Using the free demo model
              </span>
              <Button variant="outline" size="sm" className="h-6 gap-1 text-xs" onClick={() => setSettingsOpen(true)}>
                <ShieldCheck className="h-3 w-3" /> Add Key
              </Button>
            </div>
          )}
          {projects.length > 0 && (
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setCommandPaletteOpen(true)}>
              <Search className="h-3 w-3" /> Search projects
              <kbd className="ml-1 rounded bg-muted px-1 py-0.5 font-mono text-[9px]">⌘K</kbd>
            </Button>
          )}
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Keyboard className="h-3 w-3" />
            <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[9px]">⌘K</kbd>
            command palette
          </div>
        </motion.div>

        {/* Example prompts */}
        <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Start from a template</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EXAMPLE_PROMPTS.map((ex, i) => (
            <motion.button
              key={ex.title}
              initial={mounted ? { opacity: 0, y: 20 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.05, ease: "easeOut" }}
              whileHover={{ y: -2 }}
              onClick={() => startWithPrompt(ex.prompt, ex.title)}
              disabled={creating !== null}
              className="group relative flex flex-col gap-1.5 overflow-hidden rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-lg disabled:opacity-50"
            >
              {/* hover gradient overlay */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="relative flex items-center justify-between">
                <span className="text-2xl">{EXAMPLE_ICONS[ex.icon] || "✨"}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
              <div className="relative mt-1 text-sm font-semibold">{ex.title}</div>
              <p className="relative line-clamp-2 text-xs text-muted-foreground">{ex.prompt}</p>
            </motion.button>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              const name = `Project ${useAppStore.getState().projects.length + 1}`;
              startWithPrompt("", name);
            }}
            disabled={creating !== null}
          >
            <Plus className="h-3.5 w-3.5" /> Or start with a blank project
          </Button>
        </div>
      </div>
    </div>
  );
}

function FeaturePill({
  icon,
  title,
  desc,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${color} p-3.5`}>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background/80 text-primary shadow-sm">
          {icon}
        </div>
        <div>
          <div className="text-xs font-semibold">{title}</div>
          <div className="text-[11px] text-muted-foreground">{desc}</div>
        </div>
      </div>
    </div>
  );
}
