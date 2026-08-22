import { embedTexts as baseEmbed } from "@/lib/llm/embed";

export async function embedChunks(chunks: string[]): Promise<number[][]> {
  if (chunks.length === 0) return [];
  const batchSize = 96;
  const out: number[][] = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    let last: unknown;
    let result: number[][] | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await baseEmbed(batch);
        break;
      } catch (e) {
        last = e;
        if (attempt < 2) {
          const delay = 400 * Math.pow(2, attempt) + Math.random() * 150;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    if (!result) throw last instanceof Error ? last : new Error(String(last));
    out.push(...result);
  }
  return out;
}
