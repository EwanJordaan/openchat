import { z } from "zod";

/**
 * OpenChat Sandboxed Runner
 * Deployed as a second Railway service. The main app calls RUNNER_URL/run.
 * Isolation model:
 * - Each request runs in a fresh Node vm context (no require, no fs, no network).
 * - Python runs as a child process with timeout + output cap (if python3 present).
 * - Container itself is sandboxed via Railway/Docker (no privileged caps).
 * - Auth via RUNNER_TOKEN (shared secret) if set; otherwise open within private network.
 */

const PORT = Number(process.env.PORT ?? process.env.RUNNER_PORT ?? 3001);
const RUNNER_TOKEN = process.env.RUNNER_TOKEN ?? "";
const MAX_OUTPUT = 8000;
const DEFAULT_TIMEOUT = 3000;

const RunRequestSchema = z.object({
  lang: z.enum(["js", "ts", "python"]),
  code: z.string().min(1).max(8000),
  timeoutMs: z.number().int().min(100).max(10000).optional().default(DEFAULT_TIMEOUT),
});

type RunRequest = z.infer<typeof RunRequestSchema>;

function checkAuth(req: Request): boolean {
  if (!RUNNER_TOKEN) return true; // open when no token (private network only)
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  const alt = req.headers.get("x-runner-token") ?? "";
  return token === RUNNER_TOKEN || alt === RUNNER_TOKEN;
}

async function runJs(code: string, timeout: number): Promise<{ output: string; error?: string }> {
  const { default: vm } = await import("node:vm");
  let output = "";
  const sandbox = {
    console: {
      log: (...args: unknown[]) => {
        output += args.map((a) => String(a)).join(" ") + "\n";
      },
      error: (...args: unknown[]) => {
        output += args.map((a) => String(a)).join(" ") + "\n";
      },
    },
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    setTimeout,
    clearTimeout,
    // intentionally no require, process, fs, fetch, network
  };
  try {
    const script = new vm.Script(code, { filename: "sandbox.js" });
    const context = vm.createContext(sandbox);
    const result = script.runInContext(context, { timeout });
    if (result !== undefined) output += String(result);
    return { output: output.slice(0, MAX_OUTPUT) || "(no output)" };
  } catch (e) {
    return { output: output.slice(0, MAX_OUTPUT), error: e instanceof Error ? e.message : String(e) };
  }
}

async function runPython(code: string, timeout: number): Promise<{ output: string; error?: string }> {
  // Try python3 subprocess; timeout via AbortController + capped output
  const proc = Bun.spawn(["python3", "-c", code], {
    stdout: "pipe",
    stderr: "pipe",
    timeout,
  } as unknown as Record<string, unknown>);

  try {
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    const combined = (out + (err ? `\n[stderr] ${err}` : "")).slice(0, MAX_OUTPUT);
    // Check exit code if available
    const exit = await proc.exited;
    if (exit !== 0 && !err) {
      return { output: combined || "(no output)", error: `python exited with ${exit}` };
    }
    if (exit !== 0) return { output: combined, error: err.slice(0, 500) };
    return { output: combined || "(no output)" };
  } catch (e) {
    proc.kill();
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
}

async function handleRun(req: Request): Promise<Response> {
  if (!checkAuth(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = RunRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }
  const input: RunRequest = parsed.data;
  // ts -> js stub for now (could transpile with tsc later)
  if (input.lang === "ts") {
    return Response.json({
      ok: true,
      output: `ts stub — transpilation not enabled in runner v0.1 (received ${input.code.length} chars). Downgrade to lang=js or enable tsc.`,
    });
  }
  const result = input.lang === "python" ? await runPython(input.code, input.timeoutMs!) : await runJs(input.code, input.timeoutMs!);
  if (result.error) {
    return Response.json({ ok: false, output: result.output, error: result.error });
  }
  return Response.json({ ok: true, output: result.output });
}

function handleHealth(): Response {
  return Response.json({ status: "ok", service: "openchat-runner", timestamp: new Date().toISOString() });
}

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health" && req.method === "GET") return handleHealth();
    if (url.pathname === "/run" && req.method === "POST") return handleRun(req);
    if (url.pathname === "/" && req.method === "GET") return handleHealth();
    return Response.json({ error: "not found" }, { status: 404 });
  },
});

console.log(`[runner] listening on http://0.0.0.0:${server.port} (pid ${process.pid}) pid`);
if (RUNNER_TOKEN) console.log("[runner] token auth enabled");
else console.warn("[runner] WARNING: RUNNER_TOKEN not set — open to private network only. Set a secret in Railway.");
