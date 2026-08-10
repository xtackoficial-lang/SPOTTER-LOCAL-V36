// ============================================================
// SPOTTER — Menu de anexos do chat (botão "+", estilo WhatsApp)
// ------------------------------------------------------------
// Mostra um popover com 4 opções: Câmara, Galeria, Documento e
// Áudio. As três primeiras abrem um <input type="file"> (a Câmara
// usa capture="environment" para abrir a câmara directamente em
// telemóvel); "Áudio" delega ao chamador (abre o gravador de voz).
// ============================================================
import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { ACCEPTED_DOCUMENT_TYPES } from "@/lib/chat-attachments";
import { useT } from "@/lib/i18n";

interface Props {
  onFile: (file: File) => void;
  onStartRecording: () => void;
  disabled?: boolean;
}

const OPTIONS = [
  { id: "camera", labelKey: "cameraOption", icon: "camera", color: "bg-rose-500" },
  { id: "gallery", labelKey: "galleryOption", icon: "image", color: "bg-violet-500" },
  { id: "document", labelKey: "documentOption", icon: "fileText", color: "bg-sky-500" },
  { id: "audio", labelKey: "audioOption", icon: "mic", color: "bg-emerald-500" },
] as const;

export function ChatAttachmentMenu({ onFile, onStartRecording, disabled }: Props) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLInputElement>(null);

  const handleSelect = (id: (typeof OPTIONS)[number]["id"]) => {
    setOpen(false);
    if (id === "camera") cameraRef.current?.click();
    else if (id === "gallery") galleryRef.current?.click();
    else if (id === "document") documentRef.current?.click();
    else if (id === "audio") onStartRecording();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = "";
  };

  return (
    <div className="relative">
      {/* Inputs ocultos — cada um disparado pelo botão correspondente */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />
      <input
        ref={documentRef}
        type="file"
        accept={ACCEPTED_DOCUMENT_TYPES}
        className="hidden"
        onChange={handleInputChange}
      />

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-14 left-0 z-30 w-48 animate-pop-in rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-soft)]">
            {OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelect(opt.id)}
                className="press flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-foreground hover:bg-muted"
              >
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-white ${opt.color}`}
                >
                  <Icon name={opt.icon} size={17} />
                </span>
                {tr(opt.labelKey)}
              </button>
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground disabled:opacity-50"
        aria-label={tr("attachAction")}
      >
        <Icon name={open ? "x" : "paperclip"} size={19} />
      </button>
    </div>
  );
}
