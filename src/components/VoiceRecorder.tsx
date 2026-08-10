// ============================================================
// SPOTTER — Gravador de mensagem de voz (estilo WhatsApp)
// ------------------------------------------------------------
// Substitui o botão de enviar quando o campo de texto está vazio.
// Toque para começar a gravar, toque novamente para parar e enviar
// (mais simples e fiável em mobile do que "pressionar e manter",
// que entra facilmente em conflito com o scroll).
// ============================================================
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { blobToAudioAttachment, type ChatAttachment } from "@/lib/chat-attachments";
import { useT } from "@/lib/i18n";

interface Props {
  active: boolean;
  onStart: () => void;
  onCancel: () => void;
  onRecorded: (attachment: ChatAttachment) => void;
}

export function VoiceRecorder({ active, onStart, onCancel, onRecorded }: Props) {
  const tr = useT();
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setSeconds(0);
  };

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          cleanup();
          if (blob.size > 0) {
            try {
              const attachment = await blobToAudioAttachment(blob, `voz-${Date.now()}.webm`);
              onRecorded(attachment);
            } catch (err) {
              console.warn("VoiceRecorder: falha ao processar áudio.", err);
              setError(tr("voiceSendFailed"));
            }
          }
        };

        recorder.start();
        timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      })
      .catch((err) => {
        console.warn("VoiceRecorder: permissão de microfone negada.", err);
        setError(tr("micAccessDenied"));
        onCancel();
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const stopAndSend = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else {
      cleanup();
    }
  };

  const stopAndDiscard = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
    }
    cleanup();
    onCancel();
  };

  if (!active) {
    return (
      <div className="flex flex-col items-end gap-1">
        {error && <span className="text-[10px] text-destructive">{error}</span>}
        <button
          type="button"
          onClick={() => {
            setError(null);
            onStart();
          }}
          className="press grid h-11 w-11 shrink-0 place-items-center rounded-full text-primary-foreground shadow-[var(--shadow-soft)]"
          style={{ background: "var(--gradient-primary)" }}
          aria-label={tr("recordAudioAria")}
        >
          <Icon name="mic" size={18} />
        </button>
      </div>
    );
  }

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-1 items-center gap-2">
      <button
        type="button"
        onClick={stopAndDiscard}
        className="press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
        aria-label={tr("cancelRecordingAria")}
      >
        <Icon name="x" size={16} />
      </button>
      <div className="flex flex-1 items-center gap-2 rounded-full bg-destructive/10 px-3 py-2">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-destructive" />
        <span className="text-sm font-medium text-foreground">A gravar… {fmt(seconds)}</span>
      </div>
      <button
        type="button"
        onClick={stopAndSend}
        className="press grid h-11 w-11 shrink-0 place-items-center rounded-full text-primary-foreground shadow-[var(--shadow-soft)]"
        style={{ background: "var(--gradient-primary)" }}
        aria-label={tr("stopAndSendAria")}
      >
        <Icon name="send" size={18} />
      </button>
    </div>
  );
}
