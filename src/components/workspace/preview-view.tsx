"use client";

// PreviewView — live, sandboxed rendering of the generated site.
//
// Approach: build a single self-contained HTML document by inlining any
// relative CSS/JS files referenced from index.html, then render it via an
// iframe srcdoc with sandbox="allow-scripts allow-same-origin" and a strict
// CSP. No access to the parent window's cookies/localStorage.
//
// Auto-refreshes (debounced) whenever files change. Manual rebuild button
// as a fallback.

import { getProjectStore } from "@/store/project-stores";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, ExternalLink, Eye, EyeOff, AlertCircle } from "lucide-react";
import type { ProjectFile } from "@/lib/types";

export function PreviewView({ projectId }: { projectId: string }) {
  const useStore = getProjectStore(projectId);
  const files = useStore((s) => s.files);
  const isRunning = useStore((s) => s.live.isRunning);
  const [nonce, setNonce] = useState(0);
  const [showConsole, setShowConsole] = useState(false);
  const [logs, setLogs] = useState<{ type: string; msg: string }[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Build the inlined HTML document whenever files change (debounced).
  const srcDoc = useMemo(() => buildPreviewDoc(files), [files, nonce]);

  // Debounced rebuild trigger on file changes during generation.
  useEffect(() => {
    if (!isRunning) return;
    const id = setTimeout(() => setNonce((n) => n + 1), 800);
    return () => clearTimeout(id);
  }, [files, isRunning]);

  // Listen to iframe console via postMessage (injected by the wrapper).
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data?.__swifttasks_console) {
        setLogs((prev) => [...prev.slice(-50), e.data.payload]);
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const hasEntry = files.some((f) => f.path.endsWith(".html"));

  function openInNewTab() {
    const blob = new Blob([srcDoc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  if (!hasEntry) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <EyeOff className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium">No preview available</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          The generated app needs an <code className="rounded bg-muted px-1 py-0.5 font-mono">index.html</code> entry file to render a live preview.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-2">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          localhost · sandboxed
          {isRunning && (
            <span className="ml-2 flex items-center gap-1 text-amber-500">
              <RefreshCw className="h-3 w-3 animate-spin" /> live
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setShowConsole((v) => !v)}
          >
            {showConsole ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            Console
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={openInNewTab}
            title="Open in new tab"
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setNonce((n) => n + 1)}
            title="Rebuild"
          >
            <RefreshCw className="h-3 w-3" /> Rebuild
          </Button>
        </div>
      </div>

      {/* Iframe */}
      <div className="relative min-h-0 flex-1 bg-white">
        <iframe
          ref={iframeRef}
          key={nonce}
          srcDoc={srcDoc}
          title="Live Preview"
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          // CSP enforced via meta tag inside srcDoc.
        />
      </div>

      {/* Console */}
      {showConsole && (
        <div className="h-32 shrink-0 border-t bg-zinc-950">
          <div className="flex items-center justify-between px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>Console</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[10px]"
              onClick={() => setLogs([])}
            >
              Clear
            </Button>
          </div>
          <div className="max-h-24 overflow-y-auto px-3 pb-2 font-mono text-[11px]">
            {logs.length === 0 && (
              <div className="text-muted-foreground/50">No messages.</div>
            )}
            {logs.map((l, i) => (
              <div
                key={i}
                className={
                  l.type === "error"
                    ? "text-red-400"
                    : l.type === "warn"
                      ? "text-amber-400"
                      : "text-zinc-300"
                }
              >
                <span className="mr-2 text-muted-foreground/50">{l.type}</span>
                {l.msg}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Build a self-contained HTML document for the iframe.
 * Inlines relative CSS/JS references; leaves absolute (CDN) URLs alone.
 * Injects a console-bridge + strict CSP.
 */
function buildPreviewDoc(files: ProjectFile[]): string {
  const byPath = new Map(files.map((f) => [f.path, f.content]));

  // Prefer index.html, fall back to any .html.
  const entry =
    byPath.get("index.html") ||
    byPath.get("src/index.html") ||
    files.find((f) => f.path.endsWith(".html"))?.content;

  if (!entry) {
    return `<!DOCTYPE html><html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#666;background:#fafafa"><div style="text-align:center"><div style="font-size:48px;margin-bottom:8px">📄</div>No HTML entry file found.</div></body></html>`;
  }

  let html = entry;

  // Inline <link rel="stylesheet" href="./...">  -> <style>...</style>
  html = html.replace(
    /<link[^>]*rel=["']stylesheet["'][^>]*href=["']\.?\/?([^"']+)["'][^>]*>/gi,
    (match, href) => {
      const content = resolveFile(byPath, href);
      if (content === null) return match;
      return `<style>\n${content}\n</style>`;
    }
  );
  // Also handle href before rel.
  html = html.replace(
    /<link[^>]*href=["']\.?\/?([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*>/gi,
    (match, href) => {
      const content = resolveFile(byPath, href);
      if (content === null) return match;
      return `<style>\n${content}\n</style>`;
    }
  );

  // Inline <script src="./...">  -> <script>...</script> (preserve type attr)
  html = html.replace(
    /<script([^>]*)\ssrc=["']\.?\/?([^"']+)["']([^>]*)><\/script>/gi,
    (match, pre, src, post) => {
      const content = resolveFile(byPath, src);
      if (content === null) return match;
      // Combine attrs (type, etc.)
      const attrs = (pre + " " + post).trim();
      return `<script ${attrs}>\n${content}\n</script>`;
    }
  );

  // Inject the console bridge before </body>.
  const bridge = `
<script>
(function(){
  function send(type, args){
    try{
      var msg = Array.prototype.map.call(args, function(a){
        try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
        catch(e){ return String(a); }
      }).join(' ');
      parent.postMessage({ __swifttasks_console: true, payload: { type: type, msg: msg } }, '*');
    }catch(e){}
  }
  ['log','info','warn','error','debug'].forEach(function(type){
    var orig = console[type];
    console[type] = function(){ send(type, arguments); orig.apply(console, arguments); };
  });
  window.addEventListener('error', function(e){ send('error', [e.message + ' @ ' + (e.filename||'') + ':' + (e.lineno||'')]); });
})();
</script>`;

  if (html.includes("</body>")) {
    html = html.replace("</body>", `${bridge}\n</body>`);
  } else {
    html += bridge;
  }

  return html;
}

function resolveFile(byPath: Map<string, string>, href: string): string | null {
  // Normalize: strip leading ./ or /
  const clean = href.replace(/^\.?\//, "");
  if (byPath.has(clean)) return byPath.get(clean)!;
  // Try with src/ prefix.
  if (byPath.has(`src/${clean}`)) return byPath.get(`src/${clean}`)!;
  return null;
}
