// node --test tests/   (no packages needed)
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const ecdhV = crypto.createECDH("prime256v1"); ecdhV.generateKeys();
const d = ecdhV.getPrivateKey();
process.env.VAPID_PUBLIC_KEY = ecdhV.getPublicKey().toString("base64url");
process.env.VAPID_PRIVATE_KEY = Buffer.concat([Buffer.alloc(32 - d.length), d]).toString("base64url");
const { encrypt, cleanSubscription, sendPush } = await import("../netlify/lib/staff-push.mjs");

// a fake phone: its own key pair + auth secret, as a browser creates them
const phone = crypto.createECDH("prime256v1"); phone.generateKeys();
const auth = crypto.randomBytes(16);
const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: phone.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } };

// decryption exactly as RFC 8291 describes it for the user agent
function decrypt(body) {
  const salt = body.subarray(0, 16), idlen = body[20], asPublic = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const hk = (s, ikm, info, n) => Buffer.from(crypto.hkdfSync("sha256", ikm, s, info, n));
  const shared = phone.computeSecret(asPublic);
  const ikm = hk(auth, shared, Buffer.concat([Buffer.from("WebPush: info\0"), phone.getPublicKey(), asPublic]), 32);
  const cek = hk(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16), nonce = hk(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const dc = crypto.createDecipheriv("aes-128-gcm", cek, nonce); dc.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([dc.update(ct.subarray(0, ct.length - 16)), dc.final()]);
  assert.equal(pt[pt.length - 1], 2, "last-record delimiter");
  return pt.subarray(0, pt.length - 1).toString();
}

test("payload encrypts so the phone can decrypt it (RFC 8291)", () => {
  const body = encrypt(sub, '{"title":"Hola ñ"}');
  assert.equal(body.readUInt32BE(16), 4096);
  assert.equal(decrypt(body), '{"title":"Hola ñ"}');
});

test("subscriptions to non-push hosts are refused (no SSRF)", () => {
  assert.ok(cleanSubscription(sub));
  assert.equal(cleanSubscription({ ...sub, endpoint: "https://evil.example.com/x" }), null);
  assert.equal(cleanSubscription({ ...sub, endpoint: "http://fcm.googleapis.com/x" }), null);
  assert.equal(cleanSubscription({ ...sub, keys: { p256dh: "AAAA", auth: sub.keys.auth } }), null);
  assert.ok(cleanSubscription({ ...sub, endpoint: "https://web.push.apple.com/QWERTY" }));
});

test("request carries a valid VAPID signature and the right headers", async () => {
  let seen;
  globalThis.fetch = async (url, init) => { seen = { url, init }; return new Response("", { status: 201 }); };
  const r = await sendPush(sub, { title: "Mañana: 2 clases", body: "09:00-11:00 Esquí Marta" });
  assert.deepEqual(r, { ok: true, gone: false });
  const h = seen.init.headers;
  assert.equal(h["content-encoding"], "aes128gcm");
  const [, jwt, k] = h.authorization.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, process.env.VAPID_PUBLIC_KEY);
  const [hd, pl, sig] = jwt.split(".");
  assert.equal(JSON.parse(Buffer.from(pl, "base64url")).aud, "https://fcm.googleapis.com");
  const pub = crypto.createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256",
    x: Buffer.from(k, "base64url").subarray(1, 33).toString("base64url"), y: Buffer.from(k, "base64url").subarray(33).toString("base64url") } });
  assert.ok(crypto.verify("sha256", Buffer.from(`${hd}.${pl}`), { key: pub, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url")));
  assert.match(decrypt(Buffer.from(seen.init.body)), /Mañana: 2 clases/);
});

test("a phone that unsubscribed is reported as gone", async () => {
  globalThis.fetch = async () => new Response("", { status: 410 });
  assert.deepEqual(await sendPush(sub, { title: "x" }), { ok: false, gone: true });
});
