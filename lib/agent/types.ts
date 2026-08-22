import type { Actor, Citation } from "@/lib/types";

export interface AgentContext {
  chatId?: string;
  projectId?: string | null;
  actor: Actor;
  signal?: AbortSignal;
  preset?: string;
}

export interface ToolResult {
  ok: boolean;
  output: string;
  error?: string;
  citations?: Citation[];
}

export interface AgentTool {
  name: string;
  description: string;
  schema: import("zod").ZodTypeAny;
  execute: (input: unknown, ctx: AgentContext) => Promise<ToolResult>;
}
