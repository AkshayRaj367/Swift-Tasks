"use client";

// ModelSelector — per-project provider/model picker.
// Changing it PATCHes the project's modelConfig (per-project override),
// never affecting other projects.

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore } from "@/store/app-store";
import { getProjectStore } from "@/store/project-stores";
import { PROVIDERS } from "@/lib/constants";
import type { Provider } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, Cpu } from "lucide-react";

export function ModelSelector() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  if (!activeProjectId) return null;
  return <ModelSelectorInner projectId={activeProjectId} />;
}

function ModelSelectorInner({ projectId }: { projectId: string }) {
  const apiKeys = useAppStore((s) => s.apiKeys);
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
        // Try to find a saved key for the custom provider with a baseURL.
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

  return (
    <div className="flex items-center gap-1.5">
      <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
      <Select value={`${provider}::${model}`} onValueChange={(v) => {
        const [p, ...rest] = v.split("::");
        applyChange(p as Provider, rest.join("::"));
      }}>
        <SelectTrigger className="h-8 w-auto gap-1 border-none bg-muted/50 px-2 text-xs font-medium hover:bg-muted">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROVIDERS.map((p) => {
            const isAvail = availableProviders.has(p.id);
            return (
              <SelectGroup key={p.id}>
                <SelectLabel className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                  {p.label}
                  {!isAvail && (
                    <span className="text-amber-500">no key</span>
                  )}
                </SelectLabel>
                {p.models.length === 0 ? (
                  <SelectItem
                    value={`${p.id}::custom`}
                    disabled={!isAvail}
                    className="text-xs text-muted-foreground"
                  >
                    Configure in Settings
                  </SelectItem>
                ) : (
                  p.models.map((m) => (
                    <SelectItem
                      key={m.id}
                      value={`${p.id}::${m.id}`}
                      disabled={!isAvail}
                      className="text-xs"
                    >
                      {m.label}
                      {m.contextWindow && (
                        <span className="ml-auto pl-2 text-[10px] text-muted-foreground">
                          {m.contextWindow}
                        </span>
                      )}
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
