import { describe, expect, it } from "vitest";
import { renderToStaticMarkup as html } from "react-dom/server";
import {
  AIPanel, BarChart, DeltaPill, DonutChart, HBarList, KpiCard, KpiStrip, KpiTile, LineChart, Segmented, Skeleton, Stepper, Switch, Timeline,
} from "@/components/ui";

const noop = () => {};
describe("kit markup contract (blueprint 3.1)", () => {
  it("Switch is a role=switch with a visible label and its state written out", () => {
    const on = html(<Switch id="s1" label="Booking confirmation" checked onChange={noop} />);
    expect(on).toContain('role="switch"'); expect(on).toContain('aria-checked="true"'); expect(on).toContain("Booking confirmation"); expect(on).toContain(">On<");
    expect(html(<Switch label="Quiet hours" checked={false} onChange={noop} />)).toContain('aria-checked="false"');
    expect(html(<Switch label="Quiet hours" checked={false} onChange={noop} disabled />)).toContain("disabled");
  });
  it("Segmented is a radiogroup; only the selected radio is in the tab order", () => {
    const m = html(<Segmented label="Density" value="b" onChange={noop} options={[{ value: "a", label: "Comfortable" }, { value: "b", label: "Compact" }]} />);
    expect(m).toContain('role="radiogroup"'); expect(m).toContain('aria-label="Density"');
    expect(m.match(/role="radio"/g)?.length).toBe(2);
    expect(m).toMatch(/aria-checked="true"[^>]*tabindex="0"[^>]*>Compact/); expect(m).toMatch(/aria-checked="false"[^>]*tabindex="-1"[^>]*>Comfortable/);
  });
  it("Skeleton is a busy live region with an accessible name", () => {
    const m = html(<Skeleton rows={2} label="Loading issues" />);
    expect(m).toContain('aria-busy="true"'); expect(m).toContain('aria-live="polite"'); expect(m).toContain("Loading issues"); expect(m.match(/sk-row/g)?.length).toBe(2);
  });
  it("KPI strip is a labelled group; delta pills say it in words and icon, not colour alone", () => {
    const m = html(<KpiStrip label="Issue summary"><KpiTile label="Overdue" value={3} delta={{ tone: "bad", text: "+3 this week" }} caption="Past due" /></KpiStrip>);
    expect(m).toContain('role="group"'); expect(m).toContain('aria-label="Issue summary"'); expect(m).toContain("Overdue"); expect(m).toContain("+3 this week"); expect(m).toContain("<svg");
    expect(html(<DeltaPill tone="good">Up</DeltaPill>)).toContain("lime"); expect(html(<DeltaPill tone="bad">Up</DeltaPill>)).toContain("bad");
  });
  it("KPI card is a real button", () => { expect(html(<KpiCard icon="issues" label="Open" value={4} sub="2 overdue" subTone="bad" onClick={noop} />)).toMatch(/<button[^>]*type="button"/); });
  it("AIPanel labels itself in text and reminds the reader to review", () => {
    const m = html(<AIPanel source="Compliance brief" meta="92% confidence" statement="Three controls may fail.">body</AIPanel>);
    expect(m).toContain("AI-assisted"); expect(m).toContain("Review before you rely on this."); expect(m).toContain('aria-label="AI-assisted summary"'); expect(m).toContain("Three controls may fail.");
  });
  it("Stepper marks the current step and says Overdue, Done and Projected in words", () => {
    const steps = [{ key: "a", label: "Identified" }, { key: "b", label: "Assigned" }, { key: "c", label: "Closed", note: "due 3d" }];
    const m = html(<Stepper label="Remediation" steps={steps} current={1} overdue />);
    expect(m).toContain('aria-label="Remediation"'); expect(m.match(/aria-current="step"/g)?.length).toBe(1);
    expect(m).toContain("Done"); expect(m).toContain("Overdue"); expect(m).toContain("Projected, due 3d");
    expect(html(<Stepper label="x" steps={steps} current={1} />)).toContain("Current");
  });
  it("Timeline is an ordered list with a time element per entry", () => {
    const m = html(<Timeline label="Audit trail" items={[{ id: "1", at: "12 Nov 09:30", title: "Opened", actor: "J. Avery", tone: "brand" }, { id: "2", at: "12 Nov 11:00", title: "Closed", tone: "ok" }]} />);
    expect(m).toContain("<ol"); expect(m.match(/<time/g)?.length).toBe(2); expect(m).toContain("mono"); expect(m).toContain("J. Avery");
  });
});

describe("charts are figures with a summary and the data as a table", () => {
  const line = html(<LineChart title="Open risks" data={[{ label: "Apr", value: 14 }, { label: "May", value: 12 }, { label: "Jun", value: 11 }]} target={10} />);
  it("LineChart", () => {
    expect(line).toContain("<figure"); expect(line).toContain("<figcaption"); expect(line).toContain('role="img"');
    expect(line).toContain("3 points, from 14 (Apr) to 11 (Jun), Target 10."); expect(line).toContain('class="vh"'); expect(line).toContain("<th scope=\"row\">Apr</th>"); expect(line).toContain("Target 10");
  });
  it("BarChart with a stacked late segment", () => {
    const m = html(<BarChart title="Delivered" data={[{ label: "Mon", value: 40, bad: 5 }]} />);
    expect(m).toContain("highest 45"); expect(m).toContain("Mon: 40, of which late 5");
  });
  it("HBarList writes the value as text next to each bar", () => {
    const m = html(<HBarList title="By severity" rows={[{ label: "High", value: 3, tone: "bad" }, { label: "Low", value: 1 }]} />);
    expect(m).toContain("largest High"); expect(m).toContain(">3<"); expect(m).toContain("hbar-nm");
  });
  it("DonutChart carries label, count and share in a legend and survives an empty total", () => {
    const m = html(<DonutChart title="Status mix" segments={[{ label: "Open", value: 3, tone: "warn" }, { label: "Closed", value: 1, tone: "ok" }]} centerSub="issues" />);
    expect(m).toContain("Open 3 (75%), Closed 1 (25%)."); expect(m).toContain("legend"); expect(m).toContain("75%");
    const e = html(<DonutChart title="Empty" segments={[{ label: "A", value: 0, tone: "ok" }]} />);
    expect(e).toContain("No data.");
  });
  it("an empty line chart does not throw", () => { expect(() => html(<LineChart title="None" data={[]} />)).not.toThrow(); });
});
