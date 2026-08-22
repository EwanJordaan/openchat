export type Role = "guest" | "user" | "admin";

export type ProjectRole = "owner" | "editor" | "viewer";

export type AgentPreset = "research" | "analyst" | "builder";

export type Actor =
  | {
      type: "guest";
      guestId: string;
      roles: ["guest"];
      userId: null;
      user: null;
    }
  | {
      type: "user";
      guestId: string;
      roles: Role[];
      userId: string;
      user: {
        id: string;
        email: string;
        name: string;
        imageUrl: string | null;
      };
    };

export interface ChatSummary {
  id: string;
  title: string;
  modelId: string;
  projectId?: string | null;
  agentPreset?: AgentPreset | null;
  isPinned: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface Citation {
  chunkId: string;
  documentId: string;
  title?: string;
  page?: number | null;
  chunkOrdinal?: number;
  score?: number;
  excerpt?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  modelId: string;
  createdAt: string;
  attachments: UploadedFile[];
  toolCalls?: ToolCall[] | null;
  toolCallId?: string | null;
  citations?: Citation[] | null;
}

export interface UploadedFile {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
}

export interface ModelOption {
  id: string;
  displayName: string;
  provider: string;
  description: string;
  isEnabled: boolean;
  isDefault: boolean;
  isGuestAllowed: boolean;
  maxOutputTokens: number;
  supportsTools?: boolean;
  contextWindow?: number;
}

export type DocumentStatus = "pending" | "parsing" | "chunking" | "embedding" | "ready" | "failed";

export type DocumentSourceType = "file" | "url" | "repo";

export interface Document {
  id: string;
  projectId: string | null;
  ownerUserId: string | null;
  guestId: string | null;
  title: string;
  sourceType: DocumentSourceType;
  sourceUrl: string | null;
  mimeType: string | null;
  storageKey: string | null;
  sha256: string | null;
  pageCount: number | null;
  tokenCount: number | null;
  status: DocumentStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  projectId: string | null;
  ordinal: number;
  heading: string | null;
  page: number | null;
  charOffset: number | null;
  content: string;
  tokenCount: number | null;
  // embedding stored as vector(1536) in DB, not returned by default
}

export interface Project {
  id: string;
  ownerUserId: string | null;
  title: string;
  description: string | null;
  visibility: "private" | "public";
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  projectId: string;
  userId: string;
  role: ProjectRole;
  createdAt: string;
}

export type ToolEventStatus = "ok" | "error";

export interface ToolEvent {
  id: string;
  chatId: string;
  messageId: string | null;
  toolName: string;
  input: unknown;
  output: unknown;
  status: ToolEventStatus;
  latencyMs: number | null;
  createdAt: string;
}

export interface RoleLimit {
  role: Role;
  dailyMessageLimit: number;
  maxAttachmentCount: number;
  maxAttachmentMb: number;
}

export interface PublicAppSettings {
  guestEnabled: boolean;
  guestAllowedModels: string[];
  defaultModelId: string;
}

export interface UserSettings {
  theme: "system" | "light" | "dark";
  compactMode: boolean;
  enterToSend: boolean;
  showTokens: boolean;
  timezone: string;
  language: string;
  autoTitleChats: boolean;
}
