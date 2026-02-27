import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateUUID } from "@/lib/uuid";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("generateUUID", () => {
  it("returns a valid UUID v4 string", () => {
    const id = generateUUID();
    expect(id).toMatch(UUID_REGEX);
  });

  it("generates unique values on successive calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateUUID()));
    expect(ids.size).toBe(100);
  });

  it("has correct length (36 chars with hyphens)", () => {
    expect(generateUUID()).toHaveLength(36);
  });

  it("version nibble is always 4", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateUUID()[14]).toBe("4");
    }
  });

  it("variant nibble is always 8, 9, a, or b", () => {
    for (let i = 0; i < 50; i++) {
      expect("89ab").toContain(generateUUID()[19]);
    }
  });

  it("falls back to Math.random when crypto.randomUUID is unavailable", () => {
    const original = crypto.randomUUID;
    try {
      (crypto as any).randomUUID = undefined;
      const id = generateUUID();
      expect(id).toMatch(UUID_REGEX);
    } finally {
      crypto.randomUUID = original;
    }
  });

  it("fallback also produces unique values", () => {
    const original = crypto.randomUUID;
    try {
      (crypto as any).randomUUID = undefined;
      const ids = new Set(Array.from({ length: 50 }, () => generateUUID()));
      expect(ids.size).toBe(50);
    } finally {
      crypto.randomUUID = original;
    }
  });

  it("returns lowercase hex only", () => {
    const id = generateUUID().replace(/-/g, "");
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });
});
