/* Production billing (programme group 8a): amounts arrive from the server in minor units (cents) and are only formatted here; the server
   computes every amount, tax and balance. Shared by the Admin Console's Billing and the workspace's Billing & Invoices. */
export const minorMoney = (minor: number, cur: string) => {
  try { return new Intl.NumberFormat("en-GB", { style: "currency", currency: cur }).format((Number(minor) || 0) / 100); }
  catch { return `${((Number(minor) || 0) / 100).toFixed(2)} ${cur}`; }
};
export interface InvoiceLike {
  id: string; company?: string; ref?: string; from: string; to: string; issued: string; due: string; currency: string;
  lines: { text: string; qty: number; unit: number; amount: number }[]; subtotal: number; taxType: string; taxRate: number; tax: number; total: number;
  paid: number; credited: number; refunded: number; outstanding: number; status: string;
}
/** A plain-text copy of an invoice, as the ledger holds it (a draft layout for finance review). */
export function invoiceText(i: InvoiceLike, company: string) {
  const m = (x: number) => minorMoney(x, i.currency);
  return [
    `Invoice ${i.id}`, `Customer: ${company}`, `Issued: ${i.issued}    Due: ${i.due}`, `Period: ${i.from} to ${i.to}`, "",
    ...i.lines.map((l) => `${l.text}  ${l.qty} x ${m(l.unit)} = ${m(l.amount)}`), "",
    `Subtotal: ${m(i.subtotal)}`, `${i.taxType} ${i.taxRate} %: ${m(i.tax)}`, `Total: ${m(i.total)}`,
    `Paid: ${m(i.paid)}    Credited: ${m(i.credited)}    Refunded: ${m(i.refunded)}`, `Still due: ${m(i.outstanding)}`, `Status: ${i.status}`, "",
    "Pay by bank transfer with the invoice number as the reference, or by card where your account offers it.",
  ].join("\n");
}
