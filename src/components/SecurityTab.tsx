// Separador "Segurança" do admin: mostra o que está a acontecer agora e diz,
// em português simples, se parece ruído normal ou um ataque a sério.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BreathingLoader } from "@/components/BreathingLoader";

interface Overview {
  generated_at: string;
  locked_now: number;
  locked_login_now: number;
  failed_logins_1h: number;
  failed_logins_24h: number;
  accounts_targeted_24h: number;
  recover_requests_24h: number;
  new_accounts_1h: number;
  new_accounts_24h: number;
  suspended_accounts: number;
  rate_limit_hot: { kind: string; count: number; window_start: string }[];
  push_failures_24h: number;
  pending_payment_proofs: number;
  admin_actions_24h: number;
  admin_logins_24h: number;
  recent_admin_events: { action: string; target: string; detail: string; created_at: string }[];
}

type Level = "ok" | "watch" | "attack";

// Regras simples e explicáveis (sem "magia"): um erro isolado é ruído; muitas
// falhas, muitas contas visadas ou vários bloqueios em pouco tempo é ataque.
function assess(o: Overview): { level: Level; reasons: string[] } {
  const reasons: string[] = [];
  let level: Level = "ok";
  const bump = (l: Level, why: string) => {
    reasons.push(why);
    if (l === "attack" || (l === "watch" && level === "ok")) level = l;
  };
  if (o.failed_logins_1h >= 30 || o.locked_login_now >= 5)
    bump(
      "attack",
      `${o.failed_logins_1h} tentativas de login falhadas na última hora e ${o.locked_login_now} contas bloqueadas agora — padrão de adivinhação de senhas.`,
    );
  else if (o.failed_logins_1h >= 10 || o.locked_login_now >= 2)
    bump(
      "watch",
      `${o.failed_logins_1h} tentativas falhadas na última hora (${o.locked_login_now} bloqueios). Pode ser alguém a esquecer-se da senha, ou um teste.`,
    );
  if (o.accounts_targeted_24h >= 8)
    bump(
      "attack",
      `${o.accounts_targeted_24h} contas diferentes com falhas em 24h — um atacante a testar muitos e-mails.`,
    );
  if (o.new_accounts_1h >= 15)
    bump(
      "attack",
      `${o.new_accounts_1h} contas novas numa hora — possível criação em massa por robô.`,
    );
  else if (o.new_accounts_1h >= 6)
    bump("watch", `${o.new_accounts_1h} contas novas numa hora, acima do normal.`);
  const hot = o.rate_limit_hot.filter((r) => r.count >= 20);
  if (hot.length)
    bump(
      "watch",
      `Muitos pedidos seguidos em: ${hot.map((h) => `${h.kind} (${h.count})`).join(", ")}.`,
    );
  if (o.recover_requests_24h >= 15)
    bump("watch", `${o.recover_requests_24h} pedidos de recuperação de senha em 24h.`);
  if (!reasons.length) reasons.push("Nada fora do normal nas últimas 24 horas.");
  return { level, reasons };
}

const LEVEL_UI: Record<Level, { label: string; cls: string }> = {
  ok: { label: "Tudo normal", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" },
  watch: { label: "Atenção", cls: "border-amber-500/30 bg-amber-500/10 text-amber-600" },
  attack: {
    label: "Ataque provável",
    cls: "border-destructive/40 bg-destructive/10 text-destructive",
  },
};

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-lg font-bold text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function SecurityTab() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data: d, error } = await supabase.rpc("security_overview");
    setLoading(false);
    if (error) return setErr(error.message);
    setErr(null);
    setData(d as Overview);
  }, []);

  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), 60_000);
    return () => clearInterval(iv);
  }, [load]);

  if (loading && !data)
    return (
      <div className="grid place-items-center py-16">
        <BreathingLoader size={32} />
      </div>
    );
  if (err || !data)
    return <p className="py-8 text-sm text-destructive">Não foi possível carregar: {err}</p>;

  const { level, reasons } = assess(data);
  const ui = LEVEL_UI[level];

  return (
    <div className="space-y-4 animate-slide-up">
      <div className={`rounded-2xl border p-4 ${ui.cls}`}>
        <div className="text-base font-bold">{ui.label}</div>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        {level === "attack" && (
          <p className="mt-2 text-xs">
            O que fazer: ativa o modo «Under Attack» no Cloudflare (Segurança → Definições),
            confirma o Turnstile no login e suspende as contas suspeitas na aba Contas.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Logins falhados (1h)" value={data.failed_logins_1h} />
        <Stat label="Logins falhados (24h)" value={data.failed_logins_24h} />
        <Stat label="Contas bloqueadas agora" value={data.locked_login_now} />
        <Stat label="Contas visadas (24h)" value={data.accounts_targeted_24h} />
        <Stat label="Recuperações de senha (24h)" value={data.recover_requests_24h} />
        <Stat label="Contas novas (24h)" value={data.new_accounts_24h} />
        <Stat label="Contas suspensas" value={data.suspended_accounts} />
        <Stat label="Comprovativos por rever" value={data.pending_payment_proofs} />
        <Stat label="Entradas no admin (24h)" value={data.admin_logins_24h} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-2 text-sm font-semibold text-foreground">Últimas ações do admin</div>
        <div className="space-y-1.5">
          {data.recent_admin_events.map((e, i) => (
            <div key={i} className="flex justify-between gap-3 text-[11px]">
              <span className="text-foreground">
                {e.action} · {e.target} {e.detail ? `— ${e.detail}` : ""}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {new Date(e.created_at).toLocaleString("pt-MZ")}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Se vires uma entrada no admin que não fizeste, muda já a senha e remove o autenticador no
          Supabase. Atualiza sozinho a cada minuto.
        </p>
      </div>
    </div>
  );
}
