// node --test tests/*.test.mjs  ·  new bookings: one row per day, each with its own start and hours
import test from "node:test";
import assert from "node:assert/strict";
const { parseSlots, describe } = await import("../netlify/lib/staff-classes.mjs");
const later = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const [d1, d2, d3] = [later(10), later(11), later(13)];

test("three days, each with its own start and hours, sorted by date", () => {
  const s = parseSlots({ slots: [{ date: d3, start: "09:00", hours: 3 }, { date: d1, start: "10:00", hours: 2 }, { date: d2, start: "13:30", hours: 1.5 }] });
  assert.deepEqual(s.map(x => `${x.date} ${x.start}-${x.end}`), [`${d1} 10:00-12:00`, `${d2} 13:30-15:00`, `${d3} 09:00-12:00`]);
  const d = describe(s.map(x => ({ ...x, teacher: "Kike" })));
  assert.equal(d.hours, 6.5);
  assert.match(d.days, /\(2h\).*\(1,5h\).*\(3h\)/, "different hours per day are written in Días");
  assert.equal(d.schedule.split("\n").length, 3, "different times: one Horario line per day");
});

test("the old form (same time on consecutive days) still works", () => {
  const s = parseSlots({ date: d1, start: "10:00", hours: 2, days: 3 });
  assert.equal(s.length, 3); assert.equal(s[2].date, later(12)); assert.ok(s.every(x => x.end === "12:00"));
});

test("wrong input is refused with a clear message", () => {
  const bad = (slots, rx) => assert.throws(() => parseSlots({ slots }), rx);
  bad([], /al menos un día/);
  bad([{ date: d1, start: "10:00", hours: 2 }, { date: d1, start: "14:00", hours: 1 }], /dos veces/);
  bad([{ date: d1, start: "17:00", hours: 2 }], /entre las 08:00 y las 18:00/);
  bad([{ date: d1, start: "10:00", hours: 9 }], /duración/);
  bad([{ date: "2020-01-01", start: "10:00", hours: 2 }], /ya ha pasado/);
  bad(Array.from({ length: 15 }, (_, i) => ({ date: later(20 + i), start: "10:00", hours: 1 })), /14 días/);
});
