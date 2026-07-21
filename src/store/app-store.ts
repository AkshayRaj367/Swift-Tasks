// Global app store.
//
// CRITICAL: this store holds ONLY app-level concerns — the active project id,
// the sidebar list of projects, and settings UI flags. It MUST NOT hold any
// per-project content (chat messages, files, generation state). All of that
// lives in per-project stores keyed by projectId. Keeping this boundary is
// what makes project switching leak-free.

import { create } from "zustand";
import type { ApiKeyConfigPublic, ProjectSummary } from "@/lib/types";

interface AppState {
  // --- Project list (sidebar) ---
  projects: ProjectSummary[];
  projectsLoading: boolean;
  activeProjectId: string | null;
  setProjects: (p: ProjectSummary[]) => void;
  setActiveProjectId: (id: string | null) => void;
  upsertProject: (p: ProjectSummary) => void;
  removeProject: (id: string) => void;
  setProjectsLoading: (b: boolean) => void;

  // --- BYOK settings ---
  apiKeys: ApiKeyConfigPublic[];
  keysLoading: boolean;
  setApiKeys: (k: ApiKeyConfigPublic[]) => void;
  upsertApiKey: (k: ApiKeyConfigPublic) => void;
  removeApiKey: (id: string) => void;

  // --- UI ---
  settingsOpen: boolean;
  setSettingsOpen: (b: boolean) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (b: boolean) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (b: boolean) => void;
  deployOpen: boolean;
  setDeployOpen: (b: boolean) => void;
  vaultOpen: boolean;
  setVaultOpen: (b: boolean) => void;

  // --- Pending prompt (welcome-screen → new-project handoff) ---
  // When a user picks an example from the welcome screen, we create a project,
  // set it active, and stash the prompt here. The workspace consumes & clears
  // it once the new project has hydrated.
  pendingPrompt: { projectId: string; prompt: string } | null;
  setPendingPrompt: (p: { projectId: string; prompt: string } | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  projects: [],
  projectsLoading: true,
  activeProjectId: null,
  setProjects: (p) => set({ projects: p, projectsLoading: false }),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
  upsertProject: (p) =>
    set((s) => {
      const idx = s.projects.findIndex((x) => x.id === p.id);
      const projects =
        idx >= 0 ? s.projects.map((x) => (x.id === p.id ? p : x)) : [p, ...s.projects];
      return { projects };
    }),
  removeProject: (id) =>
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
    })),
  setProjectsLoading: (b) => set({ projectsLoading: b }),

  apiKeys: [],
  keysLoading: true,
  setApiKeys: (k) => set({ apiKeys: k, keysLoading: false }),
  upsertApiKey: (k) =>
    set((s) => {
      const idx = s.apiKeys.findIndex((x) => x.id === k.id);
      return {
        apiKeys: idx >= 0 ? s.apiKeys.map((x) => (x.id === k.id ? k : x)) : [...s.apiKeys, k],
      };
    }),
  removeApiKey: (id) => set((s) => ({ apiKeys: s.apiKeys.filter((k) => k.id !== id) })),

  settingsOpen: false,
  setSettingsOpen: (b) => set({ settingsOpen: b }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (b) => set({ sidebarCollapsed: b }),
  commandPaletteOpen: false,
  setCommandPaletteOpen: (b) => set({ commandPaletteOpen: b }),
  deployOpen: false,
  setDeployOpen: (b) => set({ deployOpen: b }),
  vaultOpen: false,
  setVaultOpen: (b) => set({ vaultOpen: b }),

  pendingPrompt: null,
  setPendingPrompt: (p) => set({ pendingPrompt: p }),
}));
