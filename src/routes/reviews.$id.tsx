import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/lib/auth-context";
import {
  getBusinessReviews,
  computeReviewStats,
  submitReview,
  markHelpful,
  reportReview,
  type Review,
  type ReviewStats,
} from "@/lib/reviews-db";
import { useT, useLocale, INTL_TAG } from "@/lib/i18n";

export const Route = createFileRoute("/reviews/$id")({
  head: () => ({ meta: [{ title: "Avaliações — Spotter Local" }] }),
  component: ReviewsPage,
});

// BUG CORRIGIDO (2026-08-15): a chave de negócios avaliados era fixa
// ("xlocal.reviewed_businesses.v1"), sem distinguir qual conta tinha sessão iniciada.
// Ao trocar de conta no mesmo dispositivo, o utilizador B não podia avaliar
// um negócio que o utilizador A já tinha avaliado. Agora associa a chave ao userId.
function getReviewedKey(userId: string): string {
  return `xlocal.reviewed_businesses.${userId}.v1`;
}

function getReviewedBusinesses(userId: string): string[] {
  try {
    const raw = localStorage.getItem(getReviewedKey(userId));
    if (raw) return JSON.parse(raw);
    if (userId === "guest") {
      const legacy = localStorage.getItem("xlocal.reviewed_businesses.v1");
      return legacy ? JSON.parse(legacy) : [];
    }
    return [];
  } catch {
    return [];
  }
}

function markAsReviewed(businessId: string, userId: string) {
  const list = getReviewedBusinesses(userId);
  if (!list.includes(businessId)) {
    list.push(businessId);
    try {
      localStorage.setItem(getReviewedKey(userId), JSON.stringify(list));
    } catch {
      /* ignorado: falha de quota/acesso ao localStorage */
    }
  }
}

function StarRow({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Icon
          key={s}
          name="star"
          size={size}
          style={{ color: s <= rating ? "#f59e0b" : "#d1d5db" }}
          fill={s <= rating ? "#f59e0b" : "none"}
        />
      ))}
    </div>
  );
}

function ReviewsPage() {
  const navigate = useNavigate();
  const tr = useT();
  const [locale] = useLocale();
  const { user } = useAuth();
  const activeUserId = user?.id || "guest";
  const { id: businessId } = useParams({ from: "/reviews/$id" });
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formRating, setFormRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [formText, setFormText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sortReviews, setSortReviews] = useState<
    "recent" | "rating_high" | "rating_low" | "helpful"
  >("recent");

  const alreadyReviewed = getReviewedBusinesses(activeUserId).includes(businessId);

  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    getBusinessReviews(businessId)
      .then((r) => {
        if (cancelled) return;
        setReviews(r);
        setStats(computeReviewStats(r));
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, retryKey]);

  const sortedReviews = [...reviews].sort((a, b) => {
    if (sortReviews === "recent")
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sortReviews === "rating_high") return b.rating - a.rating;
    if (sortReviews === "rating_low") return a.rating - b.rating;
    if (sortReviews === "helpful") return b.helpful - a.helpful;
    return 0;
  });

  const handleSubmit = async () => {
    if (!formText.trim() || alreadyReviewed) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // BUG CORRIGIDO (2026-08-15): antes, submitReview ignorava o utilizador
      // autenticado (useAuth) e usava sempre um ID anónimo aleatório em
      // xlocal.userId. Agora usa o ID real da conta Supabase (user.id) e o nome
      // da conta quando disponível.
      let currentUserId = user?.id;
      let currentUserName = user?.name || (user?.email ? user.email.split("@")[0] : undefined);

      if (!currentUserId) {
        currentUserId = localStorage.getItem("xlocal.userId") || "user-" + Math.random().toString(36).slice(2, 8);
        try { localStorage.setItem("xlocal.userId", currentUserId); } catch {}
      }
      if (!currentUserName) {
        currentUserName = localStorage.getItem("xlocal.userName") || "Visitante";
      }

      const r = await submitReview(businessId, currentUserId, currentUserName, formRating, formText);
      markAsReviewed(businessId, activeUserId);
      setReviews((prev) => [r, ...prev]);
      setStats(computeReviewStats([r, ...reviews]));
      setFormText("");
      setFormRating(5);
      setShowForm(false);
    } catch (err) {
      console.warn("Falha ao enviar avaliação:", err);
      setSubmitError(tr("submitReviewError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleHelpful = async (id: string) => {
    // Actualização optimista primeiro — se a sincronização falhar em
    // segundo plano, a interface já reflectiu o clique do utilizador.
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, helpful: r.helpful + 1 } : r)));
    try {
      await markHelpful(id);
    } catch (err) {
      console.warn("Falha ao marcar como útil:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <Icon name="x" size={28} className="text-destructive" />
        <p className="text-sm text-muted-foreground">{tr("reviewsCouldNotLoad")}</p>
        <button
          onClick={() => setRetryKey((k) => k + 1)}
          className="press rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground"
        >
          {tr("tryAgain")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/90 px-5 pb-3 pt-12 backdrop-blur-xl">
        <button
          onClick={() => navigate({ to: "/place/$id", params: { id: businessId } })}
          className="press grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground"
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight text-foreground">{tr("reviewsTitle")}</h1>
          {stats && (
            <p className="text-xs text-muted-foreground">
              {stats.total} {tr("reviewsCount")}
            </p>
          )}
        </div>

        {alreadyReviewed ? (
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700">
            <Icon name="check" size={12} /> {tr("alreadyReviewed")}
          </div>
        ) : (
          <button
            onClick={() => setShowForm((f) => !f)}
            className="press flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            <Icon name="star" size={12} /> {tr("rateAction")}
          </button>
        )}
      </header>

      <main className="flex-1 px-5 py-5 pb-24 space-y-5">
        {/* Resumo estatísticas */}
        {stats && stats.total > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4 animate-slide-up">
            <div className="flex items-center gap-4">
              <div className="text-center min-w-[72px]">
                <div className="text-5xl font-black text-foreground">{stats.average}</div>
                <StarRow rating={Math.round(stats.average)} size={14} />
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {stats.total} {tr("reviewsCount")}
                </div>
              </div>
              <div className="flex-1 space-y-1.5">
                {([5, 4, 3, 2, 1] as const).map((s) => {
                  const n = stats.distribution[s];
                  const pct = stats.total > 0 ? (n / stats.total) * 100 : 0;
                  return (
                    <div key={s} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-3">{s}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-400 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-4 text-right">{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Formulário nova avaliação */}
        {showForm && !alreadyReviewed && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3 animate-slide-up">
            <div className="text-sm font-semibold text-foreground">{tr("yourReview")}</div>
            <p className="text-xs text-muted-foreground">{tr("canOnlyReviewOnce")}</p>

            {/* Estrelas interactivas */}
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setFormRating(s)}
                  onMouseEnter={() => setHoverRating(s)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="press transition-transform hover:scale-110"
                >
                  <Icon
                    name="star"
                    size={28}
                    style={{ color: s <= (hoverRating || formRating) ? "#f59e0b" : "#d1d5db" }}
                    fill={s <= (hoverRating || formRating) ? "#f59e0b" : "none"}
                  />
                </button>
              ))}
              <span className="ml-2 self-center text-sm font-semibold text-foreground">
                {
                  [
                    "",
                    tr("ratingTerrible"),
                    tr("ratingBad"),
                    tr("ratingOk"),
                    tr("ratingGood"),
                    tr("ratingExcellent"),
                  ][hoverRating || formRating]
                }
              </span>
            </div>

            <textarea
              value={formText}
              onChange={(e) => setFormText(e.target.value)}
              placeholder={tr("shareYourExperience")}
              rows={3}
              maxLength={500}
              className="w-full rounded-xl border border-input bg-card p-3 text-sm outline-none focus:border-primary resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">{formText.length}/500</span>
            </div>

            {submitError && <p className="text-xs text-destructive">{submitError}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowForm(false);
                  setFormText("");
                }}
                className="press flex-1 h-10 rounded-xl border border-border text-sm text-muted-foreground"
              >
                {tr("cancelAction")}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formText.trim() || submitting}
                className="press flex-1 h-10 rounded-xl text-sm font-semibold text-primary-foreground disabled:opacity-50"
                style={{ background: "var(--gradient-primary)" }}
              >
                {submitting ? tr("sending") : tr("publishAction")}
              </button>
            </div>
          </div>
        )}

        {/* Aviso já avaliou */}
        {alreadyReviewed && (
          <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 p-4 text-sm text-emerald-700 flex items-center gap-2">
            <Icon name="check" size={16} /> {tr("alreadySubmittedReview")}
          </div>
        )}

        {/* Ordenação das reviews */}
        {reviews.length > 1 && (
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[
              { value: "recent", label: tr("sortMostRecent") },
              { value: "rating_high", label: tr("sortBestRating") },
              { value: "rating_low", label: tr("sortWorstRating") },
              { value: "helpful", label: tr("sortMostHelpful") },
            ].map((o) => (
              <button
                key={o.value}
                onClick={() =>
                  setSortReviews(o.value as "recent" | "rating_high" | "rating_low" | "helpful")
                }
                className={`press shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  sortReviews === o.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        {/* Lista de reviews */}
        <div className="space-y-3">
          {sortedReviews.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-border bg-card p-4 space-y-2 animate-slide-up"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {r.authorName.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      {r.authorName}
                      {r.verified && (
                        <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                          {tr("verifiedLabel")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StarRow rating={r.rating} size={11} />
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString(INTL_TAG[locale], {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{r.text}</p>
              <div className="flex items-center gap-3 pt-1 border-t border-border/50">
                <button
                  onClick={() => handleHelpful(r.id)}
                  className="press flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <Icon name="thumbsUp" size={12} /> {tr("helpfulAction")} ({r.helpful})
                </button>
                <button
                  onClick={() =>
                    reportReview(r.id)
                      .then(() => setReviews((prev) => prev.filter((x) => x.id !== r.id)))
                      .catch((err) => console.warn("Falha ao reportar avaliação:", err))
                  }
                  className="press text-[11px] text-muted-foreground hover:text-destructive"
                >
                  {tr("reportAction")}
                </button>
              </div>
            </div>
          ))}

          {reviews.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Icon name="star" size={32} className="text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">{tr("noReviewsYet")}</p>
              <p className="text-xs text-muted-foreground">{tr("beTheFirstToReview")}</p>
              {!alreadyReviewed && (
                <button
                  onClick={() => setShowForm(true)}
                  className="press mt-1 rounded-full px-5 py-2.5 text-xs font-semibold text-primary-foreground"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  {tr("writeReviewAction")}
                </button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
