// Eth Sànglier · Web Push notifications to the staff phones (no npm packages: Node's crypto only).
//
// Env vars
//   VAPID_PUBLIC_KEY   } generate once with:  node scripts/vapid-keys.mjs
//   VAPID_PRIVATE_KEY  } (never change them afterwards, or every phone has to switch notifications on again)
//   VAPID_SUBJECT      optional, "mailto:someone@ethsanglierskischool.com"
//
// Each phone that switches notifications on is saved in Profesores ▸ "Push" (long text, JSON list, max 5 devices).
// Messages are encrypted for that phone (RFC 8291, aes128gcm) and signed with the VAPID key (RFC 8292).
import crypto from "node:crypto";
import { T, env, at } from "./staff-core.mjs";

export const pushReady = () => !!(env("VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY"));
const b64u = b => Buffer.from(b).toString("base64url");
const unb64u = s => Buffer.from(String(s || ""), "base64url");

/* only the browser push services: the server never POSTs to an arbitrary address someone sends it */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/, /^android\.googleapis\.com$/];
export function cleanSubscription(s) {
  try {
    const u = new URL(s?.endpoint);
    if (u.protocol !== "https:" || !PUSH_HOSTS.some(rx => rx.test(u.hostname))) return null;
    const p256dh = unb64u(s?.keys?.p256dh), auth = unb64u(s?.keys?.auth);
    if (p256dh.length !== 65 || p256dh[0] !== 4 || auth.length < 16) return null;
    return { endpoint: u.toString(), keys: { p256dh: b64u(p256dh), auth: b64u(auth) } };
  } catch { return null; }
}
export function parseSubs(v) {
  try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a.map(x => ({ ...cleanSubscription(x), ua: x.ua || "", at: x.at || "" })).filter(x => x.endpoint) : []; }
  catch { return []; }
}

/* ---------------- VAPID (RFC 8292) ---------------- */
let keyObj;
function vapidKey() {
  if (keyObj) return keyObj;
  const pub = unb64u(env("VAPID_PUBLIC_KEY")), d = env("VAPID_PRIVATE_KEY");
  keyObj = crypto.createPrivateKey({ format: "jwk", key: { kty: "EC", crv: "P-256", d, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
  return keyObj;
}
function vapidAuth(endpoint) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env("VAPID_SUBJECT") || "mailto:avisos@ethsanglierskischool.com" }));
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key: vapidKey(), dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${env("VAPID_PUBLIC_KEY")}`;
}

/* ---------------- payload encryption (RFC 8291, aes128gcm) ---------------- */
const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, len));
export function encrypt(sub, payload, { salt = crypto.randomBytes(16), ecdh = null } = {}) {
  const uaPublic = unb64u(sub.keys.p256dh), authSecret = unb64u(sub.keys.auth);
  const as = ecdh || crypto.createECDH("prime256v1"); if (!ecdh) as.generateKeys();
  const asPublic = as.getPublicKey(), shared = as.computeSecret(uaPublic);
  const ikm = hkdf(authSecret, shared, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, ct]);
}

/** Send one notification to one phone. -> { ok, gone } (gone = the phone switched it off: forget it) */
export async function sendPush(sub, msg, { ttl = 6 * 3600, urgency = "high" } = {}) {
  const payload = JSON.stringify({ title: String(msg.title || "Eth Sànglier").slice(0, 120), body: String(msg.body || "").slice(0, 600),
    url: msg.url || "/staff/", tag: msg.tag || undefined });
  const r = await fetch(sub.endpoint, { method: "POST", body: encrypt(sub, payload), headers: {
    authorization: vapidAuth(sub.endpoint), "content-encoding": "aes128gcm", "content-type": "application/octet-stream",
    ttl: String(ttl), urgency } });
  if (r.status === 404 || r.status === 410) return { ok: false, gone: true };
  if (!r.ok) throw new Error(`Push ${r.status} ${(await r.text().catch(() => "")).slice(0, 120)}`);
  return { ok: true, gone: false };
}

/* ---------------- storage in Profesores ▸ Push ---------------- */
export async function readSubs(profId) {
  const r = await at(`${T.prof}/${profId}`);
  return { subs: parseSubs(r.fields["Push"]), notify: r.fields["Avisos"] || [] };
}
async function writeSubs(profId, subs, notify) {
  await at(T.prof, { method: "PATCH", body: { typecast: true, records: [{ id: profId, fields: {
    "Push": subs.length ? JSON.stringify(subs) : "", ...(notify ? { "Avisos": notify } : {}) } }] } });
}
export async function addSub(profId, sub, ua = "") {
  const { subs, notify } = await readSubs(profId);
  const next = [{ ...sub, ua: String(ua).slice(0, 80), at: new Date().toISOString() }, ...subs.filter(s => s.endpoint !== sub.endpoint)].slice(0, 5);
  await writeSubs(profId, next, notify.includes("Push") ? null : [...notify, "Push"]);   // switching it on means "send me notices here"
  return next.length;
}
export async function removeSub(profId, endpoint) {
  const { subs, notify } = await readSubs(profId);
  const next = subs.filter(s => s.endpoint !== endpoint);
  await writeSubs(profId, next, next.length ? null : notify.filter(n => n !== "Push"));
  return next.length;
}

/** Send to every phone of one person; forgets the phones that are gone. -> number of phones reached */
export async function pushTo(prof, msg) {
  const subs = prof.push || (await readSubs(prof.id)).subs;
  if (!subs.length) throw new Error("no tiene ningún móvil con las notificaciones activadas");
  let ok = 0; const gone = [], errors = [];
  for (const s of subs) {
    try { const r = await sendPush(s, msg); if (r.ok) ok++; if (r.gone) gone.push(s.endpoint); }
    catch (e) { errors.push(e.message); }
  }
  if (gone.length) { try { const cur = await readSubs(prof.id); await writeSubs(prof.id, cur.subs.filter(s => !gone.includes(s.endpoint)), null); } catch {} }
  if (!ok) throw new Error(gone.length ? "el móvil ya no acepta notificaciones (hay que volver a activarlas)" : errors[0] || "no se pudo enviar");
  return ok;
}
