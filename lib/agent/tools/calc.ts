import { z } from "zod";
import type { AgentContext, ToolResult } from "@/lib/agent/types";

export const calcSchema = z.object({
  expression: z.string().min(1).max(500).describe("Math expression to evaluate, e.g. '2*(3+4)'"),
});

export const calcTool = {
  name: "calc",
  description: "Evaluate a mathematical expression. Supports + - * / ( ) . and numbers.",
  schema: calcSchema,
  async execute(input: z.infer<typeof calcSchema>, _ctx: AgentContext): Promise<ToolResult> {
    void _ctx;
    const expr = input.expression.trim();
    // allow only safe chars: digits, operators, whitespace, parens, dot, comma
    if (!/^[\d\s+\-*/().,]+$/.test(expr)) {
      return { ok: false, output: "", error: "Expression contains disallowed characters. Only numbers and + - * / ( ) . allowed." };
    }
    try {
      const fn = new Function(`return (${expr})`);
      const result = fn();
      if (typeof result !== "number" || !Number.isFinite(result)) {
        return { ok: false, output: "", error: "Expression did not evaluate to a finite number." };
      }
      return { ok: true, output: String(result) };
    } catch (e) {
      return { ok: false, output: "", error: e instanceof Error ? e.message : String(e) };
    }
  },
};
