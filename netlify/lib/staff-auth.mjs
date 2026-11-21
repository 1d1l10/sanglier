// Eth Sànglier · login security for the staff app.
//
// The PIN stays 4 digits (it is typed with ski gloves on). What makes it safe is the server around it:
//   1. PINs are stored in Airtable as a keyed hash ("h1:…"), never as the digits themselves.
//      The key is PIN_PEPPER (falls back to STAFF_SECRET). Without that key the hashes are useless.
//      Old plain PINs keep working and are converted to a hash the first time they are used.
//   2. Wrong PINs are counted in the Airtable table "Accesos", so the limit holds across every server
//      instance: 5 wrong tries from one connection = 15 minutes locked; 30 wrong tries in an hour from
//      anywhere = the PIN screen locks for 20 minutes and the administrators get an alert.
//   3. So that Administración can still look PINs up (people forget them), each PIN also has an encrypted copy
//      in Profesores ▸ "PIN cifrado" (AES-256-GCM, key derived from PIN_PEPPER). Airtable alone reveals nothing.
//   4. Every login token carries a fingerprint of the PIN it was issued for: changing someone's PIN
//      signs that person out on every phone at once.
import crypto from "node:crypto";
import { env, at, listAll } from "./staff-core.mjs";

/* ---------------- PIN hashing ---------------- */
const pepper = () => env("PIN_PEPPER") || env("STAFF_SECRET");
const hmac = (key, s) => crypto.createHmac("sha256", key).update(s).digest("base64url");

export const hashPin = pin => "h1:" + hmac(pepper(), "pin|" + String(pin)).slice(0, 32);
export const isHashed = v => /^h1:/.test(String(v || ""));
/** The stored value as a hash, whether it is already hashed or still a plain legacy PIN. */
export const normPin = stored => !stored ? "" : isHashed(stored) ? String(stored) : hashPin(String(stored).trim());
/** Short fingerprint put inside the login token. Same before and after a legacy PIN is converted. */
export const pinVersion = stored => crypto.createHash("sha256").update(normPin(stored)).digest("base64url").slice(0, 12);
export const samePin = (stored, pin) => !!stored && normPin(stored) === hashPin(pin);

/* ---------------- encrypted copy, readable only by the server (for the admin's PIN list) ---------------- */
const sealKey = () => Buffer.from(crypto.hkdfSync("sha256", String(pepper()), "eth-sanglier", "pin-view", 32));
export function sealPin(pin) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", sealKey(), iv);
  const ct = Buffer.concat([c.update(String(pin)), c.final()]);
  return "v1:" + Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64url");
}
/** The PIN in clear, or "" if missing, tampered with, or sealed with another key. */
export function openPin(v) {
  try {
    if (!/^v1:/.test(String(v || ""))) return "";
    const b = Buffer.from(String(v).slice(3), "base64url"), iv = b.subarray(0, 12), tag = b.subarray(b.length - 16);
    const d = crypto.createDecipheriv("aes-256-gcm", sealKey(), iv); d.setAuthTag(tag);
    const pin = Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]).toString();
    return /^\d{4}$/.test(pin) ? pin : "";
  } catch { return ""; }
}

/* ---------------- wrong-PIN limits ---------------- */
const TABLE = "Accesos";
const RULES = {
  ip: { max: 5, windowMs: 15 * 60e3, blockMs: 15 * 60e3 },
  global: { max: 30, windowMs: 60 * 60e3, blockMs: 20 * 60e3 },
};
const ipKey = ip => "ip:" + hmac(env("STAFF_SECRET") || "x", "ip|" + ip).slice(0, 16);   // no raw IPs stored
const MEM = new Map();   // used only if the Airtable table is missing or unreachable
let warned = false;

async function readState(keys) {
  try {
    const recs = await listAll(TABLE, { filterByFormula: `OR(${keys.map(k => `{Clave}='${k}'`).join(",")})` }, { byName: true });
    const out = {};
    for (const r of recs) out[r.fields["Clave"]] = { fails: Number(r.fields["Fallos"]) || 0, since: Number(r.fields["Desde"]) || 0, until: Number(r.fields["Bloqueado hasta"]) || 0 };
    return { store: "airtable", out };
  } catch (e) {
    if (!warned) { console.error(`login limits: table "${TABLE}" not usable, falling back to memory:`, e.message); warned = true; }
    const out = {}; for (const k of keys) if (MEM.has(k)) out[k] = MEM.get(k);
    return { store: "memory", out };
  }
}
async function writeState(store, entries) {
  if (store === "memory") { for (const [k, v] of entries) MEM.set(k, v); return; }
  try {
    await at(TABLE, { method: "PATCH", body: { performUpsert: { fieldsToMergeOn: ["Clave"] }, records: entries.map(([k, v]) => ({ fields: {
      "Clave": k, "Fallos": v.fails, "Desde": v.since, "Bloqueado hasta": v.until, "Último intento": new Date().toISOString() } })) } });
  } catch (e) { console.error("login limits: write failed", e.message); for (const [k, v] of entries) MEM.set(k, v); }
}

/** Is this connection (or the whole PIN screen) locked right now? -> { blocked, minutes, scope } */
export async function loginGate(ip, now = Date.now()) {
  const k = ipKey(ip), { out } = await readState([k, "global"]);
  for (const [key, scope] of [[k, "ip"], ["global", "global"]]) {
    const s = out[key];
    if (s && s.until > now) return { blocked: true, scope, minutes: Math.max(1, Math.ceil((s.until - now) / 60e3)) };
  }
  return { blocked: false };
}

/** Count one wrong PIN. Returns { globalLocked: true } the moment the whole screen gets locked (to alert admins). */
export async function loginFailed(ip, now = Date.now()) {
  const k = ipKey(ip), { store, out } = await readState([k, "global"]);
  let globalLocked = false;
  const next = [[k, "ip"], ["global", "global"]].map(([key, rule]) => {
    const R = RULES[rule], s = out[key];
    let v = !s || now - s.since > R.windowMs ? { fails: 1, since: now, until: s?.until || 0 } : { ...s, fails: s.fails + 1 };
    if (v.fails >= R.max) { v = { fails: 0, since: now, until: now + R.blockMs }; if (rule === "global") globalLocked = true; }
    return [key, v];
  });
  await writeState(store, next);
  return { globalLocked };
}

/** A correct PIN clears the counter of that connection (not the global one). */
export async function loginOk(ip) {
  const k = ipKey(ip), { store, out } = await readState([k]);
  if (out[k] && (out[k].fails || out[k].until)) await writeState(store, [[k, { fails: 0, since: 0, until: 0 }]]);
}
