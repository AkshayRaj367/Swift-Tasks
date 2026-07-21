"use client";

// SettingsDialog — BYOK API key management.
// - List existing keys (masked, never plaintext)
// - Add a new key with inline validation (test before save)
// - Per-provider form: openrouter/openai/anthropic/custom
// - Platform demo model always available

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";
import { PROVIDERS, CUSTOM_BASE_URL_PRESETS } from "@/lib/constants";
import type { ApiKeyConfigPublic, Provider } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import {
  Key,
  Plus,
  Trash2,
  Check,
  X,
  Loader2,
  ExternalLink,
  ShieldCheck,
  Eye,
  EyeOff,
  RefreshCw,
  Keyboard,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FetchedModel {
  id: string;
  label?: string;
  ownedBy?: string;
  contextWindow?: string;
}

export function SettingsDialog() {
  const open = useAppStore((s) => s.settingsOpen);
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  const apiKeys = useAppStore((s) => s.apiKeys);
  const upsertApiKey = useAppStore((s) => s.upsertApiKey);
  const removeApiKey = useAppStore((s) => s.removeApiKey);

  const [provider, setProvider] = useState<Provider>("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  // Auto-fetched models from the provider's /models endpoint.
  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [manualModelEntry, setManualModelEntry] = useState(false);

  const { toast } = useToast();

  const providerDef = PROVIDERS.find((p) => p.id === provider)!;

  // The list of models shown in the dropdown: fetched models take priority,
  // then preset models. Empty when neither is available (→ manual input).
  const availableModels: FetchedModel[] =
    fetchedModels.length > 0
      ? fetchedModels
      : providerDef.models.map((m) => ({ id: m.id, label: m.label, contextWindow: m.contextWindow }));

  // Reset model + baseURL when provider changes.
  useEffect(() => {
    setModel(providerDef.models[0]?.id || "");
    setBaseURL(providerDef.defaultBaseURL || "");
    setTestResult(null);
    setFetchedModels([]);
    setModelsError(null);
    setManualModelEntry(false);
  }, [provider, providerDef]);

  // Determine whether we have enough info to auto-fetch models.
  const canFetchModels =
    provider === "platform"
      ? false
      : provider === "custom"
        ? apiKey.trim().length > 0 && baseURL.trim().length > 0
        : apiKey.trim().length > 0;

  // Auto-fetch models when the user has entered a key (+ baseURL for custom).
  // Debounced so it doesn't fire on every keystroke.
  useEffect(() => {
    if (!canFetchModels) {
      setFetchedModels([]);
      setModelsError(null);
      return;
    }
    const id = setTimeout(() => {
      void fetchModels();
    }, 600);
    return () => clearTimeout(id);
  }, [apiKey, baseURL, provider, canFetchModels]);

  async function fetchModels() {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const res = await fetch("/api/settings/api-keys/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: apiKey.trim(),
          baseURL: baseURL.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModelsError(data.error || "Failed to fetch models");
        setFetchedModels([]);
      } else {
        setFetchedModels(data.models || []);
        // Auto-select the first model if none selected.
        if (data.models?.length > 0 && !model) {
          setModel(data.models[0].id);
        }
      }
    } catch (err) {
      setModelsError(String(err));
      setFetchedModels([]);
    } finally {
      setModelsLoading(false);
    }
  }

  async function handleTest() {
    if (provider !== "platform" && !apiKey) {
      toast({ title: "Enter an API key first", variant: "destructive" });
      return;
    }
    if (!model) {
      toast({ title: "Select a model", variant: "destructive" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/api-keys/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey,
          model,
          baseURL: baseURL || undefined,
        }),
      });
      const data = await res.json();
      setTestResult({ ok: data.ok, error: data.error });
      toast({
        title: data.ok ? "Key is valid" : "Validation failed",
        description: data.ok ? `${providerDef.label} · ${model}` : data.error,
        variant: data.ok ? "default" : "destructive",
      });
    } catch (err) {
      setTestResult({ ok: false, error: String(err) });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (provider !== "platform" && !apiKey) {
      toast({ title: "Enter an API key", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey,
          model,
          baseURL: baseURL || null,
          makeDefault: true,
        }),
      });
      const data = await res.json();
      if (data.key) {
        upsertApiKey(data.key);
        setApiKey("");
        setTestResult(null);
        toast({
          title: "Key saved",
          description: data.warning || `${providerDef.label} · ${model}`,
          variant: data.warning ? "destructive" : "default",
        });
      }
    } catch (err) {
      toast({ title: "Failed to save", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/settings/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      removeApiKey(id);
      toast({ title: "Key removed" });
    } catch (err) {
      toast({ title: "Failed", description: String(err), variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-4 w-4" /> API Keys & Model Providers
          </DialogTitle>
          <DialogDescription>
            Bring your own key. Keys are encrypted at rest (AES-256-GCM) and never sent anywhere
            except the provider you configure.
          </DialogDescription>
        </DialogHeader>

        {/* Existing keys */}
        {apiKeys.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Saved keys
            </Label>
            <div className="space-y-1.5">
              {apiKeys.map((k) => (
                <KeyRow key={k.id} k={k} onDelete={handleDelete} />
              ))}
            </div>
          </div>
        )}

        {/* Add new key */}
        <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Plus className="h-4 w-4" /> Add a provider
          </div>

          {/* Provider + Model: stack on narrow, 2-col on wider screens */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Model picker — full width, no overflow.
                The Select and the keyboard-toggle button wrap cleanly.
                Priority: fetched > presets > manual input. */}
            <div className="space-y-1.5">
              <Label className="flex items-center justify-between gap-2 text-xs">
                <span className="shrink-0">Model</span>
                {provider !== "platform" && (
                  <button
                    type="button"
                    onClick={() => void fetchModels()}
                    disabled={!canFetchModels || modelsLoading}
                    className="flex shrink-0 items-center gap-1 text-[10px] text-primary hover:underline disabled:opacity-40 disabled:no-underline"
                    title="Fetch available models from the provider"
                  >
                    {modelsLoading ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-2.5 w-2.5" />
                    )}
                    <span className="hidden sm:inline">{modelsLoading ? "Fetching…" : "Refresh"}</span>
                  </button>
                )}
              </Label>

              {manualModelEntry ? (
                <div className="flex gap-1.5">
                  <Input
                    autoFocus
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g. llama-3.1-70b-instruct"
                    className="h-9 min-w-0 flex-1 font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0"
                    onClick={() => setManualModelEntry(false)}
                    disabled={availableModels.length === 0}
                  >
                    List
                  </Button>
                </div>
              ) : availableModels.length > 0 ? (
                <div className="flex gap-1.5">
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger className="h-9 min-w-0 flex-1">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {availableModels.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="font-mono text-xs">
                          <span className="flex items-center gap-2">
                            <span className="truncate">{m.label || m.id}</span>
                            {m.contextWindow && (
                              <span className="shrink-0 text-[9px] text-muted-foreground">{m.contextWindow}</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 gap-1 text-xs"
                    onClick={() => {
                      setManualModelEntry(true);
                      setModel("");
                    }}
                    title="Type a model id manually"
                  >
                    <Keyboard className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <Input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g. llama-3.1-70b-instruct"
                    className="h-9 min-w-0 flex-1 font-mono text-xs"
                  />
                </div>
              )}

              {/* Status line */}
              {provider !== "platform" && (
                <div className="min-h-[14px] text-[10px]">
                  {modelsLoading ? (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      Fetching available models…
                    </span>
                  ) : modelsError ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      {modelsError} — type a model id manually.
                    </span>
                  ) : fetchedModels.length > 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {fetchedModels.length} model{fetchedModels.length === 1 ? "" : "s"} available
                    </span>
                  ) : canFetchModels ? (
                    <span className="text-muted-foreground">Enter a key to auto-fetch models</span>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {provider !== "platform" && (
            <div className="space-y-1.5">
              <Label className="text-xs">API Key</Label>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="sk-…"
                  className="h-9 pr-9 font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 h-7 w-7"
                  onClick={() => setShowKey((v) => !v)}
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          )}

          {(provider === "custom" || (providerDef.defaultBaseURL && provider !== "platform")) && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                Base URL {provider !== "custom" ? "(optional override)" : provider === "custom" && !baseURL ? "(required)" : ""}
              </Label>
              <Input
                value={baseURL}
                onChange={(e) => {
                  setBaseURL(e.target.value);
                  setTestResult(null);
                }}
                placeholder={providerDef.defaultBaseURL || "https://your-host/v1"}
                className="h-9 font-mono text-xs"
              />
              {provider === "custom" && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {CUSTOM_BASE_URL_PRESETS.map((preset) => (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() => {
                        setBaseURL(preset.url);
                        setTestResult(null);
                      }}
                      className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors hover:bg-accent ${
                        baseURL === preset.url ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
                      }`}
                      title={preset.docs || preset.url}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
              {provider === "custom" && !baseURL && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  A base URL is required for the custom provider. Pick a preset above or enter your own.
                </p>
              )}
            </div>
          )}

          {providerDef.docsUrl && (
            <a
              href={providerDef.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Get a key from {providerDef.label} <ExternalLink className="h-3 w-3" />
            </a>
          )}

          {testResult && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-xs",
                testResult.ok
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-destructive/10 text-destructive"
              )}
            >
              {testResult.ok ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              <span className="flex-1">
                {testResult.ok
                  ? "Key validated successfully."
                  : testResult.error || "Validation failed."}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleTest}
              disabled={testing || (provider !== "platform" && !apiKey)}
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              Test
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Save & Make Default
            </Button>
          </div>
        </div>
        </div>

        <DialogFooter className="shrink-0 border-t bg-background/95 px-6 py-2.5 text-xs text-muted-foreground backdrop-blur">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Keys are AES-256-GCM encrypted server-side.
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KeyRow({
  k,
  onDelete,
}: {
  k: ApiKeyConfigPublic;
  onDelete: (id: string) => Promise<void>;
}) {
  const providerDef = PROVIDERS.find((p) => p.id === k.provider);
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
      <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10 text-primary">
        <Key className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {providerDef?.label || k.provider}
          {k.isDefault && <Badge variant="secondary" className="h-4 px-1 text-[9px]">default</Badge>}
          {k.isValid ? (
            <Badge variant="outline" className="h-4 gap-0.5 border-emerald-500/30 px-1 text-[9px] text-emerald-600 dark:text-emerald-400">
              <Check className="h-2 w-2" /> valid
            </Badge>
          ) : (
            <Badge variant="outline" className="h-4 gap-0.5 border-destructive/30 px-1 text-[9px] text-destructive">
              <X className="h-2 w-2" /> invalid
            </Badge>
          )}
        </div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">
          {k.maskedKey || "(no key needed)"} · {k.model}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(k.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
