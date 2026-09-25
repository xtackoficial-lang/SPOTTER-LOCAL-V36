// ============================================================
// CRIADO (pedido do Abrão, 2026-09-22): "Esqueci a senha" não existia
// no app — quem esquecesse a senha ficava sem hipótese de recuperar a
// conta. Pede o email e manda o link via sendPasswordReset() (auth.ts).
// ============================================================
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { ShimmerButton } from "@/components/ShimmerButton";
import { sendPasswordReset } from "@/lib/auth";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Recuperar senha — Spotter Local" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const tr = useT();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  const handleSend = async () => {
    if (!email) return;
    setStatus("sending");
    setError("");
    const { error: sendError } = await sendPasswordReset(email);
    if (sendError) {
      setError(sendError);
      setStatus("idle");
    } else {
      setStatus("sent");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background px-5 py-6">
      <button
        onClick={() => navigate({ to: "/" })}
        className="press mb-6 inline-flex w-fit items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Icon name="arrowLeft" size={12} /> {tr("back")}
      </button>

      {status === "sent" ? (
        <div className="mt-4 flex flex-1 flex-col items-center gap-4 text-center animate-slide-up">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Icon name="mail" size={30} className="text-primary" />
          </div>
          <h1 className="text-lg font-bold text-foreground">{tr("forgotPasswordSentTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {tr("forgotPasswordSentBody").replace("{email}", email)}
          </p>
          <button
            className="mt-2 text-xs text-muted-foreground hover:text-primary transition"
            onClick={handleSend}
          >
            {tr("forgotPasswordResend")}
          </button>
          <Link to="/" className="mt-6 text-xs font-medium text-primary hover:underline">
            {tr("backToLogin")}
          </Link>
        </div>
      ) : (
        <div className="mt-2 animate-slide-up">
          <h1 className="text-lg font-bold text-foreground">{tr("forgotPasswordTitle")}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{tr("forgotPasswordSubtitle")}</p>

          <div className="mt-6 space-y-3">
            <div>
              <div className="mb-1 text-xs font-semibold text-foreground">Email</div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={tr("yourEmail")}
                className="h-12 w-full rounded-2xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition"
                autoFocus
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs text-destructive animate-slide-up">
                <Icon name="x" size={12} /> {error}
              </div>
            )}
            <ShimmerButton
              className="press ripple h-12 w-full rounded-2xl text-sm font-bold text-primary-foreground disabled:opacity-40 transition hover:opacity-90"
              style={{ background: "var(--gradient-primary)" }}
              disabled={!email || status === "sending"}
              onClick={handleSend}
            >
              {tr("forgotPasswordSendButton")}
            </ShimmerButton>
          </div>
        </div>
      )}
    </div>
  );
}
