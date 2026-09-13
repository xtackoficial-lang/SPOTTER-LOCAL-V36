import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { usePushAutoRegister, useForegroundPushToast } from "../lib/push-storage";
import { useProximityNotifications } from "../lib/use-proximity-notifications";
import { Icon } from "../components/Icon";
import { useT } from "../lib/i18n";

function NotFoundComponent() {
  const tr = useT();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{tr("notFoundHeading")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {tr("pageNotFoundTitle")}
        </p>
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
        <p className="mt-2 text-sm text-muted-foreground">
          {tr("somethingWentWrongSubtitle")}
        </p>
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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // Re-regista silenciosamente o token push se a permissão já tiver sido
  // concedida antes (não interrompe quem ainda não decidiu).
  usePushAutoRegister();
  useProximityNotifications();
  const { toast, dismiss } = useForegroundPushToast();

  return (
    <QueryClientProvider client={queryClient}>
      {/* CONSERTO (pedido do Abrão, 2026-09-04): "em telas grandes (PC,
          ecrã rodado/paisagem) a app fica esticada e feia". A app é
          feita para largura de telemóvel — cada ecrã usa min-h-screen e
          assume ~380-430px de largura. Sem isto, num monitor de PC ou
          num telemóvel/tablet em modo paisagem, tudo esticava à largura
          toda: cartões gigantes, texto a ocupar a tela inteira,
          botões desproporcionais.
          A partir de 640px de largura (sm:), o conteúdo passa a ficar
          centrado numa "moldura" com largura de telemóvel (480px),
          como a maioria das PWAs mobile-first faz em ecrã grande — em
          telemóvel normal (retrato, <640px) não muda nada, fica
          exactamente como antes.
          O transform: translateZ(0) é o que faz os elementos
          "position: fixed" desta app (barra de baixo, cabeçalhos fixos,
          toasts) ficarem presos dentro da moldura em vez de ficarem
          soltos no ecrã inteiro do PC — mas só a partir de sm: (a
          moldura só tem altura fixa + scroll próprio a partir daí). Em
          telemóvel normal a app cresce mais alto que o ecrã (rola a
          página toda), por isso aplicar isto sempre partia a barra de
          baixo fixa (ficava presa ao fundo do CONTENTOR, não do ecrã
          visível, e desaparecia ao rolar). Por isso o transform é só
          sm:, nunca por omissão. */}
      <div className="min-h-screen w-full bg-background sm:flex sm:min-h-screen sm:items-center sm:justify-center sm:bg-[#16151d] sm:p-6">
        <div
          className="relative mx-auto w-full bg-background sm:h-[calc(100vh-3rem)] sm:max-w-[480px] sm:overflow-y-auto sm:overflow-x-hidden sm:rounded-[2.25rem] sm:border sm:border-white/10 sm:shadow-2xl sm:[transform:translateZ(0)]"
        >
          <Outlet />
          {toast && (
            <div
              role="status"
              onClick={dismiss}
              className="fixed inset-x-4 top-4 z-50 animate-slide-up cursor-pointer rounded-2xl border border-border bg-card/95 p-4 shadow-[var(--shadow-lift)] backdrop-blur-xl"
            >
              <div className="flex items-start gap-3">
                <div
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-primary-foreground"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  <Icon name="bell" size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{toast.title}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{toast.body}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </QueryClientProvider>
  );
}
