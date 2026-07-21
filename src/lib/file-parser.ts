// Incremental parser that extracts <file path="...">content</file> blocks
// from a streaming text buffer. Emits file_start / file_content / file_done
// events as the model writes each file, enabling the live "watch the code
// get written" experience.

export interface ParsedFileEvent {
  type: "file_start" | "file_content" | "file_done";
  path: string;
  chunk?: string; // for file_content
  content?: string; // full accumulated content, present on file_done
  action: "added" | "modified";
}

const OPEN_RE = /<file\s+path="([^"]+)"\s*>/;
const CLOSE_TAG = "</file>";

/**
 * A stateful streaming parser. Feed it text chunks via `feed()`;
 * it returns:
 *  - `text`: prose to show in the chat (outside file tags)
 *  - `events`: file lifecycle events
 */
export class FileStreamParser {
  private buffer = "";
  private insideFile = false;
  private currentPath: string | null = null;
  private currentContent = "";
  private flushedPaths = new Set<string>();

  feed(chunk: string): { text: string; events: ParsedFileEvent[] } {
    this.buffer += chunk;
    let text = "";
    const events: ParsedFileEvent[] = [];

    // Loop: we may resolve multiple tags within one chunk.
    while (true) {
      if (!this.insideFile) {
        // Look for an opening tag in the buffer.
        const openMatch = this.buffer.match(OPEN_RE);
        if (!openMatch) {
          // No opening tag yet. But we might be mid-tag (e.g. "<file pa").
          // Hold back the last few chars in case a tag is forming.
          const partialStart = this.buffer.lastIndexOf("<");
          if (partialStart === -1) {
            // No partial tag — emit all prose.
            text += this.buffer;
            this.buffer = "";
          } else {
            // Emit prose before the partial tag, hold the partial.
            text += this.buffer.slice(0, partialStart);
            this.buffer = this.buffer.slice(partialStart);
          }
          break;
        }
        const matchIndex = openMatch.index!;
        const tagEnd = matchIndex + openMatch[0].length;
        // Emit prose before the tag.
        text += this.buffer.slice(0, matchIndex);
        this.currentPath = openMatch[1];
        this.currentContent = "";
        this.insideFile = true;
        const action = this.flushedPaths.has(this.currentPath) ? "modified" : "added";
        events.push({ type: "file_start", path: this.currentPath, action });
        this.buffer = this.buffer.slice(tagEnd);
        // continue loop to process content immediately
      } else {
        // We're inside a file. Look for the close tag.
        const closeIdx = this.buffer.indexOf(CLOSE_TAG);
        if (closeIdx === -1) {
          // No close tag yet. Emit most of the buffer as content,
          // but hold back enough chars to cover a partial close tag.
          const holdLen = CLOSE_TAG.length - 1;
          if (this.buffer.length > holdLen) {
            const toEmit = this.buffer.slice(0, this.buffer.length - holdLen);
            this.currentContent += toEmit;
            events.push({
              type: "file_content",
              path: this.currentPath!,
              chunk: toEmit,
              action: this.flushedPaths.has(this.currentPath!) ? "modified" : "added",
            });
            this.buffer = this.buffer.slice(this.buffer.length - holdLen);
          }
          break;
        }
        // Close tag found.
        const contentPart = this.buffer.slice(0, closeIdx);
        this.currentContent += contentPart;
        if (contentPart) {
          events.push({
            type: "file_content",
            path: this.currentPath!,
            chunk: contentPart,
            action: this.flushedPaths.has(this.currentPath!) ? "modified" : "added",
          });
        }
        const fullContent = this.currentContent;
        const donePath = this.currentPath!;
        this.flushedPaths.add(donePath);
        events.push({
          type: "file_done",
          path: donePath,
          content: fullContent,
          action: this.flushedPaths.has(donePath) ? "modified" : "added",
        });
        // Advance buffer past the close tag.
        this.buffer = this.buffer.slice(closeIdx + CLOSE_TAG.length);
        // Reset for next file.
        this.insideFile = false;
        this.currentPath = null;
        this.currentContent = "";
        // continue loop
      }
    }

    return { text, events };
  }

  /** Flush any trailing state at end of stream. */
  flush(): { text: string; events: ParsedFileEvent[]; pendingFile?: { path: string; content: string } } {
    const events: ParsedFileEvent[] = [];
    let text = "";
    // If we were inside a file that never closed, emit it as done with whatever we have.
    if (this.insideFile && this.currentPath) {
      const remaining = this.buffer;
      this.currentContent += remaining;
      if (remaining) {
        events.push({
          type: "file_content",
          path: this.currentPath,
          chunk: remaining,
          action: this.flushedPaths.has(this.currentPath) ? "modified" : "added",
        });
      }
      const pendingFile = { path: this.currentPath, content: this.currentContent };
      events.push({
        type: "file_done",
        path: this.currentPath,
        content: this.currentContent,
        action: this.flushedPaths.has(this.currentPath) ? "modified" : "added",
      });
      this.insideFile = false;
      this.currentPath = null;
      this.currentContent = "";
      this.buffer = "";
      return { text, events, pendingFile };
    }
    // Trailing prose.
    text = this.buffer;
    this.buffer = "";
    return { text, events };
  }
}

/** Extract all complete files from a fully-assembled text (used for tests / re-parse). */
export function extractFiles(text: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  const re = /<file\s+path="([^"]+)"\s*>([\s\S]*?)<\/file>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    files.push({ path: m[1], content: m[2] });
  }
  return files;
}
