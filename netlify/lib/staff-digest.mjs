// Eth Sànglier · message builder for the class notices (night before / morning).
// Pure functions, no imports: the server uses them to send, and the app inlines the very same
// code for the "Avisos" preview, so what Laia sees is exactly what the teacher receives.

export const APP_URL = "https://ethsanglierskischool.com/staff";

export function dayLabel(date) {
  const s = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(date + "T12:00:00Z"));
  return s.replace(",", "");
}
const first = s => String(s || "").trim().split(/\s+/)[0] || "";
const hoursTxt = h => `${String(Math.round(h * 10) / 10).replace(".", ",")} h`;
export const money = x => `${Number.isInteger(x) ? x : x.toFixed(2).replace(".", ",")} €`;
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function classLine(r) {
  const b = r.booking || {};
  return [
    `${r.start}–${r.end}`, b.discipline, b.levelIn ? `pista ${String(b.levelIn).toLowerCase()}` : "",
    b.pax ? plural(+b.pax, "persona", "personas") : "", first(b.client), b.language && b.language !== "Español" ? b.language : "",
    b.meeting && b.meeting !== "Por confirmar" ? `punto: ${b.meeting}` : "",
    b.pending > 0 ? `cobrar en pista ${money(b.pending)}` : "",
  ].filter(Boolean).join(" · ");
}
const waLine = r => { const b = r.booking || {}; return `${r.start}-${r.end} ${[b.discipline, first(b.client)].filter(Boolean).join(" ")}`.trim(); };

function frame(title, intro, lines, name) {
  const rows = lines.map(l => `<tr><td style="padding:10px 14px;border-top:1px solid #E3E7F0;font-size:16px;line-height:1.4">${esc(l)}</td></tr>`).join("");
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F3F5FA;font-family:Arial,Helvetica,sans-serif;color:#1B2440">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden" cellpadding="0" cellspacing="0">
<tr><td style="background:#27396D;color:#fff;padding:16px 18px;font-size:18px;font-weight:bold">Eth Sànglier · ${esc(title)}</td></tr>
<tr><td style="padding:18px 18px 8px;font-size:16px">Hola ${esc(name)},<br>${esc(intro)}</td></tr>
<tr><td style="padding:0 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
<tr><td style="padding:18px"><a href="${APP_URL}" style="display:inline-block;background:#27396D;color:#fff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:bold">Abrir la app</a></td></tr>
</table></td></tr></table></body></html>`;
}

/** One teacher's notice. kind = "night" (classes of tomorrow) | "morning" (classes of today). */
export function digestFor({ name, rows, date, kind }) {
  const cls = rows.filter(r => !r.block && r.teacher === name && r.date === date).sort((a, b) => a.start.localeCompare(b.start));
  if (!cls.length) return { count: 0, hours: 0 };
  const hours = cls.reduce((a, r) => a + (r.hours || 0), 0), n = cls.length, day = dayLabel(date);
  const when = kind === "night" ? "mañana" : "hoy";
  const lines = cls.map(classLine);
  const subject = `${kind === "night" ? "Mañana" : "Hoy"}: ${plural(n, "clase", "clases")} (${hoursTxt(hours)}) · empiezas a las ${cls[0].start}`;
  const intro = `${when === "mañana" ? "Mañana" : "Hoy"}, ${day}, tienes ${plural(n, "clase", "clases")}:`;
  return {
    count: n, hours, subject, when, day,
    text: `Hola ${name},\n\n${intro}\n\n${lines.map(l => "• " + l).join("\n")}\n\nDetalle y cierre de clases: ${APP_URL}\n\nEth Sànglier`,
    html: frame(`${when === "mañana" ? "Mañana" : "Hoy"} · ${plural(n, "clase", "clases")}`, intro, lines, name),
    waDay: `${when} ${day}`, waSummary: cls.map(waLine).join(" | "),
  };
}

/** The list of the shared profiles (Sanglier, Jabata) for whoever assigns them (Laia). */
export function rosterFor({ shared, rows, date, kind }) {
  const per = shared.map(name => ({ name, cls: rows.filter(r => !r.block && r.teacher === name && r.date === date).sort((a, b) => a.start.localeCompare(b.start)) }))
    .filter(p => p.cls.length);
  if (!per.length) return { count: 0 };
  const n = per.reduce((a, p) => a + p.cls.length, 0), day = dayLabel(date), when = kind === "night" ? "mañana" : "hoy";
  const lines = per.flatMap(p => p.cls.map(r => `${p.name} · ${classLine(r)}`));
  const intro = `Reparto de ${when} (${day}) para ${shared.join(" y ")}:`;
  return {
    count: n, subject: `Reparto de ${when}: ${plural(n, "clase", "clases")} para ${per.map(p => p.name).join(" y ")}`, when, day,
    text: (name) => `Hola ${name},\n\n${intro}\n\n${lines.map(l => "• " + l).join("\n")}\n\nEth Sànglier`,
    html: (name) => frame(`Reparto de ${when}`, intro, lines, name),
    waDay: `${when} ${day} (reparto ${shared.join(" y ")})`,
    waSummary: per.map(p => `${p.name}: ${p.cls.map(waLine).join(", ")}`).join(" | "),
  };
}

/** Normalises a phone number to digits with country code (Spanish numbers get 34). null if it can't be right. */
export function waNumber(p) {
  let d = String(p || "").replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  d = d.replace(/\D/g, "");
  if (d.length === 9 && /^[67]/.test(d)) d = "34" + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}
export const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || "").trim());
