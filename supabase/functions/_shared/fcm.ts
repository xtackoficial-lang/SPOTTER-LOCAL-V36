// @ts-nocheck — ambiente Deno (Supabase Edge Functions).
// ============================================================
// SPOTTER — Envio de push via FCM HTTP v1 (partilhado)
// ------------------------------------------------------------
// Mesmo método das outras funções (JWT RS256 da Service Account, só Web Crypto),
// agora num sítio só. Usado por notify-new-events.
// ============================================================
const b64url = (input: string | Uint8Array) => {
  const bin = typeof input === "string" ? btoa(input) : btoa(String.fromCharCode(...input));
  return bin.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Devolve o access token do Google e o id do projecto Firebase. Lança erro se falhar. */
export async function getGoogleAccessToken(serviceAccountJson: string) {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.` +
    b64url(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    );
  const pem = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${b64url(new Uint8Array(sig))}`,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Falha ao obter access token Google");
  return { accessToken: data.access_token as string, projectId: sa.project_id as string };
}

export interface FcmMessage {
  token: string;
  title: string;
  body: string;
  image?: string; // foto grande na notificação (https)
  link?: string; // https absoluto: abre ao tocar na notificação
  url?: string; // caminho dentro da app (ex.: /events) para o service worker abrir
}

/** ok = entregue ao FCM; unregistered = token morto (404) → deve ser apagado. */
export async function sendFcm(accessToken: string, projectId: string, m: FcmMessage) {
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
            ...(m.image && /^https:\/\//.test(m.image) ? { image: m.image } : {}),
          },
          ...(m.url && m.url.startsWith("/") ? { data: { url: m.url } } : {}),
          webpush: {
            notification: { icon: "/icon-192.png" },
            ...(m.link && /^https:\/\//.test(m.link) ? { fcm_options: { link: m.link } } : {}),
          },
        },
      }),
    });
    return { ok: res.ok, unregistered: res.status === 404 };
  } catch {
    return { ok: false, unregistered: false };
  }
}
