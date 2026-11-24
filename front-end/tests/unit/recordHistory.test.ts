import { describe, expect, it } from "vitest";
import { actionText, historyFor } from "@/components/kit/RecordHistory";
import type { WsEntry } from "@/lib/audit";

const e = (seq: number, target: string, action = "issue.updated"): WsEntry => ({ seq, prev: "", hash: "", at: `2026-11-0${seq} 10:00`, actor: "Owen Hart", action, target, cat: "Control" });

describe("record history (R23)", () => {
  it("matches the record id as a whole token at the start of the target, newest first", () => {
    const log = [e(1, "R-014 (High) by Owen Hart", "issue.created"), e(2, "R-0145 something"), e(3, "R-014: Open → In progress"), e(4, "P-014 policy"), e(5, "Report about R-014")];
    expect(historyFor("R-014", log).map((x) => x.seq)).toEqual([3, 1]);
    expect(historyFor("R-01", log)).toEqual([]);
  });
  it("treats regex characters in an id literally", () => {
    expect(historyFor("A.1", [e(1, "A.1 updated"), e(2, "AX1 updated")]).map((x) => x.seq)).toEqual([1]);
  });
  it("turns an action into a short sentence without the record type", () => {
    expect(actionText("issue.closure.proposed")).toBe("Closure proposed");
    expect(actionText("control.status.followed-tests")).toBe("Status followed tests");
    expect(actionText("exported")).toBe("Exported");
  });
});
