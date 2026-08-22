import { z } from "zod";
import vm from "node:vm";
import type { AgentContext, ToolResult } from "@/lib/agent/types";

export const runCodeSchema = z.object({
  lang: z.enum(["js", "ts", "python"]).describe("Language to run"),
  code: z.string().min(1).max(8000),
  timeoutMs: z.number().int().min(100).max(10000).optional().default(3000),
});

export const runCodeTool = {
  name: "run_code",
  description: "Run code in a sandboxed environment. Only JS is supported in phase 2; ts/python return stub. No network.",
  schema: runCodeSchema,
  async execute(input: z.infer<typeof runCodeSchema>, _ctx: AgentContext): Promise<ToolResult> {
    void _ctx;
    if (input.lang !== "js") {
      return {
        ok: true,
        output: `run_code stub — lang=${input.lang} not executed in phase 2. Only js is supported via Node vm. Code length ${input.code.length}. Integrate sandbox later.`,
      };
    }
    const timeout = input.timeoutMs ?? 3000;
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
      const script = new vm.Script(input.code);
      const context = vm.createContext(sandbox);
      const result = script.runInContext(context, { timeout });
      if (result !== undefined) {
        output += String(result);
      }
      return { ok: true, output: output.slice(0, 8000) || "(no output)" };
    } catch (e) {
      return { ok: false, output: output, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
