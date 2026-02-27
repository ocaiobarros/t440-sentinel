import { describe, it, expect } from "vitest";
import { parseConnectionStatus } from "@/data/serverData";

describe("parseConnectionStatus (IF-MIB standard)", () => {
  // ── Numeric SNMP values (raw numbers) ──
  it("maps numeric '1' to Up (ok)", () => {
    const result = parseConnectionStatus("1");
    expect(result.text).toBe("Up");
    expect(result.level).toBe("ok");
  });

  it("maps numeric '2' to Down (critical)", () => {
    const result = parseConnectionStatus("2");
    expect(result.text).toBe("Down");
    expect(result.level).toBe("critical");
  });

  it("maps numeric '3' to Testing (info)", () => {
    expect(parseConnectionStatus("3").text).toBe("Testing");
  });

  it("maps numeric '4' to Unknown (info)", () => {
    expect(parseConnectionStatus("4").text).toBe("Unknown");
  });

  it("maps numeric '5' to Dormant (info)", () => {
    expect(parseConnectionStatus("5").text).toBe("Dormant");
  });

  it("maps numeric '6' to Not Present (info)", () => {
    expect(parseConnectionStatus("6").text).toBe("Not Present");
  });

  it("maps numeric '7' to Down (critical) — LowerLayerDown", () => {
    const r = parseConnectionStatus("7");
    expect(r.text).toBe("Down");
    expect(r.level).toBe("critical");
  });

  // ── Parenthesized SNMP values (Zabbix format) ──
  it("extracts SNMP value from parentheses: 'Up (1)' → Up", () => {
    const result = parseConnectionStatus("Up (1)");
    expect(result.text).toBe("Up");
    expect(result.level).toBe("ok");
  });

  it("numeric wins over text label: 'Down (1)' → Up", () => {
    const result = parseConnectionStatus("Down (1)");
    expect(result.text).toBe("Up");
    expect(result.level).toBe("ok");
  });

  it("numeric wins over text label: 'Up (2)' → Down", () => {
    const result = parseConnectionStatus("Up (2)");
    expect(result.text).toBe("Down");
    expect(result.level).toBe("critical");
  });

  it("handles 'Testing (3)' correctly", () => {
    const result = parseConnectionStatus("Testing (3)");
    expect(result.text).toBe("Testing");
    expect(result.level).toBe("info");
  });

  it("handles 'Dormant (5)' correctly", () => {
    const result = parseConnectionStatus("Dormant (5)");
    expect(result.text).toBe("Dormant");
    expect(result.level).toBe("info");
  });

  it("handles 'notPresent (6)' correctly", () => {
    const result = parseConnectionStatus("notPresent (6)");
    expect(result.text).toBe("Not Present");
    expect(result.level).toBe("info");
  });

  it("handles 'lowerLayerDown (7)' correctly", () => {
    const result = parseConnectionStatus("lowerLayerDown (7)");
    expect(result.text).toBe("Down");
    expect(result.level).toBe("critical");
  });

  // ── Pure text fallback (keyword matching) ──
  it("falls back to keyword for pure text 'Up'", () => {
    expect(parseConnectionStatus("Up").level).toBe("ok");
  });

  it("falls back to keyword for pure text 'Down'", () => {
    expect(parseConnectionStatus("Down").level).toBe("critical");
  });

  it("keyword matching is case-insensitive", () => {
    expect(parseConnectionStatus("UP").level).toBe("ok");
    expect(parseConnectionStatus("down").level).toBe("critical");
  });

  // ── Empty / dash / unknown ──
  it("returns info for empty/dash values", () => {
    expect(parseConnectionStatus("").level).toBe("info");
    expect(parseConnectionStatus("—").level).toBe("info");
    expect(parseConnectionStatus("-").level).toBe("info");
  });

  it("returns info for unknown text", () => {
    const result = parseConnectionStatus("SomethingWeird");
    expect(result.level).toBe("info");
    expect(result.text).toBe("SomethingWeird");
  });

  it("handles whitespace-padded values", () => {
    const result = parseConnectionStatus("  1  ");
    expect(result.text).toBe("Up");
  });

  // ── Out-of-range numeric values ──
  it("returns info for out-of-range numeric '99'", () => {
    expect(parseConnectionStatus("99").level).toBe("info");
  });
});
