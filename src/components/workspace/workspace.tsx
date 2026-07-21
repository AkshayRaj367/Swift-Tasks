"use client";

// Workspace — binds to the active project's per-project store and renders
// either the empty/prompt state or the split chat + code/preview view.

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
    return <WelcomeScreen onPick={async (prompt) => {
      // Create a project first, then send. WelcomeScreen handles the create+send flow.
      void sendPrompt;
      // Delegate creation to the top bar's New Project button in this case.
    }} />;
  }

  return (
    <ResizableWorkspace
      projectId={projectId}
      sendPrompt={sendPrompt}
      stopGeneration={stopGeneration}
      saveFile={saveFile}
    />
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
    // Empty project — show the prompt input + example prompts.
    return (
      <ChatPanel
        projectId={projectId}
        sendPrompt={sendPrompt}
        stopGeneration={stopGeneration}
        compact={false}
      />
    );
  }

  return (
    <ResizablePanelGroup direction="horizontal" className="flex-1">
      <ResizablePanel defaultSize={38} minSize={28}>
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
