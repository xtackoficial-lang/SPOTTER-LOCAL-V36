// ============================================================
// XTACK SPOTTER — Upload de imagens (Supabase Storage)
// ------------------------------------------------------------
// v31 — Antes, fotos de capa/galeria/chat eram convertidas para
// base64 e gravadas directamente nas colunas de texto das tabelas
// (businesses.cover_image, businesses.gallery, messages.attachment_data).
// Isso enche os 500MB grátis do Postgres do Supabase com poucas
// dezenas de comerciantes activos — o Storage é um serviço à parte,
// com 1GB próprio, feito exactamente para ficheiros.
//
// Este módulo:
//   1. Comprime a imagem no browser (canvas) antes de enviar —
//      reduz o tamanho tipicamente em 70-90% sem perda visível.
//   2. Faz upload ao bucket do Supabase Storage.
//   3. Devolve a URL pública, para gravar como texto curto na coluna
//      (ex: businesses.cover_image passa a guardar uma URL, não a
//      imagem inteira).
// Se o Supabase não estiver configurado, cai para base64 local (só
// para o modo de desenvolvimento sem Supabase continuar a funcionar).
// ============================================================
import { supabase, SUPABASE_CONFIGURED } from "./supabase";

const BUCKET = "spotter-media";
// Anexos de chat vão para um bucket PRIVADO à parte — fotos de capa/
// galeria/produtos continuam em BUCKET (público, isso é intencional).
// Ver conserto do item 6 da auditoria (bucket público expunha anexos
// de chat que podem conter documentos/comprovativos privados).
const CHAT_BUCKET = "spotter-chat";

// Dimensão máxima (maior lado) para fotos de capa/galeria/produtos —
// suficiente para ecrãs de telemóvel e a maioria dos monitores,
// sem desperdiçar espaço com resoluções de câmara desnecessárias.
const MAX_DIMENSION_PHOTO = 1600;
const JPEG_QUALITY_PHOTO = 0.75;

// Anexos de chat podem ser mais pequenos — é para visualização rápida
// numa conversa, não para exibição em destaque no perfil.
const MAX_DIMENSION_CHAT = 1280;
const JPEG_QUALITY_CHAT = 0.7;

/**
 * Redimensiona e comprime uma imagem no browser via <canvas>, devolvendo
 * um Blob JPEG. Ficheiros que não são imagem (PDF, docs) passam
 * incólumes — só faz sentido comprimir imagens.
 */
function compressImage(file: File, maxDimension: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Não foi possível processar a imagem."));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Não foi possível comprimir a imagem."));
        },
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };
    img.src = url;
  });
}

function toBase64Fallback(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Não foi possível ler o ficheiro."));
    reader.readAsDataURL(file);
  });
}

export type UploadKind = "cover" | "gallery" | "product" | "chat";

/**
 * Comprime (se for imagem) e envia um ficheiro ao Supabase Storage.
 *
 * - kind "cover"/"gallery"/"product": vai para o bucket público e
 *   devolve a URL pública directa (correcto para conteúdo que é
 *   suposto ser visível a qualquer visitante).
 * - kind "chat": vai para o bucket PRIVADO "spotter-chat" e devolve
 *   só o CAMINHO do ficheiro (não uma URL) — quem for mostrar o
 *   anexo precisa de pedir uma URL assinada com getChatAttachmentUrl()
 *   abaixo, autenticado como um dos participantes da conversa.
 *
 * Sem Supabase configurado, devolve uma data-URL base64 local
 * (fallback de desenvolvimento apenas — nunca usar em produção sem
 * Supabase ligado).
 */
export async function uploadMedia(
  file: File,
  kind: UploadKind,
  ownerId: string,
): Promise<string> {
  const isImage = file.type.startsWith("image/");
  const maxDim = kind === "chat" ? MAX_DIMENSION_CHAT : MAX_DIMENSION_PHOTO;
  const quality = kind === "chat" ? JPEG_QUALITY_CHAT : JPEG_QUALITY_PHOTO;
  const bucket = kind === "chat" ? CHAT_BUCKET : BUCKET;

  const processed = isImage ? await compressImage(file, maxDim, quality) : file;
  const ext = isImage ? "jpg" : file.name.split(".").pop() || "bin";
  const path = `${kind}/${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  if (SUPABASE_CONFIGURED && supabase) {
    // BUG CORRIGIDO (2026-08-15): antes, se o upload ao Supabase Storage
    // falhasse (bucket inexistente, quota esgotada, RLS, rede), o código
    // caía silenciosamente para base64 local — mesmo com Supabase
    // configurado. Em produção, isso resulta em imagens gigantes (base64)
    // gravadas directamente na base de dados Postgres, esgotando os 500MB
    // gratuitos com poucas dezenas de fotos. O comentário no código até
    // avisava "NÃO deve acontecer em produção" mas o código permitia-o
    // sem avisar ninguém. Agora relança o erro para que a UI mostre uma
    // mensagem de erro real em vez de fingir que correu bem.
    const { error } = await supabase.storage.from(bucket).upload(path, processed, {
      contentType: isImage ? "image/jpeg" : file.type || "application/octet-stream",
      upsert: false,
    });
    if (error) throw error;
    if (kind === "chat") {
      // Bucket privado: não existe URL pública. Devolve o caminho —
      // quem for renderizar o anexo troca isto por uma URL assinada
      // (ver getChatAttachmentUrl), autenticado como participante.
      return path;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }
  // Fallback: sem Supabase configurado (ambiente de desenvolvimento
  // sem .env preenchido) — devolve base64 local para a UI continuar
  // a funcionar, mas isto NÃO deve acontecer em produção.
  return toBase64Fallback(processed);
}

/**
 * Troca o caminho privado de um anexo de chat (guardado em
 * messages.attachment_url desde este conserto) por uma URL assinada
 * de curta duração. Falha (devolve null) se quem chama não for um
 * dos participantes da conversa — a policy de storage.objects é que
 * garante isso no servidor, isto aqui só chama a API.
 *
 * Anexos antigos (de antes deste conserto) continuam gravados como
 * URL pública completa — nesse caso devolve a própria URL, sem
 * tentar assinar nada.
 */
export async function getChatAttachmentUrl(pathOrUrl: string): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http") || pathOrUrl.startsWith("data:")) {
    // Anexo antigo (URL pública já gravada) ou fallback base64 local.
    return pathOrUrl;
  }
  if (!SUPABASE_CONFIGURED || !supabase) return null;
  try {
    const { data, error } = await supabase.storage
      .from(CHAT_BUCKET)
      .createSignedUrl(pathOrUrl, 3600);
    if (error) throw error;
    return data.signedUrl;
  } catch (err) {
    console.warn("getChatAttachmentUrl: falha ao assinar URL.", err);
    return null;
  }
}

/** Envia vários ficheiros em paralelo (ex: várias fotos da galeria de uma vez). */
export async function uploadMediaBatch(
  files: File[],
  kind: UploadKind,
  ownerId: string,
): Promise<string[]> {
  return Promise.all(files.map((f) => uploadMedia(f, kind, ownerId)));
}

/**
 * Apaga um ficheiro do Storage a partir da sua URL pública — usado ao
 * remover uma foto da galeria, para não deixar lixo acumulado no bucket.
 * Nunca lança: remover do Storage é "nice to have", não deve bloquear
 * a acção principal do utilizador (ex: remover a foto da lista) se
 * falhar por qualquer razão de rede.
 */
export async function deleteMediaByUrl(url: string): Promise<void> {
  if (!SUPABASE_CONFIGURED || !supabase) return;
  if (!url.includes(`/storage/v1/object/public/${BUCKET}/`)) return; // não é do nosso bucket
  try {
    const path = url.split(`/storage/v1/object/public/${BUCKET}/`)[1];
    if (!path) return;
    await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)]);
  } catch (err) {
    console.warn("deleteMediaByUrl: falha ao remover do Storage (ignorado).", err);
  }
}
