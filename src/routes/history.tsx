// ============================================================
// XTACK SPOTTER — Histórico de pedidos do cliente (v18)
// Lista todos os pedidos feitos pelo utilizador autenticado,
// com status, total e data — acessível via perfil/conta.
// ============================================================
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchClientOrders, updateOrderStatus, type Order } from "@/lib/orders-storage";
import { Icon } from "@/components/Icon";
import { BreathingLoader } from "@/components/BreathingLoader";
import { BottomNav } from "@/components/BottomNav";
import { useT, useLocale, INTL_TAG } from "@/lib/i18n";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "Histórico — Spotter Local" }] }),
  component: HistoryPage,
});

function statusLabel(tr: (k: string) => string, status: string): string {
  const map: Record<string, string> = {
    pending: tr("orderStatusPending"),
    accepted: tr("orderStatusAccepted"),
    rejected: tr("orderStatusRejected"),
    delivered: tr("orderStatusDelivered"),
    cancelled: tr("orderStatusCancelled"),
  };
  return map[status] ?? status;
}
const STATUS_COLOR: Record<string, string> = {
  pending: "text-amber-500",
  accepted: "text-emerald-500",
  rejected: "text-destructive",
  delivered: "text-primary",
  cancelled: "text-muted-foreground",
};

function HistoryPage() {
  const tr = useT();
  const [locale] = useLocale();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate({ to: "/" });
      return;
    }
    fetchClientOrders(user.id).then((o) => {
      setOrders(o);
      setLoading(false);
    });
  }, [user, navigate]);

  const cancel = async (orderId: string) => {
    await updateOrderStatus(orderId, "cancelled");
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: "cancelled" } : o)));
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/90 px-4 pb-3 pt-12 backdrop-blur-xl">
        <button
          onClick={() => navigate({ to: "/profile" })}
          className="press grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground"
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <h1 className="text-base font-bold text-foreground">{tr("orderHistoryTitle")}</h1>
      </header>

      <main className="flex-1 px-4 py-5 space-y-3">
        {loading ? (
          <div className="flex justify-center pt-16">
            <BreathingLoader size={40} label={tr("loadingHistory")} />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 pt-16 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-muted">
              <Icon name="cart" size={28} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{tr("noOrdersYet")}</p>
          </div>
        ) : (
          orders.map((order) => (
            <div
              key={order.id}
              className="rounded-2xl border border-border bg-card p-4 space-y-3 animate-stagger-in"
            >
              {/* Cabeçalho do pedido */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-foreground">{order.businessName}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString(INTL_TAG[locale], {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <span className={`text-xs font-semibold ${STATUS_COLOR[order.status]}`}>
                  {statusLabel(tr, order.status)}
                </span>
              </div>

              {/* Items */}
              <div className="space-y-1">
                {order.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {item.qty}× {item.productName}
                    </span>
                    <span>{(item.qty * item.unitPrice).toLocaleString()} MZN</span>
                  </div>
                ))}
              </div>

              {/* Total + acções */}
              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="text-sm font-bold text-foreground">
                  {tr("totalLabel")}: {order.total.toLocaleString()} MZN
                </span>
                {order.status === "pending" && (
                  <button
                    onClick={() => cancel(order.id)}
                    className="press rounded-xl border border-destructive px-3 py-1.5 text-xs font-semibold text-destructive"
                  >
                    {tr("cancel")}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </main>
      <BottomNav />
    </div>
  );
}
