import { describe, it, expect } from "bun:test";
import { createId, parseJson, toBool } from "@/lib/utils";

describe("utils — createId", () => {
  it("prefixes id with given prefix and underscore", () => {
    const id = createId("chk");
    expect(id.startsWith("chk_")).toBe(true);
  });

  it("generates ids of expected length (prefix + _ + 14 chars)", () => {
    const id = createId("doc");
    // nanoid alphabet 14 chars + prefix + underscore
    expect(id.length).toBe("doc".length + 1 + 14);
  });

  it("generates unique ids on successive calls", () => {
    const a = createId("usr");
    const b = createId("usr");
    expect(a).not.toBe(b);
  });

  it("uses different prefix correctly", () => {
    const id = createId("prj");
    expect(id.startsWith("prj_")).toBe(true);
  });
});

describe("utils — parseJson", () => {
  it("parses valid JSON string", () => {
    expect(parseJson('{"a":1}', { a: 0 })).toEqual({ a: 1 });
    expect(parseJson<number[]>('[1,2,3]', [])).toEqual([1, 2, 3]);
  });

  it("returns fallback for invalid JSON", () => {
    const fallback = { ok: false };
    expect(parseJson('{"a":}', fallback)).toBe(fallback);
    expect(parseJson("not-json", fallback)).toBe(fallback);
  });

  it("returns fallback for null/undefined", () => {
    const fallback = 42;
    expect(parseJson(null, fallback)).toBe(fallback);
    expect(parseJson(undefined, fallback)).toBe(fallback);
  });

  it("returns fallback for non-string values", () => {
    const fallback = "fallback";
    expect(parseJson(123, fallback)).toBe(fallback);
    expect(parseJson({ a: 1 }, fallback)).toBe(fallback);
  });

  it("parses JSON primitives", () => {
    expect(parseJson("true", false)).toBe(true);
    expect(parseJson('"hello"', "")).toBe("hello");
    expect(parseJson("123", 0)).toBe(123);
  });
});

describe("utils — toBool", () => {
  it("handles boolean inputs directly", () => {
    expect(toBool(true)).toBe(true);
    expect(toBool(false)).toBe(false);
  });

  it("handles numeric 1 vs other numbers", () => {
    expect(toBool(1)).toBe(true);
    expect(toBool(0)).toBe(false);
    expect(toBool(2)).toBe(false);
    expect(toBool(-1)).toBe(false);
  });

  it("handles string '1' and 'true' case-insensitively", () => {
    expect(toBool("1")).toBe(true);
    expect(toBool("true")).toBe(true);
    expect(toBool("True")).toBe(true);
    expect(toBool("TRUE")).toBe(true);
    expect(toBool("TrUe")).toBe(true);
  });

  it("returns false for other strings", () => {
    expect(toBool("0")).toBe(false);
    expect(toBool("false")).toBe(false);
    expect(toBool("yes")).toBe(false);
    expect(toBool("")).toBe(false);
  });

  it("returns false for null/undefined/objects", () => {
    expect(toBool(null)).toBe(false);
    expect(toBool(undefined)).toBe(false);
    expect(toBool({})).toBe(false);
    expect(toBool([])).toBe(false);
  });
});
