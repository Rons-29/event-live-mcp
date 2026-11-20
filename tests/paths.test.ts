import { describe, expect, it } from "vitest";
import { encodeEventDirName, eventStatePath } from "../src/paths.js";

describe("encodeEventDirName", () => {
  it("passes through already-safe ids unchanged", () => {
    expect(encodeEventDirName("demo-event-2026")).toBe("demo-event-2026");
    expect(encodeEventDirName("  talk_1.2  ")).toBe("talk_1.2");
  });

  it("encodes unsafe ids injectively so distinct inputs never collide", () => {
    const a = encodeEventDirName("event/a");
    const b = encodeEventDirName("event:a");
    const c = encodeEventDirName("勉強会");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
    expect(a.startsWith("id_")).toBe(true);
    expect(b.startsWith("id_")).toBe(true);
    expect(c.startsWith("id_")).toBe(true);
  });

  it("keeps state paths distinct for colliding sanitizations", () => {
    const pathA = eventStatePath("/tmp/data", "event/a");
    const pathB = eventStatePath("/tmp/data", "event:a");
    expect(pathA).not.toBe(pathB);
  });

  it("rejects empty ids", () => {
    expect(() => encodeEventDirName("   ")).toThrow(/empty/);
  });
});
