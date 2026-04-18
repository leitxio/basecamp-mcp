import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";

const execAsync = promisify(exec);

export interface BasecampEnvelope {
  ok: boolean;
  data: unknown;
  summary?: string;
  error?: string;
  code?: string;
}

// POSIX single-quote wrap — safe for all shell special chars including spaces and newlines
function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

// ── Binary resolution ──────────────────────────────────────────────────────────

let cachedBin: string | null = null;
let initError: Error | null = null;

async function resolveBasecampPath(): Promise<string> {
  // 1. Explicit override via env / manifest user_config
  // Guard against unresolved mcpb template literals (e.g. "${user_config.basecamp_path}")
  const fromEnv = process.env["BASECAMP_PATH"];
  if (fromEnv && fromEnv.startsWith("/")) {
    if (existsSync(fromEnv)) return fromEnv;
    throw new Error(`BASECAMP_PATH "${fromEnv}" does not exist.`);
  }

  // 2. Common install locations (no shell required)
  const candidates = [
    `${process.env["HOME"]}/.local/bin/basecamp`,
    "/opt/homebrew/bin/basecamp",
    "/usr/local/bin/basecamp",
    "/usr/bin/basecamp",
  ];
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }

  // 3. Login shell fallback — Claude Desktop has no PATH, so ask the user's shell
  for (const shell of ["/bin/zsh", "/bin/bash"]) {
    if (!existsSync(shell)) continue;
    try {
      const { stdout } = await execAsync(`${shell} -lc "which basecamp"`, {
        timeout: 5_000,
      });
      const p = stdout.trim();
      if (p && existsSync(p)) return p;
    } catch {
      /* try next shell */
    }
  }

  throw new Error(
    "Could not find basecamp CLI. Install it with: " +
      "curl -fsSL https://basecamp.com/install-cli | bash" +
      " — or set the basecamp_path config field to the full path " +
      "(run 'which basecamp' in Terminal to find it).",
  );
}

export async function initBasecampPath(): Promise<void> {
  try {
    cachedBin = await resolveBasecampPath();
  } catch (e) {
    initError = e instanceof Error ? e : new Error(String(e));
    console.error(
      "[basecamp-mcp] Binary resolution failed:",
      initError.message,
    );
  }
}

function getBin(): string {
  if (initError) throw initError;
  if (!cachedBin)
    throw new Error("Call initBasecampPath() before using the CLI.");
  return cachedBin;
}

// ── Account ID ─────────────────────────────────────────────────────────────────

let cachedAccountId: string | null = null;

async function getAccountId(): Promise<string> {
  if (cachedAccountId) return cachedAccountId;

  const fromEnv = process.env["BASECAMP_ACCOUNT_ID"];
  if (fromEnv) {
    cachedAccountId = fromEnv;
    return cachedAccountId;
  }

  const { stdout } = await execAsync(`${getBin()} accounts list --json`, {
    timeout: 10_000,
  });
  const envelope = JSON.parse(stdout) as BasecampEnvelope;
  if (
    !envelope.ok ||
    !Array.isArray(envelope.data) ||
    envelope.data.length === 0
  ) {
    console.error(
      "[basecamp-mcp] Failed to auto-discover account ID. Set BASECAMP_ACCOUNT_ID env var.",
    );
    throw new Error(
      "Cannot auto-discover Basecamp account ID. Set BASECAMP_ACCOUNT_ID env var.",
    );
  }
  cachedAccountId = String((envelope.data[0] as { id: number }).id);
  return cachedAccountId;
}

// ── Command execution ──────────────────────────────────────────────────────────

/**
 * Run a basecamp CLI command and return the parsed envelope.
 * @param args  Positional args after `basecamp` — will be shell-escaped
 * @param flags Pre-built flag tokens like ["--in", "'My Project'"] — not re-escaped
 */
export async function execBasecamp(
  args: string[],
  flags: string[] = [],
): Promise<BasecampEnvelope> {
  const accountId = await getAccountId();
  const parts = [
    getBin(),
    ...args.map(shellEscape),
    ...flags,
    "--account",
    accountId,
    "--json",
  ];
  const command = parts.join(" ");

  const { stdout, stderr } = await execAsync(command, {
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
  });

  let envelope: BasecampEnvelope;
  try {
    envelope = JSON.parse(stdout) as BasecampEnvelope;
  } catch {
    throw new Error(
      `Basecamp CLI returned non-JSON.\nstdout: ${stdout}\nstderr: ${stderr}`,
    );
  }

  if (!envelope.ok) {
    const msg = envelope.error ?? "unknown error";
    const code = envelope.code ? ` (code: ${envelope.code})` : "";
    throw new Error(`Basecamp error: ${msg}${code}`);
  }

  return envelope;
}

/** Build a shell-safe --flag 'value' pair */
export function flag(name: string, value: string): string[] {
  return [name, shellEscape(value)];
}
