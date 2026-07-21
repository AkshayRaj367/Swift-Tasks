"use client";

// CommandPalette — Cmd/Ctrl+K.
// Lets the user quickly: switch projects, create new project, open settings,
// toggle theme, toggle sidebar, and pick an example prompt.

import { useEffect, useState, useMemo } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useAppStore } from "@/store/app-store";
import { EXAMPLE_PROMPTS } from "@/lib/constants";
import { useTheme } from "next-themes";
import { useToast } from "@/hooks/use-toast";
import {
  FolderGit2,
  Plus,
  Settings,
  Sun,
  Moon,
  PanelLeft,
  Sparkles,
  Search,
  CornerDownLeft,
} from "lucide-react";

export function CommandPalette() {
  const open = useAppStore((s) => s.commandPaletteOpen);
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const projects = useAppStore((s) => s.projects);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const upsertProject = useAppStore((s) => s.upsertProject);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setPendingPrompt = useAppStore((s) => s.setPendingPrompt);
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  async function createProject(prompt?: string, name?: string) {
    const projectName = name || `Project ${projects.length + 1}`;
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: projectName }),
      });
      if (!res.ok) throw new Error("Failed");
      const { project } = await res.json();
      upsertProject(project);
      setActiveProjectId(project.id);
      if (prompt) setPendingPrompt({ projectId: project.id, prompt });
      setOpen(false);
    } catch (err) {
      toast({ title: "Failed", description: String(err), variant: "destructive" });
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search projects, run commands, or pick a template…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              setOpen(false);
              setSettingsOpen(true);
            }}
          >
            <Settings className="mr-2 h-4 w-4" />
            Open Settings (API Keys)
            <CommandShortcut>⌘,</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              toggleSidebar();
            }}
          >
            <PanelLeft className="mr-2 h-4 w-4" />
            Toggle Sidebar
            <CommandShortcut>⌘B</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setTheme(theme === "dark" ? "light" : "dark");
              setOpen(false);
            }}
          >
            {theme === "dark" ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            Toggle {theme === "dark" ? "Light" : "Dark"} Theme
          </CommandItem>
          <CommandItem onSelect={() => createProject()}>
            <Plus className="mr-2 h-4 w-4" />
            New Blank Project
          </CommandItem>
        </CommandGroup>

        {projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Switch Project">
              {projects.map((p) => (
                <CommandItem
                  key={p.id}
                  onSelect={() => {
                    setActiveProjectId(p.id);
                    setOpen(false);
                  }}
                  className={p.id === activeProjectId ? "bg-accent" : ""}
                >
                  <FolderGit2 className="mr-2 h-4 w-4" />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {p.fileCount} files
                  </span>
                  {p.id === activeProjectId && (
                    <CornerDownLeft className="ml-1 h-3 w-3 text-muted-foreground" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Templates">
          {EXAMPLE_PROMPTS.map((ex) => (
            <CommandItem
              key={ex.title}
              onSelect={() => createProject(ex.prompt, ex.title)}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              <span className="flex-1 truncate">{ex.title}</span>
              <span className="text-[10px] text-muted-foreground">template</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
