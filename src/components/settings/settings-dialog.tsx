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
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  const { toast } = useToast();

  const providerDef = PROVIDERS.find((p) => p.id === provider)!;

  // Reset model when provider changes.
  useEffect(() => {
    setModel(providerDef.models[0]?.id || "");
    setBaseURL(providerDef.defaultBaseURL || "");
    setTestResult(null);
  }, [provider, providerDef]);

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
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
                <SelectTrigger className="h-9">
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
            <div className="space-y-1.5">
              <Label className="text-xs">Model</Label>
              {providerDef.models.length > 0 ? (
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {providerDef.models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. llama-3.1-70b"
                  className="h-9"
                />
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

        <DialogFooter className="text-xs text-muted-foreground">
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
