// Copies netlify/lib/staff-remind-copy.mjs into staff/index.html (the CMSG block), so the admin preview
// shows exactly what clients receive.  node scripts/sync-copy.mjs [--check]
import fs from "node:fs";
const mod = fs.readFileSync("netlify/lib/staff-remind-copy.mjs", "utf8");
const body = mod.replace(/^(\/\/.*\n)+\n?/, "").replace(/^export (?=(const|function|async function) )/gm, "");
const page = fs.readFileSync("staff/index.html", "utf8");
const a = page.indexOf("const CMSG=(()=>{\n") + "const CMSG=(()=>{\n".length, b = page.indexOf("\nreturn {buildMessage,", a);
if (a < 20 || b < 0) throw new Error("CMSG block not found");
const cur = page.slice(a, b);
if (process.argv.includes("--check")) { console.log(cur.trim() === body.trim() ? "in sync" : "DIFFERENT"); process.exit(0); }
fs.writeFileSync("staff/index.html", page.slice(0, a) + "\n" + body.trim() + "\n" + page.slice(b));
console.log("synced");
