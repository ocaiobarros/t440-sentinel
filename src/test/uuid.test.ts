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

  it("falls back to Math.random when crypto.randomUUID is unavailable", () => {
    const original = crypto.randomUUID;
    try {
      // Simulate insecure context (HTTP) where randomUUID is missing
      (crypto as any).randomUUID = undefined;
      const id = generateUUID();
      expect(id).toMatch(UUID_REGEX);
    } finally {
      crypto.randomUUID = original;
    }
  });
});
