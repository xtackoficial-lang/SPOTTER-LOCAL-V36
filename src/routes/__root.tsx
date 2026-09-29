import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { usePushAutoRegister, useForegroundPushToast } from "../lib/push-storage";
import { useProximityNotifications } from "../lib/use-proximity-notifications";
import { Icon } from "../components/Icon";
import { useT } from "../lib/i18n";
import { GlobalThemeColors } from "../lib/theme-storage";

function NotFoundComponent() {
  const tr = useT();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{tr("notFoundHeading")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{tr("pageNotFoundTitle")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {tr("backToHomeAction")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const tr = useT();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {tr("pageLoadErrorTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{tr("somethingWentWrongSubtitle")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {tr("tryAgainAction")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {tr("backToHomeAction")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

// Rotas "largas": ocupam o ecrã todo (login, descobrir, pesquisa, mapa, painéis).
// As restantes (formulários, pagamento, reservas, perfil...) ficam numa coluna
// central legível em PC, sem moldura — um formulário esticado a 1900px é
// pior de usar do que uma coluna de ~768px.
const WIDE_ROUTES = [
  "/home",
  "/search",
  "/map",
  "/events",
  "/place",
  "/chats",
  "/admin",
  "/analytics",
  "/business",
  "/merchant",
  "/reservations-dashboard",
];

function isWideRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  return WIDE_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/") || pathname.startsWith(r + "."));
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { pathname } = useLocation();
  const wide = isWideRoute(pathname);
  // Re-regista silenciosamente o token push se a permissão já tiver sido
  // concedida antes (não interrompe quem ainda não decidiu).
  usePushAutoRegister();
  useProximityNotifications();
  const { toast, dismiss } = useForegroundPushToast();

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalThemeColors />
      {/* CONSERTO (pedido do Abrão, 2026-09-30): a app tem de ocupar o
          ecrã TODO no computador. Antes ficava presa numa coluna de
          ~900px com o resto do ecrã vazio. Agora as rotas "largas" usam
          100% da largura e as de formulário ficam numa coluna central
          legível (sem moldura). O scroll continua a ser o da janela, por
          isso os cabeçalhos "sticky" continuam a colar ao topo. */}
      <div
        className={
          wide
            ? "min-h-screen w-full bg-background"
            : "mx-auto min-h-screen w-full max-w-xl bg-background md:max-w-2xl lg:max-w-3xl"
        }
      >
        <Outlet />
        {toast && (
          <div
            role="status"
            onClick={dismiss}
            className="fixed inset-x-4 top-4 z-50 mx-auto max-w-xl animate-slide-up cursor-pointer rounded-2xl border border-border bg-card/95 p-4 shadow-[var(--shadow-lift)] backdrop-blur-xl md:max-w-2xl"
          >
            <div className="flex items-start gap-3">
              <div
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Icon name="bell" size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">
                  {toast.title}
                </div>
                <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {toast.body}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </QueryClientProvider>
  );
}
