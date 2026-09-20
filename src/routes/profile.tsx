import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useOnboarding, INTERESTS, BUSINESS_CATEGORIES } from "@/lib/onboarding-storage";
import { useFavorites } from "@/lib/favorites-storage";
import { type Place } from "@/lib/places-data";
import { fetchBusinessPublicById, businessToPlace } from "@/lib/businesses-db";
import { PlaceCard } from "@/components/PlaceCard";
import { BottomNav } from "@/components/BottomNav";
import { BusinessBottomNav } from "@/components/BusinessBottomNav";
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
  const { draft, hydrated, reset } = useOnboarding();
  const { user, logout, deleteAccount } = useAuth();
  const { ids } = useFavorites();
  const tr = useT();
  const [locale] = useLocale();
  const { appearance } = useScreenAppearance("profile");
  const [pushEnabled, setPushEnabled] = useState(
    typeof Notification !== "undefined" && Notification.permission === "granted",
  );
  const [pushBlockedHint, setPushBlockedHint] = useState(false);
  const [favs, setFavs] = useState<Place[]>([]);
  // CONSERTO CRÍTICO (2026-09-15): "clico em Perfil e a página não
  // carrega" — estes 3 useState estavam depois do `if (!hydrated)
  // return` mais abaixo. Isso viola a regra dos Hooks do React: no
  // primeiro render (hydrated ainda false) o React só via os hooks até
  // aqui; assim que hydrated ficava true, aparecia de repente mais
  // hooks a seguir ao return — o React trata isso como erro fatal
  // ("Rendered more hooks than during the previous render") e a app
  // crasha para o ecrã genérico de erro. Agora ficam todos ANTES de
  // qualquer return condicional, como têm de estar sempre.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Carrega negócios favoritos — primeiro tenta Supabase, fallback para dados locais
  useEffect(() => {
    if (ids.length === 0) {
      setFavs([]);
      return;
    }
    Promise.all(
      ids.map((id) =>
        fetchBusinessPublicById(id)
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

  // CRÍTICO (correção 2026-08-18): antes, este botão só limpava o draft de
  // onboarding local e navegava para "/" — nunca terminava a sessão real do
  // Supabase. Como a sessão continuava válida, ao chegar a "/" o utilizador
  // era imediatamente devolvido a "/home" (ver useEffect em routes/index.tsx),
  // ou então caía de novo no onboarding do zero por causa do draft acabado
  // de apagar — dando a sensação de que "sair da conta" nunca funcionava e
  // de que era preciso recadastrar tudo. Agora termina mesmo a sessão do
  // Supabase (logout()) e só depois limpa o draft local e navega.
  const signOut = async () => {
    await logout();
    reset();
    navigate({ to: "/" });
  };

  // Apagar conta (pedido do Abrão, 2026-09-09): pede confirmação explícita
  // antes de chamar a Edge Function — é irreversível, não há "desfazer".
  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteAccount();
    if (result.error) {
      setDeleteError(result.error);
      setDeleting(false);
      return;
    }
    reset();
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

      {!user && (
        <div className="mx-5 mt-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 dark:border-amber-800/60 dark:bg-amber-950/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <Icon name="alert" size={16} className="shrink-0 text-amber-600" />
            <p className="text-xs font-medium leading-snug text-amber-800 dark:text-amber-200">
              {tr("guestProfileNotice")}
            </p>
          </div>
          <button
            onClick={() => navigate({ to: "/" })}
            className="press shrink-0 rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white"
          >
            {tr("createAccountAction")}
          </button>
        </div>
      )}

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
                    <div className="text-sm font-semibold text-foreground">
                      {tr("businessPanelLabel")}
                    </div>
                    <div className="text-xs text-muted-foreground">{tr("myOrdersChatsStats")}</div>
                  </div>
                </div>
                <Icon name="chevronRight" size={16} className="text-muted-foreground" />
              </div>
            </Link>
            <div className="rounded-2xl border border-border bg-card p-4 text-sm">
              <div className="text-xs text-muted-foreground">{tr("categoryLabel")}</div>
              <div className="font-semibold text-foreground">
                {BUSINESS_CATEGORIES.find((c) => c.id === draft.business.category)?.label ?? "—"}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 text-sm">
              <div className="text-xs text-muted-foreground">{tr("hours")}</div>
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
              {tr("tapHeartToSaveHint")}
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
              <Icon name="cart" size={16} className="text-primary" /> {tr("orderHistoryAction")}
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
              // BUG CORRIGIDO (2026-09-02): Notification.requestPermission()
              // só mostra o popup do sistema quando a permissão ainda está
              // "default" (nunca respondida). Se já está "denied", o
              // browser nunca mais volta a perguntar sozinho — o botão
              // ficava sempre em "Ativar" sem nada acontecer, e o único
              // aviso ia para a consola (console.warn), que o comerciante
              // nunca vê. Agora detectamos esse estado ANTES de tentar, e
              // mostramos instruções em vez de falhar em silêncio.
              if (typeof Notification !== "undefined" && Notification.permission === "denied") {
                setPushBlockedHint(true);
                return;
              }
              setPushBlockedHint(false);
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
              {pushEnabled ? tr("notificationsActiveLabel") : tr("activateAction")}
              <Icon name="chevronRight" size={14} />
            </span>
          </button>
          {pushBlockedHint && (
            <p className="rounded-2xl bg-primary/5 px-4 py-3 text-xs text-primary">
              {tr("notificationsBlockedHint")}
            </p>
          )}
          <Link
            to="/privacy"
            className="press flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-left hover:bg-accent/40"
          >
            <span className="inline-flex items-center gap-3 font-medium text-foreground">
              <Icon name="shield" size={16} className="text-primary" /> {tr("privacyTabLabel")}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Icon name="chevronRight" size={14} />
            </span>
          </Link>
          <a
            href={`https://wa.me/258870480970?text=${encodeURIComponent(tr("whatsappHelpMessage"))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="press flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-left hover:bg-accent/40"
          >
            <span className="inline-flex items-center gap-3 font-medium text-foreground">
              <Icon name="help" size={16} className="text-primary" /> {tr("helpAndSupportLabel")}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Icon name="chevronRight" size={14} />
            </span>
          </a>
        </section>

        {user ? (
          <Button
            variant="outline"
            className="press h-12 w-full gap-2 rounded-2xl"
            onClick={signOut}
          >
            <Icon name="logout" size={16} /> {tr("logout")}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="press h-12 w-full gap-2 rounded-2xl"
            onClick={() => navigate({ to: "/" })}
          >
            <Icon name="user" size={16} /> {tr("createAccountOrLoginAction")}
          </Button>
        )}

        {/* Zona perigosa — só para quem tem conta de facto (não faz
            sentido "apagar conta" para um convidado sem sessão). */}
        {user && (
          <div className="rounded-2xl border border-red-300/50 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
            {!confirmingDelete ? (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="press flex w-full items-center gap-2 text-sm font-medium text-red-600"
              >
                <Icon name="trash" size={16} /> {tr("deleteAccountAction")}
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium text-red-700 dark:text-red-300">
                  {tr("deleteAccountConfirmMessage")}
                </p>
                {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="press flex-1 rounded-xl border border-border bg-card py-2.5 text-xs font-semibold text-foreground"
                  >
                    {tr("cancelAction")}
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    className="press flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {deleting ? tr("deletingEllipsis") : tr("deleteAccountConfirmAction")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <p className="text-center text-[10px] text-muted-foreground">
          Spotter Local · by XTACK · v22
        </p>
      </main>
      {/* BUG DO ABRÃO (2026-08-21): antes, esta página mostrava SEMPRE o
          menu inferior "pessoal" (Descobrir/Pesquisar/QR/Chat/Perfil),
          mesmo para contas comerciantes — que deviam ver
          Painel/Produtos/Mensagens/Perfil. Um comerciante que abrisse o
          seu Perfil e tocasse "Descobrir" ou "Pesquisar" saía sem querer
          do contexto comercial, para o modo de navegação de cliente. */}
      {isBiz ? <BusinessBottomNav /> : <BottomNav />}
    </div>
  );
}
