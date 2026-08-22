import { z } from "zod";
import vm from "node:vm";
import type { AgentContext, ToolResult } from "@/lib/agent/types";

export const runCodeSchema = z.object({
  lang: z.enum(["js", "ts", "python"]).describe("Language to run"),
  code: z.string().min(1).max(8000),
  timeoutMs: z.number().int().min(100).max(10000).optional().default(3000),
});

async function tryRemoteRunner(input: z.infer<typeof runCodeSchema>): Promise<ToolResult | null> {
  const runnerUrl = process.env.RUNNER_URL?.trim();
  if (!runnerUrl) return null;
  const token = process.env.RUNNER_TOKEN?.trim();
  const timeoutMs = input.timeoutMs ?? Number(process.env.RUNNER_TIMEOUT_MS ?? 10000);
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs + 2000);
  try {
    const res = await fetch(`${runnerUrl.replace(/\/$/, "")}/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    const json = (await res.json()) as { ok: boolean; output?: string; error?: string };
    if (!res.ok && res.status >= 500) return null; // fallback to local on runner failure
    if (json.ok) return { ok: true, output: json.output ?? "(no output)" };
    return { ok: false, output: json.output ?? "", error: json.error ?? `runner error ${res.status}` };
  } catch {
    return null; // network/timeout — caller will fallback
  } finally {
    clearTimeout(tid);
  }
}

function runLocalJs(code: string, timeout: number): ToolResult {
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
  };
  try {
    const script = new vm.Script(code);
    const context = vm.createContext(sandbox);
    const result = script.runInContext(context, { timeout });
    if (result !== undefined) output += String(result);
    return { ok: true, output: output.slice(0, 8000) || "(no output)" };
  } catch (e) {
    return { ok: false, output: output, error: e instanceof Error ? e.message : String(e) };
  }
}

export const runCodeTool = {
  name: "run_code",
  description:
    "Run code in a sandboxed runner. JS runs in isolated vm (remote runner if RUNNER_URL set, fallback to local vm). Python via runner sandbox. No network.",
  schema: runCodeSchema,
  async execute(input: z.infer<typeof runCodeSchema>, _ctx: AgentContext): Promise<ToolResult> {
    void _ctx;

    // Prefer remote sandboxed runner when configured (Railway second service)
    const remote = await tryRemoteRunner(input);
    if (remote) return remote;

    // Fallback / local path
    if (input.lang !== "js") {
      // If no runner, python/ts degrade gracefully
      if (input.lang === "python") {
        return {
          ok: false,
          output: "",
          error: `python requires RUNNER_URL to be set (sandboxed runner not configured). Code length ${input.code.length}.`,
        };
      }
      return {
        ok: true,
        output: `run_code stub — lang=${input.lang} not executed locally. Set RUNNER_URL to enable ts/python via sandboxed runner. Code length ${input.code.length}.`,
      };
    }
    return runLocalJs(input.code, input.timeoutMs ?? 3000);
  },
};
