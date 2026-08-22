export interface SseEvent {
  event: string;
  data: string;
  id?: string;
}

export function parseSseChunk(chunk: string): SseEvent[] {
  const events: SseEvent[] = [];
  const blocks = chunk.split("\n\n");
  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = "message";
    let data = "";
    let id: string | undefined;
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += (data ? "\n" : "") + line.slice(5).trimStart();
      else if (line.startsWith("id:")) id = line.slice(3).trim();
    }
    if (data) events.push({ event, data, id });
  }
  return events;
}

export async function* readSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder = new TextDecoder(),
): AsyncGenerator<SseEvent> {
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.trim()) {
        for (const ev of parseSseChunk(buffer)) yield ev;
      }
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      for (const ev of parseSseChunk(part + "\n\n")) yield ev;
    }
  }
}

export function tryParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
