// Eth Sànglier · text of the client reminders (7 days / 2 days / 2 hours before) in ES, EN, FR and CA.
// Pure functions, no imports: the server uses them to send, and the app inlines the very same code
// for the preview and the demo, so what Laia reads is exactly what the client receives.
// KINDS: c7 (7 days before), c2 (2 days before), c2h (2 hours before)

export const KINDS = ["c7", "c2", "c2h"];
export const LANGS = ["es", "en", "fr", "ca"];
const SEARCH = {
  "baqueira 1500": "Parking Baqueira 1500, Baqueira Beret",
  "tanau": "Tanau 1700, Baqueira Beret",
  "bonaigua": "Parking Bonaigua, Baqueira Beret",
  "orri": "Parking Orri, Baqueira Beret",
};
export const isPlace = m => !!m && !/^por confirmar$/i.test(String(m).trim());
/** Google Maps search link for a meeting point (the server may replace it with an exact pin, see MAP_LINKS) */
export function mapSearch(meeting) {
  if (!isPlace(meeting)) return "";
  const m = String(meeting).toLowerCase();
  for (const [k, q] of Object.entries(SEARCH)) if (m.includes(k)) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(meeting) + ", Baqueira Beret")}`;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const COPY = {
  es: {
    loc: "es-ES", hi: n => `Hola ${n},`, sign: "El equipo de Eth Sànglier",
    row: { day: "Día", time: "Hora", what: "Clase", who: "Tu profesor", where: "Punto de encuentro", people: "Personas" },
    tbc: "Laia te confirmará el punto de encuentro muy pronto",
    btn: { map: "Cómo llegar (Google Maps)", ok: "Sí, voy", help: "No puedo venir / tengo una duda" },
    help: (n, ref, day) => `Hola Laia, soy ${n}${ref ? ` (reserva ${ref})` : ""}. Sobre mi clase del ${day}: `,
    kh: { c7: { label: "Necesito material, ¿me ayudáis a resolverlo?", msg: (n, ref, day) => `Hola Laia, soy ${n}${ref ? ` (reserva ${ref})` : ""}. Sobre mi clase del ${day}, necesito ayuda con el material: ` }, c2h: { label: "¿Necesitas algo? Díselo a Laia", msg: (n, ref, day) => `Hola Laia, soy ${n}${ref ? ` (reserva ${ref})` : ""}. Voy a mi clase de hoy (${day}): ` } },
    laiaRow: "Laia (teléfono)",
    c7: x => ({ subject: `Ya estamos preparando tu clase · ${x.day}, ${x.start}`,
      intro: `Faltan 7 días para tu clase de ${x.disc} en Baqueira y en Eth Sànglier ya lo estamos preparando todo. ${x.teacher} te espera el ${x.day} a las ${x.start}.`,
      tips: [`Si necesitas material (esquís o tabla, botas, casco, ropa), dinos qué te falta y Laia te ayuda a tenerlo listo.`, `Cualquier duda sobre el parking, el nivel o qué llevar: Laia te responde por WhatsApp.`, `Tu hora está reservada solo para ti.`],
      ask: `Nos vemos ahí para bordarlo en la montaña.` }),
    c2: x => ({ subject: `Pasado mañana te esperamos · ${x.day}, ${x.start}`,
      intro: `Todo listo para pasado mañana: ${x.teacher} tiene preparada tu clase de ${x.disc}${x.gear ? " y tu material" : ""}, y te estamos esperando.`,
      tips: [`Llega 15 minutos antes para aparcar y calentar con calma.`, `Ropa de abrigo, gafas o máscara y protección solar.`],
      ask: `Nos vemos ahí para bordarlo en la montaña.` }),
    c2h: x => ({ subject: `Hoy a las ${x.start}: te esperamos${x.place ? " en " + x.place : ""}`,
      intro: `Tu clase de ${x.disc} empieza en 2 horas, a las ${x.start}. ${x.teacher} te espera${x.place ? " en " + x.place : ""}.`,
      tips: x.place ? [`Aquí tienes el mapa para llegar sin dar vueltas.`, `Si llegas tarde, no encuentras el sitio o necesitas cualquier cosa, escribe o llama a Laia y te ayuda enseguida.`]
        : [`Laia te confirma el punto de encuentro por WhatsApp en unos minutos.`, `Si no sabes dónde ir, escríbenos por WhatsApp.`], ask: "" }),
  },
  en: {
    loc: "en-GB", hi: n => `Hi ${n},`, sign: "The Eth Sànglier team",
    row: { day: "Day", time: "Time", what: "Lesson", who: "Your instructor", where: "Meeting point", people: "People" },
    tbc: "Laia will confirm the meeting point very soon",
    btn: { map: "How to get there (Google Maps)", ok: "Yes, I'm coming", help: "I can't make it / I have a question" },
    help: (n, ref, day) => `Hi Laia, this is ${n}${ref ? ` (booking ${ref})` : ""}. About my lesson on ${day}: `,
    kh: { c7: { label: "I need some equipment, can you help me solve it?", msg: (n, ref, day) => `Hi Laia, this is ${n}${ref ? ` (booking ${ref})` : ""}. About my lesson on ${day}, I need help with equipment: ` }, c2h: { label: "Need anything? Tell Laia", msg: (n, ref, day) => `Hi Laia, this is ${n}${ref ? ` (booking ${ref})` : ""}. I'm heading to my lesson today (${day}): ` } },
    laiaRow: "Laia (phone)",
    c7: x => ({ subject: `We're getting your lesson ready · ${x.day}, ${x.start}`,
      intro: `Your ${x.disc} lesson in Baqueira is 7 days away and everything is already being prepared at Eth Sànglier. ${x.teacher} is expecting you on ${x.day} at ${x.start}.`,
      tips: [`If you need equipment (skis or board, boots, helmet, clothing), tell us what's missing and Laia will help you get it sorted.`, `Any question about parking, your level or what to bring: Laia answers on WhatsApp.`, `Your time slot is booked just for you.`],
      ask: `See you there to nail it on the mountain.` }),
    c2: x => ({ subject: `We're expecting you in two days · ${x.day}, ${x.start}`,
      intro: `Everything is ready for the day after tomorrow: ${x.teacher} has your ${x.disc} lesson${x.gear ? " and your equipment" : ""} prepared, and we're waiting for you.`,
      tips: [`Arrive 15 minutes early to park and warm up calmly.`, `Warm clothes, goggles and sun protection.`],
      ask: `See you there to nail it on the mountain.` }),
    c2h: x => ({ subject: `Today at ${x.start}: we'll be waiting${x.place ? " at " + x.place : ""}`,
      intro: `Your ${x.disc} lesson starts in 2 hours, at ${x.start}. ${x.teacher} is waiting for you${x.place ? " at " + x.place : ""}.`,
      tips: x.place ? [`Here is the map so you get there without going round in circles.`, `If you're running late, can't find the spot or need anything at all, message or call Laia and she'll help right away.`]
        : [`Laia will confirm the meeting point on WhatsApp in a few minutes.`, `If you don't know where to go, message us on WhatsApp.`], ask: "" }),
  },
  fr: {
    loc: "fr-FR", hi: n => `Bonjour ${n},`, sign: "L'équipe d'Eth Sànglier",
    row: { day: "Jour", time: "Heure", what: "Cours", who: "Votre moniteur", where: "Point de rendez-vous", people: "Personnes" },
    tbc: "Laia vous confirmera très bientôt le point de rendez-vous",
    btn: { map: "Comment venir (Google Maps)", ok: "Oui, je viens", help: "Je ne peux pas venir / une question" },
    help: (n, ref, day) => `Bonjour Laia, je suis ${n}${ref ? ` (réservation ${ref})` : ""}. À propos de mon cours du ${day} : `,
    kh: { c7: { label: "J'ai besoin de matériel, pouvez-vous m'aider ?", msg: (n, ref, day) => `Bonjour Laia, je suis ${n}${ref ? ` (réservation ${ref})` : ""}. À propos de mon cours du ${day}, j'ai besoin d'aide pour le matériel : ` }, c2h: { label: "Besoin de quelque chose ? Dites-le à Laia", msg: (n, ref, day) => `Bonjour Laia, je suis ${n}${ref ? ` (réservation ${ref})` : ""}. Je viens à mon cours d'aujourd'hui (${day}) : ` } },
    laiaRow: "Laia (téléphone)",
    c7: x => ({ subject: `Nous préparons votre cours · ${x.day}, ${x.start}`,
      intro: `Votre cours de ${x.disc} à Baqueira a lieu dans 7 jours et chez Eth Sànglier, nous préparons déjà tout. ${x.teacher} vous attend le ${x.day} à ${x.start}.`,
      tips: [`Si vous avez besoin de matériel (skis ou planche, chaussures, casque, vêtements), dites-nous ce qui vous manque et Laia vous aide à tout préparer.`, `Une question sur le parking, le niveau ou ce qu'il faut apporter : Laia vous répond sur WhatsApp.`, `Votre créneau est réservé rien que pour vous.`],
      ask: `On se retrouve là-haut pour tout donner sur la montagne.` }),
    c2: x => ({ subject: `Nous vous attendons après-demain · ${x.day}, ${x.start}`,
      intro: `Tout est prêt pour après-demain : ${x.teacher} a préparé votre cours de ${x.disc}${x.gear ? " et votre matériel" : ""}, et nous vous attendons.`,
      tips: [`Arrivez 15 minutes avant pour vous garer et vous échauffer tranquillement.`, `Vêtements chauds, lunettes ou masque et protection solaire.`],
      ask: `On se retrouve là-haut pour tout donner sur la montagne.` }),
    c2h: x => ({ subject: `Aujourd'hui à ${x.start} : nous vous attendons${x.place ? " à " + x.place : ""}`,
      intro: `Votre cours de ${x.disc} commence dans 2 heures, à ${x.start}. ${x.teacher} vous attend${x.place ? " à " + x.place : ""}.`,
      tips: x.place ? [`Voici la carte pour arriver sans tourner en rond.`, `Si vous êtes en retard, ne trouvez pas l'endroit ou avez besoin de quoi que ce soit, écrivez ou appelez Laia, elle vous aide tout de suite.`]
        : [`Laia vous confirme le point de rendez-vous sur WhatsApp dans quelques minutes.`, `Si vous ne savez pas où aller, écrivez-nous sur WhatsApp.`], ask: "" }),
  },
  ca: {
    loc: "ca-ES", hi: n => `Hola ${n},`, sign: "L'equip d'Eth Sànglier",
    row: { day: "Dia", time: "Hora", what: "Classe", who: "El teu professor", where: "Punt de trobada", people: "Persones" },
    tbc: "La Laia et confirmarà el punt de trobada molt aviat",
    btn: { map: "Com arribar-hi (Google Maps)", ok: "Sí, hi vinc", help: "No puc venir / tinc un dubte" },
    help: (n, ref, day) => `Hola Laia, soc ${n}${ref ? ` (reserva ${ref})` : ""}. Sobre la meva classe del ${day}: `,
    kh: { c7: { label: "Necessito material, em podeu ajudar a resoldre-ho?", msg: (n, ref, day) => `Hola Laia, soc ${n}${ref ? ` (reserva ${ref})` : ""}. Sobre la meva classe del ${day}, necessito ajuda amb el material: ` }, c2h: { label: "Necessites alguna cosa? Digues-ho a la Laia", msg: (n, ref, day) => `Hola Laia, soc ${n}${ref ? ` (reserva ${ref})` : ""}. Vinc a la meva classe d'avui (${day}): ` } },
    laiaRow: "Laia (telèfon)",
    c7: x => ({ subject: `Ja estem preparant la teva classe · ${x.day}, ${x.start}`,
      intro: `Falten 7 dies per a la teva classe de ${x.disc} a Baqueira i a Eth Sànglier ja ho estem preparant tot. ${x.teacher} t'espera el ${x.day} a les ${x.start}.`,
      tips: [`Si necessites material (esquís o taula, botes, casc, roba), digue'ns què et falta i la Laia t'ajuda a tenir-ho a punt.`, `Qualsevol dubte sobre el pàrquing, el nivell o què portar: la Laia et respon per WhatsApp.`, `La teva hora està reservada només per a tu.`],
      ask: `Ens veiem allà per bordar-ho a la muntanya.` }),
    c2: x => ({ subject: `Demà passat t'esperem · ${x.day}, ${x.start}`,
      intro: `Tot a punt per a demà passat: ${x.teacher} té preparada la teva classe de ${x.disc}${x.gear ? " i el teu material" : ""}, i t'estem esperant.`,
      tips: [`Arriba 15 minuts abans per aparcar i escalfar amb calma.`, `Roba d'abric, ulleres o màscara i protecció solar.`],
      ask: `Ens veiem allà per bordar-ho a la muntanya.` }),
    c2h: x => ({ subject: `Avui a les ${x.start}: t'esperem${x.place ? " a " + x.place : ""}`,
      intro: `La teva classe de ${x.disc} comença d'aquí a 2 hores, a les ${x.start}. ${x.teacher} t'espera${x.place ? " a " + x.place : ""}.`,
      tips: x.place ? [`Aquí tens el mapa per arribar-hi sense donar voltes.`, `Si arribes tard, no trobes el lloc o necessites qualsevol cosa, escriu o truca a la Laia i t'ajuda de seguida.`]
        : [`La Laia et confirma el punt de trobada per WhatsApp en uns minuts.`, `Si no saps on anar, escriu-nos per WhatsApp.`], ask: "" }),
  },
};
export const langOf = v => { const l = String((v && v.name) || v || "").toLowerCase(); return LANGS.includes(l) ? l : "es"; };
const dayText = (date, lang) => {
  const s = new Intl.DateTimeFormat(COPY[lang].loc, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
  return s.replace(",", "");
};
// "Esquí privada", "Snowboard grupo"… as the client reads it in their own language
const DISC = { ski: { es: "esquí", en: "ski", fr: "ski", ca: "esquí" }, snow: { es: "snowboard", en: "snowboard", fr: "snowboard", ca: "snowboard" }, free: { es: "freeride", en: "freeride", fr: "freeride", ca: "freeride" } };
const MOD = { priv: { es: "privada", en: "private", fr: "privé", ca: "privada" }, grp: { es: "en grupo", en: "group", fr: "en groupe", ca: "en grup" }, kid: { es: "para niños", en: "kids", fr: "enfants", ca: "per a nens" } };
export function discName(raw, lang) {
  const t = String(raw || "").toLowerCase();
  const base = /snow/.test(t) ? "snow" : /free|fuera/.test(t) ? "free" : /esqu|ski/.test(t) ? "ski" : "";
  if (!base) return String(raw || "").trim() || DISC.ski[lang];
  const mod = /priv/.test(t) ? "priv" : /grup|group/.test(t) ? "grp" : /ni[ñn]|kid|infan|enfant|nen/.test(t) ? "kid" : "";
  if (!mod) return DISC[base][lang];
  return lang === "en" ? `${MOD[mod][lang]} ${DISC[base][lang]}` : `${DISC[base][lang]} ${MOD[mod][lang]}`;
}

/**
 * One reminder, ready to send.
 * x = { kind, lang, name, date, start, end, teacher, disc, pax, meeting, gear, ref, resId, confirmed }
 * Returns { subject, text, html, wa: [4 parameters], mapUrl, confirmLink, helpLink }
 */
export function buildMessage(x, links) {
  const lang = LANGS.includes(x.lang) ? x.lang : "es", C = COPY[lang], name = String(x.name || "").trim().split(/\s+/)[0] || "";
  const day = dayText(x.date, lang), place = isPlace(x.meeting) ? x.meeting : "";
  const m = C[x.kind]({ day, start: x.start, disc: discName(x.disc, lang), teacher: x.teacher || "tu profesor", place, gear: !!x.gear });
  const mapUrl = place ? (links.map ? links.map(place) : mapSearch(place)) : "";
  const H = C.kh[x.kind] || { label: C.btn.help, msg: C.help };
  const helpLink = links.helpWa && x.kind !== "c2" ? `https://wa.me/${links.helpWa}?text=${encodeURIComponent(H.msg(name, x.ref, day))}` : "";
  const rows = [[C.row.day, day], [C.row.time, `${x.start}${x.end ? "–" + x.end : ""}`], [C.row.what, discName(x.disc, lang)[0].toUpperCase() + discName(x.disc, lang).slice(1) + (x.pax > 1 ? ` · ${C.row.people.toLowerCase()}: ${x.pax}` : "")],
    [C.row.who, x.teacher || ""], [C.row.where, place || C.tbc], ...(x.kind === "c2h" && links.helpWa ? [[C.laiaRow, "+" + links.helpWa]] : [])].filter(r => r[1]);
  const text = [C.hi(name), "", m.intro, "", ...rows.map(r => `${r[0]}: ${r[1]}`), ...(mapUrl ? ["", `${C.btn.map}: ${mapUrl}`] : []), "",
    ...m.tips.map(t => "• " + t), ...(m.ask ? ["", m.ask] : []),
    ...(helpLink ? ["", `${H.label}: ${helpLink}`] : []), "", C.sign].join("\n");
  const btn = (href, label, bg) => `<a href="${esc(href)}" style="display:inline-block;background:${bg};color:#fff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:bold;margin:0 8px 8px 0">${esc(label)}</a>`;
  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;background:#F3F5FA;font-family:Arial,Helvetica,sans-serif;color:#1B2440">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden" cellpadding="0" cellspacing="0">
<tr><td style="background:#27396D;color:#fff;padding:16px 18px;font-size:18px;font-weight:bold">Eth Sànglier</td></tr>
<tr><td style="padding:18px 18px 6px;font-size:16px;line-height:1.5">${esc(C.hi(name))}<br><br>${esc(m.intro)}</td></tr>
<tr><td style="padding:6px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E3E7F0;border-radius:8px">${rows.map(r => `<tr><td style="padding:9px 12px;border-top:1px solid #E3E7F0;font-size:14px;color:#5A6482;width:38%">${esc(r[0])}</td><td style="padding:9px 12px;border-top:1px solid #E3E7F0;font-size:16px;font-weight:bold">${esc(r[1])}</td></tr>`).join("")}</table></td></tr>
<tr><td style="padding:12px 18px 0">${mapUrl ? btn(mapUrl, C.btn.map, "#27396D") : ""}${helpLink && x.kind !== "c2" ? btn(helpLink, H.label, "#B3202B") : ""}</td></tr>
<tr><td style="padding:6px 18px 0;font-size:15px;line-height:1.5"><ul style="margin:0;padding-left:20px">${m.tips.map(t => `<li style="margin:0 0 6px">${esc(t)}</li>`).join("")}</ul></td></tr>
${m.ask ? `<tr><td style="padding:14px 18px 0;font-size:16px;font-weight:bold;line-height:1.5">${esc(m.ask)}</td></tr>` : ""}
<tr><td style="padding:12px 18px 0;font-size:14px"></td></tr>
<tr><td style="padding:16px 18px 20px;font-size:15px;color:#5A6482">${esc(C.sign)}</td></tr>
</table></td></tr></table></body></html>`;
  // WhatsApp template parameters: {{1}} name  {{2}} "day, start"  {{3}} meeting point  {{4}} map link (no line breaks allowed)
  return { subject: m.subject, text, html, mapUrl, helpLink, lang,
    wa: [name || "👋", `${day} ${x.start}`, place || C.tbc, mapUrl || (helpLink || "https://ethsanglierskischool.com")] };
}
