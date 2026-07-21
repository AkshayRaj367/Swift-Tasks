// Build a nested file tree from a flat list of { path } entries.
import type { FileNode, ProjectFile } from "./types";

export function buildFileTree(files: { path: string }[]): FileNode[] {
  const root: FileNode[] = [];

  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean);
    let level = root;
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      acc = acc ? `${acc}/${part}` : part;
      const isLeaf = i === parts.length - 1;
      let node = level.find((n) => n.name === part);
      if (!node) {
        node = {
          name: part,
          path: acc,
          type: isLeaf ? "file" : "dir",
          children: isLeaf ? undefined : [],
        };
        level.push(node);
      }
      if (!isLeaf) {
        if (!node.children) node.children = [];
        level = node.children;
      }
    }
  }

  // Sort: dirs first, then files, alphabetically.
  const sortRec = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) if (n.children) sortRec(n.children);
  };
  sortRec(root);
  return root;
}

/** Pick the best entry file for preview from a flat file list. */
export function pickEntryFile(files: ProjectFile[]): ProjectFile | undefined {
  const priority = ["index.html", "src/index.html", "public/index.html"];
  for (const p of priority) {
    const f = files.find((f) => f.path === p);
    if (f) return f;
  }
  return files.find((f) => f.path.endsWith(".html")) || files[0];
}

/** Detect the language for Monaco from a file path. */
export function languageForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    css: "css",
    scss: "scss",
    html: "html",
    md: "markdown",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    yml: "yaml",
    yaml: "yaml",
    txt: "plaintext",
  };
  return map[ext || ""] || "plaintext";
}
