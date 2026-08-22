import { z } from "zod";
import type { AgentContext, ToolResult } from "@/lib/agent/types";

const ALLOWED_GLOBS = ["lib/**", "app/**", "README.md"];

export const ingestRepoFilesSchema = z.object({
  glob: z.string().min(1).max(300).describe("Glob pattern, whitelisted: lib/**, app/**, README.md"),
  maxFiles: z.number().int().min(1).max(50).optional().default(10),
});

function isAllowedGlob(glob: string): boolean {
  return ALLOWED_GLOBS.some((allowed) => {
    if (allowed.endsWith("/**")) {
      const prefix = allowed.slice(0, -3);
      return glob.startsWith(prefix);
    }
    return glob === allowed;
  });
}

export const ingestRepoFilesTool = {
  name: "ingest_repo_files",
  description: "Read whitelisted repo files via glob (lib/**, app/**, README.md only). Returns file contents.",
  schema: ingestRepoFilesSchema,
  async execute(input: z.infer<typeof ingestRepoFilesSchema>, _ctx: AgentContext): Promise<ToolResult> {
    void _ctx;
    if (!isAllowedGlob(input.glob)) {
      return {
        ok: false,
        output: "",
        error: `Glob "${input.glob}" not whitelisted. Allowed: ${ALLOWED_GLOBS.join(", ")}`,
      };
    }
    return {
      ok: true,
      output: `ingest_repo_files stub — would read glob "${input.glob}" (max ${input.maxFiles ?? 10} files). Integrate FS guard + parser later. Allowed globs: ${ALLOWED_GLOBS.join(", ")}`,
    };
  },
};
