// node --test tests/   ·  the staff API against a fake Airtable (in memory), no network.
import test from "node:test";
import assert from "node:assert/strict";

process.env.AIRTABLE_TOKEN = "test"; process.env.AIRTABLE_BASE_ID = "appTEST"; process.env.STAFF_SECRET = "test-secret-123";
const ID = { Nombre: "fld4dbEx82WauW6Hh", PIN: "fldkXe7rk5pkMrxH6", Rol: "fldjkm5wlLykpVzRF", Activo: "fldH4nqOJIpyaWKIC" };
const PROF = "tbl37OfR6AJSvGzf8";
const db = {
  [PROF]: [
    { id: "recLAIA0000000001", fields: { Nombre: "Laia", PIN: "1234", Rol: "Administración", Activo: true } },
    { id: "recJASO0000000002", fields: { Nombre: "Jasone", PIN: "5678", Rol: "Instructor", Activo: true } },
    { id: "recOLD00000000003", fields: { Nombre: "Viejo", PIN: "9999", Rol: "Instructor", Activo: false } },
  ],
  Accesos: [],
};
const byId = f => Object.fromEntries(Object.entries(f).map(([k, v]) => [ID[k] || k, k === "Rol" ? { name: v } : v]));
const match = (table, formula) => {
  if (!formula) return db[table];
  if (table === PROF) {
    const pins = [...formula.matchAll(/\{PIN\}='([^']+)'/g)].map(m => m[1]);
    return db[table].filter(r => (!pins.length || pins.includes(r.fields.PIN)) && (!/\{Activo\}/.test(formula) || r.fields.Activo));
  }
  const keys = [...formula.matchAll(/\{Clave\}='([^']+)'/g)].map(m => m[1]);
  return db[table].filter(r => keys.includes(r.fields.Clave));
};
let accesosMissing = false;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url), [, , , table, rec] = u.pathname.split("/").map(decodeURIComponent);
  const ok = d => new Response(JSON.stringify(d), { status: 200 });
  if (u.hostname !== "api.airtable.com") throw new Error("unexpected network call " + url);
  if (table === "Accesos" && accesosMissing) return new Response('{"error":{"message":"not found"}}', { status: 404 });
  const method = init.method || "GET", body = init.body ? JSON.parse(init.body) : null;
  const shape = r => ({ id: r.id, fields: u.searchParams.get("returnFieldsByFieldId") ? byId(r.fields) : r.fields });
  if (method === "GET" && rec) return ok(shape(db[table].find(r => r.id === rec)));
  if (method === "GET") return ok({ records: match(table, u.searchParams.get("filterByFormula")).map(shape) });
  if (method === "PATCH") {
    for (const r of body.records) {
      const f = Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [Object.keys(ID).find(n => ID[n] === k) || k, v]));
      let row = r.id ? db[table].find(x => x.id === r.id) : db[table].find(x => x.fields.Clave === f.Clave);
      if (!row) db[table].push(row = { id: "rec" + Math.random().toString(36).slice(2, 16), fields: {} });
      Object.assign(row.fields, f);
    }
    return ok({ records: [] });
  }
  throw new Error("unhandled " + method + " " + url);
};
const { default: handler } = await import("../netlify/functions/staff.mjs");
const call = async (path, { method = "GET", body, token, ip = "1.1.1.1" } = {}) => {
  const r = await handler(new Request("https://x.test/api/staff/" + path, { method, body: body ? JSON.stringify(body) : undefined,
    headers: token ? { authorization: "Bearer " + token } : {} }), { ip });
  return { status: r.status, data: await r.json() };
};
const pinOf = name => db[PROF].find(r => r.fields.Nombre === name).fields.PIN;

test("a plain legacy PIN logs in and is stored hashed from then on", async () => {
  const r = await call("login", { method: "POST", body: { pin: "1234" } });
  assert.equal(r.status, 200); assert.equal(r.data.me.name, "Laia");
  assert.match(pinOf("Laia"), /^h1:/); assert.ok(!pinOf("Laia").includes("1234"));
  const again = await call("login", { method: "POST", body: { pin: "1234" } });   // still works once hashed
  assert.equal(again.status, 200);
  assert.equal((await call("push/key", { token: r.data.token })).status, 200);
});

test("wrong PINs, inactive profiles and junk are refused", async () => {
  for (const pin of ["0000", "9999", "12345", "12a4", "' OR 1=1"]) assert.equal((await call("login", { method: "POST", body: { pin }, ip: "9.9.9." + pin.length })).status, 401);
});

test("5 wrong PINs lock that connection for 15 minutes, even with the right PIN; others are not affected", async () => {
  for (let i = 0; i < 5; i++) assert.equal((await call("login", { method: "POST", body: { pin: "000" + i }, ip: "6.6.6.6" })).status, 401);
  const locked = await call("login", { method: "POST", body: { pin: "1234" }, ip: "6.6.6.6" });
  assert.equal(locked.status, 429); assert.match(locked.data.error, /Espera 1[45] min/);
  assert.equal((await call("login", { method: "POST", body: { pin: "1234" }, ip: "7.7.7.7" })).status, 200);
  assert.ok(db.Accesos.every(r => !/6\.6\.6\.6/.test(r.fields.Clave)), "raw IPs are not stored");
});

test("the admin never receives PINs, plain ones are converted when the list is opened", async () => {
  const { data } = await call("login", { method: "POST", body: { pin: "1234" } });
  const r = await call("profiles", { token: data.token });
  assert.equal(r.status, 200);
  assert.ok(r.data.profiles.every(p => p.pin === "" && p.hasPin === true));
  assert.ok(!JSON.stringify(r.data).includes("h1:"));
  assert.match(pinOf("Jasone"), /^h1:/);
});

test("duplicate PINs are refused against hashed values; changing a PIN signs that person out", async () => {
  const admin = (await call("login", { method: "POST", body: { pin: "1234" } })).data.token;
  const jas = (await call("login", { method: "POST", body: { pin: "5678" } })).data.token;
  assert.equal((await call("push/key", { token: jas })).status, 200);
  const dup = await call("profiles/recJASO0000000002", { method: "PATCH", token: admin, body: { pin: "1234" } });
  assert.equal(dup.status, 400); assert.match(dup.data.error, /Laia/);
  assert.equal((await call("profiles/recJASO0000000002", { method: "PATCH", token: admin, body: { pin: "" } })).status, 200);   // empty = unchanged
  assert.equal((await call("push/key", { token: jas })).status, 200);
  assert.equal((await call("profiles/recJASO0000000002", { method: "PATCH", token: admin, body: { pin: "4321" } })).status, 200);
  const old = await call("push/key", { token: jas });
  assert.equal(old.status, 401); assert.match(old.data.error, /PIN ha cambiado/);
  assert.equal((await call("login", { method: "POST", body: { pin: "4321" } })).status, 200);
});

test("tokens from before this update (no PIN fingerprint) and forged tokens are refused", async () => {
  const forged = Buffer.from(JSON.stringify({ id: "recLAIA0000000001", role: "Administración", exp: Date.now() + 1e9 })).toString("base64url") + ".abc";
  assert.equal((await call("push/key", { token: forged })).status, 401);
  assert.equal((await call("push/key", { token: "not.a.token" })).status, 401);
  assert.equal((await call("push/key", { token: "garbage" })).status, 401);
});

test("30 wrong PINs from anywhere lock the PIN screen for everyone", async () => {
  db.Accesos.length = 0;
  for (let i = 0; i < 30; i++) await call("login", { method: "POST", body: { pin: "0000" }, ip: "10.0.0." + i });
  const r = await call("login", { method: "POST", body: { pin: "1234" }, ip: "8.8.8.8" });
  assert.equal(r.status, 429); assert.match(r.data.error, /bloqueado/);
  db.Accesos.length = 0;
});

test("if the Accesos table is missing, the limit still works in memory", async () => {
  accesosMissing = true;
  for (let i = 0; i < 5; i++) await call("login", { method: "POST", body: { pin: "0000" }, ip: "5.5.5.5" });
  assert.equal((await call("login", { method: "POST", body: { pin: "1234" }, ip: "5.5.5.5" })).status, 429);
  accesosMissing = false;
});
