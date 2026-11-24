import { describe, expect, it } from "vitest";
import "@/server/core"; // registers every server route module, and with them every four-eyes kind
import { fourEyesKinds } from "@/server/ws/foureyes";
import { SERVER_KINDS } from "@/lib/rulesWs";
import { SERVER_ROUTES } from "@/services/sodApprovals";

/* Every four-eyes kind the server applies must reach it from the approvals panel in production: a kind missing from either list was
   decided against the wrong route (trust.public-page was, before this test). */
describe("four-eyes kinds are routed to the server", () => {
  const kinds = fourEyesKinds();
  it("registers the Trust Center kinds", () => { expect(kinds).toEqual(expect.arrayContaining(["trust.publish", "trust.public-page", "trust.section-controls"])); });
  it.each(kinds)("%s is a server kind with a decision route", (k) => {
    expect(SERVER_KINDS).toContain(k);
    expect(SERVER_ROUTES[k]).toBe("/ws/four-eyes");
  });
});
