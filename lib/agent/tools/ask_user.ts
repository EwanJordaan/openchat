import { z } from "zod";
import type { AgentContext, ToolResult } from "@/lib/agent/types";

export const askUserSchema = z.object({
  question: z.string().min(1).max(2000).describe("Question to ask the user for clarification"),
});

export const askUserTool = {
  name: "ask_user",
  description: "Ask the user a clarifying question. Pauses the agent loop and streams the question to the user.",
  schema: askUserSchema,
  async execute(input: z.infer<typeof askUserSchema>, _ctx: AgentContext): Promise<ToolResult> {
    void _ctx;
    // Phase 2 stub: does not actually pause; returns the question as output so LLM can surface it.
    return {
      ok: true,
      output: `ask_user stub — agent would pause and ask: "${input.question}". In phase 2, the loop surfaces this as a tool result; the next user message continues the conversation.`,
    };
  },
};
