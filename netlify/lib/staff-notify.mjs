// Eth Sànglier · class notices by email and WhatsApp (night before + morning of).
//
// Env vars
//   NOTIFY_ON        "1" turns the automatic sending on. Anything else = nothing is sent (safe default).
//   NOTIFY_DRYRUN    "1" = decide and log what WOULD be sent, send nothing.
//   NOTIFY_NIGHT     "HH:MM" Madrid time of the evening notice (default 20:00)  -> classes of tomorrow
//   NOTIFY_MORNING   "HH:MM" Madrid time of the morning notice (default 07:30)  -> classes of today
//   Email  (Resend):          RESEND_API_KEY, MAIL_FROM  e.g. "Eth Sànglier <avisos@ethsanglierskischool.com>", MAIL_REPLY_TO (optional)
//   WhatsApp (Meta Cloud API): WA_TOKEN, WA_PHONE_ID, WA_TEMPLATE (default "aviso_clases"), WA_LANG (default "es")
//   Client reminders (7 days / 2 days / 2 hours before): see staff-remind.mjs. Switches: NOTIFY_CLIENTS=1, NOTIFY_CLIENT_AT, NOTIFY_CLIENT_WA=1
import { T, ADMIN, OCC, env, at, listAll, rowsFor, madridToday, madridHM, addDays, toMin, sel } from "./staff-core.mjs";
import { digestFor, rosterFor, waNumber, validEmail } from "./staff-digest.mjs";
import { runClients } from "./staff-remind.mjs";

const CHANNELS = ["Email", "WhatsApp"];
const hmOf = (name, def) => { const v = env(name); return /^([01]\d|2[0-3]):[0-5]\d$/.test(v || "") ? v : def; };

export function setupState() {
  return {
    on: env("NOTIFY_ON") === "1", dryRun: env("NOTIFY_DRYRUN") === "1",
    night: hmOf("NOTIFY_NIGHT", "20:00"), morning: hmOf("NOTIFY_MORNING", "07:30"),
    emailReady: !!(env("RESEND_API_KEY") && env("MAIL_FROM")),
    whatsappReady: !!(env("WA_TOKEN") && env("WA_PHONE_ID")),
    clients: env("NOTIFY_CLIENTS") === "1", clientAt: hmOf("NOTIFY_CLIENT_AT", "10:00"),
    clientWa: env("NOTIFY_CLIENT_WA") === "1" && !!(env("WA_TOKEN") && env("WA_PHONE_ID")),
  };
}

/* ---------- who gets what ---------- */
export async function recipients() {
  const recs = await listAll(T.prof, {}, { byName: true });
  return recs.map(r => {
    const f = r.fields;
    return { id: r.id, name: f["Nombre"] || "", role: sel(f["Rol"]), active: !!f["Activo"], disciplines: f["Disciplinas"] || [],
      email: String(f["Email"] || "").trim(), phone: f["Teléfono"] || "", notify: f["Avisos"] || [] };
  }).filter(p => p.active && p.name);
}
const teaches = p => p.role === "Instructor" || (p.role === ADMIN && p.disciplines.length > 0);

/** Everything that would be sent for one kind of notice: [{ key, prof, channel, to, digest }] plus the skipped ones with the reason. */
export async function plan(kind, date, people) {
  people = people || await recipients();
  const sharedNames = people.filter(p => p.role === OCC).map(p => p.name);
  const names = [...people.filter(teaches).map(p => p.name), ...sharedNames];
  const rows = names.length ? await rowsFor(names, date, date, { role: ADMIN }) : [];
  const out = [], skipped = [], all = [];
  const push = (p, digest, label) => {
    if (!digest.count) return;
    all.push({ prof: p, label, digest });
    const want = CHANNELS.filter(c => p.notify.includes(c));
    if (!want.length) { skipped.push({ name: p.name, reason: "Avisos desactivados", label }); return; }
    for (const c of want) {
      if (c === "Email") {
        if (!validEmail(p.email)) { skipped.push({ name: p.name, reason: "Falta el email", label, channel: c }); continue; }
        out.push({ key: `${date}|${kind}|${p.id}|Email${label === "reparto" ? "|R" : ""}`, prof: p, channel: c, to: p.email, digest, label });
      } else {
        const n = waNumber(p.phone);
        if (!n) { skipped.push({ name: p.name, reason: "Falta el WhatsApp", label, channel: c }); continue; }
        out.push({ key: `${date}|${kind}|${p.id}|WhatsApp${label === "reparto" ? "|R" : ""}`, prof: p, channel: c, to: n, digest, label });
      }
    }
  };
  for (const p of people.filter(teaches)) push(p, digestFor({ name: p.name, rows, date, kind }), "clases");
  const roster = rosterFor({ shared: sharedNames, rows, date, kind });
  for (const p of people.filter(x => x.notify.includes("Reparto"))) {
    if (!roster.count) break;
    push(p, { ...roster, count: roster.count, text: roster.text(p.name), html: roster.html(p.name) }, "reparto");
  }
  return { date, kind, out, skipped, all, rowsCount: rows.length };
}

/* ---------- sending ---------- */
export async function sendEmail(to, d) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { authorization: `Bearer ${env("RESEND_API_KEY")}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env("MAIL_FROM"), to: [to], subject: d.subject, text: d.text, html: d.html,
      ...(env("MAIL_REPLY_TO") ? { reply_to: env("MAIL_REPLY_TO") } : {}) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || `Resend ${r.status}`);
  return j.id || "";
}
async function sendWhatsApp(to, name, d) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${env("WA_PHONE_ID")}/messages`, {
    method: "POST", headers: { authorization: `Bearer ${env("WA_TOKEN")}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: {
      name: env("WA_TEMPLATE") || "aviso_clases", language: { code: env("WA_LANG") || "es" },
      components: [{ type: "body", parameters: [name, d.waDay, d.waSummary].map(t => ({ type: "text", text: String(t).replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ").slice(0, 900) })) }] } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `WhatsApp ${r.status}`);
  return j?.messages?.[0]?.id || "";
}
/** A WhatsApp template with plain text parameters (client reminders: one template per reminder and language). */
export async function sendTemplate(to, template, lang, params) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${env("WA_PHONE_ID")}/messages`, {
    method: "POST", headers: { authorization: `Bearer ${env("WA_TOKEN")}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name: template, language: { code: lang },
      components: [{ type: "body", parameters: params.map(t => ({ type: "text", text: String(t).replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ").slice(0, 900) })) }] } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `WhatsApp ${r.status}`);
  return j?.messages?.[0]?.id || "";
}
export async function deliver(item, { test = false } = {}) {
  const d = test ? { ...item.digest, subject: "[PRUEBA] " + item.digest.subject } : item.digest;
  if (item.channel === "Email") return sendEmail(item.to, d);
  return sendWhatsApp(item.to, item.prof.name, d);
}

/* ---------- log (also the guard against double sending) ---------- */
export async function logWrite(item, kind, date, status, detail) {
  await at(encodeURIComponent(T.log), { method: "POST", body: { typecast: true, records: [{ fields: {
    "Clave": item.key, "Profesor": item.prof.name, "Fecha de clases": date, "Tipo": kind, "Canal": item.channel,
    "Estado": status, "Detalle": String(detail || "").slice(0, 500), "Enviado el": new Date().toISOString() } }] } });
}
async function logFor(date, kind) {
  const recs = await listAll(encodeURIComponent(T.log), { filterByFormula: `FIND('${date}|${kind}|', {Clave})=1` }, { byName: true });
  // "Simulado" (dry run) only blocks a new dry-run line; it never stops the real sending once NOTIFY_DRYRUN is switched off
  const sent = new Set(recs.filter(r => r.fields["Estado"] === "Enviado").map(r => r.fields["Clave"]));
  const simulated = new Set(recs.filter(r => r.fields["Estado"] === "Simulado").map(r => r.fields["Clave"]));
  const errors = {}; recs.filter(r => r.fields["Estado"] === "Error").forEach(r => errors[r.fields["Clave"]] = (errors[r.fields["Clave"]] || 0) + 1);
  return { sent, simulated, errors };
}
/** Client reminders logged in the last days: [{ kind, date, resId, status }] (key = date|kind|resId|channel) */
export async function recentClientLog(today) {
  const recs = await listAll(encodeURIComponent(T.log), { filterByFormula: `AND(IS_AFTER({Enviado el}, '${addDays(today, -12)}'), FIND('|c', {Clave}))` }, { byName: true });
  return recs.map(r => { const [date, kind, resId] = String(r.fields["Clave"] || "").split("|"); return { date, kind, resId, status: r.fields["Estado"] || "" }; })
    .filter(l => ["c7", "c2", "c2h"].includes(l.kind));
}
export const clientIO = { logFor, logWrite, sendEmail, sendTemplate, recentClientLog };
export async function recentLog(n = 30) {
  const recs = await listAll(encodeURIComponent(T.log), { "sort[0][field]": "Enviado el", "sort[0][direction]": "desc", maxRecords: String(n) }, { byName: true });
  return recs.slice(0, n).map(r => ({ who: r.fields["Profesor"] || "", date: r.fields["Fecha de clases"] || "", kind: r.fields["Tipo"] || "",
    channel: r.fields["Canal"] || "", status: r.fields["Estado"] || "", detail: r.fields["Detalle"] || "", at: r.fields["Enviado el"] || "" }));
}

/* ---------- the scheduled run (every 15 minutes) ---------- */
const inWindow = (hm, from, untilMin) => toMin(hm) >= toMin(from) && toMin(hm) <= toMin(from) + untilMin;
export async function runDue({ today = madridToday(), hm = madridHM(), nowMs = Date.now() } = {}) {
  const S = setupState();
  if (!S.on) return { skipped: "NOTIFY_ON no está en 1: no se envía nada." };
  const kinds = [];
  if (inWindow(hm, S.night, 210)) kinds.push({ kind: "night", date: addDays(today, 1) });       // from 20:00 until 23:30
  if (inWindow(hm, S.morning, 150)) kinds.push({ kind: "morning", date: today });               // from 07:30 until 10:00
  const out = { ran: [], result: [] };
  if (kinds.length) {
    const people = await recipients();
    for (const { kind, date } of kinds) {
      const log = await logFor(date, kind);                // if this fails, nothing is sent (see handler)
      const p = await plan(kind, date, people);
      for (const item of p.out) {
        if (log.sent.has(item.key)) continue;
        if (S.dryRun && log.simulated.has(item.key)) continue;
        if ((log.errors[item.key] || 0) >= 3) continue;    // gave up after 3 failed attempts
        if (item.channel === "Email" && !S.emailReady) { out.result.push({ key: item.key, status: "Saltado: email sin configurar" }); continue; }
        if (item.channel === "WhatsApp" && !S.whatsappReady) { out.result.push({ key: item.key, status: "Saltado: WhatsApp sin configurar" }); continue; }
        try {
          if (S.dryRun) { await logWrite(item, kind, date, "Simulado", "NOTIFY_DRYRUN"); out.result.push({ key: item.key, status: "Simulado" }); continue; }
          const id = await deliver(item);
          await logWrite(item, kind, date, "Enviado", id);
          out.result.push({ key: item.key, status: "Enviado" });
        } catch (e) {
          console.error("notify", item.key, e.message);
          try { await logWrite(item, kind, date, "Error", e.message); } catch {}
          out.result.push({ key: item.key, status: "Error: " + e.message });
        }
      }
      out.ran.push(kind);
    }
  }
  if (S.clients) {                                         // reminders to clients (7 days, 2 days, 2 hours before)
    try { const c = await runClients({ S, today, hm, io: clientIO, nowMs }); out.ran.push(...c.ran); out.result.push(...c.result); }
    catch (e) { console.error("client reminders", e.message); out.result.push({ key: "clientes", status: "Error: " + e.message }); }
  }
  if (!out.ran.length && !out.result.length) return { skipped: "Fuera de horario o nada que enviar." };
  return out;
}
