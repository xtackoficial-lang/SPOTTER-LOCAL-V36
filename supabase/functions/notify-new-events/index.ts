// @ts-nocheck — ambiente Deno (Supabase Edge Functions).
// ============================================================
// SPOTTER — Edge Function: notify-new-events
// ------------------------------------------------------------
// Corre de 5 em 5 minutos (pg_cron, ver supabase/3_CRON_EVENTOS.sql).
// Quando uma publicação (evento) fica visível — no dia e hora que o
// comerciante escolheu — avisa quem segue o negócio (clientes com o
// negócio nos favoritos):  "Hotel Bom Gosto publicou uma foto"
// com o título como texto e a capa como imagem.
//
// Segurança: só aceita o header  Authorization: Bearer <FUNCTION_SECRET>
// (o mesmo segredo das outras funções agendadas).
// Cada evento é "reclamado" no SQL (notified_at) antes do envio, por isso
// nunca é enviado duas vezes, mesmo que o cron se sobreponha.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FUNCTION_SECRET,
//          FIREBASE_SERVICE_ACCOUNT_JSON  (já existem)
//          APP_URL (opcional, ex.: https://o-teu-dominio.com) → ao tocar na
//          notificação abre a aba Eventos.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getGoogleAccessToken, sendFcm } from "../_shared/fcm.ts";
import { buildEventNotification } from "../_shared/event-notify.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTION_SECRET = Deno.env.get("FUNCTION_SECRET") ?? "";
const FIREBASE_JSON = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!FUNCTION_SECRET || token !== FUNCTION_SECRET) return json({ error: "unauthorized" }, 401);
    if (!FIREBASE_JSON) return json({ error: "FIREBASE_SERVICE_ACCOUNT_JSON em falta" }, 500);

    // Antes de reclamar eventos, garante que o Firebase responde — senão os
    // eventos ficariam marcados como notificados sem terem sido enviados.
    const { accessToken, projectId } = await getGoogleAccessToken(FIREBASE_JSON);

    const { data: events, error } = await supabase.rpc("claim_events_to_notify", { p_limit: 20 });
    if (error) return json({ error: error.message }, 500);
    if (!events?.length) return json({ ok: true, events: 0 });

    const summary = [];
    for (const ev of events) {
      const { data: rows } = await supabase.rpc("event_follower_tokens", { p_business_id: ev.business_id });
      const tokens: string[] = (rows ?? []).map((r: any) => r.token).filter(Boolean);
      const msg = buildEventNotification(ev);
      let success = 0;
      const dead: string[] = [];

      for (let i = 0; i < tokens.length; i += 20) {
        const results = await Promise.all(
          tokens.slice(i, i + 20).map(async (t) => {
            const r = await sendFcm(accessToken, projectId, {
              token: t,
              title: msg.title,
              body: msg.body,
              image: ev.image_url,
              url: "/events",
              link: APP_URL ? `${APP_URL}/events` : undefined,
            });
            if (r.ok) success++;
            if (r.unregistered) dead.push(t);
            return r;
          }),
        );
        void results;
      }
      if (dead.length) await supabase.from("push_tokens").delete().in("token", dead);

      await supabase
        .from("push_log")
        .insert({
          title: msg.title,
          body: msg.body,
          target: "event_followers",
          business_id: ev.business_id,
          recipients_count: tokens.length,
          success_count: success,
          failure_count: tokens.length - success,
        })
        .then(() => {}, () => {}); // o registo nunca derruba o envio

      summary.push({ event: ev.event_id, followers: tokens.length, sent: success });
    }
    return json({ ok: true, events: events.length, summary });
  } catch (err) {
    console.error("notify-new-events:", err);
    return json({ error: "internal" }, 500);
  }
});
