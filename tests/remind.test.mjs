// node --test tests/*.test.mjs  ·  client reminders: when they go out and what they say (no network)
import test from "node:test";
import assert from "node:assert/strict";
process.env.LAIA_WHATSAPP = "34600111222"; process.env.STAFF_SECRET = "x";
const { dueNow, clientMessage, skipReason, clientKinds } = await import("../netlify/lib/staff-remind.mjs");

const by = {
  recWEEK: [{ date: "2026-12-27", start: "10:00", end: "12:00", teacher: "Kike" }],
  recTOMORROW: [{ date: "2026-12-21", start: "09:00", end: "11:00", teacher: "Jasone" }, { date: "2026-12-22", start: "09:00", end: "11:00", teacher: "Jasone" }],
  recTODAY: [{ date: "2026-12-20", start: "12:00", end: "13:00", teacher: "Kike" }],
};
const kinds = (today, hm, opt) => dueNow(by, today, hm, "10:00", opt).map(d => `${d.kind}:${d.resId}`).sort();

test("default: 7 days before from 10:00, the evening before from 19:00, nothing 2 h before", () => {
  assert.equal(clientKinds().join(), "c7,c1");
  assert.deepEqual(kinds("2026-12-20", "09:45"), []);
  assert.deepEqual(kinds("2026-12-20", "10:15"), ["c7:recWEEK"]);
  assert.deepEqual(kinds("2026-12-20", "18:45"), ["c7:recWEEK"], "the 7-day one can still catch up until 19:00 (the log stops repeats)");
  assert.deepEqual(kinds("2026-12-20", "19:30"), ["c1:recTOMORROW"]);
  assert.deepEqual(kinds("2026-12-20", "22:30"), ["c1:recTOMORROW"]);
  assert.deepEqual(kinds("2026-12-20", "23:00"), []);
  assert.deepEqual(kinds("2026-12-21", "19:30"), [], "only before the FIRST class day");
});

test("the 2-hours-before one only runs when switched on", () => {
  assert.deepEqual(kinds("2026-12-20", "10:30", { kinds: ["c7", "c1", "c2h"] }), ["c2h:recTODAY", "c7:recWEEK"]);
});

test("someone who just booked still gets the evening-before directions, but not the 7-day one", () => {
  const b = { state: "Señal pagada", created: new Date().toISOString() };
  assert.match(skipReason({ kind: "c7" }, b, Date.now()), /12 h/);
  assert.equal(skipReason({ kind: "c1" }, b, Date.now()), null);
  assert.match(skipReason({ kind: "c1" }, { ...b, state: "Pendiente de señal" }, Date.now()), /Estado/);
});

const points = [{ name: "Baqueira 1800", map: "https://maps.app.goo.gl/EXACT", notes: { es: "Aparca en el parking cubierto\nEspera junto a la taquilla", en: "Park in the covered car park", fr: "", ca: "" } }];
const base = { name: "Marta Soler", date: "2026-12-21", start: "09:00", end: "11:00", teacher: "Jasone", disc: "Esquí privada", pax: 2, meeting: "Baqueira 1800", ref: "ES-1", resId: "recX" };

test("week before: 'we are waiting for you' + button to tell Laia what they need, in every language", () => {
  for (const lang of ["es", "en", "fr", "ca"]) {
    const m = clientMessage({ ...base, kind: "c7", lang }, points);
    assert.match(m.helpLink, /^https:\/\/wa\.me\/34600111222\?text=/, lang);
    assert.ok(m.html.includes(m.helpLink.replace(/&/g, "&amp;")), lang + " button in email");
    assert.ok(!m.text.includes("undefined") && !m.html.includes("undefined"), lang);
  }
  const es = clientMessage({ ...base, kind: "c7", lang: "es" }, points);
  assert.match(es.subject, /Te esperamos/); assert.match(es.text, /¿Necesitas algo para la clase\?/);
  assert.match(decodeURIComponent(es.helpLink), /soy Marta \(reserva ES-1\).*necesitaría/);
  assert.equal(es.wa[3], es.helpLink, "WhatsApp template gets the 'tell Laia' link");
});

test("evening before: exact map, the directions of that meeting point, Laia's phone", () => {
  const es = clientMessage({ ...base, kind: "c1", lang: "es" }, points);
  assert.match(es.subject, /^Mañana a las 09:00: cómo llegar a Baqueira 1800/);
  assert.equal(es.mapUrl, "https://maps.app.goo.gl/EXACT");
  assert.match(es.text, /• Aparca en el parking cubierto\n• Espera junto a la taquilla\n• Llega 15 minutos antes/);
  assert.match(es.text, /Laia \(teléfono\): \+34600111222/);
  assert.equal(es.wa[3], es.mapUrl);
  const fr = clientMessage({ ...base, kind: "c1", lang: "fr" }, points);
  assert.match(fr.text, /Aparca en el parking cubierto/, "missing language falls back to Spanish");
  const en = clientMessage({ ...base, kind: "c1", lang: "en" }, points);
  assert.match(en.text, /Park in the covered car park/); assert.ok(!/Aparca/.test(en.text));
});

test("evening before without a known meeting point says Laia will confirm it", () => {
  const m = clientMessage({ ...base, kind: "c1", lang: "es", meeting: "Por confirmar" }, points);
  assert.equal(m.mapUrl, ""); assert.match(m.text, /Laia te confirmará el punto de encuentro/);
  const other = clientMessage({ ...base, kind: "c1", lang: "es", meeting: "Tanau 1700" }, points);
  assert.match(other.mapUrl, /google\.com\/maps\/search/, "point not in the table: Google Maps search");
});
