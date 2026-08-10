import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useOnboarding, BUSINESS_CATEGORIES } from "@/lib/onboarding-storage";
import { fetchBusinessConversations, type ConversationSummary } from "@/lib/messages-db";
import { getAnalyticsSummary, type AnalyticsSummary } from "@/lib/analytics-db";
import { useAuth } from "@/lib/auth-context";
import { useSubscription } from "@/lib/subscription-storage";
import { useProducts } from "@/lib/products-storage";
import {
  BOOST_PRICE_PER_DAY_MZN,
  getActiveBoostForBusiness,
  type BusinessBoost,
} from "@/lib/boost-storage";
import { BusinessBottomNav } from "@/components/BusinessBottomNav";
import { Icon } from "@/components/Icon";
import { RequireBusiness } from "@/components/RequireBusiness";
import { useScreenAppearance } from "@/lib/theme-storage";
import { useT } from "@/lib/i18n";
import { ThemeAnimationOnly, resolveBackgroundStyle } from "@/components/ThemeBackdrop";

export const Route = createFileRoute("/business")({
  head: () => ({ meta: [{ title: "Painel — Spotter Local Business" }] }),
  component: () => (
    <RequireBusiness>
      <BusinessDash />
    </RequireBusiness>
  ),
});

// Mostra o tempo restante de forma legível: em horas quando falta menos
// de um dia (caso comum nos boosts de 1 dia perto do fim), em dias
// inteiros para os pacotes mais longos.
function formatBoostExpiry(expiresAtIso: string, tr: (k: string) => string): string {
  const diffMs = new Date(expiresAtIso).getTime() - Date.now();
  if (diffMs <= 0) return tr("soonLabel");
  const hours = diffMs / 3_600_000;
  if (hours < 24)
    return `${tr("inHoursLabel")} ${Math.max(1, Math.round(hours))}${tr("hoursSuffix")}`;
  return `${tr("inDaysLabel")} ${Math.ceil(hours / 24)} ${tr("daysSuffix")}`;
}

function BusinessDash() {
  const tr = useT();
  const navigate = useNavigate();
  const { draft, hydrated } = useOnboarding();
  const { user } = useAuth();
  const businessId = draft.business.businessId || "default";
  const { sub, plan, isFree, isBlocked, isOverdue } = useSubscription(businessId);
  const { products } = useProducts(businessId);
  const [linkCopied, setLinkCopied] = useState(false);
  const { appearance } = useScreenAppearance("business");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeBoost, setActiveBoost] = useState<BusinessBoost | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    getActiveBoostForBusiness(businessId).then((b) => {
      if (!cancelled) setActiveBoost(b);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    getAnalyticsSummary(businessId).then((summary) => {
      if (!cancelled) setAnalytics(summary);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, businessId]);

  useEffect(() => {
    if (!hydrated || !user) return;
    let cancelled = false;
    fetchBusinessConversations(businessId, user.id).then((list) => {
      if (!cancelled) setConversations(list);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, user, businessId]);

  if (!hydrated) return <div className="min-h-screen bg-background" />;

  const b = draft.business;
  const cat = BUSINESS_CATEGORIES.find((c) => c.id === b.category);
  const unread = conversations.reduce((n, c) => n + c.unread, 0);

  // Nota: os cartões de estatísticas mostram os números do dia de hoje,
  // guardados em tempo real via trackEvent() (analytics-db.ts). Antes
  // eram valores fixos no código ("247", "38", "14") que nunca mudavam,
  // por isso o painel parecia "congelado" independentemente do que
  // acontecia com o negócio.
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const yesterdayRec = analytics?.last30.find((d) => d.date === yesterdayStr);
  const deltaLabel = (todayVal: number, field: "views" | "clicks" | "calls") => {
    if (!analytics) return "—";
    const prev = yesterdayRec ? yesterdayRec[field] : 0;
    const diff = todayVal - prev;
    if (diff === 0) return "—";
    return diff > 0 ? `+${diff}` : `${diff}`;
  };

  const stats = [
    {
      label: tr("statViewsToday"),
      value: analytics ? String(analytics.today.views) : "—",
      trend: analytics ? deltaLabel(analytics.today.views, "views") : "—",
      icon: "eye",
    },
    {
      label: tr("statRouteClicks"),
      value: analytics ? String(analytics.today.clicks) : "—",
      trend: analytics ? deltaLabel(analytics.today.clicks, "clicks") : "—",
      icon: "click",
    },
    {
      label: tr("statCalls"),
      value: analytics ? String(analytics.today.calls) : "—",
      trend: analytics ? deltaLabel(analytics.today.calls, "calls") : "—",
      icon: "phoneCall",
    },
    {
      label: tr("messagesTitle"),
      value: String(conversations.length),
      trend: unread ? `${unread} ${tr("statNewSuffix")}` : "—",
      icon: "message",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header
        className={`relative overflow-hidden px-5 pb-7 pt-12 text-primary-foreground ${appearance.enabled ? "" : "gradient-pan"}`}
        style={
          appearance.enabled
            ? resolveBackgroundStyle(appearance)
            : { background: "var(--gradient-hero)" }
        }
      >
        {appearance.enabled && <ThemeAnimationOnly appearance={appearance} />}
        <div className="pointer-events-none absolute -right-16 -top-10 h-56 w-56 rounded-full bg-white/10 blur-3xl animate-float" />
        <div className="relative animate-slide-up">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] opacity-80">
                {tr("dashboardTitle")}
              </div>
              <div className="mt-1 text-2xl font-bold tracking-tight">
                {b.businessName || tr("yourBusinessLabel")}
              </div>
              <div className="mt-1 inline-flex items-center gap-1.5 text-xs opacity-90">
                <Icon name={cat?.icon ?? "store"} size={13} /> {cat?.label ?? "—"} · {b.city}
              </div>
            </div>
            <Link
              to="/merchant"
              className="press inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/20 px-3 py-2 text-xs font-medium ring-1 ring-white/20 backdrop-blur-xl"
            >
              <Icon name="pencil" size={12} /> {tr("editAction")}
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/20 px-3 py-1.5 text-[11px] ring-1 ring-white/20 backdrop-blur-xl">
              {draft.verificationSubmittedAt ? (
                <>
                  <Icon name="check" size={12} /> {tr("registrationApproved")}
                </>
              ) : (
                <>
                  <Icon name="clock" size={12} /> {tr("registrationPending")}
                </>
              )}
            </div>
            {plan.hasVerifiedBadge && (
              <div className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/20 px-3 py-1.5 text-[11px] ring-1 ring-white/20 backdrop-blur-xl">
                <Icon name="verified" size={12} /> {tr("premiumBadgeActive")}
              </div>
            )}
            <button
              onClick={() => {
                const url = `${window.location.origin}/place/${businessId}`;
                if (navigator.share) {
                  navigator
                    .share({ title: b.businessName || tr("myBusinessLabel"), url })
                    .catch(() => {});
                } else {
                  navigator.clipboard
                    .writeText(url)
                    .then(() => setLinkCopied(true))
                    .catch(() => {});
                  setTimeout(() => setLinkCopied(false), 2000);
                }
              }}
              className="press inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/20 px-3 py-1.5 text-[11px] font-medium ring-1 ring-white/20 backdrop-blur-xl"
            >
              <Icon name={linkCopied ? "check" : "send"} size={12} />{" "}
              {linkCopied ? tr("shareLinkCopied") : tr("shareMyPage")}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-6 px-5 py-5 pb-24">
        <section className="grid grid-cols-2 gap-3 stagger">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]"
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Icon name={s.icon} size={12} className="text-primary" /> {s.label}
              </div>
              <div className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">
                {s.value}
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-emerald-600">{s.trend}</div>
            </div>
          ))}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
            {tr("quickActionsTitle")}
          </h2>
          <div className="grid grid-cols-3 gap-2.5 stagger">
            {[
              { i: "cart", l: tr("qaOrders"), to: "/business/orders" },
              { i: "tag", l: tr("qaCoupons"), to: "/business/coupons" },
              { i: "camera", l: tr("qaPhotos"), to: "/merchant" },
              { i: "tag", l: tr("qaProducts"), to: "/products" },
              { i: "qr", l: tr("qaQrCode"), to: "/qr-business" },
              { i: "schedule", l: tr("qaSchedule"), to: "/merchant" },
              { i: "megaphone", l: tr("qaAdvertise"), to: "/subscribe" },
              { i: "star", l: tr("qaReviews"), to: "/analytics" },
            ].map((a) => (
              <Link
                key={a.l}
                to={
                  a.to as
                    | "/merchant"
                    | "/products"
                    | "/qr-business"
                    | "/subscribe"
                    | "/analytics"
                    | "/business/orders"
                    | "/business/coupons"
                }
                className="press flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card p-3.5 text-xs font-medium hover:border-primary/40"
              >
                <Icon name={a.i} size={20} className="text-primary" /> {a.l}
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
              <Icon name="message" size={14} /> {tr("recentMessagesTitle")}
            </h2>
            <Link
              to="/business-inbox"
              className="inline-flex items-center gap-1 text-xs text-primary"
            >
              {tr("viewAllAction")} <Icon name="arrowRight" size={12} />
            </Link>
          </div>
          {conversations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              {tr("noMessagesCustomers")}
            </div>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {conversations.slice(0, 5).map((c) => (
                <li key={c.clientId}>
                  <Link
                    to="/business-inbox"
                    className="press flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent/40"
                  >
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                      <Icon name="user" size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-foreground">
                        {tr("clientLabel")}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{c.lastMessage}</div>
                    </div>
                    {c.unread > 0 && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold text-primary-foreground"
                        style={{ background: "var(--gradient-primary)" }}
                      >
                        {c.unread}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-lift)]">
          <div
            className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-2xl"
            style={{ background: "var(--gradient-primary)" }}
          />
          <div className="relative">
            {/* Subscription status */}
            {(isBlocked || isOverdue) && (
              <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <Icon name="lock" size={14} />{" "}
                  {isBlocked ? tr("accountBlockedTitle") : tr("paymentOverdue")}
                </div>
                <p className="mt-1 text-xs text-destructive/80">{tr("activatePlanContinue")}</p>
              </div>
            )}
            {isFree && !isBlocked && !isOverdue && (
              <div className="mb-4 rounded-xl border border-amber-300/40 bg-amber-500/10 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
                  <Icon name="info" size={14} /> {tr("onFreePlan")}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
              <Icon name="crown" size={16} className="text-amber-500" /> {tr("currentPlanTitle")}{" "}
              {plan.name}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {products.length}/{plan.maxProducts} produtos ·{" "}
              {isFree ? tr("freeLabel") : `${plan.price} ${tr("perMonthSuffix")}`}
            </p>
            <button
              onClick={() => navigate({ to: "/subscribe" })}
              className="press mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)]"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Icon name="sparkles" size={15} />{" "}
              {isBlocked || isOverdue
                ? tr("reactivatePlanAction")
                : isFree
                  ? tr("upgradeAction2")
                  : tr("changePlanAction")}
            </button>
            <button
              onClick={() => navigate({ to: "/boost" })}
              className={`press mt-2.5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border text-sm font-semibold ${
                activeBoost
                  ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-700"
                  : "border-amber-400/50 bg-amber-500/10 text-amber-700"
              }`}
            >
              <Icon name="flame" size={15} />{" "}
              {activeBoost
                ? `${tr("boostActiveExpires")} ${formatBoostExpiry(activeBoost.expiresAt, tr)}`
                : `${tr("boostFromPrice")} ${BOOST_PRICE_PER_DAY_MZN} ${tr("perDaySuffix")}`}
            </button>
          </div>
        </section>
      </main>
      <BusinessBottomNav />
    </div>
  );
}
