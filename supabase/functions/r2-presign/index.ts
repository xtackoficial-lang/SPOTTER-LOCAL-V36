// ============================================================
// SPOTTER LOCAL — Edge Function: r2-presign (v41)
// ------------------------------------------------------------
// Dá ao browser um link TEMPORÁRIO (5 min) para enviar UMA imagem
// directamente ao Cloudflare R2, sem nunca expor as chaves do R2.
//   POST { action: "put", kind, contentType, size } → { uploadUrl, publicUrl, key }
//   POST { action: "delete", key }                  → { ok: true }
// A chave do ficheiro é decidida AQUI (kind/<id do utilizador>/...): o
// cliente não escolhe o caminho e só pode apagar ficheiros da sua pasta.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
//   R2_PUBLIC_URL (ex: https://imagens.teudominio.com ou https://pub-xxxx.r2.dev)
// Deploy: supabase functions deploy r2-presign   (JWT obrigatório — por omissão)
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1.0.20";
import { LIMITS, rateLimit, tooManyRequests } from "../_shared/rate-limit.ts";
import { ALLOWED_TYPES, MAX_BYTES, isOwnedKey, isPublicKind, makeKey } from "../_shared/r2-keys.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "método não permitido" }, 405);

  const ACCOUNT = Deno.env.get("R2_ACCOUNT_ID");
  const KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID");
  const SECRET = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const BUCKET = Deno.env.get("R2_BUCKET");
  const PUBLIC_URL = (Deno.env.get("R2_PUBLIC_URL") ?? "").replace(/\/+$/, "");
  if (!ACCOUNT || !KEY_ID || !SECRET || !BUCKET || !PUBLIC_URL) {
    return json({ error: "R2 não configurado no servidor" }, 503);
  }

  // Quem pede tem de ter sessão válida.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: auth, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !auth.user) return json({ error: "sessão inválida" }, 401);
  const uid = auth.user.id;

  {
    const rl = await rateLimit(sb, `r2:${uid}`, LIMITS.r2Put.limit, LIMITS.r2Put.window);
    if (!rl.allowed) return tooManyRequests(rl.retryAfter, CORS);
  }

  let body: { action?: string; kind?: string; contentType?: string; size?: number; key?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const r2 = new AwsClient({ accessKeyId: KEY_ID, secretAccessKey: SECRET, service: "s3", region: "auto" });
  const objectUrl = (key: string) => `https://${ACCOUNT}.r2.cloudflarestorage.com/${BUCKET}/${key}`;

  if (body.action === "put") {
    if (!isPublicKind(body.kind)) return json({ error: "tipo de imagem inválido" }, 400);
    if (!body.contentType || !ALLOWED_TYPES[body.contentType]) {
      return json({ error: "só são aceites imagens JPG, PNG ou WebP" }, 400);
    }
    if (!Number.isFinite(body.size) || (body.size as number) <= 0 || (body.size as number) > MAX_BYTES) {
      return json({ error: "imagem demasiado grande" }, 400);
    }
    const key = makeKey(body.kind, uid, body.contentType);
    const url = new URL(objectUrl(key));
    url.searchParams.set("X-Amz-Expires", "300");
    // Content-Type e Content-Length entram na assinatura (allHeaders) → o R2 recusa o envio se o
    // tipo ou o tamanho forem diferentes do pedido (ninguém sobe HTML/SVG nem um ficheiro de
    // 500 MB com um link de imagem de 300 KB).
    const signed = await r2.sign(url.toString(), {
      method: "PUT",
      headers: { "Content-Type": body.contentType, "Content-Length": String(body.size) },
      aws: { signQuery: true, allHeaders: true },
    });
    return json({ uploadUrl: signed.url, publicUrl: `${PUBLIC_URL}/${key}`, key });
  }

  if (body.action === "delete") {
    if (!isOwnedKey(body.key, uid)) return json({ error: "ficheiro não é teu" }, 403);
    const res = await r2.fetch(objectUrl(body.key), { method: "DELETE" });
    if (!res.ok && res.status !== 404) return json({ error: "falha ao apagar" }, 502);
    return json({ ok: true });
  }

  return json({ error: "acção inválida" }, 400);
});
