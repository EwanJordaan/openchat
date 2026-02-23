export type Role = "guest" | "user" | "admin";

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
  updatedAt: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system";
  content: string;
  modelId: string;
  createdAt: string;
  attachments: UploadedFile[];
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
