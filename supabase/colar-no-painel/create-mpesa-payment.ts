// @ts-nocheck — ficheiro único para colar no painel do Supabase (gerado de supabase/functions/create-mpesa-payment).
// create-mpesa-payment/index.ts
import { createClient as createClient2 } from "jsr:@supabase/supabase-js@2";

// _shared/rate-limit.ts
async function rateLimit(sb, key, limit, windowSeconds) {
  try {
    const { data, error } = await sb.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("resposta vazia");
    return {
      allowed: !!row.allowed,
      remaining: row.remaining ?? 0,
      retryAfter: row.retry_after ?? 0,
    };
  } catch (e) {
    console.error("rate-limit: falha ao verificar (pedido deixado passar)", e);
    return { allowed: true, remaining: limit, retryAfter: 0 };
  }
}
function tooManyRequests(retryAfter, headers2 = {}) {
  const secs = Math.max(1, Math.ceil(retryAfter));
  const wait = secs >= 120 ? `${Math.ceil(secs / 60)} minutos` : `${secs} segundos`;
  return new Response(
    JSON.stringify({
      error: `Fizeste demasiados pedidos. Tenta de novo daqui a ${wait}.`,
      code: "rate_limited",
      retryAfter: secs,
    }),
    {
      status: 429,
      headers: { ...headers2, "Content-Type": "application/json", "Retry-After": String(secs) },
    },
  );
}
function clientIp(req) {
  return (
    (req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-real-ip") ??
      (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ??
      "unknown") ||
    "unknown"
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
  translate: { limit: 40, window: 60 },
  // 40 traduções / minuto por utilizador
};

// _shared/validators.ts
var MZ_MOBILE = /^8[2-7]\d{7}$/;
function digitsOnly(s) {
  return s.replace(/[\s().-]/g, "");
}
function looksFake(d) {
  if (/^(\d)\1+$/.test(d)) return true;
  if ("0123456789012345".includes(d) || "9876543210987654".includes(d)) return true;
  if (/(\d)\1{6,}/.test(d)) return true;
  return false;
}
function normalizePhone(raw) {
  const input = (raw ?? "").trim();
  if (!input) return { ok: false, error: "Indica o n\xFAmero de telem\xF3vel." };
  if (/[^\d\s+().-]/.test(input)) {
    return { ok: false, error: "O n\xFAmero s\xF3 pode ter d\xEDgitos (ex: 84 123 4567)." };
  }
  let d = digitsOnly(input);
  const hasPlus = d.startsWith("+");
  if (hasPlus) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  if (d.includes("+")) return { ok: false, error: "N\xFAmero inv\xE1lido." };
  if (d.startsWith("258")) {
    const national = d.slice(3);
    if (national.length !== 9) {
      return {
        ok: false,
        error:
          national.length > 9
            ? "O n\xFAmero tem d\xEDgitos a mais. Em Mo\xE7ambique s\xE3o 9 d\xEDgitos (ex: 84 123 4567)."
            : "O n\xFAmero tem d\xEDgitos a menos. Em Mo\xE7ambique s\xE3o 9 d\xEDgitos (ex: 84 123 4567).",
      };
    }
    if (!MZ_MOBILE.test(national) || looksFake(national)) {
      return {
        ok: false,
        error: "N\xFAmero inv\xE1lido. Tem de come\xE7ar por 82, 83, 84, 85, 86 ou 87.",
      };
    }
    return { ok: true, value: `+258${national}` };
  }
  if (!hasPlus && !d.startsWith("00") && d.length <= 9) {
    if (d.length > 9) return { ok: false, error: "O n\xFAmero tem d\xEDgitos a mais." };
    if (d.length < 9) {
      return {
        ok: false,
        error:
          "O n\xFAmero tem d\xEDgitos a menos. Em Mo\xE7ambique s\xE3o 9 d\xEDgitos (ex: 84 123 4567).",
      };
    }
    if (!MZ_MOBILE.test(d) || looksFake(d)) {
      return {
        ok: false,
        error: "N\xFAmero inv\xE1lido. Tem de come\xE7ar por 82, 83, 84, 85, 86 ou 87.",
      };
    }
    return { ok: true, value: `+258${d}` };
  }
  if (!hasPlus && !input.trim().startsWith("00")) {
    return {
      ok: false,
      error:
        "O n\xFAmero tem d\xEDgitos a mais. Em Mo\xE7ambique s\xE3o 9 d\xEDgitos (ex: 84 123 4567).",
    };
  }
  if (d.length < 8 || d.length > 15 || d.startsWith("0") || looksFake(d)) {
    return {
      ok: false,
      error: "N\xFAmero internacional inv\xE1lido. Usa o formato +indicativo n\xFAmero.",
    };
  }
  return { ok: true, value: `+${d}` };
}
function normalizeWalletPhone(raw, method) {
  const r = normalizePhone(raw);
  if (!r.ok) return r;
  const m = /^\+258(8\d)\d{7}$/.exec(r.value);
  if (!m)
    return { ok: false, error: "Para pagar por telem\xF3vel usa um n\xFAmero de Mo\xE7ambique." };
  const prefix = m[1];
  if (method === "mpesa" && !["84", "85"].includes(prefix)) {
    return { ok: false, error: "M-Pesa s\xF3 funciona com n\xFAmeros 84 ou 85." };
  }
  if (method === "emola" && !["86", "87"].includes(prefix)) {
    return { ok: false, error: "e-Mola s\xF3 funciona com n\xFAmeros 86 ou 87." };
  }
  return r;
}
var EMAIL_RE =
  /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;
var DOMAIN_TYPOS = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmaill.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmail.om": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotnail.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.co": "outlook.com",
  "outlook.con": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yhoo.com": "yahoo.com",
  "icloud.co": "icloud.com",
  "icloud.con": "icloud.com",
};
var DISPOSABLE = /* @__PURE__ */ new Set([
  "mailinator.com",
  "10minutemail.com",
  "guerrillamail.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "trashmail.com",
  "sharklasers.com",
  "getnada.com",
  "maildrop.cc",
  "throwawaymail.com",
  "dispostable.com",
  "fakeinbox.com",
  "mailnesia.com",
  "moakt.com",
  "tempmailo.com",
  "emailondeck.com",
  "mohmal.com",
  "burnermail.io",
  "spamgourmet.com",
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "teste.com",
  "email.com.br.invalid",
  "mail.com.invalid",
  "invalid.com",
  "asdf.com",
  "abc.com",
  "xxx.com",
  "a.com",
]);
function validateEmail(raw) {
  const email = (raw ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "Indica o teu email." };
  if (email.length > 254) return { ok: false, error: "Email demasiado longo." };
  if (/\s/.test(email)) return { ok: false, error: "O email n\xE3o pode ter espa\xE7os." };
  if (email.includes("..") || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Esse email n\xE3o parece v\xE1lido. Exemplo: nome@gmail.com" };
  }
  const [local, domain] = email.split("@");
  if (/^(.)\1{3,}$/.test(local) && local.length < 8) {
    return { ok: false, error: "Esse email n\xE3o parece real. Usa o teu email verdadeiro." };
  }
  if (DOMAIN_TYPOS[domain]) {
    return {
      ok: false,
      error: `Ser\xE1 que queres dizer ${local}@${DOMAIN_TYPOS[domain]}? Confirma o email.`,
    };
  }
  if (DISPOSABLE.has(domain)) {
    return {
      ok: false,
      error: "N\xE3o aceitamos emails tempor\xE1rios. Usa o teu email verdadeiro.",
    };
  }
  return { ok: true, value: email };
}
function validatePersonName(raw, label = "nome") {
  const name = (raw ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: `Indica o teu ${label}.` };
  if (name.length > 80) return { ok: false, error: `O ${label} \xE9 demasiado longo.` };
  if (!/^[\p{L}][\p{L}\p{M}' .-]*$/u.test(name)) {
    return {
      ok: false,
      error: `O ${label} s\xF3 pode ter letras (sem n\xFAmeros ou s\xEDmbolos).`,
    };
  }
  if (/(.)\1{3,}/u.test(name)) {
    return { ok: false, error: `Escreve o teu ${label} verdadeiro.` };
  }
  return { ok: true, value: name };
}

// _shared/mpesa.ts
import { Buffer } from "node:buffer";
import { constants, publicEncrypt } from "node:crypto";
var ENV = (Deno.env.get("MPESA_ENV") ?? "sandbox").toLowerCase();
var MPESA_IS_PRODUCTION = ENV === "production";
var HOST =
  Deno.env.get("MPESA_HOST") ?? (MPESA_IS_PRODUCTION ? "api.vm.co.mz" : "api.sandbox.vm.co.mz");
var C2B_PORT = Deno.env.get("MPESA_C2B_PORT") ?? "18352";
var QUERY_PORT = Deno.env.get("MPESA_QUERY_PORT") ?? "18353";
var ORIGIN = Deno.env.get("MPESA_ORIGIN") ?? "developer.mpesa.vm.co.mz";
var API_KEY = Deno.env.get("MPESA_API_KEY") ?? "";
var PUBLIC_KEY = Deno.env.get("MPESA_PUBLIC_KEY") ?? "";
var SERVICE_PROVIDER_CODE = Deno.env.get("MPESA_SERVICE_PROVIDER_CODE") ?? "";
var C2B_TIMEOUT_MS = 7e4;
var QUERY_TIMEOUT_MS = 15e3;
function mpesaConfigured() {
  return !!API_KEY && !!PUBLIC_KEY && !!SERVICE_PROVIDER_CODE;
}
function toPem(publicKey) {
  const raw = publicKey.trim();
  if (raw.includes("BEGIN")) return raw;
  const body = raw.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----
${lines.join("\n")}
-----END PUBLIC KEY-----`;
}
function buildBearerToken(apiKey = API_KEY, publicKey = PUBLIC_KEY) {
  const encrypted = publicEncrypt(
    { key: toPem(publicKey), padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(apiKey, "utf8"),
  );
  return encrypted.toString("base64");
}
function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${buildBearerToken()}`,
    Origin: ORIGIN,
  };
}
function toMsisdn(phone) {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (d.startsWith("258") && d.length === 12) return d;
  if (d.length === 9) return `258${d}`;
  return d;
}
var FAILED_MESSAGES = {
  "INS-5": "O pagamento foi cancelado no telem\xF3vel.",
  "INS-6": "O pagamento falhou. Tenta outra vez.",
  "INS-9":
    "N\xE3o confirmaste o pagamento a tempo. Tenta outra vez e digita o PIN quando aparecer.",
  "INS-10": "J\xE1 existe um pagamento igual em curso. Espera um minuto e tenta outra vez.",
  "INS-13": "Pagamento indispon\xEDvel de momento (configura\xE7\xE3o).",
  "INS-15": "Valor inv\xE1lido.",
  "INS-2006": "Saldo M-Pesa insuficiente.",
  "INS-2051": "N\xFAmero M-Pesa inv\xE1lido. Confirma o n\xFAmero (84 ou 85).",
  "INS-996": "A tua conta M-Pesa n\xE3o est\xE1 activa.",
  "INS-995": "H\xE1 um problema com a tua conta M-Pesa. Contacta a Vodacom.",
  "INS-4": "Este n\xFAmero n\xE3o tem conta M-Pesa activa.",
};
var UNKNOWN_CODES = /* @__PURE__ */ new Set(["INS-1", "INS-9", "INS-16", "INS-23"]);
function interpret(json2) {
  const code = String(json2?.output_ResponseCode ?? "");
  const description = String(json2?.output_ResponseDesc ?? "");
  if (code === "INS-0") {
    return {
      state: "success",
      transactionId: json2?.output_TransactionID ?? null,
      code,
      description,
    };
  }
  if (!code || UNKNOWN_CODES.has(code)) return { state: "unknown", code, description };
  return {
    state: "failed",
    code,
    description,
    userMessage: FAILED_MESSAGES[code] ?? "O pagamento n\xE3o foi conclu\xEDdo. Tenta outra vez.",
  };
}
async function postJson(url, body, timeoutMs) {
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let json2 = null;
  try {
    json2 = await res.json();
  } catch {}
  return { status: res.status, json: json2 };
}
async function c2bSingleStage(opts) {
  const { status, json: json2 } = await postJson(
    `https://${HOST}:${C2B_PORT}/ipg/v1x/c2bPayment/singleStage/`,
    {
      input_TransactionReference: opts.transactionReference,
      input_CustomerMSISDN: opts.msisdn,
      input_Amount: Number.isInteger(opts.amount) ? String(opts.amount) : opts.amount.toFixed(2),
      input_ThirdPartyReference: opts.thirdPartyReference,
      input_ServiceProviderCode: SERVICE_PROVIDER_CODE,
    },
    C2B_TIMEOUT_MS,
  );
  console.log("mpesa c2b", status, json2?.output_ResponseCode, json2?.output_ResponseDesc);
  return { ...interpret(json2), httpStatus: status };
}
async function queryTransactionStatus(thirdPartyReference, queryReference) {
  const qs = new URLSearchParams({
    input_QueryReference: queryReference,
    input_ServiceProviderCode: SERVICE_PROVIDER_CODE,
    input_ThirdPartyReference: thirdPartyReference,
  });
  try {
    const res = await fetch(`https://${HOST}:${QUERY_PORT}/ipg/v1x/queryTransactionStatus/?${qs}`, {
      method: "GET",
      headers: headers(),
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    });
    const json2 = await res.json().catch(() => null);
    console.log("mpesa query", res.status, JSON.stringify(json2));
    const txStatus = String(json2?.output_ResponseTransactionStatus ?? "");
    if (/complet|success/i.test(txStatus)) return "success";
    if (/cancel|fail|expire|reject|declin/i.test(txStatus)) return "failed";
    return "pending";
  } catch (err) {
    console.warn("mpesa query: falhou", err);
    return "pending";
  }
}

// _shared/reservation-notify.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
var SUPABASE_URL = Deno.env.get("SUPABASE_URL");
var SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
var RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "onboarding@resend.dev";
var ADMIN_NOTIFY_EMAIL = Deno.env.get("ADMIN_NOTIFY_EMAIL") ?? "xtackoficial@gmail.com";
var FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";
var supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
async function sendReservationChatMessage(businessId, receiverId, text) {
  try {
    const { data: biz } = await supabase
      .from("businesses")
      .select("owner_id")
      .eq("id", businessId)
      .maybeSingle();
    if (!biz?.owner_id) {
      console.warn("sendReservationChatMessage: neg\xF3cio sem owner_id, mensagem n\xE3o enviada");
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
    console.warn("sendReservationChatMessage: falhou, n\xE3o bloqueia o resto do fluxo", err);
  }
}
async function getGoogleAccessToken() {
  if (!FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  try {
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
    const now = Math.floor(Date.now() / 1e3);
    const header = { alg: "RS256", typ: "JWT" };
    const claimSet = {
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };
    const encode = (obj) =>
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
async function sendReservationPush(userId, title, body) {
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
          message: {
            token,
            notification: { title, body },
            webpush: { fcm_options: { link: "/" } },
          },
        }),
      }).catch(() => null);
    }
  } catch (err) {
    console.warn("sendReservationPush: falhou, n\xE3o bloqueia o resto do fluxo", err);
  }
}
async function sendReservationAdminEmail(subject, html) {
  if (!RESEND_API_KEY) {
    console.warn(
      "sendReservationAdminEmail: RESEND_API_KEY n\xE3o configurada, e-mail n\xE3o enviado.",
    );
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
    console.warn("sendReservationAdminEmail: falhou, n\xE3o bloqueia o resto do fluxo", err);
  }
}
function buildReservationEmailHtml(rows) {
  const items = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px;color:#666;">${label}</td><td style="padding:4px 12px;"><b>${value}</b></td></tr>`,
    )
    .join("");
  return `<table style="font-family:sans-serif;border-collapse:collapse;">${items}</table>`;
}
var RESPONSE_DEADLINE_HOURS = 24;
function responseDeadlineFrom(now = /* @__PURE__ */ new Date()) {
  return new Date(now.getTime() + RESPONSE_DEADLINE_HOURS * 3600 * 1e3);
}
function formatDeadline(d) {
  return d.toLocaleString("pt-PT", {
    timeZone: "Africa/Maputo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// _shared/fulfill-payment.ts
async function fulfillPayment(supabase3, payment) {
  const now = /* @__PURE__ */ new Date().toISOString();
  if (payment.plan_id === "boost") {
    const BOOST_DAYS2 = { "1d": 1, "7d": 7, "30d": 30 };
    const packageId = payment.boost_package_id ?? "1d";
    const days = BOOST_DAYS2[packageId] ?? 1;
    const CAT_OFFSET_MIN = 120;
    const nowDate = /* @__PURE__ */ new Date();
    const catNow = new Date(nowDate.getTime() + CAT_OFFSET_MIN * 60 * 1e3);
    const targetDayCAT = new Date(
      Date.UTC(catNow.getUTCFullYear(), catNow.getUTCMonth(), catNow.getUTCDate() + days, 0, 0, 0),
    );
    const expiresAt = new Date(targetDayCAT.getTime() - CAT_OFFSET_MIN * 60 * 1e3);
    await supabase3.from("business_boosts").insert({
      business_id: payment.business_id,
      payment_id: payment.id,
      package_id: packageId,
      duration_days: days,
      activated_at: now,
      expires_at: expiresAt.toISOString(),
    });
  } else if (payment.plan_id === "post") {
    const POST_HOURS2 = { "24h": 24, "3d": 72, "7d": 168 };
    const packageId = payment.boost_package_id ?? "24h";
    const hours = POST_HOURS2[packageId] ?? 24;
    const meta = payment.content_metadata ?? {};
    const nowDate = /* @__PURE__ */ new Date();
    const expiresAt = new Date(nowDate.getTime() + hours * 60 * 60 * 1e3);
    await supabase3.from("business_posts").insert({
      business_id: payment.business_id,
      photo_url: meta.photo_url ?? meta.photoUrl ?? "",
      caption: meta.caption ?? null,
      city: meta.city ?? null,
      package_id: packageId,
      payment_id: payment.id,
      status: "active",
      published_at: now,
      expires_at: expiresAt.toISOString(),
    });
  } else if (payment.plan_id === "event") {
    const meta = payment.content_metadata ?? {};
    const eventDays = Number(meta.days);
    const eventExpiresAt =
      eventDays >= 1 ? new Date(Date.now() + eventDays * 864e5).toISOString() : null;
    const endRaw = String(meta.event_end_date ?? meta.eventEndDate ?? "");
    const eventEndDate = /^\d{4}-\d{2}-\d{2}$/.test(endRaw) ? endRaw : null;
    const eventRow = {
      business_id: payment.business_id,
      poster_url: meta.poster_url ?? meta.posterUrl ?? "",
      title: meta.title ?? "Evento",
      ticket_phone: meta.ticket_phone ?? meta.ticketPhone ?? null,
      ticket_link: meta.ticket_link ?? meta.ticketLink ?? null,
      event_date: meta.event_date ?? meta.eventDate ?? null,
      event_end_date: eventEndDate,
      city: meta.city ?? null,
      tier: payment.boost_package_id ?? "standard",
      payment_id: payment.id,
      status: "active",
      expires_at: eventExpiresAt,
    };
    const evInsert = await supabase3.from("events").insert(eventRow);
    if (evInsert.error && /expires_at|event_end_date/.test(evInsert.error.message ?? "")) {
      console.warn("events: colunas novas em falta, a publicar sem elas:", evInsert.error.message);
      const { expires_at: _x, event_end_date: _y, ...legacyRow } = eventRow;
      await supabase3.from("events").insert(legacyRow);
    }
  } else if (payment.plan_id === "room") {
    const meta = payment.content_metadata ?? {};
    const { data: room } = await supabase3
      .from("business_rooms")
      .select("business_id")
      .eq("id", meta.roomId)
      .maybeSingle();
    const { data: biz } = await supabase3
      .from("businesses")
      .select("business_name, owner_id")
      .eq("id", payment.business_id)
      .maybeSingle();
    const deadline = responseDeadlineFrom();
    const isFull = meta.paymentOption === "full";
    const isHourly = meta.bookingUnit === "hour";
    const stayText = isHourly
      ? `${meta.checkIn} \xE0s ${meta.startTime} (${meta.hours}h)`
      : `${meta.checkIn} a ${meta.checkOut}`;
    const { data: reservation } = await supabase3
      .from("room_reservations")
      .insert({
        business_id: payment.business_id,
        room_id: meta.roomId,
        client_user_id: meta.clientUserId,
        client_name: meta.clientName,
        client_phone: meta.clientPhone,
        client_email: meta.clientEmail ?? null,
        check_in: meta.checkIn,
        check_out: meta.checkOut,
        guests: meta.guests,
        special_request: meta.specialRequest ?? null,
        nights: meta.nights,
        booking_unit: meta.bookingUnit ?? "night",
        hours: meta.hours ?? null,
        start_time: meta.startTime ?? null,
        total_price: meta.totalPrice,
        commission_amount: meta.commissionAmount,
        payment_option: meta.paymentOption ?? "deposit",
        amount_paid: meta.amountPaid ?? payment.amount,
        balance_due: meta.balanceDue ?? 0,
        response_deadline: deadline.toISOString(),
        payment_id: payment.id,
        status: "pending_approval",
      })
      .select()
      .single();
    const businessName = biz?.business_name ?? "o neg\xF3cio";
    if (meta.clientUserId) {
      await sendReservationChatMessage(
        payment.business_id,
        meta.clientUserId,
        `Recebemos o seu pedido de reserva \u2014 ${meta.roomName}, ${stayText}, ${meta.guests} h\xF3spede(s). Pagou ${meta.amountPaid} MT (${isFull ? "valor total" : "sinal de 20%"}). ${businessName} responde at\xE9 ${formatDeadline(deadline)}.`,
      );
      await sendReservationPush(
        meta.clientUserId,
        "Pedido de reserva enviado",
        `A aguardar confirma\xE7\xE3o de ${businessName}.`,
      );
    }
    if (biz?.owner_id) {
      await sendReservationPush(
        biz.owner_id,
        "Nova reserva de quarto pendente",
        `${meta.roomName} \u2014 ${stayText} \u2014 responda at\xE9 ${formatDeadline(deadline)}.`,
      );
    }
    await sendReservationAdminEmail(
      `Reserva de quarto paga \u2014 ${businessName}`,
      buildReservationEmailHtml([
        ["Neg\xF3cio", businessName],
        ["Quarto", String(meta.roomName ?? "")],
        [
          isHourly ? "Reserva por hora" : "Check-in / Check-out",
          isHourly ? stayText : `${meta.checkIn} \u2192 ${meta.checkOut} (${meta.nights} noites)`,
        ],
        ["H\xF3spedes", String(meta.guests ?? "")],
        ["Cliente", `${meta.clientName} \u2014 ${meta.clientPhone}`],
        ["E-mail do cliente", String(meta.clientEmail ?? "\u2014")],
        ["Valor total da estadia", `${meta.totalPrice} MT`],
        ["Op\xE7\xE3o de pagamento", isFull ? "Pagamento total (100%)" : "Sinal de 20%"],
        ["Pago agora", `${meta.amountPaid} MT`],
        ["Restante a pagar no hotel", `${meta.balanceDue} MT`],
        ["Comiss\xE3o Spotter (10% do total)", `${meta.commissionAmount} MT`],
        [
          "A repassar ao hotel",
          `${Math.round((Number(meta.amountPaid) - Number(meta.commissionAmount)) * 100) / 100} MT`,
        ],
        ["Pedido especial", String(meta.specialRequest ?? "\u2014")],
        ["Estado", `Pendente \u2014 hotel responde at\xE9 ${formatDeadline(deadline)}`],
      ]),
    );
  } else if (payment.plan_id === "table") {
    const meta = payment.content_metadata ?? {};
    const { data: biz } = await supabase3
      .from("businesses")
      .select("business_name, owner_id")
      .eq("id", payment.business_id)
      .maybeSingle();
    await supabase3.from("table_reservations").insert({
      business_id: payment.business_id,
      client_user_id: meta.clientUserId,
      client_name: meta.clientName,
      client_phone: meta.clientPhone,
      client_email: meta.clientEmail ?? null,
      reservation_date: meta.reservationDate,
      time_slot: meta.timeSlot,
      guests: meta.guests,
      special_request: meta.specialRequest ?? null,
      tipo: meta.tipo ?? "normal",
      price: meta.price,
      commission_amount: meta.commissionAmount,
      payout_amount: meta.payoutAmount,
      payment_id: payment.id,
      status: "confirmed",
    });
    const businessName = biz?.business_name ?? "o neg\xF3cio";
    if (meta.clientUserId) {
      await sendReservationChatMessage(
        payment.business_id,
        meta.clientUserId,
        `A sua reserva est\xE1 confirmada \u2014 Mesa para ${meta.guests}, ${meta.reservationDate} \xE0s ${meta.timeSlot}. Vemo-nos l\xE1!`,
      );
      await sendReservationPush(
        meta.clientUserId,
        "Reserva de mesa confirmada",
        `${businessName} \u2014 ${meta.reservationDate} \xE0s ${meta.timeSlot}.`,
      );
    }
    if (biz?.owner_id) {
      await sendReservationPush(
        biz.owner_id,
        "Nova reserva de mesa confirmada",
        `${meta.reservationDate} \xE0s ${meta.timeSlot} \u2014 ${meta.guests} pessoa(s).`,
      );
    }
    await sendReservationAdminEmail(
      `Reserva de mesa paga \u2014 ${businessName}`,
      buildReservationEmailHtml([
        ["Neg\xF3cio", businessName],
        ["Data / hora", `${meta.reservationDate} \u2014 ${meta.timeSlot}`],
        ["Pessoas", String(meta.guests ?? "")],
        ["Cliente", `${meta.clientName} \u2014 ${meta.clientPhone}`],
        ["Tipo", String(meta.tipo ?? "normal")],
        ["Valor total pago", `${meta.price} MT`],
        ["A tua comiss\xE3o", `${meta.commissionAmount} MT`],
        ["A repassar ao neg\xF3cio", `${meta.payoutAmount} MT (repassado: n\xE3o)`],
        ["Pedido especial", String(meta.specialRequest ?? "\u2014")],
        ["Estado", "Confirmada automaticamente"],
      ]),
    );
  } else if (payment.plan_id) {
    const renewsAt = /* @__PURE__ */ new Date();
    renewsAt.setMonth(renewsAt.getMonth() + 1);
    const { error: planUpdateError } = await supabase3
      .from("businesses")
      .update({
        plan_status: "active",
        plan_id: payment.plan_id,
        last_payment_at: now,
        plan_renews_at: renewsAt.toISOString(),
      })
      .eq("id", payment.business_id);
    if (planUpdateError) {
      console.error(
        "fulfillPayment: pagamento confirmado mas falhou activar o plano",
        payment.business_id,
        payment.plan_id,
        planUpdateError,
      );
    }
  }
}

// create-mpesa-payment/index.ts
var SUPABASE_URL2 = Deno.env.get("SUPABASE_URL");
var SERVICE_ROLE_KEY2 = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var supabase2 = createClient2(SUPABASE_URL2, SERVICE_ROLE_KEY2);
var SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
async function getAuthenticatedUserId(req) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || !SUPABASE_ANON_KEY) return null;
  try {
    const userClient = createClient2(SUPABASE_URL2, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
var PLAN_PRICES = {
  starter: 300,
  pro: 500,
  premium: 900,
};
var BOOST_PRICE_PER_DAY = 60;
var BOOST_DAYS = { "1d": 1, "7d": 7, "30d": 30 };
var POST_PRICES = { "24h": 50, "3d": 120, "7d": 250 };
var POST_HOURS = { "24h": 24, "3d": 72, "7d": 168 };
var EVENT_PRICES = { standard: 100, featured: 250 };
var EVENT_PRICE_PER_DAY = 50;
var EVENT_MAX_DAYS = 30;
var ROOM_DEPOSIT_PCT = 0.2;
var ROOM_COMMISSION_PCT = 0.1;
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
var ROOM_CATEGORIES = ["hotel", "hotel_restaurant", "pension"];
var TABLE_CATEGORIES = ["hotel", "hotel_restaurant", "restaurant", "snack_bar", "tourism_site"];
function makeRef(businessId, planId) {
  const ts = Date.now().toString(36).toUpperCase();
  const bid = businessId
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 3)
    .toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `XL${bid}${planId.slice(0, 1).toUpperCase()}${ts}${rnd}`.slice(0, 20);
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }
  {
    const rl = await rateLimit(supabase2, `pay:ip:${clientIp(req)}`, 30, LIMITS.payment.window);
    if (!rl.allowed) return tooManyRequests(rl.retryAfter, CORS_HEADERS);
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "corpo do pedido inv\xE1lido (JSON esperado)" }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }
  if (body.action === "check") {
    try {
      return await handleCheck(req, body.paymentId);
    } catch (err) {
      console.error("create-mpesa-payment: erro no check", err);
      return json({ error: "internal_error" }, 500);
    }
  }
  let {
    businessId,
    planId,
    boostPackageId,
    postPackageId,
    eventTier,
    eventDays,
    contentMetadata,
    roomId,
    paymentOption,
    checkIn,
    checkOut,
    bookingUnit,
    hours,
    startTime,
    guests,
    specialRequest,
    clientName,
    clientPhone,
    clientEmail,
    reservationDate,
    timeSlot,
    tableTipo,
    payerPhone,
  } = body;
  try {
    const isBoost = planId === "boost";
    const isPost = planId === "post";
    const isEvent = planId === "event";
    const isRoom = planId === "room";
    const isTable = planId === "table";
    const boostDays = isBoost ? BOOST_DAYS[boostPackageId ?? ""] : void 0;
    const postHours = isPost ? POST_HOURS[postPackageId ?? ""] : void 0;
    const eventDaysNum = isEvent && eventDays != null ? Math.round(Number(eventDays)) : null;
    const eventDaysOk = eventDaysNum != null && eventDaysNum >= 1 && eventDaysNum <= EVENT_MAX_DAYS;
    const eventPrice = isEvent
      ? eventDays != null
        ? eventDaysOk
          ? eventDaysNum * EVENT_PRICE_PER_DAY
          : void 0
        : EVENT_PRICES[eventTier ?? "standard"]
      : void 0;
    let authenticatedUserId = null;
    if (isRoom || isTable) {
      authenticatedUserId = await getAuthenticatedUserId(req);
      if (!authenticatedUserId) {
        return new Response(
          JSON.stringify({ error: "\xC9 preciso estar autenticado para fazer uma reserva" }),
          { status: 401, headers: CORS_HEADERS },
        );
      }
      {
        const rl = await rateLimit(
          supabase2,
          `pay:${authenticatedUserId}`,
          LIMITS.payment.limit,
          LIMITS.payment.window,
        );
        if (!rl.allowed) return tooManyRequests(rl.retryAfter, CORS_HEADERS);
      }
    }
    const validoBase =
      businessId &&
      typeof businessId === "string" &&
      planId &&
      (isBoost
        ? !!boostDays
        : isPost
          ? !!postHours
          : isEvent
            ? !!eventPrice
            : isRoom
              ? !!roomId &&
                !!checkIn &&
                (!!checkOut || bookingUnit === "hour") &&
                !!guests &&
                !!clientName &&
                !!clientPhone
              : isTable
                ? !!reservationDate && !!timeSlot && !!guests && !!clientName && !!clientPhone
                : !!PLAN_PRICES[planId]);
    if (!validoBase) {
      return new Response(
        JSON.stringify({ error: "businessId, planId, ou dados da reserva incompletos" }),
        { status: 400, headers: CORS_HEADERS },
      );
    }
    const payerCheck = normalizeWalletPhone(payerPhone ?? "", "mpesa");
    if (!payerCheck.ok) {
      return json({ error: payerCheck.error }, 400);
    }
    const msisdn = toMsisdn(payerCheck.value);
    if (isRoom || isTable) {
      const nameCheck = validatePersonName(clientName ?? "", "nome");
      if (!nameCheck.ok) {
        return new Response(JSON.stringify({ error: nameCheck.error }), {
          status: 400,
          headers: CORS_HEADERS,
        });
      }
      const phoneCheck = normalizePhone(clientPhone ?? "");
      if (!phoneCheck.ok) {
        return new Response(JSON.stringify({ error: phoneCheck.error }), {
          status: 400,
          headers: CORS_HEADERS,
        });
      }
      if (clientEmail) {
        const emailCheck = validateEmail(clientEmail);
        if (!emailCheck.ok) {
          return new Response(JSON.stringify({ error: emailCheck.error }), {
            status: 400,
            headers: CORS_HEADERS,
          });
        }
        clientEmail = emailCheck.value;
      }
      const guestsNum = Number(guests);
      if (!Number.isInteger(guestsNum) || guestsNum < 1 || guestsNum > 50) {
        return new Response(
          JSON.stringify({ error: "N\xFAmero de pessoas inv\xE1lido (1 a 50)." }),
          {
            status: 400,
            headers: CORS_HEADERS,
          },
        );
      }
      clientName = nameCheck.value;
      clientPhone = phoneCheck.value;
    }
    let roomReservationMeta = null;
    let tableReservationMeta = null;
    let amount;
    if (isRoom) {
      const { data: room, error: roomErr } = await supabase2
        .from("business_rooms")
        .select("id, business_id, name, price_per_night, price_per_hour, active")
        .eq("id", roomId)
        .eq("business_id", businessId)
        .maybeSingle();
      const { data: roomBiz } = await supabase2
        .from("businesses")
        .select("category, accepts_room_reservation")
        .eq("id", businessId)
        .maybeSingle();
      if (
        !roomBiz ||
        !ROOM_CATEGORIES.includes(roomBiz.category) ||
        !roomBiz.accepts_room_reservation
      ) {
        return new Response(
          JSON.stringify({ error: "Este neg\xF3cio n\xE3o aceita reservas de quarto" }),
          { status: 400, headers: CORS_HEADERS },
        );
      }
      if (roomErr || !room || !room.active) {
        return new Response(
          JSON.stringify({ error: "Quarto n\xE3o encontrado ou indispon\xEDvel" }),
          { status: 400, headers: CORS_HEADERS },
        );
      }
      const unit = bookingUnit === "hour" ? "hour" : "night";
      let nights = 0;
      let hoursCount = 0;
      let totalPrice = 0;
      const bad = (msg) =>
        new Response(JSON.stringify({ error: msg }), { status: 400, headers: CORS_HEADERS });
      if (unit === "hour") {
        const pph = Number(room.price_per_hour ?? 0);
        if (!pph || pph <= 0) return bad("Este quarto n\xE3o tem pre\xE7o por hora");
        hoursCount = Math.round(Number(hours));
        if (!hoursCount || hoursCount < 1 || hoursCount > 12) {
          return bad("N\xFAmero de horas inv\xE1lido (1 a 12)");
        }
        if (!startTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
          return bad("Hora de entrada inv\xE1lida");
        }
        totalPrice = pph * hoursCount;
      } else {
        const ppn = Number(room.price_per_night ?? 0);
        if (!ppn || ppn <= 0) return bad("Este quarto n\xE3o tem pre\xE7o por dia");
        nights = Math.round(
          (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1e3 * 60 * 60 * 24),
        );
        if (!nights || nights < 1) return bad("Datas de entrada/sa\xEDda inv\xE1lidas");
        totalPrice = ppn * nights;
      }
      const option =
        paymentOption === "full"
          ? "full"
          : paymentOption === "deposit" || paymentOption == null
            ? "deposit"
            : null;
      if (!option) {
        return new Response(
          JSON.stringify({ error: "Op\xE7\xE3o de pagamento inv\xE1lida (full ou deposit)" }),
          { status: 400, headers: CORS_HEADERS },
        );
      }
      amount =
        option === "full"
          ? Math.round(totalPrice * 100) / 100
          : Math.round(totalPrice * ROOM_DEPOSIT_PCT * 100) / 100;
      const commissionAmount = Math.round(totalPrice * ROOM_COMMISSION_PCT * 100) / 100;
      roomReservationMeta = {
        roomId: room.id,
        roomName: room.name,
        clientUserId: authenticatedUserId,
        checkIn,
        checkOut: unit === "hour" ? checkIn : checkOut,
        nights,
        bookingUnit: unit,
        hours: unit === "hour" ? hoursCount : null,
        startTime: unit === "hour" ? startTime : null,
        pricePerHour: room.price_per_hour ?? null,
        guests,
        specialRequest: specialRequest ?? null,
        clientName,
        clientPhone,
        clientEmail: clientEmail ?? null,
        pricePerNight: room.price_per_night,
        totalPrice,
        paymentOption: option,
        amountPaid: amount,
        balanceDue: Math.round((totalPrice - amount) * 100) / 100,
        commissionAmount,
      };
    } else if (isTable) {
      const { data: biz, error: bizErr } = await supabase2
        .from("businesses")
        .select("id, category, mesa_preco_normal, mesa_preco_evento, accepts_table_reservation")
        .eq("id", businessId)
        .maybeSingle();
      if (
        bizErr ||
        !biz ||
        !biz.accepts_table_reservation ||
        !TABLE_CATEGORIES.includes(biz.category)
      ) {
        return new Response(
          JSON.stringify({ error: "Este neg\xF3cio n\xE3o aceita reservas de mesa" }),
          { status: 400, headers: CORS_HEADERS },
        );
      }
      const tipo = tableTipo === "evento" ? "evento" : "normal";
      const price = tipo === "evento" ? biz.mesa_preco_evento : biz.mesa_preco_normal;
      amount = price;
      tableReservationMeta = {
        reservationDate,
        timeSlot,
        clientUserId: authenticatedUserId,
        guests,
        specialRequest: specialRequest ?? null,
        clientName,
        clientPhone,
        clientEmail: clientEmail ?? null,
        tipo,
        price,
        commissionAmount: Math.round((price / 2) * 100) / 100,
        payoutAmount: Math.round((price / 2) * 100) / 100,
      };
    } else {
      amount = isBoost
        ? boostDays * BOOST_PRICE_PER_DAY
        : isPost
          ? POST_PRICES[postPackageId]
          : isEvent
            ? eventPrice
            : PLAN_PRICES[planId];
    }
    const now = /* @__PURE__ */ new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1e3);
    {
      const since = new Date(now.getTime() - 90 * 1e3).toISOString();
      const { data: inflight } = await supabase2
        .from("payments")
        .select("id")
        .eq("method", "mpesa")
        .eq("status", "pending")
        .eq("phone", payerCheck.value)
        .gt("created_at", since)
        .limit(1)
        .maybeSingle();
      if (inflight) {
        return json(
          {
            error:
              "J\xE1 h\xE1 um pagamento \xE0 espera de confirma\xE7\xE3o neste n\xFAmero. Confirma no telem\xF3vel ou espera um minuto.",
          },
          409,
        );
      }
    }
    const merchantRef = makeRef(businessId, planId);
    const { data: paymentRow, error: insertError } = await supabase2
      .from("payments")
      .insert({
        business_id: businessId,
        merchant_ref: merchantRef,
        plan_id: planId,
        boost_package_id: isBoost
          ? boostPackageId
          : isPost
            ? postPackageId
            : isEvent
              ? (eventTier ?? "standard")
              : null,
        content_metadata: isEvent
          ? { ...(contentMetadata ?? {}), days: eventDaysOk ? eventDaysNum : null }
          : isPost
            ? (contentMetadata ?? null)
            : isRoom
              ? roomReservationMeta
              : isTable
                ? tableReservationMeta
                : null,
        amount,
        currency: "MZN",
        method: "mpesa",
        phone: payerCheck.value,
        status: "pending",
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();
    if (insertError || !paymentRow) {
      if (insertError?.code === "23505") {
        return new Response(
          JSON.stringify({
            error:
              "J\xE1 existe um pagamento em curso para este plano. Aguarda uns segundos e tenta novamente.",
          }),
          { status: 409, headers: CORS_HEADERS },
        );
      }
      console.error("create-mpesa-payment: falha ao criar linha payments", insertError);
      return new Response(JSON.stringify({ error: "Falha ao registar o pagamento" }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }
    if (!mpesaConfigured()) {
      console.error("create-mpesa-payment: faltam secrets MPESA_*");
      await supabase2
        .from("payments")
        .update({ status: "failed", fail_reason: "Configura\xE7\xE3o M-Pesa incompleta" })
        .eq("id", paymentRow.id);
      return json({ error: "Pagamento M-Pesa indispon\xEDvel de momento" }, 500);
    }
    let outcome;
    try {
      outcome = await c2bSingleStage({
        amount,
        msisdn,
        transactionReference: merchantRef,
        thirdPartyReference: merchantRef,
      });
    } catch (netErr) {
      console.error("create-mpesa-payment: falha de rede/timeout na M-Pesa", netErr);
      outcome = { state: "unknown", code: "NET", description: String(netErr) };
    }
    if (outcome.state === "unknown") {
      const q = await queryTransactionStatus(merchantRef, merchantRef);
      if (q === "success")
        outcome = {
          state: "success",
          transactionId: null,
          code: outcome.code,
          description: "confirmado por consulta",
        };
      else if (q === "failed")
        outcome = {
          state: "failed",
          code: outcome.code,
          description: "falhou (consulta)",
          userMessage: "O pagamento n\xE3o foi conclu\xEDdo. Tenta outra vez.",
        };
    }
    const result = await settlePayment(paymentRow, outcome);
    return json({
      paymentId: paymentRow.id,
      merchantRef,
      amount,
      createdAt: paymentRow.created_at,
      expiresAt: expiresAt.toISOString(),
      ...result,
    });
  } catch (err) {
    console.error("create-mpesa-payment: erro inesperado", err);
    return json({ error: "internal_error" }, 500);
  }
});
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: CORS_HEADERS });
}
async function settlePayment(payment, outcome) {
  if (outcome.state === "success") {
    const { data: claimed } = await supabase2
      .from("payments")
      .update({
        status: "confirmed",
        operator_ref: outcome.transactionId ?? payment.merchant_ref,
        confirmed_at: /* @__PURE__ */ new Date().toISOString(),
      })
      .eq("id", payment.id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (claimed) {
      try {
        await fulfillPayment(supabase2, claimed);
      } catch (err) {
        console.error(
          "PAGO MAS N\xC3O ACTIVADO \u2014 verificar \xE0 m\xE3o:",
          payment.id,
          payment.plan_id,
          err,
        );
        await supabase2
          .from("payments")
          .update({ fail_reason: `fulfil_error: ${String(err?.message ?? err).slice(0, 180)}` })
          .eq("id", payment.id);
      }
    }
    return { status: "confirmed" };
  }
  if (outcome.state === "failed") {
    await supabase2
      .from("payments")
      .update({
        status: "failed",
        fail_reason: `M-Pesa ${outcome.code}: ${outcome.description}`.slice(0, 250),
      })
      .eq("id", payment.id)
      .eq("status", "pending");
    return { status: "failed", error: outcome.userMessage };
  }
  return { status: "pending" };
}
async function handleCheck(req, paymentId) {
  if (!paymentId) return json({ error: "paymentId em falta" }, 400);
  const uid = await getAuthenticatedUserId(req);
  if (!uid) return json({ error: "Sess\xE3o inv\xE1lida" }, 401);
  const { data: payment } = await supabase2
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment || payment.method !== "mpesa")
    return json({ error: "Pagamento n\xE3o encontrado" }, 404);
  const meta = payment.content_metadata ?? {};
  let allowed = meta.clientUserId === uid;
  if (!allowed) {
    const { data: biz } = await supabase2
      .from("businesses")
      .select("owner_id")
      .eq("id", payment.business_id)
      .maybeSingle();
    allowed = biz?.owner_id === uid;
  }
  if (!allowed) return json({ error: "Sem permiss\xE3o" }, 403);
  if (payment.status === "confirmed") return json({ status: "confirmed" });
  if (payment.status === "failed")
    return json({ status: "failed", error: payment.fail_reason ?? void 0 });
  const q = await queryTransactionStatus(payment.merchant_ref, payment.merchant_ref);
  if (q === "success") {
    return json(await settlePayment(payment, { state: "success", transactionId: null }));
  }
  if (q === "failed" || new Date(payment.expires_at).getTime() < Date.now()) {
    return json(
      await settlePayment(payment, {
        state: "failed",
        code: q === "failed" ? "QUERY" : "EXPIRED",
        description: q === "failed" ? "falhou (consulta)" : "expirou sem confirma\xE7\xE3o",
        userMessage: "O pagamento n\xE3o foi confirmado. Tenta outra vez.",
      }),
    );
  }
  return json({ status: "pending" });
}
