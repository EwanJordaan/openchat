import { z } from "zod";
import type { AgentContext, ToolResult } from "@/lib/agent/types";

export const getTimeSchema = z.object({});

export const getTimeTool = {
  name: "get_time",
  description: "Get current server time as ISO 8601 string. No input required.",
  schema: getTimeSchema,
  async execute(_input: z.infer<typeof getTimeSchema>, _ctx: AgentContext): Promise<ToolResult> {
    void _input;
    void _ctx;
    const now = new Date();
    return {
      ok: true,
      output: JSON.stringify({ iso: now.toISOString(), unixMs: now.getTime(), tz: "UTC" }),
    };
  },
};
