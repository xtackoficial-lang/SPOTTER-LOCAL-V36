// ============================================================
// SPOTTER — Anexos de chat (imagem, documento, áudio)
// ------------------------------------------------------------
// Tipos e helpers partilhados entre o chat real (Supabase,
// messages-db.ts) e o chat simulado local (chat-storage.ts),
// para que a mesma UI funcione com qualquer um dos dois.
// ============================================================

export type AttachmentType = "image" | "document" | "audio";

export interface ChatAttachment {
  type: AttachmentType;
  data: string; // base64 (sem o prefixo data:...;base64,)
  name: string;
  mime: string;
}

// Limite por anexo — base64 em texto tem ~33% de overhead sobre o
// ficheiro original, por isso 8MB de base64 ≈ 6MB de ficheiro real.
// É um limite generoso para fotos/áudios de chat, sem deixar a BD
// (texto na tabela messages) crescer demasiado por mensagem.
export const MAX_ATTACHMENT_BASE64_BYTES = 8 * 1024 * 1024;

// Tipos de ficheiro aceites no selector "Documento" — cobre os
// formatos mais comuns que o WhatsApp também envia.
export const ACCEPTED_DOCUMENT_TYPES = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip";

export function mimeToAttachmentType(mime: string): AttachmentType {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Lê um File/Blob e devolve um ChatAttachment, ou lança erro com uma
// mensagem já pronta a mostrar ao utilizador (limite excedido, etc.)
export function fileToAttachment(file: File): Promise<ChatAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o ficheiro."));
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      if (base64.length > MAX_ATTACHMENT_BASE64_BYTES) {
        reject(
          new Error(
            `Ficheiro demasiado grande. Limite: ${formatFileSize(MAX_ATTACHMENT_BASE64_BYTES * 0.75)}.`,
          ),
        );
        return;
      }
      resolve({
        type: mimeToAttachmentType(file.type),
        data: base64,
        name: file.name,
        mime: file.type || "application/octet-stream",
      });
    };
    reader.readAsDataURL(file);
  });
}

// Converte um Blob de gravação de áudio (do MediaRecorder) num anexo.
export function blobToAudioAttachment(blob: Blob, name = "audio.webm"): Promise<ChatAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível processar o áudio."));
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      if (base64.length > MAX_ATTACHMENT_BASE64_BYTES) {
        reject(new Error("Mensagem de voz demasiado longa."));
        return;
      }
      resolve({
        type: "audio",
        data: base64,
        name,
        mime: blob.type || "audio/webm",
      });
    };
    reader.readAsDataURL(blob);
  });
}

export function attachmentToDataUrl(att: { mime: string; data: string }): string {
  return `data:${att.mime};base64,${att.data}`;
}

// v31 — Converte o base64 já lido (ChatAttachment.data) de volta a um
// Blob, para poder ser enviado ao Supabase Storage em vez de gravado
// como texto na tabela messages. Preferível a reler o File original,
// porque o utilizador já pode ter fechado o seletor de ficheiros.
export function attachmentToBlob(att: { mime: string; data: string }): Blob {
  const byteChars = atob(att.data);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: att.mime });
}
