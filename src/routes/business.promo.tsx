// ============================================================
// XTACK SPOTTER — Promoção para favoritos (v33)
// ------------------------------------------------------------
// Pedido do Abrão (2026-08-23): comerciantes cujo negócio foi
// adicionado aos favoritos de clientes conseguem mandar-lhes uma
// notificação de promoção, com data de validade ("limite da
// promoção"), ligada a sério ao Firebase (não simulado — ver
// supabase/functions/send-merchant-promo/ e src/lib/business-promo.ts).
// ============================================================
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useOnboarding } from "@/lib/onboarding-storage";
import {
  sendMerchantPromo,
  fetchFavoritesCount,
  fetchBusinessPromos,
  type BusinessPromo,
} from "@/lib/business-promo";
import { Icon } from "@/components/Icon";
import { BreathingLoader } from "@/components/BreathingLoader";
import { ShimmerButton } from "@/components/ShimmerButton";
import { RequireBusiness } from "@/components/RequireBusiness";
import { useT, useLocale, INTL_TAG } from "@/lib/i18n";

export const Route = createFileRoute("/business/promo")({
  head: () => ({ meta: [{ title: "Promoção para favoritos — Spotter Local" }] }),
  component: () => (
    <RequireBusiness>
      <PromoPage />
    </RequireBusiness>
  ),
});

const MAX_TITLE = 60;
const MAX_BODY = 180;

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function PromoPage() {
  const tr = useT();
  const [locale] = useLocale();
  const navigate = useNavigate();
  const { draft, hydrated } = useOnboarding();
  const businessId = draft.business.businessId;

  const [favCount, setFavCount] = useState<number | null>(null);
  const [history, setHistory] = useState<BusinessPromo[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [validUntil, setValidUntil] = useState(todayPlus(7));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentOk, setSentOk] = useState<{ recipients: number; success: number } | null>(null);

  useEffect(() => {
    if (!hydrated || !businessId) return;
    fetchFavoritesCount(businessId).then(setFavCount);
    fetchBusinessPromos(businessId)
      .then(setHistory)
      .finally(() => setLoadingHistory(false));
  }, [hydrated, businessId]);

  // Bloqueia novo envio se já houve uma promoção nas últimas 24h — a
  // Edge Function também confirma isto no servidor (não é só decorativo
  // aqui), mas mostrar já na interface evita a pessoa preencher tudo e
  // só descobrir o limite depois de tentar enviar.
  const lastPromo = history[0];
  const blockedUntil =
    lastPromo && Date.now() - new Date(lastPromo.created_at).getTime() < 24 * 3600 * 1000
      ? new Date(new Date(lastPromo.created_at).getTime() + 24 * 3600 * 1000)
      : null;

  const handleSend = async () => {
    if (!businessId || !title.trim() || !body.trim() || !validUntil) return;
    setSending(true);
    setError(null);
    setSentOk(null);
    const { error: err, result } = await sendMerchantPromo({
      businessId,
      title: title.trim(),
      body: body.trim(),
      validUntil,
    });
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    setSentOk({ recipients: result?.recipients ?? 0, success: result?.success ?? 0 });
    setTitle("");
    setBody("");
    fetchBusinessPromos(businessId).then(setHistory);
  };

  if (!hydrated) return <div className="min-h-screen bg-background" />;

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
          <h1 className="text-base font-bold text-foreground">Promoção para favoritos</h1>
          <p className="text-xs text-muted-foreground">
            {favCount === null
              ? "A calcular quantas pessoas te favoritaram…"
              : favCount === 0
                ? "Ainda ninguém te adicionou aos favoritos."
                : `${favCount} ${favCount === 1 ? "pessoa favoritou" : "pessoas favoritaram"} o teu negócio.`}
          </p>
        </div>
      </header>

      <main className="flex-1 space-y-5 px-4 pb-10 pt-4">
        {blockedUntil ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
            <Icon name="clock" size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-xs text-amber-700">
              Já enviaste uma promoção nas últimas 24h. Podes enviar a próxima a partir das{" "}
              {blockedUntil.toLocaleString(INTL_TAG[locale], {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </p>
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <div>
              <label className="text-xs font-semibold text-foreground">Título</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
                placeholder="Ex: 20% de desconto hoje!"
                className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none focus:border-primary"
              />
              <div className="mt-1 text-right text-[10px] text-muted-foreground">
                {title.length}/{MAX_TITLE}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Mensagem</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
                placeholder="Descreve a promoção em poucas palavras…"
                rows={3}
                className="mt-1.5 w-full resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
              />
              <div className="mt-1 text-right text-[10px] text-muted-foreground">
                {body.length}/{MAX_BODY}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">
                Promoção válida até
              </label>
              <input
                type="date"
                value={validUntil}
                min={todayPlus(0)}
                onChange={(e) => setValidUntil(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none focus:border-primary"
              />
            </div>

            {error && (
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                {error}
              </p>
            )}
            {sentOk && (
              <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-700">
                Promoção enviada a {sentOk.recipients}{" "}
                {sentOk.recipients === 1 ? "pessoa" : "pessoas"} ({sentOk.success} entregues).
              </p>
            )}

            <ShimmerButton
              onClick={handleSend}
              disabled={sending || !title.trim() || !body.trim() || !favCount}
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold text-white shadow-[var(--shadow-soft)] disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}
            >
              {sending ? (
                <BreathingLoader size={16} />
              ) : (
                <>
                  <Icon name="bell" size={16} /> Enviar aos favoritos
                </>
              )}
            </ShimmerButton>
            {!favCount && favCount !== null && (
              <p className="text-center text-[11px] text-muted-foreground">
                Ainda não tens ninguém para notificar — só aparece aqui quando alguém favoritar o
                teu negócio.
              </p>
            )}
          </div>
        )}

        <div>
          <h2 className="mb-2 text-sm font-bold text-foreground">Promoções enviadas</h2>
          {loadingHistory ? (
            <div className="flex justify-center pt-6">
              <BreathingLoader size={28} />
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground">Ainda não enviaste nenhuma promoção.</p>
          ) : (
            <div className="space-y-2.5">
              {history.map((p) => (
                <div key={p.id} className="rounded-2xl border border-border bg-card p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{p.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString(INTL_TAG[locale], {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{p.body}</p>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span>
                      Válida até{" "}
                      {new Date(p.valid_until).toLocaleDateString(INTL_TAG[locale], {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    <span>·</span>
                    <span>
                      {p.success_count}/{p.recipients_count} entregues
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
