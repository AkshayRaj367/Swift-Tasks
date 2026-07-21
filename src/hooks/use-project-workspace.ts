"use client";

// useProjectWorkspace(projectId)
//
// The single hook that powers the entire workspace. Given a projectId it:
//   1. Hydrates the per-project store from the API (project, files, messages).
//   2. If an in-flight generation exists, reattaches to its SSE stream.
//   3. Exposes actions: sendPrompt (starts generation + tails stream),
//      stopGeneration, saveFile.
//
// Because it binds to a per-project store via getProjectStore(projectId),
// switching the active projectId automatically re-binds to a DIFFERENT
// store instance with no shared state. The previous project's stream is
// detached (EventSource closed) but its server-side job keeps running.

import { useEffect, useRef, useCallback } from "react";
import { getProjectStore } from "@/store/project-stores";
import { useAppStore } from "@/store/app-store";
import type { ChatMessage, ProjectFile, ProjectSummary, StreamEvent } from "@/lib/types";
import { toast } from "@/hooks/use-toast";

interface HydrateResponse {
  project: ProjectSummary;
  files: ProjectFile[];
  messages: ChatMessage[];
  activeJob: { id: string; status: string } | null;
}

export function useProjectWorkspace(projectId: string | null) {
  const upsertProject = useAppStore((s) => s.upsertProject);
  const eventSourceRef = useRef<EventSource | null>(null);
  // Ref so hydrate() can call the latest sendPrompt without re-creating itself.
  const sendPromptRef = useRef<(p: string) => Promise<void>>(async () => {});

  // --- SSE stream attach (the heart of reattach-on-reconnect) ---
  const attachStream = useCallback((id: string, jobId: string, from: number) => {
    // Close any previous stream for THIS project.
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const url = `/api/projects/${id}/generate/stream?jobId=${encodeURIComponent(
      jobId
    )}&from=${from}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;
    const store = getProjectStore(id);

    es.onmessage = (msg) => {
      try {
        const ev: StreamEvent = JSON.parse(msg.data);
        // Guard: ignore events that don't belong to this project's store.
        if (store.getState().projectId !== id) {
          es.close();
          return;
        }
        store.getState().applyStreamEvent(ev);

        // When the job finishes, refresh files from DB (authoritative) and close.
        if (ev.type === "done") {
          es.close();
          if (eventSourceRef.current === es) eventSourceRef.current = null;
          // Reconcile files from server.
          fetch(`/api/projects/${id}`)
            .then((r) => r.json())
            .then((d: HydrateResponse) => {
              if (store.getState().projectId === id) {
                store.getState().reconcileFiles(d.files);
                store.getState().setMessages(d.messages);
                store.getState().setProject(d.project);
                upsertProject(d.project);
              }
            })
            .catch(() => {});
        }
      } catch {
        /* ignore parse errors */
      }
    };

    es.onerror = () => {
      // Browser will auto-reconnect EventSource; the server closes when done.
    };
  }, [upsertProject]);

  // --- Hydration ---
  const hydrate = useCallback(
    async (id: string) => {
      const store = getProjectStore(id);
      const state = store.getState();
      if (state.hydrated || state.hydrating) return;
      store.setState({ hydrating: true });

      try {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) throw new Error(`Failed to load project (${res.status})`);
        const data: HydrateResponse = await res.json();

        store.getState().setProject(data.project);
        store.getState().setFiles(data.files);
        store.getState().setMessages(data.messages);
        store.getState().setHydrated(true);
        upsertProject(data.project);

        // Consume a pending prompt stashed by the welcome screen.
        const pending = useAppStore.getState().pendingPrompt;
        if (pending && pending.projectId === id && pending.prompt.trim()) {
          useAppStore.getState().setPendingPrompt(null);
          setTimeout(() => sendPromptRef.current?.(pending.prompt), 50);
        }

        // Reattach to an in-flight generation if one exists.
        if (data.activeJob && data.activeJob.status === "running") {
          store.getState().setLive({
            jobId: data.activeJob.id,
            isRunning: true,
            step: "Reattaching…",
          });
          attachStream(id, data.activeJob.id, 0);
        }
      } catch (err) {
        store.getState().setHydrated(false);
        store.setState({ hydrating: false });
        toast({
          title: "Failed to load project",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      }
    },
    [upsertProject, attachStream]
  );

  // --- Send prompt (start generation + attach stream) ---
  const sendPrompt = useCallback(
    async (prompt: string) => {
      if (!projectId) return;
      const store = getProjectStore(projectId);

      // Optimistically add the user message.
      const tempUserMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: prompt,
        meta: {},
        tokens: 0,
        createdAt: new Date().toISOString(),
      };
      store.getState().addMessage(tempUserMsg);

      // Reset live state for the new run (but keep history).
      store.getState().resetLive();

      try {
        const res = await fetch(`/api/projects/${projectId}/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        if (!res.ok) {
          const err = await res.text().catch(() => "");
          let errorMsg = `Failed to start (${res.status})`;
          try {
            const parsed = JSON.parse(err);
            if (parsed?.error) errorMsg = parsed.error;
          } catch {
            if (err) errorMsg = err.slice(0, 200);
          }
          throw new Error(errorMsg);
        }
        const text = await res.text();
        let job: { id: string } | null = null;
        try {
          const parsed = JSON.parse(text);
          job = parsed?.job ?? null;
        } catch {
          throw new Error("Server returned an invalid response. Please try again.");
        }
        if (!job) {
          throw new Error("Server did not return a job ID. Please try again.");
        }
        store.getState().setLive({ jobId: job.id, isRunning: true, step: "Starting…" });
        attachStream(projectId, job.id, 0);
      } catch (err) {
        toast({
          title: "Generation failed",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
        store.getState().setLive({ isRunning: false, error: String(err) });
      }
    },
    [projectId, attachStream]
  );

  // Keep the ref current so hydrate can call the latest sendPrompt.
  useEffect(() => {
    sendPromptRef.current = sendPrompt;
  }, [sendPrompt]);

  // --- Hydrate on projectId change ---
  useEffect(() => {
    if (!projectId) return;
    hydrate(projectId);

    return () => {
      // On unmount/switch: detach THIS project's stream. The server-side job
      // keeps running; we just stop listening. Reattaching later resumes from
      // the last cursor the server has buffered.
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [projectId, hydrate]);

  // --- Stop generation ---
  const stopGeneration = useCallback(async () => {
    if (!projectId) return;
    const store = getProjectStore(projectId);

    // Optimistically update the UI to show "stopped" immediately.
    store.getState().setLive({ isRunning: false, step: "Stopping…" });

    // Close the EventStream so we stop receiving events.
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    try {
      await fetch(`/api/projects/${projectId}/stop`, { method: "POST" });
    } catch {
      /* ignore */
    }

    // Update UI to final stopped state + reconcile files from server.
    store.getState().setLive({ step: "Stopped", isRunning: false });
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const d = await res.json();
        if (store.getState().projectId === projectId) {
          store.getState().reconcileFiles(d.files);
          store.getState().setMessages(d.messages);
          store.getState().setProject(d.project);
        }
      }
    } catch {
      /* ignore */
    }
  }, [projectId]);

  // --- Manual file save (code editor edits) ---
  const saveFile = useCallback(
    async (path: string, content: string) => {
      if (!projectId) return;
      try {
        const res = await fetch(`/api/projects/${projectId}/files`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path, content }),
        });
        if (!res.ok) throw new Error("save failed");
        const { file } = await res.json();
        getProjectStore(projectId).getState().upsertFile(file);
      } catch (err) {
        toast({
          title: "Save failed",
          description: String(err),
          variant: "destructive",
        });
      }
    },
    [projectId]
  );

  return { sendPrompt, stopGeneration, saveFile, attachStream };
}
