import { describe, it, expect } from "vitest";
import { parseConnectionStatus } from "@/data/serverData";

describe("parseConnectionStatus (IF-MIB standard)", () => {
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

  it("extracts SNMP value from parentheses: 'Up (1)' → Up", () => {
    const result = parseConnectionStatus("Up (1)");
    expect(result.text).toBe("Up");
    expect(result.level).toBe("ok");
  });

  it("extracts SNMP value from parentheses: 'Down (1)' → Up (numeric wins)", () => {
    // Zabbix may apply wrong label; the numeric SNMP value 1 = Up per IF-MIB
    const result = parseConnectionStatus("Down (1)");
    expect(result.text).toBe("Up");
    expect(result.level).toBe("ok");
  });

  it("extracts SNMP value: 'Up (2)' → Down (numeric wins)", () => {
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

  it("falls back to keyword for pure text 'Up'", () => {
    const result = parseConnectionStatus("Up");
    expect(result.level).toBe("ok");
  });

  it("falls back to keyword for pure text 'Down'", () => {
    const result = parseConnectionStatus("Down");
    expect(result.level).toBe("critical");
  });

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
});
