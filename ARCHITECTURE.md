# Architecture

> Detailed technical architecture for Swift Tasks. Read this before contributing to understand the design decisions and isolation boundaries.

---

## Table of Contents

- [High-Level Diagram](#high-level-diagram)
- [Core Principles](#core-principles)
- [Project Isolation](#project-isolation)
- [Generation Pipeline](#generation-pipeline)
- [State Management](#state-management)
- [Streaming Protocol](#streaming-protocol)
- [Error Handling & Auto-Fallback](#error-handling--auto-fallback)
- [Database Schema](#database-schema)
- [Security Model](#security-model)
- [Architectural Tradeoffs](#architectural-tradeoffs)

---

## High-Level Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (Client)                      │
│                                                           │
│  ┌──────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ Sidebar  │  │   Chat Panel     │  │ Preview Panel │ │
│  │ (project │  │  (messages +     │  │ (sandboxed    │ │
│  │   list)  │  │   generation log)│  │  iframe)      │ │
│  └────┬─────┘  └────────┬─────────┘  └───────┬───────┘ │
│       │                 │                    │          │
│       │     ┌───────────┴────────────┐       │          │
│       │     │ Per-Project Zustand    │       │          │
│       │     │ Store (by projectId)   │       │          │
│       │     │  - files               │       │          │
│       │     │  - messages            │       │          │
│       │     │  - live (stream state) │       │          │
│       │     └───────────┬────────────┘       │          │
│       │                 │                    │          │
│       │     SSE (EventSource)               │          │
│       │                 │                    │          │
└───────┼─────────────────┼────────────────────┼──────────┘
        │                 │                    │
        │ HTTP            │ SSE                │ (isolated)
        ▼                 ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│                   Next.js Server                          │
│                                                           │
│  ┌─────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │ API Routes  │  │  JobManager      │  │ Prisma     │ │
│  │ (handlers)  │──│  (singleton)     │──│ (SQLite)   │ │
│  │             │  │  - Map<jobId>    │  │            │ │
│  │ - projects  │  │  - Map<projId>   │  │ - Project  │ │
│  │ - files     │  │  - ring buffer   │  │ - File     │ │
│  │ - generate  │  │  - subscribers   │  │ - Message  │ │
│  │ - vault     │  │  - AbortCtrl     │  │ - Job      │ │
│  │ - deploy    │  └────────┬─────────┘  │ - ApiKey   │ │
│  └─────────────┘           │            │ - Vault    │ │
│                            │            │ - Deploy   │ │
│                            ▼            └────────────┘ │
│              ┌─────────────────────────┐                │
│              │  streamGeneration()     │                │
│              │  - AI SDK (BYOK)        │                │
│              │  - z-ai-sdk (fallback)  │                │
│              │  - FileStreamParser     │                │
│              └─────────────────────────┘                │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │  External LLM Provider  │
              │  (OpenRouter/OpenAI/    │
              │   Anthropic/Groq/...)   │
              └─────────────────────────┘
```

---

## Core Principles

### 1. Isolation Boundary = `projectId`

This is the #1 code review criterion. **Every** store, cache key, DB query, socket room, and sandbox instance must be namespaced by `projectId`. There is no global "current project" concept for project content.

### 2. Jobs Run Detached

Generation jobs run server-side and **detached from the client connection**. `startJob()` kicks off an async `runJob()` that is NOT awaited. Closing the browser tab does not kill the generation — it keeps writing files to the DB. The client reattaches to whatever job is in flight via SSE.

### 3. Per-Project Store Instances

Zustand stores are created per-project via a factory + registry pattern. Each project gets its OWN independent store instance. Switching projects = unmounting one store's subscribers and mounting another's. State can NEVER bleed because the stores don't share memory.

### 4. Auto-Fallback

When a BYOK provider fails with a configuration, auth, region, or network error, the system automatically retries with the platform model. The user always gets a working result even with a broken key config.

### 5. Keys Never Leave Server in Plaintext

API keys are AES-256-GCM encrypted at rest. Only masked values are returned to the client. The `/vault/[id]/reveal` endpoint is the only place plaintext is returned, and it requires an explicit user action.

---

## Project Isolation

### The Problem

Two projects generating simultaneously must not cross-contaminate tokens, files, or chat messages. Switching between projects must not leak state.

### The Solution

```
src/store/project-stores.ts

// Registry: Map<projectId, UseBoundStore<StoreApi<ProjectState>>>
const registry = new Map<string, UseBoundStore<StoreApi<ProjectState>>>();

export function getProjectStore(projectId: string) {
  let store = registry.get(projectId);
  if (!store) {
    store = createProjectStore(projectId);  // Factory creates isolated instance
    registry.set(projectId, store);
  }
  return store;
}
```

Each store instance has its own:
- `files: ProjectFile[]`
- `messages: ChatMessage[]`
- `live: { jobId, isRunning, tokens, filesStreaming, ... }`
- `project: ProjectSummary | null`

The global `app-store.ts` holds ONLY app-level concerns:
- `projects: ProjectSummary[]` (sidebar list)
- `activeProjectId: string | null`
- `apiKeys: ApiKeyConfigPublic[]`
- UI flags (settingsOpen, deployOpen, vaultOpen, commandPaletteOpen)

It **NEVER** holds per-project content.

### Switching Projects

When `activeProjectId` changes:

1. **Workspace component** re-binds via `key={activeProjectId}` → React unmounts old, mounts new
2. **`useProjectWorkspace(projectId)`** hook:
   - Hydrates the new project's store from the API
   - Closes the old project's EventSource (stream detached)
   - If the new project has an in-flight job, reattaches to its SSE stream
3. **Server-side**: the old project's JobManager keeps running (detached). The new project's job (if any) also keeps running.

---

## Generation Pipeline

### Flow

```
1. User submits prompt
   → POST /api/projects/[id]/generate { prompt }

2. API handler:
   → Load project's modelConfig from DB
   → Build conversation history (last 20 messages)
   → JobManager.startJob({ projectId, prompt, config, history })
   → Returns { job } immediately (generation continues detached)

3. JobManager.startJob():
   → Create GenerationJob record (status: "running")
   → Emit initial "job" event
   → Call runJob() WITHOUT await (detached)
   → Return job record

4. JobManager.runJob() (async, detached):
   → resolveApiKey() — decrypt key + get saved key's baseURL
   → streamGeneration() — async generator over text deltas
   → For each delta:
     → Emit "token" event
     → FileStreamParser.feed(chunk) → extract <file> tags
     → On file_done: persistFileContent() to DB (scoped by projectId)
     → Emit "file_done" event
   → On completion: update job status, emit "done"
   → On error: handleJobError() → auto-fallback or surface error

5. Client:
   → EventSource connects to /generate/stream?jobId=X&from=0
   → For each SSE event: applyStreamEvent(ev) → per-project store update
   → On "done": reconcile files from DB (authoritative)
```

### FileStreamParser

The incremental parser extracts `<file path="...">content</file>` blocks from the streaming text buffer. It emits lifecycle events as the model writes each file:

- `file_start` — opening tag detected
- `file_content` — content chunk (partial)
- `file_done` — closing tag detected, full content available

The parser handles:
- Partial tags (holds back buffer to avoid splitting tags across chunks)
- Multiple files in one stream
- Unterminated final file (flush on stream end)
- Duplicate paths (tracks "added" vs "modified" action)

---

## State Management

### Store Hierarchy

```
useAppStore (global, singleton)
  ├── projects: ProjectSummary[]          ← sidebar list
  ├── activeProjectId: string | null       ← which project is open
  ├── apiKeys: ApiKeyConfigPublic[]        ← BYOK keys (masked)
  ├── settingsOpen / deployOpen / vaultOpen / commandPaletteOpen
  └── pendingPrompt                        ← welcome→new-project handoff

getProjectStore(projectId) (per-project, factory + registry)
  ├── project: ProjectSummary | null
  ├── files: ProjectFile[]
  ├── messages: ChatMessage[]
  ├── live: { jobId, isRunning, tokens, filesStreaming, completedFiles, ... }
  └── hydrated: boolean
```

### Why Not Redux?

Zustand's per-instance store model maps directly onto "one isolated context per project". With Redux, you'd need to simulate isolation inside a monolithic store with selectors keyed by `projectId` — error-prone and verbose. Zustand gives you isolation almost for free.

---

## Streaming Protocol

### SSE Endpoint

`GET /api/projects/[id]/generate/stream?jobId=X&from=N`

- `jobId` — the job to tail
- `from` — event index to start from (for reconnect/reattach)

### Event Types

| Event | Description |
|---|---|
| `job` | Job record (status, tokens, files) |
| `token` | Text delta from the LLM |
| `file_start` | Started writing a file |
| `file_content` | File content chunk (partial) |
| `file_done` | File complete (full content available) |
| `status` | Status update (tokens, files, step) |
| `error` | Generation error |
| `done` | Job finished (includes final job record) |
| `heartbeat` | Keep-alive (every 15s) |

### Reconnect/Reattach

The JobManager maintains an in-memory ring buffer of all events for each job. When a client connects with `from=N`, it receives:
1. All buffered events from index N (replay)
2. Live events as they occur
3. The stream closes on `done` (or after replay if the job already finished)

This makes reattach trivial: the client just sends its last-seen cursor, and the server fills the gap.

---

## Error Handling & Auto-Fallback

### Error Codes

| Code | Description | Triggers Fallback? |
|---|---|---|
| `NO_BASE_URL` | Custom provider missing base URL | ✅ |
| `NO_KEY` | No API key for the provider | ✅ |
| `REGION_BLOCKED` | 403 from provider (geo-restriction) | ✅ |
| `AUTH` | 401 — invalid key | ✅ |
| `NETWORK` | Can't reach endpoint | ✅ |
| `RATE_LIMIT` | 429 — quota exceeded | ❌ |
| `MODEL` | Model not found | ❌ |
| `CANCELLED` | User stopped generation | ❌ |
| `PROVIDER` | Generic provider error | ❌ |

### Auto-Fallback Flow

```
streamGeneration(config) → try first chunk
  ↓ fails with fallback-eligible error
catch (configErr):
  if ce.code in [NO_BASE_URL, NO_KEY, REGION_BLOCKED, AUTH, NETWORK]:
    → Emit status: "BYOK failed (code), falling back to platform model…"
    → streamGeneration({ provider: "platform", model: "glm-4.6" })
    → Continue generation with platform model
  else:
    → throw (surface error to user)
```

### fullStream vs textStream

The Vercel AI SDK v4's `textStream` can end silently without throwing when there's an API error. We use `fullStream` instead, which yields `{ type: "error", error }` events that we can catch and normalize.

---

## Database Schema

```
User
  ├── Project (projectId namespace)
  │   ├── ProjectFile      (versioned, unique [projectId, path])
  │   ├── ProjectMessage   (chat history, scoped by projectId)
  │   ├── GenerationJob    (detached job state, scoped by projectId)
  │   └── Deployment       (deploy history, scoped by projectId)
  ├── ApiKeyConfig         (BYOK keys, encrypted, unique [userId, label])
  └── VaultEntry           (secure vault, encrypted)
```

All models are namespaced by either `userId` or `projectId`. Cascade deletes ensure no orphaned data.

---

## Security Model

### API Key Encryption

```
plaintext key
  → AES-256-GCM encrypt(key=ENCRYPTION_KEY, iv=random 12 bytes)
  → "iv:authTag:ciphertext" (base64)
  → stored in DB.encryptedKey

masked key (for display)
  → "sk-…Ab12" (first 3 + last 4 chars)
  → stored in DB.maskedKey
  → returned to client
```

### Preview Sandbox

- `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"`
- No access to parent window's cookies/localStorage/session
- Console bridged via one-way `postMessage` (iframe → parent only)
- Strict CSP via meta tag inside iframe content

---

## Architectural Tradeoffs

### 1. In-Process JobManager vs. BullMQ+Redis

**Choice**: In-process singleton `JobManager` with detached async runners.

**Why**: Simpler, no external dependencies. Works for a single long-running dev server.

**Tradeoff**: A server *process* restart loses in-flight jobs (marked failed on next status check). For a true durable worker, move to BullMQ + Upstash Redis. The `JobManager` interface is shaped to make that swap clean — `startJob`, `subscribe`, `cancel` map directly to BullMQ's API.

### 2. Prisma+SQLite vs. MongoDB

**Choice**: Prisma + SQLite with JSON columns for document-shaped data.

**Why**: Matches the existing project scaffold. Isolation unchanged (projectId on every row + cascade deletes).

**Tradeoff**: SQLite is single-writer. For high concurrency, upgrade to PostgreSQL (Prisma makes this a config change).

### 3. Custom Sandboxed Iframe vs. Sandpack

**Choice**: Custom iframe with HTML/CSS/JS inlining.

**Why**: More reliable for arbitrary self-contained generated apps (CDN React + Babel). Full control over CSP, console bridge, and auto-refresh.

**Tradeoff**: Doesn't support npm-based React apps out of the box. Sandpack is installed but unused — could be wired in for React-template apps.

### 4. SSE vs. WebSocket

**Choice**: SSE via Route Handlers.

**Why**: Simpler for unidirectional server→client streaming. Auto-reconnects. The ring buffer makes reattach-from-cursor trivial.

**Tradeoff**: SSE is one-way. If we need client→server streaming (e.g., real-time tool calls), WebSocket would be needed.

### 5. Single Implicit Local User vs. NextAuth

**Choice**: Single implicit local user.

**Why**: The spec's isolation feature is per-project, not per-user. Full multi-user auth is a later concern.

**Tradeoff**: No multi-tenancy. The `userId` column is in place so adding NextAuth later is additive.
