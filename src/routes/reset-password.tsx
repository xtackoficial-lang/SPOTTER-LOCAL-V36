// ============================================================
// CRIADO (pedido do Abrão, 2026-09-22): página para onde o link de
// "recuperar senha" do email aponta (ver sendPasswordReset() em
// auth.ts, redirectTo: `${origin}/reset-password`). O Supabase, ao
// abrir este link, estabelece sozinho uma sessão temporária de
// recuperação (detectSessionInUrl: true em supabase.ts) — não é
// preciso pedir a senha antiga, só a nova.
// ============================================================
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { ShimmerButton } from "@/components/ShimmerButton";
import { BreathingLoader } from "@/components/BreathingLoader";
import { updatePasswordAfterReset } from "@/lib/auth";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Nova senha — Spotter Local" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const tr = useT();
  // "checking" até confirmarmos se o link trouxe mesmo uma sessão de
  // recuperação válida — evita mostrar o formulário e só depois dizer
  // que o link era inválido.
  const [linkStatus, setLinkStatus] = useState<"checking" | "valid" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED || !supabase) {
      setLinkStatus("invalid");
      return;
    }
    // Captura numa constante local: sem isto, o TypeScript não consegue
    // garantir dentro da função async abaixo que "supabase" continua
    // não-nulo (mesmo já tendo sido confirmado na linha acima).
    const client = supabase;
    // detectSessionInUrl já deve ter processado o link a esta altura, mas
    // dá-se uma pequena margem para o SDK acabar de tratar o hash da URL
    // antes de verificar — evita marcar "inválido" por uma corrida entre
    // o parse da URL e este efeito.
    let cancelled = false;
    const check = async () => {
      const { data } = await client.auth.getSession();
      if (cancelled) return;
      setLinkStatus(data.session ? "valid" : "invalid");
    };
    const t = setTimeout(check, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  const handleSave = async () => {
    if (!password || password.length < 6) {
      setError(tr("minSixChars"));
      return;
    }
    if (password !== confirmPassword) {
      setError(tr("resetPasswordMismatch"));
      return;
    }
    setSaving(true);
    setError("");
    const { error: updateError } = await updatePasswordAfterReset(password);
    setSaving(false);
    if (updateError) {
      setError(updateError);
    } else {
      setDone(true);
      setTimeout(() => navigate({ to: "/home" }), 1800);
    }
  };

  if (linkStatus === "checking") {
    return <BreathingLoader fullScreen label={tr("verifyingSession")} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background px-5 py-6">
      {linkStatus === "invalid" ? (
        <div className="mt-10 flex flex-1 flex-col items-center gap-4 text-center animate-slide-up">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <Icon name="x" size={28} className="text-destructive" />
          </div>
          <p className="text-sm text-foreground">{tr("resetPasswordLinkInvalid")}</p>
          <Link
            to="/forgot-password"
            className="mt-2 text-xs font-medium text-primary hover:underline"
          >
            {tr("forgotPasswordTitle")}
          </Link>
        </div>
      ) : done ? (
        <div className="mt-10 flex flex-1 flex-col items-center gap-4 text-center animate-slide-up">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Icon name="check" size={30} className="text-primary" />
          </div>
          <p className="text-sm text-foreground">{tr("resetPasswordSuccess")}</p>
        </div>
      ) : (
        <div className="mt-4 animate-slide-up">
          <h1 className="text-lg font-bold text-foreground">{tr("resetPasswordTitle")}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{tr("resetPasswordSubtitle")}</p>

          <div className="mt-6 space-y-3">
            <div>
              <div className="mb-1 text-xs font-semibold text-foreground">
                {tr("newPasswordLabel")}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tr("minSixChars")}
                className="h-12 w-full rounded-2xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition"
                autoFocus
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-foreground">
                {tr("confirmNewPasswordLabel")}
              </div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                placeholder={tr("minSixChars")}
                className="h-12 w-full rounded-2xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition"
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
              disabled={!password || !confirmPassword || saving}
              onClick={handleSave}
            >
              {tr("resetPasswordButton")}
            </ShimmerButton>
          </div>
        </div>
      )}
    </div>
  );
}
