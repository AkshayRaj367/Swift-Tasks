"use client";

import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Pencil,
  FolderGit2,
  Loader2,
  CircleAlert,
  CircleDot,
  Download,
} from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { disposeProjectStore } from "@/store/project-stores";
import { motion, AnimatePresence } from "framer-motion";

const statusMeta: Record<string, { label: string; dot: string; Icon: typeof CircleDot }> = {
  empty: { label: "Empty", dot: "bg-muted-foreground/40", Icon: CircleDot },
  idle: { label: "Idle", dot: "bg-emerald-500", Icon: CircleDot },
  generating: { label: "Generating", dot: "bg-amber-500", Icon: Loader2 },
  error: { label: "Error", dot: "bg-destructive", Icon: CircleAlert },
};

export function ProjectSidebar() {
  const projects = useAppStore((s) => s.projects);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  const setProjects = useAppStore((s) => s.setProjects);
  const removeProject = useAppStore((s) => s.removeProject);
  const upsertProject = useAppStore((s) => s.upsertProject);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const { toast } = useToast();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function createProject() {
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `Project ${projects.length + 1}` }),
      });
      if (!res.ok) throw new Error("Failed");
      const { project } = await res.json();
      upsertProject(project);
      setActiveProjectId(project.id);
    } catch (err) {
      toast({ title: "Failed to create", description: String(err), variant: "destructive" });
    }
  }

  async function deleteProject(id: string) {
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      removeProject(id);
      disposeProjectStore(id);
      if (activeProjectId === id) setActiveProjectId(null);
      toast({ title: "Project deleted" });
    } catch (err) {
      toast({ title: "Failed to delete", description: String(err), variant: "destructive" });
    }
  }

  async function renameProject(id: string, name: string) {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed");
      const list = await fetch("/api/projects").then((r) => r.json());
      setProjects(list.projects);
    } catch (err) {
      toast({ title: "Failed to rename", description: String(err), variant: "destructive" });
    }
  }

  async function exportProject(id: string, name: string) {
    try {
      const res = await fetch(`/api/projects/${id}/export`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/[^a-zA-Z0-9-_]/g, "_").toLowerCase()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: `${name}.zip` });
    } catch (err) {
      toast({ title: "Export failed", description: String(err), variant: "destructive" });
    }
  }

  if (sidebarCollapsed) {
    return (
      <aside className="hidden w-12 shrink-0 flex-col items-center gap-2 border-r bg-sidebar py-3 md:flex">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={createProject} title="New project">
          <Plus className="h-4 w-4" />
        </Button>
      </aside>
    );
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <FolderGit2 className="h-3.5 w-3.5" />
          Projects
          <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
            {projects.length}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={createProject} title="New project">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-0.5 pb-4">
          {projects.length === 0 && (
            <div className="px-2 py-8 text-center">
              <p className="text-xs text-muted-foreground">No projects yet.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-1.5"
                onClick={createProject}
              >
                <Plus className="h-3.5 w-3.5" /> Create one
              </Button>
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {projects.map((p) => {
              const isActive = p.id === activeProjectId;
              const sm = statusMeta[p.status] || statusMeta.idle;
              const isRenaming = renamingId === p.id;
              return (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    "group relative flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50"
                  )}
                  onClick={() => !isRenaming && setActiveProjectId(p.id)}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-indicator"
                      className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                    />
                  )}
                  <sm.Icon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      p.status === "generating" && "animate-spin text-amber-500",
                      p.status !== "generating" && sm.dot
                    )}
                  />

                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <Input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            renameProject(p.id, renameValue.trim() || p.name);
                            setRenamingId(null);
                          } else if (e.key === "Escape") {
                            setRenamingId(null);
                          }
                        }}
                        onBlur={() => setRenamingId(null)}
                        className="h-6 px-1 text-xs"
                      />
                    ) : (
                      <div className="truncate text-xs font-medium">{p.name}</div>
                    )}
                    <div className="flex items-center gap-1.5 truncate text-[10px] text-muted-foreground">
                      <span>{p.fileCount} files</span>
                      <span>·</span>
                      <span>{formatDistanceToNow(new Date(p.updatedAt), { addSuffix: true })}</span>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem
                        onClick={() => {
                          setRenamingId(p.id);
                          setRenameValue(p.name);
                        }}
                      >
                        <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportProject(p.id, p.name)}>
                        <Download className="mr-2 h-3.5 w-3.5" /> Export as ZIP
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => deleteProject(p.id)}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </aside>
  );
}
