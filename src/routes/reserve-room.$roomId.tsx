// ============================================================
// SPOTTER — Reservar quarto (cliente)
// ------------------------------------------------------------
// Passo 1 (datas/hóspedes) + Passo 2 (dados) ficam no mesmo ecrã, por
// simplicidade — Passo 3 é a confirmação/pagamento. Exige login (a
// cobrança M-Pesa e o chat/push a seguir precisam de um utilizador
// autenticado — ver nota em create-mpesa-payment).
// ============================================================
import { usePostHog } from "@posthog/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Icon } from "@/components/Icon";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { createMpesaRoomPayment, type PaymentRequest } from "@/lib/payments-db";
import { MpesaPayerField } from "@/components/MpesaPayerField";
import { useMpesaConfirmation } from "@/lib/use-mpesa-confirmation";
import { fetchActiveRooms, roomPriceText, type BusinessRoom } from "@/lib/reservations-db";

import {
  normalizePhone,
  normalizeWalletPhone,
  validateEmail,
  validatePersonName,
} from "@/lib/validators";

export const Route = createFileRoute("/reserve-room/$roomId")({
  head: () => ({ meta: [{ title: "Reservar quarto — Spotter Local" }] }),
  component: ReserveRoomPage,
});

type Step = "form" | "waiting" | "done" | "failed";

function ReserveRoomPage() {
  const { roomId } = Route.useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const posthog = usePostHog();

  const [room, setRoom] = useState<BusinessRoom | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState("2");
  // Pensão (v38): o cliente escolhe reservar por HORAS ou por DIA/noites.
  const [unit, setUnit] = useState<"night" | "hour">("night");
  const [startTime, setStartTime] = useState("");
  const [hours, setHours] = useState("2");
  const [specialRequest, setSpecialRequest] = useState("");
  const [clientName, setClientName] = useState(user?.name ?? "");
  const [payerPhone, setPayerPhone] = useState(""); // vazio = usa o telefone de contacto
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

  const hasNight = !!room && room.pricePerNight > 0;
  const hasHour = !!room && (room.pricePerHour ?? 0) > 0;
  useEffect(() => {
    if (room) setUnit(room.pricePerNight > 0 ? "night" : "hour");
  }, [room]);

  const nights =
    unit === "night" && checkIn && checkOut
      ? Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000)
      : 0;
  const hoursN = unit === "hour" ? Math.min(12, Number(hours) || 0) : 0;
  const totalPrice = !room
    ? 0
    : unit === "hour"
      ? hoursN > 0
        ? (room.pricePerHour ?? 0) * hoursN
        : 0
      : nights > 0
        ? room.pricePerNight * nights
        : 0;
  const canSubmit = unit === "hour" ? !!checkIn && !!startTime && hoursN >= 1 : nights >= 1;
  // Duas opções (pedido do Abrão, 2026-09-30): 100% agora ou sinal de 20%.
  const [paymentOption, setPaymentOption] = useState<"full" | "deposit">("deposit");
  const depositAmount = Math.round(totalPrice * 0.2 * 100) / 100;
  const payNow = paymentOption === "full" ? totalPrice : depositAmount;
  const balance = Math.round((totalPrice - payNow) * 100) / 100;

  const handleSubmit = async () => {
    if (!room) return;
    if (unit === "hour" && (!checkIn || !startTime || hoursN < 1)) {
      setError("Escolhe o dia, a hora de entrada e o número de horas.");
      return;
    }
    if (unit === "night" && (!checkIn || !checkOut || nights < 1)) {
      setError("Escolhe datas de entrada e saída válidas.");
      return;
    }
    // v41 (segurança): dados reais — nome só com letras, telemóvel válido (sem dígitos a mais)
    const nameCheck = validatePersonName(clientName, "nome");
    if (!nameCheck.ok) {
      setError(nameCheck.error);
      return;
    }
    const phoneCheck = normalizePhone(clientPhone);
    if (!phoneCheck.ok) {
      setError(phoneCheck.error);
      return;
    }
    const guestsN = Number(guests);
    if (!Number.isInteger(guestsN) || guestsN < 1 || guestsN > 50) {
      setError("Indica um número de pessoas válido (1 a 50).");
      return;
    }
    const emailCheck = clientEmail.trim() ? validateEmail(clientEmail) : null;
    if (emailCheck && !emailCheck.ok) {
      setError(emailCheck.error);
      return;
    }
    const payerCheck = normalizeWalletPhone(payerPhone.trim() || clientPhone, "mpesa");
    if (!payerCheck.ok) {
      setError(payerCheck.error);
      return;
    }
    setError(null);
    setLoading(true);
    setStep("waiting"); // "confirma no telemóvel" — a chamada só responde depois do PIN
    try {
      const result = await createMpesaRoomPayment(
        room.businessId,
        {
          roomId: room.id,
          paymentOption,
          checkIn,
          checkOut: unit === "hour" ? checkIn : checkOut,
          bookingUnit: unit,
          hours: unit === "hour" ? hoursN : undefined,
          startTime: unit === "hour" ? startTime : undefined,
          guests: Number(guests),
          specialRequest: specialRequest.trim() || undefined,
          clientName: nameCheck.value,
          clientPhone: phoneCheck.value,
          clientEmail: emailCheck && emailCheck.ok ? emailCheck.value : undefined,
        },
        payerCheck.value,
      );
      setReq(result.payment);
      if (result.status !== "failed") {
        posthog.capture("room_reservation_payment_started", {
          booking_unit: unit,
          payment_option: paymentOption,
          guest_count: guestsN,
          amount: payNow,
        });
      }
      if (result.status === "confirmed") setStep("done");
      else if (result.status === "failed") {
        setError(result.error ?? "O pagamento não foi concluído.");
        setStep("form");
      }
      // "pending": continua em espera — useMpesaConfirmation volta a perguntar.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar o pagamento.");
      setStep("form");
    } finally {
      setLoading(false);
    }
  };

  // Rede de segurança: se a resposta da cobrança ficou em dúvida, volta a perguntar à M-Pesa.
  useMpesaConfirmation(
    step === "waiting" && req?.status === "pending",
    req?.id,
    () => setStep("done"),
    () => setStep("failed"),
  );

  if (!authLoading && !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Precisas de ter sessão iniciada na app para fazer uma reserva.
        </p>
        <button
          onClick={() => navigate({ to: "/" })}
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
      <div className="glass-bar sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
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
                {room.capacity} pessoas · {roomPriceText(room)}
              </p>
            </div>

            {hasNight && hasHour && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                  Como queres reservar?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["hour", "Por horas", `${room.pricePerHour} MT/hora`],
                      ["night", "Por dia", `${room.pricePerNight} MT/dia`],
                    ] as const
                  ).map(([id, title, sub]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setUnit(id)}
                      className={`press rounded-xl border p-3 text-left ${unit === id ? "border-primary bg-primary/5" : "border-border bg-background"}`}
                    >
                      <span className="block text-sm font-semibold text-foreground">{title}</span>
                      <span className="block text-xs text-muted-foreground">{sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {unit === "hour" ? (
              <>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Dia</p>
                  <input
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                      Hora de entrada
                    </p>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                      Quantas horas (1 a 12)
                    </p>
                    <input
                      value={hours}
                      onChange={(e) => setHours(e.target.value.replace(/\D/g, "").slice(0, 2))}
                      inputMode="numeric"
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
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
                onChange={(e) => setClientPhone(e.target.value.replace(/[^\d\s+()-]/g, ""))}
                inputMode="tel"
                autoComplete="tel"
                maxLength={20}
                placeholder="84 123 4567"
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
            <MpesaPayerField value={payerPhone} onChange={setPayerPhone} optional />
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

            {totalPrice > 0 && (
              <div className="rounded-2xl border border-border bg-card p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {unit === "hour"
                      ? `Valor total (${hoursN}h × ${room.pricePerHour} MT)`
                      : `Valor total da estadia (${nights} noites)`}
                  </span>
                  <span className="font-semibold text-foreground">{totalPrice} MT</span>
                </div>
                <p className="mb-2 mt-3 text-xs font-semibold text-muted-foreground">
                  Como queres pagar?
                </p>
                <div className="space-y-2">
                  {(
                    [
                      [
                        "deposit",
                        "Sinal de 20%",
                        `${depositAmount} MT agora · o resto (${Math.round((totalPrice - depositAmount) * 100) / 100} MT) no hotel`,
                      ],
                      [
                        "full",
                        "Pagar tudo (100%)",
                        `${totalPrice} MT agora · nada a pagar no check-in`,
                      ],
                    ] as const
                  ).map(([id, title, sub]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPaymentOption(id)}
                      className={`press w-full rounded-xl border p-3 text-left ${paymentOption === id ? "border-primary bg-primary/5" : "border-border bg-background"}`}
                    >
                      <span className="block text-sm font-semibold text-foreground">{title}</span>
                      <span className="block text-xs text-muted-foreground">{sub}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex justify-between">
                  <span className="text-muted-foreground">A pagar agora</span>
                  <span className="font-bold text-foreground">{payNow} MT</span>
                </div>
                {balance > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Restante: {balance} MT, paga-se directamente no check-in.
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Depois de pagares, o hotel tem 24 horas para aceitar o teu pedido. Se recusar, o
                  valor pago é reembolsado.
                </p>
              </div>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={loading || !canSubmit}
              className="press h-12 w-full rounded-full text-sm font-semibold text-primary-foreground disabled:opacity-60"
              style={{ background: "var(--gradient-primary)" }}
            >
              {loading ? "A processar…" : `Pagar ${payNow} MT e reservar`}
            </button>
          </>
        ) : step === "waiting" ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Icon name="clock" size={28} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Enviámos um pedido de pagamento para o teu M-Pesa. Abre o pedido no telemóvel e digita
              o teu PIN para confirmar. Não feches esta página.
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
