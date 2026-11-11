// Botão "Traduzir" ao lado de uma mensagem + texto traduzido por baixo.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useT, useLocale } from "@/lib/i18n";
import { translateMessage, TranslateError } from "@/lib/translate-message";

type Phase = "idle" | "loading" | "done" | "same" | "error";

export function TranslateMessage({
  messageId,
  mine,
  children,
}: {
  messageId: string;
  /** true quando a mensagem é do próprio utilizador (muda só o estilo) */
  mine: boolean;
  /** render-prop: recebe o botão e o bloco da tradução */
  children: (parts: { button: React.ReactNode; result: React.ReactNode }) => React.ReactNode;
}) {
  const tr = useT();
  const [locale] = useLocale();
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const [err, setErr] = useState("");

  const run = async () => {
    if (phase === "loading") return;
    if (phase === "done" || phase === "same") {
      setShowOriginal((v) => !v);
      return;
    }
    setPhase("loading");
    setErr("");
    try {
      const r = await translateMessage(messageId, locale);
      if (r.sameLanguage) {
        setPhase("same");
      } else {
        setText(r.text);
        setPhase("done");
        setShowOriginal(false);
      }
    } catch (e) {
      const k = e instanceof TranslateError ? e.kind : "other";
      setErr(
        k === "quota"
          ? tr("translateQuota")
          : k === "rate"
            ? tr("translateRate")
            : tr("translateError"),
      );
      setPhase("error");
    }
  };

  const label =
    phase === "loading"
      ? tr("translating")
      : phase === "done" || phase === "same"
        ? showOriginal
          ? tr("translateShowTranslation")
          : tr("translateSeeOriginal")
        : tr("translate");

  const button = (
    <button
      type="button"
      onClick={run}
      disabled={phase === "loading"}
      aria-label={label}
      title={label}
      className="press glass-btn grid h-7 w-7 shrink-0 place-items-center self-end rounded-full text-muted-foreground"
    >
      {phase === "loading" ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      ) : (
        <Icon name="languages" size={13} />
      )}
    </button>
  );

  const result = (
    <>
      {phase === "done" && !showOriginal && (
        <div
          data-testid="translation"
          className={`mt-1.5 border-t pt-1.5 text-[13px] ${mine ? "border-white/30" : "border-border"}`}
        >
          <div
            className={`mb-0.5 text-[9px] font-semibold uppercase tracking-wide ${mine ? "opacity-80" : "text-muted-foreground"}`}
          >
            {tr("translation")}
          </div>
          {text}
        </div>
      )}
      {phase === "same" && !showOriginal && (
        <div className={`mt-1 text-[10px] ${mine ? "opacity-80" : "text-muted-foreground"}`}>
          {tr("translateAlreadySame")}
        </div>
      )}
      {phase === "error" && <div className="mt-1 text-[10px] text-destructive">{err}</div>}
    </>
  );

  return <>{children({ button, result })}</>;
}
