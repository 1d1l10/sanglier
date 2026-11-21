// Eth Sànglier · creating and changing classes from the staff app.
// Everything lands in the same two tables the website booking uses:
//   Reservas (one row per booking) and Ocupación (one row per teacher, day and time range, linked to the booking).
// The text fields of Reservas (Días, Horario, Mes, Profesores, Horas totales) are always rebuilt from the linked
// Ocupación rows, in the same format the website writes, so Laia sees one consistent picture.
import { T, F, ADMIN, LEVELS, q, toMin, isHM, isDate, addDays, madridToday, madridHM, sel, at, listAll, rowsFor, getRow } from "./staff-core.mjs";
import { waNumber, validEmail } from "./staff-digest.mjs";

export const DISCIPLINES = ["Esquí privado", "Snowboard", "Niños", "Grupo", "Freeride"];
export const LANGS = { "Español": "ES", "English": "EN", "Français": "FR", "Català": "CA" };
export const MEETING = ["Baqueira 1500", "Baqueira 1800", "Tanau 1700", "Bonaigua", "Orri", "Por confirmar"];
export const ADMIN_STATUS = ["Confirmada", "Faltan datos", "Solo WhatsApp", "Pendiente de señal"];
const DAY_FROM = "08:00", DAY_TO = "18:00";
const MON = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const short = d => `${+d.slice(8)} ${MON[+d.slice(5, 7) - 1]}`;
const monthLabel = d => `${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
const hh = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hTxt = h => String(Math.round(h * 10) / 10).replace(".", ",");
export class Refused extends Error { constructor(status, message) { super(message); this.status = status; } }

/* ---------- text fields of Reservas, from the list of slots ---------- */
export function describe(slots) {
  const s = [...slots].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const byDate = new Map(); s.forEach(x => { if (!byDate.has(x.date)) byDate.set(x.date, []); byDate.get(x.date).push(x); });
  const dates = [...byDate.keys()], hrs = x => (toMin(x.end) - toMin(x.start)) / 60;
  const dayH = d => byDate.get(d).filter(x => x.teacher === byDate.get(d)[0].teacher).reduce((a, x) => a + hrs(x), 0);
  const sig = d => byDate.get(d).map(x => `${x.teacher} ${x.start}-${x.end}`).join("; ");
  const same = dates.every(d => sig(d) === sig(dates[0]));
  const teachers = [...new Set(s.map(x => x.teacher))];
  const differ = dates.some(d => dayH(d) !== dayH(dates[0]));
  return {
    days: dates.map(d => short(d) + (differ ? ` (${hTxt(dayH(d))}h)` : "")).join(", "),
    month: monthLabel(dates[0]), teachers: teachers.join(", "),
    schedule: same ? sig(dates[0]) + (byDate.get(dates[0]).length === 1 ? ` (${hTxt(dayH(dates[0]))} h/día)` : "")
      : dates.map(d => `${short(d)}: ${sig(d)}`).join("\n"),
    hours: Math.round(s.reduce((a, x) => a + hrs(x), 0) * 10) / 10,
  };
}
export async function refreshBooking(resId) {
  const r = await at(`${T.res}/${resId}`, { params: { returnFieldsByFieldId: "true" } });
  const ids = r.fields[F.rSlots] || [];
  if (!ids.length) return;
  const recs = [];
  for (let i = 0; i < ids.length; i += 40) {
    recs.push(...await listAll(T.occ, { filterByFormula: `OR(${ids.slice(i, i + 40).map(id => `RECORD_ID()='${id}'`).join(",")})`,
      "fields[]": [F.oDate, F.oProf, F.oStart, F.oEnd] }));
  }
  const slots = recs.map(x => ({ date: x.fields[F.oDate], teacher: sel(x.fields[F.oProf]), start: x.fields[F.oStart] || "", end: x.fields[F.oEnd] || "" }))
    .filter(x => x.date && isHM(x.start) && isHM(x.end));
  if (!slots.length) return;
  const d = describe(slots);
  await at(T.res, { method: "PATCH", body: { typecast: true, records: [{ id: resId, fields: {
    [F.rDays]: d.days, [F.rMonth]: d.month, [F.rTeachers]: d.teachers, [F.rSchedule]: d.schedule, [F.rHours]: d.hours } }] } });
}
export async function appendNote(resId, who, text) {
  const r = await at(`${T.res}/${resId}`, { params: { returnFieldsByFieldId: "true" } });
  const line = `[APP ${madridToday()} ${madridHM()}] ${who} · ${text}`;
  const cur = r.fields[F.rNotes] || "";
  await at(T.res, { method: "PATCH", body: { records: [{ id: resId, fields: { [F.rNotes]: cur ? `${cur}\n${line}` : line } }] } });
}

/* ---------- checks ---------- */
/** slots: [{ date, start, end }] — each day can have its own times. Refused with the first clash found. */
async function conflicts(teacher, slots, ignoreIds = []) {
  const sorted = [...slots].sort((a, b) => a.date.localeCompare(b.date));
  const rows = await rowsFor([teacher], sorted[0].date, sorted[sorted.length - 1].date, { role: ADMIN });
  for (const { date: d, start, end } of sorted) {
    const c = rows.find(r => r.date === d && !ignoreIds.includes(r.id) && (r.wholeDay || (toMin(r.start) < toMin(end) && toMin(r.end) > toMin(start))));
    if (c) throw new Refused(409, c.wholeDay ? `${teacher} no está disponible el ${short(d)} (día entero bloqueado).`
      : `${teacher} ya tiene ${c.block ? "bloqueado" : "una clase"} el ${short(d)} de ${c.start} a ${c.end}.`);
  }
}
function checkTimes(date, start, end, days = 1) {
  if (!isDate(date)) throw new Refused(400, "Elige la fecha.");
  if (date < madridToday()) throw new Refused(400, "Esa fecha ya ha pasado.");
  if (date < "2026-01-01" || addDays(date, Math.max(1, days) - 1) > "2030-12-31") throw new Refused(400, "Elige una fecha entre 2026 y 2030.");
  if (!isHM(start) || !isHM(end) || toMin(end) <= toMin(start)) throw new Refused(400, "Revisa la hora de inicio y la duración.");
  if (toMin(start) < toMin(DAY_FROM) || toMin(end) > toMin(DAY_TO)) throw new Refused(400, `La clase tiene que estar entre las ${DAY_FROM} y las ${DAY_TO}.`);
  if (!Number.isInteger(days) || days < 1 || days > 14) throw new Refused(400, "Los días seguidos tienen que ser entre 1 y 14.");
}
const consecutive = (date, days) => Array.from({ length: days }, (_, i) => addDays(date, i));

/**
 * The days of a new booking (or of days added to one), each with its own start and hours, like the website:
 *   body.slots = [{ date: "2026-12-27", start: "10:00", hours: 2 }, { date: "2026-12-28", start: "09:30", hours: 3 }, …]
 * Older clients send { date, start, hours, days } (same times on consecutive days): still accepted.
 * -> [{ date, start, end, hours }] sorted by date, one per day. Refused if anything is off.
 */
export function parseSlots(body, defaults = {}) {
  let raw = Array.isArray(body.slots) ? body.slots : null;
  if (!raw) {
    const days = body.days === undefined ? 1 : Number(body.days);
    if (!Number.isInteger(days) || days < 1 || days > 14) throw new Refused(400, "Los días seguidos tienen que ser entre 1 y 14.");
    if (!isDate(body.date)) throw new Refused(400, "Elige la fecha.");
    raw = consecutive(body.date, days).map(date => ({ date, start: body.start, hours: body.hours }));
  }
  if (!raw.length) throw new Refused(400, "Añade al menos un día.");
  if (raw.length > 14) throw new Refused(400, "Como máximo 14 días por reserva.");
  const slots = raw.map(x => {
    const date = String(x?.date || ""), start = String(x?.start || defaults.start || "");
    const hours = Number(x?.hours ?? defaults.hours);
    if (!(hours >= 0.5 && hours <= 8) || (hours * 2) % 1 !== 0) throw new Refused(400, `${isDate(date) ? short(date) + ": l" : "L"}a duración tiene que ser de 30 minutos a 8 horas.`);
    const end = isHM(start) ? hh(toMin(start) + hours * 60) : "";
    checkTimes(date, start, end);
    return { date, start, end, hours };
  }).sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < slots.length; i++)
    if (slots[i].date === slots[i - 1].date) throw new Refused(400, `El ${short(slots[i].date)} está dos veces: pon un solo horario por día.`);
  return slots;
}
const slotText = slots => slots.map(x => `${short(x.date)} ${x.start}-${x.end}`).join(", ");
async function addOcc(records) {          // Airtable takes at most 10 records per call
  const ids = [];
  for (let i = 0; i < records.length; i += 10) {
    const r = await at(T.occ, { method: "POST", body: { typecast: true, records: records.slice(i, i + 10) } });
    ids.push(...r.records.map(x => x.id));
  }
  return ids;
}

async function nextRef() {
  const recs = await listAll(T.res, { filterByFormula: "FIND('MAN-', {Reserva})=1", "fields[]": [F.rRef] });
  const max = recs.reduce((m, r) => Math.max(m, +(String(r.fields[F.rRef] || "").match(/^MAN-(\d+)/)?.[1] || 0)), 0);
  return `MAN-${String(max + 1).padStart(3, "0")}`;
}

/* ---------- 1. create a new booking + its classes ---------- */
// me: { name, role }. Administración can pick the teacher and the state; an instructor can only create for themselves,
// always as "Faltan datos" so Laia knows it still has to be confirmed.
export async function createClass(me, body, activeNames) {
  const admin = me.role === ADMIN;
  const name = String(body.name || "").trim();
  if (name.length < 2 || name.length > 80) throw new Refused(400, "Escribe el nombre del cliente.");
  const phone = String(body.phone || "").trim(), email = String(body.email || "").trim();
  if (phone && !waNumber(phone)) throw new Refused(400, "El teléfono tiene que llevar prefijo, por ejemplo +34 600 123 456.");
  if (email && !validEmail(email)) throw new Refused(400, "Ese email no parece correcto.");
  const discipline = body.discipline;
  if (!DISCIPLINES.includes(discipline)) throw new Refused(400, "Elige la disciplina.");
  const level = body.level || "";
  if (level && !LEVELS.includes(level)) throw new Refused(400, "Nivel no válido.");
  const pax = body.pax === undefined || body.pax === "" ? 1 : Number(body.pax);
  if (!Number.isInteger(pax) || pax < 1 || pax > 20) throw new Refused(400, "El número de personas tiene que estar entre 1 y 20.");
  const language = body.language || "Español";
  if (!LANGS[language]) throw new Refused(400, "Idioma no válido.");
  const meeting = body.meeting || "";
  if (meeting && !MEETING.includes(meeting)) throw new Refused(400, "Punto de encuentro no válido.");
  const teacher = admin ? String(body.teacher || "") : me.name;
  if (!activeNames.includes(teacher)) throw new Refused(400, "Elige el profesor.");
  const status = admin ? (body.status || "Confirmada") : "Faltan datos";
  if (!ADMIN_STATUS.includes(status)) throw new Refused(400, "Estado no válido.");
  // optional price and what the client already paid (Administración only)
  let price = null, paid = 0;
  if (admin && body.price !== undefined && body.price !== "" && body.price !== null) {
    price = Number(String(body.price).replace(",", ".")); paid = Number(String(body.paid || 0).replace(",", "."));
    if (!Number.isFinite(price) || price < 0 || price > 20000) throw new Refused(400, "El precio tiene que estar entre 0 y 20.000 €.");
    if (!Number.isFinite(paid) || paid < 0 || paid > price) throw new Refused(400, "Lo pagado no puede ser más que el precio.");
  }
  const slots = parseSlots(body);
  await conflicts(teacher, slots);

  const ref = await nextRef();
  const d = describe(slots.map(x => ({ date: x.date, teacher, start: x.start, end: x.end })));
  const notes = [String(body.notes || "").trim().slice(0, 500),
    `[APP ${madridToday()} ${madridHM()}] ${me.name} · ${admin ? "creada" : "creada por el profe, falta confirmar y cobrar"} · ${ref}`].filter(Boolean).join("\n");
  const fields = {
    [F.rRef]: ref, [F.rState]: status, [F.rName]: name, [F.rDisc]: discipline, [F.rPax]: pax, [F.rLang]: language, [F.rLangWeb]: LANGS[language],
    [F.rDays]: d.days, [F.rMonth]: d.month, [F.rTeachers]: d.teachers, [F.rSchedule]: d.schedule, [F.rHours]: d.hours, [F.rDiscount]: 0,
    [F.rOrigin]: `Manual (${me.name})`, [F.rCreated]: new Date().toISOString(), [F.rNotes]: notes,
    ...(phone ? { [F.rPhone]: phone } : {}), ...(email ? { [F.rEmail]: email } : {}), ...(level ? { [F.rLevel]: level } : {}), ...(meeting ? { [F.rMeet]: meeting } : {}),
    ...(price !== null ? { [F.rTotal]: price, [F.rPaid]: paid } : {}),
  };
  const res = await at(T.res, { method: "POST", body: { typecast: true, records: [{ fields }] } });
  const resId = res.records[0].id;
  let occIds = [];
  try {
    occIds = await addOcc(slots.map(x => ({ fields: {
      [F.oClient]: name, [F.oDate]: x.date, [F.oProf]: teacher, [F.oStart]: x.start, [F.oEnd]: x.end, [F.oRes]: [resId] } })));
  } catch (e) {                            // all or nothing: no half-created booking
    for (const id of occIds) { try { await at(`${T.occ}/${id}`, { method: "DELETE" }); } catch {} }
    try { await at(`${T.res}/${resId}`, { method: "DELETE" }); } catch {}
    throw e;
  }
  return { ref, resId, teacher, dates: slots.map(x => x.date), start: slots[0].start, end: slots[0].end, slots };
}

/* ---------- 2. add time to a class (it ran over) ---------- */
async function loadClass(me, occId) {
  const r = await getRow(occId);
  const f = r.fields, resId = (f[F.oRes] || [])[0], teacher = sel(f[F.oProf]);
  if (!resId) throw new Refused(400, "Eso es un bloqueo, no una clase.");
  if (me.role !== ADMIN && teacher !== me.name) throw new Refused(403, "Esa clase no es tuya.");
  return { id: occId, f, resId, teacher, date: f[F.oDate], start: f[F.oStart], end: f[F.oEnd], client: f[F.oClient] || "" };
}
export async function extendClass(me, occId, minutes) {
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 240 || minutes % 15) throw new Refused(400, "Elige cuánto se ha alargado (de 15 minutos a 4 horas).");
  const c = await loadClass(me, occId);
  if (c.date < addDays(madridToday(), -1)) throw new Refused(400, "Solo se puede alargar una clase de hoy o de ayer.");
  const newEnd = hh(toMin(c.end) + minutes);
  if (toMin(newEnd) > toMin(DAY_TO)) throw new Refused(400, `Con ese tiempo la clase pasaría de las ${DAY_TO}. Habla con Laia.`);
  await conflicts(c.teacher, [{ date: c.date, start: c.start, end: newEnd }], [occId]);
  await at(T.occ, { method: "PATCH", body: { records: [{ id: occId, fields: { [F.oEnd]: newEnd } }] } });
  await refreshBooking(c.resId);
  const ref = (await at(`${T.res}/${c.resId}`, { params: { returnFieldsByFieldId: "true" } })).fields[F.rRef] || "";
  await appendNote(c.resId, me.name, `+${hTxt(minutes / 60)} h · ${c.client} · ${short(c.date)} ${c.start}-${c.end} → ${c.start}-${newEnd} · ${ref}`);
  return { end: newEnd };
}

/* ---------- 3. more days on the same booking ---------- */
export async function addDays_(me, occId, body) {
  const c = await loadClass(me, occId);
  const slots = parseSlots(body, { start: c.start, hours: (toMin(c.end) - toMin(c.start)) / 60 });
  await conflicts(c.teacher, slots);
  await addOcc(slots.map(x => ({ fields: {
    [F.oClient]: c.client, [F.oDate]: x.date, [F.oProf]: c.teacher, [F.oStart]: x.start, [F.oEnd]: x.end, [F.oRes]: [c.resId] } })));
  await refreshBooking(c.resId);
  const ref = (await at(`${T.res}/${c.resId}`, { params: { returnFieldsByFieldId: "true" } })).fields[F.rRef] || "";
  await appendNote(c.resId, me.name, `+${slots.length} ${slots.length === 1 ? "día" : "días"} (${slotText(slots)}) · ${c.client} · ${ref}`);
  return { dates: slots.map(x => x.date), start: slots[0].start, end: slots[0].end, slots };
}

/* ---------- panel: what the team changed from the app in the last days ---------- */
export async function recentChanges(today) {
  const since = addDays(today, -7);
  const recs = await listAll(T.res, { filterByFormula: `AND(FIND('[APP ', {Notas internas}), IS_AFTER(LAST_MODIFIED_TIME(), '${addDays(today, -9)}'))`,
    "fields[]": [F.rRef, F.rName, F.rNotes] });
  const out = [];
  for (const r of recs) for (const line of String(r.fields[F.rNotes] || "").split("\n")) {
    const m = line.match(/^\[APP (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})\] (.+)$/);
    if (m && m[1] >= since) out.push({ date: m[1], time: m[2], text: m[3], ref: r.fields[F.rRef] || "", client: r.fields[F.rName] || "" });
  }
  return out.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 20);
}
