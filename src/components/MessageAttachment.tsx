// ============================================================
// SPOTTER — Renderização do anexo dentro da bolha de mensagem
// ------------------------------------------------------------
// image    → miniatura clicável (abre em ecrã cheio)
// audio    → player <audio> nativo
// document → cartão com nome do ficheiro + botão de download
// ============================================================
import { useState, useEffect } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n";
import { getChatAttachmentUrl } from "@/lib/storage-upload";

interface AttachmentLike {
  attachment_type: "image" | "document" | "audio";
  // Desde o conserto de segurança (bucket de chat passou a privado):
  // este campo pode vir como CAMINHO no Storage (anexos novos, sem
  // "http"/"data:" no início) ou como URL pública completa (anexos
  // antigos, gravados antes do conserto). Em ambos os casos, resolve-se
  // com getChatAttachmentUrl antes de mostrar.
  attachment_url: string;
  attachment_name: string;
  attachment_mime: string;
}

export function MessageAttachment({ attachment }: { attachment: AttachmentLike }) {
  const tr = useT();
  const [expanded, setExpanded] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getChatAttachmentUrl(attachment.attachment_url).then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [attachment.attachment_url]);

  if (!url) {
    // Anexo ainda a resolver a URL assinada (ou falhou) — placeholder
    // discreto em vez de tentar carregar um src inválido.
    return (
      <div className="flex h-14 w-40 items-center justify-center rounded-xl bg-background/40 text-[11px] text-muted-foreground">
        {tr("loading")}
      </div>
    );
  }

  if (attachment.attachment_type === "image") {
    return (
      <>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="press block overflow-hidden rounded-xl"
        >
          <img
            src={url}
            alt={attachment.attachment_name}
            className="max-h-56 w-full max-w-[220px] object-cover"
          />
        </button>
        {expanded && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 animate-pop-in"
            onClick={() => setExpanded(false)}
          >
            <img
              src={url}
              alt={attachment.attachment_name}
              className="max-h-full max-w-full rounded-lg"
            />
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="absolute right-4 top-12 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white"
              aria-label={tr("closeAria")}
            >
              <Icon name="x" size={18} />
            </button>
          </div>
        )}
      </>
    );
  }

  if (attachment.attachment_type === "audio") {
    return (
      <audio controls src={url} className="h-10 w-56 max-w-full">
        O seu navegador não suporta reprodução de áudio.
      </audio>
    );
  }

  // document
  return (
    <a
      href={url}
      download={attachment.attachment_name}
      className="press flex items-center gap-2.5 rounded-xl bg-background/40 px-3 py-2.5"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-background/60">
        <Icon name="fileText" size={16} />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium">
        {attachment.attachment_name}
      </span>
      <Icon name="download" size={15} className="shrink-0 opacity-70" />
    </a>
  );
}
