#!/usr/bin/env node

/**
 * Swift Tasks — Environment Setup Script
 * ========================================
 *
 * Run this once after cloning the repository to:
 *   1. Copy .env.example → .env (if .env doesn't already exist)
 *   2. Generate a random ENCRYPTION_KEY if one isn't set
 *   3. Install dependencies (auto-detects bun/yarn/pnpm/npm)
 *   4. Create the database schema (db:push)
 *   5. Print clear next steps
 *
 * Usage:
 *   node setup.js           # run setup, then prompt to start server
 *   node setup.js --start   # run setup, then auto-start the dev server
 *   node setup.js --no-start  # run setup, don't prompt to start
 *
 * Works on Windows, macOS, and Linux. Pure Node.js stdlib — no external deps.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

// ─── ANSI color helpers (functions that wrap text) ───────────
const isWindows = process.platform === "win32";
const useColor = process.stdout.isTTY || !isWindows;

function wrap(start) {
  return (s) => useColor ? `${start}${s}\x1b[0m` : s;
}
const c = {
  bold: wrap("\x1b[1m"),
  dim: wrap("\x1b[2m"),
  red: wrap("\x1b[31m"),
  green: wrap("\x1b[32m"),
  yellow: wrap("\x1b[33m"),
  blue: wrap("\x1b[34m"),
  magenta: wrap("\x1b[35m"),
  cyan: wrap("\x1b[36m"),
  gray: wrap("\x1b[90m"),
};

function logInfo(msg) { console.log(`${c.cyan("i")}  ${msg}`); }
function logSuccess(msg) { console.log(`${c.green("+")}  ${msg}`); }
function logWarn(msg) { console.log(`${c.yellow("!")}  ${msg}`); }
function logError(msg) { console.log(`${c.red("x")}  ${msg}`); }
function logStep(msg) { console.log(`\n${c.bold(c.blue(">> " + msg))}`); }
function logDim(msg) { console.log(`   ${c.gray(msg)}`); }

const ROOT = path.resolve(__dirname);
const ENV_EXAMPLE = path.join(ROOT, ".env.example");
const ENV_FILE = path.join(ROOT, ".env");

// ─── Helpers ──────────────────────────────────────────────────

function fileExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function detectPackageManager() {
  // Check lockfiles first
  if (fileExists(path.join(ROOT, "bun.lock"))) return "bun";
  if (fileExists(path.join(ROOT, "bun.lockb"))) return "bun";
  if (fileExists(path.join(ROOT, "yarn.lock"))) return "yarn";
  if (fileExists(path.join(ROOT, "pnpm-lock.yaml"))) return "pnpm";
  if (fileExists(path.join(ROOT, "package-lock.json"))) return "npm";
  // Fallback: check what's installed
  for (const m of ["bun", "yarn", "pnpm", "npm"]) {
    try {
      execSync(`${m} --version`, { stdio: "ignore", shell: true });
      return m;
    } catch { /* not available */ }
  }
  return "npm";
}

function runCommand(cmd) {
  try {
    execSync(cmd, { stdio: "inherit", cwd: ROOT, shell: true });
    return true;
  } catch {
    return false;
  }
}

function ensureDbDir() {
  // Not needed for Neon Postgres, but we keep the stub to avoid breaking anything
}

// ─── Main ─────────────────────────────────────────────────────

function main() {
  console.log("");
  console.log(c.bold(c.magenta("========================================")));
  console.log(c.bold(c.magenta("   Swift Tasks - Environment Setup")));
  console.log(c.bold(c.magenta("========================================")));
  console.log("");

  let hadErrors = false;

  // ── Step 1: Environment file ───────────────────────────────
  logStep("Step 1: Environment file");

  if (fileExists(ENV_FILE)) {
    logWarn(".env already exists - leaving it untouched");
  } else if (!fileExists(ENV_EXAMPLE)) {
    logWarn("No .env.example found - creating minimal .env");
    fs.writeFileSync(ENV_FILE, 'DATABASE_URL="postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require"\nENCRYPTION_KEY=""\n', "utf-8");
    logSuccess("Created minimal .env file");
  } else {
    let content = fs.readFileSync(ENV_EXAMPLE, "utf-8");
    // Generate a random ENCRYPTION_KEY
    const genKey = crypto.randomBytes(32).toString("hex");
    content = content.replace(
      /ENCRYPTION_KEY=""/,
      `ENCRYPTION_KEY="${genKey}"`
    );
    fs.writeFileSync(ENV_FILE, content, "utf-8");
    logSuccess("Created .env from .env.example");
    logSuccess("Generated ENCRYPTION_KEY (AES-256-GCM)");
    logDim("Key: " + genKey.slice(0, 8) + "..." + genKey.slice(-8));
  }

  // ── Step 2: Install dependencies ───────────────────────────
  logStep("Step 2: Install dependencies");

  const manager = detectPackageManager();
  logInfo("Using package manager: " + c.bold(manager));

  const installCmd = manager + " install";
  logInfo("Running: " + c.dim(installCmd));
  const installed = runCommand(installCmd);
  if (installed) {
    logSuccess("Dependencies installed");
  } else {
    logError("Dependency installation failed");
    logError('Please run "' + manager + ' install" manually');
    hadErrors = true;
  }

  // ── Step 3: Verify configuration ───────────────────────────
  logStep("Step 3: Verify configuration");

  if (fileExists(ENV_FILE)) {
    const envContent = fs.readFileSync(ENV_FILE, "utf-8");
    const dbMatch = envContent.match(/DATABASE_URL="([^"]*)"/);
    const keyMatch = envContent.match(/ENCRYPTION_KEY="([^"]*)"/);

    if (dbMatch && dbMatch[1]) {
      logSuccess("DATABASE_URL is set: " + c.dim(dbMatch[1]));
      if (!dbMatch[1].startsWith("postgresql://")) {
        logWarn("DATABASE_URL does not start with postgresql://. Please set up Neon Postgres!");
      }
    } else {
      logWarn("DATABASE_URL not set (will use default)");
    }

    if (keyMatch && keyMatch[1] && keyMatch[1].length === 64) {
      logSuccess("ENCRYPTION_KEY is set (32 bytes)");
    } else {
      logWarn("ENCRYPTION_KEY missing or wrong length");
    }
  }

  // ── Step 4: Initialize database ────────────────────────────
  if (!hadErrors) {
    logStep("Step 4: Initialize database");
    ensureDbDir();
    const dbCmd = manager + " run db:push";
    logInfo("Running: " + c.dim(dbCmd));
    const dbPushed = runCommand(dbCmd);
    if (dbPushed) {
      logSuccess("Database schema created");
    } else {
      logError("Database setup failed");
      logError('Please run "' + manager + ' run db:push" manually');
      hadErrors = true;
    }
  }

  // ── Summary ────────────────────────────────────────────────
  console.log("");
  console.log(c.bold("----------------------------------------"));
  console.log("");

  if (hadErrors) {
    logError("Setup completed with errors. Please fix them above.");
    console.log("");
    process.exit(1);
  }

  logSuccess(c.bold("Setup complete!"));
  console.log("");
  console.log(c.bold("Next steps:"));
  console.log("");
  console.log("  " + c.cyan("1.") + " (Optional) Add API keys in the .env file");
  console.log("     or configure them later via the in-app Settings dialog.");
  console.log("");
  console.log("  " + c.cyan("2.") + " Start the development server:");
  console.log("     " + c.gray(manager + " run dev"));
  console.log("");
  console.log("  " + c.cyan("3.") + " Open http://localhost:3000 in your browser");
  console.log("");
  console.log(c.gray("Tip: A free demo model (GLM-4.6) works without any API keys."));
  console.log(c.gray("     View the database with: " + manager + " run db:studio"));
  console.log("");

  // ── Offer to auto-start the dev server ─────────────────────
  const autoStart = process.argv.includes("--start") || process.argv.includes("-s");
  const noStart = process.argv.includes("--no-start");

  if (autoStart) {
    startDevServer(manager);
  } else if (!noStart && process.stdin.isTTY) {
    offerAutoStart(manager);
  } else {
    // Non-interactive: just exit
    process.exit(0);
  }
}

function offerAutoStart(manager) {
  process.stdout.write(c.cyan("?") + " Start the dev server now? " + c.gray("[Y/n] ") + "");
  process.stdin.setEncoding("utf-8");
  process.stdin.resume();
  process.stdin.once("data", (answer) => {
    const a = answer.trim().toLowerCase();
    if (a === "" || a === "y" || a === "yes") {
      startDevServer(manager);
    } else {
      console.log(c.gray("To start later, run: " + manager + " run dev"));
      process.exit(0);
    }
  });
}

function startDevServer(manager) {
  console.log(c.bold(c.blue("Starting development server...")));
  console.log("");
  const cmd = manager + " run dev";
  try {
    execSync(cmd, { stdio: "inherit", cwd: ROOT, shell: true });
  } catch {
    console.log(c.gray("Dev server stopped."));
  }
}

main();
