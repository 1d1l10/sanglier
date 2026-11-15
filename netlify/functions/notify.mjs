// Eth Sànglier · scheduled function: class notices by email and WhatsApp.
// Runs every 15 minutes (UTC clock) and decides by Madrid time whether the evening (20:00) or morning (07:30)
// notice is due. Each notice is logged in the Airtable table "Avisos", so nothing is sent twice.
import { runDue } from "../lib/staff-notify.mjs";

export const config = { schedule: "*/15 * * * *" };

export default async () => {
  try {
    const r = await runDue();
    console.log("notify", JSON.stringify(r));
  } catch (e) {
    console.error("notify failed (nothing sent):", e.message);
  }
};
