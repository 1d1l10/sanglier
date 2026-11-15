// Eth Sànglier · staff app API (Netlify Function, v2)
// Reads and writes the Airtable base the website already uses.
// Env vars: AIRTABLE_TOKEN, AIRTABLE_BASE_ID (already set for the website)
//           STAFF_SECRET   (new: any long random string, signs the login token)
//           LAIA_WHATSAPP  (new, optional: Laia's number with country code, e.g. 34600123456)
import crypto from "node:crypto";

export const config = { path: ["/api/staff", "/api/staff/*"] };

import { T, F, TO_CONFIRM, PAID, LOST, LEVELS, ADMIN, OCC, q, toMin, isHM, isDate, addDays, madridToday, madridHM, monthEnd, sel, firstName,
  env, at, listAll, rowsFor, getRow } from "../lib/staff-core.mjs";
import { setupState, plan, deliver, recentLog, recipients, logWrite, sendEmail, clientIO, alertAdmins } from "../lib/staff-notify.mjs";
import { hashPin, isHashed, normPin, pinVersion, samePin, loginGate, loginFailed, loginOk } from "../lib/staff-auth.mjs";
import { pushReady, cleanSubscription, addSub, removeSub, readSubs, pushTo } from "../lib/staff-push.mjs";
import { upcoming, sampleMessages, confirmAttendance, langOf } from "../lib/staff-remind.mjs";
import { waNumber, validEmail } from "../lib/staff-digest.mjs";
import { Refused, createClass, extendClass, addDays_ as addBookingDays, recentChanges } from "../lib/staff-classes.mjs";
import { parseAmount, checkCash, applyCash, cashLedger, handover, moneyPanel } from "../lib/staff-cash.mjs";

/* ---------------- helpers ---------------- */
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const err = (status, message) => json({ error: message }, status);

/* ---------------- auth ---------------- */
const b64u = b => Buffer.from(b).toString("base64url");
function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac("sha256", env("STAFF_SECRET")).update(body).digest("base64url");
  return `${body}.${mac}`;
}
function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const good = crypto.createHmac("sha256", env("STAFF_SECRET")).update(body).digest("base64url");
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  let p; try { p = JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
  return p && p.exp > Date.now() ? p : null;
}
/* ---------------- handler ---------------- */
export default async (req, context) => {
  try {
    if (!env("AIRTABLE_TOKEN") || !env("AIRTABLE_BASE_ID") || !env("STAFF_SECRET"))
      return err(500, "Falta configurar AIRTABLE_TOKEN, AIRTABLE_BASE_ID o STAFF_SECRET en Netlify.");
    const url = new URL(req.url);
    const parts = url.pathname.replace(/^\/api\/staff\/?/, "").split("/").filter(Boolean);
    const [route, id] = parts;
    const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "x";

    /* the "I'm coming" button in the client reminders: public, protected by a signed link */
    if (route === "confirm" && req.method === "GET") return confirmAttendance(url.searchParams.get("r"), url.searchParams.get("s"), url.searchParams.get("l"));

    /* login: 4-digit PIN (gloves), protected by server-side limits, see lib/staff-auth.mjs */
    if (route === "login" && req.method === "POST") {
      const gate = await loginGate(ip);
      if (gate.blocked) return err(429, gate.scope === "global"
        ? `Acceso bloqueado ${gate.minutes} min por seguridad (demasiados PIN incorrectos). Si no eras tú, avisa a Laia.`
        : `Demasiados intentos. Espera ${gate.minutes} min.`);
      const { pin } = await req.json().catch(() => ({}));
      const wrong = async () => {
        const r = await loginFailed(ip);
        if (r.globalLocked) await alertAdmins("Alerta de acceso", "Muchos PIN incorrectos en la app del equipo. La entrada queda bloqueada 20 minutos.");
        return err(401, "PIN incorrecto.");
      };
      if (!/^\d{4}$/.test(String(pin || ""))) return wrong();
      const h = hashPin(pin);
      const recs = await listAll(T.prof, { filterByFormula: `AND(OR({PIN}='${h}', {PIN}='${pin}'), {Activo})`, maxRecords: "2" });
      if (recs.length !== 1) return wrong();
      await loginOk(ip);
      const f = recs[0].fields, role = f[F.pRole]?.name || f[F.pRole] || "Instructor";
      if (!isHashed(f[F.pPin])) {                 // legacy plain PIN: store it hashed from now on
        try { await at(T.prof, { method: "PATCH", body: { records: [{ id: recs[0].id, fields: { [F.pPin]: h } }] } }); } catch (e) { console.error("pin-upgrade", e.message); }
      }
      const days = role === ADMIN ? 1 : 30;    // instructors stay signed in (gloves); office 1 day
      const me = { id: recs[0].id, name: f[F.pName], role };
      return json({
        token: sign({ ...me, pv: pinVersion(h), exp: Date.now() + days * 864e5 }),
        me: { ...me, photo: f[F.pPhoto]?.[0]?.thumbnails?.large?.url || "", teaches: (f[F.pDisc] || []).length > 0 || role !== ADMIN },
        laiaWa: (env("LAIA_WHATSAPP") || "").replace(/\D/g, ""),
      });
    }

    const tok = verify((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
    if (!tok) return err(401, "Sesión caducada. Vuelve a entrar con tu PIN.");
    // the profile is re-read on every call, so a deactivated or changed profile stops working at once
    let pr; try { pr = await at(`${T.prof}/${tok.id}`, { params: { returnFieldsByFieldId: "true" } }); } catch { pr = null; }
    if (!pr || !pr.fields[F.pActive])
      return err(401, "Tu perfil ya no está activo. Habla con Laia.");
    if (tok.pv !== pinVersion(pr.fields[F.pPin]))   // PIN changed (or a token from before this check): sign in again
      return err(401, "Tu PIN ha cambiado. Entra con el PIN nuevo.");
    const me = { id: tok.id, name: pr.fields[F.pName], role: sel(pr.fields[F.pRole]) || "Instructor" };
    const isAdmin = me.role === ADMIN, isShared = me.role === OCC;

    /* ---------- push notifications on this phone ---------- */
    if (route === "push") {
      if (req.method === "GET" && id === "key") return json({ key: pushReady() ? env("VAPID_PUBLIC_KEY") : "" });
      if (isShared) return err(403, "Los perfiles compartidos no reciben notificaciones.");
      if (!pushReady()) return err(400, "Las notificaciones todavía no están configuradas en Netlify.");
      const body = await req.json().catch(() => ({}));
      if (req.method === "POST" && id === "subscribe") {
        const sub = cleanSubscription(body.subscription);
        if (!sub) return err(400, "Este navegador no ha dado una suscripción válida.");
        const n = await addSub(me.id, sub, req.headers.get("user-agent") || "");
        return json({ ok: true, devices: n });
      }
      if (req.method === "POST" && id === "unsubscribe") {
        return json({ ok: true, devices: await removeSub(me.id, String(body.endpoint || "")) });
      }
      if (req.method === "POST" && id === "test") {
        const n = await pushTo({ id: me.id, name: me.name }, { title: "Eth Sànglier", body: `Hola ${firstName(me.name)}, las notificaciones funcionan en este móvil.`, url: "/staff/", tag: "prueba" });
        return json({ ok: true, sent: n });
      }
      if (req.method === "GET" && id === "status") return json({ devices: (await readSubs(me.id)).subs.length });
      return err(404, "Ruta no encontrada.");
    }

    /* schedule: own rows; admins may ask for one teacher or the whole team */
    if (route === "schedule" && req.method === "GET") {
      let from = url.searchParams.get("from"), to = url.searchParams.get("to");
      if (isShared) from = to = madridToday();   // shared profiles only ever see today
      if (!isDate(from) || !isDate(to) || to < from) return err(400, "Fechas no válidas.");
      if (addDays(from, 62) < to) return err(400, "Pide como máximo dos meses.");
      let names = [me.name];
      const who = url.searchParams.get("who");
      if (who && who !== me.name) {
        if (!isAdmin) return err(403, "Solo ves tus propias clases.");
        if (who === "all") {
          const team = await listAll(T.prof, { filterByFormula: "{Activo}", "fields[]": [F.pName] });
          names = team.map(r => r.fields[F.pName]).filter(Boolean);
        } else names = [who];
      }
      return json({ items: await rowsFor(names, from, to, me) });
    }

    /* team list (admin) */
    if (route === "team" && req.method === "GET") {
      if (!isAdmin) return err(403, "Solo para administración.");
      const team = await listAll(T.prof, { filterByFormula: "{Activo}", "fields[]": [F.pName, F.pRole, F.pPhoto, F.pDisc] });
      return json({ team: team.map(r => ({ name: r.fields[F.pName], role: r.fields[F.pRole]?.name || r.fields[F.pRole] || "",
        photo: r.fields[F.pPhoto]?.[0]?.thumbnails?.large?.url || "", disciplines: r.fields[F.pDisc] || [] })) });
    }

    /* block hours or a whole day */
    if (route === "block" && req.method === "POST") {
      if (isShared) return err(403, "Los perfiles compartidos no bloquean disponibilidad.");
      const { date, start = "", end = "", reason = "" } = await req.json().catch(() => ({}));
      if (!isDate(date)) return err(400, "Fecha no válida.");
      const whole = !start && !end;
      if (!whole && (!isHM(start) || !isHM(end) || toMin(end) <= toMin(start))) return err(400, "Horas no válidas.");
      const mine = await rowsFor([me.name], date, date, me);
      const clash = mine.find(r => r.wholeDay || whole || (toMin(r.start) < toMin(end) && toMin(r.end) > toMin(start)));
      if (clash) return err(409, clash.block ? "Ya tienes ese tiempo bloqueado." : `Tienes clase ${clash.start}–${clash.end}. Habla con Laia para moverla.`);
      const rec = await at(T.occ, { method: "POST", body: { typecast: true, records: [{ fields: {
        [F.oClient]: `Bloqueo: ${String(reason).slice(0, 60) || "No disponible"}`, [F.oDate]: date, [F.oProf]: me.name,
        [F.oStart]: whole ? "" : start, [F.oEnd]: whole ? "" : end } }] } });
      return json({ ok: true, id: rec.records[0].id });
    }

    /* unblock */
    if (route === "block" && req.method === "DELETE" && id) {
      const r = await getRow(id), f = r.fields;
      const owner = f[F.oProf]?.name || f[F.oProf];
      if ((f[F.oRes] || []).length || !/^Bloqueo/i.test(f[F.oClient] || "")) return err(400, "Eso es una clase, no un bloqueo.");
      if (owner !== me.name && !isAdmin) return err(403, "Solo puedes quitar tus propios bloqueos.");
      await at(`${T.occ}/${id}`, { method: "DELETE" });
      return json({ ok: true });
    }

    /* close a class */
    if (route === "close" && req.method === "POST" && id) {
      const { level, summary = "", by = "", extraMin = 0, cash } = await req.json().catch(() => ({}));
      if (!LEVELS.includes(level)) return err(400, "Elige el nivel.");
      if (String(summary).trim().length < 3) return err(400, "Marca o dicta qué habéis trabajado.");
      if (isShared && String(by).trim().length < 2) return err(400, "Escribe tu nombre.");
      const r = await getRow(id), f = r.fields, owner = f[F.oProf]?.name || f[F.oProf];
      if (!(f[F.oRes] || []).length) return err(400, "Eso es un bloqueo, no una clase.");
      if (owner !== me.name && !isAdmin) return err(403, "Esa clase no es tuya.");
      if (isShared && f[F.oDate] !== madridToday()) return err(403, "Solo puedes cerrar las clases de hoy.");
      const amount = parseAmount(cash);                // the question "¿cobraste en efectivo?" has to be answered (0 = no)
      const resId = (f[F.oRes] || [])[0];
      if (amount > 0 && f[F.oCash] > 0) return err(400, "En esta clase ya anotaste efectivo.");
      await checkCash(resId, amount);
      if (Number(extraMin) > 0) {                      // it ran over: add the time first (refused if it clashes with another class)
        if (isShared) return err(403, "Este perfil no puede alargar clases. Dile a Laia.");
        await extendClass(me, id, Number(extraMin));
      }
      await at(T.occ, { method: "PATCH", body: { records: [{ id, fields: {
        [F.oDone]: true, [F.oLevel]: level, [F.oSummary]: String(summary).slice(0, 2000),
        [F.oBy]: isShared ? `${String(by).trim().slice(0, 40)} (${me.name})` : me.name,
        [F.oAt]: new Date().toISOString(), ...(amount > 0 ? { [F.oCash]: amount } : {}) } }], typecast: true } });
      await applyCash(me, resId, amount, f[F.oClient] || "");
      return json({ ok: true });
    }

    /* ---------- profiles (Administración) ---------- */
    if (route === "profiles") {
      if (!isAdmin) return err(403, "Solo para administración.");
      const all = async () => (await listAll(T.prof, { "sort[0][field]": "Nombre" }, { byName: true })).map(r => ({
        id: r.id, name: r.fields["Nombre"] || "", pinStored: r.fields["PIN"] || "", role: sel(r.fields["Rol"]),
        active: !!r.fields["Activo"], disciplines: r.fields["Disciplinas"] || [], phone: r.fields["Teléfono"] || "",
        email: r.fields["Email"] || "", notify: r.fields["Avisos"] || [],
        photo: r.fields["Foto"]?.[0]?.thumbnails?.large?.url || "" }));
      const pub = ({ pinStored, ...x }) => ({ ...x, pin: "", hasPin: !!pinStored });   // PINs never leave the server
      if (req.method === "GET") {
        const list = await all();
        const plain = list.filter(x => x.pinStored && !isHashed(x.pinStored));   // convert any plain PIN left in Airtable
        for (let i = 0; i < plain.length; i += 10) {
          try { await at(T.prof, { method: "PATCH", body: { records: plain.slice(i, i + 10).map(x => ({ id: x.id, fields: { [F.pPin]: normPin(x.pinStored) } })) } }); }
          catch (e) { console.error("pin-migrate", e.message); }
        }
        return json({ profiles: list.map(pub) });
      }
      const body = await req.json().catch(() => ({}));
      const list = await all();
      const roles = [ADMIN, "Instructor", OCC], discs = ["Esquí", "Snowboard", "Niños", "Grupo", "Freeride"];
      const check = (p, selfId) => {
        if (p.pin !== undefined) {
          if (!/^\d{4}$/.test(p.pin)) return "El PIN tiene que tener 4 cifras.";
          const dup = list.find(x => samePin(x.pinStored, p.pin) && x.id !== selfId);
          if (dup) return `Ese PIN ya lo usa ${dup.name}.`;
        }
        if (p.role !== undefined && !roles.includes(p.role)) return "Rol no válido.";
        if (p.disciplines !== undefined && (!Array.isArray(p.disciplines) || p.disciplines.some(d => !discs.includes(d)))) return "Disciplinas no válidas.";
        if (p.email !== undefined && p.email !== "" && !validEmail(p.email)) return "Ese email no parece correcto.";
        if (p.phone !== undefined && p.phone !== "" && !waNumber(p.phone)) return "El WhatsApp tiene que llevar prefijo, por ejemplo +34 600 123 456.";
        if (p.notify !== undefined && (!Array.isArray(p.notify) || p.notify.some(n => !["Email", "WhatsApp", "Push", "Reparto"].includes(n)))) return "Avisos no válidos.";
        return "";
      };
      const fieldsOf = p => {
        const o = {};
        if (p.pin !== undefined) o[F.pPin] = hashPin(p.pin);
        if (p.role !== undefined) o[F.pRole] = p.role;
        if (p.active !== undefined) o[F.pActive] = !!p.active;
        if (p.disciplines !== undefined) o[F.pDisc] = p.disciplines;
        if (p.phone !== undefined) o[F.pPhone] = String(p.phone).trim().slice(0, 30);
        if (p.email !== undefined) o["Email"] = String(p.email).trim().slice(0, 120);
        if (p.notify !== undefined) o["Avisos"] = p.notify;
        return o;
      };
      const adminsLeft = (changedId, next) => list.filter(x => {
        const y = x.id === changedId ? { ...x, ...next } : x; return y.active && y.role === ADMIN;
      }).length;

      if (req.method === "POST") {
        const name = String(body.name || "").trim();
        if (!/^[\p{L}][\p{L} '\-]{1,29}$/u.test(name)) return err(400, "Escribe un nombre (solo letras).");
        if (list.some(x => x.name.toLowerCase() === name.toLowerCase())) return err(409, "Ya existe un perfil con ese nombre.");
        const p = { pin: String(body.pin || ""), role: body.role || "Instructor", disciplines: body.disciplines || [], active: true, phone: body.phone || "", email: body.email || "", notify: body.notify || [] };
        const bad = check(p); if (bad) return err(400, bad);
        const rec = await at(T.prof, { method: "POST", body: { typecast: true, records: [{ fields: { [F.pName]: name, ...fieldsOf(p) } }] } });
        // register the name as an option of Ocupación ▸ Profesor so Laia can pick it
        try {
          const tmp = await at(T.occ, { method: "POST", body: { typecast: true, records: [{ fields: { [F.oClient]: "TEMP (borrar)", [F.oProf]: name } }] } });
          await at(`${T.occ}/${tmp.records[0].id}`, { method: "DELETE" });
        } catch (e) { console.error("register-option", e); }
        return json({ ok: true, id: rec.records[0].id });
      }
      if (req.method === "PATCH" && id) {
        const cur = list.find(x => x.id === id); if (!cur) return err(404, "Ese perfil no existe.");
        const p = {};
        ["pin", "role", "active", "disciplines", "phone", "email", "notify"].forEach(k => { if (body[k] !== undefined) p[k] = k === "pin" ? String(body[k]) : body[k]; });
        if (p.pin === "") delete p.pin;            // empty = keep the current PIN (it is never shown)
        const bad = check(p, id); if (bad) return err(400, bad);
        if (id === me.id && (p.active === false || (p.role && p.role !== ADMIN))) return err(400, "No puedes quitarte a ti mismo el acceso de administración.");
        if (adminsLeft(id, p) < 1) return err(400, "Tiene que quedar al menos una persona de administración activa.");
        await at(T.prof, { method: "PATCH", body: { typecast: true, records: [{ id, fields: fieldsOf(p) }] } });
        return json({ ok: true });
      }
      if (req.method === "DELETE" && id) {
        if (id === me.id) return err(400, "No puedes borrar tu propio perfil.");
        if (adminsLeft(id, { active: false }) < 1) return err(400, "Tiene que quedar al menos una persona de administración activa.");
        await at(`${T.prof}/${id}`, { method: "DELETE" });
        return json({ ok: true });
      }
    }

    /* ---------- cash collected on the slope ---------- */
    if (route === "cash") {
      if (req.method === "POST" && id === "handover") {
        if (!isAdmin) return err(403, "Solo para administración.");
        const { teacher } = await req.json().catch(() => ({}));
        if (!teacher) return err(400, "Elige de quién.");
        return json({ ok: true, ...(await handover(String(teacher))) });
      }
      return err(404, "Ruta no encontrada.");
    }

    /* ---------- create classes / add time / add days ---------- */
    if (route === "classes") {
      if (isShared) return err(403, "Este perfil no crea clases. Habla con Laia.");
      if (req.method === "POST" && !id) {
        const body = await req.json().catch(() => ({}));
        const names = (await recipients()).map(p => p.name);
        return json({ ok: true, ...(await createClass(me, body, names)) });
      }
      if (req.method === "POST" && id && parts[2] === "extend") {
        const { minutes } = await req.json().catch(() => ({}));
        return json({ ok: true, ...(await extendClass(me, id, Number(minutes))) });
      }
      if (req.method === "POST" && id && parts[2] === "days") {
        const body = await req.json().catch(() => ({}));
        return json({ ok: true, ...(await addBookingDays(me, id, body)) });
      }
      return err(404, "Ruta no encontrada.");
    }

    /* ---------- notices (Administración): preview, test send, log ---------- */
    if (route === "notify") {
      if (!isAdmin) return err(403, "Solo para administración.");
      const sub = parts[1], pid = parts[2];
      if (sub === "preview" && req.method === "GET") {
        const kind = url.searchParams.get("kind") === "morning" ? "morning" : "night";
        const date = kind === "night" ? addDays(madridToday(), 1) : madridToday();
        const people = await recipients();
        const p = await plan(kind, date, people);
        const S = setupState();
        const cards = people.filter(x => x.role !== OCC).map(x => {
          const mine = p.all.filter(o => o.prof.id === x.id && o.label === "clases"), roster = p.all.filter(o => o.prof.id === x.id && o.label === "reparto");
          return { id: x.id, name: x.name, role: x.role, email: x.email, phone: x.phone, notify: x.notify, pushDevices: x.push.length,
            count: mine[0]?.digest.count || 0, rosterCount: roster[0]?.digest.count || 0,
            message: mine[0] ? { subject: mine[0].digest.subject, text: mine[0].digest.text, waDay: mine[0].digest.waDay, waSummary: mine[0].digest.waSummary } : null,
            rosterMessage: roster[0] ? { subject: roster[0].digest.subject, text: roster[0].digest.text, waDay: roster[0].digest.waDay, waSummary: roster[0].digest.waSummary } : null,
            problems: p.skipped.filter(s => s.name === x.name).map(s => s.reason) };
        });
        return json({ kind, date, setup: S, cards, sharedClasses: p.rowsCount });
      }
      if (sub === "test" && req.method === "POST" && pid) {
        const { kind = "night" } = await req.json().catch(() => ({}));
        const k = kind === "morning" ? "morning" : "night", date = k === "night" ? addDays(madridToday(), 1) : madridToday();
        const S = setupState();
        const p = await plan(k, date);
        const mine = p.out.filter(o => o.prof.id === pid);
        if (!mine.length) {
          return err(400, "No hay nada que enviar: o no tiene clases en ese día, o falta el email o el WhatsApp, o tiene los avisos desactivados.");
        }
        const sent = [];
        for (const item of mine) {
          if (item.channel === "Email" && !S.emailReady) { sent.push("Email: falta configurar el envío de email en Netlify"); continue; }
          if (item.channel === "WhatsApp" && !S.whatsappReady) { sent.push("WhatsApp: falta configurar WhatsApp en Netlify"); continue; }
          if (item.channel === "Push" && !S.pushReady) { sent.push("Notificación: falta configurar las claves VAPID en Netlify"); continue; }
          try { await deliver(item, { test: true }); sent.push(`${item.channel}: enviado a ${item.channel === "Email" ? item.to : item.channel === "Push" ? item.to : "+" + item.to}`);
            try { await logWrite({ ...item, key: item.key + "|TEST" + Date.now() }, k, date, "Enviado", "Prueba de " + me.name); } catch {}
          } catch (e) { sent.push(`${item.channel}: error (${e.message})`); }
        }
        return json({ ok: true, sent });
      }
      if (sub === "clients" && req.method === "GET" && !pid) {      // reminders to clients: what is coming, what went out, who has not confirmed
        const S = setupState(), lang = langOf(url.searchParams.get("lang"));
        const data = await upcoming({ S, today: madridToday(), hm: madridHM(), io: clientIO });
        const samples = sampleMessages({ lang, date: addDays(madridToday(), 7) }).map(m => ({ kind: m.kind, subject: m.subject, text: m.text, mapUrl: m.mapUrl }));
        return json({ setup: { on: S.on, clients: S.clients, dryRun: S.dryRun, clientAt: S.clientAt, emailReady: S.emailReady, clientWa: S.clientWa }, ...data, samples });
      }
      if (sub === "clients" && req.method === "POST" && pid === "test") {   // send one sample reminder to an address the admin types
        const { kind = "c7", lang = "es", to = "" } = await req.json().catch(() => ({}));
        if (!validEmail(to)) return err(400, "Escribe un email válido.");
        if (!setupState().emailReady) return err(400, "Falta configurar el envío de email en Netlify.");
        const m = sampleMessages({ lang: langOf(lang), name: firstName(me.name), date: addDays(madridToday(), kind === "c7" ? 7 : kind === "c2" ? 2 : 0) }).find(x => x.kind === kind);
        if (!m) return err(400, "Tipo de aviso no válido.");
        await sendEmail(to, { ...m, subject: "[PRUEBA] " + m.subject });
        return json({ ok: true, sent: `Enviado a ${to}` });
      }
      if (sub === "log" && req.method === "GET") return json({ log: await recentLog(30) });
      return err(404, "Ruta no encontrada.");
    }

    /* ---------- dashboard (Administración) ---------- */
    if (route === "dashboard" && req.method === "GET") {
      if (!isAdmin) return err(403, "Solo para administración.");
      const today = madridToday(), now = madridHM();
      const mStart = today.slice(0, 8) + "01", mEnd = monthEnd(today), ahead = addDays(today, 13);
      const to = ahead > mEnd ? ahead : mEnd;
      const profs = await listAll(T.prof, { filterByFormula: "{Activo}", "fields[]": [F.pName, F.pRole, F.pDisc] });
      const teachers = profs.filter(r => sel(r.fields[F.pRole]) === "Instructor" || (sel(r.fields[F.pRole]) === ADMIN && (r.fields[F.pDisc] || []).length))
        .map(r => r.fields[F.pName]);
      const shared = profs.filter(r => sel(r.fields[F.pRole]) === OCC).map(r => r.fields[F.pName]);
      const rows = await rowsFor([...teachers, ...shared], mStart, to, me);
      const cls = rows.filter(r => !r.block), past = r => r.date < today || (r.date === today && r.end && r.end <= now);
      const byDay = {}; for (let d = today; d <= ahead; d = addDays(d, 1)) byDay[d] = 0;
      cls.forEach(r => { if (byDay[r.date] !== undefined) byDay[r.date] += r.hours; });
      // capacity next 7 days: 8 h (09–17) per regular teacher per day, minus their blocks
      let cap = 0, booked = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(today, i);
        teachers.forEach(t => {
          const mine = rows.filter(r => r.teacher === t && r.date === d);
          if (mine.some(r => r.block && r.wholeDay)) return;
          const blockedH = mine.filter(r => r.block && isHM(r.start) && isHM(r.end)).reduce((a, r) => a + (toMin(r.end) - toMin(r.start)) / 60, 0);
          cap += Math.max(0, 8 - blockedH);
        });
        booked += cls.filter(r => r.date === d && teachers.includes(r.teacher)).reduce((a, r) => a + r.hours, 0);
      }
      const perTeacher = [...teachers, ...shared].map(t => {
        const m = cls.filter(r => r.teacher === t && r.date >= mStart && r.date <= mEnd);
        return { name: t, shared: shared.includes(t), hours: m.reduce((a, r) => a + r.hours, 0), done: m.filter(r => r.done).reduce((a, r) => a + r.hours, 0) };
      }).sort((a, b) => b.hours - a.hours);
      const open = cls.filter(r => !r.done && past(r)).map(r => ({ id: r.id, teacher: r.teacher, date: r.date, start: r.start, end: r.end, client: r.booking?.client || "" }));
      const todayCls = cls.filter(r => r.date === today);
      // bookings: last 30 days + anything still waiting
      const since = addDays(today, -30);
      const res = await listAll(T.res, {
        filterByFormula: `OR(IS_AFTER({Creada}, '${addDays(since, -1)}'), ${TO_CONFIRM.map(s => `{Estado}='${q(s)}'`).join(",")})`,
        "fields[]": [F.rRef, F.rName, F.rState, F.rCreated, F.rOrigin, F.rDisc, F.rHours, F.rWa, F.rLang],
      });
      const R = res.map(r => ({ id: r.id, ref: r.fields[F.rRef] || "", name: r.fields[F.rName] || "", state: sel(r.fields[F.rState]),
        created: (r.fields[F.rCreated] || "").slice(0, 10), origin: r.fields[F.rOrigin] || "Otro", disc: r.fields[F.rDisc] || "Otra",
        hours: r.fields[F.rHours] || 0, wa: r.fields[F.rWa] || "", lang: r.fields[F.rLang] || "" }));
      const recent = R.filter(r => r.created >= since);
      const count = (arr, k) => Object.entries(arr.reduce((o, r) => (o[r[k]] = (o[r[k]] || 0) + 1, o), {})).map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
      return json({
        today, now,
        todayStats: { classes: todayCls.length, hours: todayCls.reduce((a, r) => a + r.hours, 0), teachers: new Set(todayCls.map(r => r.teacher)).size,
          blocked: new Set(rows.filter(r => r.block && r.date === today).map(r => r.teacher)).size },
        week: { booked, capacity: cap, occupancy: cap ? Math.round(booked / cap * 100) : 0 },
        ahead: Object.entries(byDay).map(([date, hours]) => ({ date, hours })),
        month: { hours: cls.filter(r => r.date >= mStart && r.date <= mEnd).reduce((a, r) => a + r.hours, 0),
          done: cls.filter(r => r.date >= mStart && r.date <= today && r.done).reduce((a, r) => a + r.hours, 0), perTeacher },
        open: open.slice(0, 20), openCount: open.length,
        changes: await recentChanges(today).catch(() => []),
        money: await moneyPanel(rows, today).catch(e => { console.error("money", e.message); return null; }),
        bookings: {
          new7: R.filter(r => r.created >= addDays(today, -6)).length,
          paid30: recent.filter(r => PAID.includes(r.state)).length,
          lost30: recent.filter(r => LOST.includes(r.state)).length,
          toConfirm: R.filter(r => TO_CONFIRM.includes(r.state)).sort((a, b) => a.created.localeCompare(b.created))
            .slice(0, 15).map(r => ({ ref: r.ref, name: r.name, state: r.state, created: r.created, wa: r.wa, disc: r.disc })),
          toConfirmCount: R.filter(r => TO_CONFIRM.includes(r.state)).length,
          byDiscipline: count(recent, "disc"), byOrigin: count(recent, "origin"), byLanguage: count(recent.filter(r => r.lang), "lang"),
        },
      });
    }

    return err(404, "Ruta no encontrada.");
  } catch (e) {
    if (e instanceof Refused) return err(e.status, e.message);
    console.error("staff-api", e);
    return err(e.status === 422 ? 400 : 502, "No se ha podido hablar con Airtable. Prueba otra vez en un minuto.");
  }
};
