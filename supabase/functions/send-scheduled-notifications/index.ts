// ============================================================
// XTACK SPOTTER — Edge Function: send-scheduled-notifications
// ------------------------------------------------------------
// Corre no servidor (Deno runtime do Supabase), invocada por um cron job
// (pg_cron) a cada poucos minutos, ou manualmente pelo admin ("Enviar
// agora"). Responsabilidades:
//   1. Ler scheduled_notifications activos cujo horário corresponde a
//      "agora" (dentro de uma janela de tolerância, para não depender de
//      o cron correr exactamente ao segundo).
//   2. Resolver os destinatários (filtrando por target/cidade) e os seus
//      tokens FCM em push_tokens.
//   3. Gerar o texto: fixo (modo 'custom') ou personalizado por pessoa
//      (modo 'auto_visit' → "Olá {nome}, gostarias de visitar {local}?").
//   4. Enviar via FCM HTTP v1, usando uma Service Account do Firebase
//      (autenticação por JWT assinado, sem libraries externas).
//   5. Registar o resultado em push_log e actualizar last_sent_at.
//
// Variáveis de ambiente necessárias (Supabase → Edge Functions → Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (já existem por omissão)
//   FIREBASE_SERVICE_ACCOUNT_JSON  (conteúdo do ficheiro JSON da Service
//   Account, copiado tal e qual — ver FIREBASE_SETUP.md)
// ============================================================

// @ts-nocheck — ambiente Deno (Supabase Edge Functions), tipos diferentes do projecto Vite/React.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";
// Conserto de segurança (item 9 da auditoria): sem isto, qualquer
// pessoa com a anon key pública conseguia chamar esta função e
// disparar notificações push reais para todos os utilizadores.
// Configurar em Supabase → Edge Functions → Secrets. Quem chama
// (pg_cron ou o botão "Enviar agora" no /admin) precisa de mandar
// o header Authorization: Bearer <FUNCTION_SECRET>.
const FUNCTION_SECRET = Deno.env.get("FUNCTION_SECRET")!;
// Injectada automaticamente pelo runtime das Edge Functions do
// Supabase — não precisa de ser configurada à mão.
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Autoriza duas origens de chamada:
//  1) pg_cron / servidor-a-servidor — manda o FUNCTION_SECRET fixo.
//  2) botão "Enviar agora" no /admin — manda a sessão do próprio
//     admin autenticado; confirma-se que está na tabela admins.
async function isAuthorized(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  if (token === FUNCTION_SECRET) return true;

  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return false;
    const { data: adminRow } = await supabase
      .from("admins")
      .select("id")
      .eq("id", userData.user.id)
      .maybeSingle();
    return !!adminRow;
  } catch {
    return false;
  }
}

// Tolerância: considera "para enviar agora" qualquer agendamento cujo
// horário previsto caia dentro dos últimos N minutos — cobre o caso de o
// cron correr de 5 em 5 minutos sem perder envios por estar "1 minuto
// atrasado" em relação ao horário exacto escolhido pelo admin.
const TOLERANCE_MINUTES = 6;

// ── Geração de JWT assinado (RS256) para obter access token OAuth2 ───
// A API HTTP v1 do FCM exige um Bearer token OAuth2, obtido trocando um
// JWT assinado com a chave privada da Service Account por um access
// token junto do Google. Implementado sem dependências externas, usando
// apenas Web Crypto (disponível nativamente no runtime Deno).
async function getGoogleAccessToken(): Promise<string> {
  const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const unsigned = `${encode(header)}.${encode(claimSet)}`;

  // Importa a chave privada PEM (PKCS#8) para assinatura RS256.
  const pem = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsigned),
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${unsigned}.${signature}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error(`Falha ao obter access token Google: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

async function sendFcmMessage(
  accessToken: string,
  projectId: string,
  token: string,
  title: string,
  body: string,
): Promise<boolean> {
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          webpush: {
            fcm_options: { link: "/" },
            notification: { icon: "/icon-192.png" },
          },
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Resolução de destinatários ───────────────────────────────────────
interface Recipient {
  userId: string | null;
  token: string;
  name: string | null;
  city: string | null;
  favoriteCategory: string | null;
}

async function resolveRecipients(
  target: string,
  city: string | null | undefined,
): Promise<Recipient[]> {
  // Junta push_tokens com profiles (para nome/cidade/categoria) e, quando
  // o segmento é sobre comerciantes, com businesses (para saber o plano).
  let query = supabase
    .from("push_tokens")
    .select("user_id, token, profiles!inner(name, city, favorite_category, profile_type)");

  if (city) {
    query = query.eq("profiles.city", city);
  }
  if (target === "personal_users") {
    query = query.eq("profiles.profile_type", "personal");
  }
  // Nota: "premium_merchants" usa o mesmo filtro base que "merchants"
  // (profile_type = business). Filtrar apenas os do plano Pro/Premium
  // exigiria cruzar com a tabela businesses pelo owner_id, o que o
  // PostgREST não faz directamente num único select encadeado como este.
  // Para esse refinamento, ver TODO em FIREBASE_SETUP.md.
  if (target === "merchants" || target === "premium_merchants") {
    query = query.eq("profiles.profile_type", "business");
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data
    .filter((row: any) => row.token)
    .map((row: any) => ({
      userId: row.user_id,
      token: row.token,
      name: row.profiles?.name ?? null,
      city: row.profiles?.city ?? null,
      favoriteCategory: row.profiles?.favorite_category ?? null,
    }));
}

// Escolhe um negócio para sugerir, idealmente na cidade do destinatário e
// na categoria que ele indicou ter interesse no onboarding. Faz fallback
// progressivo (categoria+cidade → só cidade → qualquer aberto) para
// sempre conseguir sugerir algo, mesmo com poucos dados.
async function pickSuggestedBusiness(
  city: string | null,
  favoriteCategory: string | null,
): Promise<string | null> {
  const attempts: Array<Record<string, string>> = [];
  if (city && favoriteCategory) attempts.push({ city, category: favoriteCategory });
  if (city) attempts.push({ city });
  attempts.push({});

  for (const filter of attempts) {
    let q = supabase
      .from("businesses")
      .select("business_name")
      .neq("plan_status", "blocked")
      .limit(5);
    if (filter.city) q = q.eq("city", filter.city);
    if (filter.category) q = q.eq("category", filter.category);
    const { data } = await q;
    if (data && data.length > 0) {
      const pick = data[Math.floor(Math.random() * data.length)];
      return pick.business_name as string;
    }
  }
  return null;
}

// ── Lógica de "é para enviar agora?" ─────────────────────────────────
function isDue(n: any, nowUtc: Date): boolean {
  if (!n.active) return false;

  // Converte "agora" para hora local de Moçambique (UTC+2, sem horário
  // de verão) — o admin escolhe a hora pensando no relógio de Maputo.
  const localNow = new Date(nowUtc.getTime() + 2 * 60 * 60 * 1000);
  const localMinutes = localNow.getUTCHours() * 60 + localNow.getUTCMinutes();
  const targetMinutes = n.send_hour * 60 + n.send_minute;
  const diff = Math.abs(localMinutes - targetMinutes);
  const crossesMidnight = diff > TOLERANCE_MINUTES && Math.abs(diff - 1440) <= TOLERANCE_MINUTES;
  const withinWindow = diff <= TOLERANCE_MINUTES || crossesMidnight;

  if (!withinWindow) return false;

  // Dia em que o horário-alvo "realmente" caiu — relevante só perto da
  // meia-noite: se passámos a virar o dia (ex: agendado p/ 23:58 e o
  // cron correu à 00:02 do dia seguinte), o dia-da-semana a comparar
  // com n.weekdays é o de ONTEM, não o de hoje. Sem este ajuste, um
  // agendamento semanal para sábado às 23:58 nunca disparava, porque ao
  // cron correr minutos depois já era domingo.
  const targetDay = new Date(localNow);
  if (crossesMidnight && localMinutes < targetMinutes) {
    targetDay.setUTCDate(targetDay.getUTCDate() - 1);
  }

  if (n.schedule_type === "weekly") {
    const weekday = targetDay.getUTCDay();
    if (!n.weekdays || !n.weekdays.includes(weekday)) return false;
    // Evita reenviar dentro do mesmo dia se o cron correr de novo dentro
    // da janela de tolerância.
    if (n.last_sent_at) {
      const last = new Date(n.last_sent_at);
      const sameDay =
        last.getUTCFullYear() === targetDay.getUTCFullYear() &&
        last.getUTCMonth() === targetDay.getUTCMonth() &&
        last.getUTCDate() === targetDay.getUTCDate();
      if (sameDay) return false;
    }
    return true;
  }

  // schedule_type === 'once'
  if (n.last_sent_at) return false; // já enviado, nunca repete
  if (!n.send_at) return true; // sem data fixa: dispara na primeira janela horária que bater
  const sendAt = new Date(n.send_at);
  return Math.abs(nowUtc.getTime() - sendAt.getTime()) <= TOLERANCE_MINUTES * 60 * 1000;
}

async function processCampaign(campaign: {
  id: string | null;
  title: string;
  body: string;
  mode: string;
  target: string;
  city?: string | null;
}) {
  const recipients = await resolveRecipients(campaign.target, campaign.city);
  let accessToken: string | null = null;
  let projectId: string | null = null;
  let success = 0;
  let failure = 0;

  if (FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      accessToken = await getGoogleAccessToken();
      projectId = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON).project_id;
    } catch (err) {
      console.error("Falha ao autenticar com Firebase:", err);
    }
  }

  for (const r of recipients) {
    let title = campaign.title;
    let body = campaign.body;

    if (campaign.mode === "auto_visit") {
      const place = await pickSuggestedBusiness(r.city, r.favoriteCategory);
      const firstName = (r.name ?? "").trim().split(" ")[0] || "tudo bem?";
      title = "Spotter Local";
      body = place
        ? `Olá ${firstName}, gostarias de visitar ${place}?`
        : `Olá ${firstName}, há novidades à sua espera no Spotter Local!`;
    }

    if (accessToken && projectId) {
      const ok = await sendFcmMessage(accessToken, projectId, r.token, title, body);
      if (ok) success++;
      else failure++;
    } else {
      failure++;
    }
  }

  await supabase.from("push_log").insert({
    scheduled_id: campaign.id,
    title: campaign.title,
    body: campaign.body,
    target: campaign.target,
    recipients_count: recipients.length,
    success_count: success,
    failure_count: failure,
  });

  return { recipients: recipients.length, success, failure };
}

Deno.serve(async (req: Request) => {
  try {
    if (!(await isAuthorized(req))) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    // Disparo manual (botão "Enviar agora" no admin) — ignora agendamento.
    if (body?.manual) {
      const result = await processCampaign({ id: null, ...body.manual });
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Disparo agendado (cron): vê tudo o que está activo e decide o que
    // "bate" com a hora actual.
    const { data: campaigns, error } = await supabase
      .from("scheduled_notifications")
      .select("*")
      .eq("active", true);

    if (error) throw error;

    const now = new Date();
    const due = (campaigns ?? []).filter((c: any) => isDue(c, now));
    const results = [];

    for (const c of due) {
      const result = await processCampaign({
        id: c.id,
        title: c.title,
        body: c.body,
        mode: c.mode,
        target: c.target,
        city: c.city,
      });
      await supabase
        .from("scheduled_notifications")
        .update({ last_sent_at: now.toISOString() })
        .eq("id", c.id);
      results.push({ id: c.id, ...result });
    }

    return new Response(JSON.stringify({ processed: due.length, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-scheduled-notifications: erro", err); // fica só no log do Supabase
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
