import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

import type { Actor } from "@/lib/types";

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

const resolveActor = mock(async () => ({
  actor,
  needsGuestCookie: false,
  needsSessionCleanup: false,
}));
const invalidateChatListCache = mock(() => undefined);
const archiveChat = mock(async () => undefined);
const getChat = mock(async () => null);
const renameChat = mock(async () => undefined);
const setChatPinned = mock(async () => undefined);
const attachActorCookies = mock((response: Response) => response);
const jsonError = (message: string, status = 400) => Response.json({ error: message }, { status });

mock.module("@/lib/auth/session", () => ({
  resolveActor,
}));

mock.module("@/lib/cache/chat-cache", () => ({
  invalidateChatListCache,
}));

mock.module("@/lib/db/store", () => ({
  archiveChat,
  getChat,
  renameChat,
  setChatPinned,
}));

mock.module("@/lib/http", () => ({
  attachActorCookies,
  jsonError,
}));

let PATCH: (typeof import("@/app/api/chats/[id]/route"))["PATCH"];

beforeAll(async () => {
  ({ PATCH } = await import("@/app/api/chats/[id]/route"));
});

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  resolveActor.mockClear();
  invalidateChatListCache.mockClear();
  archiveChat.mockClear();
  getChat.mockClear();
  renameChat.mockClear();
  setChatPinned.mockClear();
  attachActorCookies.mockClear();
});

function makePatchRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/chats/cht_1", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("app/api/chats/[id] PATCH", () => {
  it("renames a chat when title is provided", async () => {
    const response = await PATCH(makePatchRequest({ title: "Renamed chat" }), {
      params: Promise.resolve({ id: "cht_1" }),
    });

    expect(response.status).toBe(200);
    expect(renameChat).toHaveBeenCalledWith(actor, "cht_1", "Renamed chat");
    expect(setChatPinned).not.toHaveBeenCalled();
    expect(invalidateChatListCache).toHaveBeenCalledWith("user", "usr_1");
  });

  it("pins a chat when isPinned is true", async () => {
    const response = await PATCH(makePatchRequest({ isPinned: true }), {
      params: Promise.resolve({ id: "cht_1" }),
    });

    expect(response.status).toBe(200);
    expect(setChatPinned).toHaveBeenCalledWith(actor, "cht_1", true);
    expect(renameChat).not.toHaveBeenCalled();
    expect(invalidateChatListCache).toHaveBeenCalledWith("user", "usr_1");
  });

  it("unpins a chat when isPinned is false", async () => {
    const response = await PATCH(makePatchRequest({ isPinned: false }), {
      params: Promise.resolve({ id: "cht_1" }),
    });

    expect(response.status).toBe(200);
    expect(setChatPinned).toHaveBeenCalledWith(actor, "cht_1", false);
    expect(renameChat).not.toHaveBeenCalled();
    expect(invalidateChatListCache).toHaveBeenCalledWith("user", "usr_1");
  });

  it("rejects invalid payloads", async () => {
    const response = await PATCH(makePatchRequest({ title: "Test", isPinned: true }), {
      params: Promise.resolve({ id: "cht_1" }),
    });

    expect(response.status).toBe(400);
    expect(renameChat).not.toHaveBeenCalled();
    expect(setChatPinned).not.toHaveBeenCalled();
    expect(invalidateChatListCache).not.toHaveBeenCalled();
  });
});
