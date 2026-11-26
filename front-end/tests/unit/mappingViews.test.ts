import { describe, expect, it } from "vitest";
import { mappedFws, reqTitle } from "@/lib/data";
import { codeWidth } from "@/lib/format";

/* Shared helpers behind the mapping views (cross-framework matrix, requirements satisfied, a requirement's mapped controls). */
describe("mapping view helpers", () => {
  it("resolves a requirement code to its catalogue title, and says so when it does not", () => {
    expect(reqTitle("iso27001", "A.5.1")).toBe("Approve, publish and review security policies");
    expect(reqTitle("soc2", "CC5.3")).toBeNull(); // a legacy short reference, kept for review
    expect(reqTitle("sbp", "8")).toBeNull(); // a framework the library no longer lists
  });
  it("shows only mappings to frameworks in the library, and only non-empty ones", () => {
    expect(mappedFws({ map: { iso27001: ["A.5.1"], sbp: ["Reg.8"], amlcft: ["1"], soc2: [] } })).toEqual(["iso27001"]);
    expect(mappedFws({})).toEqual([]);
  });
  it("sizes the code column to the longest code, within bounds", () => {
    expect(codeWidth(["A.5.1", "RTS-Art.11(1)"])).toEqual({ "--code-w": "14ch" });
    expect(codeWidth(["1"])).toEqual({ "--code-w": "6ch" });
    expect(codeWidth(["x".repeat(40)])).toEqual({ "--code-w": "18ch" });
  });
});
