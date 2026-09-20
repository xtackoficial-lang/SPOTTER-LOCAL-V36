// ============================================================
// XTACK SPOTTER — Módulo partilhado: notificações de reservas
// ------------------------------------------------------------
// Importado por zumbopay-webhook (pagamento/confirmação) e por
// reservation-respond (aceite/recusa do comerciante). Reúne as 3
// notificações que combinámos para cada mudança de estado de uma
// reserva: mensagem no chat (em nome do negócio), push notification
// (Firebase, mesmo mecanismo de send-scheduled-notifications), e
// e-mail para xtackoficial@gmail.com via Resend.
//
// Variáveis de ambiente necessárias (além das já usadas pelo webhook):
//   RESEND_API_KEY        — chave da conta Resend
//   RESEND_FROM           — remetente (sandbox: "onboarding@resend.dev")
//   FIREBASE_SERVICE_ACCOUNT_JSON — já configurado para o push existente
//   ADMIN_NOTIFY_EMAIL    — destino fixo (xtackoficial@gmail.com)
// ============================================================

// @ts-nocheck — ambiente Deno (Supabase Edge Functions).
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "onboarding@resend.dev";
const ADMIN_NOTIFY_EMAIL = Deno.env.get("ADMIN_NOTIFY_EMAIL") ?? "xtackoficial@gmail.com";
const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ---------- 1) Mensagem no chat, em nome do negócio ----------
// receiverId: user_id do cliente (autenticado — ver nota no webhook).
// sender_id tem de ser um auth.users(id) válido — não o business_id —
// por isso busca-se sempre o owner_id do negócio primeiro.
export async function sendReservationChatMessage(
  businessId: string,
  receiverId: string,
  text: string,
): Promise<void> {
  try {
    const { data: biz } = await supabase
      .from("businesses")
      .select("owner_id")
      .eq("id", businessId)
      .maybeSingle();
    if (!biz?.owner_id) {
      console.warn("sendReservationChatMessage: negócio sem owner_id, mensagem não enviada");
      return;
    }
    await supabase.from("messages").insert({
      business_id: businessId,
      sender_id: biz.owner_id,
      receiver_id: receiverId,
      text,
      read: false,
    });
  } catch (err) {
    console.warn("sendReservationChatMessage: falhou, não bloqueia o resto do fluxo", err);
  }
}

// ---------- 2) Push notification ----------
async function getGoogleAccessToken(): Promise<string | null> {
  if (!FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  try {
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
      "pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
    );
    const signatureBuffer = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsigned),
    );
    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const jwt = `${unsigned}.${signature}`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    const tokenData = await tokenRes.json();
    return tokenData.access_token ?? null;
  } catch (err) {
    console.error("getGoogleAccessToken (reservas): falhou", err);
    return null;
  }
}

// userId: user_id do destinatário (cliente OU comerciante).
export async function sendReservationPush(
  userId: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId);
    if (!tokens || tokens.length === 0) return;

    const accessToken = await getGoogleAccessToken();
    if (!accessToken) return;
    const projectId = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON).project_id;

    for (const { token } of tokens) {
      await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: { token, notification: { title, body }, webpush: { fcm_options: { link: "/" } } },
        }),
      }).catch(() => null);
    }
  } catch (err) {
    console.warn("sendReservationPush: falhou, não bloqueia o resto do fluxo", err);
  }
}

// ---------- 3) E-mail para xtackoficial@gmail.com ----------
export async function sendReservationAdminEmail(subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn("sendReservationAdminEmail: RESEND_API_KEY não configurada, e-mail não enviado.");
    return;
  }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [ADMIN_NOTIFY_EMAIL],
        subject,
        html,
      }),
    });
  } catch (err) {
    console.warn("sendReservationAdminEmail: falhou, não bloqueia o resto do fluxo", err);
  }
}

// ---------- Helper: monta o HTML do e-mail a partir de uma reserva ----------
export function buildReservationEmailHtml(rows: Array<[string, string]>): string {
  const items = rows
    .map(([label, value]) => `<tr><td style="padding:4px 12px;color:#666;">${label}</td><td style="padding:4px 12px;"><b>${value}</b></td></tr>`)
    .join("");
  return `<table style="font-family:sans-serif;border-collapse:collapse;">${items}</table>`;
}
