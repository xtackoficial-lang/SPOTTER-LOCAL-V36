// ============================================================
// SPOTTER LOCAL — Edge Function: translate-message
// ------------------------------------------------------------
// POST { messageId, to: "pt"|"en"|"es"|"fr" }
//  → { text, detected, sameLanguage, cached }
// Só traduz mensagens em que o utilizador é emissor ou receptor.
// 1) procura a tradução guardada (grátis); 2) senão reserva caracteres no
// orçamento do mês e pede ao serviço (Azure por omissão); 3) guarda e devolve.
// Secrets: AZURE_TRANSLATOR_KEY, AZURE_TRANSLATOR_REGION
//   (opcionais: AZURE_TRANSLATOR_ENDPOINT, TRANSLATE_PROVIDER=azure|google,
//    GOOGLE_TRANSLATE_KEY, TRANSLATE_MONTHLY_CAP)
// Deploy: supabase functions deploy translate-message   (JWT obrigatório)
// ============================================================
// @ts-nocheck — ambiente Deno
import { createClient } from "jsr:@supabase/supabase-js@2";
import { LIMITS, rateLimit, tooManyRequests } from "../_shared/rate-limit.ts";
import { baseLang, DEFAULT_MONTHLY_CAP, isLang, MAX_CHARS, monthKey, translateText } from "../_shared/translate.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: CORS });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "método não permitido" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !auth?.user) return json({ error: "sessão inválida" }, 401);
  const uid = auth.user.id;

  const rl = await rateLimit(sb, `tr:${uid}`, LIMITS.translate.limit, LIMITS.translate.window);
  if (!rl.allowed) return tooManyRequests(rl.retryAfter, CORS);

  let body: { messageId?: string; to?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (!body.messageId || !/^[0-9a-f-]{36}$/i.test(body.messageId) || !isLang(body.to)) {
    return json({ error: "pedido inválido" }, 400);
  }

  const { data: msg } = await sb
    .from("messages")
    .select("id,text,sender_id,receiver_id")
    .eq("id", body.messageId)
    .maybeSingle();
  if (!msg || (msg.sender_id !== uid && msg.receiver_id !== uid)) return json({ error: "mensagem não encontrada" }, 404);
  const text = String(msg.text ?? "").trim();
  if (!text) return json({ error: "mensagem sem texto" }, 400);
  if (text.length > MAX_CHARS) return json({ error: "mensagem demasiado longa para traduzir" }, 413);

  // 1) guardada?
  const { data: cached } = await sb
    .from("message_translations")
    .select("translated,detected")
    .eq("message_id", msg.id)
    .eq("lang", body.to)
    .maybeSingle();
  if (cached) {
    return json({ text: cached.translated, detected: cached.detected, sameLanguage: baseLang(cached.detected) === body.to, cached: true });
  }

  // 2) orçamento do mês
  const cap = Number(Deno.env.get("TRANSLATE_MONTHLY_CAP")) || DEFAULT_MONTHLY_CAP;
  const month = monthKey();
  const { data: rsv, error: rsvErr } = await sb.rpc("reserve_translation_chars", {
    p_month: month,
    p_chars: text.length,
    p_cap: cap,
  });
  const row = Array.isArray(rsv) ? rsv[0] : rsv;
  if (rsvErr) {
    console.error("translate-message: orçamento", rsvErr);
    return json({ error: "tradução indisponível" }, 503);
  }
  if (!row?.allowed) return json({ error: "limite mensal de traduções atingido", code: "quota" }, 429);

  // 3) traduzir
  try {
    const t = await translateText(text, body.to, Deno.env);
    await sb
      .from("message_translations")
      .upsert({ message_id: msg.id, lang: body.to, translated: t.text, detected: t.detected || null });
    return json({ text: t.text, detected: t.detected, sameLanguage: t.detected === body.to, cached: false });
  } catch (e) {
    console.error("translate-message: falhou", e);
    await sb.rpc("refund_translation_chars", { p_month: month, p_chars: text.length });
    return json({ error: "não foi possível traduzir agora" }, 502);
  }
});
