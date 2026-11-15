// Eth Sànglier · WhatsApp sending, with a switchable provider.
//
//   WA_PROVIDER = "meta" | "twilio"   (if not set: twilio when TWILIO_ACCOUNT_SID exists, otherwise meta)
//
// Meta WhatsApp Cloud API (what the app used until now)
//   WA_TOKEN, WA_PHONE_ID
//   Templates are referenced by name + language, e.g. "aviso_clases" / "es".
//
// Twilio
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
//   TWILIO_WA_FROM                 the WhatsApp sender, e.g. +14155238886 (sandbox) or your approved number
//   or TWILIO_MESSAGING_SERVICE_SID instead of TWILIO_WA_FROM
//   TWILIO_TEMPLATES               JSON that maps our template names to Twilio Content SIDs, e.g.
//                                  {"aviso_clases":"HX…","recordatorio_7d_es":"HX…"}
//                                  "<name>_<lang>" is tried first, then "<name>".
//   A template with no Content SID is sent as plain text. That only arrives inside the 24-hour window after the
//   person last wrote to you (and always in the Twilio sandbox), so map every template before going live.
import { env } from "./staff-core.mjs";

export const waProvider = () => String(env("WA_PROVIDER") || (env("TWILIO_ACCOUNT_SID") ? "twilio" : "meta")).toLowerCase();
export function waReady() {
  if (waProvider() === "twilio") return !!(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && (env("TWILIO_WA_FROM") || env("TWILIO_MESSAGING_SERVICE_SID")));
  return !!(env("WA_TOKEN") && env("WA_PHONE_ID"));
}
const clean = t => String(t).replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ").slice(0, 900);

async function meta(to, template, lang, params) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${env("WA_PHONE_ID")}/messages`, {
    method: "POST", headers: { authorization: `Bearer ${env("WA_TOKEN")}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name: template, language: { code: lang },
      components: [{ type: "body", parameters: params.map(t => ({ type: "text", text: clean(t) })) }] } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `WhatsApp ${r.status}`);
  return j?.messages?.[0]?.id || "";
}

function twilioContentSid(template, lang) {
  let map = {}; try { map = JSON.parse(env("TWILIO_TEMPLATES") || "{}"); } catch { console.error("TWILIO_TEMPLATES is not valid JSON"); }
  return map[`${template}_${lang}`] || map[template] || "";
}
async function twilio(to, template, lang, params, fallbackText) {
  const sid = env("TWILIO_ACCOUNT_SID");
  const form = new URLSearchParams({ To: `whatsapp:+${String(to).replace(/\D/g, "")}` });
  if (env("TWILIO_MESSAGING_SERVICE_SID")) form.set("MessagingServiceSid", env("TWILIO_MESSAGING_SERVICE_SID"));
  else form.set("From", `whatsapp:+${String(env("TWILIO_WA_FROM")).replace(/\D/g, "")}`);
  const content = twilioContentSid(template, lang);
  if (content) {
    form.set("ContentSid", content);
    form.set("ContentVariables", JSON.stringify(Object.fromEntries(params.map((p, i) => [String(i + 1), clean(p)]))));
  } else form.set("Body", String(fallbackText || params.join(" · ")).slice(0, 1500));
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST", body: form,
    headers: { authorization: "Basic " + Buffer.from(`${sid}:${env("TWILIO_AUTH_TOKEN")}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message || `Twilio ${r.status}`);
  return j.sid || "";
}

/** Send a WhatsApp template. params = the template's {{1}}, {{2}}… in order. fallbackText = plain text if the provider has no template for it. */
export async function sendTemplate(to, template, lang, params, fallbackText) {
  return waProvider() === "twilio" ? twilio(to, template, lang, params, fallbackText) : meta(to, template, lang, params);
}
