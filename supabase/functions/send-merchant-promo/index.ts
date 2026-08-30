// ============================================================
// XTACK SPOTTER — Edge Function: send-merchant-promo
// ------------------------------------------------------------
// Pedido do Abrão (2026-08-23): comerciantes cujo negócio foi
// adicionado aos favoritos de clientes conseguem mandar-lhes uma
// notificação de promoção, com data de validade ("limite da
// promoção"), ligado a sério ao Firebase — não simulado.
//
// Diferente de send-scheduled-notifications (só admin, qualquer
// segmento de utilizadores), esta função:
//   - só autoriza o DONO do negócio (auth.uid() = businesses.owner_id)
//     ou um admin;
//   - só envia a quem tem o negócio nos favoritos (tabela
//     public.favorites, ver bloco v33 em SUPABASE_SETUP.sql);
//   - limita a 1 promoção por negócio a cada 24h (anti-spam);
//   - grava em public.business_promos (histórico do próprio negócio)
//     e também em push_log (histórico geral), com business_id.
//
// Variáveis de ambiente necessárias (as mesmas já configuradas para
// send-scheduled-notifications — nada de novo a configurar):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//   FIREBASE_SERVICE_ACCOUNT_JSON
// ============================================================

// @ts-nocheck — ambiente Deno (Supabase Edge Functions), tipos diferentes do projecto Vite/React.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const MAX_TITLE_LEN = 60;
const MAX_BODY_LEN = 180;
const MIN_HOURS_BETWEEN_PROMOS = 24;

// ── Autenticação: dono do negócio OU admin ────────────────────────────
async function resolveCaller(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data?.user) return null;
    return { userId: data.user.id };
  } catch {
    return null;
  }
}

async function isOwnerOrAdmin(userId: string, businessId: string): Promise<boolean> {
  const { data: business } = await supabase
    .from("businesses")
    .select("owner_id")
    .eq("id", businessId)
    .maybeSingle();
  if (business?.owner_id === userId) return true;
  const { data: adminRow } = await supabase.from("admins").select("id").eq("id", userId).maybeSingle();
  return !!adminRow;
}

// ── Mesma lógica de assinatura/envio FCM que send-scheduled-notifications ──
// (duplicada de propósito: Edge Functions do Supabase são publicadas
// isoladamente umas das outras; manter cada uma autocontida evita ter de
// gerir um módulo partilhado extra no deploy.)
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
  businessId: string,
): Promise<boolean> {
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          webpush: {
            // Leva o cliente direto ao perfil do negócio que mandou a
            // promoção, em vez de cair na página inicial genérica.
            fcm_options: { link: `/place/${businessId}` },
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

Deno.serve(async (req: Request) => {
  try {
    const caller = await resolveCaller(req);
    if (!caller) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { businessId, title, body, validUntil } = payload ?? {};

    if (!businessId || !title || !body || !validUntil) {
      return new Response(JSON.stringify({ error: "campos_em_falta" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(title).length > MAX_TITLE_LEN || String(body).length > MAX_BODY_LEN) {
      return new Response(JSON.stringify({ error: "texto_demasiado_longo" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const authorized = await isOwnerOrAdmin(caller.userId, businessId);
    if (!authorized) {
      return new Response(JSON.stringify({ error: "nao_e_dono_deste_negocio" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Anti-spam: no máximo 1 promoção por negócio a cada 24h.
    const { data: recentPromo } = await supabase
      .from("business_promos")
      .select("id, created_at")
      .eq("business_id", businessId)
      .gt("created_at", new Date(Date.now() - MIN_HOURS_BETWEEN_PROMOS * 3600 * 1000).toISOString())
      .limit(1)
      .maybeSingle();
    if (recentPromo) {
      return new Response(JSON.stringify({ error: "limite_diario_atingido" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Resolve destinatários: quem favoritou este negócio E tem um token
    // FCM registado (pode ter favoritado num dispositivo e nunca ter
    // activado notificações, ou vice-versa).
    const { data: favRows } = await supabase
      .from("favorites")
      .select("user_id")
      .eq("business_id", businessId);
    const favUserIds = (favRows ?? []).map((r: any) => r.user_id);

    let tokens: string[] = [];
    if (favUserIds.length > 0) {
      const { data: tokenRows } = await supabase
        .from("push_tokens")
        .select("token")
        .in("user_id", favUserIds);
      tokens = (tokenRows ?? []).map((r: any) => r.token).filter(Boolean);
    }

    let success = 0;
    let failure = 0;

    if (tokens.length > 0 && FIREBASE_SERVICE_ACCOUNT_JSON) {
      const accessToken = await getGoogleAccessToken();
      const projectId = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON).project_id;
      for (const token of tokens) {
        const ok = await sendFcmMessage(accessToken, projectId, token, title, body, businessId);
        if (ok) success++;
        else failure++;
      }
    } else {
      failure = tokens.length;
    }

    const { data: promoRow } = await supabase
      .from("business_promos")
      .insert({
        business_id: businessId,
        title,
        body,
        valid_until: validUntil,
        recipients_count: tokens.length,
        success_count: success,
      })
      .select("id")
      .single();

    await supabase.from("push_log").insert({
      title,
      body,
      target: "business_favorites",
      business_id: businessId,
      recipients_count: tokens.length,
      success_count: success,
      failure_count: failure,
    });

    return new Response(
      JSON.stringify({ id: promoRow?.id, recipients: tokens.length, success, failure }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-merchant-promo: erro", err); // fica só no log do Supabase
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
