export function ssePayload(lines: string[]) {
  return `${lines.join("\n")}\n\n`;
}

export function streamFromChunks(chunks: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

export async function collectSseEvents(res: Response) {
  const text = await res.text();
  const events: Array<{ event: string; data: unknown }> = [];
  for (const block of text.split("\n\n")) {
    if (!block.trim()) continue;
    const lines = block.split("\n");
    let ev = "message";
    let data: unknown = null;
    for (const l of lines) {
      if (l.startsWith("event:")) ev = l.slice(6).trim();
      if (l.startsWith("data:")) { try { data = JSON.parse(l.slice(5).trim()); } catch { data = l.slice(5).trim(); } }
    }
    events.push({ event: ev, data });
  }
  return events;
}
