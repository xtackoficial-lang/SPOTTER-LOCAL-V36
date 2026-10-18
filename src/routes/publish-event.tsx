// ============================================================
// SPOTTER — Publicar evento (Ideia 2: cartaz + bilhetes)
// ------------------------------------------------------------
// Exige conta comercial (RequireBusiness) — sem convidados, tal como
// Turbinar e assinaturas. tier "featured" custa mais e aparece no
// topo da aba /eventos.
// ============================================================
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import { ShimmerButton } from "@/components/ShimmerButton";
import { createZumboPayEventPayment, type PaymentRequest } from "@/lib/payments-db";
import { uploadMedia } from "@/lib/storage-upload";
import { PROVINCES_MZ, citiesForProvince } from "@/lib/mozambique-locations";
import { useOnboarding } from "@/lib/onboarding-storage";
import { useAuth } from "@/lib/auth-context";
import { RequireBusiness } from "@/components/RequireBusiness";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import {
  deleteMyEvent,
  fetchMyEvents,
  formatEventDates,
  todayLocalISO,
  type MyEvent,
} from "@/lib/posts-events-db";

export const Route = createFileRoute("/publish-event")({
  head: () => ({ meta: [{ title: "Publicar evento — Spotter Local" }] }),
  component: () => (
    <RequireBusiness>
      <PublishEventPage />
    </RequireBusiness>
  ),
});

// v38 — o evento paga-se por DIA: 50 MZN por dia, de 1 a 30 dias.
const PRICE_PER_DAY = 50;
const MAX_DAYS = 30;
const QUICK_DAYS = [1, 3, 7, 14, 30];

type Step = "form" | "waiting" | "done" | "failed";

function PublishEventPage() {
  const navigate = useNavigate();
  const { draft } = useOnboarding();
  const businessId = draft.business.businessId || "default";
  const { user } = useAuth();

  const [step, setStep] = useState<Step>("form");
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [ticketPhone, setTicketPhone] = useState("");
  const [ticketLink, setTicketLink] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [existingPosterUrl, setExistingPosterUrl] = useState<string | null>(null);
  const [myEvents, setMyEvents] = useState<MyEvent[]>([]);
  const [reloadTick, setReloadTick] = useState(0);
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [days, setDays] = useState(3);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [req, setReq] = useState<PaymentRequest | null>(null);
  const [zumboPopupBlocked, setZumboPopupBlocked] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalPrice = days * PRICE_PER_DAY;
  const today = todayLocalISO();
  const visibleUntil = new Date(Date.now() + days * 86_400_000).toLocaleDateString("pt-MZ");
  // Dias necessários para a publicação cobrir o evento até ao fim (hoje conta como dia 1).
  const lastEventDay = eventEndDate || eventDate;
  const daysToCover =
    lastEventDay && lastEventDay >= today
      ? Math.min(
          MAX_DAYS,
          Math.max(1, Math.round((Date.parse(lastEventDay) - Date.parse(today)) / 86_400_000) + 1),
        )
      : null;
  const eventEndsAfterListing = daysToCover !== null && days < daysToCover;

  useEffect(() => {
    if (step !== "form") return;
    let cancelled = false;
    fetchMyEvents(businessId).then((list) => {
      if (!cancelled) setMyEvents(list);
    });
    return () => {
      cancelled = true;
    };
  }, [step, businessId, reloadTick]);

  const repeatEvent = (ev: MyEvent) => {
    setTitle(ev.title);
    setTicketPhone(ev.ticketPhone ?? "");
    setTicketLink(ev.ticketLink ?? "");
    setEventDate("");
    setEventEndDate("");
    setPosterFile(null);
    setExistingPosterUrl(ev.posterUrl);
    setPosterPreview(ev.posterUrl);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeEvent = async (ev: MyEvent) => {
    if (!window.confirm(`Remover o evento "${ev.title}"? Deixa de aparecer na aba Eventos.`))
      return;
    if (await deleteMyEvent(ev.id)) setReloadTick((n) => n + 1);
    else setError("Não foi possível remover o evento.");
  };

  const eventStatusText = (ev: MyEvent): string => {
    if (ev.status === "pending") return "A aguardar pagamento";
    const lastDay = ev.eventEndDate ?? ev.eventDate;
    const ended =
      ev.status === "expired" ||
      (ev.expiresAt && Date.parse(ev.expiresAt) <= Date.now()) ||
      (lastDay && lastDay < today);
    if (ended) return "Terminado";
    if (ev.expiresAt) {
      const left = Math.max(1, Math.ceil((Date.parse(ev.expiresAt) - Date.now()) / 86_400_000));
      return `Visível · faltam ${left} ${left === 1 ? "dia" : "dias"}`;
    }
    return "Visível";
  };

  const handlePickPoster = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPosterFile(file);
    setExistingPosterUrl(null);
    setPosterPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!posterFile && !existingPosterUrl) {
      setError("Escolhe o cartaz do evento.");
      return;
    }
    if (!title.trim()) {
      setError("Dá um título ao evento.");
      return;
    }
    if (!ticketPhone.trim() && !ticketLink.trim()) {
      setError("Indica pelo menos um contacto ou link para bilhetes.");
      return;
    }
    if (eventDate && eventDate < today) {
      setError("A data de início do evento já passou.");
      return;
    }
    if (eventEndDate && !eventDate) {
      setError("Indica primeiro a data de início do evento.");
      return;
    }
    if (eventEndDate && eventEndDate < eventDate) {
      setError("A data de fim não pode ser antes da data de início.");
      return;
    }
    if (!user) {
      setError("Precisas de ter sessão iniciada.");
      return;
    }
    setError(null);
    setLoading(true);
    setUploading(true);
    try {
      // CORREÇÃO (varredura 2026-09-19): ver o mesmo comentário em
      // publish-post.tsx — businessId ≠ auth.uid(), a política de
      // Storage rejeitava isto em silêncio.
      const posterUrl = posterFile
        ? await uploadMedia(posterFile, "event", user.id)
        : (existingPosterUrl as string);
      setUploading(false);

      const { payment, paymentUrl } = await createZumboPayEventPayment(businessId, "standard", {
        days,
        posterUrl,
        title: title.trim(),
        ticketPhone: ticketPhone.trim() || undefined,
        ticketLink: ticketLink.trim() || undefined,
        eventDate: eventDate || undefined,
        eventEndDate: eventEndDate || undefined,
        city: city || undefined,
      });
      setReq(payment);
      const opened = window.open(paymentUrl, "_blank", "noopener,noreferrer");
      if (!opened) setZumboPopupBlocked(true);
      setStep("waiting");
    } catch (err) {
      console.warn("Falha ao criar evento:", err);
      setError(err instanceof Error ? err.message : "Não foi possível criar o pagamento.");
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  useEffect(() => {
    if (step !== "waiting" || !req?.id) return;
    if (!SUPABASE_CONFIGURED || !supabase) return;
    const client = supabase;

    const channel = client
      .channel(`zumbopay-event-${req.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "payments", filter: `id=eq.${req.id}` },
        (payload) => {
          if (payload.new.status === "confirmed") setStep("done");
          else if (payload.new.status === "failed" || payload.new.status === "expired")
            setStep("failed");
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [step, req?.id]);

  useEffect(() => {
    if (step !== "waiting" || !req?.id) return;
    if (!SUPABASE_CONFIGURED || !supabase) return;
    const client = supabase;

    const interval = setInterval(async () => {
      const { data } = await client
        .from("payments")
        .select("status")
        .eq("id", req.id)
        .maybeSingle();
      if (data?.status === "confirmed") setStep("done");
      else if (data?.status === "failed" || data?.status === "expired") setStep("failed");
    }, 5000);

    return () => clearInterval(interval);
  }, [step, req?.id]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
        <button onClick={() => navigate({ to: "/merchant" })} className="press rounded-full p-1">
          <Icon name="chevronLeft" size={22} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Publicar evento</h1>
      </div>

      <div className="mx-auto max-w-md px-4 py-6 space-y-6">
        {step === "form" && (
          <>
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
              <div className="mb-1 font-bold text-foreground">Para que serve?</div>
              <p className="text-muted-foreground">
                Divulga uma festa, concerto, inauguração, feira ou promoção a todos os clientes da
                tua cidade. O evento aparece na aba Eventos com o cartaz, a data e o contacto ou
                link para comprarem bilhetes.
              </p>
              <p className="mt-2 text-muted-foreground">
                <span className="font-semibold text-foreground">Quanto custa:</span> {PRICE_PER_DAY}{" "}
                MZN por dia. Escolhes quantos dias queres que apareça; passados esses dias sai
                sozinho da aba.
              </p>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePickPoster}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="press flex h-56 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-card"
              >
                {posterPreview ? (
                  <img
                    loading="lazy"
                    decoding="async"
                    src={posterPreview}
                    alt="Pré-visualização do cartaz"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Icon name="image" size={28} />
                    <span className="text-sm">Escolher cartaz</span>
                  </span>
                )}
              </button>
            </div>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título do evento"
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none"
            />

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Data de início
                </span>
                <input
                  type="date"
                  min={today}
                  value={eventDate}
                  onChange={(e) => {
                    setEventDate(e.target.value);
                    if (eventEndDate && e.target.value && eventEndDate < e.target.value) {
                      setEventEndDate("");
                    }
                  }}
                  className="w-full rounded-2xl border border-border bg-card px-3 py-3 text-sm text-foreground outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Data de fim (opcional)
                </span>
                <input
                  type="date"
                  min={eventDate || today}
                  value={eventEndDate}
                  onChange={(e) => setEventEndDate(e.target.value)}
                  className="w-full rounded-2xl border border-border bg-card px-3 py-3 text-sm text-foreground outline-none"
                />
              </label>
            </div>

            <input
              value={ticketPhone}
              onChange={(e) => setTicketPhone(e.target.value)}
              placeholder="Contacto para bilhetes (WhatsApp/telefone)"
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none"
            />

            <input
              value={ticketLink}
              onChange={(e) => setTicketLink(e.target.value)}
              placeholder="Link para comprar bilhete (opcional)"
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none"
            />

            <div className="grid grid-cols-2 gap-3">
              <select
                value={province}
                onChange={(e) => {
                  setProvince(e.target.value);
                  setCity("");
                }}
                className="rounded-2xl border border-border bg-card px-3 py-3 text-sm text-foreground"
              >
                <option value="">Província</option>
                {PROVINCES_MZ.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={!province}
                className="rounded-2xl border border-border bg-card px-3 py-3 text-sm text-foreground disabled:opacity-50"
              >
                <option value="">Cidade</option>
                {citiesForProvince(province).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-foreground">
                Quantos dias fica publicado?
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(d)}
                    className={`press rounded-full border px-4 py-2 text-sm font-medium ${
                      days === d
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground"
                    }`}
                  >
                    {d} {d === 1 ? "dia" : "dias"}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
                <span className="text-sm text-muted-foreground">Outro número de dias</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setDays((d) => Math.max(1, d - 1))}
                    className="press h-9 w-9 rounded-full border border-border text-lg font-bold text-foreground"
                    aria-label="Menos um dia"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-base font-bold text-foreground">
                    {days}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDays((d) => Math.min(MAX_DAYS, d + 1))}
                    className="press h-9 w-9 rounded-full border border-border text-lg font-bold text-foreground"
                    aria-label="Mais um dia"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-card px-4 py-3">
                <span className="text-sm text-muted-foreground">
                  {days} {days === 1 ? "dia" : "dias"} × {PRICE_PER_DAY} MZN
                </span>
                <span className="text-base font-bold text-primary">{totalPrice} MZN</span>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Visível na aba Eventos até</span>
                <span className="font-semibold text-foreground">{visibleUntil}</span>
              </div>
              {eventEndsAfterListing && daysToCover !== null && (
                <div className="mt-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700">
                  O evento acaba depois de a publicação terminar. Para o mostrares até ao fim
                  precisas de {daysToCover} {daysToCover === 1 ? "dia" : "dias"}.
                  <button
                    type="button"
                    onClick={() => setDays(daysToCover)}
                    className="press mt-2 block w-full rounded-lg bg-amber-500/20 px-3 py-2 text-center font-semibold text-amber-800"
                  >
                    Usar {daysToCover} {daysToCover === 1 ? "dia" : "dias"} (
                    {daysToCover * PRICE_PER_DAY} MZN)
                  </button>
                </div>
              )}
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <ShimmerButton
              onClick={handleSubmit}
              disabled={loading || (!posterFile && !existingPosterUrl)}
              className="press h-14 w-full rounded-2xl text-base font-bold text-primary-foreground disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}
            >
              {uploading
                ? "A enviar cartaz…"
                : loading
                  ? "A criar pagamento…"
                  : `Pagar ${totalPrice} MZN e publicar`}
            </ShimmerButton>
          </>
        )}

        {step === "form" && myEvents.length > 0 && (
          <div className="space-y-3 border-t border-border pt-6">
            <div className="text-sm font-semibold text-foreground">Os teus eventos</div>
            {myEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
              >
                <img
                  loading="lazy"
                  decoding="async"
                  src={ev.posterUrl}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{ev.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatEventDates(ev.eventDate, ev.eventEndDate) || "Sem data"}
                  </div>
                  <div className="text-xs font-medium text-primary">{eventStatusText(ev)}</div>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => repeatEvent(ev)}
                    className="press rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground"
                  >
                    Repetir
                  </button>
                  <button
                    type="button"
                    onClick={() => removeEvent(ev)}
                    className="press rounded-lg border border-destructive/40 px-2.5 py-1 text-xs font-semibold text-destructive"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {step === "waiting" && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <Icon name="clock" size={40} className="text-primary" />
            <h2 className="text-lg font-bold text-foreground">A aguardar confirmação</h2>
            <p className="text-sm text-muted-foreground">
              Completa o pagamento na página que abriu. O evento aparece automaticamente assim que
              confirmares.
            </p>
            <div className="w-full rounded-2xl border border-border bg-card p-4 text-left space-y-1">
              <div className="text-xs text-muted-foreground">Referência</div>
              <div className="font-mono font-semibold text-sm text-primary">{req?.merchantRef}</div>
            </div>
            {req?.paymentUrl && (
              <ShimmerButton
                onClick={() => {
                  const opened = window.open(req.paymentUrl, "_blank", "noopener,noreferrer");
                  if (opened) setZumboPopupBlocked(false);
                }}
                className="press h-12 w-full rounded-2xl text-sm font-semibold text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                {zumboPopupBlocked ? "Abrir link de pagamento" : "Reabrir link de pagamento"}
              </ShimmerButton>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <Icon name="check-circle" size={48} className="text-emerald-600" />
            <h2 className="text-lg font-bold text-foreground">Evento publicado!</h2>
            <p className="text-sm text-muted-foreground">
              Já está visível na aba Eventos até {visibleUntil}.
            </p>
            <ShimmerButton
              onClick={() => navigate({ to: "/merchant" })}
              className="press h-12 w-full rounded-2xl text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              Voltar ao painel
            </ShimmerButton>
          </div>
        )}

        {step === "failed" && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <Icon name="x-circle" size={48} className="text-destructive" />
            <h2 className="text-lg font-bold text-foreground">Pagamento não confirmado</h2>
            <p className="text-sm text-muted-foreground">
              O pagamento falhou ou expirou. Podes tentar outra vez.
            </p>
            <ShimmerButton
              onClick={() => {
                setStep("form");
                setReq(null);
              }}
              className="press h-12 w-full rounded-2xl text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              Tentar de novo
            </ShimmerButton>
          </div>
        )}
      </div>
    </div>
  );
}
