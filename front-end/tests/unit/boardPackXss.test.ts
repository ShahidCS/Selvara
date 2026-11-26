import { describe, expect, it } from "vitest";
import { DATA } from "@/lib/data";
import { appStore } from "@/lib/store";
import { boardPackHTML } from "@/features/overview/lib/boardPack";

/* SEC-7 (ASVS V5.3.3): the board pack is HTML built by hand and opened in a new tab, so every record value in it must stay inert text,
   attributes included. Synthetic data only. */
describe("SEC-7: board pack output encoding", () => {
  it("escapes record text and keeps a crafted severity from breaking out of its class attribute", () => {
    appStore.set({ role: "admin" });
    const evil = '"><img src=x onerror=alert(1)><script>alert(2)</script>';
    DATA.issues.unshift({ id: "ISS-XSS", title: evil, sev: 'High" onmouseover="alert(3)', status: "Open", owner: evil, dueDate: "2027-01-01", due: "2027-01-01" } as never);
    try {
      const html = boardPackHTML("file");
      expect(html).not.toContain("<script>alert(2)");
      expect(html).not.toContain("<img src=x");
      expect(html).not.toMatch(/"\s*onmouseover=/); // escaped as text is fine, a raw quote breaking out is not
      expect(html).toContain("&lt;script&gt;alert(2)&lt;/script&gt;");
    } finally { DATA.issues.shift(); }
  });
});
