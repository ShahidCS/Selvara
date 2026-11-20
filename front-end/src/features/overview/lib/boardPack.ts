/* Board & executive security pack: a standalone printable HTML document (ported 1:1 from the prototype).
 * Every interpolated value goes through esc(). The document is opened in a new tab (or downloaded) and printed to PDF by the user. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { DATA } from "@/lib/data";
import { esc } from "@/lib/format";
import { getMe } from "@/lib/audit";
import { fwReadiness } from "@/lib/frameworks";
import { metrics, riskOpen, sCur } from "@/lib/metrics";
import { API_ON, modAllowed } from "@/lib/rbac";
import { appStore } from "@/lib/store";
import { apiFetch } from "@/services/http";

const COV_CATS: [string, string[]][] = [["Governance",["Governance","Regulatory","Financial crime","AI governance"]],["Access",["Identity and access"]],["Data & crypto",["Cryptography","Privacy"]],["Operations",["Operations","Change management","Asset management","Incident response","Resilience"]],["Infrastructure",["Network","Endpoint","Physical","Vulnerability management"]],["People & 3P",["People","Third-party risk"]]];
const COV_FW: [string, string][] = [["iso27001","ISO 27001"],["soc2","SOC 2"],["nistcsf","NIST CSF"],["pci","PCI DSS"],["iso42001","ISO 42001"],["gdpr","GDPR"]];
export { COV_CATS, COV_FW };
export function covCell(fwId: string, cats: string[]): { pct: number; n: number; pass: number } | null {
  const inCat = DATA.controls.filter((c) => cats.includes(c.domain) && c.map && c.map[fwId] && c.map[fwId].length);
  if (!inCat.length) return null;
  const pass = inCat.filter((c) => c.status === "Pass").length;
  return { pct: Math.round((pass / inCat.length) * 100), n: inCat.length, pass };
}
function _covShade(pct: number) {const f=[237,246,245],t=[138,199,193];const r=f.map((x,i)=>Math.round(x+(t[i]-x)*(Math.max(0,Math.min(100,pct))/100)));return "#"+r.map(x=>x.toString(16).padStart(2,"0")).join("");}
/** Production: the export is recorded in the company's log before the pack opens. The demonstration has nothing to record. */
export async function exportedBoardPack(): Promise<boolean> {
  if (!API_ON) return true;
  try { await apiFetch("/ws/overview/board-pack", { method: "POST", body: "{}" }); return true; } catch { return false; }
}
export function boardPackHTML(): string {
  const ME = getMe();
 const M=metrics();const now=new Date();
 const dateStr=now.toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
 const period=now.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
 const fwRows=[...DATA.frameworks].map(f=>({f,r:fwReadiness(f.id)})).sort((a,b)=>b.r-a.r);
 const fwBars=fwRows.map(({f,r})=>`<div class="bp-bar"><span class="bp-bar-l">${esc(f.name)}</span><span class="bp-track"><span class="bp-fill" style="width:${r}%"></span></span><span class="bp-bar-v">${r}%</span></div>`).join("");
 const covHead=`<tr><th class="bp-rowh"></th>${COV_CATS.map(c=>`<th class="bp-covh">${esc(c[0])}</th>`).join("")}</tr>`;
 const covBody=COV_FW.map(([fid,fn])=>`<tr><th class="bp-rowh">${esc(fn)}</th>${COV_CATS.map(([,cats])=>{const r=covCell(fid,cats);return r?`<td class="bp-cov" style="background:${_covShade(r.pct)}">${r.pct}%</td>`:'<td class="bp-cov bp-na">—</td>';}).join("")}</tr>`).join("");
 /* production: a role sees the detail of the modules it may open; for the others the pack gives totals only */
 const role=appStore.get().role; const sees=(m: string)=>!API_ON||modAllowed(role,"ws",m);
 const hidden=(n: number,what: string)=>`<tr><td colspan="5" class="bp-empty">${n} ${what}. Your role does not open this module, so the detail is not included.</td></tr>`;
 const risks=DATA.risks.filter(r=>riskOpen(r)&&sCur(r)>=11).sort((a,b)=>sCur(b)-sCur(a)).slice(0,8);
 const riskRows=!sees("risk")?hidden(M.aboveAppetite,"risks above appetite"):risks.length?risks.map(r=>`<tr><td class="bp-id">${esc(r.id)}</td><td>${esc(r.title)}</td><td>${esc(r.owner)}</td><td>${esc(r.treat)}</td><td class="bp-ctr"><span class="bp-score">${sCur(r)}</span></td></tr>`).join(""):`<tr><td colspan="5" class="bp-empty">No risks currently above appetite.</td></tr>`;
 const issues=DATA.issues.filter(i=>i.status!=='Closed').slice(0,8);
 const issRows=!sees("issues")?hidden(M.openIssues,"open issues"):issues.length?issues.map(i=>`<tr><td class="bp-id">${esc(i.id)}</td><td>${esc(i.title)}</td><td><span class="bp-sev bp-sev-${(i.sev||'').toLowerCase()}">${esc(i.sev)}</span></td><td>${esc(i.owner)}</td><td>${esc(i.due)}</td></tr>`).join(""):`<tr><td colspan="5" class="bp-empty">No open issues.</td></tr>`;
 const audits=DATA.audits.filter(a=>a.stage!=='Complete');
 const audRows=!sees("audits")?hidden(audits.length,"audits in progress"):audits.length?audits.map(a=>`<tr><td>${esc(a.name)}</td><td>${esc(a.fw)}</td><td>${esc(a.auditor)}</td><td>${esc(a.stage)}</td><td class="bp-ctr">${a.progress}%</td></tr>`).join(""):`<tr><td colspan="5" class="bp-empty">No audits in progress.</td></tr>`;
 const kpi=(v: any,l: any,tone?: string)=>`<div class="bp-kpi${tone?' bp-kpi-'+tone:''}"><div class="bp-kpi-v">${v}</div><div class="bp-kpi-l">${l}</div></div>`;
 const css=`*{box-sizing:border-box;margin:0;padding:0}
  :root{--t:#0E7C78;--t-d:#0A4A47;--ink:#15181C;--mut:#5B636D;--line:#E5E8EC;--line2:#EEF1F4}
  html,body{background:#EBEEF1;color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,"Segoe UI",Roboto,Arial,sans-serif;font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}
  .bp-toolbar{position:fixed;top:16px;right:16px;display:flex;gap:8px;z-index:50}
  .bp-btn{font:inherit;font-weight:600;font-size:12.5px;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:8px;padding:9px 14px;cursor:pointer;box-shadow:0 2px 8px rgba(16,24,40,.12)}
  .bp-btn.pri{background:var(--t);border-color:var(--t);color:#fff}
  .bp-sheet{max-width:860px;margin:22px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgba(16,24,40,.14)}
  .bp-cover{background:linear-gradient(135deg,#0E7C78,#0A605D);color:#fff;padding:40px 44px 34px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .bp-brand{display:flex;align-items:center;gap:11px;margin-bottom:26px}
  .bp-brand svg{width:30px;height:30px;flex:0 0 auto}
  .bp-brand b{font-size:17px;font-weight:600;letter-spacing:-.01em}
  .bp-cover h1{font-family:-apple-system,"SF Pro Display","Inter",sans-serif;font-size:27px;font-weight:600;letter-spacing:-.02em;line-height:1.15;margin-bottom:8px}
  .bp-cover .bp-sub{font-size:13.5px;opacity:.9}
  .bp-chips{display:flex;gap:8px;margin-top:20px;flex-wrap:wrap}
  .bp-chip{font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:4px 11px}
  .bp-body{padding:34px 44px 40px}
  .bp-section{margin-bottom:26px;break-inside:avoid}
  .bp-h{display:flex;align-items:baseline;gap:9px;border-bottom:1.5px solid var(--t);padding-bottom:7px;margin-bottom:14px}
  .bp-h .n{font-family:-apple-system,"SF Pro Display",sans-serif;font-size:13px;font-weight:700;color:var(--t)}
  .bp-h h2{font-family:-apple-system,"SF Pro Display",sans-serif;font-size:16px;font-weight:600;letter-spacing:-.01em}
  .bp-lede{color:var(--mut);font-size:13px;margin-bottom:14px}
  .bp-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .bp-kpi{border:1px solid var(--line);border-radius:10px;padding:13px 15px;background:var(--line2)}
  .bp-kpi-v{font-family:-apple-system,"SF Pro Display",sans-serif;font-size:24px;font-weight:600;letter-spacing:-.02em}
  .bp-kpi-l{font-size:11.5px;color:var(--mut);margin-top:2px}
  .bp-kpi-bad .bp-kpi-v{color:#B12318}.bp-kpi-warn .bp-kpi-v{color:#8A5600}.bp-kpi-good .bp-kpi-v{color:#167139}.bp-kpi-accent .bp-kpi-v{color:var(--t)}
  .bp-bar{display:flex;align-items:center;gap:12px;margin-bottom:9px}
  .bp-bar-l{flex:0 0 200px;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bp-track{flex:1 1 auto;height:8px;background:var(--line2);border-radius:999px;overflow:hidden}
  .bp-fill{display:block;height:100%;background:var(--t);-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .bp-bar-v{flex:0 0 42px;text-align:right;font-weight:600;font-variant-numeric:tabular-nums;font-size:12.5px}
  table{border-collapse:collapse;width:100%;font-size:12.5px}
  .bp-table th{text-align:left;font-size:10.5px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--mut);padding:7px 9px;border-bottom:1.5px solid var(--line)}
  .bp-table td{padding:8px 9px;border-bottom:1px solid var(--line2);vertical-align:top}
  .bp-id{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
  .bp-ctr{text-align:center}
  .bp-score{display:inline-block;min-width:26px;text-align:center;font-weight:700;color:#B12318}
  .bp-empty{color:var(--mut);text-align:center;padding:14px}
  .bp-cov-table{border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .bp-cov-table th,.bp-cov-table td{text-align:center}
  .bp-covh{font-size:10px!important;padding:8px 4px!important}
  .bp-rowh{text-align:left!important;font-size:11.5px!important;text-transform:none!important;letter-spacing:0!important;color:var(--ink)!important;font-weight:600;background:var(--line2);white-space:nowrap;padding:8px 10px!important;border-bottom:1px solid #fff}
  .bp-cov{font-weight:700;color:var(--t-d);padding:9px 4px;border:1px solid #fff;font-variant-numeric:tabular-nums;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .bp-na{background:#F2F4F6;color:#AEB5BD;font-weight:500}
  .bp-sev{font-weight:600;font-size:11.5px}.bp-sev-high{color:#B12318}.bp-sev-medium{color:#8A5600}.bp-sev-low{color:var(--mut)}
  .bp-note{font-size:11.5px;color:var(--mut);margin-top:8px}
  .bp-foot{border-top:1px solid var(--line);margin-top:8px;padding-top:14px;font-size:11px;color:var(--mut)}
  .bp-foot b{color:#8A5600}
  @media print{html,body{background:#fff}.bp-toolbar{display:none}.bp-sheet{box-shadow:none;border-radius:0;margin:0;max-width:none}.bp-section{break-inside:avoid}.bp-cover{break-after:avoid}@page{size:A4;margin:14mm}}`;
 const mark=`<svg viewBox="0 0 30 30" fill="none" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="6" stroke="#fff" stroke-width="2.4"/><rect x="14" y="14" width="13" height="13" rx="4" fill="#E8653F"/></svg>`;
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Selvara — Board &amp; Executive Security Pack</title><style>${css}</style></head><body>
  <div class="bp-toolbar"><button class="bp-btn pri" onclick="window.print()">Print / Save as PDF</button></div>
  <div class="bp-sheet">
   <div class="bp-cover"><div class="bp-brand">${mark}<b>Selvara</b></div>
     <h1>Board &amp; Executive Security Pack</h1>
     <div class="bp-sub">Security, risk &amp; compliance posture — ${esc(period)}</div>
     <div class="bp-chips"><span class="bp-chip">Draft for review</span><span class="bp-chip">Confidential</span><span class="bp-chip">Prepared by ${esc(ME.name)}</span><span class="bp-chip">${esc(dateStr)}</span></div>
   </div>
   <div class="bp-body">
     <div class="bp-section"><div class="bp-h"><span class="n">1</span><h2>Executive summary</h2></div>
       <p class="bp-lede">${M.overdueControls} control${M.overdueControls===1?'':'s'} failing and ${M.openIssues} open issue${M.openIssues===1?'':'s'} need attention; ${M.aboveAppetite} risk${M.aboveAppetite===1?'':'s'} sit above appetite. Weighted compliance stands at ${M.compliance}%.</p>
       <div class="bp-kpis">${kpi(M.compliance+'%','Weighted compliance','accent')}${kpi(M.openRisks,'Open risks ('+M.aboveAppetite+' above appetite)','warn')}${kpi(M.overdueControls,'Controls failing','bad')}${kpi(M.openIssues,'Open issues')}${kpi(M.upcomingAudits,'Upcoming audits','accent')}${kpi(M.vendorDue,'Vendor reviews due','warn')}</div>
     </div>
     <div class="bp-section"><div class="bp-h"><span class="n">2</span><h2>Framework readiness</h2></div>${fwBars}</div>
     <div class="bp-section"><div class="bp-h"><span class="n">3</span><h2>Control coverage</h2></div>
       <p class="bp-lede">Implemented %, framework × control category. Each cell is controls passing ÷ controls mapped to that framework in that category; “—” means no mapped controls.</p>
       <div class="bp-cov-table"><table><thead>${covHead}</thead><tbody>${covBody}</tbody></table></div>
     </div>
     <div class="bp-section"><div class="bp-h"><span class="n">4</span><h2>Risks above appetite</h2></div>
       <table class="bp-table"><thead><tr><th>ID</th><th>Risk</th><th>Owner</th><th>Treatment</th><th class="bp-ctr">Current</th></tr></thead><tbody>${riskRows}</tbody></table></div>
     <div class="bp-section"><div class="bp-h"><span class="n">5</span><h2>Open issues</h2></div>
       <table class="bp-table"><thead><tr><th>ID</th><th>Issue</th><th>Severity</th><th>Owner</th><th>Due</th></tr></thead><tbody>${issRows}</tbody></table></div>
     <div class="bp-section"><div class="bp-h"><span class="n">6</span><h2>Audits in motion</h2></div>
       <table class="bp-table"><thead><tr><th>Audit</th><th>Framework</th><th>Auditor</th><th>Stage</th><th class="bp-ctr">Progress</th></tr></thead><tbody>${audRows}</tbody></table></div>
     <div class="bp-foot"><b>Draft only.</b> This pack is generated from the current Selvara workspace${API_ON?"":" and contains sample data"}. Compliance and risk outputs require review and approval by qualified compliance, legal or risk personnel before use or distribution. Generated ${esc(dateStr)} · Information Security — Confidential.</div>
   </div>
  </div></body></html>`;
}
