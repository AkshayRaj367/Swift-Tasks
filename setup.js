#!/usr/bin/env node

/**
 * Swift Tasks — Environment Setup Script
 * ========================================
 *
 * Run this once after cloning the repository to:
 *   1. Copy .env.example → .env (if .env doesn't already exist)
 *   2. Install dependencies (npm / yarn / bun / pnpm — auto-detected)
 *   3. Generate a random ENCRYPTION_KEY if one isn't set
 *   4. Print clear next steps
 *
 * Usage:
 *   node setup.js
 *
 * No external dependencies. Pure Node.js stdlib.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

// ─── ANSI color helpers ───────────────────────────────────────
// Each color is a function that wraps text with the ANSI code + reset.
const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
};

const log = {
  info: (msg) => console.log(`${c.cyan("ℹ")}  ${msg}`),
  success: (msg) => console.log(`${c.green("✓")}  ${msg}`),
  warn: (msg) => console.log(`${c.yellow("⚠")}  ${msg}`),
  error: (msg) => console.log(`${c.red("✗")}  ${msg}`),
  step: (msg) => console.log(`\n${c.bold(c.blue(`▸ ${msg}`))}`),
  dim: (msg) => console.log(`\x1b[90m  ${msg}\x1b[0m`),
};

const ROOT = path.resolve(__dirname);
const ENV_EXAMPLE = path.join(ROOT, ".env.example");
const ENV_FILE = path.join(ROOT, ".env");

// ─── Helpers ──────────────────────────────────────────────────

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function readFile(p) {
  return fs.readFileSync(p, "utf-8");
}

function writeFile(p, content) {
  fs.writeFileSync(p, content, "utf-8");
}

/**
 * Detect which package manager is available (prefer bun > yarn > pnpm > npm).
 */
function detectPackageManager() {
  const managers = ["bun", "yarn", "pnpm", "npm"];
  for (const m of managers) {
    try {
      execSync(`${m} --version`, { stdio: "ignore", shell: true });
      return m;
    } catch {
      // not available
    }
  }
  return "npm"; // fallback
}

/**
 * Detect if a lockfile exists and return the corresponding manager.
 */
function detectFromLockfile() {
  if (fileExists(path.join(ROOT, "bun.lock"))) return "bun";
  if (fileExists(path.join(ROOT, "bun.lockb"))) return "bun";
  if (fileExists(path.join(ROOT, "yarn.lock"))) return "yarn";
  if (fileExists(path.join(ROOT, "pnpm-lock.yaml"))) return "pnpm";
  if (fileExists(path.join(ROOT, "package-lock.json"))) return "npm";
  return null;
}

function runInstall(manager) {
  const commands = {
    bun: "bun install",
    yarn: "yarn install",
    pnpm: "pnpm install",
    npm: "npm install",
  };
  const cmd = commands[manager] || commands.npm;
  log.info(`Running: ${c.dim(cmd)}`);
  try {
    execSync(cmd, { stdio: "inherit", cwd: ROOT, shell: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run the Prisma db:push command to create/migrate the database schema.
 * This is cross-platform (works on Windows, macOS, Linux).
 */
function runDbPush(manager) {
  const cmd = `${manager} run db:push`;
  log.info(`Running: ${c.dim(cmd)}`);
  try {
    execSync(cmd, { stdio: "inherit", cwd: ROOT, shell: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the db/ directory exists (for fresh clones where it's gitignored).
 */
function ensureDbDir() {
  const dbDir = path.join(ROOT, "db");
  if (!fileExists(dbDir)) {
    try {
      fs.mkdirSync(dbDir, { recursive: true });
      log.success(`Created db/ directory`);
    } catch {
      log.warn(`Could not create db/ directory. The db:push step will create it.`);
    }
  }
}

/**
 * Parse a .env file content into key=value lines (preserving comments + order).
 */
function parseEnv(content) {
  return content.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return { type: "comment", raw: line };
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) return { type: "comment", raw: line };
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return { type: "kv", key, value, raw: line };
  });
}

/**
 * Serialize env lines back to a string.
 */
function serializeEnv(lines) {
  return lines.map((l) => l.raw).join("\n");
}

// ─── Main ─────────────────────────────────────────────────────

function main() {
  const banner = (s) => c.bold(c.magenta(s));
  console.log(`\n${banner("╔══════════════════════════════════════════════════════╗")}`);
  console.log(`${banner("║         Swift Tasks — Environment Setup              ║")}`);
  console.log(`${banner("╚══════════════════════════════════════════════════════╝")}\n`);

  let hadErrors = false;

  // ── Step 1: Copy .env.example → .env ───────────────────────
  log.step("Step 1: Environment file");

  if (fileExists(ENV_FILE)) {
    log.warn(`An .env file already exists — leaving it untouched.`);
    log.dim(`  Path: ${c.gray(ENV_FILE)}`);
  } else if (!fileExists(ENV_EXAMPLE)) {
    log.warn(`No .env.example template found. Creating a minimal .env file.`);
    const minimal = `DATABASE_URL="file:./db/custom.db"\nENCRYPTION_KEY=""\n`;
    writeFile(ENV_FILE, minimal);
    log.success(`Created minimal .env file.`);
  } else {
    // Copy the template, then generate an encryption key.
    let content = readFile(ENV_EXAMPLE);
    const lines = parseEnv(content);

    // Generate a random ENCRYPTION_KEY if the template has an empty one.
    const genKey = crypto.randomBytes(32).toString("hex");
    let keyInjected = false;
    for (const line of lines) {
      if (line.type === "kv" && line.key === "ENCRYPTION_KEY" && !line.value) {
        line.raw = `ENCRYPTION_KEY="${genKey}"`;
        keyInjected = true;
      }
    }
    content = serializeEnv(lines);
    writeFile(ENV_FILE, content);
    log.success(`Created .env from .env.example`);
    if (keyInjected) {
      log.success(`Generated a random ENCRYPTION_KEY (AES-256-GCM)`);
      log.dim(`  Key: ${c.gray(genKey.slice(0, 8))}…${c.gray(genKey.slice(-8))} (64 hex chars)`);
    }
    log.dim(`  Path: ${c.gray(ENV_FILE)}`);
  }

  // ── Step 2: Install dependencies ───────────────────────────
  log.step("Step 2: Install dependencies");

  let manager = detectFromLockfile();
  if (manager) {
    log.info(`Detected lockfile for: ${c.bold(manager)}`);
  } else {
    manager = detectPackageManager();
    log.info(`No lockfile found. Using detected package manager: ${c.bold(manager)}`);
  }

  const installed = runInstall(manager);
  if (installed) {
    log.success(`Dependencies installed successfully.`);
  } else {
    log.error(`Dependency installation failed. Please run "${manager} install" manually.`);
    hadErrors = true;
  }

  // ── Step 3: Verify .env has required values ────────────────
  log.step("Step 3: Verify configuration");

  if (fileExists(ENV_FILE)) {
    const envContent = readFile(ENV_FILE);
    const envLines = parseEnv(envContent);
    const envVars = {};
    for (const l of envLines) {
      if (l.type === "kv") envVars[l.key] = l.value;
    }

    // Check DATABASE_URL
    if (envVars.DATABASE_URL) {
      log.success(`DATABASE_URL is set: ${c.dim(envVars.DATABASE_URL)}`);
    } else {
      log.warn(`DATABASE_URL is not set. Using default: file:./db/custom.db`);
    }

    // Check ENCRYPTION_KEY
    if (envVars.ENCRYPTION_KEY && envVars.ENCRYPTION_KEY.length === 64) {
      log.success(`ENCRYPTION_KEY is set (32 bytes / 64 hex chars)`);
    } else if (envVars.ENCRYPTION_KEY) {
      log.warn(`ENCRYPTION_KEY is set but should be 64 hex chars (32 bytes).`);
    } else {
      log.warn(`ENCRYPTION_KEY is empty.`);
    }
  }

  // ── Step 4: Create database schema ─────────────────────────
  log.step("Step 4: Initialize database");

  ensureDbDir();

  const dbPushed = runDbPush(manager);
  if (dbPushed) {
    log.success(`Database schema created successfully.`);
  } else {
    log.error(`Database setup failed. Please run "${c.bold(manager + " run db:push")}" manually.`);
    hadErrors = true;
  }

  // ── Summary & next steps ───────────────────────────────────
  console.log(`\n${c.bold("─".repeat(56))}\n`);

  if (hadErrors) {
    log.error(`Setup completed with errors. Please fix them before continuing.\n`);
    process.exit(1);
  }

  log.success(`${c.bold("Setup complete!")}\n`);

  console.log(`${c.bold("Next steps:")}\n`);
  console.log(`  ${c.cyan("1.")} (Optional) Add your API keys in the ${c.bold(".env")} file, or skip this`);
  console.log(`     and configure them later via the in-app Settings dialog.\n`);
  console.log(`  ${c.cyan("2.")} Start the development server:`);
  console.log(`     ${c.gray(`${manager} run dev`)}\n`);
  console.log(`  ${c.cyan("3.")} Open ${c.bold("http://localhost:3000")} in your browser.\n`);

  console.log(`${c.gray("Tip: A free demo model (GLM-4.6) works without any API keys.")}`);
  console.log(`${c.gray("     The database was automatically created by this setup script.")}\n`);
}

main();
