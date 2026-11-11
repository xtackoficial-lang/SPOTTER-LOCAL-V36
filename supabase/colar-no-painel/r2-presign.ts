// @ts-nocheck — ficheiro único para colar no painel do Supabase (gerado de supabase/functions/r2-presign).
// r2-presign/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1.0.20";

// _shared/rate-limit.ts
async function rateLimit(sb, key, limit, windowSeconds) {
  try {
    const { data, error } = await sb.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("resposta vazia");
    return { allowed: !!row.allowed, remaining: row.remaining ?? 0, retryAfter: row.retry_after ?? 0 };
  } catch (e) {
    console.error("rate-limit: falha ao verificar (pedido deixado passar)", e);
    return { allowed: true, remaining: limit, retryAfter: 0 };
  }
}
function tooManyRequests(retryAfter, headers = {}) {
  const secs = Math.max(1, Math.ceil(retryAfter));
  const wait = secs >= 120 ? `${Math.ceil(secs / 60)} minutos` : `${secs} segundos`;
  return new Response(
    JSON.stringify({ error: `Fizeste demasiados pedidos. Tenta de novo daqui a ${wait}.`, code: "rate_limited", retryAfter: secs }),
    { status: 429, headers: { ...headers, "Content-Type": "application/json", "Retry-After": String(secs) } }
  );
}
var LIMITS = {
  r2Put: { limit: 60, window: 60 },
  // 60 envios de foto/min (lote de 26 cabe)
  r2Delete: { limit: 60, window: 60 },
  payment: { limit: 10, window: 600 },
  // 10 pedidos de pagamento / 10 min
  deleteAccount: { limit: 3, window: 3600 },
  // 3 / hora
  reservationRespond: { limit: 30, window: 60 },
  merchantPromo: { limit: 10, window: 3600 },
  // 10 promoções / hora
  translate: { limit: 40, window: 60 }
  // 40 traduções / minuto por utilizador
};

// _shared/r2-keys.ts
var PUBLIC_KINDS = ["cover", "gallery", "product", "post", "event", "room"];
var ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};
var MAX_BYTES = 6 * 1024 * 1024;
function isPublicKind(k) {
  return typeof k === "string" && PUBLIC_KINDS.includes(k);
}
function makeKey(kind, uid, contentType, now = Date.now(), rnd = Math.random() || 0.123456) {
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) throw new Error("tipo de ficheiro n\xE3o permitido");
  if (!/^[0-9a-f-]{36}$/i.test(uid)) throw new Error("utilizador inv\xE1lido");
  return `${kind}/${uid}/${now}-${rnd.toString(36).slice(2, 8)}.${ext}`;
}
function isOwnedKey(key, uid) {
  if (typeof key !== "string" || key.length > 200) return false;
  const parts = key.split("/");
  if (parts.length !== 3) return false;
  const [kind, owner, file] = parts;
  if (!isPublicKind(kind) || owner.toLowerCase() !== uid.toLowerCase()) return false;
  return /^[0-9]+-[a-z0-9]{1,8}\.(jpg|png|webp)$/i.test(file);
}

// r2-presign/index.ts
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "m\xE9todo n\xE3o permitido" }, 405);
  const ACCOUNT = Deno.env.get("R2_ACCOUNT_ID");
  const KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID");
  const SECRET = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const BUCKET = Deno.env.get("R2_BUCKET");
  const PUBLIC_URL = (Deno.env.get("R2_PUBLIC_URL") ?? "").replace(/\/+$/, "");
  if (!ACCOUNT || !KEY_ID || !SECRET || !BUCKET || !PUBLIC_URL) {
    return json({ error: "R2 n\xE3o configurado no servidor" }, 503);
  }
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: auth, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !auth.user) return json({ error: "sess\xE3o inv\xE1lida" }, 401);
  const uid = auth.user.id;
  {
    const rl = await rateLimit(sb, `r2:${uid}`, LIMITS.r2Put.limit, LIMITS.r2Put.window);
    if (!rl.allowed) return tooManyRequests(rl.retryAfter, CORS);
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inv\xE1lido" }, 400);
  }
  const r2 = new AwsClient({ accessKeyId: KEY_ID, secretAccessKey: SECRET, service: "s3", region: "auto" });
  const objectUrl = (key) => `https://${ACCOUNT}.r2.cloudflarestorage.com/${BUCKET}/${key}`;
  if (body.action === "put") {
    if (!isPublicKind(body.kind)) return json({ error: "tipo de imagem inv\xE1lido" }, 400);
    if (!body.contentType || !ALLOWED_TYPES[body.contentType]) {
      return json({ error: "s\xF3 s\xE3o aceites imagens JPG, PNG ou WebP" }, 400);
    }
    if (!Number.isFinite(body.size) || body.size <= 0 || body.size > MAX_BYTES) {
      return json({ error: "imagem demasiado grande" }, 400);
    }
    const key = makeKey(body.kind, uid, body.contentType);
    const url = new URL(objectUrl(key));
    url.searchParams.set("X-Amz-Expires", "300");
    const signed = await r2.sign(url.toString(), {
      method: "PUT",
      headers: { "Content-Type": body.contentType, "Content-Length": String(body.size) },
      aws: { signQuery: true, allHeaders: true }
    });
    return json({ uploadUrl: signed.url, publicUrl: `${PUBLIC_URL}/${key}`, key });
  }
  if (body.action === "delete") {
    if (!isOwnedKey(body.key, uid)) return json({ error: "ficheiro n\xE3o \xE9 teu" }, 403);
    const res = await r2.fetch(objectUrl(body.key), { method: "DELETE" });
    if (!res.ok && res.status !== 404) return json({ error: "falha ao apagar" }, 502);
    return json({ ok: true });
  }
  return json({ error: "ac\xE7\xE3o inv\xE1lida" }, 400);
});
