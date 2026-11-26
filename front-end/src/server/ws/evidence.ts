/* Server-only. Evidence on the server (production programme group 1; inventory: docs/architecture/inventory/group1-*.md), with real files
   (files.ts). The collector, every person who versioned it and everyone who attached a file are its contributors, compared by user id: none of
   them may accept it. Any change to accepted or rejected evidence sends it back for review. Deletion is requested by an admin and approved by a
   different admin (four-eyes, 72 hours); the record keeps its row as removed, a tombstone records who and why, and its files are deleted. */
import { randomUUID, createHash } from "node:crypto";
import {
  EVIDENCE_DELETE_TTL_H, EVIDENCE_FILES_PER_ITEM, EVIDENCE_TYPES, evidenceDecideDeleteBlock, evidenceRequestDeleteBlock, evidenceReviewBlock, evidenceWriteBlock, isoDayOf, textBlock,
} from "@/lib/rulesWs";
import { approvalBlock, reasonBlock } from "@/lib/rules";
import type { Deps } from "../types";
import { approvalsView, invalid, membersOf, missing, ok, refuse, str, sweepApprovals, txt, wsRoute, type WsHelpers, refuseFile } from "./common";
import { auditorScope, scopeGuard, withoutMemberIds } from "./audits";
import { checkFile } from "./files";
import { WsConflict, WsRefused, type Rec, type WsTx } from "./store";

export interface Attachment { id: string; name: string; size: string; bytes: number; by: string; byId: string; at: string; path: string; sha256: string; type: string }
export interface Evidence {
  id: string; name: string; type: string; updated: string; by: string; byId: string; note: string; ver: number; attachments: Attachment[];
  history: { ver: number; at: string; by: string; byId: string; note: string }[];
  review: { status: "Pending review" | "Accepted" | "Rejected"; by?: string; byId?: string; at?: string; note?: string };
  deleteRequest?: { approvalId: string; by: string; byId: string; at: string; reason: string };
}
const DEL = ["evidence.delete"];
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;
const contributors = (e: Evidence) => new Set([e.byId, ...e.history.map((h) => h.byId), ...e.attachments.map((a) => a.byId)].filter(Boolean));
async function item(t: WsTx, id: string) { return (await t.get<Evidence>("evidence", id)) ?? missing("Evidence"); }
/** Any content change on reviewed evidence sends it back for review (audited). */
async function touch(t: WsTx, e: Evidence) {
  if (e.review.status === "Pending review") return;
  const old = e.review.status; e.review = { status: "Pending review" };
  await t.audit("evidence.review.reset", `${e.id} v${e.ver}: ${old} → Pending review after edit`);
}
/** A decision is about what the person saw: if the evidence changed since (a new version, file or edit), they look again. */
function stale(seen: unknown, version: number) {
  if (seen != null && Number(seen) !== version) throw new WsConflict("This evidence changed since you opened it (a new version, file or edit). Look at it again before deciding.");
}
async function pendingDelete(t: WsTx, e: Evidence) {
  if (!e.deleteRequest) return null;
  const a = await t.approval(e.deleteRequest.approvalId, DEL);
  return a && a.status === "Pending" && a.expiresAt > t.now ? a : null;
}

export function evidenceRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: import("./store").Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);
  const input = (b: Record<string, unknown>) => {
    const name = txt(b.name, 160); if (!name) invalid("Name is required.");
    return { name, type: (EVIDENCE_TYPES as readonly string[]).includes(str(b.type, 20)) ? str(b.type, 20) : null, note: txt(b.note, 2000) };
  };
  /** For an auditor, evidence outside their scope (not shared with a live engagement of theirs) does not exist: answered before any other check. */
  const hide = async (d: Deps, c: { actor: import("./store").Actor }, id: string) => { if (c.actor.role === "auditor") await tx(d, c, (t) => scopeGuard(t, "evidence", id, "Evidence")); };

  const data = wsRoute(h, "evidence", async (d, _r, c) => ok(await tx(d, c, async (t) => {
    await sweepApprovals(t, DEL);
    const names = new Map((await membersOf(d, t.actor)).map((m) => [m.id, m.name]));
    const scope = await auditorScope(t); const sees = (id: string) => !scope || scope.evidence.has(id); // an auditor: only what is shared with them
    // newest first, as the register shows them; file paths stay on the server
    const items = (await t.list<Evidence>("evidence")).filter((x) => sees(x.id)).map((x) => ({ ...x.data, _v: x.version, attachments: x.data.attachments.map(({ path: _p, ...a }) => (void _p, a)) })).reverse();
    const out = { evidence: items, approvals: (await approvalsView(t, DEL, names)).filter((a) => sees(String(a.subject ?? ""))), filesConfigured: d.files.configured };
    return scope ? withoutMemberIds(out) : out; // an external auditor: collector and reviewer names stay, member ids do not
  })));
  const create = wsRoute(h, "evidence", async (d, r, c) => {
    refuse(evidenceWriteBlock(c.actor.role)); const x = input(r.body); const me = c.actor;
    return tx(d, c, async (t) => {
      const id = `EV-${await t.next("evidence", 208)}`; const day = isoDayOf(t.now);
      await t.insert("evidence", id, { id, name: x.name, type: x.type ?? EVIDENCE_TYPES[0], updated: day, by: me.name, byId: me.id, note: x.note, ver: 1, attachments: [],
        history: [{ ver: 1, at: day, by: me.name, byId: me.id, note: "Evidence created" }], review: { status: "Pending review" } } satisfies Evidence);
      await t.audit("evidence.created", `${id} v1 collected by ${me.name}`);
      return ok({ id });
    });
  });
  const update = wsRoute(h, "evidence", async (d, r, c) => {
    const id = str(r.path[2], 40); await hide(d, c, id);
    refuse(evidenceWriteBlock(c.actor.role)); const x = input(r.body);
    return tx(d, c, async (t) => {
      const rec = await item(t, id); const e = rec.data;
      e.name = x.name; if (x.type) e.type = x.type; e.note = x.note; e.updated = isoDayOf(t.now); // the collector never changes
      await touch(t, e); await t.update("evidence", id, e, rec.version); await t.audit("evidence.updated", `${id} v${e.ver}`);
      return ok(e);
    });
  });
  const action = wsRoute(h, "evidence", async (d, r, c) => {
    const id = str(r.path[2], 40); const what = r.path[3]; const me = c.actor;
    await hide(d, c, id);
    return tx(d, c, async (t) => {
      const rec = await item(t, id); const e = rec.data;
      if (what === "review") {
        stale(r.body.seen, rec.version);
        const decision = str(r.body.decision, 10); if (decision !== "Accepted" && decision !== "Rejected") invalid("Choose Accepted or Rejected.");
        refuse(evidenceReviewBlock(e.review.status, me.role, contributors(e).has(me.id)), decision === "Rejected" && e.review.status === "Rejected" ? "Already rejected." : null);
        const note = txt(r.body.note, 500); if (decision === "Rejected") { const bad = textBlock(note, 10, "A review note"); if (bad) invalid(bad); }
        e.review = { status: decision as "Accepted" | "Rejected", by: me.name, byId: me.id, at: isoDayOf(t.now), note };
        await t.update("evidence", id, e, rec.version);
        await t.audit(decision === "Accepted" ? "evidence.accepted" : "evidence.rejected", `${id} v${e.ver} by ${me.name} (collector ${e.by})`);
        return ok(e);
      }
      if (what === "versions") {
        refuse(evidenceWriteBlock(me.role));
        const note = txt(r.body.note, 300); const bad = textBlock(note, 1, "A note"); if (bad) invalid(bad);
        e.ver += 1; e.updated = isoDayOf(t.now); e.history.push({ ver: e.ver, at: e.updated, by: me.name, byId: me.id, note });
        await touch(t, e); await t.update("evidence", id, e, rec.version); await t.audit("evidence.version.created", `${id} v${e.ver} by ${me.name}`);
        return ok(e);
      }
      if (what === "delete-requests") {
        const pending = await pendingDelete(t, e);
        refuse(evidenceRequestDeleteBlock(me.role, !!pending));
        const reason = txt(r.body.reason, 500); const bad = textBlock(reason, 15); if (bad) invalid(bad);
        const a = await t.request({ kind: "evidence.delete", title: `Delete evidence ${id} ${e.name}`, subject: id, payload: { evidenceId: id, reason }, needs: 1, approverRoles: ["admin"], forbid: [], ttlMs: EVIDENCE_DELETE_TTL_H * 3600_000 });
        e.deleteRequest = { approvalId: a.id, by: me.name, byId: me.id, at: isoDayOf(t.now), reason };
        await t.update("evidence", id, e, rec.version); await t.audit("evidence.delete.requested", `${id} v${e.ver} (${a.id}): ${reason}`);
        return ok(a.id);
      }
      return missing("Action");
    });
  });
  /** approve | reject (a different admin, with a reason) | withdraw (the requester). An approval deletes the files and keeps a tombstone. */
  const deleteDecide = wsRoute(h, "evidence", async (d, r, c) => {
    const id = str(r.path[2], 40); const decision = str(r.path[4], 10); const me = c.actor;
    await hide(d, c, id);
    if (!["approve", "reject", "withdraw"].includes(decision)) return missing("Action");
    let gone: string[] = [];
    const res = await tx(d, c, async (t) => {
      const rec = await item(t, id); const e = rec.data;
      const a = await pendingDelete(t, e); if (!a) refuse("No pending deletion request.");
      if (decision === "withdraw") {
        if (a!.requestedBy !== me.id) refuse("Only the requester can withdraw a request.");
        await t.setApproval(a!.id, "Withdrawn"); await t.audit("approval.evidence.delete.withdrawn", `${a!.title} (${a!.id})`, "Approval");
        delete e.deleteRequest; await t.update("evidence", id, e, rec.version); await t.audit("evidence.delete.withdrawn", `${id} (${a!.id})`);
        return ok(true);
      }
      stale(r.body.seen, rec.version);
      refuse(evidenceDecideDeleteBlock(true, me.role, a!.requestedBy === me.id),
        approvalBlock({ key: me.id, base: me.role }, { status: a!.status, expiresAt: a!.expiresAt, approverRoles: a!.approverRoles, requestedBy: a!.requestedBy, forbid: a!.forbid, votes: a!.votes.map((v) => v.by) }, t.now));
      const reason = txt(r.body.reason, 300); const bad = reasonBlock(reason); if (bad) invalid(bad);
      if (decision === "reject") {
        await t.setApproval(a!.id, "Rejected", reason); await t.audit("approval.evidence.delete.rejected", `${a!.title} (${a!.id}); reason: ${reason}`, "Approval");
        delete e.deleteRequest; await t.update("evidence", id, e, rec.version); await t.audit("evidence.delete.rejected", `${id} (${a!.id}) by ${me.name}`);
        return ok(true);
      }
      await t.vote(a!.id, reason); await t.setApproval(a!.id, "Approved", reason); await t.audit("approval.evidence.delete.approved", `${a!.title} (${a!.id}); reason: ${reason}`, "Approval");
      await t.insert("evidence-tombstone", id, { id, name: e.name, at: isoDayOf(t.now), requestedBy: a!.requestedByName, requestedById: a!.requestedBy, approvedBy: me.name, approvedById: me.id, reason: e.deleteRequest?.reason ?? "", files: e.attachments.map((f) => ({ name: f.name, sha256: f.sha256, bytes: f.bytes })) });
      await t.remove("evidence", id, rec.version);
      await t.audit("evidence.deleted", `${id} v${e.ver}; requested by ${a!.requestedByName}, approved by ${me.name} (${a!.id})`);
      gone = e.attachments.map((f) => f.path);
      return ok(true);
    });
    if (gone.length) await d.files.remove(gone).catch(() => { /* the record is gone; an orphaned file is found by the storage review */ });
    return res;
  });
  /** Upload (raw bytes, at most 4 MB): checked, stored under the company's id, then recorded on the evidence in one transaction. */
  const upload = wsRoute(h, "evidence", async (d, r, c) => {
    await hide(d, c, str(r.path[2], 40));
    refuse(evidenceWriteBlock(c.actor.role));
    if (!d.files.configured) refuse("File storage is not configured yet. Ask the platform owner to create the evidence bucket (SUPABASE.md section 4d).");
    const id = str(r.path[2], 40); const bytes = r.raw ?? new Uint8Array();
    const f = checkFile(r.body.name, bytes); if ("error" in f) await refuseFile(d, c.actor, f, r.body.name);
    const ok1 = f as { name: string; ext: string; type: string };
    await tx(d, c, async (t) => { const e = (await item(t, id)).data; if (e.attachments.length >= EVIDENCE_FILES_PER_ITEM) invalid(`At most ${EVIDENCE_FILES_PER_ITEM} files per evidence item.`); });
    const fileId = randomUUID(); const path = `${c.actor.tenantId}/${id}/${fileId}.${ok1.ext}`;
    await d.files.put(path, bytes, ok1.type);
    try {
      return await tx(d, c, async (t) => {
        const rec = await item(t, id); const e = rec.data; const me = c.actor;
        if (e.attachments.length >= EVIDENCE_FILES_PER_ITEM) invalid(`At most ${EVIDENCE_FILES_PER_ITEM} files per evidence item.`); // again, under the row lock
        e.attachments.push({ id: fileId, name: ok1.name, size: kb(bytes.length), bytes: bytes.length, by: me.name, byId: me.id, at: isoDayOf(t.now), path, sha256: createHash("sha256").update(bytes).digest("hex"), type: ok1.type });
        await touch(t, e); await t.update("evidence", id, e, rec.version);
        await t.audit("evidence.attachment.added", `${id} v${e.ver}: ${ok1.name} (${kb(bytes.length)})`);
        return ok({ id: fileId });
      });
    } catch (x) { await d.files.remove([path]).catch(() => undefined); throw x; }
  });
  /** download (a signed link for 60 seconds, audited) | remove (the file is deleted). */
  const file = wsRoute(h, "evidence", async (d, r, c) => {
    const id = str(r.path[2], 40); const fileId = str(r.path[4], 40); const what = r.path[5];
    await hide(d, c, id);
    if (what !== "download" && what !== "remove") return missing("Action");
    let path = "";
    const res = await tx(d, c, async (t) => {
      const rec = await item(t, id); const e = rec.data; const f = e.attachments.find((x) => x.id === fileId) ?? missing("File");
      if (what === "download") { await t.audit("evidence.attachment.downloaded", `${id} v${e.ver}: ${f.name}`); path = f.path; return ok({ name: f.name }); }
      refuse(evidenceWriteBlock(c.actor.role));
      e.attachments = e.attachments.filter((x) => x.id !== fileId); path = f.path;
      await touch(t, e); await t.update("evidence", id, e, rec.version); await t.audit("evidence.attachment.removed", `${id} v${e.ver}: ${f.name}`);
      return ok();
    });
    if (what === "remove") { await d.files.remove([path]).catch(() => undefined); return res; }
    if (!d.files.configured) throw new WsRefused("File storage is not configured yet.", 409);
    return ok({ url: await d.files.link(path, (res.body as { name: string }).name, 60) });
  });

  return {
    // the upload route comes before ":what" so that "files" is never taken for an action
    "GET ws/data/evidence": data, "POST ws/evidence": create, "PATCH ws/evidence/:id": update, "POST ws/evidence/:id/files": upload, "POST ws/evidence/:id/:what": action,
    "POST ws/evidence/:id/delete-requests/:decision": deleteDecide, "POST ws/evidence/:id/files/:fileId/:what": file,
  };
}
export type { Rec };
