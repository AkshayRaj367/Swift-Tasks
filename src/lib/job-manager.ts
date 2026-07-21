// In-process generation job manager.
//
// DESIGN (the highest-risk component — read this before editing):
//
// 1. Every job is namespaced by `projectId`. There is NO global "current job"
//    concept. The registry is `Map<jobId, JobRuntime>` and each JobRuntime
//    carries its own projectId; all DB writes are filtered by projectId.
//
// 2. Jobs run DETACHED from the client connection. `startJob()` kicks off an
//    async `runJob()` that is NOT awaited. Closing the browser tab does not
//    kill the generation — it keeps writing files to the DB. When the client
//    reconnects it tails the in-memory event ring buffer from its last seen
//    index. (Tradeoff: if the server process restarts, in-flight jobs are
//    lost — marked failed on next status check. For a true durable worker
//    you'd move this to BullMQ+Redis; documented as an MVP tradeoff.)
//
// 3. Two projects generating concurrently cannot cross-contaminate because
//    each job has its own parser instance, its own AbortController, its own
//    event buffer, and every DB write is scoped to that job's projectId.

import { db } from "./db";
import { streamGeneration, makeLLMError, type LLMError } from "./llm";
import { FileStreamParser } from "./file-parser";
import { decrypt } from "./crypto";
import { DEFAULT_SYSTEM_PROMPT } from "./constants";
import type { StreamEvent, GenerationJobRecord, ModelConfig } from "./types";
import type { CoreMessage } from "ai";

interface JobRuntime {
  jobId: string;
  projectId: string;
  controller: AbortController;
  events: StreamEvent[]; // ring buffer (unbounded for MVP; capped in practice by generation length)
  subscribers: Set<(ev: StreamEvent) => void>;
  finished: boolean;
  startedAt: number;
}

class JobManager {
  private jobs = new Map<string, JobRuntime>();
  // Per-project active job id, so we can enforce "one active generation per project"
  // and let the client reattach. This is the ONLY project-keyed map and it stores
  // just an id (a primitive), never job state.
  private activeByProject = new Map<string, string>();

  /** Start a generation job. Returns the job record immediately; generation continues detached. */
  async startJob(params: {
    projectId: string;
    prompt: string;
    config: ModelConfig;
    history: { role: string; content: string }[];
  }): Promise<GenerationJobRecord> {
    const { projectId, prompt, config, history } = params;

    // If a job is already running for this project, refuse — one at a time.
    const existing = this.activeByProject.get(projectId);
    if (existing && this.jobs.has(existing) && !this.jobs.get(existing)!.finished) {
      const rt = this.jobs.get(existing)!;
      const job = await db.generationJob.findUnique({ where: { id: existing } });
      if (job && job.status === "running") {
        throw makeLLMError(
          "A generation is already running for this project. Stop it first or wait for it to finish.",
          "ALREADY_RUNNING"
        );
      }
    }

    const job = await db.generationJob.create({
      data: {
        projectId,
        status: "running",
        prompt,
        startedAt: new Date(),
      },
    });

    const runtime: JobRuntime = {
      jobId: job.id,
      projectId,
      controller: new AbortController(),
      events: [],
      subscribers: new Set(),
      finished: false,
      startedAt: Date.now(),
    };
    this.jobs.set(job.id, runtime);
    this.activeByProject.set(projectId, job.id);

    // Persist the user message immediately (scoped to projectId).
    await db.projectMessage.create({
      data: {
        projectId,
        role: "user",
        content: prompt,
        meta: JSON.stringify({ jobId: job.id }),
      },
    });

    // Update project status to "generating".
    await db.project.update({ where: { id: projectId }, data: { status: "generating" } });

    // Emit initial job event.
    this.emit(job.id, { type: "job", job: this.serializeJob(job) });

    // Detached runner — NOT awaited. Survives client disconnect.
    this.runJob(job.id, projectId, prompt, config, history).catch((err) => {
      // Safety net: if runJob itself threw before its own error handling.
      this.handleJobError(job.id, projectId, err);
    });

    return this.serializeJob(job);
  }

  private async runJob(
    jobId: string,
    projectId: string,
    prompt: string,
    config: ModelConfig,
    history: { role: string; content: string }[]
  ) {
    const runtime = this.jobs.get(jobId)!;
    const parser = new FileStreamParser();
    let tokensUsed = 0;
    let filesCompleted = 0;
    const writtenFiles: string[] = [];
    let assistantText = "";

    try {
      // Resolve API key (decrypted) + the saved key's baseURL — only needed
      // for BYOK providers. The saved key's baseURL takes priority over the
      // project config's baseURL to ensure key+endpoint always match.
      let apiKey: string | null = null;
      let resolvedBaseURL: string | undefined = config.baseURL;
      if (config.provider !== "platform") {
        const resolved = await this.resolveApiKey(projectId, config);
        apiKey = resolved.key;
        if (resolved.baseURL) resolvedBaseURL = resolved.baseURL;
      }
      // Build the effective config with the resolved baseURL.
      const effectiveConfig = { ...config, baseURL: resolvedBaseURL };

      // Build the message list from history + new prompt.
      const messages: CoreMessage[] = history.map((m) => ({
        role: (m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user") as
          | "user"
          | "assistant"
          | "system",
        content: m.content,
      }));

      // Compose the actual instruction sent to the model.
      const instruction = this.buildInstruction(prompt, projectId);

      // Try the configured provider. If it fails with a configuration or
      // region error (common with BYOK misconfiguration), automatically fall
      // back to the platform model so the user still gets a working result.
      // The original error is surfaced as a status note.
      let gen: AsyncGenerator<string, void, unknown>;
      try {
        const primary = streamGeneration({
          config: effectiveConfig,
          apiKey,
          messages: [...messages, { role: "user", content: instruction }],
          signal: runtime.controller.signal,
          systemPrompt: config.systemPromptOverride || DEFAULT_SYSTEM_PROMPT,
        });
        // Probe the first chunk to detect immediate config/auth/region errors.
        const probe = await primary.next();
        if (probe.done) {
          // Empty stream (rare) — wrap an empty generator.
          gen = emptyGen();
        } else {
          // First chunk arrived — prepend it to the rest of the stream.
          gen = prependGen(probe.value, primary);
        }
      } catch (configErr) {
        const ce = configErr as LLMError;
        const fallbackCodes = ["NO_BASE_URL", "NO_KEY", "REGION_BLOCKED", "AUTH", "NETWORK"];
        if (ce.code && fallbackCodes.includes(ce.code) && config.provider !== "platform") {
          // Fall back to platform model — emit a visible warning event so the
          // user knows their BYOK key was rejected and the platform model is
          // being used instead.
          const providerLabel = config.provider;
          const reason =
            ce.code === "AUTH"
              ? `rejected by ${providerLabel} (HTTP 403 — invalid key or IP/region block)`
              : ce.code === "NO_BASE_URL"
                ? "missing base URL"
                : ce.code === "NO_KEY"
                  ? "no API key configured"
                  : ce.code === "REGION_BLOCKED"
                    ? `region-blocked by ${providerLabel}`
                    : `network error (${ce.code})`;
          this.emit(jobId, {
            type: "status",
            tokensUsed: 0,
            filesCompleted: 0,
            step: `⚠️ ${providerLabel} key ${reason} — using platform demo model instead…`,
          });
          gen = streamGeneration({
            config: { provider: "platform", model: "glm-4.6" },
            apiKey: null,
            messages: [...messages, { role: "user", content: instruction }],
            signal: runtime.controller.signal,
            systemPrompt: config.systemPromptOverride || DEFAULT_SYSTEM_PROMPT,
          });
        } else {
          throw configErr;
        }
      }

      for await (const chunk of gen) {
        if (runtime.controller.signal.aborted) {
          throw makeLLMError("Generation cancelled", "CANCELLED");
        }
        tokensUsed += Math.max(1, Math.ceil(chunk.length / 4)); // rough token estimate
        this.emit(jobId, { type: "token", text: chunk });

        const { text, events } = parser.feed(chunk);
        if (text) assistantText += text;
        for (const ev of events) {
          if (ev.type === "file_start") {
            this.emit(jobId, { type: "file_start", path: ev.path });
          } else if (ev.type === "file_content" && ev.chunk) {
            this.emit(jobId, { type: "file_content", path: ev.path, chunk: ev.chunk });
          } else if (ev.type === "file_done") {
            if (ev.content !== undefined) {
              await this.persistFileContent(projectId, ev.path, ev.content);
            }
            filesCompleted += 1;
            writtenFiles.push(ev.path);
            this.emit(jobId, { type: "file_done", path: ev.path, action: ev.action });
            this.emit(jobId, {
              type: "status",
              tokensUsed,
              filesCompleted,
              step: `Writing ${ev.path}`,
            });
          }
        }

        // Periodic status.
        if (tokensUsed % 50 === 0) {
          this.emit(jobId, { type: "status", tokensUsed, filesCompleted, step: "Generating…" });
        }
      }

      // Flush trailing content (handles a file whose </file> never arrived).
      const flushed = parser.flush();
      if (flushed.text) assistantText += flushed.text;
      for (const ev of flushed.events) {
        if (ev.type === "file_done" && ev.content !== undefined) {
          await this.persistFileContent(projectId, ev.path, ev.content);
          filesCompleted += 1;
          writtenFiles.push(ev.path);
          this.emit(jobId, { type: "file_done", path: ev.path, action: ev.action });
        }
      }
      if (flushed.pendingFile) {
        await this.persistFileContent(
          projectId,
          flushed.pendingFile.path,
          flushed.pendingFile.content
        );
        filesCompleted += 1;
        writtenFiles.push(flushed.pendingFile.path);
        this.emit(jobId, {
          type: "file_done",
          path: flushed.pendingFile.path,
          action: "added",
        });
      }

      // Persist assistant message (scoped to projectId).
      const trimmed = assistantText.trim();
      await db.projectMessage.create({
        data: {
          projectId,
          role: "assistant",
          content: trimmed || `(Generated ${filesCompleted} file${filesCompleted === 1 ? "" : "s"})`,
          meta: JSON.stringify({
            files: writtenFiles,
            tokensUsed,
            jobId,
          }),
          tokens: tokensUsed,
        },
      });

      // Mark job complete.
      const finished = await db.generationJob.update({
        where: { id: jobId },
        data: {
          status: "completed",
          tokensUsed,
          filesCompleted,
          finishedAt: new Date(),
        },
      });
      await db.project.update({
        where: { id: projectId },
        data: { status: "idle" },
      });

      this.emit(jobId, { type: "done", job: this.serializeJob(finished) });
    } catch (err) {
      await this.handleJobError(jobId, projectId, err);
    } finally {
      runtime.finished = true;
      // Notify subscribers that the stream is over.
      for (const sub of runtime.subscribers) {
        // no-op; they'll detect via done/error event
      }
    }
  }

  private async handleJobError(jobId: string, projectId: string, err: unknown) {
    const e = err as LLMError;
    const message = e?.message || String(err);
    const isCancelled = e?.code === "CANCELLED";
    const finished = await db.generationJob.update({
      where: { id: jobId },
      data: {
        status: isCancelled ? "cancelled" : "failed",
        error: isCancelled ? null : message,
        finishedAt: new Date(),
      },
    });
    await db.project.update({
      where: { id: projectId },
      data: { status: isCancelled ? "idle" : "error" },
    });
    // Persist a partial assistant message so the chat shows the attempt.
    await db.projectMessage.create({
      data: {
        projectId,
        role: "assistant",
        content: isCancelled ? "_(generation cancelled)_" : `⚠️ ${message}`,
        meta: JSON.stringify({ jobId, error: message, code: e?.code }),
      },
    });
    if (!isCancelled) {
      this.emit(jobId, { type: "error", message, code: e?.code });
    }
    this.emit(jobId, { type: "done", job: this.serializeJob(finished) });
  }

  /** Persist a file, incrementing version. Scoped strictly to projectId. */
  private async persistFileContent(projectId: string, path: string, content: string) {
    const existing = await db.projectFile.findUnique({
      where: { projectId_path: { projectId, path } },
    });
    if (existing) {
      await db.projectFile.update({
        where: { id: existing.id },
        data: {
          content,
          version: existing.version + 1,
          lastAction: "modified",
          updatedAt: new Date(),
        },
      });
    } else {
      await db.projectFile.create({
        data: { projectId, path, content, version: 1, lastAction: "added" },
      });
    }
  }

  // Persistence is fed directly from the parser's file_done event content.

  /** Resolve the API key AND the saved key's baseURL for a provider.
   *  The saved key's baseURL takes priority over the project config's baseURL
   *  to ensure the key and endpoint always match (mismatches cause silent 401s). */
  private async resolveApiKey(
    projectId: string,
    config: ModelConfig
  ): Promise<{ key: string | null; baseURL: string | null }> {
    const user = await db.user.findFirst();
    if (!user) return { key: null, baseURL: null };
    const keyConfig = await db.apiKeyConfig.findFirst({
      where: { userId: user.id, provider: config.provider },
    });
    if (!keyConfig || !keyConfig.encryptedKey)
      return { key: null, baseURL: keyConfig?.baseURL || null };
    try {
      return {
        key: decrypt(keyConfig.encryptedKey),
        baseURL: keyConfig.baseURL || null,
      };
    } catch {
      return { key: null, baseURL: null };
    }
  }

  private buildInstruction(prompt: string, projectId: string): string {
    // Inject a tiny bit of project context so multi-turn edits make sense.
    return `Project id: ${projectId}\n\nUser request:\n${prompt}\n\nNow write the complete, runnable app as <file> blocks per the system instructions.`;
  }

  private emit(jobId: string, ev: StreamEvent) {
    const rt = this.jobs.get(jobId);
    if (!rt) return;
    rt.events.push(ev);
    for (const sub of rt.subscribers) {
      try {
        sub(ev);
      } catch {
        // subscriber died — ignore
      }
    }
  }

  /** Subscribe to a job's event stream from a given index. Returns unsubscribe + snapshot. */
  subscribe(
    jobId: string,
    fromIndex: number,
    onEvent: (ev: StreamEvent) => void
  ): { unsubscribe: () => void; snapshot: StreamEvent[]; finished: boolean } {
    const rt = this.jobs.get(jobId);
    if (!rt) {
      return { unsubscribe: () => {}, snapshot: [], finished: true };
    }
    const snapshot = rt.events.slice(fromIndex);
    rt.subscribers.add(onEvent);
    return {
      unsubscribe: () => rt.subscribers.delete(onEvent),
      snapshot,
      finished: rt.finished,
    };
  }

  /** Get current event count (for clients to track their cursor). */
  getEventCount(jobId: string): number {
    return this.jobs.get(jobId)?.events.length ?? 0;
  }

  isRunning(jobId: string): boolean {
    const rt = this.jobs.get(jobId);
    return !!rt && !rt.finished;
  }

  getActiveJobForProject(projectId: string): string | undefined {
    const id = this.activeByProject.get(projectId);
    if (!id) return undefined;
    const rt = this.jobs.get(id);
    if (!rt || rt.finished) return undefined;
    return id;
  }

  /** Cancel an in-flight job. */
  async cancel(jobId: string) {
    const rt = this.jobs.get(jobId);
    if (!rt) return;
    rt.controller.abort();
  }

  private serializeJob(j: {
    id: string;
    projectId: string;
    status: string;
    prompt: string;
    tokensUsed: number;
    filesCompleted: number;
    error: string | null;
    startedAt: Date;
    finishedAt: Date | null;
  }): GenerationJobRecord {
    return {
      id: j.id,
      projectId: j.projectId,
      status: j.status as GenerationJobRecord["status"],
      prompt: j.prompt,
      tokensUsed: j.tokensUsed,
      filesCompleted: j.filesCompleted,
      error: j.error,
      startedAt: j.startedAt.toISOString(),
      finishedAt: j.finishedAt ? j.finishedAt.toISOString() : null,
    };
  }
}

// Singleton — lives for the lifetime of the server process.
// (On serverless this would be per-instance; documented MVP tradeoff.)
const globalForJobs = globalThis as unknown as { jobManager?: JobManager };
export const jobManager = globalForJobs.jobManager ?? new JobManager();
if (process.env.NODE_ENV !== "production") globalForJobs.jobManager = jobManager;

export { JobManager };

// --- async generator helpers for the fallback probe pattern ---

async function* emptyGen(): AsyncGenerator<string, void, unknown> {
  // intentionally empty
}

async function* prependGen(
  first: string,
  rest: AsyncGenerator<string, void, unknown>
): AsyncGenerator<string, void, unknown> {
  yield first;
  yield* rest;
}

