// Eth Sànglier · text of the client reminders (7 days before / the evening before / 2 hours before) in ES, EN, FR and CA.
// Pure functions, no imports: the server uses them to send, and the app inlines the very same code
// for the preview and the demo, so what Laia reads is exactly what the client receives.
// KINDS: c7 (7 days before: "we are waiting for you, need anything?"), c1 (the evening before: how to get to the meeting point),
//        c2h (2 hours before, optional)

export const KINDS = ["c7", "c1", "c2h"];
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
    loc: "es-ES", teacherFallback: "tu profesor", hi: n => `Hola ${n},`, sign: "El equipo de Eth Sànglier",
    row: { day: "Día", time: "Hora", what: "Clase", who: "Tu profesor", where: "Punto de encuentro", people: "Personas" },
    tbc: "Laia te confirmará el punto de encuentro muy pronto",
    btn: { map: "Cómo llegar (Google Maps)", ok: "Sí, voy", help: "No puedo venir / tengo una duda" },
    help: (n, ref, day) => `Hola Laia, soy ${n}${ref ? ` (reserva ${ref})` : ""}. Sobre mi clase del ${day}: `,
    kh: { c7: { label: "¿Necesitas algo para tu clase? Cuéntanoslo", msg: (n, ref, day) => `Hola Laia, soy ${n}${ref ? ` (reserva ${ref})` : ""}. Sobre mi clase del ${day}, necesitaría: ` }, c1: { label: "¿Necesitas algo? Escribe a Laia", msg: (n, ref, day) => `Hola Laia, soy ${n}${ref ? ` (reserva ${ref})` : ""}. Sobre mi clase de mañana (${day}): ` }, c2h: { label: "¿Necesitas algo? Díselo a Laia", msg: (n, ref, day) => `Hola Laia, soy ${n}${ref ? ` (reserva ${ref})` : ""}. Voy a mi clase de hoy (${day}): ` } },
    laiaRow: "Laia (teléfono)",
    c7: x => ({ subject: `Te esperamos en Baqueira · ${x.day}, ${x.start}`,
      intro: `Falta una semana para tu clase de ${x.disc} y en Eth Sànglier ya te estamos esperando. ${x.teacher} lo tiene todo preparado para el ${x.day} a las ${x.start}.`,
      tips: [`¿Necesitas algo para la clase? Material (esquís o tabla, botas, casco), ropa, una duda sobre el nivel, el forfait o el parking… Toca el botón y cuéntaselo a Laia: lo dejamos todo listo antes de que llegues.`, `Tu hora está reservada solo para ti.`],
      ask: `Estamos aquí para lo que necesites. ¡Nos vemos en la montaña!` }),
    c1: x => ({ subject: `Mañana a las ${x.start}: cómo llegar${x.place ? " a " + x.place : ""}`,
      intro: `¡Mañana es el día! Tu clase de ${x.disc} empieza a las ${x.start}${x.place ? ` y ${x.teacher} te esperará en ${x.place}` : ""}.`,
      tips: x.place ? [...x.notes, `Llega 15 minutos antes: tendrás tiempo de aparcar, ponerte las botas y llegar sin prisas.`, `Toca «Cómo llegar» para ver el punto exacto en el mapa. Busca a ${x.teacher}: te estará esperando allí.`, `Trae ropa de abrigo, guantes, gafas o máscara y protección solar.`, `Si te retrasas o no encuentras el sitio, escribe o llama a Laia y te ayuda al momento.`]
        : [`Laia te confirmará el punto de encuentro por WhatsApp a primera hora.`, `Llega 15 minutos antes y trae ropa de abrigo, guantes, gafas o máscara y protección solar.`],
      ask: `¡Hasta mañana!` }),
    c2h: x => ({ subject: `Hoy a las ${x.start}: te esperamos${x.place ? " en " + x.place : ""}`,
      intro: `Tu clase de ${x.disc} empieza en 2 horas, a las ${x.start}. ${x.teacher} te espera${x.place ? " en " + x.place : ""}.`,
      tips: x.place ? [`Aquí tienes el mapa para llegar sin dar vueltas.`, `Si llegas tarde, no encuentras el sitio o necesitas cualquier cosa, escribe o llama a Laia y te ayuda enseguida.`]
        : [`Laia te confirma el punto de encuentro por WhatsApp en unos minutos.`, `Si no sabes dónde ir, escríbenos por WhatsApp.`], ask: "" }),
  },
  en: {
    loc: "en-GB", teacherFallback: "your instructor", hi: n => `Hi ${n},`, sign: "The Eth Sànglier team",
    row: { day: "Day", time: "Time", what: "Lesson", who: "Your instructor", where: "Meeting point", people: "People" },
    tbc: "Laia will confirm the meeting point very soon",
    btn: { map: "How to get there (Google Maps)", ok: "Yes, I'm coming", help: "I can't make it / I have a question" },
    help: (n, ref, day) => `Hi Laia, this is ${n}${ref ? ` (booking ${ref})` : ""}. About my lesson on ${day}: `,
    kh: { c7: { label: "Need anything for your lesson? Tell us", msg: (n, ref, day) => `Hi Laia, this is ${n}${ref ? ` (booking ${ref})` : ""}. About my lesson on ${day}, I would need: ` }, c1: { label: "Need anything? Message Laia", msg: (n, ref, day) => `Hi Laia, this is ${n}${ref ? ` (booking ${ref})` : ""}. About my lesson tomorrow (${day}): ` }, c2h: { label: "Need anything? Tell Laia", msg: (n, ref, day) => `Hi Laia, this is ${n}${ref ? ` (booking ${ref})` : ""}. I'm heading to my lesson today (${day}): ` } },
    laiaRow: "Laia (phone)",
    c7: x => ({ subject: `We're looking forward to seeing you in Baqueira · ${x.day}, ${x.start}`,
      intro: `Your ${x.disc} lesson is one week away and we're already looking forward to seeing you at Eth Sànglier. ${x.teacher} has everything ready for ${x.day} at ${x.start}.`,
      tips: [`Need anything for the lesson? Equipment (skis or board, boots, helmet), clothing, a question about your level, lift passes or parking… Tap the button and tell Laia: we'll have it all sorted before you arrive.`, `Your time slot is booked just for you.`],
      ask: `We're here for anything you need. See you on the mountain!` }),
    c1: x => ({ subject: `Tomorrow at ${x.start}: how to get${x.place ? " to " + x.place : " there"}`,
      intro: `Tomorrow's the day! Your ${x.disc} lesson starts at ${x.start}${x.place ? ` and ${x.teacher} will be waiting for you at ${x.place}` : ""}.`,
      tips: x.place ? [...x.notes, `Arrive 15 minutes early: time to park, put your boots on and get there without rushing.`, `Tap "How to get there" to see the exact spot on the map. Look for ${x.teacher}, who will be waiting for you there.`, `Bring warm clothes, gloves, goggles and sun protection.`, `If you're running late or can't find the spot, message or call Laia and she'll help right away.`]
        : [`Laia will confirm the meeting point on WhatsApp first thing in the morning.`, `Arrive 15 minutes early and bring warm clothes, gloves, goggles and sun protection.`],
      ask: `See you tomorrow!` }),
    c2h: x => ({ subject: `Today at ${x.start}: we'll be waiting${x.place ? " at " + x.place : ""}`,
      intro: `Your ${x.disc} lesson starts in 2 hours, at ${x.start}. ${x.teacher} is waiting for you${x.place ? " at " + x.place : ""}.`,
      tips: x.place ? [`Here is the map so you get there without going round in circles.`, `If you're running late, can't find the spot or need anything at all, message or call Laia and she'll help right away.`]
        : [`Laia will confirm the meeting point on WhatsApp in a few minutes.`, `If you don't know where to go, message us on WhatsApp.`], ask: "" }),
  },
  fr: {
    loc: "fr-FR", teacherFallback: "votre moniteur", hi: n => `Bonjour ${n},`, sign: "L'équipe d'Eth Sànglier",
    row: { day: "Jour", time: "Heure", what: "Cours", who: "Votre moniteur", where: "Point de rendez-vous", people: "Personnes" },
    tbc: "Laia vous confirmera très bientôt le point de rendez-vous",
    btn: { map: "Comment venir (Google Maps)", ok: "Oui, je viens", help: "Je ne peux pas venir / une question" },
    help: (n, ref, day) => `Bonjour Laia, je suis ${n}${ref ? ` (réservation ${ref})` : ""}. À propos de mon cours du ${day} : `,
    kh: { c7: { label: "Besoin de quelque chose pour votre cours ? Dites-le-nous", msg: (n, ref, day) => `Bonjour Laia, je suis ${n}${ref ? ` (réservation ${ref})` : ""}. À propos de mon cours du ${day}, j'aurais besoin de : ` }, c1: { label: "Besoin de quelque chose ? Écrivez à Laia", msg: (n, ref, day) => `Bonjour Laia, je suis ${n}${ref ? ` (réservation ${ref})` : ""}. À propos de mon cours de demain (${day}) : ` }, c2h: { label: "Besoin de quelque chose ? Dites-le à Laia", msg: (n, ref, day) => `Bonjour Laia, je suis ${n}${ref ? ` (réservation ${ref})` : ""}. Je viens à mon cours d'aujourd'hui (${day}) : ` } },
    laiaRow: "Laia (téléphone)",
    c7: x => ({ subject: `Nous vous attendons à Baqueira · ${x.day}, ${x.start}`,
      intro: `Votre cours de ${x.disc} a lieu dans une semaine et chez Eth Sànglier, nous vous attendons déjà. ${x.teacher} a tout préparé pour le ${x.day} à ${x.start}.`,
      tips: [`Besoin de quelque chose pour le cours ? Du matériel (skis ou planche, chaussures, casque), des vêtements, une question sur le niveau, le forfait ou le parking… Touchez le bouton et dites-le à Laia : tout sera prêt avant votre arrivée.`, `Votre créneau est réservé rien que pour vous.`],
      ask: `Nous sommes là pour tout ce dont vous avez besoin. À bientôt sur la montagne !` }),
    c1: x => ({ subject: `Demain à ${x.start} : comment venir${x.place ? " à " + x.place : ""}`,
      intro: `C'est demain ! Votre cours de ${x.disc} commence à ${x.start}${x.place ? ` et ${x.teacher} vous attendra à ${x.place}` : ""}.`,
      tips: x.place ? [...x.notes, `Arrivez 15 minutes avant : le temps de vous garer, de mettre vos chaussures et d'arriver sans courir.`, `Touchez « Comment venir » pour voir le point exact sur la carte. Cherchez ${x.teacher}, qui vous attendra sur place.`, `Apportez des vêtements chauds, des gants, des lunettes ou un masque et une protection solaire.`, `Si vous êtes en retard ou ne trouvez pas l'endroit, écrivez ou appelez Laia, elle vous aide tout de suite.`]
        : [`Laia vous confirmera le point de rendez-vous sur WhatsApp tôt le matin.`, `Arrivez 15 minutes avant avec des vêtements chauds, des gants, des lunettes ou un masque et une protection solaire.`],
      ask: `À demain !` }),
    c2h: x => ({ subject: `Aujourd'hui à ${x.start} : nous vous attendons${x.place ? " à " + x.place : ""}`,
      intro: `Votre cours de ${x.disc} commence dans 2 heures, à ${x.start}. ${x.teacher} vous attend${x.place ? " à " + x.place : ""}.`,
      tips: x.place ? [`Voici la carte pour arriver sans tourner en rond.`, `Si vous êtes en retard, ne trouvez pas l'endroit ou avez besoin de quoi que ce soit, écrivez ou appelez Laia, elle vous aide tout de suite.`]
        : [`Laia vous confirme le point de rendez-vous sur WhatsApp dans quelques minutes.`, `Si vous ne savez pas où aller, écrivez-nous sur WhatsApp.`], ask: "" }),
  },
  ca: {
    loc: "ca-ES", teacherFallback: "el teu professor", hi: n => `Hola ${n},`, sign: "L'equip d'Eth Sànglier",
    row: { day: "Dia", time: "Hora", what: "Classe", who: "El teu professor", where: "Punt de trobada", people: "Persones" },
    tbc: "La Laia et confirmarà el punt de trobada molt aviat",
    btn: { map: "Com arribar-hi (Google Maps)", ok: "Sí, hi vinc", help: "No puc venir / tinc un dubte" },
    help: (n, ref, day) => `Hola Laia, soc ${n}${ref ? ` (reserva ${ref})` : ""}. Sobre la meva classe del ${day}: `,
    kh: { c7: { label: "Necessites alguna cosa per a la classe? Explica-ho", msg: (n, ref, day) => `Hola Laia, soc ${n}${ref ? ` (reserva ${ref})` : ""}. Sobre la meva classe del ${day}, necessitaria: ` }, c1: { label: "Necessites alguna cosa? Escriu a la Laia", msg: (n, ref, day) => `Hola Laia, soc ${n}${ref ? ` (reserva ${ref})` : ""}. Sobre la meva classe de demà (${day}): ` }, c2h: { label: "Necessites alguna cosa? Digues-ho a la Laia", msg: (n, ref, day) => `Hola Laia, soc ${n}${ref ? ` (reserva ${ref})` : ""}. Vinc a la meva classe d'avui (${day}): ` } },
    laiaRow: "Laia (telèfon)",
    c7: x => ({ subject: `T'esperem a Baqueira · ${x.day}, ${x.start}`,
      intro: `Falta una setmana per a la teva classe de ${x.disc} i a Eth Sànglier ja t'estem esperant. ${x.teacher} ho té tot a punt per al ${x.day} a les ${x.start}.`,
      tips: [`Necessites alguna cosa per a la classe? Material (esquís o taula, botes, casc), roba, un dubte sobre el nivell, el forfet o el pàrquing… Toca el botó i explica-ho a la Laia: ho deixem tot a punt abans que arribis.`, `La teva hora està reservada només per a tu.`],
      ask: `Som aquí per al que necessitis. Ens veiem a la muntanya!` }),
    c1: x => ({ subject: `Demà a les ${x.start}: com arribar-hi${x.place ? " (" + x.place + ")" : ""}`,
      intro: `Demà és el dia! La teva classe de ${x.disc} comença a les ${x.start}${x.place ? ` i ${x.teacher} t'esperarà a ${x.place}` : ""}.`,
      tips: x.place ? [...x.notes, `Arriba 15 minuts abans: tindràs temps d'aparcar, posar-te les botes i arribar sense presses.`, `Toca «Com arribar-hi» per veure el punt exacte al mapa. Busca ${x.teacher}: t'estarà esperant allà.`, `Porta roba d'abric, guants, ulleres o màscara i protecció solar.`, `Si fas tard o no trobes el lloc, escriu o truca a la Laia i t'ajuda de seguida.`]
        : [`La Laia et confirmarà el punt de trobada per WhatsApp a primera hora.`, `Arriba 15 minuts abans i porta roba d'abric, guants, ulleres o màscara i protecció solar.`],
      ask: `Fins demà!` }),
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
  const notesFor = p => (links.notes ? links.notes(p, x.lang) : []).filter(Boolean);
  const lang = LANGS.includes(x.lang) ? x.lang : "es", C = COPY[lang], name = String(x.name || "").trim().split(/\s+/)[0] || "";
  const day = dayText(x.date, lang), place = isPlace(x.meeting) ? x.meeting : "";
  const m = C[x.kind]({ day, start: x.start, disc: discName(x.disc, lang), teacher: x.teacher || C.teacherFallback, place, gear: !!x.gear, notes: place ? notesFor(place) : [] });
  const mapUrl = place ? (links.map ? links.map(place) : mapSearch(place)) : "";
  const H = C.kh[x.kind] || { label: C.btn.help, msg: C.help };
  const helpLink = links.helpWa ? `https://wa.me/${links.helpWa}?text=${encodeURIComponent(H.msg(name, x.ref, day))}` : "";
  const rows = [[C.row.day, day], [C.row.time, `${x.start}${x.end ? "–" + x.end : ""}`], [C.row.what, discName(x.disc, lang)[0].toUpperCase() + discName(x.disc, lang).slice(1) + (x.pax > 1 ? ` · ${C.row.people.toLowerCase()}: ${x.pax}` : "")],
    [C.row.who, x.teacher || ""], [C.row.where, place || C.tbc], ...((x.kind === "c2h" || x.kind === "c1") && links.helpWa ? [[C.laiaRow, "+" + links.helpWa]] : [])].filter(r => r[1]);
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
<tr><td style="padding:12px 18px 0">${mapUrl ? btn(mapUrl, C.btn.map, "#27396D") : ""}${helpLink ? btn(helpLink, H.label, "#B3202B") : ""}</td></tr>
<tr><td style="padding:6px 18px 0;font-size:15px;line-height:1.5"><ul style="margin:0;padding-left:20px">${m.tips.map(t => `<li style="margin:0 0 6px">${esc(t)}</li>`).join("")}</ul></td></tr>
${m.ask ? `<tr><td style="padding:14px 18px 0;font-size:16px;font-weight:bold;line-height:1.5">${esc(m.ask)}</td></tr>` : ""}
<tr><td style="padding:12px 18px 0;font-size:14px"></td></tr>
<tr><td style="padding:16px 18px 20px;font-size:15px;color:#5A6482">${esc(C.sign)}</td></tr>
</table></td></tr></table></body></html>`;
  // WhatsApp template parameters: {{1}} name  {{2}} "day, start"  {{3}} meeting point  {{4}} map link (no line breaks allowed)
  return { subject: m.subject, text, html, mapUrl, helpLink, lang,
    wa: [name || "👋", `${day} ${x.start}`, place || C.tbc, (x.kind === "c7" ? helpLink || mapUrl : mapUrl || helpLink) || "https://ethsanglierskischool.com"] };
}
