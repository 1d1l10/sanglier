// Eth Sànglier · reminders to CLIENTS, to avoid no-shows.
//   c7   7 days before the first class        "we are waiting for you" + button "need anything? tell Laia"
//   c1   the evening before the first class   how to get to the meeting point: map, directions, Laia's phone
//   c2h  about 2 hours before each class day  meeting point + map (optional, off unless listed in NOTIFY_CLIENT_KINDS)
// Directions and exact map pins per meeting point: Airtable table "Puntos de encuentro" (Laia edits it, no deploy needed).
//
// Only bookings that are paid (Señal pagada / Confirmada) get anything. Languages: the one the client used on the web (ES/EN/FR/CA).
// Env vars (besides the ones of staff-notify.mjs)
//   NOTIFY_CLIENTS    "1" turns the client reminders on (NOTIFY_ON must be 1 too). Anything else = nothing is sent to clients.
//   NOTIFY_CLIENT_AT  "HH:MM" Madrid time from which the 7-day reminder goes out (default 10:00)
//   NOTIFY_CLIENT_NIGHT "HH:MM" Madrid time from which the evening-before reminder goes out (default 19:00)
//   NOTIFY_CLIENT_KINDS which reminders are on, default "c7,c1" (add c2h for the one 2 hours before)
//   NOTIFY_CLIENT_WA  "1" also sends them by WhatsApp (needs approved templates, see README). Email only by default.
//   MAP_LINKS         optional JSON {"Baqueira 1500":"https://maps.app.goo.gl/…"}; the "Mapa" column of "Puntos de encuentro" wins
//   STAFF_PUBLIC_URL  public address of the app host, used for the confirmation link (default: Netlify's URL)
//   LAIA_WHATSAPP     number for the "I can't come / question" button
import crypto from "node:crypto";
import { T, F, PAID, env, at, listAll, addDays, toMin, sel } from "./staff-core.mjs";
import { KINDS, LANGS, isPlace, mapSearch, langOf, discName, buildMessage } from "./staff-remind-copy.mjs";
import { waNumber, validEmail } from "./staff-digest.mjs";
export { KINDS, langOf, isPlace, discName };

const WA_KIND = { c7: "7d", c1: "1d", c2h: "2h" };
const CLIENT_WINDOW_MIN = 540;          // the 7-day reminder can still go out up to 9 h after its start time
const NIGHT_WINDOW_MIN = 210;           // the evening-before one until 3.5 h after (19:00 → 22:30)
const JUST_BOOKED_MS = 12 * 3600e3;     // no 7-day reminder to someone who booked less than 12 h ago (the evening-before one always goes)

/* ---------- meeting points: directions + Google Maps ---------- */
export const POINTS_TABLE = "Puntos de encuentro";
const NOTE_COL = { es: "Indicaciones (ES)", en: "Indications (EN)", fr: "Indications (FR)", ca: "Indicacions (CA)" };
/** Rows of "Puntos de encuentro": [{ name, map, notes: {es,en,fr,ca} }]. Never throws (empty list if the table is missing). */
export async function loadPoints() {
  try {
    const recs = await listAll(encodeURIComponent(POINTS_TABLE), {}, { byName: true });
    return recs.map(r => ({ name: String(r.fields["Nombre"] || "").trim(), map: String(r.fields["Mapa"] || "").trim(),
      notes: Object.fromEntries(Object.entries(NOTE_COL).map(([l, c]) => [l, String(r.fields[c] || "").trim()])) }))
      .filter(p => p.name).sort((a, b) => b.name.length - a.name.length);   // longest name first: "Baqueira 1500" before "Baqueira"
  } catch (e) { console.error("meeting points", e.message); return []; }
}
const pointOf = (meeting, points) => { const m = String(meeting || "").toLowerCase(); return (points || []).find(p => m.includes(p.name.toLowerCase())); };
/** Directions for the client, in their language (falls back to Spanish). Split into short lines. */
export function notesFor(meeting, lang, points) {
  const p = pointOf(meeting, points); if (!p) return [];
  return String(p.notes[lang] || p.notes.es || "").split(/\n+/).map(t => t.trim()).filter(Boolean).slice(0, 4);
}
export function mapFor(meeting, points) {
  if (!isPlace(meeting)) return "";
  const pt = pointOf(meeting, points); if (pt && /^https:\/\//.test(pt.map)) return pt.map;
  const m = String(meeting).toLowerCase();
  let over = {}; try { over = JSON.parse(env("MAP_LINKS") || "{}"); } catch {}
  for (const [k, v] of Object.entries(over)) if (m.includes(k.toLowerCase()) && /^https:\/\//.test(v)) return v;
  return mapSearch(meeting);
}

/* ---------- signed confirmation link ---------- */
const sig = resId => crypto.createHmac("sha256", env("STAFF_SECRET") || "x").update("confirm|" + resId).digest("base64url").slice(0, 24);
export const sigOk = (resId, s) => { const g = sig(resId); return typeof s === "string" && s.length === g.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(g)); };
const baseUrl = () => String(env("STAFF_PUBLIC_URL") || env("URL") || "https://ethsanglierskischool.com").replace(/\/$/, "");
export const confirmUrl = (resId, lang) => `${baseUrl()}/api/staff/confirm?r=${resId}&s=${sig(resId)}&l=${lang}`;

/** One reminder, ready to send (see staff-remind-copy.mjs). */
export const clientMessage = (x, points = []) => buildMessage(x, { map: m => mapFor(m, points), notes: (m, l) => notesFor(m, l, points),
  helpWa: String(env("LAIA_WHATSAPP") || env("SCHOOL_WA") || "").replace(/\D/g, "") });
export const clientKinds = () => String(env("NOTIFY_CLIENT_KINDS") || "c7,c1").split(/[\s,]+/).filter(k => KINDS.includes(k));
export const waTemplate = (kind, lang) => `${env("WA_CLIENT_PREFIX") || "recordatorio"}_${WA_KIND[kind]}_${lang}`;

/* ---------- what is due ---------- */
const hmOk = (hm, from, mins) => toMin(hm) >= toMin(from) && toMin(hm) <= toMin(from) + mins;

/** Class rows with a booking, from 10 days back to 9 days ahead, grouped by booking. */
export async function collect(today) {
  const from = addDays(today, -10), to = addDays(today, 9);
  const recs = await listAll(T.occ, {
    filterByFormula: `AND(IS_AFTER({Fecha}, '${addDays(from, -1)}'), IS_BEFORE({Fecha}, '${addDays(to, 1)}'), {Reserva})`,
    "fields[]": ["Fecha", "Profesor", "Inicio", "Fin", "Reserva", "Hecha"],
  }, { byName: true });
  const by = {};
  for (const r of recs) {
    const f = r.fields, resId = (f["Reserva"] || [])[0];
    if (!resId || !f["Fecha"]) continue;
    (by[resId] = by[resId] || []).push({ id: r.id, date: f["Fecha"], start: f["Inicio"] || "", end: f["Fin"] || "", teacher: sel(f["Profesor"]), done: !!f["Hecha"] });
  }
  for (const v of Object.values(by)) v.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  return by;
}
async function loadBookings(ids) {
  const out = {}, list = [...new Set(ids)];
  for (let i = 0; i < list.length; i += 40) {
    const recs = await listAll(T.res, { filterByFormula: `OR(${list.slice(i, i + 40).map(id => `RECORD_ID()='${id}'`).join(",")})`,
      "fields[]": [F.rRef, F.rName, F.rDisc, F.rPax, F.rGear, F.rState, F.rPhone, F.rEmail, F.rLangWeb, F.rCreated, F.rMeet, F.rConfirmed, F.rNoRemind] });
    recs.forEach(r => { const f = r.fields; out[r.id] = {
      resId: r.id, ref: f[F.rRef] || "", name: f[F.rName] || "", disc: f[F.rDisc] || "", pax: Number(f[F.rPax]) || 1, gear: f[F.rGear] || "",
      state: sel(f[F.rState]), phone: f[F.rPhone] || "", email: String(f[F.rEmail] || "").trim(), lang: langOf(f[F.rLangWeb]),
      created: f[F.rCreated] || "", meeting: f[F.rMeet] || "", confirmed: f[F.rConfirmed] || "", noRemind: !!f[F.rNoRemind] }; });
  }
  return out;
}

/** The reminders that are due right now (before checking the log): [{ kind, date, resId, rows, start, end }] */
export function dueNow(by, today, hm, clientAt, { night = "19:00", kinds = ["c7", "c1"] } = {}) {
  const out = [], day = hmOk(hm, clientAt, CLIENT_WINDOW_MIN), eve = hmOk(hm, night, NIGHT_WINDOW_MIN);
  for (const [resId, rows] of Object.entries(by)) {
    const first = rows[0].date;
    if (kinds.includes("c7") && day && first === addDays(today, 7)) out.push({ kind: "c7", date: first, resId, rows: rows.filter(r => r.date === first) });
    if (kinds.includes("c1") && eve && first === addDays(today, 1)) out.push({ kind: "c1", date: first, resId, rows: rows.filter(r => r.date === first) });
    const t = kinds.includes("c2h") ? rows.filter(r => r.date === today && !r.done && /^\d\d:\d\d$/.test(r.start)) : [];
    if (t.length) {
      const to = toMin(t[0].start) - toMin(hm);          // minutes until the first class of the day
      if (to <= 125 && to >= 20 && toMin(hm) >= toMin("06:30")) out.push({ kind: "c2h", date: today, resId, rows: t });
    }
  }
  return out;
}
const msgFor = (d, b, points) => clientMessage({ kind: d.kind, lang: b.lang, name: b.name, date: d.date, start: d.rows[0].start, end: d.rows[d.rows.length - 1].end,
  teacher: [...new Set(d.rows.map(r => r.teacher).filter(Boolean))].join(" + "), disc: b.disc, pax: b.pax, meeting: b.meeting, gear: b.gear, ref: b.ref, resId: d.resId, confirmed: !!b.confirmed }, points);

/** Why a booking gets nothing (null = fine). nowMs only matters for the 7-day one. */
export function skipReason(d, b, nowMs) {
  if (!b) return "Reserva no encontrada";
  if (!PAID.includes(b.state)) return `Estado «${b.state || "—"}»`;
  if (b.noRemind) return "Marcada «No enviar recordatorios»";
  if (d.kind === "c7" && b.created && nowMs - Date.parse(b.created) < JUST_BOOKED_MS) return "Reservó hace menos de 12 h";
  return null;
}
function channelsFor(b, S) {
  const out = [];
  if (validEmail(b.email)) out.push({ channel: "Email", to: b.email });
  if (S.clientWa && waNumber(b.phone)) out.push({ channel: "WhatsApp", to: waNumber(b.phone) });
  return out;
}

/* ---------- the run (called from staff-notify.runDue) ---------- */
export async function runClients({ S, today, hm, io, nowMs = Date.now() }) {
  const by = await collect(today);
  const due = dueNow(by, today, hm, S.clientAt, { night: S.clientNight, kinds: S.clientKinds });
  if (!due.length) return { ran: [], result: [] };
  const logs = {};
  for (const k of new Set(due.map(d => d.kind + "|" + d.date))) { const [kind, date] = k.split("|"); logs[k] = await io.logFor(date, kind); }   // if this fails nothing is sent
  const pending = due.filter(d => { const lg = logs[d.kind + "|" + d.date]; return ["Email", "WhatsApp"].some(c => { const key = `${d.date}|${d.kind}|${d.resId}|${c}`; return !lg.sent.has(key) && !(S.dryRun && lg.simulated.has(key)); }); });
  if (!pending.length) return { ran: [], result: [] };
  const books = await loadBookings(pending.map(d => d.resId)), points = await loadPoints(), result = [];
  for (const d of pending) {
    const b = books[d.resId], lg = logs[d.kind + "|" + d.date], why = skipReason(d, b, nowMs);
    if (why) { result.push({ key: `${d.date}|${d.kind}|${d.resId}`, status: "Saltado: " + why }); continue; }
    const msg = msgFor(d, b, points);
    for (const ch of channelsFor(b, S)) {
      const key = `${d.date}|${d.kind}|${d.resId}|${ch.channel}`, item = { key, prof: { name: b.name || b.ref }, channel: ch.channel };
      if (lg.sent.has(key) || (S.dryRun && lg.simulated.has(key)) || (lg.errors[key] || 0) >= 3) continue;
      if (ch.channel === "Email" && !S.emailReady) { result.push({ key, status: "Saltado: email sin configurar" }); continue; }
      if (ch.channel === "WhatsApp" && !S.whatsappReady) { result.push({ key, status: "Saltado: WhatsApp sin configurar" }); continue; }
      try {
        if (S.dryRun) { await io.logWrite(item, d.kind, d.date, "Simulado", "NOTIFY_DRYRUN"); result.push({ key, status: "Simulado" }); continue; }
        const id = ch.channel === "Email" ? await io.sendEmail(ch.to, msg) : await io.sendTemplate(ch.to, waTemplate(d.kind, b.lang), b.lang, msg.wa);
        await io.logWrite(item, d.kind, d.date, "Enviado", id);
        result.push({ key, status: "Enviado" });
      } catch (e) {
        console.error("client notice", key, e.message);
        try { await io.logWrite(item, d.kind, d.date, "Error", e.message); } catch {}
        result.push({ key, status: "Error: " + e.message });
      }
    }
  }
  return { ran: [...new Set(due.map(d => d.kind))], result };
}

/* ---------- admin view: what is coming, what was sent, who has not confirmed ---------- */
export async function upcoming({ S, today, hm, io, nowMs = Date.now() }) {
  const by = await collect(today);
  const ids = Object.keys(by).filter(id => by[id].some(r => r.date >= today));
  const books = await loadBookings(ids), points = await loadPoints();
  const logs = await io.recentClientLog(today);
  const rows = [];
  for (const id of ids) {
    const b = books[id], cls = by[id].filter(r => r.date >= today);
    if (!b || !PAID.includes(b.state) && !["Confirmada, falta pago", "Pendiente de señal", "Pago en curso"].includes(b.state)) continue;
    const first = by[id][0].date, upcomingDays = [...new Set(cls.map(r => r.date))];
    const problems = [];
    if (!PAID.includes(b.state)) problems.push(`Sin pagar (${b.state}): no recibe recordatorios`);
    if (b.noRemind) problems.push("Marcado «No enviar recordatorios»");
    if (!validEmail(b.email)) problems.push("Falta el email");
    if (!isPlace(b.meeting) && cls[0].date <= addDays(today, 3)) problems.push("Falta el punto de encuentro");
    else if (isPlace(b.meeting) && points.length && !pointOf(b.meeting, points)) problems.push(`«${b.meeting}» no está en Puntos de encuentro (sin indicaciones)`);
    const st = (kind, date, whenMs) => {
      const hits = logs.filter(l => l.kind === kind && l.date === date && l.resId === id);
      const ok = hits.find(l => l.status === "Enviado") || hits.find(l => l.status === "Simulado");
      if (ok) return ok.status;
      if (hits.some(l => l.status === "Error")) return "Error";
      return whenMs < nowMs ? "No enviado" : "Pendiente";
    };
    const at = (date, hmv) => Date.parse(`${date}T${hmv}:00${/* Madrid is UTC+1 in winter, +2 in summer: close enough for a label */ "+01:00"}`);
    const reminders = [];
    if (first >= today) {
      if (S.clientKinds.includes("c7") && addDays(first, -7) >= addDays(today, -1)) reminders.push({ kind: "c7", date: addDays(first, -7), status: st("c7", first, at(addDays(first, -7), S.clientAt)) });
      if (S.clientKinds.includes("c1") && addDays(first, -1) >= addDays(today, -1)) reminders.push({ kind: "c1", date: addDays(first, -1), status: st("c1", first, at(addDays(first, -1), S.clientNight)) });
    }
    if (S.clientKinds.includes("c2h")) for (const date of upcomingDays) { const t = cls.find(r => r.date === date); reminders.push({ kind: "c2h", date, start: t.start, status: st("c2h", date, at(date, t.start) - 120 * 60e3) }); }
    rows.push({ resId: id, ref: b.ref, name: b.name, lang: b.lang.toUpperCase(), state: b.state, date: cls[0].date, start: cls[0].start, teacher: cls[0].teacher,
      discipline: b.disc, meeting: b.meeting || "", email: b.email, phone: b.phone, confirmed: b.confirmed || "", problems, reminders });
  }
  rows.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return { bookings: rows, today };
}

/** Sample of each reminder (for the preview and the test send) */
export function sampleMessages({ lang = "es", name = "Marta", date, meeting = "Baqueira 1500", points = [] }) {
  const base = { lang, name, date, start: "10:00", end: "13:00", teacher: "Kike", disc: "Esquí", pax: 2, meeting, gear: "Esquís", ref: "ES-EXAMPLE", resId: "recSAMPLE00000000" };
  return KINDS.map(kind => ({ kind, ...clientMessage({ ...base, kind }, points) }));
}

/* ---------- the "I'm coming" page ---------- */
const PAGE = {
  es: ["Gracias", "Anotado: te esperamos. Si algo cambia, escríbenos.", "Enlace no válido"],
  en: ["Thank you", "Noted: we'll be waiting for you. If anything changes, message us.", "Invalid link"],
  fr: ["Merci", "C'est noté : nous vous attendons. Si quelque chose change, écrivez-nous.", "Lien non valide"],
  ca: ["Gràcies", "Anotat: t'esperem. Si alguna cosa canvia, escriu-nos.", "Enllaç no vàlid"],
};
const page = (lang, ok) => new Response(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Eth Sànglier</title></head>
<body style="margin:0;background:#F3F5FA;font-family:Arial,Helvetica,sans-serif;color:#1B2440"><div style="max-width:440px;margin:12vh auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px #27396d22">
<div style="background:#27396D;color:#fff;padding:16px 20px;font-weight:bold;font-size:18px">Eth Sànglier</div>
<div style="padding:26px 20px"><div style="font-size:42px">${ok ? "✅" : "⚠️"}</div><h1 style="font-size:22px;margin:8px 0">${ok ? PAGE[lang][0] : PAGE[lang][2]}</h1>${ok ? `<p style="font-size:16px;line-height:1.5">${PAGE[lang][1]}</p>` : ""}</div></div></body></html>`,
  { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
export async function confirmAttendance(resId, s, l) {
  const lang = LANGS.includes(l) ? l : "es";
  if (!/^rec[A-Za-z0-9]+$/.test(String(resId || "")) || !sigOk(resId, s)) return page(lang, false);
  try {
    const cur = await at(`${T.res}/${resId}`, { params: { returnFieldsByFieldId: "true" } });
    if (!cur.fields[F.rConfirmed]) await at(`${T.res}/${resId}`, { method: "PATCH", body: { fields: { [F.rConfirmed]: new Date().toISOString() } } });
  } catch (e) { console.error("confirm", e.message); return page(lang, false); }
  return page(lang, true);
}
