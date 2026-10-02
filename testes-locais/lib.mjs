import crypto from "node:crypto";
export const JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
export function sign(payload) {
  const h = b64({ alg: "HS256", typ: "JWT" }), p = b64({ iat: 1700000000, exp: 4000000000, ...payload });
  const s = crypto.createHmac("sha256", JWT_SECRET).update(h + "." + p).digest("base64url");
  return `${h}.${p}.${s}`;
}
export function verify(tok) {
  try {
    const [h, p, s] = tok.split(".");
    const e = crypto.createHmac("sha256", JWT_SECRET).update(h + "." + p).digest("base64url");
    if (e !== s) return null;
    return JSON.parse(Buffer.from(p, "base64url").toString());
  } catch { return null; }
}
