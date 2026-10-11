/* Cash flow from what is recorded in the CRM only: payments on clients, products (retainers and
   supplier costs) and manual expenses. Every figure is before VAT. */
import type { Row } from "./crm";

export type Month = { key: string; label: string; past: boolean; current: boolean; future: boolean };
export type MonthRow = Month & {
  income: number;      // paid (past/current) or forecast (future)
  open: number;        // unpaid payments due this month
  suppliers: number;   // supplier costs
  manual: number;      // manual expenses
  net: number;
  balance: number;     // running total across the window
  churn: number;       // clients that left this month
};

export const ym = (d: string | Date | null | undefined) => {
  if (!d) return "";
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 7);
};
export const monthLabel = (key: string) => key.slice(5, 7) + "/" + key.slice(2, 4);
export const monthName = (key: string) =>
  new Date(key + "-15T12:00:00").toLocaleDateString("he-IL", { month: "long", year: "numeric" });

export function addMonths(key: string, n: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

export function window12(now: string): Month[] {
  const out: Month[] = [];
  for (let i = -8; i <= 3; i++) {
    const key = addMonths(now, i);
    out.push({ key, label: monthLabel(key), past: key < now, current: key === now, future: key > now });
  }
  return out;
}

const inRange = (key: string, from: string, to: string | null) => key >= from && (!to || key <= to);
const live = (c: Row | null | undefined) => !!c && !c.archived_at && !["הסתיים", "עזב"].includes(c.status);

export function supplierCostIn(s: Row, key: string) {
  const cost = Number(s.supplier_cost || 0);
  if (!cost || !s.supplier_billing) return 0;
  const start = ym(s.start_date || s.created_at);
  if (s.supplier_billing === "חד-פעמי") return start === key ? cost : 0;
  // monthly: from the start month until the month it was stopped (inclusive)
  const stop = !s.supplier_active ? ym(s.supplier_stopped_at) || start : null;
  return inRange(key, start, stop) ? cost : 0;
}

export function expenseIn(e: Row, key: string) {
  const amt = Number(e.amount || 0);
  const start = ym(e.start_date);
  if (e.billing === "חד-פעמי") return start === key ? amt : 0;
  return inRange(key, start, e.end_date ? ym(e.end_date) : null) ? amt : 0;
}

/* retainers that the monthly generator will charge in a future month */
function retainerForecast(services: Row[], key: string) {
  return services
    .filter((s) => s.billing === "חודשי" && s.status === "פעיל" && live(s.client) && ym(s.start_date) < key)
    .reduce((a, s) => a + Number(s.price || 0), 0);
}

export function buildFlow(now: string, vat: number, payments: Row[], services: Row[], expenses: Row[], clients: Row[]): MonthRow[] {
  const net = (n: number) => n / (1 + (vat || 0) / 100);
  let balance = 0;
  return window12(now).map((m) => {
    const paid = payments.filter((p) => p.paid_at && ym(p.paid_at) === m.key).reduce((a, p) => a + net(Number(p.paid_amount ?? p.amount)), 0);
    const open = payments.filter((p) => ym(p.due) === m.key).reduce((a, p) => a + net(Math.max(0, Number(p.amount) - (p.paid_at ? Number(p.paid_amount ?? p.amount) : 0))), 0);
    const income = m.future ? retainerForecast(services, m.key) + open : paid;
    const suppliers = services.reduce((a, s) => a + supplierCostIn(s, m.key), 0);
    const manual = expenses.reduce((a, e) => a + expenseIn(e, m.key), 0);
    const n = income - suppliers - manual;
    balance += n;
    return { ...m, income, open: m.future ? 0 : open, suppliers, manual, net: n, balance, churn: clients.filter((c) => ym(c.left_at) === m.key).length };
  });
}

export const nis0 = (n: number) => (n < -0.5 ? "\u200E-" : "") + Math.round(Math.abs(n || 0)).toLocaleString("he-IL") + " ₪";
