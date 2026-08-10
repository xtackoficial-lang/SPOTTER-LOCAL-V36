// ============================================================
// XTACK SPOTTER — Gestão de pedidos do negócio (v18)
// O comerciante vê os pedidos recebidos, aceita/recusa,
// e marca como entregue. Acessível via "Ações rápidas".
// ============================================================
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useOnboarding } from "@/lib/onboarding-storage";
import {
  fetchBusinessOrders,
  updateOrderStatus,
  type Order,
  type OrderStatus,
} from "@/lib/orders-storage";
import { Icon } from "@/components/Icon";
import { BreathingLoader } from "@/components/BreathingLoader";
import { ShimmerButton } from "@/components/ShimmerButton";
import { RequireBusiness } from "@/components/RequireBusiness";
import { useT, useLocale, INTL_TAG } from "@/lib/i18n";

export const Route = createFileRoute("/business/orders")({
  head: () => ({ meta: [{ title: "Pedidos — Spotter Local" }] }),
  component: () => (
    <RequireBusiness>
      <OrdersPage />
    </RequireBusiness>
  ),
});

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending: "text-amber-500",
  accepted: "text-emerald-500",
  rejected: "text-destructive",
  delivered: "text-primary",
  cancelled: "text-muted-foreground",
};

function OrdersPage() {
  const tr = useT();
  const [locale] = useLocale();
  const STATUS_LABEL: Record<OrderStatus, string> = {
    pending: tr("orderStatusNew"),
    accepted: tr("orderStatusAccepted"),
    rejected: tr("orderStatusRejected"),
    delivered: tr("orderStatusDelivered"),
    cancelled: tr("orderStatusCancelled"),
  };
  const FILTERS = [
    { key: "all" as const, label: tr("filterAll") },
    { key: "pending" as const, label: tr("filterNew") },
    { key: "accepted" as const, label: tr("filterAccepted") },
    { key: "delivered" as const, label: tr("filterDelivered") },
  ];
  const { draft, hydrated: onboardingHydrated } = useOnboarding();
  const businessId = draft.business.businessId;
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");

  useEffect(() => {
    if (!onboardingHydrated) return;
    if (!businessId) {
      // Antes isto deixava "loading" preso em true para sempre — sem
      // businessId a busca nunca corria, mas também nunca parava o
      // spinner, por isso a página parecia "pendurada" sem nunca dar
      // erro nem mostrar nada.
      setLoading(false);
      return;
    }
    fetchBusinessOrders(businessId).then((o) => {
      setOrders(o);
      setLoading(false);
    });
  }, [onboardingHydrated, businessId]);

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    await updateOrderStatus(orderId, status);
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
  };

  const visible = filter === "all" ? orders : orders.filter((o) => o.status === filter);
  const pendingCount = orders.filter((o) => o.status === "pending").length;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/90 px-4 pb-3 pt-12 backdrop-blur-xl">
        <button
          onClick={() => navigate({ to: "/business" })}
          className="press grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground"
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <div>
          <h1 className="text-base font-bold text-foreground">{tr("ordersTitle")}</h1>
          {pendingCount > 0 && (
            <p className="text-xs font-medium text-amber-500">
              {pendingCount} {tr("pendingAwaitingReply")}
            </p>
          )}
        </div>
      </header>

      {/* Filtros */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`press shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              filter === f.key
                ? "text-primary-foreground"
                : "border border-border bg-card text-muted-foreground"
            }`}
            style={filter === f.key ? { background: "var(--gradient-primary)" } : undefined}
          >
            {f.label}
          </button>
        ))}
      </div>

      <main className="flex-1 px-4 pb-8 space-y-3">
        {loading ? (
          <div className="flex justify-center pt-16">
            <BreathingLoader size={40} label={tr("loadingOrders")} />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 pt-16 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-muted">
              <Icon name="cart" size={28} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{tr("noOrdersHereYet")}</p>
          </div>
        ) : (
          visible.map((order) => (
            <div
              key={order.id}
              className="rounded-2xl border border-border bg-card p-4 space-y-3 animate-stagger-in"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">
                    #{order.id.slice(0, 6).toUpperCase()} ·{" "}
                    {new Date(order.createdAt).toLocaleString(INTL_TAG[locale], {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <span className={`text-xs font-bold ${STATUS_COLOR[order.status]}`}>
                  {STATUS_LABEL[order.status as OrderStatus] ?? order.status}
                </span>
              </div>

              <div className="space-y-1">
                {order.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm text-foreground">
                    <span>
                      {item.qty}× {item.productName}
                    </span>
                    <span className="text-muted-foreground">
                      {(item.qty * item.unitPrice).toLocaleString()} MZN
                    </span>
                  </div>
                ))}
              </div>

              {order.note && (
                <div className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                  📝 {order.note}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="text-sm font-bold text-foreground">
                  {tr("totalLabel")}: {order.total.toLocaleString()} MZN
                </span>
              </div>

              {/* Acções por status */}
              {order.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => updateStatus(order.id, "rejected")}
                    className="press flex-1 rounded-xl border border-destructive py-2.5 text-xs font-semibold text-destructive"
                  >
                    {tr("rejectAction")}
                  </button>
                  <ShimmerButton
                    onClick={() => updateStatus(order.id, "accepted")}
                    className="press flex-1 rounded-xl py-2.5 text-xs font-semibold text-primary-foreground"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    {tr("acceptAction")}
                  </ShimmerButton>
                </div>
              )}
              {order.status === "accepted" && (
                <ShimmerButton
                  onClick={() => updateStatus(order.id, "delivered")}
                  className="press w-full rounded-xl py-2.5 text-xs font-semibold text-primary-foreground"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  {tr("markDeliveredAction")}
                </ShimmerButton>
              )}
            </div>
          ))
        )}
      </main>
    </div>
  );
}
