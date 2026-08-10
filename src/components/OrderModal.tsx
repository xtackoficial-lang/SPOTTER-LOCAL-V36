// ============================================================
// XTACK SPOTTER — Modal de pedido dentro do chat (v18)
// O cliente selecciona itens do catálogo, ajusta quantidades,
// aplica cupão e envia o pedido ao comerciante via chat.
// ============================================================
import { useState, useEffect } from "react";
import { Icon } from "@/components/Icon";
import { ShimmerButton } from "@/components/ShimmerButton";
import { fetchProducts, type ProductDB } from "@/lib/businesses-db";
import { createOrder, type OrderItem } from "@/lib/orders-storage";
import {
  fetchCouponByCode,
  validateCoupon,
  incrementCouponUse,
  type CouponValidation,
} from "@/lib/coupons-storage";
import { useT } from "@/lib/i18n";

interface OrderModalProps {
  businessId: string;
  businessName: string;
  clientId: string;
  onClose: () => void;
  onOrderSent: (summary: string) => void; // mensagem para o chat
}

export function OrderModal({
  businessId,
  businessName,
  clientId,
  onClose,
  onOrderSent,
}: OrderModalProps) {
  const tr = useT();
  const [products, setProducts] = useState<ProductDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({}); // id → qty
  const [note, setNote] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponResult, setCouponResult] = useState<CouponValidation | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchProducts(businessId).then((p) => {
      setProducts(p.filter((x) => x.available));
      setLoading(false);
    });
  }, [businessId]);

  const setQty = (id: string, delta: number) => {
    setCart((prev) => {
      const next = { ...prev };
      const q = (next[id] ?? 0) + delta;
      if (q <= 0) delete next[id];
      else next[id] = q;
      return next;
    });
    // limpar cupão ao mudar carrinho
    setCouponResult(null);
  };

  const cartItems: OrderItem[] = products
    .filter((p) => cart[p.id])
    .map((p) => ({
      productId: p.id,
      productName: p.name,
      qty: cart[p.id],
      unitPrice: p.price,
    }));

  const subtotal = cartItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const discount = couponResult?.valid ? (couponResult.discountAmount ?? 0) : 0;
  const total = Math.max(0, subtotal - discount);

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    const coupon = await fetchCouponByCode(businessId, couponCode);
    if (!coupon) {
      setCouponResult({ valid: false, error: tr("couponNotFound") });
      return;
    }
    setCouponResult(validateCoupon(coupon, subtotal));
  };

  const sendOrder = async () => {
    if (cartItems.length === 0) return;
    setSending(true);
    try {
      const order = await createOrder({
        businessId,
        businessName,
        clientId,
        items: cartItems,
        total,
        note: note.trim() || undefined,
        status: "pending",
      });
      if (couponResult?.valid && couponResult.coupon)
        await incrementCouponUse(couponResult.coupon.id);

      // gera resumo para o chat
      const lines = cartItems.map(
        (i) => `• ${i.qty}× ${i.productName} — ${(i.qty * i.unitPrice).toLocaleString()} MZN`,
      );
      const summary = [
        `🛒 *Pedido #${order.id.slice(0, 6).toUpperCase()}*`,
        ...lines,
        discount > 0 ? `Desconto: -${discount.toLocaleString()} MZN` : "",
        `*Total: ${total.toLocaleString()} MZN*`,
        note ? `Nota: ${note}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      onOrderSent(summary);
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-lg animate-auth-card-enter">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 pb-3 pt-12">
        <button
          onClick={onClose}
          className="press grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground"
        >
          <Icon name="x" size={16} />
        </button>
        <div>
          <div className="text-sm font-semibold text-foreground">{tr("makeOrderTitle")}</div>
          <div className="text-xs text-muted-foreground">{businessName}</div>
        </div>
      </div>

      {/* Catálogo */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {tr("loadingCatalog")}
          </div>
        ) : products.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {tr("noProductsYet")}
          </div>
        ) : (
          products.map((p) => {
            const qty = cart[p.id] ?? 0;
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 animate-stagger-in"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{p.name}</div>
                  {p.description && (
                    <div className="text-xs text-muted-foreground line-clamp-1">
                      {p.description}
                    </div>
                  )}
                  <div className="mt-1 text-sm font-bold text-primary">
                    {p.price.toLocaleString()} {p.currency || "MZN"}
                  </div>
                </div>
                {/* Contador */}
                <div className="flex items-center gap-2 shrink-0">
                  {qty > 0 && (
                    <>
                      <button
                        onClick={() => setQty(p.id, -1)}
                        className="press grid h-8 w-8 place-items-center rounded-full border border-border bg-muted text-foreground"
                      >
                        <Icon name="minus" size={14} />
                      </button>
                      <span className="w-5 text-center text-sm font-bold text-foreground">
                        {qty}
                      </span>
                    </>
                  )}
                  <button
                    onClick={() => setQty(p.id, 1)}
                    className="press grid h-8 w-8 place-items-center rounded-full text-primary-foreground shadow-[var(--shadow-soft)]"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <Icon name="plus" size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Resumo + enviar (só quando há itens) */}
      {cartItems.length > 0 && (
        <div className="border-t border-border bg-card px-4 py-4 space-y-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {/* Cupão */}
          <div className="flex gap-2">
            <input
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder={tr("couponCodePlaceholder")}
              className="h-10 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={applyCoupon}
              className="press h-10 rounded-xl border border-primary px-3 text-xs font-semibold text-primary"
            >
              {tr("applyAction")}
            </button>
          </div>
          {couponResult && (
            <div
              className={`text-xs px-1 ${couponResult.valid ? "text-emerald-500" : "text-destructive"}`}
            >
              {couponResult.valid
                ? `✓ ${tr("discountAppliedPrefix")} ${couponResult.discountAmount?.toLocaleString()} MZN ${tr("discountAppliedSuffix")}`
                : couponResult.error}
            </div>
          )}

          {/* Nota */}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={tr("noteForMerchantPlaceholder")}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
          />

          {/* Totais */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>{tr("subtotalLabel")}</span>
              <span>{subtotal.toLocaleString()} MZN</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-emerald-500">
                <span>{tr("discountLabel")}</span>
                <span>-{discount.toLocaleString()} MZN</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-foreground">
              <span>{tr("totalLabel")}</span>
              <span>{total.toLocaleString()} MZN</span>
            </div>
          </div>

          <ShimmerButton
            onClick={sendOrder}
            disabled={sending}
            className="press h-12 w-full rounded-2xl text-sm font-bold text-primary-foreground disabled:opacity-50"
            style={{ background: "var(--gradient-primary)" }}
          >
            {sending
              ? tr("sendingAction")
              : `${tr("sendOrderAction")} · ${total.toLocaleString()} MZN`}
          </ShimmerButton>
        </div>
      )}
    </div>
  );
}
