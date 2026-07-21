// Per-project state stores — the isolation boundary.
//
// THE RULE (read before editing):
//   There is NO global "current project" store. Instead we maintain a
//   registry: `Map<projectId, StoreApi>`. Each project gets its OWN
//   independent store instance with its OWN chat history, files, and
//   generation state. Switching projects = unmounting one store's
//   subscribers and mounting another's. State can NEVER bleed because the
//   stores don't share memory.
//
//   The only thing that's "global" is `activeProjectId`, which lives in the
//   app store and merely points at WHICH project store the UI should bind to.

import { create, type StoreApi, type UseBoundStore } from "zustand";
import type {
  ChatMessage,
  ProjectFile,
  ProjectSummary,
  StreamEvent,
  ModelConfig,
} from "@/lib/types";

export interface ProjectState {
  projectId: string;
  project: ProjectSummary | null;
  files: ProjectFile[];
  messages: ChatMessage[];
  /** Streaming live state — only populated while a generation is running/replaying. */
  live: {
    jobId: string | null;
    isRunning: boolean;
    tokens: string; // raw streamed text accumulator (terminal view)
    filesStreaming: Record<string, string>; // path -> partial content
    completedFiles: string[]; // paths done this run
    tokensUsed: number;
    filesCompleted: number;
    step: string;
    error: string | null;
    cursor: number; // SSE event cursor for reconnect
  };
  hydrated: boolean;
  hydrating: boolean;

  // Actions
  setProject: (p: ProjectSummary) => void;
  setFiles: (f: ProjectFile[]) => void;
  upsertFile: (f: ProjectFile) => void;
  setMessages: (m: ChatMessage[]) => void;
  addMessage: (m: ChatMessage) => void;
  setLive: (patch: Partial<ProjectState["live"]>) => void;
  applyStreamEvent: (ev: StreamEvent) => void;
  resetLive: () => void;
  setHydrated: (h: boolean) => void;
  updateModelConfig: (patch: Partial<ModelConfig>) => void;
  /** Refresh files from DB after a generation completes (authoritative). */
  reconcileFiles: (files: ProjectFile[]) => void;
}

function makeInitialLive() {
  return {
    jobId: null,
    isRunning: false,
    tokens: "",
    filesStreaming: {},
    completedFiles: [],
    tokensUsed: 0,
    filesCompleted: 0,
    step: "",
    error: null,
    cursor: 0,
  };
}

function createProjectStore(projectId: string) {
  return create<ProjectState>((set, get) => ({
    projectId,
    project: null,
    files: [],
    messages: [],
    live: makeInitialLive(),
    hydrated: false,
    hydrating: false,

    setProject: (p) => set({ project: p }),
    setFiles: (f) => set({ files: f }),
    upsertFile: (f) =>
      set((s) => {
        const idx = s.files.findIndex((x) => x.path === f.path);
        const files = idx >= 0 ? s.files.map((x) => (x.path === f.path ? f : x)) : [...s.files, f];
        return { files };
      }),
    setMessages: (m) => set({ messages: m }),
    addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
    setLive: (patch) => set((s) => ({ live: { ...s.live, ...patch } })),
    resetLive: () => set({ live: makeInitialLive() }),

    reconcileFiles: (files) => set({ files }),

    applyStreamEvent: (ev) => {
      const s = get();
      const live = s.live;
      switch (ev.type) {
        case "job":
          set({
            live: { ...live, jobId: ev.job.id, isRunning: ev.job.status === "running" },
          });
          break;
        case "token":
          set({ live: { ...live, tokens: live.tokens + ev.text } });
          break;
        case "file_start":
          set({
            live: {
              ...live,
              filesStreaming: { ...live.filesStreaming, [ev.path]: "" },
              step: `Writing ${ev.path}`,
            },
          });
          break;
        case "file_content":
          set({
            live: {
              ...live,
              filesStreaming: {
                ...live.filesStreaming,
                [ev.path]: (live.filesStreaming[ev.path] || "") + ev.chunk,
              },
            },
          });
          break;
        case "file_done": {
          // Promote the streamed file into the committed files list.
          const partial = live.filesStreaming[ev.path] || "";
          set((cur) => {
            const existing = cur.files.find((f) => f.path === ev.path);
            const version = existing ? existing.version + 1 : 1;
            const newFile: ProjectFile = {
              id: existing?.id || `live-${ev.path}`,
              path: ev.path,
              content: partial,
              version,
              lastAction: ev.action,
              updatedAt: new Date().toISOString(),
            };
            const files =
              existing != null
                ? cur.files.map((f) => (f.path === ev.path ? newFile : f))
                : [...cur.files, newFile];
            const streaming = { ...cur.live.filesStreaming };
            delete streaming[ev.path];
            return {
              files,
              live: {
                ...cur.live,
                filesStreaming: streaming,
                completedFiles: [...cur.live.completedFiles, ev.path],
                filesCompleted: cur.live.filesCompleted + 1,
                step: `Wrote ${ev.path}`,
              },
            };
          });
          break;
        }
        case "status":
          set({
            live: {
              ...live,
              tokensUsed: ev.tokensUsed,
              filesCompleted: ev.filesCompleted,
              step: ev.step,
            },
          });
          break;
        case "error":
          set({ live: { ...live, error: ev.message, isRunning: false } });
          break;
        case "done":
          set({
            live: {
              ...live,
              isRunning: ev.job.status === "running",
              tokensUsed: ev.job.tokensUsed,
              filesCompleted: ev.job.filesCompleted,
              step:
                ev.job.status === "completed"
                  ? "Done"
                  : ev.job.status === "cancelled"
                    ? "Cancelled"
                    : ev.job.status,
            },
            project: s.project
              ? {
                  ...s.project,
                  status: ev.job.status === "failed" ? "error" : "idle",
                }
              : s.project,
          });
          break;
        case "heartbeat":
          break;
      }
      // Advance the cursor for every event we processed.
      set((cur) => ({ live: { ...cur.live, cursor: cur.live.cursor + 1 } }));
    },

    setHydrated: (h) => set({ hydrated: h, hydrating: false }),
    updateModelConfig: (patch) =>
      set((s) =>
        s.project
          ? {
              project: {
                ...s.project,
                modelConfig: { ...s.project.modelConfig, ...patch },
              },
            }
          : {}
      ),
  }));
}

// --- Registry: Map<projectId, UseBoundStore<StoreApi<ProjectState>>> ---
const registry = new Map<string, UseBoundStore<StoreApi<ProjectState>>>();

export function getProjectStore(projectId: string): UseBoundStore<StoreApi<ProjectState>> {
  let store = registry.get(projectId);
  if (!store) {
    store = createProjectStore(projectId);
    registry.set(projectId, store);
  }
  return store;
}

/** Tear down a project's store to free memory after the user closes it. */
export function disposeProjectStore(projectId: string) {
  registry.delete(projectId);
}

/** Inspect the registry (for the concurrency/isolation test). */
export function listActiveProjectStores(): string[] {
  return Array.from(registry.keys());
}

/** Wipe the registry — used by tests and full reset. */
export function clearProjectStoreRegistry() {
  registry.clear();
}
