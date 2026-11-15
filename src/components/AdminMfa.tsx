// Segundo fator do admin: código de 6 dígitos de uma app autenticadora
// (Google Authenticator, Authy, Microsoft Authenticator...). Usa o MFA TOTP
// do próprio Supabase Auth, por isso a verificação é feita no servidor.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BreathingLoader } from "@/components/BreathingLoader";

type Phase = "loading" | "enroll" | "challenge" | "error";

export function AdminMfa({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!supabase) return setPhase("error");
      const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal.data?.currentLevel === "aal2") return onDone();
      const list = await supabase.auth.mfa.listFactors();
      const verified = list.data?.totp?.find((f) => f.status === "verified");
      if (verified) {
        setFactorId(verified.id);
        return setPhase("challenge");
      }
      // Fatores começados mas nunca confirmados atrapalham um novo registo.
      for (const f of list.data?.all ?? []) {
        if (f.factor_type === "totp" && f.status !== "verified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const enr = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "XTACK Admin",
      });
      if (enr.error || !enr.data) {
        setMsg(enr.error?.message ?? "Não foi possível iniciar o registo do autenticador.");
        return setPhase("error");
      }
      setFactorId(enr.data.id);
      setQr(enr.data.totp.qr_code);
      setSecret(enr.data.totp.secret);
      setPhase("enroll");
    })().catch(() => setPhase("error"));
  }, [onDone]);

  async function verify() {
    if (!supabase || code.length !== 6) return;
    setBusy(true);
    setMsg(null);
    const ch = await supabase.auth.mfa.challenge({ factorId });
    if (ch.error || !ch.data) {
      setBusy(false);
      return setMsg(ch.error?.message ?? "Falha ao validar.");
    }
    const v = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code });
    setBusy(false);
    if (v.error) {
      setCode("");
      return setMsg("Código errado ou expirado. Tenta com o código atual da app.");
    }
    onDone();
  }

  if (phase === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <BreathingLoader size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-5 py-10">
      <div className="mx-auto max-w-md space-y-5">
        <h1 className="text-xl font-bold text-foreground">Verificação em dois passos</h1>

        {phase === "error" && (
          <p className="text-sm text-destructive">
            {msg ?? "Não foi possível carregar a verificação."} Confirma que o MFA (TOTP) está ativo
            no Supabase → Authentication → Sign In / Providers → Multi-Factor.
          </p>
        )}

        {phase === "enroll" && (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4 text-sm">
            <p className="text-muted-foreground">
              1. Abre a app Google Authenticator (ou Authy) e toca em «+» → «Ler código QR».
            </p>
            <div className="grid place-items-center rounded-xl bg-white p-3">
              <img src={qr} alt="Código QR do autenticador" className="h-44 w-44" />
            </div>
            <p className="text-xs text-muted-foreground">
              Sem câmara? Escreve esta chave na app:{" "}
              <span className="select-all break-all font-mono text-foreground">{secret}</span>
            </p>
            <p className="text-muted-foreground">
              2. Escreve aqui o código de 6 dígitos que a app mostra.
            </p>
          </div>
        )}

        {phase === "challenge" && (
          <p className="text-sm text-muted-foreground">
            Escreve o código de 6 dígitos da tua app autenticadora.
          </p>
        )}

        {(phase === "enroll" || phase === "challenge") && (
          <>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="h-14 w-full rounded-2xl border border-input bg-background text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-primary"
            />
            {msg && <p className="text-sm text-destructive">{msg}</p>}
            <button
              onClick={verify}
              disabled={busy || code.length !== 6}
              className="press h-12 w-full rounded-2xl text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}
            >
              {busy ? "A verificar…" : "Confirmar"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
