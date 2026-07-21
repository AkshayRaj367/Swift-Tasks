"use client";

// DeployDialog — one-click deploy of the generated project to a static host.
//
// Targets:
//   1. Netlify — user pastes a Netlify token once, we zip + upload, get a
//      live *.netlify.app URL. Token is stored in localStorage (client-side
//      only, never sent anywhere except Netlify).
//   2. Download ZIP — manual deploy to any host (Vercel, Cloudflare, Surge,
//      GitHub Pages, …) with step-by-step instructions.
//   3. Copy standalone HTML — copies a self-contained HTML doc to clipboard
//      for pasting anywhere.
//
// Shows a history of past deploys for this project with one-click "Open" +
// "Copy URL".

import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";
import { getProjectStore } from "@/store/project-stores";
import { useToast } from "@/hooks/use-toast";
import {
  Rocket,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  Download,
  Globe,
  Key,
  Trash2,
  ChevronRight,
  FileArchive,
  Cloud,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface DeployRecord {
  id: string;
  target: string;
  url: string;
  siteName: string | null;
  status: string;
  error: string | null;
  createdAt: string;
}

const NETLIFY_TOKEN_KEY = "swifttasks:netlify-token";

export function DeployDialog() {
  const deployOpen = useAppStore((s) => s.deployOpen);
  const setDeployOpen = useAppStore((s) => s.setDeployOpen);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const { toast } = useToast();

  const [tab, setTab] = useState<"netlify" | "download" | "copy">("netlify");
  const [netlifyToken, setNetlifyToken] = useState("");
  const [siteName, setSiteName] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deploys, setDeploys] = useState<DeployRecord[]>([]);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Load saved token + deploy history.
  useEffect(() => {
    if (!deployOpen || !activeProjectId) return;
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(NETLIFY_TOKEN_KEY) : null;
    if (saved) setNetlifyToken(saved);
    void loadDeploys();
  }, [deployOpen, activeProjectId]);

  async function loadDeploys() {
    if (!activeProjectId) return;
    try {
      const res = await fetch(`/api/projects/${activeProjectId}/deploy`);
      if (res.ok) {
        const { deploys } = await res.json();
        setDeploys(deploys);
      }
    } catch {
      /* ignore */
    }
  }

  const files = activeProjectId
    ? getProjectStore(activeProjectId)((s) => s.files)
    : [];

  async function deployToNetlify() {
    if (!activeProjectId || !netlifyToken) return;
    setDeploying(true);
    // Save token for next time (client-side only).
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(NETLIFY_TOKEN_KEY, netlifyToken);
    }
    try {
      const res = await fetch(`/api/projects/${activeProjectId}/deploy/netlify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: netlifyToken, siteName: siteName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Deploy failed");
      }
      toast({
        title: "Deployed!",
        description: `Live at ${data.url}`,
      });
      void loadDeploys();
      // Open the live URL in a new tab.
      window.open(data.url, "_blank");
    } catch (err) {
      toast({
        title: "Deploy failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setDeploying(false);
    }
  }

  async function downloadZip() {
    if (!activeProjectId) return;
    try {
      const res = await fetch(`/api/projects/${activeProjectId}/export`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "project.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "ZIP downloaded" });
    } catch (err) {
      toast({ title: "Download failed", description: String(err), variant: "destructive" });
    }
  }

  async function copyStandaloneHtml() {
    if (!activeProjectId) return;
    // Build a self-contained HTML doc by inlining all CSS/JS into index.html.
    const byPath = new Map(files.map((f) => [f.path, f.content]));
    const entry =
      byPath.get("index.html") ||
      byPath.get("src/index.html") ||
      files.find((f) => f.path.endsWith(".html"))?.content;
    if (!entry) {
      toast({ title: "No HTML entry file", variant: "destructive" });
      return;
    }
    let html = entry;
    // Inline stylesheets.
    html = html.replace(
      /<link[^>]*href=["']\.?\/?([^"']+)["'][^>]*>/gi,
      (m, href) => {
        const c = byPath.get(href.replace(/^\.?\//, "")) ?? byPath.get(`src/${href.replace(/^\.?\//, "")}`);
        return c ? `<style>\n${c}\n</style>` : m;
      }
    );
    // Inline scripts.
    html = html.replace(
      /<script([^>]*)\ssrc=["']\.?\/?([^"']+)["']([^>]*)><\/script>/gi,
      (m, pre, src, post) => {
        const c = byPath.get(src.replace(/^\.?\//, "")) ?? byPath.get(`src/${src.replace(/^\.?\//, "")}`);
        return c ? `<script ${pre} ${post}>\n${c}\n</script>` : m;
      }
    );
    await navigator.clipboard.writeText(html);
    toast({ title: "Standalone HTML copied", description: "Paste into any .html file." });
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 1500);
  }

  function clearToken() {
    setNetlifyToken("");
    if (typeof localStorage !== "undefined") localStorage.removeItem(NETLIFY_TOKEN_KEY);
  }

  return (
    <Dialog open={deployOpen} onOpenChange={setDeployOpen}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" /> Deploy Project
          </DialogTitle>
          <DialogDescription>
            Put your generated app online in one click. {files.length} files ready to deploy.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 rounded-md bg-muted/40 p-0.5">
          <TabButton active={tab === "netlify"} onClick={() => setTab("netlify")} icon={<Cloud className="h-3.5 w-3.5" />} label="Netlify" />
          <TabButton active={tab === "download"} onClick={() => setTab("download")} icon={<FileArchive className="h-3.5 w-3.5" />} label="Download ZIP" />
          <TabButton active={tab === "copy"} onClick={() => setTab("copy")} icon={<Copy className="h-3.5 w-3.5" />} label="Copy HTML" />
        </div>

        {/* Tab content */}
        {tab === "netlify" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-start gap-2">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="text-xs">
                  <p className="font-medium">One-click deploy to Netlify</p>
                  <p className="mt-0.5 text-muted-foreground">
                    Get a live <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">*.netlify.app</code> URL
                    in seconds. You need a free Netlify token.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Netlify Personal Access Token</Label>
              <div className="flex gap-1.5">
                <Input
                  type="password"
                  value={netlifyToken}
                  onChange={(e) => setNetlifyToken(e.target.value)}
                  placeholder="nfp_…"
                  className="h-9 font-mono text-xs"
                />
                {netlifyToken && (
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={clearToken} title="Clear token">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <a
                href="https://app.netlify.com/user/applications#personal-access-tokens"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <Key className="h-3 w-3" /> Get a free token from Netlify
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
              <p className="text-[10px] text-muted-foreground">
                Token is stored in your browser only and sent directly to Netlify.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Site name (optional)</Label>
              <Input
                value={siteName}
                onChange={(e) => setSiteName(e.target.value.replace(/[^a-z0-9-]/gi, "-").toLowerCase())}
                placeholder="my-awesome-app"
                className="h-9 font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Leave blank for a random name. Lowercase letters, numbers, hyphens only.
              </p>
            </div>

            <Button
              className="w-full gap-2"
              onClick={deployToNetlify}
              disabled={!netlifyToken || deploying || files.length === 0}
            >
              {deploying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Deploying…
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" /> Deploy to Netlify
                </>
              )}
            </Button>
          </motion.div>
        )}

        {tab === "download" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="mb-3 flex items-center gap-2">
                <FileArchive className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Download as ZIP</span>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Download all {files.length} files as a ZIP, then deploy to any static host:
              </p>
              <Button className="w-full gap-2" onClick={downloadZip} disabled={files.length === 0}>
                <Download className="h-4 w-4" /> Download ZIP
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Deploy the ZIP to:
              </p>
              <DeployGuide
                host="Netlify Drop"
                steps={["Go to app.netlify.com/drop", "Drag the ZIP file onto the page", "Done — you get a live URL"]}
                url="https://app.netlify.com/drop"
              />
              <DeployGuide
                host="Vercel"
                steps={["npm i -g vercel", "Unzip and run: vercel", "Follow the prompts"]}
                url="https://vercel.com"
              />
              <DeployGuide
                host="Cloudflare Pages"
                steps={["Go to pages.cloudflare.com", "Upload assets → drag the ZIP", "Deploy"]}
                url="https://pages.cloudflare.com"
              />
              <DeployGuide
                host="Surge.sh"
                steps={["npm i -g surge", "Unzip and run: surge ./", "Get a *.surge.sh URL"]}
                url="https://surge.sh"
              />
              <DeployGuide
                host="GitHub Pages"
                steps={["Create a new GitHub repo", "Upload the unzipped files", "Enable Pages in Settings"]}
                url="https://pages.github.com"
              />
            </div>
          </motion.div>
        )}

        {tab === "copy" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Copy className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Copy standalone HTML</span>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Copies a single self-contained HTML document with all CSS and JS inlined.
                Paste it into any <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">.html</code> file,
                host it anywhere, or email it.
              </p>
              <Button className="w-full gap-2" onClick={copyStandaloneHtml} disabled={files.length === 0}>
                <Copy className="h-4 w-4" /> Copy standalone HTML
              </Button>
            </div>
          </motion.div>
        )}

        {/* Deploy history */}
        {deploys.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Past deploys ({deploys.length})
            </p>
            <div className="max-h-40 space-y-1.5 overflow-y-auto">
              {deploys.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs"
                >
                  <Globe className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{d.target}</span>
                      {d.siteName && (
                        <span className="text-muted-foreground">· {d.siteName}</span>
                      )}
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-4 px-1 text-[9px]",
                          d.status === "live"
                            ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                            : "border-amber-500/30 text-amber-600 dark:text-amber-400"
                        )}
                      >
                        {d.status}
                      </Badge>
                    </div>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-[11px] text-primary hover:underline"
                    >
                      {d.url}
                    </a>
                  </div>
                  <button
                    onClick={() => copyUrl(d.url)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    title="Copy URL"
                  >
                    {copiedUrl === d.url ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    title="Open"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function DeployGuide({
  host,
  steps,
  url,
}: {
  host: string;
  steps: string[];
  url: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-3 rounded-md border bg-card p-2.5 transition-colors hover:border-primary/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {host}
        </div>
        <ol className="mt-0.5 space-y-0.5 text-[10px] text-muted-foreground">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-1">
              <span className="tabular-nums">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </a>
  );
}
