# Contributing

Thank you for your interest in contributing to Swift Tasks! This document covers development setup, code style, and PR guidelines.

---

## Development Setup

### Prerequisites

- **Node.js 18+** or **Bun** (recommended)
- **Git**

### Initial Setup

```bash
# Clone
git clone <repo-url>
cd swift-tasks

# Install dependencies
bun install

# Set up environment
echo "DATABASE_URL=file:./db/custom.db" >> .env
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

# Push database schema
bun run db:push

# Start dev server
bun run dev
```

Open `http://localhost:3000`.

### Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start dev server (port 3000, auto-restart on file changes) |
| `bun run lint` | Run ESLint (must pass before PR) |
| `bun run build` | Production build |
| `bun run db:push` | Push schema changes to database |
| `bun run db:generate` | Regenerate Prisma client after schema changes |
| `bun run db:migrate` | Create a named migration |
| `bun run db:reset` | Reset database (destructive) |

---

## Code Style

### TypeScript

- **Strict typing** throughout — no `any` unless absolutely necessary
- **Shared types** in `src/lib/types.ts` — used across client/server boundaries
- **ES6+ import/export** syntax
- **`'use client'` / `'use server'`** directives where appropriate

### React

- **Functional components** only (no class components)
- **Hooks** for state and effects
- **Rules of Hooks** strictly enforced (no conditional hooks)
- **shadcn/ui components** preferred over custom implementations
- **Framer Motion** for animations (hover, focus, page transitions)

### State Management

- **Zustand** for client state
- **Per-project stores** via `getProjectStore(projectId)` — NEVER a global singleton for project content
- **Global app store** (`useAppStore`) for app-level concerns ONLY (project list, API keys, UI flags)
- See [ARCHITECTURE.md](ARCHITECTURE.md) for the isolation boundary rules

### Styling

- **Tailwind CSS 4** with shadcn/ui (New York style)
- **No indigo or blue** as primary brand colors (per design spec)
- **Responsive design** — mobile-first with `sm:`, `md:`, `lg:`, `xl:` breakpoints
- **Sticky footer** — root wrapper uses `min-h-screen flex flex-col` with `mt-auto` on footer
- Use `cn()` from `@/lib/utils` for conditional class merging
- Use existing CSS custom properties (`bg-primary`, `text-muted-foreground`, etc.)

### File Organization

```
src/
├── app/api/          # Route handlers (server-side)
├── components/       # React components (client-side unless marked)
│   └── ui/           # shadcn/ui primitives (don't modify)
├── hooks/            # Custom React hooks
├── lib/              # Shared utilities (server + client safe)
├── store/            # Zustand stores
└── app/              # Next.js App Router pages + layouts
```

### Naming Conventions

- **Files**: `kebab-case.ts` / `kebab-case.tsx`
- **Components**: `PascalCase` (e.g., `ChatPanel`, `WorkspacePanel`)
- **Functions**: `camelCase` (e.g., `sendPrompt`, `resolveApiKey`)
- **Types/Interfaces**: `PascalCase` (e.g., `ProjectSummary`, `StreamEvent`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `PROVIDERS`, `DEFAULT_SYSTEM_PROMPT`)

---

## Key Review Criteria

When reviewing PRs, check:

1. **Isolation boundary** — Does the code namespace everything by `projectId`? No global singletons for project content?
2. **Error handling** — Are errors surfaced with actionable messages? Does the auto-fallback work?
3. **Keys/Secrets** — Are API keys encrypted at rest? Never logged? Never returned in plaintext?
4. **Responsive design** — Does the UI work on mobile + desktop? No overlapping components?
5. **Accessibility** — Semantic HTML, ARIA labels, keyboard navigation
6. **Lint passes** — `bun run lint` must be clean

---

## PR Process

1. **Create a branch**: `git checkout -b feat/your-feature` or `fix/your-bugfix`
2. **Write code** following the style above
3. **Test locally**: `bun run lint` + manual testing via browser
4. **Commit**: Use [conventional commits](https://www.conventionalcommits.org/):
   ```
   feat: add Vercel deploy integration
   fix: model selector not showing saved models
   docs: update ARCHITECTURE.md
   refactor: extract FileStreamParser to its own module
   ```
5. **Push and create a PR** with a clear description of what changed and why

---

## Adding a New Provider

To add a new LLM provider:

1. **Add to `PROVIDERS`** in `src/lib/constants.ts`:
   ```typescript
   {
     id: "your-provider",
     label: "Your Provider",
     description: "...",
     docsUrl: "https://...",
     defaultBaseURL: "https://api.your-provider.com/v1",
     byok: true,
     models: [{ id: "model-1", label: "Model 1", contextWindow: "128K" }],
   }
   ```

2. **Add to `streamGeneration()`** in `src/lib/llm.ts` if the provider needs special handling. For OpenAI-compatible providers, it just works via the `custom` path.

3. **Add base URL preset** to `CUSTOM_BASE_URL_PRESETS` if applicable.

4. **Test**: Add a key in Settings, verify model fetch works, verify generation works.

---

## Debugging

### Dev Server Logs

```bash
tail -f dev.log
```

### Browser Console

Open browser DevTools → Console. Filter by `error` to see issues.

### API Testing

```bash
# Health check
curl http://localhost:3000/api/health

# List projects
curl http://localhost:3000/api/projects

# Start a generation
curl -X POST http://localhost:3000/api/projects/<id>/generate \
  -H "content-type: application/json" \
  -d '{"prompt":"build a button"}'
```

### Common Issues

| Issue | Fix |
|---|---|
| Settings dialog crashes on open | Check for temporal dead zone errors in the component |
| Generation exits in <1s | Check dev.log for provider errors; verify baseURL matches saved key |
| Model not showing in selector | The model selector is dynamic — it shows presets + saved key models + current model |
| Preview not rendering | Ensure generated app has an `index.html` entry file |
| Duplicate React key warning | Dedupe arrays with `Array.from(new Set(arr))` before `.map()` |

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
