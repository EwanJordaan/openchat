import { describe, expect, it } from "bun:test";

import { parseErrorMessage } from "@/components/admin/admin-dashboard";
import { buildAuthPayload } from "@/components/auth/signin-view";
import { resolveTheme } from "@/components/providers/theme-provider";
import { getNextMode } from "@/components/ui/theme-toggle";

describe("frontend helper utilities", () => {
  it("builds login and register auth payloads", () => {
    expect(buildAuthPayload("login", "a@example.com", "pw", "Ada")).toEqual({
      email: "a@example.com",
      password: "pw",
    });
    expect(buildAuthPayload("register", "a@example.com", "pw", "Ada")).toEqual({
      email: "a@example.com",
      password: "pw",
      name: "Ada",
    });
  });

  it("parses admin error responses safely", () => {
    expect(parseErrorMessage("")).toBeNull();
    expect(parseErrorMessage("not-json")).toBeNull();
    expect(parseErrorMessage('{"error":"Failed"}')).toBe("Failed");
    expect(parseErrorMessage('{"ok":true}')).toBeNull();
  });

  it("resolves next theme mode correctly", () => {
    expect(getNextMode("system", "dark")).toBe("light");
    expect(getNextMode("system", "light")).toBe("dark");
    expect(getNextMode("dark", "dark")).toBe("light");
    expect(getNextMode("light", "light")).toBe("dark");
  });

  it("resolves theme value from mode", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });
});
