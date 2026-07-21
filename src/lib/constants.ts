// Provider catalog, model presets, and example prompts.
import type { Provider } from "./types";

export interface ProviderDef {
  id: Provider;
  label: string;
  description: string;
  docsUrl: string;
  defaultBaseURL?: string;
  /** whether the user must supply their own key */
  byok: boolean;
  models: { id: string; label: string; contextWindow?: string }[];
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "platform",
    label: "Swift Tasks (Platform Demo)",
    description:
      "No key required. Uses the built-in platform model so you can try the app instantly. Best for demos; bring your own key for production use.",
    docsUrl: "",
    byok: false,
    models: [
      { id: "glm-4.6", label: "GLM-4.6", contextWindow: "128K" },
      { id: "glm-4.5", label: "GLM-4.5", contextWindow: "128K" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "One key, access hundreds of models (Claude, GPT, Gemini, Llama, …).",
    docsUrl: "https://openrouter.ai/keys",
    defaultBaseURL: "https://openrouter.ai/api/v1",
    byok: true,
    models: [
      { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", contextWindow: "200K" },
      { id: "openai/gpt-4o", label: "GPT-4o", contextWindow: "128K" },
      { id: "google/gemini-flash-1.5", label: "Gemini Flash 1.5", contextWindow: "1M" },
      { id: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B", contextWindow: "128K" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Direct OpenAI API. Use any OpenAI-compatible base URL for self-hosted models.",
    docsUrl: "https://platform.openai.com/api-keys",
    defaultBaseURL: "https://api.openai.com/v1",
    byok: true,
    models: [
      { id: "gpt-4o", label: "GPT-4o", contextWindow: "128K" },
      { id: "gpt-4o-mini", label: "GPT-4o mini", contextWindow: "128K" },
      { id: "gpt-4.1", label: "GPT-4.1", contextWindow: "1M" },
      { id: "o3-mini", label: "o3-mini", contextWindow: "200K" },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Direct Anthropic Claude API.",
    docsUrl: "https://console.anthropic.com/settings/keys",
    defaultBaseURL: "https://api.anthropic.com",
    byok: true,
    models: [
      { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", contextWindow: "200K" },
      { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku", contextWindow: "200K" },
      { id: "claude-3-opus-latest", label: "Claude 3 Opus", contextWindow: "200K" },
    ],
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    description: "Any endpoint exposing /v1/chat/completions (vLLM, LM Studio, Ollama, …).",
    docsUrl: "",
    byok: true,
    models: [],
  },
];

export function getProvider(id: Provider): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export const EXAMPLE_PROMPTS = [
  {
    icon: " calc",
    title: "Tip Calculator",
    prompt:
      "Build a sleek tip calculator web app. Inputs for bill amount, tip percentage, and number of people. Live split-per-person display with smooth animations. Use a warm color palette.",
  },
  {
    icon: " list",
    title: "Kanban Board",
    prompt:
      "Create a kanban task board with three columns (To Do, In Progress, Done). Drag and drop cards between columns, add/edit/delete cards, persisted to localStorage. Clean modern UI.",
  },
  {
    icon: " clock",
    title: "Pomodoro Timer",
    prompt:
      "Build a pomodoro focus timer with 25-minute work / 5-minute break cycles. Circular progress ring, start/pause/reset, session counter, and a subtle notification when a cycle ends.",
  },
  {
    icon: " palette",
    title: "Color Palette Generator",
    prompt:
      "Make a color palette generator. Press space to generate a fresh 5-color palette. Click a swatch to copy its hex. Lock individual colors so they don't change on regenerate. Beautiful typography.",
  },
  {
    icon: " weather",
    title: "Weather Widget",
    prompt:
      "Build a weather dashboard widget with mock data. Show current temperature, condition icon, 5-day forecast, and hourly chart. Use a glassmorphism design with a gradient background.",
  },
  {
    icon: " markdown",
    title: "Markdown Editor",
    prompt:
      "Create a live markdown editor with a split view: editor on the left, rendered preview on the right. Support headings, bold, italic, lists, code blocks, and links. Toolbar with formatting buttons.",
  },
];

export const DEFAULT_SYSTEM_PROMPT = `You are Swift Tasks, an elite front-end engineer that turns natural-language descriptions into complete, runnable single-page web apps.

You ALWAYS respond by writing files inside <file> tags using this EXACT format:

<file path="src/App.tsx">
// full file content here
</file>

Rules:
1. Output ONLY <file> blocks. You may add a single short sentence before the first file describing what you're building — nothing else outside tags.
2. The entry file MUST be named exactly "index.html" for plain HTML/CSS/JS apps, OR a React app with "index.html", "index.js" (or "src/index.js"), and inline Babel for JSX. Keep everything self-contained and runnable in a browser sandbox with no build step.
3. For React apps, include React & ReactDOM via CDN <script> tags and use type="text/babel" with the Babel standalone CDN. Do NOT use import/export or npm packages.
4. Use modern, clean, responsive UI. Prefer system font stacks. Add subtle transitions. Never use indigo or blue as the primary brand color unless asked.
5. Make the app genuinely functional and polished — real interactivity, good empty states, accessible markup.
6. Keep each file focused. Split CSS and JS into separate files when the app grows.
7. Do not explain the code in prose beyond the one opening sentence.

Remember: every file must be wrapped in its own <file path="..."> ... </file> tag, and the path must be a clean relative path.`;
