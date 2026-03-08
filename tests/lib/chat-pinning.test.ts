import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

import type { Actor } from "@/lib/types";

const query = mock(async () => [] as Record<string, unknown>[]);
const ensureDatabase = mock(async () => undefined);

mock.module("@/lib/db/bootstrap", () => ({
  ensureDatabase,
}));

mock.module("@/lib/db/client", () => ({
  getDb: () => ({
    provider: "postgres",
    query,
    withTransaction: async <T,>(run: (tx: { query: typeof query }) => Promise<T>) => run({ query }),
  }),
}));

mock.module("@/lib/env", () => ({
  env: {
    SETTINGS_ENCRYPTION_KEY: "test-key",
  },
}));

let listChats: (typeof import("@/lib/db/store"))["listChats"];
let setChatPinned: (typeof import("@/lib/db/store"))["setChatPinned"];

const userActor: Actor = {
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

const guestActor: Actor = {
  type: "guest",
  guestId: "gst_1",
  roles: ["guest"],
  userId: null,
  user: null,
};

beforeAll(async () => {
  ({ listChats, setChatPinned } = await import("@/lib/db/store"));
});

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  query.mockClear();
  ensureDatabase.mockClear();
});

describe("lib/db/store chat pinning", () => {
  it("maps is_pinned to isPinned in chat summaries", async () => {
    query.mockResolvedValueOnce([
      {
        id: "cht_pinned",
        title: "Pinned",
        model_id: "gpt-4o-mini",
        is_pinned: 1,
        created_at: "2026-03-08T10:00:00.000Z",
        updated_at: "2026-03-08T10:01:00.000Z",
      },
      {
        id: "cht_regular",
        title: "Regular",
        model_id: "gpt-4o-mini",
        is_pinned: 0,
        created_at: "2026-03-08T10:00:00.000Z",
        updated_at: "2026-03-08T10:00:30.000Z",
      },
    ]);

    const chats = await listChats(userActor);

    expect(chats).toEqual([
      {
        id: "cht_pinned",
        title: "Pinned",
        modelId: "gpt-4o-mini",
        isPinned: true,
        createdAt: "2026-03-08T10:00:00.000Z",
        updatedAt: "2026-03-08T10:01:00.000Z",
      },
      {
        id: "cht_regular",
        title: "Regular",
        modelId: "gpt-4o-mini",
        isPinned: false,
        createdAt: "2026-03-08T10:00:00.000Z",
        updatedAt: "2026-03-08T10:00:30.000Z",
      },
    ]);
  });

  it("updates pin state for user chats", async () => {
    await setChatPinned(userActor, "cht_1", true);

    expect(ensureDatabase).toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("updates pin state for guest chats", async () => {
    await setChatPinned(guestActor, "cht_1", false);

    expect(ensureDatabase).toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
