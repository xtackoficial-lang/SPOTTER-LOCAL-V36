import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { useSubscription } from "@/lib/subscription-storage";
import { useOnboarding } from "@/lib/onboarding-storage";
import { useT } from "@/lib/i18n";

// Mostrado no lugar dos ecrãs de compra de planos/publicações pagas quando a
// app foi aberta pela Play Store. Só mostra o plano atual — sem preços,
// sem botão de pagar e sem indicar onde pagar.
export function PlayPlansNotice() {
  const tr = useT();
  const navigate = useNavigate();
  const { draft } = useOnboarding();
  const businessId = draft.business.businessId || "default";
  const { plan } = useSubscription(businessId);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="glass-bar sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/90 px-5 pb-3 pt-12 backdrop-blur-xl">
        <button
          onClick={() => navigate({ to: "/business", replace: true })}
          className="press grid h-9 w-9 place-items-center rounded-full glass-btn text-muted-foreground"
          aria-label="Voltar"
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <h1 className="text-base font-bold text-foreground">{tr("playPlansTitle")}</h1>
      </header>
      <main className="flex-1 space-y-4 px-5 py-6">
        <div className="rounded-3xl border border-primary bg-card p-5" data-play-plan-notice>
          <div className="text-xs text-muted-foreground">{tr("currentPlanLabel")}</div>
          <div className="mt-1 text-lg font-bold text-foreground">{plan.name}</div>
          <ul className="mt-3 space-y-1.5">
            {plan.features.map((f) => (
              <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon name="check" size={12} className="shrink-0 text-emerald-600" /> {tr(f)}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-muted-foreground">{tr("playPlansBody")}</p>
      </main>
    </div>
  );
}
