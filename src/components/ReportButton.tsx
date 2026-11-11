// Botão pequeno "Reportar" — pede confirmação e mostra o resultado.
import { useState } from "react";
import { reportContent, type ReportKind } from "@/lib/reports-db";
import { useT } from "@/lib/i18n";

export function ReportButton({
  kind,
  targetId,
  className = "",
}: {
  kind: ReportKind;
  targetId: string;
  className?: string;
}) {
  const tr = useT();
  const [state, setState] = useState<"idle" | "busy" | "sent" | "login" | "error">("idle");

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (state === "busy" || state === "sent") return;
    if (!window.confirm(tr("reportConfirm"))) return;
    setState("busy");
    setState(await reportContent(kind, targetId));
  };

  const label =
    state === "sent"
      ? tr("reportSent")
      : state === "login"
        ? tr("reportLogin")
        : state === "error"
          ? tr("reportError")
          : tr("reportAction");

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "busy" || state === "sent"}
      className={`text-[10px] underline decoration-dotted opacity-80 hover:opacity-100 ${className}`}
    >
      {label}
    </button>
  );
}
