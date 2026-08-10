import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Icon } from "@/components/Icon";
import { getAnalyticsSummary, type AnalyticsSummary, type DailyAnalytic } from "@/lib/analytics-db";
import { useOnboarding } from "@/lib/onboarding-storage";
import { useSubscription } from "@/lib/subscription-storage";
import { RequireBusiness } from "@/components/RequireBusiness";
import { useT, useLocale, INTL_TAG } from "@/lib/i18n";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Spotter Local" }] }),
  component: () => (
    <RequireBusiness>
      <AnalyticsPage />
    </RequireBusiness>
  ),
});

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className={`mb-2 grid h-9 w-9 place-items-center rounded-xl ${color}`}>
        <Icon name={icon} size={18} className="text-white" />
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {sub && <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// Mini bar chart usando divs
function BarChart({ data }: { data: DailyAnalytic[] }) {
  const maxVal = Math.max(...data.map((d) => d.views), 1);
  const last14 = data.slice(0, 14).reverse();
  return (
    <div className="flex items-end gap-1 h-20">
      {last14.map((d, i) => {
        const h = Math.round((d.views / maxVal) * 100);
        const isToday = i === last14.length - 1;
        return (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-t-sm transition-all ${isToday ? "bg-primary" : "bg-muted"}`}
              style={{ height: `${Math.max(h, 4)}%` }}
              title={`${d.date}: ${d.views} visitas`}
            />
          </div>
        );
      })}
    </div>
  );
}

function AnalyticsPage() {
  const tr = useT();
  const [locale] = useLocale();
  const navigate = useNavigate();
  const { draft, hydrated } = useOnboarding();
  const businessId = draft.business.businessId || "default";
  const { plan, hydrated: subHydrated } = useSubscription(businessId);
  const hasAccess = plan.hasAnalytics;
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"overview" | "detail">("overview");

  useEffect(() => {
    if (!hydrated || !subHydrated || !hasAccess) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    getAnalyticsSummary(businessId)
      .then((s) => {
        if (cancelled) return;
        setSummary(s);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, hydrated, subHydrated, hasAccess, retryKey]);

  if (subHydrated && !hasAccess) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/90 px-5 pb-3 pt-12 backdrop-blur-xl">
          <button
            onClick={() => navigate({ to: "/business" })}
            className="press grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground"
          >
            <Icon name="arrowLeft" size={16} />
          </button>
          <h1 className="text-lg font-bold tracking-tight text-foreground">Analytics</h1>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/10">
            <Icon name="trendingUp" size={28} className="text-primary" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-foreground">
            Analytics é exclusivo dos planos Pro e Premium
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Veja visitas, cliques no telefone e mensagens recebidas, com comparação mês a mês.
            Disponível a partir do plano Pro.
          </p>
          <button
            onClick={() => navigate({ to: "/subscribe" })}
            className="press mt-6 h-12 w-full rounded-2xl text-sm font-semibold text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            Ver planos
          </button>
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (loadError || !summary) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <Icon name="x" size={28} className="text-destructive" />
        <p className="text-sm text-muted-foreground">Não foi possível carregar as estatísticas.</p>
        <button
          onClick={() => setRetryKey((k) => k + 1)}
          className="press rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/90 px-5 pb-3 pt-12 backdrop-blur-xl">
        <button
          onClick={() => navigate({ to: "/business" })}
          className="press grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground"
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight text-foreground">Analytics</h1>
          <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
        </div>
        <div
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            summary.trend === "up"
              ? "bg-emerald-500/15 text-emerald-700"
              : summary.trend === "down"
                ? "bg-destructive/15 text-destructive"
                : "bg-muted text-muted-foreground"
          }`}
        >
          <Icon
            name={
              summary.trend === "up"
                ? "trendingUp"
                : summary.trend === "down"
                  ? "trendingDown"
                  : "minus"
            }
            size={12}
          />
          {summary.trend === "stable" ? tr("stableLabel") : `${summary.trendPct}%`}
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border px-5 pt-2">
        {(["overview", "detail"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition ${activeTab === t ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
          >
            {t === "overview" ? tr("overviewTabLabel") : tr("detailTabLabel")}
          </button>
        ))}
      </div>

      <main className="flex-1 px-5 py-5 pb-24 space-y-5 animate-slide-up">
        {activeTab === "overview" && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon="eye"
                label={tr("profileVisitsLabel")}
                value={summary.totalViews.toLocaleString()}
                color="bg-blue-500"
              />
              <StatCard
                icon="mousePointer"
                label={tr("productClicksLabel")}
                value={summary.totalClicks.toLocaleString()}
                color="bg-violet-500"
              />
              <StatCard
                icon="messageCircle"
                label={tr("messagesTitle")}
                value={summary.totalMessages}
                color="bg-emerald-500"
              />
              <StatCard
                icon="mapPin"
                label={tr("mapPinsLabel")}
                value={summary.totalMapPins}
                color="bg-rose-500"
              />
            </div>

            {/* Gráfico visitas 14 dias */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 text-sm font-semibold text-foreground">
                Visitas — últimos 14 dias
              </div>
              <BarChart data={summary.last30} />
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                <span>{tr("last14DaysLabel")}</span>
                <span>{tr("todayLabel")}</span>
              </div>
            </div>

            {/* Taxa de conversão */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-2 text-sm font-semibold text-foreground">Taxa de conversão</div>
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1.5">
                  {[
                    {
                      label: tr("visitsToClicksLabel"),
                      a: summary.totalViews,
                      b: summary.totalClicks,
                    },
                    {
                      label: tr("clicksToMessagesLabel"),
                      a: summary.totalClicks,
                      b: summary.totalMessages,
                    },
                  ].map(({ label, a, b }) => {
                    const pct = a > 0 ? Math.round((b / a) * 100) : 0;
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>{label}</span>
                          <span className="font-medium text-foreground">{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: "var(--gradient-primary)" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "detail" && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground px-1">
              Top 5 dias com mais visitas
            </div>
            {summary.topDays.map((d) => (
              <div
                key={d.date}
                className="flex items-center justify-between rounded-2xl border border-border bg-card p-4"
              >
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {new Date(d.date).toLocaleDateString(INTL_TAG[locale], {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.clicks} cliques · {d.messages} mensagens
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-primary">{d.views}</div>
                  <div className="text-[10px] text-muted-foreground">visitas</div>
                </div>
              </div>
            ))}

            {/* Tabela completa */}
            <div className="text-xs font-semibold text-muted-foreground px-1 pt-2">
              Últimos 30 dias
            </div>
            {summary.last30.map((d) => (
              <div
                key={d.date}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5"
              >
                <span className="text-xs text-muted-foreground">
                  {new Date(d.date).toLocaleDateString(INTL_TAG[locale], {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
                <div className="flex gap-4 text-xs">
                  <span title={tr("visitsTitle")}>
                    <span className="text-blue-500">{d.views}</span> vis
                  </span>
                  <span title={tr("clicksTitle")}>
                    <span className="text-violet-500">{d.clicks}</span> cli
                  </span>
                  <span title={tr("messagesTitle")}>
                    <span className="text-emerald-500">{d.messages}</span> msg
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
