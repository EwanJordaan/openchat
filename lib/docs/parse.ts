export interface ParsedDocument {
  markdown: string;
  pageCount: number;
  pages: { page: number; text: string }[];
  tokenEstimate: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function toMarkdownFromText(text: string): string {
  return text;
}

async function parsePdf(buffer: Buffer, filename: string): Promise<{ text: string; pages: { page: number; text: string }[] }> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await (pdfjs as unknown as { getDocument: (o: unknown) => { promise: Promise<unknown> } }).getDocument({
      data: new Uint8Array(buffer),
      verbosity: 0,
    }).promise;
    const typed = doc as unknown as {
      numPages: number;
      getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str: string }[] }> }>;
    };
    const pages: { page: number; text: string }[] = [];
    let full = "";
    const count = typed.numPages || 1;
    for (let i = 1; i <= count; i++) {
      const page = await typed.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((it) => it.str).join(" ");
      pages.push({ page: i, text });
      full += (full ? "\n\n" : "") + text;
    }
    if (!full.trim()) throw new Error("empty pdf text");
    return { text: full, pages };
  } catch {
    const fallback = buffer.toString("utf8");
    return { text: fallback || `[PDF: ${filename} — parse failed, raw bytes ${buffer.length}]`, pages: [{ page: 1, text: fallback }] };
  }
}

async function parseDocx(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const mod = (mammoth as unknown as { default?: { extractRawText: (o: unknown) => Promise<{ value: string }> } }).default ?? (mammoth as unknown as { extractRawText: (o: unknown) => Promise<{ value: string }> });
    const result = await mod.extractRawText({ buffer });
    return result.value || buffer.toString("utf8");
  } catch {
    return buffer.toString("utf8");
  }
}

export async function parseDocument(opts: {
  buffer: Buffer;
  mime: string;
  filename: string;
}): Promise<ParsedDocument> {
  const { buffer, mime, filename } = opts;
  const mimeLower = (mime || "").toLowerCase();
  const filenameLower = (filename || "").toLowerCase();

  try {
    if (mimeLower.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].some((e) => filenameLower.endsWith(e) && mimeLower === "")) {
      const stub = `[Image: ${filename}] (image caption stub — vision model pending)`;
      return { markdown: stub, pageCount: 1, pages: [{ page: 1, text: stub }], tokenEstimate: estimateTokens(stub) };
    }

    if (mimeLower === "text/plain" || mimeLower === "text/markdown" || filenameLower.endsWith(".md") || filenameLower.endsWith(".txt")) {
      const text = buffer.toString("utf8");
      const md = toMarkdownFromText(text);
      return { markdown: md, pageCount: 1, pages: [{ page: 1, text }], tokenEstimate: estimateTokens(md) };
    }

    if (mimeLower.includes("officedocument.wordprocessingml") || filenameLower.endsWith(".docx")) {
      const text = await parseDocx(buffer);
      return { markdown: text, pageCount: 1, pages: [{ page: 1, text }], tokenEstimate: estimateTokens(text) };
    }

    if (mimeLower === "application/pdf" || filenameLower.endsWith(".pdf")) {
      const { text, pages } = await parsePdf(buffer, filename);
      const md = text;
      return { markdown: md, pageCount: pages.length || 1, pages, tokenEstimate: estimateTokens(md) };
    }

    if (mimeLower === "text/csv" || mimeLower === "application/csv" || filenameLower.endsWith(".csv")) {
      const text = buffer.toString("utf8");
      return { markdown: text, pageCount: 1, pages: [{ page: 1, text }], tokenEstimate: estimateTokens(text) };
    }

    if (mimeLower === "application/json" || filenameLower.endsWith(".json")) {
      const raw = buffer.toString("utf8");
      let pretty = raw;
      try {
        pretty = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        // keep raw
      }
      return { markdown: pretty, pageCount: 1, pages: [{ page: 1, text: pretty }], tokenEstimate: estimateTokens(pretty) };
    }

    const text = buffer.toString("utf8");
    if (text.trim().length > 0 && text.length < buffer.length * 2) {
      return { markdown: text, pageCount: 1, pages: [{ page: 1, text }], tokenEstimate: estimateTokens(text) };
    }

    const fallback = buffer.toString("utf8") || `[Binary: ${filename} ${mime} ${buffer.length} bytes]`;
    return { markdown: fallback, pageCount: 1, pages: [{ page: 1, text: fallback }], tokenEstimate: estimateTokens(fallback) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stub = buffer.toString("utf8").slice(0, 20000) || `[Parse error for ${filename}: ${msg}]`;
    const md = stub;
    return { markdown: md, pageCount: 1, pages: [{ page: 1, text: stub }], tokenEstimate: estimateTokens(md) };
  }
}
