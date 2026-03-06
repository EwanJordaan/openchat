import { describe, expect, it } from "bun:test";

import { asNumber, clamp, createId, parseJson, toBool } from "@/lib/utils";

describe("lib/utils", () => {
  it("creates prefixed ids", () => {
    const id = createId("msg");
    expect(id.startsWith("msg_")).toBeTrue();
    expect(id.length).toBeGreaterThan(10);
  });

  it("converts values to booleans", () => {
    expect(toBool(true)).toBeTrue();
    expect(toBool(false)).toBeFalse();
    expect(toBool(1)).toBeTrue();
    expect(toBool(0)).toBeFalse();
    expect(toBool("true")).toBeTrue();
    expect(toBool("TRUE")).toBeTrue();
    expect(toBool("1")).toBeTrue();
    expect(toBool("false")).toBeFalse();
    expect(toBool(null)).toBeFalse();
  });

  it("parses numbers with fallback", () => {
    expect(asNumber("42", 0)).toBe(42);
    expect(asNumber(undefined, 7)).toBe(7);
    expect(asNumber("nan", 9)).toBe(9);
  });

  it("parses json safely", () => {
    expect(parseJson('{"ok":true}', { ok: false })).toEqual({ ok: true });
    expect(parseJson(null, { ok: false })).toEqual({ ok: false });
    expect(parseJson("{broken", { ok: false })).toEqual({ ok: false });
  });

  it("clamps values to range", () => {
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(-3, 1, 10)).toBe(1);
    expect(clamp(99, 1, 10)).toBe(10);
  });
});
