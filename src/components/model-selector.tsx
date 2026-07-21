"use client";

// ModelSelector — per-project provider/model picker.
// Changing it PATCHes the project's modelConfig (per-project override),
// never affecting other projects.
//
// The dropdown is DYNAMIC: it shows (a) the currently-selected model even if
// it's not in any preset list, (b) all models from the user's saved API key
// configs, and (c) the built-in presets. This way a user-saved model like
// "openai/gpt-oss-120b" always appears and is selectable.

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore } from "@/store/app-store";
import { getProjectStore } from "@/store/project-stores";
import { PROVIDERS } from "@/lib/constants";
import type { Provider } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Cpu, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function ModelSelector() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  if (!activeProjectId) return null;
  return <ModelSelectorInner projectId={activeProjectId} />;
}

function ModelSelectorInner({ projectId }: { projectId: string }) {
  const apiKeys = useAppStore((s) => s.apiKeys);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const { toast } = useToast();

  // Subscribe to the active project store to read its modelConfig live.
  const useStore = getProjectStore(projectId);
  const project = useStore((s) => s.project);
  const updateModelConfig = useStore((s) => s.updateModelConfig);

  const config = project?.modelConfig;
  const provider = config?.provider ?? "platform";
  const model = config?.model ?? "glm-4.6";

  // Determine which providers are "available": platform always, BYOK only if a key exists.
  const availableProviders = new Set<Provider>(["platform"]);
  for (const k of apiKeys) {
    if (k.isValid) availableProviders.add(k.provider as Provider);
  }

  // Build a deduplicated list of all known models per provider, combining:
  // presets + user's saved key models + the currently-active model.
  // This ensures the dropdown always shows the current selection.
  function modelsForProvider(p: Provider): { id: string; label: string; contextWindow?: string }[] {
    const preset = PROVIDERS.find((x) => x.id === p)?.models ?? [];
    const saved = apiKeys
      .filter((k) => k.provider === p && k.model)
      .map((k) => ({ id: k.model, label: k.model }));
    const merged = [...preset, ...saved];
    // Add the currently-active model if it's not already in the list.
    if (p === provider && model && !merged.some((m) => m.id === model)) {
      merged.unshift({ id: model, label: model });
    }
    // Dedupe by id.
    const seen = new Set<string>();
    return merged.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }

  async function applyChange(p: Provider, m: string) {
    if (!project) return;
    const providerDef = PROVIDERS.find((x) => x.id === p);
    // For built-in providers, use the default base URL. For custom, preserve
    // any existing baseURL on the project config, or look it up from the
    // user's saved key for that provider.
    let baseURL = providerDef?.defaultBaseURL;
    if (p === "custom") {
      baseURL = config?.baseURL;
      if (!baseURL) {
        const savedKey = apiKeys.find((k) => k.provider === "custom" && k.baseURL);
        if (savedKey?.baseURL) baseURL = savedKey.baseURL;
      }
    }
    updateModelConfig({ provider: p, model: m, baseURL });

    // Persist to server (per-project override).
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          modelConfig: { provider: p, model: m, baseURL },
        }),
      });
    } catch {
      /* non-fatal */
    }
    toast({
      title: "Model updated",
      description: `${providerDef?.label ?? p} · ${m}`,
    });
  }

  // The current select value. If the current model isn't in any list, we
  // still pass it so SelectValue can render it (Radix shows the value text).
  const currentValue = `${provider}::${model}`;

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Cpu className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <Select
        value={currentValue}
        onValueChange={(v) => {
          const [p, ...rest] = v.split("::");
          const m = rest.join("::");
          // Intercept the "Add in Settings" sentinel.
          if (m === "__configure__") {
            setSettingsOpen(true);
            return;
          }
          applyChange(p as Provider, m);
        }}
      >
        <SelectTrigger className="h-8 w-auto max-w-[280px] min-w-[120px] gap-1 border-none bg-muted/50 px-2 text-xs font-medium hover:bg-muted">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[400px] max-w-[360px]">
          {PROVIDERS.map((p) => {
            const isAvail = availableProviders.has(p.id);
            const models = modelsForProvider(p.id);
            return (
              <SelectGroup key={p.id}>
                <SelectLabel className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span className="truncate">{p.label}</span>
                  {!isAvail && (
                    <span className="ml-2 shrink-0 text-amber-500">no key</span>
                  )}
                </SelectLabel>
                {models.length === 0 ? (
                  <SelectItem
                    value={`${p.id}::__configure__`}
                    className="text-xs text-primary"
                  >
                    <span className="flex items-center gap-1">
                      <Plus className="h-3 w-3" /> Add in Settings
                    </span>
                  </SelectItem>
                ) : (
                  models.map((m) => (
                    <SelectItem
                      key={`${p.id}-${m.id}`}
                      value={`${p.id}::${m.id}`}
                      disabled={!isAvail}
                      className="text-xs"
                    >
                      <span className="flex items-center gap-2">
                        <span className="truncate font-mono text-[11px]">{m.label}</span>
                        {m.contextWindow && (
                          <span className="ml-auto shrink-0 pl-2 text-[10px] text-muted-foreground">
                            {m.contextWindow}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
