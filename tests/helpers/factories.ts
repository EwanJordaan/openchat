import type { Actor, ChatMessage, ChatSummary, ModelOption, UploadedFile } from "@/lib/types";

export function actorFactory(overrides: Partial<Extract<Actor, { type: "user" }>> = {}): Extract<Actor, { type: "user" }> {
  return {
    type: "user",
    guestId: "gst_test",
    roles: ["user"],
    userId: "usr_test",
    user: { id: "usr_test", email: "user@example.com", name: "User", imageUrl: null },
    ...overrides,
  };
}

export function guestActorFactory(overrides: Partial<Extract<Actor, { type: "guest" }>> = {}): Extract<Actor, { type: "guest" }> {
  return {
    type: "guest",
    guestId: "gst_test",
    roles: ["guest"],
    userId: null,
    user: null,
    ...overrides,
  };
}

export function chatFactory(overrides: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id: "cht_test",
    title: "Test chat",
    modelId: "gpt-4o-mini",
    projectId: null,
    agentPreset: null,
    isPinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function messageFactory(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg_test",
    chatId: "cht_test",
    role: "user",
    content: "hello",
    modelId: "gpt-4o-mini",
    createdAt: "2026-01-01T00:00:00.000Z",
    attachments: [],
    ...overrides,
  };
}

export function modelFactory(overrides: Partial<ModelOption> = {}): ModelOption {
  return {
    id: "gpt-4o-mini",
    displayName: "GPT-4o mini",
    provider: "openai",
    description: "Fast",
    isEnabled: true,
    isDefault: true,
    isGuestAllowed: true,
    maxOutputTokens: 2048,
    ...overrides,
  };
}

export function fileFactory(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    id: "fil_test",
    fileName: "file.txt",
    mimeType: "text/plain",
    sizeBytes: 10,
    storagePath: ".uploads/file.txt",
    ...overrides,
  };
}
