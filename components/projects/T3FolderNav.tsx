"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import type { ChatSummary, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Check, Edit3, Loader2, MoreHorizontal, Plus, Trash2 } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ── Verbatim copy from intern3: project-constants.ts ──
export const PROJECT_COLORS = [
  {
    id: "blue",
    name: "Blue",
    class: "text-blue-500 bg-blue-500 border-blue-400 dark:text-blue-600 dark:bg-blue-600 dark:border-blue-500",
  },
  {
    id: "red",
    name: "Red",
    class: "text-red-500 bg-red-500 border-red-400 dark:text-red-600 dark:bg-red-600 dark:border-red-500",
  },
  {
    id: "green",
    name: "Green",
    class: "text-green-500 bg-green-500 border-green-400 dark:text-green-600 dark:bg-green-600 dark:border-green-500",
  },
  {
    id: "purple",
    name: "Purple",
    class: "text-purple-500 bg-purple-500 border-purple-400 dark:text-purple-600 dark:bg-purple-600 dark:border-purple-500",
  },
  {
    id: "orange",
    name: "Orange",
    class: "text-orange-500 bg-orange-500 border-orange-400 dark:text-orange-600 dark:bg-orange-600 dark:border-orange-500",
  },
  {
    id: "pink",
    name: "Pink",
    class: "text-pink-500 bg-pink-500 border-pink-400 dark:text-pink-600 dark:bg-pink-600 dark:border-pink-500",
  },
  {
    id: "teal",
    name: "Teal",
    class: "text-teal-500 bg-teal-500 border-teal-400 dark:text-teal-600 dark:bg-teal-600 dark:border-teal-500",
  },
  {
    id: "gray",
    name: "Gray",
    class: "text-gray-500 bg-gray-500 border-gray-400 dark:text-gray-600 dark:bg-gray-600 dark:border-gray-500",
  },
  {
    id: "indigo",
    name: "Indigo",
    class: "text-indigo-500 bg-indigo-500 border-indigo-400 dark:text-indigo-600 dark:bg-indigo-600 dark:border-indigo-500",
  },
  {
    id: "yellow",
    name: "Yellow",
    class: "text-yellow-500 bg-yellow-500 border-yellow-400 dark:text-yellow-600 dark:bg-yellow-600 dark:border-yellow-500",
  },
  {
    id: "cyan",
    name: "Cyan",
    class: "text-cyan-500 bg-cyan-500 border-cyan-400 dark:text-cyan-600 dark:bg-cyan-600 dark:border-cyan-500",
  },
] as const;

export type ProjectColorId = (typeof PROJECT_COLORS)[number]["id"];

export function getProjectColorClasses(colorId: ProjectColorId | undefined): string {
  if (!colorId)
    return "text-gray-500 bg-gray-500 border-gray-400 dark:text-gray-600 dark:bg-gray-600 dark:border-gray-500";
  const color = PROJECT_COLORS.find((c) => c.id === colorId);
  return (
    color?.class ||
    "text-gray-500 bg-gray-500 border-gray-400 dark:text-gray-600 dark:bg-gray-600 dark:border-gray-500"
  );
}

export const DEFAULT_PROJECT_ICON = "📁";

// ── openchat adaptation: localStorage color persistence (maps project.id -> color id) ──
function getStoredColor(projectId: string): ProjectColorId | null {
  if (typeof window === "undefined") return null;
  try {
    const map = JSON.parse(localStorage.getItem("openchat:project-colors") || "{}") as Record<string, string>;
    const c = map[projectId];
    if (c && PROJECT_COLORS.some((x) => x.id === c)) return c as ProjectColorId;
  } catch {}
  return null;
}

function setStoredColor(projectId: string, colorId: string) {
  if (typeof window === "undefined") return;
  try {
    const map = JSON.parse(localStorage.getItem("openchat:project-colors") || "{}") as Record<string, string>;
    map[projectId] = colorId;
    localStorage.setItem("openchat:project-colors", JSON.stringify(map));
  } catch {}
}

function resolveProjectColor(project: Project): ProjectColorId {
  // project may have color in future schema, but currently we fallback to LS
  const raw = (project as unknown as { color?: string }).color as ProjectColorId | undefined;
  if (raw && PROJECT_COLORS.some((c) => c.id === raw)) return raw;
  return getStoredColor(project.id) ?? "blue";
}

// ── NewFolderButton — verbatim copy from intern3 src/components/threads/new-folder-button.tsx ──
function NewFolderButton({ onCreated }: { onCreated?: () => void }) {
  const [showDialog, setShowDialog] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderDescription, setFolderDescription] = useState("");
  const [folderColor, setFolderColor] = useState<string>("blue");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    const trimmedName = folderName.trim();
    if (!trimmedName) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedName, description: folderDescription.trim() || null }),
      });
      if (!res.ok) throw new Error("create failed");
      const j = (await res.json()) as { project: Project };
      if (j.project?.id) setStoredColor(j.project.id, folderColor);
      setFolderName("");
      setFolderDescription("");
      setFolderColor("blue");
      setShowDialog(false);
      onCreated?.();
    } catch {
      // silent
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setShowDialog(true)}
        className="size-6 text-muted-foreground"
      >
        <Plus className="size-4" />
        <span className="sr-only">New folder</span>
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>Folders are a great way to organize your threads</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Name</Label>
              <Input
                id="folder-name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Enter folder name"
                className="max-w-[50%]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isCreating) void handleCreate();
                }}
                disabled={isCreating}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="folder-description">Description (Optional)</Label>
              <Input
                id="folder-description"
                value={folderDescription}
                onChange={(e) => setFolderDescription(e.target.value)}
                placeholder="Enter folder description"
                disabled={isCreating}
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {PROJECT_COLORS.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() => setFolderColor(color.id)}
                    disabled={isCreating}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                      color.class.split(" ").slice(1).join(" "),
                      folderColor === color.id ? "scale-110 border-foreground" : "border-transparent hover:scale-105",
                    )}
                  >
                    {folderColor === color.id && <Check className="h-4 w-4 text-white drop-shadow-sm" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={isCreating || !folderName.trim()}>
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── FolderItem — verbatim copy from intern3 src/components/threads/folder-item.tsx ──
function FolderItem({
  project,
  numThreads,
  active,
  onSelect,
  onUpdated,
  onDeleted,
}: {
  project: Project;
  numThreads: number;
  active?: boolean;
  onSelect?: () => void;
  onUpdated?: () => void;
  onDeleted?: () => void;
}) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState<string>("blue");
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const colorId = resolveProjectColor(project) as ProjectColorId;
  const colorClasses = getProjectColorClasses(colorId);

  // hydrate edit fields when opening
  const openEditDialog = () => {
    setEditName(project.title);
    setEditDescription(project.description || "");
    setEditColor(colorId);
    setShowEditDialog(true);
  };

  const handleEdit = async () => {
    const trimmedName = editName.trim();
    if (!trimmedName) return;
    setIsEditing(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedName, description: editDescription.trim() || null }),
      });
      if (!res.ok) throw new Error("update failed");
      setStoredColor(project.id, editColor);
      setShowEditDialog(false);
      onUpdated?.();
    } catch {
      // silent
    } finally {
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      try {
        const map = JSON.parse(localStorage.getItem("openchat:project-colors") || "{}") as Record<string, string>;
        delete map[project.id];
        localStorage.setItem("openchat:project-colors", JSON.stringify(map));
      } catch {}
      setShowDeleteDialog(false);
      onDeleted?.();
    } catch {
      // silent
    } finally {
      setIsDeleting(false);
    }
  };

  const { setOpenMobile } = useSidebar();

  return (
    <>
      <SidebarMenuItem>
        <div
          className={cn(
            "group/item flex w-full items-center rounded-sm hover:bg-accent/50",
            isMenuOpen && "bg-accent/50",
            active && "bg-accent/60",
          )}
        >
          <SidebarMenuButton
            asChild
            className={cn("flex-1 hover:bg-transparent", active && "text-foreground")}
          >
            <button
              type="button"
              onClick={() => {
                setOpenMobile(false);
                onSelect?.();
              }}
              className="flex items-center gap-2 text-left w-full"
            >
              <div className={cn("flex size-3 flex-shrink-0 items-center justify-center rounded-full text-xs", colorClasses.split(" ").slice(1).join(" "))} />
              <span className="truncate font-medium">{project.title}</span>
            </button>
          </SidebarMenuButton>

          <DropdownMenu onOpenChange={setIsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button type="button" className="relative rounded p-1">
                <span
                  className={cn(
                    "-translate-y-1/2 absolute top-[50%] right-2 ml-auto flex-shrink-0 rounded bg-input px-0.5 py-0.25 text-muted-foreground text-xs leading-none transition-opacity",
                    isMenuOpen ? "opacity-0" : "opacity-100 group-hover/item:opacity-0",
                  )}
                >
                  {numThreads}
                </span>
                <MoreHorizontal
                  className={cn("mr-1 h-4 w-4 transition-opacity", isMenuOpen || "opacity-0 group-hover/item:opacity-100")}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={openEditDialog}>
                <Edit3 className="h-4 w-4" />
                Edit folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} variant="destructive">
                <Trash2 className="h-4 w-4" />
                Delete folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarMenuItem>

      {/* Edit Dialog — verbatim structure */}
      <Dialog
        open={showEditDialog}
        onOpenChange={(open) => {
          if (!isEditing) setShowEditDialog(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="edit-folder-name">Name</Label>
              <Input
                id="edit-folder-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="max-w-[50%]"
                placeholder="Enter folder name"
                disabled={isEditing}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-folder-description">Description (optional)</Label>
              <Input
                id="edit-folder-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Enter folder description"
                disabled={isEditing}
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {PROJECT_COLORS.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() => setEditColor(color.id)}
                    disabled={isEditing}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                      color.class.split(" ").slice(1).join(" "),
                      editColor === color.id ? "scale-110 border-foreground" : "border-transparent hover:scale-105",
                    )}
                  >
                    {editColor === color.id && <Check className="h-4 w-4 text-white drop-shadow-sm" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={isEditing}>
              Cancel
            </Button>
            <Button onClick={() => void handleEdit()} disabled={isEditing || !editName.trim()}>
              {isEditing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog — verbatim AlertDialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-bold">{project.title}</span>?
              {numThreads > 0 && (
                <>
                  <br />
                  <br />
                  This folder contains {numThreads} thread{numThreads !== 1 ? "s" : ""}. The folder will be archived instead of deleted.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {numThreads > 0 ? "Archiving..." : "Deleting..."}
                </>
              ) : numThreads > 0 ? (
                "Archive"
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Main Folders Nav — 100% Folders UI ──
export function T3FolderNav({
  projects: initial,
  activeId,
  onSelect,
  onCreated,
  filter,
}: {
  projects?: Project[];
  activeId?: string | null;
  onSelect?: (id: string | null) => void;
  onCreated?: () => void;
  filter?: string;
}) {
  const { data, mutate } = useSWR<{ projects: Project[] }>("/api/projects?limit=100", fetcher, {
    fallbackData: initial ? { projects: initial } : undefined,
  });
  const projects = data?.projects ?? initial ?? [];

  const { data: chatsData } = useSWR<{ chats: ChatSummary[] }>("/api/chats", fetcher);
  const chats = chatsData?.chats ?? [];

  const q = filter?.trim() ?? "";
  const filtered = q ? projects.filter((p) => p.title.toLowerCase().includes(q.toLowerCase())) : projects;

  const countByProject = new Map<string, number>();
  for (const c of chats) {
    if (c.projectId) countByProject.set(c.projectId, (countByProject.get(c.projectId) ?? 0) + 1);
  }

  const { mutate: globalMutate } = useSWRConfig();
  function handleMutate() {
    void mutate();
    void globalMutate((key) => typeof key === "string" && key.startsWith("/api/projects"));
    void globalMutate((key) => typeof key === "string" && key.startsWith("/api/chats"));
    onCreated?.();
  }

  // Verbatim SidebarGroup Folders section from intern3 threads-sidebar.tsx
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="pr-0">
        Folders
        <div className="flex-grow" />
        <NewFolderButton onCreated={handleMutate} />
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {filtered.map((p) => (
            <FolderItem
              key={p.id}
              project={p}
              active={p.id === activeId}
              onSelect={() => onSelect?.(p.id)}
              numThreads={countByProject.get(p.id) ?? 0}
              onUpdated={handleMutate}
              onDeleted={handleMutate}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
      {filtered.length === 0 && q ? (
        <div className="text-muted-foreground p-4 text-center text-sm">No folders match “{q}”.</div>
      ) : null}
      {filtered.length === 0 && !q ? (
        <div className="text-muted-foreground p-4 text-center text-sm">No folders yet. Create one to organize chats.</div>
      ) : null}
    </SidebarGroup>
  );
}

export default T3FolderNav;
