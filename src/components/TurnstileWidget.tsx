// Captcha Cloudflare Turnstile. Não desenha nada se estiver desligado (sem site key).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { TURNSTILE_ENABLED, TURNSTILE_SITE_KEY, loadTurnstile } from "@/lib/turnstile";

export interface TurnstileHandle {
  /** Pede um token novo (cada token só serve uma vez). */
  reset: () => void;
}

interface Props {
  onToken: (token: string | null) => void;
  className?: string;
}

export const TurnstileWidget = forwardRef<TurnstileHandle, Props>(function TurnstileWidget(
  { onToken, className },
  ref,
) {
  const box = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    reset: () => {
      cb.current(null);
      if (idRef.current && window.turnstile) window.turnstile.reset(idRef.current);
    },
  }));

  useEffect(() => {
    if (!TURNSTILE_ENABLED || !box.current) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !box.current) return;
        idRef.current = api.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "auto",
          language: "pt",
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(null),
          "timeout-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (idRef.current && window.turnstile) window.turnstile.remove(idRef.current);
      idRef.current = null;
    };
  }, []);

  if (!TURNSTILE_ENABLED) return null;
  return (
    <div className={className}>
      <div ref={box} className="flex justify-center" />
      {failed && (
        <p className="mt-1 text-center text-[11px] text-destructive">
          Não foi possível carregar a verificação de segurança. Verifica a internet e recarrega a
          página.
        </p>
      )}
    </div>
  );
});
