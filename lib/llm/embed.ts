import { env } from "@/lib/env";

const dims = env.VECTOR_DIMS || 1536;
export const EMBED_BATCH_SIZE = 96;
export const BATCH_SIZE = EMBED_BATCH_SIZE;
const MAX_RETRIES = 3;

export function fakeEmbedding(text: string, targetDims: number = dims): number[] {
  const vec: number[] = new Array(targetDims).fill(0);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let seed = hash >>> 0;
  for (let i = 0; i < targetDims; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    vec[i] = (seed % 2000) / 1000 - 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export function fakeEmbed(texts: string[]): number[][] {
  return texts.map((t) => fakeEmbedding(t));
}

async function callOpenAIEmbed(texts: string[]): Promise<number[][]> {
  const key = env.OPENAI_API_KEY;
  if (!key) return texts.map((t) => fakeEmbedding(t));
  const base = env.OPENAI_BASE_URL.replace(/\/$/, "");
  const model = env.EMBED_MODEL || "text-embedding-3-small";
  const res = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`embed failed ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    data: { embedding: number[] }[];
  };
  return json.data.map((d) => d.embedding);
}

async function callVoyageEmbed(texts: string[]): Promise<number[][]> {
  const key = env.VOYAGE_API_KEY;
  if (!key) return callOpenAIEmbed(texts);
  const model = env.EMBED_MODEL || "voyage-3-lite";
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, input: texts, input_type: "document" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`voyage embed failed ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    data: { embedding: number[] }[];
  };
  // voyage-3-lite is 1024d; pad/truncate to dims for pgvector compatibility
  return json.data.map((d) => {
    const emb = d.embedding;
    if (emb.length === dims) return emb;
    if (emb.length < dims) return [...emb, ...new Array(dims - emb.length).fill(0)];
    return emb.slice(0, dims);
  });
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const provider = env.EMBED_PROVIDER;
  if (provider === "voyage" && env.VOYAGE_API_KEY) {
    return callVoyageEmbed(texts);
  }
  if (provider === "local") {
    return texts.map((t) => fakeEmbedding(t));
  }
  return callOpenAIEmbed(texts);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    let lastError: unknown;
    let result: number[][] | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        result = await embedBatch(batch);
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        if (attempt < MAX_RETRIES - 1) {
          const delay = 300 * Math.pow(2, attempt) + Math.random() * 100;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    if (result) {
      out.push(...result);
    } else {
      if (env.NODE_ENV !== "production") {
        out.push(...batch.map((t) => fakeEmbedding(t)));
      } else if (lastError) {
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      }
    }
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  return vec ?? fakeEmbedding(text);
}
