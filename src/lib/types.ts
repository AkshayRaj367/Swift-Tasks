// Shared types — used across client, server, and store boundaries.
// Keeping these in one place is what prevents project-state mismatch bugs.

export type Provider = "platform" | "openrouter" | "openai" | "anthropic" | "custom";

export interface ModelConfig {
  provider: Provider;
  model: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
  systemPromptOverride?: string;
}

export interface ApiKeyConfigPublic {
  id: string;
  label: string;
  provider: Provider;
  maskedKey: string;
  baseURL?: string | null;
  model: string;
  isDefault: boolean;
  isValid: boolean;
  lastValidated?: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  modelConfig: ModelConfig;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  messageCount: number;
}

export type ProjectStatus = "empty" | "idle" | "generating" | "error";

export interface ProjectFile {
  id: string;
  path: string;
  content: string;
  version: number;
  lastAction: "added" | "modified" | "deleted";
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  meta: MessageMeta;
  tokens: number;
  createdAt: string;
}

export interface MessageMeta {
  files?: string[];
  tokensUsed?: number;
  error?: string;
  jobId?: string;
  [key: string]: unknown;
}

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface GenerationJobRecord {
  id: string;
  projectId: string;
  status: JobStatus;
  prompt: string;
  tokensUsed: number;
  filesCompleted: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

// SSE event protocol — emitted by the job manager, consumed by the client.
export type StreamEvent =
  | { type: "job"; job: GenerationJobRecord }
  | { type: "token"; text: string }
  | { type: "file_start"; path: string }
  | { type: "file_content"; path: string; chunk: string }
  | { type: "file_done"; path: string; action: "added" | "modified" }
  | { type: "status"; tokensUsed: number; filesCompleted: number; step: string }
  | { type: "done"; job: GenerationJobRecord }
  | { type: "error"; message: string; code?: string }
  | { type: "heartbeat" };

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileNode[];
}
