"use client";

// WorkspacePanel — code editor + live preview with view-mode toggle.
// Tabs: Code | Preview | Split
// Reads the per-project file list from the store.

import { useState } from "react";
import { getProjectStore } from "@/store/project-stores";
import { CodeView } from "@/components/workspace/code-view";
import { PreviewView } from "@/components/workspace/preview-view";
import { Button } from "@/components/ui/button";
import { Code2, Eye, Columns2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

type ViewMode = "code" | "preview" | "split";

export function WorkspacePanel({
  projectId,
  saveFile,
}: {
  projectId: string;
  saveFile: (path: string, content: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<ViewMode>("preview");
  const useStore = getProjectStore(projectId);
  const files = useStore((s) => s.files);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* View mode toggle */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-2">
        <div className="flex items-center gap-0.5 rounded-md bg-muted/40 p-0.5">
          <ModeButton active={mode === "code"} onClick={() => setMode("code")} icon={<Code2 className="h-3.5 w-3.5" />} label="Code" />
          <ModeButton active={mode === "preview"} onClick={() => setMode("preview")} icon={<Eye className="h-3.5 w-3.5" />} label="Preview" />
          <ModeButton active={mode === "split"} onClick={() => setMode("split")} icon={<Columns2 className="h-3.5 w-3.5" />} label="Split" />
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="tabular-nums">{files.length} files</span>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1">
        {mode === "code" && <CodeView projectId={projectId} saveFile={saveFile} />}
        {mode === "preview" && <PreviewView projectId={projectId} />}
        {mode === "split" && (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={50} minSize={25}>
              <CodeView projectId={projectId} saveFile={saveFile} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={25}>
              <PreviewView projectId={projectId} />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-7 gap-1.5 px-2 text-xs",
        active && "bg-background text-foreground shadow-sm"
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
