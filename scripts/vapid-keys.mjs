// Generates the key pair for push notifications. Run once:  node scripts/vapid-keys.mjs
// Put both values in Netlify > Project configuration > Environment variables, then redeploy.
// Never change them later: every phone would have to switch notifications on again.
import crypto from "node:crypto";
const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
console.log("VAPID_PUBLIC_KEY=" + ecdh.getPublicKey().toString("base64url"));
const d = ecdh.getPrivateKey(), d32 = Buffer.concat([Buffer.alloc(32 - d.length), d]);   // always 32 bytes
console.log("VAPID_PRIVATE_KEY=" + d32.toString("base64url"));
