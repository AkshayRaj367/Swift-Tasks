"use client";

// VaultDialog — secure storage for API keys, tokens, and notes.
//
// Lets the user store arbitrary secrets (deploy tokens, database URLs,
// third-party API keys, passwords, notes) with AES-256-GCM encryption at
// rest. Values are masked by default and only revealed on explicit click.
//
// Accessible from the topbar (vault icon) and from the Settings dialog.

import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/store/app-store";
import { useToast } from "@/hooks/use-toast";
import {
  Lock,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  Key,
  FileText,
  KeyRound,
  StickyNote,
  Loader2,
  Search,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";

interface VaultEntry {
  id: string;
  label: string;
  category: string;
  maskedValue: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = [
  { id: "apikey", label: "API Key", icon: KeyRound, color: "text-rose-500" },
  { id: "token", label: "Token", icon: Key, color: "text-amber-500" },
  { id: "password", label: "Password", icon: Lock, color: "text-emerald-500" },
  { id: "note", label: "Note", icon: StickyNote, color: "text-sky-500" },
  { id: "other", label: "Other", icon: FileText, color: "text-muted-foreground" },
] as const;

function categoryMeta(cat: string) {
  return CATEGORIES.find((c) => c.id === cat) ?? CATEGORIES[CATEGORIES.length - 1];
}

export function VaultDialog() {
  const open = useAppStore((s) => s.vaultOpen);
  const setOpen = useAppStore((s) => s.setVaultOpen);
  const { toast } = useToast();

  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form state
  const [formLabel, setFormLabel] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formCategory, setFormCategory] = useState("apikey");
  const [formNote, setFormNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vault");
      if (res.ok) {
        const { entries } = await res.json();
        setEntries(entries);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadEntries();
  }, [open, loadEntries]);

  const filtered = entries.filter(
    (e) =>
      e.label.toLowerCase().includes(search.toLowerCase()) ||
      (e.note?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  async function handleSave() {
    if (!formLabel.trim() || !formValue.trim()) {
      toast({ title: "Label and value are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: formLabel.trim(),
          value: formValue.trim(),
          category: formCategory,
          note: formNote.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({ title: "Saved to vault", description: formLabel });
      setFormLabel("");
      setFormValue("");
      setFormNote("");
      setFormCategory("apikey");
      setShowForm(false);
      void loadEntries();
    } catch (err) {
      toast({ title: "Failed to save", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, label: string) {
    try {
      const res = await fetch(`/api/vault/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast({ title: "Deleted", description: label });
    } catch (err) {
      toast({ title: "Failed", description: String(err), variant: "destructive" });
    }
  }

  async function handleReveal(id: string) {
    if (revealed[id]) {
      // Toggle off.
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    setRevealing((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/vault/${id}/reveal`);
      if (!res.ok) throw new Error("Failed to reveal");
      const { value } = await res.json();
      setRevealed((prev) => ({ ...prev, [id]: value }));
    } catch (err) {
      toast({ title: "Failed to reveal", description: String(err), variant: "destructive" });
    } finally {
      setRevealing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleCopy(id: string) {
    const value = revealed[id];
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
    toast({ title: "Copied to clipboard" });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-0">
        {/* Header */}
        <div className="shrink-0 border-b p-6 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" /> Secure Vault
            </DialogTitle>
            <DialogDescription>
              Encrypted storage for API keys, tokens, and notes. Values are
              AES-256-GCM encrypted and only revealed on click.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 pt-4">
          {/* Search + Add */}
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vault…"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? (
                <>
                  <ChevronDown className="h-3.5 w-3.5" /> Cancel
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" /> Add
                </>
              )}
            </Button>
          </div>

          {/* Add form */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 overflow-hidden"
              >
                <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Label</Label>
                      <Input
                        value={formLabel}
                        onChange={(e) => setFormLabel(e.target.value)}
                        placeholder="e.g. Netlify token, Stripe key"
                        className="h-9 text-xs"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Category</Label>
                      <Select value={formCategory} onValueChange={setFormCategory}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              <span className="flex items-center gap-2">
                                <c.icon className={cn("h-3.5 w-3.5", c.color)} />
                                {c.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Secret value</Label>
                    <Input
                      type="password"
                      value={formValue}
                      onChange={(e) => setFormValue(e.target.value)}
                      placeholder="Paste your key, token, or value…"
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Note (optional, plaintext)</Label>
                    <Textarea
                      value={formNote}
                      onChange={(e) => setFormNote(e.target.value)}
                      placeholder="Where to use it, account email, etc."
                      className="min-h-[50px] text-xs"
                    />
                  </div>
                  <Button className="w-full gap-1.5" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                    Save to Vault
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Entry list */}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Lock className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium">
                {entries.length === 0 ? "Vault is empty" : "No matches"}
              </p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                {entries.length === 0
                  ? "Store API keys, tokens, and notes securely. Click Add to get started."
                  : "Try a different search."}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <AnimatePresence mode="popLayout">
                {filtered.map((entry) => {
                  const cat = categoryMeta(entry.category);
                  const isExpanded = expandedId === entry.id;
                  const value = revealed[entry.id];
                  const isRevealing = revealing.has(entry.id);
                  return (
                    <motion.div
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="overflow-hidden rounded-lg border bg-card"
                    >
                      {/* Header row */}
                      <div
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-muted/30"
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <cat.icon className={cn("h-4 w-4 shrink-0", cat.color)} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{entry.label}</div>
                          <div className="truncate font-mono text-[10px] text-muted-foreground">
                            {value || entry.maskedValue || "(empty)"}
                          </div>
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(entry.updatedAt), { addSuffix: true })}
                        </span>
                      </div>

                      {/* Expanded detail */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden border-t"
                          >
                            <div className="space-y-2 p-3">
                              {/* Value with reveal/copy */}
                              <div className="flex items-center gap-1.5">
                                <div className="flex min-w-0 flex-1 items-center rounded-md border bg-muted/30 px-2 py-1.5 font-mono text-xs">
                                  <span className="truncate">
                                    {value || entry.maskedValue || "(empty)"}
                                  </span>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 shrink-0 gap-1 text-xs"
                                  onClick={() => handleReveal(entry.id)}
                                  disabled={isRevealing}
                                >
                                  {isRevealing ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : value ? (
                                    <EyeOff className="h-3 w-3" />
                                  ) : (
                                    <Eye className="h-3 w-3" />
                                  )}
                                  {value ? "Hide" : "Reveal"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 shrink-0 gap-1 text-xs"
                                  onClick={() => handleCopy(entry.id)}
                                  disabled={!value}
                                >
                                  {copiedId === entry.id ? (
                                    <Check className="h-3 w-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 shrink-0 text-destructive hover:text-destructive"
                                  onClick={() => handleDelete(entry.id, entry.label)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>

                              {/* Note */}
                              {entry.note && (
                                <div className="rounded-md bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">Note: </span>
                                  {entry.note}
                                </div>
                              )}

                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span>Category: {cat.label}</span>
                                <span>·</span>
                                <span>Created {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}</span>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t bg-background/95 px-6 py-2.5 text-xs text-muted-foreground backdrop-blur">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            {entries.length} {entries.length === 1 ? "entry" : "entries"} · AES-256-GCM encrypted
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
