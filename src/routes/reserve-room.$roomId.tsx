// ============================================================
// SPOTTER — Reservar quarto (cliente)
// ------------------------------------------------------------
// Passo 1 (datas/hóspedes) + Passo 2 (dados) ficam no mesmo ecrã, por
// simplicidade — Passo 3 é a confirmação/pagamento. Exige login (a
// comissão via ZumboPay e o chat/push a seguir precisam de um utilizador
// autenticado — ver nota em create-zumbopay-payment).
// ============================================================
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Icon } from "@/components/Icon";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { createZumboPayRoomPayment, type PaymentRequest } from "@/lib/payments-db";
import { fetchActiveRooms, type BusinessRoom } from "@/lib/reservations-db";

export const Route = createFileRoute("/reserve-room/$roomId")({
  head: () => ({ meta: [{ title: "Reservar quarto — Spotter Local" }] }),
  component: ReserveRoomPage,
});

type Step = "form" | "waiting" | "done" | "failed";

function ReserveRoomPage() {
  const { roomId } = Route.useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [room, setRoom] = useState<BusinessRoom | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState("2");
  const [specialRequest, setSpecialRequest] = useState("");
  const [clientName, setClientName] = useState(user?.name ?? "");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState(user?.email ?? "");
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [req, setReq] = useState<PaymentRequest | null>(null);

  useEffect(() => {
    // Busca o quarto através da lista de activos do próprio negócio —
    // reservations-db não expõe leitura de 1 quarto isolado (RLS só
    // permite ler quartos activos de qualquer negócio, o que já chega).
    (async () => {
      if (!SUPABASE_CONFIGURED || !supabase) return;
      const { data } = await supabase
        .from("business_rooms")
        .select("business_id")
        .eq("id", roomId)
        .maybeSingle();
      if (data?.business_id) {
        const rooms = await fetchActiveRooms(data.business_id);
        setRoom(rooms.find((r) => r.id === roomId) ?? null);
      }
      setLoadingRoom(false);
    })();
  }, [roomId]);

  const nights =
    checkIn && checkOut
      ? Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000)
      : 0;
  const totalPrice = room && nights > 0 ? room.pricePerNight * nights : 0;
  const commission = Math.round(totalPrice * 0.1 * 100) / 100;

  const handleSubmit = async () => {
    if (!room) return;
    if (!checkIn || !checkOut || nights < 1) {
      setError("Escolhe datas de entrada e saída válidas.");
      return;
    }
    if (!clientName.trim() || !clientPhone.trim()) {
      setError("Preenche o nome e o telefone.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { payment, paymentUrl } = await createZumboPayRoomPayment(room.businessId, {
        roomId: room.id,
        checkIn,
        checkOut,
        guests: Number(guests),
        specialRequest: specialRequest.trim() || undefined,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        clientEmail: clientEmail.trim() || undefined,
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

  // Mesmo padrão de confirmação (Realtime + polling) usado em
  // publish-post/publish-event/boost.
  useEffect(() => {
    if (step !== "waiting" || !req?.id || !SUPABASE_CONFIGURED || !supabase) return;
    const client = supabase;
    const channel = client
      .channel(`zumbopay-room-${req.id}`)
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
        <button onClick={() => navigate({ to: "/home" })} className="press rounded-full p-1">
          <Icon name="chevronLeft" size={22} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Reservar quarto</h1>
      </div>

      <div className="mx-auto max-w-md px-4 py-6 space-y-5">
        {loadingRoom ? (
          <p className="text-center text-sm text-muted-foreground">A carregar…</p>
        ) : !room ? (
          <p className="text-center text-sm text-muted-foreground">Quarto não encontrado.</p>
        ) : step === "form" ? (
          <>
            <div className="rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-bold text-foreground">{room.name}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {room.capacity} pessoas · {room.pricePerNight} MT/noite
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Entrada</p>
              <input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Saída</p>
              <input
                type="date"
                min={checkIn || new Date().toISOString().slice(0, 10)}
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Nº de hóspedes</p>
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

            {nights > 0 && (
              <div className="rounded-2xl border border-border bg-card p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Valor total da estadia ({nights} noites)
                  </span>
                  <span className="font-semibold text-foreground">{totalPrice} MT</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">A pagar agora (comissão 10%)</span>
                  <span className="font-bold text-foreground">{commission} MT</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  O restante ({Math.round((totalPrice - commission) * 100) / 100} MT) paga-se
                  directamente no check-in.
                </p>
              </div>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={loading || nights < 1}
              className="press h-12 w-full rounded-full text-sm font-semibold text-primary-foreground disabled:opacity-60"
              style={{ background: "var(--gradient-primary)" }}
            >
              {loading ? "A processar…" : `Pagar ${commission} MT e reservar`}
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
            <p className="text-sm font-semibold text-foreground">
              Pedido enviado! A aguardar confirmação do negócio.
            </p>
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
