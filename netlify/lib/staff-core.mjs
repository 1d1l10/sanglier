// Eth Sànglier · shared Airtable access for the staff API and the notice sender.
// Used by functions/staff.mjs and functions/notify.mjs.

export const T = {
  prof: "tbl37OfR6AJSvGzf8",      // Profesores
  occ: "tblUZv1VHhZrCeHMl",       // Ocupación
  res: "tblJ5jojctx77Z87e",       // Reservas
  log: "Avisos",                  // Avisos (log of notices sent; also stops double sending)
};
export const F = {
  // Profesores
  pName: "fld4dbEx82WauW6Hh", pPin: "fldkXe7rk5pkMrxH6", pPinSeal: "fldo2B46LVTqc1Djl", pRole: "fldjkm5wlLykpVzRF", pActive: "fldH4nqOJIpyaWKIC",
  pPhoto: "fldUE4GsR6c0JxtbH", pDisc: "fldCOKiDpAByxw4ux", pPhone: "fldDihglM8jvvdeoZ",
  // Ocupación
  oClient: "fldA9b0cbNJlUBKKi", oDate: "fldHfTnPr3dr0rJxh", oProf: "fldEayRVoSxmYRbJg", oStart: "fldTraTS6DHe2q5eZ",
  oEnd: "fldVMXzZJxctGp1yL", oRes: "fld0GHWJQwftYn3MP", oDone: "fldFQN2irxKfSVy3J", oLevel: "fldgvO7wvaLOwysIj",
  oSummary: "fldFO6SzVoELWdHHU", oBy: "fldnneNrXW7xlVYUt", oAt: "fldF6rxoeFMDRIONs", oMeet: "fldjH0yx6NYPMqRfb",
  // Reservas
  rRef: "flduvBNVOCi91XKt9", rName: "fldy0FxReQsBNUmpp", rDisc: "fld7MkAaVgF0Aoo7h", rLevel: "fldaSr1tKncptrvXp",
  rPax: "fldEmmNgMkokTa3uX", rLang: "fld1aqoJHbdRG0v0c", rWa: "fldjFCv71S3exFuxU", rGear: "fldYubSWdYyYedfIO",
  rState: "fldFEK6GNb5k3kDOo", rCreated: "fldWVrDqZlBZDh6EU", rOrigin: "fldBrumZvvUtLkaBl", rHours: "fld6iu8k7QzR6F8Ni",
  rPhone: "fldUAEsYALPXt9K70",
  rEmail: "fldYvNSbjgpEx0sRR", rLangWeb: "fldEgdYXvuzT5Eu7M", rDays: "fldeN03M5WEwmEFeP", rMonth: "fldk36EOI0O1c94mL",
  rTeachers: "fldTlhtfXaeAjxAfy", rSchedule: "fldARW2kaM46HDTyo", rDiscount: "fldPt79ayvn5hcQp1", rNotes: "fldIKQAgWLe6kS7Sq",
  rSlots: "fldFoYWxiQK6FoExZ", rMeet: "fldYka2lXExCy6187",
  rConfirmed: "fldJlJDhYFQK5Hwhd", rNoRemind: "fldiNsBk9hG4ZFCsS",   // client reminders: attendance confirmed (dateTime) / do not remind (checkbox)
  rTotal: "fldrbuEcM0P20IrW2", rDeposit: "fldNyAgtyEW22FMaZ", rPaid: "fldR9jKfF7ePW6ufD",
  // Ocupación money fields (added for the cash question at the end of a class): read and written BY NAME
  oCash: "Cobrado €", oHanded: "Efectivo entregado",
};
// Ocupación is read by field name and mapped back to ids, so fields that have no id here (the two above) come through too.
const ONAMES = { [F.oClient]: "Cliente", [F.oDate]: "Fecha", [F.oProf]: "Profesor", [F.oStart]: "Inicio", [F.oEnd]: "Fin", [F.oRes]: "Reserva",
  [F.oDone]: "Hecha", [F.oLevel]: "Nivel final", [F.oSummary]: "Resumen", [F.oBy]: "Cerrada por", [F.oAt]: "Cerrada el", [F.oMeet]: "Punto de encuentro" };
const OIDS = Object.fromEntries(Object.entries(ONAMES).map(([id, n]) => [n, id]));
const remapOcc = r => ({ ...r, fields: Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [OIDS[k] || k, v])) });
export const round2 = n => Math.round(n * 100) / 100;
// Profesores fields added for the notices are read and written BY NAME (Email, Avisos), so no field ids are needed.
export const TO_CONFIRM = ["Pendiente de señal", "Pago en curso", "Solo WhatsApp", "Faltan datos"];
export const PAID = ["Señal pagada", "Confirmada"];
export const LOST = ["Cancelada", "Señal caducada", "Pago fallido"];
export const LEVELS = ["Verde", "Azul", "Roja", "Negra"];
export const ADMIN = "Administración", OCC = "Ocasional";

export const q = s => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
export const toMin = t => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
export const isHM = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ""));
export const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
export const addDays = (d, n) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const madridToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
export const madridHM = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
export const monthEnd = d => { const [y, m] = d.split("-").map(Number); return `${y}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };
export const sel = v => v?.name || v || "";
export const firstName = s => String(s || "").trim().split(/\s+/)[0] || "";

export function env(name) { return (globalThis.Netlify?.env?.get?.(name)) ?? process.env[name]; }

export async function at(path, { method = "GET", body, params } = {}) {
  const base = env("AIRTABLE_BASE_ID"), token = env("AIRTABLE_TOKEN");
  const url = new URL(`https://api.airtable.com/v0/${base}/${path}`);
  if (params) for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach(x => url.searchParams.append(k, x)); else if (v != null) url.searchParams.set(k, v);
  }
  const r = await fetch(url, {
    method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data?.error?.message || `Airtable ${r.status}`), { status: r.status });
  return data;
}
// byName: records come back keyed by field NAME instead of field id
export async function listAll(table, params, { byName = false } = {}) {
  const out = []; let offset;
  do {
    const d = await at(table, { params: { ...params, ...(byName ? {} : { returnFieldsByFieldId: "true" }), pageSize: "100", offset } });
    out.push(...d.records); offset = d.offset;
  } while (offset);
  return out;
}

/* ---------------- data mapping ---------------- */
export async function bookingsById(ids) {
  const out = {}; const list = [...new Set(ids)];
  for (let i = 0; i < list.length; i += 40) {
    const chunk = list.slice(i, i + 40);
    const recs = await listAll(T.res, {
      filterByFormula: `OR(${chunk.map(id => `RECORD_ID()='${id}'`).join(",")})`,
      "fields[]": [F.rRef, F.rName, F.rDisc, F.rLevel, F.rPax, F.rLang, F.rWa, F.rGear, F.rMeet, F.rTotal, F.rPaid],
    });
    recs.forEach(r => out[r.id] = r.fields);
  }
  return out;
}
export function mapRow(r, bookings, me) {
  const f = r.fields, resId = (f[F.oRes] || [])[0];
  const start = f[F.oStart] || "", end = f[F.oEnd] || "";
  const block = !resId;
  const item = {
    id: r.id, teacher: f[F.oProf]?.name || f[F.oProf] || "", date: f[F.oDate], start, end,
    wholeDay: !start && !end, block, hours: (!block && isHM(start) && isHM(end)) ? (toMin(end) - toMin(start)) / 60 : 0,
    reason: block ? String(f[F.oClient] || "").replace(/^Bloqueo:?\s*/i, "") : "",
    cash: Number(f[F.oCash]) || 0, done: !!f[F.oDone], level: f[F.oLevel]?.name || f[F.oLevel] || "", summary: f[F.oSummary] || "", closedBy: f[F.oBy] || "",
  };
  if (!block) {
    const b = bookings[resId] || {};
    const shared = me.role === OCC;
    item.booking = {
      ref: b[F.rRef] || "", discipline: b[F.rDisc] || "", levelIn: b[F.rLevel] || "", pax: b[F.rPax] || null,
      language: b[F.rLang] || "", gear: shared ? "" : (b[F.rGear] || ""),
      resId, meeting: b[F.rMeet] || (Array.isArray(f[F.oMeet]) ? f[F.oMeet][0] : f[F.oMeet]) || "",
      client: shared ? firstName(b[F.rName] || f[F.oClient]) : (b[F.rName] || f[F.oClient] || ""),
      wa: shared ? "" : (b[F.rWa] || ""),   // shared profiles never see client phone numbers
      // what the client still has to pay (null = no price set, or a shared profile, which never sees money)
      pending: shared || b[F.rTotal] == null ? null : Math.max(0, round2(Number(b[F.rTotal]) - (Number(b[F.rPaid]) || 0))),
    };
  }
  return item;
}
export async function rowsFor(names, from, to, me) {
  const who = names.length === 1 ? `{Profesor}='${q(names[0])}'` : `OR(${names.map(n => `{Profesor}='${q(n)}'`).join(",")})`;
  const formula = `AND(${who}, IS_AFTER({Fecha}, '${addDays(from, -1)}'), IS_BEFORE({Fecha}, '${addDays(to, 1)}'))`;
  const recs = (await listAll(T.occ, {
    filterByFormula: formula, "sort[0][field]": "Fecha", "sort[1][field]": "Inicio",
    "fields[]": [...["oClient", "oDate", "oProf", "oStart", "oEnd", "oRes", "oDone", "oLevel", "oSummary", "oBy", "oMeet"].map(k => ONAMES[F[k]]), F.oCash],
  }, { byName: true })).map(remapOcc);
  const bookings = await bookingsById(recs.flatMap(r => r.fields[F.oRes] || []));
  return recs.map(r => mapRow(r, bookings, me));
}
export async function getRow(id) {
  return remapOcc(await at(`${T.occ}/${id}`));
}
