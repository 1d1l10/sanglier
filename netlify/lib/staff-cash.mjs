// Eth Sànglier · cash collected on the slope.
// At the end of a class the teacher says whether they were paid in cash. That amount
//   - is stored on the class (Ocupación ▸ "Cobrado €"), so the school knows who holds the cash,
//   - is added to Reservas ▸ Pagado €, so Pendiente € / Saldo en pista € update by themselves,
//   - is noted in Reservas ▸ Notas internas.
// Laia then marks the cash as handed in (Ocupación ▸ "Efectivo entregado").
import { T, F, q, at, listAll, round2 } from "./staff-core.mjs";
import { Refused, appendNote } from "./staff-classes.mjs";

const NAMES = { cash: F.oCash, handed: F.oHanded };
export const MAX_CASH = 3000;

export function parseAmount(v) {
  if (v === undefined || v === null || v === "") throw new Refused(400, "Dinos si has cobrado algo en efectivo.");
  const n = Number(String(v).replace(",", ".").replace(/\s|€/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > MAX_CASH) throw new Refused(400, `El importe tiene que estar entre 0 y ${MAX_CASH} €.`);
  return round2(n);
}

/** Refuses an amount bigger than what the reservation still owes (when the reservation has a price). */
export async function checkCash(resId, amount) {
  if (!(amount > 0)) return null;
  const r = await at(`${T.res}/${resId}`, { params: { returnFieldsByFieldId: "true" } });
  const tot = r.fields[F.rTotal];
  if (tot == null) return null;
  const pending = Math.max(0, round2(Number(tot) - (Number(r.fields[F.rPaid]) || 0)));
  if (amount > pending + 0.004) throw new Refused(400, `Has anotado ${fmt(amount)} pero a esta reserva solo le quedan ${fmt(pending)} por cobrar. Revisa el importe.`);
  return pending;
}
const fmt = x => `${Number.isInteger(x) ? x : x.toFixed(2).replace(".", ",")} €`;

/** After the class row has been saved with "Cobrado €": add it to Pagado € and leave a note. */
export async function applyCash(me, resId, amount, client, ref) {
  if (!(amount > 0)) return;
  const r = await at(`${T.res}/${resId}`, { params: { returnFieldsByFieldId: "true" } });
  const paid = round2((Number(r.fields[F.rPaid]) || 0) + amount);
  await at(T.res, { method: "PATCH", body: { records: [{ id: resId, fields: { [F.rPaid]: paid } }] } });
  await appendNote(resId, me.name, `cobrado en efectivo ${fmt(amount)} · ${client} · ${ref || r.fields[F.rRef] || ""}`);
}

/** Cash collected and not yet handed in, grouped by teacher. */
export async function cashLedger() {
  const recs = await listAll(T.occ, {
    filterByFormula: `AND({${NAMES.cash}}>0, NOT({${NAMES.handed}}))`,
    "fields[]": ["Profesor", "Cliente", "Fecha", NAMES.cash], "sort[0][field]": "Fecha",
  }, { byName: true });
  const by = new Map();
  for (const r of recs) {
    const f = r.fields, t = f["Profesor"]?.name || f["Profesor"] || "";
    if (!by.has(t)) by.set(t, { teacher: t, total: 0, count: 0, items: [] });
    const g = by.get(t), a = Number(f[NAMES.cash]) || 0;
    g.total = round2(g.total + a); g.count++; g.items.push({ client: f["Cliente"] || "", date: f["Fecha"] || "", amount: a });
  }
  const list = [...by.values()].sort((a, b) => b.total - a.total);
  return { total: round2(list.reduce((a, g) => a + g.total, 0)), byTeacher: list };
}
export async function handover(teacher) {
  const recs = await listAll(T.occ, {
    filterByFormula: `AND({${NAMES.cash}}>0, NOT({${NAMES.handed}}), {Profesor}='${q(teacher)}')`, "fields[]": ["Profesor", NAMES.cash],
  }, { byName: true });
  for (let i = 0; i < recs.length; i += 10) {
    await at(T.occ, { method: "PATCH", body: { records: recs.slice(i, i + 10).map(r => ({ id: r.id, fields: { [NAMES.handed]: true } })) } });
  }
  return { count: recs.length, total: round2(recs.reduce((a, r) => a + (Number(r.fields[NAMES.cash]) || 0), 0)) };
}

/** Money block of Laia's panel. rows = the classes already loaded for the dashboard. */
export async function moneyPanel(rows, today) {
  const res = await listAll(T.res, { filterByFormula: "OR({Estado}='Señal pagada',{Estado}='Confirmada')",
    "fields[]": [F.rRef, F.rName, F.rTotal, F.rPaid, F.rWa] });
  let pendingTotal = 0, noPrice = 0; const list = [];
  for (const r of res) {
    const tot = r.fields[F.rTotal];
    if (tot == null) { noPrice++; continue; }
    const pend = round2(Number(tot) - (Number(r.fields[F.rPaid]) || 0));
    if (pend <= 0.009) continue;
    pendingTotal = round2(pendingTotal + pend);
    const mine = rows.filter(x => !x.block && x.booking?.resId === r.id);
    list.push({ ref: r.fields[F.rRef] || "", name: r.fields[F.rName] || "", pending: pend, wa: r.fields[F.rWa] || "",
      lastDate: mine.map(x => x.date).sort().pop() || "", given: mine.some(x => x.done || x.date < today) });
  }
  list.sort((a, b) => (b.given - a.given) || (a.lastDate || "9").localeCompare(b.lastDate || "9"));
  return { pendingTotal, pendingCount: list.length, noPrice, list: list.slice(0, 15), cash: await cashLedger() };
}
