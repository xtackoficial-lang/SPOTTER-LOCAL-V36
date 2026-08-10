import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PLANS, FREE_PLAN, useSubscription, type PaidPlanId } from "@/lib/subscription-storage";
import { useOnboarding } from "@/lib/onboarding-storage";
import { Icon } from "@/components/Icon";
import { RequireBusiness } from "@/components/RequireBusiness";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/subscribe")({
  head: () => ({ meta: [{ title: "Planos — Spotter Local" }] }),
  component: () => (
    <RequireBusiness>
      <SubscribePage />
    </RequireBusiness>
  ),
});

// Esta página apenas escolhe o plano. O pagamento real (comprovativo,
// referência, validação) acontece em /payment — antes existiam dois
// fluxos de pagamento paralelos e desincronizados (um simulado aqui,
// outro completo em /payment que nunca era alcançado). Agora há um só.
function SubscribePage() {
  const tr = useT();
  const navigate = useNavigate();
  const { draft } = useOnboarding();
  const businessId = draft.business.businessId || "default";
  const { plan: currentPlan, isFree, isBlocked, isOverdue } = useSubscription(businessId);
  const [selected, setSelected] = useState<PaidPlanId>(
    currentPlan.id === "free" ? "starter" : (currentPlan.id as PaidPlanId),
  );

  const selectedPlan = PLANS.find((p) => p.id === selected)!;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/90 px-5 pb-3 pt-12 backdrop-blur-xl">
        <button
          onClick={() => navigate({ to: "/business" })}
          className="press grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground"
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            {tr("chooseAPlanTitle")}
          </h1>
          {(isBlocked || isOverdue) && (
            <p className="text-xs font-medium text-destructive">
              {isBlocked ? tr("accountBlockedReactivate") : tr("paymentOverdue")}
            </p>
          )}
        </div>
      </header>

      <main className="flex-1 px-5 py-5 pb-10">
        <div className="space-y-4 animate-slide-up">
          {/* Plano Free — sempre disponível, sem pagamento */}
          <div
            className={`relative w-full overflow-hidden rounded-3xl border p-5 text-left ${isFree ? "border-primary shadow-[var(--shadow-glow)]" : "border-border bg-card"}`}
          >
            {isFree && (
              <div
                className="absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-bold text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                {tr("currentPlanLabel")}
              </div>
            )}
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-foreground">{FREE_PLAN.name}</span>
              <span className="text-sm text-muted-foreground">{tr("alwaysFreeLabel")}</span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {FREE_PLAN.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon name="check" size={12} className="shrink-0 text-emerald-600" /> {tr(f)}
                </li>
              ))}
            </ul>
          </div>

          {PLANS.map((p) => {
            const on = selected === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`press relative w-full overflow-hidden rounded-3xl border p-5 text-left transition ${on ? "border-primary shadow-[var(--shadow-glow)]" : "border-border bg-card"}`}
              >
                {p.highlight && (
                  <div
                    className="absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-bold text-primary-foreground"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    {tr("mostPopularLabel")}
                  </div>
                )}
                {on && (
                  <div
                    className="pointer-events-none absolute inset-0 opacity-5"
                    style={{ background: "var(--gradient-primary)" }}
                  />
                )}
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 grid h-5 w-5 place-items-center rounded-full border-2 transition ${on ? "border-primary bg-primary" : "border-border"}`}
                  >
                    {on && <div className="h-2 w-2 rounded-full bg-primary-foreground" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold text-foreground">{p.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {p.price} {tr("perMonthSuffix")}
                      </span>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {p.features.map((f) => (
                        <li
                          key={f}
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                        >
                          <Icon name="check" size={12} className="shrink-0 text-emerald-600" />{" "}
                          {tr(f)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </button>
            );
          })}

          <button
            onClick={() => navigate({ to: "/payment", search: { plan: selected } })}
            className="press mt-2 h-14 w-full rounded-2xl text-base font-semibold text-primary-foreground shadow-[var(--shadow-soft)]"
            style={{ background: "var(--gradient-primary)" }}
          >
            {tr("continueWithPlanAction")} {selectedPlan.name} · {selectedPlan.price}{" "}
            {tr("perMonthSuffix")}
          </button>
        </div>
      </main>
    </div>
  );
}
