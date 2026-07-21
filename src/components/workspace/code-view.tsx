"use client";

// CodeView — file tree + Monaco editor.
// Features: file tree with delete/rename context menu, Monaco editor with
// save (Cmd+S), version badge, dirty indicator, fresh-file highlight,
// copy file path, and keyboard shortcut integration.

import { getProjectStore } from "@/store/project-stores";
import { useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { buildFileTree, languageForPath } from "@/lib/file-tree";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileCode2,
  Folder,
  FolderOpen,
  Save,
  FilePlus2,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  Trash2,
  Pencil,
  Copy,
  History,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { FileNode } from "@/lib/types";
import { motion } from "framer-motion";

// Monaco is a client-only, heavy dependency — load it lazily.
const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      Loading editor…
    </div>
  ),
});

export function CodeView({
  projectId,
  saveFile,
}: {
  projectId: string;
  saveFile: (path: string, content: string) => Promise<void>;
}) {
  const useStore = getProjectStore(projectId);
  const files = useStore((s) => s.files);
  const upsertFile = useStore((s) => s.upsertFile);
  const completedFiles = useStore((s) => s.live.completedFiles);
  const filesStreaming = useStore((s) => s.live.filesStreaming);
  const { toast } = useToast();

  const tree = useMemo(() => buildFileTree(files.map((f) => ({ path: f.path }))), [files]);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState("");
  const [creatingFile, setCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  // Auto-select the entry file (index.html) when files first arrive.
  useEffect(() => {
    if (!selectedPath && files.length > 0) {
      const entry =
        files.find((f) => f.path === "index.html") ||
        files.find((f) => f.path.endsWith(".html")) ||
        files[0];
      if (entry) {
        setSelectedPath(entry.path);
        setDraft(entry.content);
      }
    }
  }, [files, selectedPath]);

  // When selected file changes externally, sync the draft.
  useEffect(() => {
    if (selectedPath) {
      const f = files.find((x) => x.path === selectedPath);
      if (f && !dirty) setDraft(f.content);
    }
  }, [selectedPath, files, dirty]);

  // Listen for Cmd+S keyboard shortcut event.
  useEffect(() => {
    function onSave() {
      if (selectedPath && dirty) handleSave();
    }
    window.addEventListener("swifttasks:save-file", onSave);
    return () => window.removeEventListener("swifttasks:save-file", onSave);
  }, [selectedPath, dirty, draft]);

  const selected = files.find((f) => f.path === selectedPath);

  function selectFile(path: string) {
    if (dirty && selected) {
      void saveFile(selected.path, draft);
    }
    setSelectedPath(path);
    const f = files.find((x) => x.path === path);
    setDraft(f?.content || "");
    setDirty(false);
  }

  function toggleDir(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function handleSave() {
    if (!selectedPath) return;
    await saveFile(selectedPath, draft);
    upsertFile({
      id: selected?.id || selectedPath,
      path: selectedPath,
      content: draft,
      version: (selected?.version || 0) + 1,
      lastAction: "modified",
      updatedAt: new Date().toISOString(),
    });
    setDirty(false);
    toast({ title: "Saved", description: selectedPath });
  }

  async function handleCreateFile() {
    const name = newFileName.trim();
    if (!name) return;
    const path = name.startsWith("/") ? name.slice(1) : name;
    await saveFile(path, "");
    upsertFile({
      id: `new-${path}`,
      path,
      content: "",
      version: 1,
      lastAction: "added",
      updatedAt: new Date().toISOString(),
    });
    setSelectedPath(path);
    setDraft("");
    setDirty(false);
    setNewFileName("");
    setCreatingFile(false);
  }

  async function handleDeleteFile(path: string) {
    try {
      const res = await fetch(`/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      // Remove from store.
      const store = getProjectStore(projectId).getState();
      store.setFiles(store.files.filter((f) => f.path !== path));
      if (selectedPath === path) {
        setSelectedPath(null);
        setDraft("");
      }
      toast({ title: "Deleted", description: path });
    } catch (err) {
      toast({ title: "Delete failed", description: String(err), variant: "destructive" });
    }
  }

  async function handleRenameFile(oldPath: string) {
    const newPath = renameValue.trim();
    if (!newPath || newPath === oldPath) {
      setRenamingPath(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/projects/${projectId}/files?path=${encodeURIComponent(oldPath)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ newPath }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      const { file } = await res.json();
      const store = getProjectStore(projectId).getState();
      store.setFiles(
        store.files.map((f) => (f.path === oldPath ? { ...f, path: file.path } : f))
      );
      if (selectedPath === oldPath) setSelectedPath(file.path);
      toast({ title: "Renamed", description: `${oldPath} → ${file.path}` });
    } catch (err) {
      toast({ title: "Rename failed", description: String(err), variant: "destructive" });
    } finally {
      setRenamingPath(null);
    }
  }

  async function copyPath(path: string) {
    await navigator.clipboard.writeText(path);
    toast({ title: "Copied", description: path });
  }

  return (
    <div className="flex h-full">
      {/* File tree */}
      <div className="flex w-56 shrink-0 flex-col border-r bg-sidebar/50">
        <div className="flex items-center justify-between border-b px-2 py-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Explorer
          </span>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => setCreatingFile((v) => !v)}
              title="New file"
            >
              <FilePlus2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {creatingFile && (
          <div className="border-b p-2">
            <Input
              autoFocus
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFile();
                else if (e.key === "Escape") setCreatingFile(false);
              }}
              placeholder="path/to/file.tsx"
              className="h-7 text-xs"
            />
          </div>
        )}
        <ScrollArea className="flex-1">
          <div className="py-1 text-xs">
            {tree.length === 0 && (
              <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                No files yet. Generate something!
              </div>
            )}
            {tree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                expanded={expanded}
                toggleDir={toggleDir}
                selectedPath={selectedPath}
                onSelect={selectFile}
                freshPaths={new Set([...completedFiles, ...Object.keys(filesStreaming)])}
                onDelete={handleDeleteFile}
                onRename={(path) => {
                  setRenamingPath(path);
                  setRenameValue(path);
                }}
                renamingPath={renamingPath}
                renameValue={renameValue}
                setRenameValue={setRenameValue}
                onRenameSubmit={handleRenameFile}
                onRenameCancel={() => setRenamingPath(null)}
                onCopyPath={copyPath}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Editor */}
      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex h-9 shrink-0 items-center justify-between border-b px-3">
              <div className="flex items-center gap-2 text-xs">
                <FileCode2 className="h-3.5 w-3.5 text-primary" />
                <span className="font-mono">{selected.path}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  v{selected.version}
                </span>
                {dirty && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="h-1.5 w-1.5 rounded-full bg-amber-500"
                    title="Unsaved changes"
                  />
                )}
                {selected.lastAction === "added" && (
                  <span className="rounded bg-emerald-500/15 px-1 text-[9px] text-emerald-600 dark:text-emerald-400">
                    new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => {
                    const f = files.find((x) => x.path === selectedPath);
                    if (f) {
                      setDraft(f.content);
                      setDirty(false);
                    }
                  }}
                  disabled={!dirty}
                  title="Revert"
                >
                  <RotateCcw className="h-3 w-3" /> Revert
                </Button>
                <Button
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={handleSave}
                  disabled={!dirty}
                >
                  <Save className="h-3 w-3" /> Save
                  <kbd className="ml-1 hidden rounded bg-primary-foreground/20 px-1 py-0.5 font-mono text-[8px] sm:inline">
                    ⌘S
                  </kbd>
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <MonacoEditor
                height="100%"
                language={languageForPath(selected.path)}
                value={draft}
                theme="vs-dark"
                onChange={(v) => {
                  setDraft(v ?? "");
                  setDirty(true);
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  tabSize: 2,
                  automaticLayout: true,
                  padding: { top: 8 },
                  smoothScrolling: true,
                  cursorBlinking: "smooth",
                  renderLineHighlight: "all",
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <FileCode2 className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium">Select a file to edit</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Click any file in the tree, or create a new one with the + button above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TreeNode({
  node,
  depth,
  expanded,
  toggleDir,
  selectedPath,
  onSelect,
  freshPaths,
  onDelete,
  onRename,
  renamingPath,
  renameValue,
  setRenameValue,
  onRenameSubmit,
  onRenameCancel,
  onCopyPath,
}: {
  node: FileNode;
  depth: number;
  expanded: Set<string>;
  toggleDir: (p: string) => void;
  selectedPath: string | null;
  onSelect: (p: string) => void;
  freshPaths: Set<string>;
  onDelete: (path: string) => Promise<void>;
  onRename: (path: string) => void;
  renamingPath: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onRenameSubmit: (oldPath: string) => Promise<void>;
  onRenameCancel: () => void;
  onCopyPath: (path: string) => Promise<void>;
}) {
  const pad = 8 + depth * 12;
  if (node.type === "dir") {
    const isOpen = expanded.has(node.path);
    return (
      <div>
        <button
          className="flex w-full items-center gap-1 py-1 pr-2 text-left hover:bg-muted/40"
          style={{ paddingLeft: pad }}
          onClick={() => toggleDir(node.path)}
        >
          {isOpen ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          {isOpen ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary/70" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-primary/70" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen &&
          node.children?.map((c) => (
            <TreeNode
              key={c.path}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              toggleDir={toggleDir}
              selectedPath={selectedPath}
              onSelect={onSelect}
              freshPaths={freshPaths}
              onDelete={onDelete}
              onRename={onRename}
              renamingPath={renamingPath}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
              onCopyPath={onCopyPath}
            />
          ))}
      </div>
    );
  }
  const isSelected = node.path === selectedPath;
  const isFresh = freshPaths.has(node.path);
  const isRenaming = renamingPath === node.path;

  if (isRenaming) {
    return (
      <div className="py-0.5" style={{ paddingLeft: pad + 16 }}>
        <Input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameSubmit(node.path);
            else if (e.key === "Escape") onRenameCancel();
          }}
          onBlur={() => onRenameSubmit(node.path)}
          className="h-6 text-xs"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex w-full items-center gap-1.5 py-1 pr-1 text-left hover:bg-muted/40",
        isSelected && "bg-primary/10 text-primary"
      )}
      style={{ paddingLeft: pad + 16 }}
    >
      <button className="flex min-w-0 flex-1 items-center gap-1.5" onClick={() => onSelect(node.path)}>
        <FileCode2 className={cn("h-3.5 w-3.5 shrink-0", isFresh ? "text-emerald-500" : "text-muted-foreground")} />
        <span className="truncate">{node.name}</span>
        {isFresh && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => onCopyPath(node.path)}>
            <Copy className="mr-2 h-3 w-3" /> Copy path
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRename(node.path)}>
            <Pencil className="mr-2 h-3 w-3" /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDelete(node.path)}
          >
            <Trash2 className="mr-2 h-3 w-3" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
