# Swift Tasks

> **Describe it. Watch it get built.** — A browser-based AI vibe-coding platform where a user describes what they want in natural language, and an LLM generates a full website/app in real time. The user watches the code being written live and sees a live rendered preview updating as generation completes.

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-teal)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-indigo)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Security](#security)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Swift Tasks is a **BYOK (Bring Your Own Key)** vibe-coding platform. Users plug in their own API key (OpenRouter, OpenAI, Anthropic, or any OpenAI-compatible endpoint) and the platform streams code generation in real time. The single most important structural feature is **multiple projects with fully isolated context** — a user can have many projects open, and switching between them never leaks chat history, generated files, model settings, or in-progress generation state.

### What makes it different

| Feature | Swift Tasks | Typical AI Code Tools |
|---|---|---|
| **BYOK** | ✅ User's own key, AES-256 encrypted | ❌ Platform-paid inference |
| **Live streaming** | ✅ Token-by-token, per-file diffs | ❌ Final output only |
| **Live preview** | ✅ Sandboxed iframe, auto-refresh | ❌ Manual rebuild |
| **Project isolation** | ✅ Per-project Zustand stores | ❌ Global singleton |
| **Detached jobs** | ✅ Survives tab close/switch | ❌ Dies on disconnect |
| **Auto-fallback** | ✅ Falls back to platform model | ❌ Hard failure |
| **Deploy** | ✅ One-click Netlify + ZIP + copy | ❌ Manual export |

---

## Key Features

### 1. BYOK API Key Configuration
- Supports OpenRouter, OpenAI, Anthropic, and any OpenAI-compatible endpoint (Groq, Together, Fireworks, DeepSeek, Mistral, Ollama, LM Studio, vLLM, etc.)
- Keys are **AES-256-GCM encrypted at rest** — never logged, never sent to any third party besides the configured base URL
- Per-project model override: each project can use a different model/key than the account default
- **Auto-fetches available models** from the provider's `/models` endpoint when a key is pasted
- Inline key validation with clear error messages (401, 403, rate-limited, bad base URL)
- Manual model ID entry for custom/arbitrary models

### 2. Live Coding Process View
- **Token-by-token streaming** via SSE — like watching someone type in a terminal
- Per-file collapsible diffs ("Writing `src/App.tsx`...")
- Running status: current step, files completed, tokens used, elapsed time, progress bar
- Raw token stream terminal with blinking cursor
- **Resumable** — closing the tab doesn't kill the server-side job; reopening reattaches to the in-flight stream

### 3. Live Preview
- **Sandboxed iframe** with `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"`
- Self-contained HTML document with all CSS/JS inlined
- **Auto-refresh** on every meaningful file write (debounced), with manual "Rebuild" button
- Console bridge captures `console.log/warn/error` from the iframe via `postMessage`
- Code / Preview / Split view toggle
- Monaco Editor (VS Code engine) with syntax highlighting, file tree, versioned saves

### 4. Multiple Projects with Isolated Context (the critical feature)
Each project is a fully self-contained unit with its own:
1. **Chat/conversation history** (full prompt trail)
2. **Virtual file system** (every generated file, content, and version history)
3. **Model configuration** (provider, model, temperature, system prompt overrides)
4. **Live generation/session state** (in-progress stream, last checkpoint)
5. **Preview sandbox instance** (torn down/rehydrated on switch, never shared)

**Design**: State is keyed by `projectId` everywhere — in the Zustand store registry, in the DB, in the streaming connection, in the sandbox. No global singleton stores. Switching projects pauses/detaches the current stream without killing the server-side job, tears down the sandbox, hydrates the new project instantly, and reattaches to the new project's stream if still running.

### 5. One-Click Deploy
- **Netlify**: paste a free token, get a live `*.netlify.app` URL in seconds
- **Download ZIP**: with step-by-step guides for Vercel, Cloudflare Pages, Surge, GitHub Pages
- **Copy standalone HTML**: self-contained document for pasting anywhere
- Deploy history with live URLs

### 6. Secure Vault
- AES-256-GCM encrypted storage for arbitrary API keys, tokens, passwords, and notes
- 5 categories (API Key, Token, Password, Note, Other) with icons
- Values masked by default, revealed only on explicit click
- Search by label/note

### 7. Keyboard Shortcuts & Command Palette
- `⌘K` — Command palette (switch projects, run commands, pick templates)
- `⌘B` — Toggle sidebar
- `⌘,` — Settings
- `⌘S` — Save current file
- `⌘↵` — Generate

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Framework** | Next.js 16 (App Router) | Route Handlers double as the streaming/API backend; SSR for fast-loading shell |
| **Language** | TypeScript 5 | Shared types prevent project-state mismatch bugs |
| **Styling** | Tailwind CSS 4 + shadcn/ui | Fast polished UI without heavy design system; no dependency lock-in |
| **Code editor** | Monaco Editor | VS Code engine — real syntax highlighting, diffing, minimap |
| **LLM streaming** | Vercel AI SDK (`ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic`) | Industry-standard for OpenAI-compatible streaming, Anthropic, custom base URLs |
| **State management** | Zustand (per-project store factory) | Per-instance store model maps directly onto "one isolated context per project" |
| **Database** | Prisma ORM + SQLite | Document-shaped domain mapped to relational tables with JSON columns |
| **Job queue** | In-process `JobManager` singleton | Detached async runners survive client disconnects; clean swap path to BullMQ+Redis |
| **Secrets** | AES-256-GCM via Node `crypto` | Cheap, correct, auditable |
| **Preview** | Custom sandboxed iframe with inlining | Full control over CSP, console bridge, auto-refresh |
| **Export** | JSZip | Server-side ZIP generation for project export + deploy |

---

## Quick Start

### Prerequisites

- **Node.js 18+** or **Bun** (recommended)
- An API key from one of: OpenRouter, OpenAI, Anthropic, Groq, or any OpenAI-compatible endpoint

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd swift-tasks

# Install dependencies
bun install

# Set up the database
bun run db:push

# Generate an encryption key for API key storage
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

# Start the dev server
bun run dev
```

Open `http://localhost:3000` in your browser.

### First Run

1. Click the **Settings** icon (⚙️) in the topbar
2. Select a provider (e.g., OpenRouter)
3. Paste your API key — models auto-fetch from the provider
4. Select a model and click **Save & Make Default**
5. Click **New Project** or pick an example template
6. Describe what you want to build and watch it generate live!

> **No key?** The platform includes a free demo model (GLM-4.6) that works without any configuration.

---

## Project Structure

```
swift-tasks/
├── prisma/
│   └── schema.prisma              # Database schema (7 models, all namespaced by projectId)
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── api/                   # API Route Handlers (all force-dynamic, nodejs runtime)
│   │   │   ├── projects/          # Project CRUD + files + generate + deploy
│   │   │   │   └── [id]/
│   │   │   │       ├── generate/  # POST: start job | stream/: SSE endpoint
│   │   │   │       ├── files/     # PUT: upsert | DELETE: remove | PATCH: rename
│   │   │   │       ├── export/    # GET: ZIP download
│   │   │   │       ├── deploy/    # GET: list | POST: record | netlify/: POST
│   │   │   │       └── stop/      # POST: cancel active job
│   │   │   ├── settings/
│   │   │   │   └── api-keys/      # GET/POST: list/save | test/: validate | models/: fetch
│   │   │   ├── vault/             # GET/POST: list/create | [id]/: PATCH/DELETE | reveal/: decrypt
│   │   │   └── health/            # GET: liveness + crypto self-test
│   │   ├── layout.tsx             # Root layout (ThemeProvider, Toaster)
│   │   ├── page.tsx               # Single route — renders <AppShell />
│   │   └── globals.css            # Tailwind + custom animations (aurora, gradient-text, etc.)
│   ├── components/
│   │   ├── app-shell.tsx          # Top-level orchestrator (sticky footer layout)
│   │   ├── topbar.tsx             # Brand, model selector, new/deploy/vault/settings buttons
│   │   ├── model-selector.tsx     # Per-project dynamic model picker
│   │   ├── status-bar.tsx         # Sticky footer with status + encryption indicator
│   │   ├── command-palette.tsx    # Cmd+K palette
│   │   ├── welcome-screen.tsx     # Hero + example prompts (aurora gradient)
│   │   ├── sidebar/
│   │   │   └── project-sidebar.tsx# Project list with status, rename, delete, export
│   │   ├── chat/
│   │   │   ├── chat-panel.tsx     # Message history + prompt input + generation log
│   │   │   ├── chat-message.tsx   # User/assistant/error message bubbles
│   │   │   └── generation-log.tsx # Live "watch code get written" panel
│   │   ├── workspace/
│   │   │   ├── workspace.tsx      # Decides empty/split view (flex-1, h-full)
│   │   │   ├── workspace-panel.tsx# Code/Preview/Split toggle
│   │   │   ├── code-view.tsx      # File tree + Monaco editor + delete/rename
│   │   │   └── preview-view.tsx   # Sandboxed iframe with inlining + console bridge
│   │   ├── settings/
│   │   │   └── settings-dialog.tsx# BYOK form: provider, key, model, base URL, test
│   │   ├── deploy-dialog.tsx      # One-click Netlify + ZIP + copy HTML
│   │   ├── vault-dialog.tsx       # Secure encrypted vault for keys/tokens/notes
│   │   └── theme-provider.tsx     # next-themes wrapper
│   ├── hooks/
│   │   ├── use-project-workspace.ts  # Hydrate + reattach SSE + sendPrompt/stop/saveFile
│   │   ├── use-keyboard-shortcuts.ts # Global Cmd+K/B/,/S/Enter handler
│   │   ├── use-toast.ts
│   │   └── use-mobile.ts
│   ├── lib/
│   │   ├── types.ts               # Shared TS types (ProjectSummary, StreamEvent, ModelConfig, ...)
│   │   ├── crypto.ts              # AES-256-GCM encrypt/decrypt/maskKey/verifyCrypto
│   │   ├── constants.ts           # Provider catalog, model presets, example prompts, system prompt
│   │   ├── file-parser.ts         # FileStreamParser: incremental <file> tag extraction
│   │   ├── llm.ts                 # Unified streamGeneration() + validateKey() + error normalization
│   │   ├── job-manager.ts         # Detached JobManager singleton (the highest-risk component)
│   │   ├── db.ts                  # Prisma client singleton
│   │   ├── user.ts                # Implicit local user helper
│   │   ├── file-tree.ts           # Flat→nested tree builder, language detector
│   │   └── utils.ts               # cn() class merge
│   ├── store/
│   │   ├── project-stores.ts      # Per-project Zustand store factory + registry (isolation boundary)
│   │   └── app-store.ts           # Global app store (projects list, apiKeys, UI flags — NO project content)
│   └── components/ui/             # shadcn/ui component library (pre-installed)
├── prisma/schema.prisma
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── eslint.config.mjs
├── Caddyfile                      # Gateway config
└── .env                           # DATABASE_URL + ENCRYPTION_KEY
```

---

## Architecture

For a detailed architecture overview, see [ARCHITECTURE.md](ARCHITECTURE.md).

### Core Design Principles

1. **Isolation boundary = `projectId`** — Every store, cache key, DB query, socket room, and sandbox instance is namespaced by it.
2. **Jobs run server-side and detached** — A generation keeps running even if the user closes the tab or switches projects.
3. **Per-project store instances** — `createProjectStore(projectId)` factory + `Map<projectId, store>` registry. No global singleton stores for project content.
4. **Auto-fallback** — BYOK config/auth/region errors automatically retry with the platform model so the user always gets a result.
5. **Keys never leave the server in plaintext** — AES-256-GCM encryption at rest; masked-only responses to the client.

### Data Flow

```
User prompt → POST /api/projects/[id]/generate
  → JobManager.startJob() (detached async runner)
    → streamGeneration() (Vercel AI SDK / platform SDK)
      → Token stream → FileStreamParser → DB persistence (scoped by projectId)
      → SSE events → in-memory ring buffer → subscribers
  ← Returns job record immediately

Client → GET /api/projects/[id]/generate/stream?jobId=X&from=N
  → Tails job's event buffer → replays missed events → pushes live
  → Client applyStreamEvent() → per-project store update → UI re-render
```

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLite database path (e.g., `file:./db/custom.db`) |
| `ENCRYPTION_KEY` | ✅ | 32-byte hex key (64 chars) for AES-256-GCM encryption |

Generate an encryption key:
```bash
openssl rand -hex 32
```

### Provider Configuration

The platform supports 5 provider types:

| Provider | Base URL | Key Required | Notes |
|---|---|---|---|
| `platform` | (built-in) | ❌ | Free demo model (GLM-4.6) |
| `openrouter` | `https://openrouter.ai/api/v1` | ✅ | 100+ models via one key |
| `openai` | `https://api.openai.com/v1` | ✅ | Direct OpenAI API |
| `anthropic` | `https://api.anthropic.com` | ✅ | Direct Claude API |
| `custom` | User-specified | ✅ | Any OpenAI-compatible endpoint |

Common custom base URLs (presets in Settings):
- **Groq**: `https://api.groq.com/openai/v1`
- **Together AI**: `https://api.together.xyz/v1`
- **Fireworks**: `https://api.fireworks.ai/inference/v1`
- **DeepSeek**: `https://api.deepseek.com/v1`
- **Mistral**: `https://api.mistral.ai/v1`
- **Ollama (local)**: `http://localhost:11434/v1`
- **LM Studio (local)**: `http://localhost:1234/v1`

---

## API Reference

### Projects

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create a new project |
| `GET` | `/api/projects/[id]` | Get full project (config, files, messages, activeJob) |
| `PATCH` | `/api/projects/[id]` | Update name/description/modelConfig |
| `DELETE` | `/api/projects/[id]` | Delete project + cascade |

### Files

| Method | Endpoint | Description |
|---|---|---|
| `PUT` | `/api/projects/[id]/files` | Upsert a file (manual edit) |
| `DELETE` | `/api/projects/[id]/files?path=...` | Delete a file |
| `PATCH` | `/api/projects/[id]/files?path=...` | Rename a file |

### Generation

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/projects/[id]/generate` | Start a detached generation job |
| `GET` | `/api/projects/[id]/generate/stream?jobId=X&from=N` | SSE stream tail (reattach) |
| `POST` | `/api/projects/[id]/stop` | Cancel active job |

### Settings (API Keys)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/settings/api-keys` | List keys (masked only) |
| `POST` | `/api/settings/api-keys` | Save + validate + encrypt a key |
| `POST` | `/api/settings/api-keys/test` | Validate without saving |
| `POST` | `/api/settings/api-keys/models` | Fetch available models from provider |
| `DELETE` | `/api/settings/api-keys/[id]` | Remove a key |

### Vault

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/vault` | List vault entries (masked) |
| `POST` | `/api/vault` | Create encrypted entry |
| `PATCH` | `/api/vault/[id]` | Update entry |
| `DELETE` | `/api/vault/[id]` | Delete entry |
| `GET` | `/api/vault/[id]/reveal` | Decrypt + return plaintext (explicit only) |

### Deploy

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/projects/[id]/deploy` | List past deploys |
| `POST` | `/api/projects/[id]/deploy` | Record a deploy |
| `POST` | `/api/projects/[id]/deploy/netlify` | Deploy to Netlify (zip + upload) |
| `GET` | `/api/projects/[id]/export` | Download project as ZIP |

### SSE Event Protocol

The stream endpoint emits JSON events:

```typescript
type StreamEvent =
  | { type: "job"; job: GenerationJobRecord }
  | { type: "token"; text: string }
  | { type: "file_start"; path: string }
  | { type: "file_content"; path: string; chunk: string }
  | { type: "file_done"; path: string; action: "added" | "modified" }
  | { type: "status"; tokensUsed: number; filesCompleted: number; step: string }
  | { type: "done"; job: GenerationJobRecord }
  | { type: "error"; message: string; code?: string }
  | { type: "heartbeat" };
```

---

## Security

### API Key Encryption
- All API keys are encrypted with **AES-256-GCM** before database storage
- The encryption key comes from the `ENCRYPTION_KEY` environment variable (32 bytes / 64 hex chars)
- Keys are **never logged** and **never returned in plaintext** to the client
- Only masked values (e.g., `sk-…Ab12`) are returned in API responses
- The `/api/vault/[id]/reveal` endpoint is the ONLY endpoint that returns plaintext, requiring an explicit user action

### Preview Sandbox
- The live preview iframe uses `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"`
- The iframe has **no access** to the parent window's cookies, localStorage, or session
- A strict CSP is enforced via meta tag inside the iframe content
- Console output is bridged via `postMessage` (one-way: iframe → parent)

### Auto-Fallback Security
- When a BYOK provider fails with config/auth/region errors, the system automatically falls back to the platform model
- The user's API key is never sent to the fallback provider
- The original error is surfaced as a status note for transparency

---

## Deployment

### Deploying the Platform Itself

The platform is a standard Next.js app:

```bash
# Build
bun run build

# Start production server
bun run start
```

**Environment**: Set `DATABASE_URL` and `ENCRYPTION_KEY` in your production environment.

### Deploying Generated Projects

From within the app, click the **Deploy** button (🚀) in the topbar:

1. **Netlify** — Paste a Netlify personal access token, get a live URL in seconds
2. **Download ZIP** — With guides for Vercel, Cloudflare Pages, Surge, GitHub Pages
3. **Copy HTML** — Self-contained document for pasting anywhere

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

### Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start dev server (port 3000) |
| `bun run lint` | Run ESLint |
| `bun run build` | Production build |
| `bun run db:push` | Push schema to database |
| `bun run db:generate` | Generate Prisma client |
| `bun run db:migrate` | Create a migration |
| `bun run db:reset` | Reset database |

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [Next.js](https://nextjs.org/) — React framework
- [Vercel AI SDK](https://sdk.vercel.ai/) — LLM streaming
- [shadcn/ui](https://ui.shadcn.com/) — UI components
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — Code editor
- [Prisma](https://www.prisma.io/) — Database ORM
- [Zustand](https://zustand-demo.pmnd.rs/) — State management
- [JSZip](https://stuk.github.io/jszip/) — ZIP generation
