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
import { createZumboPayEventPayment, type EventTier, type PaymentRequest } from "@/lib/payments-db";
import { uploadMedia } from "@/lib/storage-upload";
import { PROVINCES_MZ, citiesForProvince } from "@/lib/mozambique-locations";
import { useOnboarding } from "@/lib/onboarding-storage";
import { useAuth } from "@/lib/auth-context";
import { RequireBusiness } from "@/components/RequireBusiness";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";

export const Route = createFileRoute("/publish-event")({
  head: () => ({ meta: [{ title: "Publicar evento — Spotter Local" }] }),
  component: () => (
    <RequireBusiness>
      <PublishEventPage />
    </RequireBusiness>
  ),
});

const TIERS: { id: EventTier; label: string; hint: string; price: number }[] = [
  {
    id: "standard",
    label: "Listagem simples",
    hint: "Aparece na aba Eventos, ordem normal",
    price: 100,
  },
  { id: "featured", label: "Destaque", hint: "Aparece no topo da aba Eventos", price: 250 },
];

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
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [tier, setTier] = useState<EventTier>("standard");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [req, setReq] = useState<PaymentRequest | null>(null);
  const [zumboPopupBlocked, setZumboPopupBlocked] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedTier = TIERS.find((t) => t.id === tier)!;

  const handlePickPoster = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPosterFile(file);
    setPosterPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!posterFile) {
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
      const posterUrl = await uploadMedia(posterFile, "event", user.id);
      setUploading(false);

      const { payment, paymentUrl } = await createZumboPayEventPayment(businessId, tier, {
        posterUrl,
        title: title.trim(),
        ticketPhone: ticketPhone.trim() || undefined,
        ticketLink: ticketLink.trim() || undefined,
        eventDate: eventDate || undefined,
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
            <p className="text-sm text-muted-foreground">
              Cartaz, contacto de bilhetes e data — o evento aparece na aba Eventos para quem
              procurar na cidade escolhida.
            </p>

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

            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none"
            />

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
              <div className="text-sm font-semibold text-foreground">Tipo de listagem</div>
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTier(t.id)}
                  className={`press flex w-full flex-col items-start gap-0.5 rounded-2xl border px-4 py-3 text-left ${
                    tier === t.id ? "border-primary bg-primary/10" : "border-border bg-card"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{t.label}</span>
                    <span className="text-sm font-bold text-primary">{t.price} MZN</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{t.hint}</span>
                </button>
              ))}
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <ShimmerButton
              onClick={handleSubmit}
              disabled={loading || !posterFile}
              className="press h-14 w-full rounded-2xl text-base font-bold text-primary-foreground disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}
            >
              {uploading
                ? "A enviar cartaz…"
                : loading
                  ? "A criar pagamento…"
                  : `Pagar ${selectedTier.price} MZN e publicar`}
            </ShimmerButton>
          </>
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
              Já está visível na aba Eventos{selectedTier.id === "featured" ? ", em destaque" : ""}.
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
