import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { resolveActor } from "@/lib/auth/session";
import { ensureDatabase } from "@/lib/db/bootstrap";
import { listProjects } from "@/lib/db/store";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureDatabase().catch(() => undefined);
  let projects: Awaited<ReturnType<typeof listProjects>> = [];
  try {
    const { actor } = await resolveActor();
    projects = await listProjects(actor);
  } catch {}
  return <WorkspaceShell projects={projects} initialChatId={id} initialProjectId={projects[0]?.id ?? null} />;
}
