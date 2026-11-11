// ============================================================
// SPOTTER LOCAL — Central de imagens (v41)
// ------------------------------------------------------------
// Ponto ÚNICO que decide onde as imagens públicas (capa, galeria,
// produtos, posts, eventos, quartos) são guardadas:
//
//   VITE_IMAGE_STORAGE=supabase   (omissão) → Supabase Storage, como sempre
//   VITE_IMAGE_STORAGE=r2 + VITE_R2_PUBLIC_URL=https://...  → Cloudflare R2
//
// Trocar = mudar 2 variáveis no Cloudflare (Workers/Pages) e fazer redeploy. Fotos
// antigas (URLs do Supabase) continuam a abrir enquanto não forem migradas
// com scripts/migrate-images-to-r2.mjs. Se o R2 falhar num envio, a app
// volta ao Supabase nesse envio — o utilizador nunca fica sem poder publicar.
// Anexos de chat ficam sempre no bucket PRIVADO do Supabase (são privados;
// um bucket público de R2 não serve para isso).
// ============================================================
import { supabase, SUPABASE_CONFIGURED } from "./supabase";

const R2_PUBLIC_URL: string = ((import.meta.env.VITE_R2_PUBLIC_URL as string | undefined) ?? "")
  .trim()
  .replace(/\/+$/, "");

export const IMAGE_PROVIDER: "r2" | "supabase" =
  (import.meta.env.VITE_IMAGE_STORAGE as string | undefined)?.trim().toLowerCase() === "r2" &&
  R2_PUBLIC_URL.startsWith("https://")
    ? "r2"
    : "supabase";

export type PublicImageKind = "cover" | "gallery" | "product" | "post" | "event" | "room";

export function isR2Url(url: string): boolean {
  return !!R2_PUBLIC_URL && url.startsWith(`${R2_PUBLIC_URL}/`);
}

/** Envia um Blob ao R2 via link temporário. Devolve a URL pública final. Lança erro se falhar. */
export async function uploadToR2(blob: Blob, kind: PublicImageKind): Promise<string> {
  if (!SUPABASE_CONFIGURED || !supabase) throw new Error("sem sessão para enviar ao R2");
  const contentType = blob.type || "image/jpeg";
  const { data, error } = await supabase.functions.invoke("r2-presign", {
    body: { action: "put", kind, contentType, size: blob.size },
  });
  if (error || !data?.uploadUrl || !data?.publicUrl) {
    // 429 (rate limit): mostra a mensagem em português que o servidor enviou
    try {
      const ctx = (error as { context?: Response } | null)?.context;
      if (ctx && ctx.status === 429) {
        const body = await ctx.json();
        if (body?.error) throw new Error(String(body.error));
      }
    } catch (e) {
      if (e instanceof Error && !/JSON|Unexpected/i.test(e.message)) throw e;
    }
    throw new Error(`r2-presign falhou: ${error?.message ?? "resposta inválida"}`);
  }
  const put = await fetch(data.uploadUrl as string, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!put.ok) throw new Error(`R2 recusou o envio (${put.status})`);
  return data.publicUrl as string;
}

/** Apaga uma imagem do R2 a partir da URL pública (só ficheiros da própria pasta). */
export async function deleteFromR2(url: string): Promise<void> {
  if (!SUPABASE_CONFIGURED || !supabase || !isR2Url(url)) return;
  const key = url.slice(R2_PUBLIC_URL.length + 1);
  try {
    await supabase.functions.invoke("r2-presign", { body: { action: "delete", key } });
  } catch (err) {
    console.warn("deleteFromR2: falha (ignorado).", err);
  }
}
