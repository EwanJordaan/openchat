export interface ChunkInput {
  content: string;
  page: number | null;
  heading: string | null;
  ordinal: number;
  tokenCount: number;
  charOffset: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function splitByTokens(text: string, maxTokens: number, overlapTokens: number): string[] {
  const maxChars = maxTokens * 4;
  const overlapChars = overlapTokens * 4;
  if (text.length <= maxChars) return [text];
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    out.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlapChars;
    if (start < 0) start = 0;
  }
  return out;
}

interface Section {
  heading: string | null;
  body: string;
  start: number;
}

function extractSections(markdown: string): Section[] {
  const headingRegex = /^#{1,6}\s+(.+)$/gm;
  const matches = [...markdown.matchAll(headingRegex)];
  if (matches.length === 0) {
    return [{ heading: null, body: markdown, start: 0 }];
  }
  const sections: Section[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const next = matches[i + 1];
    const idx = m.index ?? 0;
    const heading = (m[1] || "").trim().slice(0, 200);
    const contentStart = idx + m[0].length;
    const contentEnd = next?.index ?? markdown.length;
    const body = markdown.slice(contentStart, contentEnd).trim();
    const fullBody = `# ${heading}\n\n${body}`.trim();
    sections.push({ heading, body: fullBody, start: idx });
  }
  const firstIdx = matches[0].index ?? 0;
  if (firstIdx > 0) {
    const pre = markdown.slice(0, firstIdx).trim();
    if (pre) sections.unshift({ heading: null, body: pre, start: 0 });
  }
  return sections;
}

function pageForOffset(offset: number, totalLen: number, pageCount: number, pageMap?: { page: number; text: string }[]): number | null {
  if (pageMap && pageMap.length > 0) {
    let acc = 0;
    const totalChars = pageMap.reduce((s, p) => s + p.text.length, 0) || totalLen;
    for (const p of pageMap) {
      acc += p.text.length;
      if (offset < acc || acc === totalChars) return p.page;
    }
    return pageMap[pageMap.length - 1].page;
  }
  if (!pageCount || pageCount <= 1) return 1;
  const ratio = offset / Math.max(1, totalLen);
  return Math.min(pageCount, Math.max(1, Math.floor(ratio * pageCount) + 1));
}

export function chunkText(opts: {
  markdown: string;
  docId?: string;
  projectId?: string;
  pageMap?: { page: number; text: string }[];
  pageCount?: number;
}): ChunkInput[] {
  const { markdown, pageMap, pageCount } = opts;
  if (!markdown || markdown.trim().length === 0) return [];
  const sections = extractSections(markdown);
  const chunks: ChunkInput[] = [];
  let ordinal = 0;
  let globalOffset = 0;

  for (const sec of sections) {
    const pieces = splitByTokens(sec.body, 512, 80);
    for (const piece of pieces) {
      if (piece.trim().length === 0) continue;
      const tokenCount = Math.min(560, estimateTokens(piece));
      if (tokenCount > 560) {
        const sub = splitByTokens(piece, 560, 80);
        for (const s of sub) {
          if (!s.trim()) continue;
          const tc = estimateTokens(s);
          const page = pageForOffset(globalOffset, markdown.length, pageCount ?? pageMap?.length ?? 1, pageMap);
          chunks.push({ content: s, page, heading: sec.heading, ordinal: ordinal++, tokenCount: Math.min(560, tc), charOffset: globalOffset });
          globalOffset += s.length - 80 * 4;
          if (globalOffset < 0) globalOffset = 0;
        }
      } else {
        const page = pageForOffset(globalOffset, markdown.length, pageCount ?? pageMap?.length ?? 1, pageMap);
        chunks.push({ content: piece, page, heading: sec.heading, ordinal: ordinal++, tokenCount, charOffset: globalOffset });
        globalOffset += piece.length - 80 * 4;
        if (globalOffset < 0) globalOffset = 0;
      }
    }
    if (pieces.length === 0) globalOffset += sec.body.length;
  }

  if (chunks.length === 0 && markdown.trim()) {
    const pieces = splitByTokens(markdown, 512, 80);
    for (const piece of pieces) {
      const tc = estimateTokens(piece);
      chunks.push({ content: piece, page: 1, heading: null, ordinal: ordinal++, tokenCount: Math.min(560, tc), charOffset: 0 });
    }
  }

  return chunks;
}
