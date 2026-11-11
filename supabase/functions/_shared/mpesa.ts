// ============================================================
// XTACK SPOTTER — cliente da API M-Pesa (Vodacom Moçambique)
// ------------------------------------------------------------
// Usado por create-mpesa-payment. Só implementa o que a app usa:
//   • c2bSingleStage()      — cobra o cliente (aparece o pedido de PIN no telemóvel)
//   • queryTransactionStatus() — pergunta o estado quando a resposta ficou em dúvida
//
// Autenticação (portal developer.mpesa.vm.co.mz): NÃO há OAuth. O token é a
// API Key cifrada com a Public Key (RSA, padding PKCS#1 v1.5), em base64,
// enviado em "Authorization: Bearer <token>".
//
// Secrets (Supabase → Edge Functions → Secrets):
//   MPESA_API_KEY        — API Key do portal
//   MPESA_PUBLIC_KEY     — Public Key do portal (base64 sem cabeçalhos, ou PEM)
//   MPESA_SERVICE_PROVIDER_CODE — shortcode. Sandbox: 171717
//   MPESA_ENV            — "sandbox" (omissão) ou "production"
// Opcionais (se a Vodacom indicar valores diferentes para a tua conta):
//   MPESA_HOST, MPESA_C2B_PORT (18352), MPESA_QUERY_PORT (18353), MPESA_ORIGIN
// ============================================================

// @ts-nocheck — ambiente Deno (Supabase Edge Functions).
import { Buffer } from "node:buffer";
import { constants, publicEncrypt } from "node:crypto";

const ENV = (Deno.env.get("MPESA_ENV") ?? "sandbox").toLowerCase();
export const MPESA_IS_PRODUCTION = ENV === "production";
const HOST =
  Deno.env.get("MPESA_HOST") ?? (MPESA_IS_PRODUCTION ? "api.vm.co.mz" : "api.sandbox.vm.co.mz");
const C2B_PORT = Deno.env.get("MPESA_C2B_PORT") ?? "18352";
const QUERY_PORT = Deno.env.get("MPESA_QUERY_PORT") ?? "18353";
const ORIGIN = Deno.env.get("MPESA_ORIGIN") ?? "developer.mpesa.vm.co.mz";
const API_KEY = Deno.env.get("MPESA_API_KEY") ?? "";
const PUBLIC_KEY = Deno.env.get("MPESA_PUBLIC_KEY") ?? "";
const SERVICE_PROVIDER_CODE = Deno.env.get("MPESA_SERVICE_PROVIDER_CODE") ?? "";

// A Vodacom corta o pedido ao fim de ~60 s se o cliente não responder ao PIN.
const C2B_TIMEOUT_MS = 70_000;
const QUERY_TIMEOUT_MS = 15_000;

export function mpesaConfigured(): boolean {
  return !!API_KEY && !!PUBLIC_KEY && !!SERVICE_PROVIDER_CODE;
}

/** Aceita a chave só com o corpo base64 (como aparece no portal) ou já em PEM. */
export function toPem(publicKey: string): string {
  const raw = publicKey.trim();
  if (raw.includes("BEGIN")) return raw;
  const body = raw.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----`;
}

/** Token = base64( RSA_PKCS1_v1_5( publicKey, apiKey ) ). Calculado de novo a cada pedido. */
export function buildBearerToken(apiKey = API_KEY, publicKey = PUBLIC_KEY): string {
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

/** "+258841234567" / "841234567" → "258841234567" (formato que a M-Pesa pede). */
export function toMsisdn(phone: string): string {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (d.startsWith("258") && d.length === 12) return d;
  if (d.length === 9) return `258${d}`;
  return d;
}

export type MpesaOutcome =
  | { state: "success"; transactionId: string | null; code: string; description: string }
  | { state: "failed"; code: string; description: string; userMessage: string }
  | { state: "unknown"; code: string; description: string };

// Códigos que significam "não foi cobrado, e não vai ser" — o cliente pode tentar de novo.
const FAILED_MESSAGES: Record<string, string> = {
  "INS-5": "O pagamento foi cancelado no telemóvel.",
  "INS-6": "O pagamento falhou. Tenta outra vez.",
  "INS-9": "Não confirmaste o pagamento a tempo. Tenta outra vez e digita o PIN quando aparecer.",
  "INS-10": "Já existe um pagamento igual em curso. Espera um minuto e tenta outra vez.",
  "INS-13": "Pagamento indisponível de momento (configuração).",
  "INS-15": "Valor inválido.",
  "INS-2006": "Saldo M-Pesa insuficiente.",
  "INS-2051": "Número M-Pesa inválido. Confirma o número (84 ou 85).",
  "INS-996": "A tua conta M-Pesa não está activa.",
  "INS-995": "Há um problema com a tua conta M-Pesa. Contacta a Vodacom.",
  "INS-4": "Este número não tem conta M-Pesa activa.",
};
// Códigos em que NÃO sabemos o que aconteceu — pergunta-se o estado antes de dar como falhado.
const UNKNOWN_CODES = new Set(["INS-1", "INS-9", "INS-16", "INS-23"]);

export function interpret(json: Record<string, unknown> | null): MpesaOutcome {
  const code = String(json?.output_ResponseCode ?? "");
  const description = String(json?.output_ResponseDesc ?? "");
  if (code === "INS-0") {
    return {
      state: "success",
      transactionId: (json?.output_TransactionID as string) ?? null,
      code,
      description,
    };
  }
  if (!code || UNKNOWN_CODES.has(code)) return { state: "unknown", code, description };
  return {
    state: "failed",
    code,
    description,
    userMessage: FAILED_MESSAGES[code] ?? "O pagamento não foi concluído. Tenta outra vez.",
  };
}

async function postJson(url: string, body: unknown, timeoutMs: number) {
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let json: Record<string, unknown> | null = null;
  try {
    json = await res.json();
  } catch {
    /* corpo não era JSON */
  }
  return { status: res.status, json };
}

/**
 * Cobra o cliente. Demora o tempo que o cliente levar a digitar o PIN (até ~60 s).
 * Rebenta (throw) só em falha de rede/timeout — nesse caso o resultado é "unknown".
 */
export async function c2bSingleStage(opts: {
  amount: number;
  msisdn: string;
  transactionReference: string;
  thirdPartyReference: string;
}): Promise<MpesaOutcome & { httpStatus: number }> {
  const { status, json } = await postJson(
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
  console.log("mpesa c2b", status, json?.output_ResponseCode, json?.output_ResponseDesc);
  return { ...interpret(json), httpStatus: status };
}

/** Pergunta à M-Pesa o estado de uma transacção pela nossa referência. */
export async function queryTransactionStatus(
  thirdPartyReference: string,
  queryReference: string,
): Promise<"success" | "failed" | "pending"> {
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
    const json = await res.json().catch(() => null);
    console.log("mpesa query", res.status, JSON.stringify(json));
    const txStatus = String(json?.output_ResponseTransactionStatus ?? "");
    if (/complet|success/i.test(txStatus)) return "success";
    if (/cancel|fail|expire|reject|declin/i.test(txStatus)) return "failed";
    return "pending";
  } catch (err) {
    console.warn("mpesa query: falhou", err);
    return "pending";
  }
}
