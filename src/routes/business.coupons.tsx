// ============================================================
// XTACK SPOTTER — Gestão de cupões do negócio (v18)
// O comerciante cria cupões com código, desconto % ou fixo,
// validade e limite de usos. Lista os existentes com estado.
// ============================================================
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useOnboarding } from "@/lib/onboarding-storage";
import {
  createCoupon,
  fetchBusinessCoupons,
  type Coupon,
  type DiscountType,
} from "@/lib/coupons-storage";
import { Icon } from "@/components/Icon";
import { BreathingLoader } from "@/components/BreathingLoader";
import { ShimmerButton } from "@/components/ShimmerButton";
import { RequireBusiness } from "@/components/RequireBusiness";
import { useT, useLocale, INTL_TAG } from "@/lib/i18n";

export const Route = createFileRoute("/business/coupons")({
  head: () => ({ meta: [{ title: "Cupões — Spotter Local" }] }),
  component: () => (
    <RequireBusiness>
      <CouponsPage />
    </RequireBusiness>
  ),
});

function CouponsPage() {
  const tr = useT();
  const [locale] = useLocale();
  const { draft, hydrated: onboardingHydrated } = useOnboarding();
  const businessId = draft.business.businessId;
  const navigate = useNavigate();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Formulário
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [minOrderValue, setMinOrderValue] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!onboardingHydrated) return;
    if (!businessId) {
      setLoading(false);
      return;
    }
    fetchBusinessCoupons(businessId).then((c) => {
      setCoupons(c);
      setLoading(false);
    });
  }, [onboardingHydrated, businessId]);

  const resetForm = () => {
    setCode("");
    setDiscountValue("");
    setMinOrderValue("");
    setMaxUses("");
    setExpiresAt("");
    setDiscountType("percent");
  };

  const submit = async () => {
    if (!businessId || !code.trim() || !discountValue) return;
    setSaving(true);
    try {
      const newCoupon = await createCoupon({
        businessId: businessId,
        code: code.trim().toUpperCase(),
        discountType,
        discountValue: Number(discountValue),
        minOrderValue: minOrderValue ? Number(minOrderValue) : undefined,
        maxUses: maxUses ? Number(maxUses) : undefined,
        expiresAt: expiresAt || undefined,
        active: true,
      });
      setCoupons((prev) => [newCoupon, ...prev]);
      resetForm();
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card/90 px-4 pb-3 pt-12 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/business" })}
            className="press grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground"
          >
            <Icon name="arrowLeft" size={16} />
          </button>
          <h1 className="text-base font-bold text-foreground">{tr("couponsTitle")}</h1>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="press grid h-9 w-9 place-items-center rounded-full text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Icon name={showForm ? "x" : "plus"} size={16} />
        </button>
      </header>

      <main className="flex-1 px-4 py-5 space-y-4">
        {/* Formulário de criação */}
        {showForm && (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4 animate-auth-card-enter">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={tr("couponCodeExPlaceholder")}
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold tracking-wider outline-none focus:border-primary"
              maxLength={20}
            />

            <div className="flex gap-2">
              <button
                onClick={() => setDiscountType("percent")}
                className={`press flex-1 rounded-xl border py-2.5 text-xs font-semibold ${
                  discountType === "percent"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {tr("percentLabel")}
              </button>
              <button
                onClick={() => setDiscountType("fixed")}
                className={`press flex-1 rounded-xl border py-2.5 text-xs font-semibold ${
                  discountType === "fixed"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {tr("fixedMznLabel")}
              </button>
            </div>

            <input
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value.replace(/\D/g, ""))}
              placeholder={
                discountType === "percent"
                  ? tr("discountPercentPlaceholder")
                  : tr("discountMznPlaceholder")
              }
              inputMode="numeric"
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            />

            <input
              value={minOrderValue}
              onChange={(e) => setMinOrderValue(e.target.value.replace(/\D/g, ""))}
              placeholder={tr("minOrderPlaceholder")}
              inputMode="numeric"
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            />

            <div className="flex gap-2">
              <input
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))}
                placeholder={tr("maxUsesPlaceholder")}
                inputMode="numeric"
                className="h-11 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <input
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                type="date"
                className="h-11 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </div>

            <ShimmerButton
              onClick={submit}
              disabled={!code.trim() || !discountValue || saving}
              className="press h-12 w-full rounded-2xl text-sm font-bold text-primary-foreground disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}
            >
              {saving ? tr("creatingAction") : tr("createCouponAction")}
            </ShimmerButton>
          </div>
        )}

        {/* Lista de cupões */}
        {loading ? (
          <div className="flex justify-center pt-10">
            <BreathingLoader size={36} label={tr("loadingCoupons")} />
          </div>
        ) : coupons.length === 0 && !showForm ? (
          <div className="flex flex-col items-center gap-3 pt-16 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-muted">
              <Icon name="tag" size={28} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{tr("createFirstCouponHint")}</p>
          </div>
        ) : (
          coupons.map((c) => {
            const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
            const exhausted = c.maxUses != null && c.usedCount >= c.maxUses;
            const isLive = c.active && !expired && !exhausted;
            return (
              <div
                key={c.id}
                className="rounded-2xl border border-border bg-card p-4 animate-stagger-in"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-base font-bold tracking-wider text-foreground">
                    {c.code}
                  </span>
                  <span
                    className={`text-xs font-bold ${isLive ? "text-emerald-500" : "text-muted-foreground"}`}
                  >
                    {isLive
                      ? tr("couponStatusActive")
                      : expired
                        ? tr("couponStatusExpired")
                        : exhausted
                          ? tr("couponStatusExhausted")
                          : tr("couponStatusInactive")}
                  </span>
                </div>
                <div className="mt-1 text-sm text-primary font-semibold">
                  {c.discountType === "percent"
                    ? `${c.discountValue} ${tr("percentDiscountLabel")}`
                    : `${c.discountValue} ${tr("mznDiscountLabel")}`}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {c.minOrderValue && (
                    <span>
                      {tr("minOrderLabel")} {c.minOrderValue} MZN
                    </span>
                  )}
                  {c.maxUses != null && (
                    <span>
                      {tr("usesLabel")} {c.usedCount}/{c.maxUses}
                    </span>
                  )}
                  {c.expiresAt && (
                    <span>
                      {tr("expiresLabel")}{" "}
                      {new Date(c.expiresAt).toLocaleDateString(INTL_TAG[locale])}
                    </span>
                  )}
                  {!c.maxUses && !c.expiresAt && !c.minOrderValue && (
                    <span>{tr("noRestrictionsLabel")}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
