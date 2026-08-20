import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useOnboarding, INTERESTS, BUSINESS_CATEGORIES } from "@/lib/onboarding-storage";
import { useFavorites } from "@/lib/favorites-storage";
import { type Place } from "@/lib/places-data";
import { fetchBusinessById, businessToPlace } from "@/lib/businesses-db";
import { PlaceCard } from "@/components/PlaceCard";
import { BottomNav } from "@/components/BottomNav";
import { Icon } from "@/components/Icon";
import { useT, useLocale, LOCALE_LABELS, INTL_TAG } from "@/lib/i18n";
import { LanguageDropdown } from "@/components/LanguageSwitcher";
import { useScreenAppearance } from "@/lib/theme-storage";
import { ThemeAnimationOnly, resolveBackgroundStyle } from "@/components/ThemeBackdrop";
import { registerPushToken } from "@/lib/push-storage";

import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Perfil — Spotter Local" }] }),
  component: Profile,
});

function Profile() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { draft, hydrated, reset } = useOnboarding();
  const { ids } = useFavorites();
  const tr = useT();
  const [locale] = useLocale();
  const { appearance } = useScreenAppearance("profile");
  const [pushEnabled, setPushEnabled] = useState(
    typeof Notification !== "undefined" && Notification.permission === "granted",
  );
  const [favs, setFavs] = useState<Place[]>([]);

  // Carrega negócios favoritos — primeiro tenta Supabase, fallback para dados locais
  useEffect(() => {
    if (ids.length === 0) {
      setFavs([]);
      return;
    }
    Promise.all(
      ids.map((id) =>
        fetchBusinessById(id)
          .then((b) => (b ? businessToPlace(b) : null))
          .catch(() => null),
      ),
    ).then((results) => {
      setFavs(results.filter(Boolean) as Place[]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- join(",") já estabiliza a dependência
  }, [ids.join(",")]);

  if (!hydrated) return <div className="min-h-screen bg-background" />;

  const isBiz = draft.profileType === "business";
  const profile = isBiz ? draft.business : draft.personal;

  const signOut = async () => {
    reset();
    await logout();
    navigate({ to: "/" });
  };

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
        <div className="relative flex items-center gap-4 animate-slide-up">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary-foreground/20 ring-1 ring-white/20 backdrop-blur-xl">
            <Icon name={isBiz ? "store" : "user"} size={28} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xl font-bold tracking-tight">
              {isBiz
                ? draft.business.businessName || tr("businessLabel")
                : draft.personal.email?.split("@")[0] || "Olá"}
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs opacity-90">
              <Icon name="pin" size={11} /> {profile.city || "—"}, {profile.country || "—"}
            </div>
            <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] opacity-80">
              <Icon name="globe" size={10} /> {LOCALE_LABELS[locale]}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-5 px-5 py-5 pb-24">
        {isBiz ? (
          <section className="space-y-2">
            <Link
              to="/business"
              className="press block rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <Icon name="chart" size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Painel do negócio</div>
                    <div className="text-xs text-muted-foreground">
                      Pedidos, chats, estatísticas
                    </div>
                  </div>
                </div>
                <Icon name="chevronRight" size={16} className="text-muted-foreground" />
              </div>
            </Link>
            <div className="rounded-2xl border border-border bg-card p-4 text-sm">
              <div className="text-xs text-muted-foreground">Categoria</div>
              <div className="font-semibold text-foreground">
                {BUSINESS_CATEGORIES.find((c) => c.id === draft.business.category)?.label ?? "—"}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 text-sm">
              <div className="text-xs text-muted-foreground">Horário</div>
              <div className="font-semibold text-foreground">
                {draft.business.hours?.alwaysOpen
                  ? tr("alwaysOpenLabel")
                  : `${draft.business.hours?.open} – ${draft.business.hours?.close}`}
              </div>
            </div>
          </section>
        ) : (
          <section>
            <h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
              Seus interesses
            </h2>
            <div className="flex flex-wrap gap-2 stagger">
              {(draft.personal.interests ?? []).map((id) => {
                const i = INTERESTS.find((x) => x.id === id);
                if (!i) return null;
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs text-accent-foreground"
                  >
                    <Icon name={i.icon} size={12} /> {i.label}
                  </span>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
            <Icon name="heart" size={14} className="fill-rose-500 stroke-rose-500" /> Favoritos (
            {favs.length})
          </h2>
          {favs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center text-xs text-muted-foreground">
              Toque no coração de um lugar para guardar aqui.
            </div>
          ) : (
            <div className="space-y-3 stagger">
              {favs.map((p) => (
                <PlaceCard key={p.id} place={p} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2 text-sm">
          <Link
            to="/history"
            className="press flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-left hover:bg-accent/40"
          >
            <span className="inline-flex items-center gap-3 font-medium text-foreground">
              <Icon name="cart" size={16} className="text-primary" /> Histórico de pedidos
            </span>
            <Icon name="chevronRight" size={14} className="text-muted-foreground" />
          </Link>
          <div className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5">
            <span className="inline-flex items-center gap-3 font-medium text-foreground">
              <Icon name="globe" size={16} className="text-primary" /> {tr("language")}
            </span>
            <LanguageDropdown />
          </div>
          <button
            onClick={async () => {
              const { token, error } = await registerPushToken();
              setPushEnabled(!!token);
              if (error) console.warn("Notificações:", error);
            }}
            className="press flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-left hover:bg-accent/40"
          >
            <span className="inline-flex items-center gap-3 font-medium text-foreground">
              <Icon name="bell" size={16} className="text-primary" /> {tr("notifications")}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {pushEnabled ? tr("notificationsActiveLabel") : "Ativar"}
              <Icon name="chevronRight" size={14} />
            </span>
          </button>
          <Link
            to="/privacy"
            className="press flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-left hover:bg-accent/40"
          >
            <span className="inline-flex items-center gap-3 font-medium text-foreground">
              <Icon name="shield" size={16} className="text-primary" /> Privacidade
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Icon name="chevronRight" size={14} />
            </span>
          </Link>
          <a
            href="https://wa.me/258870480970?text=Olá,%20preciso%20de%20ajuda%20com%20o%20Spotter%20Local"
            target="_blank"
            rel="noopener noreferrer"
            className="press flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-left hover:bg-accent/40"
          >
            <span className="inline-flex items-center gap-3 font-medium text-foreground">
              <Icon name="help" size={16} className="text-primary" /> Ajuda & suporte
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Icon name="chevronRight" size={14} />
            </span>
          </a>
        </section>

        <Button variant="outline" className="press h-12 w-full gap-2 rounded-2xl" onClick={signOut}>
          <Icon name="logout" size={16} /> {tr("logout")}
        </Button>
        <p className="text-center text-[10px] text-muted-foreground">
          Spotter Local · by XTACK · v22
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
