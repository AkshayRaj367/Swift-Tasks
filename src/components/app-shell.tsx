"use client";

// AppShell — the top-level orchestrator.
//
// Layout (sticky-footer compliant):
//   <div min-h-screen flex flex-col>
//     <header> TopBar </header>
//     <main flex-1 flex overflow-hidden>
//       <ProjectSidebar />
//       <Workspace />
//     </main>
//     <footer> StatusBar </footer>
//   </div>
//
// The Workspace binds to the active project's per-project store via
// useProjectWorkspace(activeProjectId). Switching projects re-binds to a
// different store instance — no state leaks.

import { useEffect } from "react";
import { TopBar } from "@/components/topbar";
import { ProjectSidebar } from "@/components/sidebar/project-sidebar";
import { Workspace } from "@/components/workspace/workspace";
import { StatusBar } from "@/components/status-bar";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { CommandPalette } from "@/components/command-palette";
import { useAppStore } from "@/store/app-store";
import { useToast } from "@/hooks/use-toast";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

export function AppShell() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setProjects = useAppStore((s) => s.setProjects);
  const setApiKeys = useAppStore((s) => s.setApiKeys);
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen);
  const { toast } = useToast();

  // Global keyboard shortcuts (Cmd+K, Cmd+B, Cmd+S, etc.)
  useKeyboardShortcuts();

  // Initial boot: load project list + api keys.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [projectsRes, keysRes] = await Promise.all([
          fetch("/api/projects"),
          fetch("/api/settings/api-keys"),
        ]);
        if (cancelled) return;
        if (projectsRes.ok) {
          const { projects } = await projectsRes.json();
          setProjects(projects);
          // Auto-select the most recent project if any.
          // (Active selection deferred to sidebar click / new project.)
        } else {
          setProjects([]);
        }
        if (keysRes.ok) {
          const { keys } = await keysRes.json();
          setApiKeys(keys);
        } else {
          setApiKeys([]);
        }
      } catch (err) {
        if (!cancelled) {
          setProjects([]);
          setApiKeys([]);
          toast({
            title: "Failed to initialize",
            description: String(err),
            variant: "destructive",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setProjects, setApiKeys, toast]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar />
      <main className="flex flex-1 overflow-hidden">
        <ProjectSidebar />
        <Workspace key={activeProjectId ?? "empty"} projectId={activeProjectId} />
      </main>
      <StatusBar />
      {settingsOpen && <SettingsDialog />}
      {commandPaletteOpen && <CommandPalette />}
    </div>
  );
}
