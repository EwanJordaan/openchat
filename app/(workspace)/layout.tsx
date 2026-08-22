import type { ReactNode } from "react";
import { resolveActor } from "@/lib/auth/session";
import { ensureDatabase } from "@/lib/db/bootstrap";
import { listProjects } from "@/lib/db/store";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  await ensureDatabase().catch(() => undefined);
  // Prefetch for client shell if needed — actual shell is rendered in page children.
  // Keeping this server component ensures cookies/session are hydrated server-side.
  try {
    const { actor } = await resolveActor();
    await listProjects(actor);
  } catch {}
  return <>{children}</>;
}
