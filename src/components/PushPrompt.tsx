// Aviso para ativar as notificações. O browser só mostra o pedido de permissão
// depois de um toque da pessoa, por isso aparece um cartão com o botão "Ativar".
// Só aparece a quem tem sessão, quando o Firebase está configurado e a
// permissão ainda não foi decidida. "Agora não" esconde-o durante 7 dias.
import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n";
import { FIREBASE_CONFIGURED } from "@/lib/firebase";
import { registerPushToken } from "@/lib/push-storage";
import { getCurrentUser } from "@/lib/auth";

const KEY = "xlocal.pushprompt.until";
const HIDE_ON = [
  "/",
  "/onboarding",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/notifications",
];

function dismissedNow(): boolean {
  try {
    return Number(localStorage.getItem(KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

export function PushPrompt() {
  const tr = useT();
  const { pathname } = useLocation();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!FIREBASE_CONFIGURED || typeof Notification === "undefined") return;
    if (Notification.permission !== "default" || dismissedNow()) return;
    let alive = true;
    getCurrentUser()
      .then((u) => alive && setShow(!!u?.id))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  if (!show || HIDE_ON.includes(pathname)) return null;

  const later = () => {
    try {
      localStorage.setItem(KEY, String(Date.now() + 7 * 24 * 3600 * 1000));
    } catch {
      /* sem armazenamento */
    }
    setShow(false);
  };
  const enable = async () => {
    setBusy(true);
    try {
      await registerPushToken();
    } finally {
      setBusy(false);
      setShow(false);
    }
  };

  return (
    <div
      role="dialog"
      className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-xl animate-slide-up rounded-2xl border border-border bg-card/95 p-4 shadow-[var(--shadow-lift)] backdrop-blur-xl md:max-w-2xl"
    >
      <div className="flex items-start gap-3">
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Icon name="bell" size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">{tr("pushPromptTitle")}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{tr("pushPromptBody")}</div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={enable}
              disabled={busy}
              className="press h-9 rounded-xl px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}
            >
              {tr("pushPromptEnable")}
            </button>
            <button
              onClick={later}
              className="press h-9 rounded-xl border border-border px-4 text-xs font-semibold text-muted-foreground"
            >
              {tr("pushPromptLater")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
