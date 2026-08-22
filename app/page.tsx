import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { resolveActor } from "@/lib/auth/session";
import { ensureDatabase } from "@/lib/db/bootstrap";
import { listProjects } from "@/lib/db/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureDatabase().catch(() => undefined);
  let projects: Awaited<ReturnType<typeof listProjects>> = [];
  try {
    const { actor } = await resolveActor();
    projects = await listProjects(actor);
  } catch {
    projects = [];
  }
  return <WorkspaceShell projects={projects} initialProjectId={projects[0]?.id ?? null} />;
}
