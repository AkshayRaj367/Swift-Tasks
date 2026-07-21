"use client";

// useKeyboardShortcuts — global keyboard shortcut handler.
// Cmd/Ctrl+K  → command palette
// Cmd/Ctrl+B  → toggle sidebar
// Cmd/Ctrl+,  → settings
// Cmd/Ctrl+S  → save current file (prevents default browser save)
// Cmd/Ctrl+Enter → generate (if chat input focused, handled by chat panel)
// Esc         → close any open dialog

import { useEffect } from "react";
import { useAppStore } from "@/store/app-store";

export function useKeyboardShortcuts() {
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+K → command palette
      if (mod && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      // Cmd/Ctrl+B → toggle sidebar
      if (mod && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Cmd/Ctrl+, → settings
      if (mod && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }

      // Cmd/Ctrl+S → prevent browser save (the code view handles its own save)
      if (mod && e.key === "s") {
        e.preventDefault();
        // The save action is dispatched via a custom event that code-view listens to.
        window.dispatchEvent(new CustomEvent("swifttasks:save-file"));
        return;
      }

      // Cmd/Ctrl+Enter → trigger generation
      if (mod && e.key === "Enter") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("swifttasks:generate"));
        return;
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setCommandPaletteOpen, toggleSidebar, setSettingsOpen]);
}
