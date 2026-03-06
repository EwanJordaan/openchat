import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

import type { Actor, ChatMessage, ModelOption, PublicAppSettings, RoleLimit, UploadedFile } from "@/lib/types";

type ChatRecord = {
  id: string;
  title: string;
  modelId: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

type RewriteResult =
  | {
      ok: true;
      removedMessageIds: string[];
    }
  | {
      ok: false;
      reason: "chat-not-found" | "message-not-found" | "not-user-message";
    };

const actor: Actor = {
  type: "user",
  guestId: "gst_1",
  roles: ["user"],
  userId: "usr_1",
  user: {
    id: "usr_1",
    email: "ada@example.com",
    name: "Ada",
    imageUrl: null,
  },
};

const settings: PublicAppSettings = {
  guestEnabled: true,
  guestAllowedModels: ["gpt-4o-mini"],
  defaultModelId: "gpt-4o-mini",
};

const model: ModelOption = {
  id: "gpt-4o-mini",
  displayName: "GPT-4o mini",
  provider: "openai",
  description: "Fast",
  isEnabled: true,
  isDefault: true,
  isGuestAllowed: true,
  maxOutputTokens: 2048,
};

const roleLimit: RoleLimit = {
  role: "user",
  dailyMessageLimit: 800,
  maxAttachmentCount: 5,
  maxAttachmentMb: 12,
};

const attachedFile: UploadedFile = {
  id: "fil_1",
  fileName: "notes.txt",
  mimeType: "text/plain",
  sizeBytes: 128,
  storagePath: "/files/notes.txt",
};

const resolveActor = mock(async () => ({
  actor,
  needsGuestCookie: false,
  needsSessionCleanup: false,
}));
const streamAssistantReply = mock(
  async ({
    onToken,
  }: {
    onToken: (token: string) => void;
    messages: ChatMessage[];
  }) => {
    onToken("Assistant reply");
    return {
      content: "Assistant reply",
      providerStatus: "ok",
      usage: { promptTokens: 11, completionTokens: 7, totalTokens: 18 },
    };
  },
);
const attachActorCookies = mock((response: Response) => response);
const jsonError = (message: string, status = 400) => Response.json({ error: message }, { status });

const appendMessage = mock(async () => "msg_appended");
const checkAndConsumeMessageQuota = mock(async () => ({ allowed: true, remaining: 799 }));
const createChat = mock(async () => "cht_new");
const getChat = mock(async (): Promise<ChatRecord | null> => null);
const getOwnedFiles = mock(async (currentActor: Actor, fileIds: string[]) =>
  fileIds.length ? [attachedFile] : [],
);
const getPublicAppSettings = mock(async () => settings);
const getRoleLimit = mock(async () => roleLimit);
const listModelsForActor = mock(async () => [model]);
const logAudit = mock(async () => undefined);
const rewriteUserMessageAndTrimFollowing = mock(async (): Promise<RewriteResult> => ({
  ok: true,
  removedMessageIds: ["msg_2"],
}));
const touchFilesWithChat = mock(async () => undefined);

mock.module("@/lib/auth/session", () => ({
  resolveActor,
}));

mock.module("@/lib/ai/provider", () => ({
  streamAssistantReply,
}));

mock.module("@/lib/http", () => ({
  attachActorCookies,
  jsonError,
}));

mock.module("@/lib/db/store", () => ({
  appendMessage,
  checkAndConsumeMessageQuota,
  createChat,
  getChat,
  getOwnedFiles,
  getPublicAppSettings,
  getRoleLimit,
  listModelsForActor,
  logAudit,
  rewriteUserMessageAndTrimFollowing,
  touchFilesWithChat,
}));

let POST: (typeof import("@/app/api/chat/send/route"))["POST"];

beforeAll(async () => {
  ({ POST } = await import("@/app/api/chat/send/route"));
});

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  resolveActor.mockClear();
  streamAssistantReply.mockClear();
  attachActorCookies.mockClear();
  appendMessage.mockClear();
  checkAndConsumeMessageQuota.mockClear();
  createChat.mockClear();
  getChat.mockClear();
  getOwnedFiles.mockClear();
  getPublicAppSettings.mockClear();
  getRoleLimit.mockClear();
  listModelsForActor.mockClear();
  logAudit.mockClear();
  rewriteUserMessageAndTrimFollowing.mockClear();
  touchFilesWithChat.mockClear();

  getPublicAppSettings.mockResolvedValue(settings);
  listModelsForActor.mockResolvedValue([model]);
  checkAndConsumeMessageQuota.mockResolvedValue({ allowed: true, remaining: 799 });
  getRoleLimit.mockResolvedValue(roleLimit);
  getOwnedFiles.mockImplementation(async (_currentActor: Actor, fileIds: string[]) => (fileIds.length ? [attachedFile] : []));
  rewriteUserMessageAndTrimFollowing.mockResolvedValue({ ok: true, removedMessageIds: ["msg_2"] });
});

function createRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/chat/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("app/api/chat/send POST", () => {
  it("preserves the normal send path", async () => {
    getChat
      .mockResolvedValueOnce({
        id: "cht_1",
        title: "Existing chat",
        modelId: model.id,
        createdAt: "2026-03-06T10:00:00.000Z",
        updatedAt: "2026-03-06T10:00:00.000Z",
        messages: [],
      })
      .mockResolvedValueOnce({
        id: "cht_1",
        title: "Existing chat",
        modelId: model.id,
        createdAt: "2026-03-06T10:00:00.000Z",
        updatedAt: "2026-03-06T10:00:00.000Z",
        messages: [
          {
            id: "msg_user",
            chatId: "cht_1",
            role: "user",
            content: "Hello",
            modelId: model.id,
            createdAt: "2026-03-06T10:00:00.000Z",
            attachments: [attachedFile],
          },
        ],
      });

    const response = await POST(
      createRequest({
        chatId: "cht_1",
        modelId: model.id,
        message: "Hello",
        attachmentIds: [attachedFile.id],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("Assistant reply");

    expect(rewriteUserMessageAndTrimFollowing).not.toHaveBeenCalled();
    expect(touchFilesWithChat).toHaveBeenCalledWith([attachedFile.id], "cht_1");
    expect(appendMessage).toHaveBeenNthCalledWith(1, {
      chatId: "cht_1",
      role: "user",
      content: "Hello",
      modelId: model.id,
      attachments: [attachedFile],
    });
    expect(appendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        chatId: "cht_1",
        role: "assistant",
        content: "Assistant reply",
        modelId: model.id,
      }),
    );
  });

  it("rewrites a user message and streams a regenerated reply", async () => {
    getChat
      .mockResolvedValueOnce({
        id: "cht_1",
        title: "Existing chat",
        modelId: model.id,
        createdAt: "2026-03-06T10:00:00.000Z",
        updatedAt: "2026-03-06T10:00:00.000Z",
        messages: [],
      })
      .mockResolvedValueOnce({
        id: "cht_1",
        title: "Existing chat",
        modelId: model.id,
        createdAt: "2026-03-06T10:00:00.000Z",
        updatedAt: "2026-03-06T10:00:00.000Z",
        messages: [
          {
            id: "msg_1",
            chatId: "cht_1",
            role: "user",
            content: "Updated prompt",
            modelId: model.id,
            createdAt: "2026-03-06T10:00:00.000Z",
            attachments: [],
          },
        ],
      });

    const response = await POST(
      createRequest({
        chatId: "cht_1",
        editMessageId: "msg_1",
        modelId: model.id,
        message: "Updated prompt",
        attachmentIds: [],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("Assistant reply");

    expect(rewriteUserMessageAndTrimFollowing).toHaveBeenCalledWith(actor, {
      chatId: "cht_1",
      messageId: "msg_1",
      content: "Updated prompt",
    });
    expect(touchFilesWithChat).not.toHaveBeenCalled();
    expect(appendMessage).toHaveBeenCalledTimes(1);
    expect(appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "cht_1",
        role: "assistant",
        content: "Assistant reply",
      }),
    );
  });

  it("rejects edits for non-user messages", async () => {
    getChat.mockResolvedValueOnce({
      id: "cht_1",
      title: "Existing chat",
      modelId: model.id,
      createdAt: "2026-03-06T10:00:00.000Z",
      updatedAt: "2026-03-06T10:00:00.000Z",
      messages: [],
    });
    rewriteUserMessageAndTrimFollowing.mockResolvedValueOnce({
      ok: false as const,
      reason: "not-user-message",
    });

    const response = await POST(
      createRequest({
        chatId: "cht_1",
        editMessageId: "msg_assistant",
        modelId: model.id,
        message: "nope",
        attachmentIds: [],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Only user messages can be edited",
    });
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it("rejects edit requests without a chat id", async () => {
    const response = await POST(
      createRequest({
        editMessageId: "msg_1",
        modelId: model.id,
        message: "Updated prompt",
        attachmentIds: [],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Editing a message requires a chat id",
    });
    expect(rewriteUserMessageAndTrimFollowing).not.toHaveBeenCalled();
  });

  it("preserves attachments on edited user messages when rehydrating the chat", async () => {
    const preservedAttachmentMessage: ChatMessage = {
      id: "msg_1",
      chatId: "cht_1",
      role: "user",
      content: "Updated prompt",
      modelId: model.id,
      createdAt: "2026-03-06T10:00:00.000Z",
      attachments: [attachedFile],
    };

    getChat
      .mockResolvedValueOnce({
        id: "cht_1",
        title: "Existing chat",
        modelId: model.id,
        createdAt: "2026-03-06T10:00:00.000Z",
        updatedAt: "2026-03-06T10:00:00.000Z",
        messages: [preservedAttachmentMessage],
      })
      .mockResolvedValueOnce({
        id: "cht_1",
        title: "Existing chat",
        modelId: model.id,
        createdAt: "2026-03-06T10:00:00.000Z",
        updatedAt: "2026-03-06T10:00:00.000Z",
        messages: [preservedAttachmentMessage],
      });

    const response = await POST(
      createRequest({
        chatId: "cht_1",
        editMessageId: "msg_1",
        modelId: model.id,
        message: "Updated prompt",
        attachmentIds: [],
      }),
    );

    expect(response.status).toBe(200);
    await response.text();

    expect(streamAssistantReply).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [preservedAttachmentMessage],
      }),
    );
  });
});
