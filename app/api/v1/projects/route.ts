import { z } from "zod";

import { handleApiRoute, jsonResponse, parseJsonBody, requirePermission, requirePrincipal } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

const createProjectSchema = z.object({
  name: z.string().min(2).max(120),
});

export async function GET(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);
    await requirePermission(container, principal, "project.read", { type: "global" });

    const projects = await container.useCases.listProjects.execute(principal);
    return jsonResponse(requestId, { data: projects });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);
    await requirePermission(container, principal, "project.create", { type: "global" });

    const input = await parseJsonBody(request, createProjectSchema);
    const project = await container.useCases.createProject.execute(principal, input);

    return jsonResponse(requestId, { data: project }, 201);
  });
}
