"use client";

// Workspace — binds to the active project's per-project store and renders
// either the empty/prompt state or the split chat + code/preview view.
//
// LAYOUT: The workspace fills the remaining space in <main> via flex-1.
// When content exists, it shows a resizable split: chat (left) | preview (right).
// Both panels are h-full with their own internal scroll — scrolling chat never
// moves the preview, and vice versa.

import { useAppStore } from "@/store/app-store";
import { getProjectStore } from "@/store/project-stores";
import { useProjectWorkspace } from "@/hooks/use-project-workspace";
import { ChatPanel } from "@/components/chat/chat-panel";
import { WorkspacePanel } from "@/components/workspace/workspace-panel";
import { WelcomeScreen } from "@/components/welcome-screen";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

export function Workspace({ projectId }: { projectId: string | null }) {
  // Always call the hook (rules of hooks). The hook is a no-op when projectId is null.
  const { sendPrompt, stopGeneration, saveFile } = useProjectWorkspace(projectId);

  if (!projectId) {
    return <WelcomeScreen onPick={async () => { void sendPrompt; }} />;
  }

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <ResizableWorkspace
        projectId={projectId}
        sendPrompt={sendPrompt}
        stopGeneration={stopGeneration}
        saveFile={saveFile}
      />
    </div>
  );
}

function ResizableWorkspace({
  projectId,
  sendPrompt,
  stopGeneration,
  saveFile,
}: {
  projectId: string;
  sendPrompt: (p: string) => Promise<void>;
  stopGeneration: () => Promise<void>;
  saveFile: (path: string, content: string) => Promise<void>;
}) {
  // Subscribe to this project's store to know whether we're in the "prompt" or "split" phase.
  const useStore = getProjectStore(projectId);
  const messages = useStore((s) => s.messages);
  const files = useStore((s) => s.files);
  const isRunning = useStore((s) => s.live.isRunning);
  const hasContent = messages.length > 0 || files.length > 0 || isRunning;

  if (!hasContent) {
    // Empty project — show the prompt input + example prompts, filling the screen.
    return (
      <ChatPanel
        projectId={projectId}
        sendPrompt={sendPrompt}
        stopGeneration={stopGeneration}
        compact={false}
      />
    );
  }

  // Split view: chat (left) | code/preview (right).
  // Both panels are h-full with internal scroll — they never push each other.
  return (
    <ResizablePanelGroup direction="horizontal" className="h-full flex-1">
      <ResizablePanel defaultSize={38} minSize={24}>
        <ChatPanel
          projectId={projectId}
          sendPrompt={sendPrompt}
          stopGeneration={stopGeneration}
          compact
        />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={62} minSize={30}>
        <WorkspacePanel projectId={projectId} saveFile={saveFile} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
