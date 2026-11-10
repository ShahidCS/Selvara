import { beforeEach, describe, expect, it } from "vitest";
import { BOARD_BODIES, isoShift, riskNeedsBoard, validateAcceptExpiry, validateBoardEvidence } from "@/lib/riskBoard";
import { acceptRisk } from "@/features/risk/services/risks";
import { approvals, approve } from "@/lib/approvals";
import { DATA } from "@/lib/data";
import { appStore } from "@/lib/store";

const NOW = new Date("2026-11-08T12:00:00Z");
const good = { ref: "BRD-2026-04", date: "2026-10-14", body: BOARD_BODIES[0], minutes: "Minutes 2026-10-14 item 5" };

describe("riskNeedsBoard threshold", () => {
  it("15 does not need Board evidence, 16 does", () => {
    expect(riskNeedsBoard(15)).toBe(false);
    expect(riskNeedsBoard(16)).toBe(true);
    expect(riskNeedsBoard(25)).toBe(true);
    expect(riskNeedsBoard(1)).toBe(false);
  });
});

describe("validateBoardEvidence", () => {
  it("accepts valid evidence and normalises the reference", () => {
    const r = validateBoardEvidence({ ...good, ref: "brd-2026-04" }, NOW);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ ref: "BRD-2026-04", date: "2026-10-14", body: "Board of Directors", minutes: "Minutes 2026-10-14 item 5" });
  });
  it("is required", () => expect(validateBoardEvidence(undefined, NOW).ok).toBe(false));
  it.each(["BRD-26-04", "BRD-2026-4", "BRD-2026-004", "XRD-2026-04", "BRD2026-04", ""])("rejects reference %s", (ref) => {
    const r = validateBoardEvidence({ ...good, ref }, NOW);
    expect(r.ok).toBe(false); expect(r.msg).toMatch(/BRD-YYYY-NN/);
  });
  it("rejects an invalid date", () => expect(validateBoardEvidence({ ...good, date: "14/10/2026" }, NOW).msg).toMatch(/valid Board decision date/));
  it("rejects a future date but accepts today", () => {
    expect(validateBoardEvidence({ ...good, date: "2026-11-09" }, NOW).msg).toMatch(/future/);
    expect(validateBoardEvidence({ ...good, date: "2026-11-08" }, NOW).ok).toBe(true);
  });
  it("accepts a decision exactly 90 days old and rejects 91", () => {
    expect(validateBoardEvidence({ ...good, date: isoShift(-90, NOW) }, NOW).ok).toBe(true);
    const old = validateBoardEvidence({ ...good, date: isoShift(-91, NOW) }, NOW);
    expect(old.ok).toBe(false); expect(old.msg).toMatch(/older than 90 days/);
  });
  it("requires a known approving body", () => {
    expect(validateBoardEvidence({ ...good, body: "The CEO" }, NOW).msg).toMatch(/approving body/);
    expect(validateBoardEvidence({ ...good, body: "Board Risk Committee" }, NOW).ok).toBe(true);
  });
  it("requires minutes reference or file; gates file type and size", () => {
    expect(validateBoardEvidence({ ...good, minutes: "ab" }, NOW).ok).toBe(false);
    expect(validateBoardEvidence({ ...good, minutes: "minutes.pdf" }, NOW).ok).toBe(true);
    expect(validateBoardEvidence({ ...good, minutes: "minutes.exe" }, NOW).msg).toMatch(/not allowed/);
    expect(validateBoardEvidence({ ...good, minutes: "", file: { name: "m.pdf", size: 1000 } }, NOW).ok).toBe(true);
    expect(validateBoardEvidence({ ...good, minutes: "", file: { name: "m.exe", size: 1000 } }, NOW).msg).toMatch(/Minutes attachment/);
    expect(validateBoardEvidence({ ...good, minutes: "", file: { name: "m.pdf", size: 11 * 1024 * 1024 } }, NOW).msg).toMatch(/too large/);
  });
  it("sanitises the stored minutes name", () => {
    const r = validateBoardEvidence({ ...good, minutes: "../x/minutes.pdf" }, NOW);
    expect(r.value?.minutes).not.toMatch(/[\\/]/);
  });
});

describe("validateAcceptExpiry", () => {
  it("must be a real, future date within 12 months", () => {
    expect(validateAcceptExpiry("nope", NOW)).toMatch(/valid date/);
    expect(validateAcceptExpiry("2026-11-08", NOW)).toMatch(/future/);
    expect(validateAcceptExpiry("2026-11-09", NOW)).toBeNull();
    expect(validateAcceptExpiry(isoShift(365, NOW), NOW)).toBeNull();
    expect(validateAcceptExpiry(isoShift(366, NOW), NOW)).toMatch(/12 months/);
  });
});

/* End to end through the service: the 15 / 16 boundary on a real acceptance. */
describe("acceptRisk at the Board threshold", () => {
  const risk = (id: string, rl: number, ri: number) => {
    DATA.risks.push({ id, title: id, owner: "Someone Else", cat: "Technology", l: rl, i: ri, cl: rl, ci: ri, rl, ri, status: "Open", treat: "Mitigate", _n: true, history: [], actions: [] });
    return id;
  };
  const evidence = () => ({ ref: "BRD-" + new Date().getFullYear() + "-04", date: isoShift(-5), body: BOARD_BODIES[0], minutes: "Minutes item 5" });
  const until = () => isoShift(200);
  beforeEach(() => { appStore.set({ role: "admin" }); approvals.set({ list: [] }); });

  it("residual 15 (5x3) is accepted through the authority ladder, effective immediately", async () => {
    const id = risk("RK-T15", 5, 3);
    const res = await acceptRisk(id, { by: "CISO", why: "Within tolerance after compensating controls", until: until(), comp: "Monitoring" });
    expect(res.msg).toBeUndefined();
    expect(res.ok).toBe(true);
    expect(res.pending).toBe(false);
    expect(DATA.risks.find((r) => r.id === id)?.status).toBe("Accepted");
  });

  it("residual 15 cannot be accepted by the Board / CEO rung", async () => {
    const id = risk("RK-T15B", 5, 3);
    const res = await acceptRisk(id, { by: "Board / CEO", why: "Within tolerance after compensating controls", until: until(), comp: "" });
    expect(res.ok).toBe(false);
  });

  it("residual 16 (4x4) without Board evidence is refused", async () => {
    const id = risk("RK-T16", 4, 4);
    const res = await acceptRisk(id, { by: "Board / CEO", why: "Accepting this residual risk deliberately", until: until(), comp: "" });
    expect(res.ok).toBe(false);
    expect(res.msg).toMatch(/Board approval evidence/);
    expect(DATA.risks.find((r) => r.id === id)?.status).toBe("Open");
  });

  it("residual 16 with valid evidence becomes pending and needs a second person to verify", async () => {
    const id = risk("RK-T16B", 4, 4);
    const res = await acceptRisk(id, { by: "Board / CEO", why: "Accepting this residual risk deliberately", until: until(), comp: "", board: evidence() });
    expect(res.msg).toBeUndefined();
    expect(res.ok).toBe(true);
    expect(res.pending).toBe(true);
    const r = DATA.risks.find((x) => x.id === id);
    expect(r?.status).toBe("Open");
    expect(r?.pendingAcceptance).toBeTruthy();
    // the recorder cannot verify their own evidence
    expect(() => approve(res.approvalId as string, "Verified against the minutes")).toThrow(/own request/);
  });

  it("residual 16 with stale (>90 day) evidence is refused", async () => {
    const id = risk("RK-T16C", 4, 4);
    const res = await acceptRisk(id, { by: "Board / CEO", why: "Accepting this residual risk deliberately", until: until(), comp: "", board: { ...evidence(), date: isoShift(-120) } });
    expect(res.ok).toBe(false);
    expect(res.msg).toMatch(/older than 90 days/);
  });

  it("residual 16 refuses an acceptance expiry beyond 12 months", async () => {
    const id = risk("RK-T16D", 4, 4);
    const res = await acceptRisk(id, { by: "Board / CEO", why: "Accepting this residual risk deliberately", until: isoShift(400), comp: "", board: evidence() });
    expect(res.ok).toBe(false);
    expect(res.msg).toMatch(/12 months/);
  });

  it("residual 16 can only be recorded by an admin", async () => {
    const id = risk("RK-T16E", 4, 4);
    appStore.set({ role: "owner" });
    await expect(acceptRisk(id, { by: "Board / CEO", why: "Accepting this residual risk deliberately", until: until(), comp: "", board: evidence() })).rejects.toThrow(/Not permitted/);
  });
});
