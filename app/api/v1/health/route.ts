import { getOrCreateRequestId } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const requestId = getOrCreateRequestId(request);

  return Response.json(
    {
      status: "ok",
      service: "openchat-backend",
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "x-request-id": requestId,
      },
    },
  );
}
