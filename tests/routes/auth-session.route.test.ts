import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

import type { Actor, ModelOption, PublicAppSettings } from "@/lib/types";

const guestActor: Actor = {
  type: "guest",
  guestId: "gst_1",
  roles: ["guest"],
  userId: null,
  user: null,
};

const resolveActor = mock(async () => ({
  actor: guestActor,
  needsGuestCookie: true,
  needsSessionCleanup: false,
}));
const resolveGuestActorFromCookies = mock(async () => ({
  actor: guestActor,
  needsGuestCookie: false,
  needsSessionCleanup: true,
}));

const settings: PublicAppSettings = {
  guestEnabled: true,
  guestAllowedModels: ["gpt-4o-mini"],
  defaultModelId: "gpt-4o-mini",
};
const models: ModelOption[] = [
  {
    id: "gpt-4o-mini",
    displayName: "GPT-4o mini",
    provider: "openai",
    description: "Fast",
    isEnabled: true,
    isDefault: true,
    isGuestAllowed: true,
    maxOutputTokens: 2048,
  },
];

const getPublicAppSettings = mock(async () => settings);
const listModelsForActor = mock(async () => models);
const attachActorCookies = mock((response: Response) => response);

mock.module("@/lib/auth/session", () => ({
  resolveActor,
  resolveGuestActorFromCookies,
}));
mock.module("@/lib/db/store", () => ({
  getPublicAppSettings,
  listModelsForActor,
}));
mock.module("@/lib/http", () => ({
  attachActorCookies,
}));

let GET: (typeof import("@/app/api/auth/session/route"))["GET"];

beforeAll(async () => {
  ({ GET } = await import("@/app/api/auth/session/route"));
});

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  resolveActor.mockClear();
  resolveGuestActorFromCookies.mockClear();
  getPublicAppSettings.mockClear();
  listModelsForActor.mockClear();
  attachActorCookies.mockClear();
  getPublicAppSettings.mockResolvedValue(settings);
});

describe("app/api/auth/session GET", () => {
  it("returns healthy session payload", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      actor: guestActor,
      settings,
      models,
      degraded: false,
    });
    expect(body).toMatchSnapshot();
  });

  it("falls back to degraded guest payload on failure", async () => {
    getPublicAppSettings.mockRejectedValue(new Error("db unavailable"));

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.degraded).toBeTrue();
    expect(body.error).toContain("db unavailable");
    expect(body.settings.defaultModelId).toBe("gpt-4o-mini");
    expect(body.models.length).toBeGreaterThan(0);
    expect(body).toMatchSnapshot();
  });
});
