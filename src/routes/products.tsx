import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useOnboarding } from "@/lib/onboarding-storage";
import { useProducts, type Product } from "@/lib/products-storage";
import { useSubscription } from "@/lib/subscription-storage";
import { BusinessBottomNav } from "@/components/BusinessBottomNav";
import { Icon } from "@/components/Icon";
import { RequireBusiness } from "@/components/RequireBusiness";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/products")({
  head: () => ({ meta: [{ title: "Produtos — Spotter Local" }] }),
  component: () => (
    <RequireBusiness>
      <ProductsPage />
    </RequireBusiness>
  ),
});

function ProductsPage() {
  const tr = useT();
  const PRODUCT_CATS = [
    tr("catFood"),
    tr("catDrinks"),
    tr("catServices"),
    tr("catProducts"),
    tr("catAccommodation"),
    tr("catOther"),
  ];
  const navigate = useNavigate();
  const { draft } = useOnboarding();
  const businessId = draft.business.businessId || "default";
  const { products, add, update, remove, toggle } = useProducts(businessId);
  const { plan, isBlocked } = useSubscription(businessId);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    category: PRODUCT_CATS[0],
  });

  const atLimit = products.length >= plan.maxProducts;

  const resetForm = () => {
    setForm({ name: "", description: "", price: "", category: PRODUCT_CATS[0] });
    setEditId(null);
  };

  const openEdit = (p: Product) => {
    setForm({
      name: p.name,
      description: p.description,
      price: String(p.price),
      category: p.category,
    });
    setEditId(p.id);
    setShowForm(true);
  };

  const submit = () => {
    const price = parseFloat(form.price) || 0;
    if (!form.name.trim()) return;
    if (editId) {
      update(editId, {
        name: form.name,
        description: form.description,
        price,
        category: form.category,
      });
    } else {
      add({
        name: form.name,
        description: form.description,
        price,
        category: form.category,
        currency: "MZN",
        available: true,
      });
    }
    resetForm();
    setShowForm(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/90 px-5 pb-3 pt-12 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/business" })}
            className="press grid h-9 w-9 place-items-center rounded-full bg-muted"
          >
            <Icon name="arrowLeft" size={16} />
          </button>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              {tr("productsServicesTitle")}
            </h1>
            <p className="text-[10px] text-muted-foreground">
              {products.length}/{plan.maxProducts} {tr("onPlanLabel")} {plan.name}
            </p>
          </div>
        </div>
        {!isBlocked && !atLimit && (
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="press grid h-9 w-9 place-items-center rounded-full text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Icon name="plus" size={18} />
          </button>
        )}
      </header>

      <main className="flex-1 px-5 py-5 pb-24">
        {/* Blocked banner */}
        {isBlocked && (
          <div className="mb-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 animate-slide-up">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <Icon name="lock" size={16} /> {tr("accountBlockedTitle")}
            </div>
            <p className="mt-1 text-xs text-destructive/80">{tr("monthlyOverdueManage")}</p>
            <button
              onClick={() => navigate({ to: "/subscribe" })}
              className="press mt-3 h-10 w-full rounded-xl text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              {tr("viewPlansAction")}
            </button>
          </div>
        )}

        {atLimit && !isBlocked && (
          <div className="mb-4 rounded-2xl border border-amber-300/40 bg-amber-500/10 p-4">
            <p className="text-xs text-amber-700">
              {tr("planLimitReached")} ({plan.maxProducts}{" "}
              {tr("productsServicesTitle").split("/")[0].trim().toLowerCase()}).{" "}
              <button
                onClick={() => navigate({ to: "/subscribe" })}
                className="font-semibold underline"
              >
                {tr("upgradeplanAction")}
              </button>
            </p>
          </div>
        )}

        {/* Form */}
        {showForm && !isBlocked && (
          <div className="mb-5 rounded-3xl border border-border bg-card p-5 animate-slide-up shadow-[var(--shadow-lift)]">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-foreground">
                {editId ? tr("editProductTitle") : tr("newProductTitle")}
              </div>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="text-muted-foreground"
              >
                <Icon name="plus" size={18} className="rotate-45" />
              </button>
            </div>
            <div className="space-y-3">
              {[
                {
                  labelKey: "productNameLabel",
                  key: "name",
                  placeholderKey: "productNamePlaceholder",
                  type: "text",
                },
                {
                  labelKey: "descriptionLabel",
                  key: "description",
                  placeholderKey: "briefDescriptionPlaceholder",
                  type: "text",
                },
                { labelKey: "priceMznLabel", key: "price", placeholder: "0", type: "number" },
              ].map(({ labelKey, key, placeholderKey, placeholder, type }) => (
                <div key={key}>
                  <div className="mb-1 text-xs font-medium text-foreground">
                    {tr(labelKey as Parameters<typeof tr>[0])}
                  </div>
                  <input
                    type={type}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={
                      placeholderKey
                        ? tr(placeholderKey as Parameters<typeof tr>[0])
                        : (placeholder ?? "")
                    }
                    className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus:border-primary"
                  />
                </div>
              ))}
              <div>
                <div className="mb-1 text-xs font-medium text-foreground">
                  {tr("categoryLabel")}
                </div>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
                >
                  {PRODUCT_CATS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={submit}
                disabled={!form.name.trim()}
                className="press h-12 w-full rounded-xl text-sm font-semibold text-primary-foreground disabled:opacity-50"
                style={{ background: "var(--gradient-primary)" }}
              >
                {editId ? tr("saveChangesAction") : tr("addProductAction")}
              </button>
            </div>
          </div>
        )}

        {/* Product list */}
        {products.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center animate-pop-in">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
              <Icon name="tag" size={26} />
            </div>
            <div className="mt-4 font-semibold text-foreground">{tr("noProductsTitle")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{tr("addCatalogHint")}</p>
          </div>
        ) : (
          <div className="space-y-3 stagger">
            {products.map((p) => (
              <div
                key={p.id}
                className="press rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {p.name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${p.available ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground"}`}
                      >
                        {p.available ? tr("availableBadge") : tr("unavailableBadge")}
                      </span>
                    </div>
                    {p.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                        {p.description}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center gap-3 text-xs">
                      <span className="font-semibold text-foreground">
                        {p.price > 0 ? `${p.price} MZN` : tr("consultLabel")}
                      </span>
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] text-accent-foreground">
                        {p.category}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => toggle(p.id)}
                      className="press grid h-8 w-8 place-items-center rounded-xl border border-border bg-muted text-muted-foreground hover:border-primary/40"
                    >
                      <Icon name={p.available ? "eye" : "clock"} size={14} />
                    </button>
                    <button
                      onClick={() => openEdit(p)}
                      className="press grid h-8 w-8 place-items-center rounded-xl border border-border bg-muted text-muted-foreground"
                    >
                      <Icon name="schedule" size={14} />
                    </button>
                    <button
                      onClick={() => remove(p.id)}
                      className="press grid h-8 w-8 place-items-center rounded-xl border border-destructive/30 bg-destructive/10 text-destructive"
                    >
                      <Icon name="plus" size={14} className="rotate-45" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <BusinessBottomNav />
    </div>
  );
}
