// @ts-nocheck — ambiente Deno (Supabase Edge Functions).
// ============================================================
// SPOTTER — Edge Function: notify-chat-message
// ------------------------------------------------------------
// Envia uma notificação push ao destinatário de uma mensagem de chat.
// A app chama esta função logo depois de gravar a mensagem (verify_jwt ligado).
//
// Segurança:
//   • só quem ENVIOU a mensagem pode pedir o aviso (sender_id = utilizador do JWT);
//   • a mensagem tem de ser dos últimos 5 minutos;
//   • cada mensagem só gera um aviso (check_rate_limit, 1 por mensagem);
//   • limite por utilizador: 60 avisos por minuto.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIREBASE_SERVICE_ACCOUNT_JSON,
//          APP_URL (opcional, ex.: https://o-teu-dominio.com)
// Sem FIREBASE_SERVICE_ACCOUNT_JSON a função responde 200 e não envia nada.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getGoogleAccessToken, sendFcm } from "../_shared/fcm.ts";
import { rateLimit } from "../_shared/rate-limit.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: CORS });

const FIREBASE_JSON = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: auth, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !auth?.user) return json({ error: "sessão inválida" }, 401);
    const uid = auth.user.id;

    let body: { messageId?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "JSON inválido" }, 400);
    }
    if (!body.messageId || !UUID.test(body.messageId)) return json({ error: "messageId inválido" }, 400);

    const user = await rateLimit(sb, `chatpush:u:${uid}`, 60, 60);
    if (!user.allowed) return json({ ok: false, skipped: "rate_limited" });
    const once = await rateLimit(sb, `chatpush:m:${body.messageId}`, 1, 3600);
    if (!once.allowed) return json({ ok: true, skipped: "already_sent" });

    if (!FIREBASE_JSON) return json({ ok: false, skipped: "firebase_not_configured" });

    const { data: msg } = await sb
      .from("messages")
      .select("id, business_id, sender_id, receiver_id, text, attachment_type, created_at")
      .eq("id", body.messageId)
      .maybeSingle();
    if (!msg || msg.sender_id !== uid) return json({ error: "mensagem não é tua" }, 403);
    if (Date.now() - new Date(msg.created_at).getTime() > 5 * 60 * 1000) {
      return json({ ok: true, skipped: "too_old" });
    }

    const { data: biz } = await sb
      .from("businesses")
      .select("business_name, owner_id")
      .eq("id", msg.business_id)
      .maybeSingle();
    const senderIsOwner = biz?.owner_id === msg.sender_id;

    let title: string;
    if (senderIsOwner) {
      title = biz?.business_name || "Spotter Local";
    } else {
      const { data: prof } = await sb.from("profiles").select("name").eq("id", msg.sender_id).maybeSingle();
      title = (prof?.name || "").trim() || "Novo cliente";
    }
    const text = (msg.text ?? "").trim();
    const preview = text
      ? text.length > 120
        ? `${text.slice(0, 117)}…`
        : text
      : msg.attachment_type === "image"
        ? "📷 Foto"
        : msg.attachment_type === "audio"
          ? "🎤 Áudio"
          : msg.attachment_type
            ? "📎 Anexo"
            : "Nova mensagem";

    const { data: rows } = await sb.from("push_tokens").select("token").eq("user_id", msg.receiver_id);
    const tokens: string[] = (rows ?? []).map((r: any) => r.token).filter(Boolean);
    if (!tokens.length) return json({ ok: true, sent: 0, reason: "sem_tokens" });

    const path = senderIsOwner ? `/chat/${msg.business_id}` : "/business-inbox";
    const { accessToken, projectId } = await getGoogleAccessToken(FIREBASE_JSON);
    let sent = 0;
    const dead: string[] = [];
    await Promise.all(
      tokens.map(async (t) => {
        const r = await sendFcm(accessToken, projectId, {
          token: t,
          title,
          body: preview,
          url: path,
          link: APP_URL ? `${APP_URL}${path}` : undefined,
        });
        if (r.ok) sent++;
        if (r.unregistered) dead.push(t);
      }),
    );
    if (dead.length) await sb.from("push_tokens").delete().in("token", dead);
    return json({ ok: true, sent, dead: dead.length });
  } catch (err) {
    console.error("notify-chat-message: erro", err);
    return json({ error: "internal_error" }, 500);
  }
});
