// ============================================================
// SPOTTER — Reservar mesa (cliente)
// ------------------------------------------------------------
// Confirma automaticamente depois do pagamento (sem passo de aprovação,
// ao contrário do quarto). Preço fixo do negócio (normal/evento).
// ============================================================
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Icon } from "@/components/Icon";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { createZumboPayTablePayment, type PaymentRequest } from "@/lib/payments-db";
import { fetchReservationSettings, type BusinessReservationSettings } from "@/lib/reservations-db";

export const Route = createFileRoute("/reserve-table/$businessId")({
  head: () => ({ meta: [{ title: "Reservar mesa — Spotter Local" }] }),
  component: ReserveTablePage,
});

const TIME_SLOTS = ["19h00 - 20h00", "20h00 - 21h00", "21h00 - 22h00", "22h00 - 23h00"];

type Step = "form" | "waiting" | "done" | "failed";

function ReserveTablePage() {
  const { businessId } = Route.useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [settings, setSettings] = useState<BusinessReservationSettings | null>(null);
  const [reservationDate, setReservationDate] = useState("");
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[0]);
  const [guests, setGuests] = useState("2");
  const [specialRequest, setSpecialRequest] = useState("");
  const [tipo, setTipo] = useState<"normal" | "evento">("normal");
  const [clientName, setClientName] = useState(user?.name ?? "");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState(user?.email ?? "");
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [req, setReq] = useState<PaymentRequest | null>(null);

  useEffect(() => {
    fetchReservationSettings(businessId).then(setSettings);
  }, [businessId]);

  const price =
    tipo === "evento" ? (settings?.mesaPrecoEvento ?? 500) : (settings?.mesaPrecoNormal ?? 200);

  const handleSubmit = async () => {
    if (!reservationDate || !timeSlot) {
      setError("Escolhe a data e o horário.");
      return;
    }
    if (!clientName.trim() || !clientPhone.trim()) {
      setError("Preenche o nome e o telefone.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { payment, paymentUrl } = await createZumboPayTablePayment(businessId, {
        reservationDate,
        timeSlot,
        guests: Number(guests),
        specialRequest: specialRequest.trim() || undefined,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        clientEmail: clientEmail.trim() || undefined,
        tipo,
      });
      setReq(payment);
      const opened = window.open(paymentUrl, "_blank", "noopener,noreferrer");
      setStep("waiting");
      if (!opened) window.location.href = paymentUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar o pagamento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step !== "waiting" || !req?.id || !SUPABASE_CONFIGURED || !supabase) return;
    const client = supabase;
    const channel = client
      .channel(`zumbopay-table-${req.id}`)
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
    if (step !== "waiting" || !req?.id || !SUPABASE_CONFIGURED || !supabase) return;
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

  if (!authLoading && !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Precisas de ter sessão iniciada na app para fazer uma reserva.
        </p>
        <button
          onClick={() => navigate({ to: "/login" })}
          className="press h-11 rounded-full px-6 text-sm font-semibold text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          Iniciar sessão
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
        <button
          onClick={() => navigate({ to: "/place/$id", params: { id: businessId } })}
          className="press rounded-full p-1"
        >
          <Icon name="chevronLeft" size={22} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Reservar mesa</h1>
      </div>

      <div className="mx-auto max-w-md px-4 py-6 space-y-5">
        {step === "form" ? (
          <>
            <div className="flex gap-2 rounded-full bg-muted p-1">
              <button
                onClick={() => setTipo("normal")}
                className={`press h-9 flex-1 rounded-full text-sm font-semibold ${
                  tipo === "normal" ? "bg-card shadow-sm" : "text-muted-foreground"
                }`}
              >
                Normal — {settings?.mesaPrecoNormal ?? 200} MT
              </button>
              <button
                onClick={() => setTipo("evento")}
                className={`press h-9 flex-1 rounded-full text-sm font-semibold ${
                  tipo === "evento" ? "bg-card shadow-sm" : "text-muted-foreground"
                }`}
              >
                Evento — {settings?.mesaPrecoEvento ?? 500} MT
              </button>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Data</p>
              <input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={reservationDate}
                onChange={(e) => setReservationDate(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Horário</p>
              <select
                value={timeSlot}
                onChange={(e) => setTimeSlot(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              >
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Nº de pessoas</p>
              <input
                value={guests}
                onChange={(e) => setGuests(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Nome completo</p>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Telefone</p>
              <input
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="84xxxxxxx"
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                Pedido especial (opcional)
              </p>
              <textarea
                value={specialRequest}
                onChange={(e) => setSpecialRequest(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="press h-12 w-full rounded-full text-sm font-semibold text-primary-foreground disabled:opacity-60"
              style={{ background: "var(--gradient-primary)" }}
            >
              {loading ? "A processar…" : `Pagar ${price} MT e reservar`}
            </button>
          </>
        ) : step === "waiting" ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Icon name="clock" size={28} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              A aguardar confirmação do pagamento… Se abriu numa nova aba, conclui o pagamento lá.
            </p>
          </div>
        ) : step === "done" ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Icon name="check" size={32} className="text-emerald-500" />
            <p className="text-sm font-semibold text-foreground">A sua reserva está confirmada!</p>
            <button
              onClick={() => navigate({ to: "/my-reservations" })}
              className="press mt-2 h-11 rounded-full px-5 text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              Ver as minhas reservas
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Icon name="info" size={28} className="text-red-500" />
            <p className="text-sm text-muted-foreground">O pagamento falhou ou expirou.</p>
            <button
              onClick={() => setStep("form")}
              className="press h-11 rounded-full border border-border px-5 text-sm font-semibold"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
