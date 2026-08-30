// ============================================================
// Guarda de rota para páginas comerciais (painel, produtos,
// estatísticas, perfil do negócio). Sem isto, uma conta pessoal
// que navegue manualmente para /business, /merchant, /products
// ou /analytics conseguia entrar e ver um painel vazio/quebrado.
//
// CORREÇÃO (2026-08-18): antes, isto decidia "conta comercial?" olhando
// SÓ para draft.profileType no localStorage. Um comerciante que abrisse a
// app directamente numa destas páginas (atalho salvo, notificação, ou o
// APK reaberto nessa rota) — sem passar primeiro por /home — e cujo
// draft local estivesse vazio (outro dispositivo, cache limpa, ou depois
// de sair da conta) era expulso para o onboarding, mesmo já tendo negócio
// cadastrado no Supabase. Agora usa o mesmo useAccountRecovery() de
// routes/home.tsx, que verifica o Supabase antes de decidir.
// ============================================================
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAccountRecovery } from "@/lib/account-recovery";
import { Icon } from "@/components/Icon";

export function RequireBusiness({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { draft, ready } = useAccountRecovery();

  // "personal" = conta pessoal tentando entrar numa área comercial → bloquear.
  // null/undefined = ainda não escolheu tipo de conta → manda para o onboarding.
  // "business" = correcto, mesmo que o onboarding comercial ainda não tenha
  // terminado (ex: a meio do fluxo em /subscribe ou /payment).
  const isPersonal = draft.profileType === "personal";
  const isUnset = !draft.profileType;

  useEffect(() => {
    if (!ready) return;
    if (isPersonal || isUnset) {
      navigate({ to: "/onboarding" });
    }
  }, [ready, isPersonal, isUnset, navigate]);

  if (!ready) {
    return <div className="min-h-screen bg-background" />;
  }

  if (isPersonal || isUnset) {
    // Estado breve antes do redirect acima disparar — evita um "flash"
    // do painel comercial vazio para contas pessoais.
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <Icon name="lock" size={28} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Esta área é exclusiva para contas comerciais. A redireccionar…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
