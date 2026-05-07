import { beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { resetDatabase } from "@/tests/integration/db/harness";
import type { Actor, Role } from "@/lib/types";

let createUser: (typeof import("@/lib/db/store"))["createUser"];
let listChats: (typeof import("@/lib/db/store"))["listChats"];
let setChatPinned: (typeof import("@/lib/db/store"))["setChatPinned"];
let createChat: (typeof import("@/lib/db/store"))["createChat"];

beforeAll(async () => {
  process.env.DATABASE_PROVIDER = "postgres";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:55432/openchat_test";
  ({ createUser, listChats, setChatPinned, createChat } = await import("@/lib/db/store"));
});

beforeEach(async () => {
  await resetDatabase();
});

describe("integration lib/db/store chat pinning", () => {
  it("maps is_pinned to isPinned in chat summaries", async () => {
    const user = await createUser({ email: "pin1@example.com", passwordHash: "hash", name: "Pin One" });
    const actor: Actor = {
      type: "user" as const,
      guestId: "gst_1",
      userId: user.id,
      roles: ["user"] as Role[],
      user: { id: user.id, email: user.email, name: user.name, imageUrl: null },
    };

    const chatA = await createChat(actor, "A", "gpt-4o-mini");
    const chatB = await createChat(actor, "B", "gpt-4o-mini");

    await setChatPinned(actor, chatB, true);

    const chats = await listChats(actor);
    const mapped = chats.find((chat) => chat.id === chatB);

    expect(mapped?.isPinned).toBe(true);
    expect(chats.some((chat) => chat.id === chatA)).toBe(true);
  });

  it("updates pin state for user chats", async () => {
    const user = await createUser({ email: "pin2@example.com", passwordHash: "hash", name: "Pin Two" });
    const actor: Actor = {
      type: "user" as const,
      guestId: "gst_2",
      userId: user.id,
      roles: ["user"] as Role[],
      user: { id: user.id, email: user.email, name: user.name, imageUrl: null },
    };

    const chat = await createChat(actor, "Pin target", "gpt-4o-mini");
    await setChatPinned(actor, chat, true);

    const chats = await listChats(actor);
    expect(chats.find((item) => item.id === chat)?.isPinned).toBe(true);
  });

  it("updates pin state for guest chats", async () => {
    const guestActor: Actor = {
      type: "guest" as const,
      guestId: "gst_3",
      roles: ["guest"] as ["guest"],
      userId: null,
      user: null,
    };

    const chat = await createChat(guestActor, "Guest pin", "gpt-4o-mini");
    await setChatPinned(guestActor, chat, true);

    const chats = await listChats(guestActor);
    expect(chats.find((item) => item.id === chat)?.isPinned).toBe(true);
  });
});
