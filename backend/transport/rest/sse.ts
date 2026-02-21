const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
} as const;

export type SseEmit = (event: string, data: unknown) => void;

export function createSseResponse(
  requestId: string,
  run: (emit: SseEmit) => Promise<void>,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let isClosed = false;

      const safeClose = () => {
        if (isClosed) {
          return;
        }

        isClosed = true;
        controller.close();
      };

      const emit: SseEmit = (event, data) => {
        if (isClosed) {
          return;
        }

        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      void (async () => {
        try {
          await run(emit);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Streaming request failed";
          emit("error", { message });
        } finally {
          safeClose();
        }
      })();
    },
    cancel() {
      // Reader disconnected.
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...SSE_HEADERS,
      "x-request-id": requestId,
    },
  });
}
