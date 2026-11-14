// index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

// ../_shared/fcm.ts
var b64url = (input) => {
  const bin = typeof input === "string" ? btoa(input) : btoa(String.fromCharCode(...input));
  return bin.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
async function getGoogleAccessToken(serviceAccountJson) {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1e3);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.` + b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    })
  );
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${b64url(new Uint8Array(sig))}`
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Falha ao obter access token Google");
  return { accessToken: data.access_token, projectId: sa.project_id };
}
async function sendFcm(accessToken, projectId, m) {
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: m.token,
          notification: {
            title: m.title,
            body: m.body,
            ...m.image && /^https:\/\//.test(m.image) ? { image: m.image } : {}
          },
          ...m.url && m.url.startsWith("/") ? { data: { url: m.url } } : {},
          webpush: {
            notification: { icon: "/icon-192.png" },
            ...m.link && /^https:\/\//.test(m.link) ? { fcm_options: { link: m.link } } : {}
          }
        }
      })
    });
    return { ok: res.ok, unregistered: res.status === 404 };
  } catch {
    return { ok: false, unregistered: false };
  }
}

// ../_shared/rate-limit.ts
async function rateLimit(sb2, key, limit, windowSeconds) {
  try {
    const { data, error } = await sb2.rpc("check_rate_limit", {
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

// index.ts
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json"
};
var json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: CORS });
var FIREBASE_JSON = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";
var APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");
var sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
var UUID = /^[0-9a-f-]{36}$/i;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: auth, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !auth?.user) return json({ error: "sess\xE3o inv\xE1lida" }, 401);
    const uid = auth.user.id;
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "JSON inv\xE1lido" }, 400);
    }
    if (!body.messageId || !UUID.test(body.messageId)) return json({ error: "messageId inv\xE1lido" }, 400);
    const user = await rateLimit(sb, `chatpush:u:${uid}`, 60, 60);
    if (!user.allowed) return json({ ok: false, skipped: "rate_limited" });
    const once = await rateLimit(sb, `chatpush:m:${body.messageId}`, 1, 3600);
    if (!once.allowed) return json({ ok: true, skipped: "already_sent" });
    if (!FIREBASE_JSON) return json({ ok: false, skipped: "firebase_not_configured" });
    const { data: msg } = await sb.from("messages").select("id, business_id, sender_id, receiver_id, text, attachment_type, created_at").eq("id", body.messageId).maybeSingle();
    if (!msg || msg.sender_id !== uid) return json({ error: "mensagem n\xE3o \xE9 tua" }, 403);
    if (Date.now() - new Date(msg.created_at).getTime() > 5 * 60 * 1e3) {
      return json({ ok: true, skipped: "too_old" });
    }
    const { data: biz } = await sb.from("businesses").select("business_name, owner_id").eq("id", msg.business_id).maybeSingle();
    const senderIsOwner = biz?.owner_id === msg.sender_id;
    let title;
    if (senderIsOwner) {
      title = biz?.business_name || "Spotter Local";
    } else {
      const { data: prof } = await sb.from("profiles").select("name").eq("id", msg.sender_id).maybeSingle();
      title = (prof?.name || "").trim() || "Novo cliente";
    }
    const text = (msg.text ?? "").trim();
    const preview = text ? text.length > 120 ? `${text.slice(0, 117)}\u2026` : text : msg.attachment_type === "image" ? "\u{1F4F7} Foto" : msg.attachment_type === "audio" ? "\u{1F3A4} \xC1udio" : msg.attachment_type ? "\u{1F4CE} Anexo" : "Nova mensagem";
    const { data: rows } = await sb.from("push_tokens").select("token").eq("user_id", msg.receiver_id);
    const tokens = (rows ?? []).map((r) => r.token).filter(Boolean);
    if (!tokens.length) return json({ ok: true, sent: 0, reason: "sem_tokens" });
    const path = senderIsOwner ? `/chat/${msg.business_id}` : "/business-inbox";
    const { accessToken, projectId } = await getGoogleAccessToken(FIREBASE_JSON);
    let sent = 0;
    const dead = [];
    await Promise.all(
      tokens.map(async (t) => {
        const r = await sendFcm(accessToken, projectId, {
          token: t,
          title,
          body: preview,
          url: path,
          link: APP_URL ? `${APP_URL}${path}` : void 0
        });
        if (r.ok) sent++;
        if (r.unregistered) dead.push(t);
      })
    );
    if (dead.length) await sb.from("push_tokens").delete().in("token", dead);
    return json({ ok: true, sent, dead: dead.length });
  } catch (err) {
    console.error("notify-chat-message: erro", err);
    return json({ error: "internal_error" }, 500);
  }
});
