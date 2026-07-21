"use client";

import { Button } from "@/components/ui/button";
import { Plus, Settings, Sparkles, Sun, Moon, Search, PanelLeft, Download, Rocket, Lock } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useTheme } from "next-themes";
import { ModelSelector } from "@/components/model-selector";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { getProjectStore } from "@/store/project-stores";

export function TopBar() {
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setDeployOpen = useAppStore((s) => s.setDeployOpen);
  const setVaultOpen = useAppStore((s) => s.setVaultOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const projects = useAppStore((s) => s.projects);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const upsertProject = useAppStore((s) => s.upsertProject);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => setMounted(true), []);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  async function createProject() {
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `Project ${projects.length + 1}` }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      const { project } = await res.json();
      upsertProject(project);
      setActiveProjectId(project.id);
      toast({ title: "Project created", description: project.name });
    } catch (err) {
      toast({
        title: "Failed to create project",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  async function exportProject() {
    if (!activeProjectId) return;
    try {
      const res = await fetch(`/api/projects/${activeProjectId}/export`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeProject?.name?.replace(/[^a-zA-Z0-9-_]/g, "_").toLowerCase() || "project"}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Project exported", description: `${activeProject?.name}.zip` });
    } catch (err) {
      toast({ title: "Export failed", description: String(err), variant: "destructive" });
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={toggleSidebar}
        title="Toggle sidebar (⌘B)"
      >
        <PanelLeft className="h-4 w-4" />
      </Button>

      {/* Brand */}
      <div className="flex items-center gap-2 pr-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-sm">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="hidden text-sm font-semibold tracking-tight sm:inline">
          Swift Tasks
        </span>
      </div>

      <div className="mx-1 h-5 w-px bg-border" />

      {activeProject ? <ModelSelector /> : <span className="text-sm text-muted-foreground">No project selected</span>}

      <div className="ml-auto flex items-center gap-1">
        {/* Command palette search */}
        <Button
          variant="ghost"
          size="sm"
          className="hidden gap-1.5 text-muted-foreground md:flex"
          onClick={() => setCommandPaletteOpen(true)}
          title="Command palette (⌘K)"
        >
          <Search className="h-3.5 w-3.5" />
          <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[9px]">⌘K</kbd>
        </Button>

        {/* Deploy */}
        {activeProject && (
          <Button
            variant="default"
            size="sm"
            className="gap-1.5 bg-gradient-to-r from-primary to-primary/80 shadow-sm"
            onClick={() => setDeployOpen(true)}
            title="Deploy online"
          >
            <Rocket className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Deploy</span>
          </Button>
        )}

        {/* Export */}
        {activeProject && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={exportProject}
            title="Export as ZIP"
          >
            <Download className="h-4 w-4" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={createProject}
          disabled={creating}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New</span>
        </Button>

        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setVaultOpen(true)}
          title="Secure Vault"
        >
          <Lock className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setSettingsOpen(true)}
          title="API Keys & Settings (⌘,)"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
