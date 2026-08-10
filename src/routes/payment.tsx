import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Icon } from "@/components/Icon";
import { ShimmerButton } from "@/components/ShimmerButton";
import {
  createPaymentRequest,
  getPaymentInstructions,
  type PaymentRequest,
  type PaymentMethod,
} from "@/lib/payments-db";
import { PLANS, type PaidPlanId } from "@/lib/subscription-storage";
import {
  getPaymentConfig,
  addPaymentProof,
  updatePaymentProofNote,
  type PaymentConfig,
} from "@/lib/shop-data";
import { useOnboarding } from "@/lib/onboarding-storage";
import { RequireBusiness } from "@/components/RequireBusiness";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/payment")({
  head: () => ({ meta: [{ title: "Pagamento — Spotter Local" }] }),
  validateSearch: (search: Record<string, unknown>): { plan?: PaidPlanId } => ({
    plan:
      search.plan === "starter" || search.plan === "pro" || search.plan === "premium"
        ? search.plan
        : undefined,
  }),
  component: () => (
    <RequireBusiness>
      <PaymentPage />
    </RequireBusiness>
  ),
});

function getMethods(
  tr: (k: string) => string,
): { id: PaymentMethod; label: string; color: string; hint: string }[] {
  return [
    { id: "mpesa", label: "M-Pesa", color: "bg-rose-600", hint: tr("mpesaNumbersHint") },
    { id: "emola", label: "e-Mola", color: "bg-orange-500", hint: tr("emolaNumbersHint") },
    {
      id: "manual",
      label: tr("bankTransferLabel"),
      color: "bg-slate-600",
      hint: tr("bciAccountHint"),
    },
  ];
}

type Step = "select" | "instructions" | "proof" | "waiting" | "done" | "failed";

// ── Botão de copiar número ────────────────────────────────────────────
function CopyButton({ value, label }: { value: string; label: string }) {
  const tr = useT();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        console.warn("Falha ao copiar para a área de transferência:", err);
      });
  };
  return (
    <button
      onClick={copy}
      className="press flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-sm font-mono font-semibold text-foreground w-full"
    >
      <span className="flex-1 text-left">{value || "—"}</span>
      <span
        className={`flex items-center gap-1 text-[11px] font-medium ${copied ? "text-emerald-600" : "text-primary"}`}
      >
        {copied ? (
          <>
            <Icon name="check" size={11} /> {tr("copiedLabel")}
          </>
        ) : (
          `${tr("copyLabel")} ${label}`
        )}
      </span>
    </button>
  );
}

function PaymentPage() {
  const tr = useT();
  const METHODS = getMethods(tr);
  const navigate = useNavigate();
  const { plan: planFromSubscribe } = Route.useSearch();
  const { draft, hydrated } = useOnboarding();
  const businessId = draft.business.businessId || "default";
  const [planId, setPlanId] = useState<PaidPlanId>(planFromSubscribe ?? "starter");
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<Step>("select");
  const [req, setReq] = useState<PaymentRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(600);
  const [proofNote, setProofNote] = useState("");
  const [proofSent, setProofSent] = useState(false);
  const [proofId, setProofId] = useState<string | null>(null);
  const [alertingAdmin, setAlertingAdmin] = useState(false);
  const [payConfig, setPayConfig] = useState<PaymentConfig>({
    mpesa: "",
    emola: "",
    mpesaName: "XTACK OFICIAL",
    emolaName: "XTACK OFICIAL",
    updatedAt: "",
  });

  const plan = PLANS.find((p) => p.id === planId)!;
  const instructions = req ? getPaymentInstructions(req) : null;

  // Recarrega config ao montar
  useEffect(() => {
    getPaymentConfig().then(setPayConfig);
  }, []);

  // Countdown 10 min
  useEffect(() => {
    if (step !== "waiting") return;
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(t);
          setStep("failed");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [step]);

  const [initError, setInitError] = useState<string | null>(null);

  const handleInitiate = async () => {
    if (!method) return;
    if ((method === "mpesa" || method === "emola") && !phone.trim()) return;
    setLoading(true);
    setInitError(null);
    try {
      const r = await createPaymentRequest(businessId, planId, method, phone);
      setReq(r);
      setStep("instructions");
    } catch (err) {
      console.warn("Falha ao iniciar pagamento:", err);
      setInitError(tr("initPaymentError"));
    } finally {
      setLoading(false);
    }
  };

  // v24 — Dispara o alerta ao admin IMEDIATAMENTE ao clicar "Já paguei /
  // Comprovar", ainda no passo de instruções — antes disso o registo em
  // payment_proofs só era criado depois de escrever a nota e clicar
  // "Enviar e aguardar", o que significava que se a pessoa desistisse a
  // meio (ou só mandasse por WhatsApp) o admin nunca via nada no /admin.
  // Agora: clicou em "Já paguei" → já está no Supabase, nome do negócio e
  // tudo, mesmo que a nota fique vazia. O passo seguinte serve só para
  // opcionalmente acrescentar a referência e/ou reforçar por WhatsApp.
  const handleAlertAdmin = async () => {
    if (!req) return;
    setAlertingAdmin(true);
    try {
      // FIX (auditoria SQL): businessId pode ser o placeholder "default"
      // se chegarmos aqui antes do onboarding comercial gravar o negócio
      // no Supabase (RequireBusiness só exige profileType="business", não
      // um businessId real). "default" não é um UUID válido — a coluna
      // payment_proofs.business_id é uuid nullable, por isso é preferível
      // gravar null (sem ligação a negócio nenhum) do que rebentar o insert.
      const created = await addPaymentProof({
        businessId: businessId !== "default" ? businessId : undefined,
        businessName: draft.business.businessName || tr("businessNameless"),
        method: method as "mpesa" | "emola",
        amount: req.amount,
        plan: planId,
        proofNote: "",
      });
      setProofId(created.id);
      setStep("proof");
    } catch (err) {
      console.warn("Falha ao alertar o admin:", err);
      setInitError(tr("confirmPaymentError"));
    } finally {
      setAlertingAdmin(false);
    }
  };

  // Acrescenta a nota/referência ao comprovativo já criado (opcional).
  const handleSaveNote = async () => {
    if (!proofId || !proofNote.trim()) {
      setProofSent(true);
      setStep("waiting");
      return;
    }
    await updatePaymentProofNote(proofId, proofNote.trim());
    setProofSent(true);
    setStep("waiting");
  };

  // Botão WhatsApp para enviar comprovativo
  const handleWhatsAppProof = () => {
    if (!req) return;
    const adminPhone = "258870480970"; // número XTACK de suporte — pode ser configurável
    const msg = encodeURIComponent(
      `Olá XTACK! Envio comprovativo de pagamento.\nReferência: ${req.merchantRef}\nPlano: ${plan.name} — ${req.amount} MZN\nMétodo: ${method === "mpesa" ? "M-Pesa" : "e-Mola"}\nNota: ${proofNote || "—"}`,
    );
    window.open(`https://wa.me/${adminPhone}?text=${msg}`, "_blank");
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // Número configurado para o método selecionado
  const payNumber =
    method === "mpesa" ? payConfig.mpesa : method === "emola" ? payConfig.emola : "";
  const payName =
    method === "mpesa" ? payConfig.mpesaName : method === "emola" ? payConfig.emolaName : "XTACK";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/90 px-5 pb-3 pt-12 backdrop-blur-xl">
        <button
          onClick={() => (step === "select" ? navigate({ to: "/subscribe" }) : setStep("select"))}
          className="press grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground"
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            {step === "select"
              ? tr("paymentTitle")
              : step === "instructions"
                ? tr("paymentInstructionsTitle")
                : step === "proof"
                  ? tr("sendProofTitle")
                  : step === "waiting"
                    ? tr("waitingConfirmationTitle")
                    : step === "done"
                      ? tr("paymentConfirmedTitle")
                      : tr("paymentFailedTitle")}
          </h1>
          {step === "waiting" && (
            <p className="text-xs text-muted-foreground">
              {tr("expiresIn")} {fmt(countdown)}
            </p>
          )}
        </div>
      </header>

      <main className="flex-1 px-5 py-5 pb-24">
        {/* ── Step: Seleccionar plano + método ── */}
        {step === "select" && (
          <div className="space-y-5 animate-slide-up">
            {/* Plano */}
            <div className="space-y-2">
              <div className="text-sm font-semibold text-foreground">{tr("planLabel")}</div>
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlanId(p.id)}
                  className={`press flex w-full items-center justify-between rounded-2xl border p-4 transition ${planId === p.id ? "border-primary shadow-[var(--shadow-soft)]" : "border-border bg-card"}`}
                >
                  <div className="text-left">
                    <div className="text-sm font-bold text-foreground">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.features.slice(0, 2).map(tr).join(" · ")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-primary">{p.price} MZN</div>
                    <div className="text-[10px] text-muted-foreground">/{tr("perMonthShort")}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Método */}
            <div className="space-y-2">
              <div className="text-sm font-semibold text-foreground">
                {tr("paymentMethodLabel")}
              </div>
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`press flex w-full items-center gap-3 rounded-2xl border p-4 transition ${method === m.id ? "border-primary shadow-[var(--shadow-soft)]" : "border-border bg-card"}`}
                >
                  <div
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white text-xs font-bold ${m.color}`}
                  >
                    {m.label.slice(0, 2)}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-semibold text-foreground">{m.label}</div>
                    <div className="text-xs text-muted-foreground">{m.hint}</div>
                  </div>
                  <div
                    className={`grid h-5 w-5 place-items-center rounded-full border-2 transition ${method === m.id ? "border-primary bg-primary" : "border-border"}`}
                  >
                    {method === m.id && (
                      <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Número do utilizador */}
            {(method === "mpesa" || method === "emola") && (
              <div className="animate-slide-up rounded-2xl border border-border bg-card p-4">
                <div className="text-xs font-medium text-foreground mb-2">
                  {tr("yourNumberLabel")} {method === "mpesa" ? "M-Pesa" : "e-Mola"}{" "}
                  {tr("yourNumberSuffix")}
                </div>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={method === "mpesa" ? "+258 84x xxx xxxx" : "+258 86x xxx xxxx"}
                  className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus:border-primary"
                />
              </div>
            )}

            {initError && <p className="text-xs text-destructive">{initError}</p>}

            <ShimmerButton
              onClick={handleInitiate}
              disabled={
                !method || loading || ((method === "mpesa" || method === "emola") && !phone.trim())
              }
              className="press h-14 w-full rounded-2xl text-base font-semibold text-primary-foreground disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  {tr("preparingAction")}
                </span>
              ) : (
                `${tr("continueAction")} · ${plan.price} ${tr("perMonthSuffix")}`
              )}
            </ShimmerButton>
          </div>
        )}

        {/* ── Step: Instruções + Copiar número XTACK ── */}
        {step === "instructions" && instructions && req && (
          <div className="space-y-4 animate-slide-up">
            {/* Referência */}
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <div className="text-xs font-medium text-muted-foreground">
                {tr("paymentReferenceLabel")}
              </div>
              <div className="mt-1 font-mono text-lg font-bold text-primary tracking-wider">
                {req.merchantRef}
              </div>
              <div className="mt-1 text-sm text-foreground">
                {req.amount} MZN · {plan.name}
              </div>
            </div>

            {/* Número XTACK para pagar */}
            {(method === "mpesa" || method === "emola") && payNumber && (
              <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/5 p-4 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <Icon name="phoneCall" size={13} /> {tr("sendPaymentToXtack")}
                </div>
                <div className="space-y-2">
                  <div className="text-[11px] text-muted-foreground">
                    {tr("yourNumberLabel")} {method === "mpesa" ? "M-Pesa" : "e-Mola"}{" "}
                    {tr("xtackNumberLabel")}
                  </div>
                  <CopyButton value={payNumber} label={tr("numberLabel")} />
                  <div className="text-[11px] text-muted-foreground">
                    {tr("accountHolderLabel")}{" "}
                    <span className="font-semibold text-foreground">{payName}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {tr("amountToSendLabel")}{" "}
                    <span className="font-bold text-foreground">{req.amount} MZN</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-[11px] text-amber-600">
                    <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
                    <span>
                      {tr("useReferenceHint")} <strong>{req.merchantRef}</strong>{" "}
                      {tr("inDescriptionHint")}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Passos */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 text-sm font-semibold text-foreground">
                {tr("howToPayVia")}{" "}
                {instructions.method === "mpesa"
                  ? "M-Pesa"
                  : instructions.method === "emola"
                    ? "e-Mola"
                    : tr("transferLabel")}
              </div>
              <ol className="space-y-2">
                {instructions.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm text-foreground">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>

            {/* Acção: alerta o admin já, ao clicar aqui */}
            <button
              onClick={handleAlertAdmin}
              disabled={alertingAdmin}
              className="press flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl text-sm font-semibold text-primary-foreground disabled:opacity-60"
              style={{ background: "var(--gradient-primary)" }}
            >
              {alertingAdmin ? tr("adminActivatingAction") : tr("alreadyPaidSendProof")}{" "}
              <Icon name="arrowRight" size={15} />
            </button>
            {initError && <p className="text-xs text-destructive">{initError}</p>}
          </div>
        )}

        {/* ── Step: Envio de Comprovativo ── */}
        {step === "proof" && req && (
          <div className="space-y-4 animate-slide-up">
            <div className="flex items-start gap-2 rounded-2xl border border-emerald-300/40 bg-emerald-500/10 p-4">
              <Icon name="check" size={16} className="mt-0.5 shrink-0 text-emerald-600" />
              <div>
                <div className="text-sm font-semibold text-foreground mb-1">
                  {tr("adminAlreadyAlertedTitle")}
                </div>
                <div className="text-xs text-muted-foreground">{tr("afterPayingDescribe")}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="text-xs font-medium text-foreground">
                {tr("paymentRefNoteLabel")} · {tr("optionalLabel")}
              </div>
              <textarea
                value={proofNote}
                onChange={(e) => setProofNote(e.target.value)}
                placeholder={`Ex: Transferi ${req.amount} MZN para ${payNumber || tr("xtackNumberPlaceholder")} às 14h32. Confirmação: MP12345678`}
                className="h-24 w-full resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>

            {/* WhatsApp — reforço opcional, não é obrigatório porque o
                admin já foi alertado no Supabase assim que chegámos a este
                passo (ver handleAlertAdmin). */}
            {(method === "mpesa" || method === "emola") && (
              <button
                onClick={handleWhatsAppProof}
                className="press flex items-center justify-center gap-2 h-12 w-full rounded-2xl bg-[#25D366] text-sm font-semibold text-white"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 1.989.574 3.842 1.563 5.408L2 22l4.738-1.543A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.963 7.963 0 01-4.236-1.22l-.303-.181-3.135 1.02 1.05-3.044-.198-.313A7.963 7.963 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z" />
                </svg>
                {tr("sendProofViaWhatsApp")}
              </button>
            )}

            <ShimmerButton
              onClick={handleSaveNote}
              className="press h-12 w-full rounded-2xl text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              {tr("submitAndWaitConfirmation")}
            </ShimmerButton>
          </div>
        )}

        {/* ── Step: A aguardar ── */}
        {step === "waiting" && (
          <div className="flex flex-col items-center justify-center pt-12 text-center animate-slide-up space-y-4">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-amber-500/15">
              <Icon name="clock" size={36} className="text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-foreground">{tr("waitingConfirmationTitle")}</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              {proofSent ? tr("proofSentToXtack") : tr("paymentUnderReview")}
            </p>
            {!proofSent && (
              <div className="text-3xl font-mono font-bold text-primary">{fmt(countdown)}</div>
            )}
            <div className="w-full rounded-2xl border border-border bg-card p-4 text-left space-y-1">
              <div className="text-xs text-muted-foreground">{tr("referenceLabel")}</div>
              <div className="font-mono font-semibold text-sm text-primary">{req?.merchantRef}</div>
            </div>
            {initError && <p className="text-xs text-destructive">{initError}</p>}
          </div>
        )}

        {/* ── Step: Done ── */}
        {step === "done" && (
          <div className="flex flex-col items-center justify-center pt-16 text-center animate-pop-in">
            <div className="relative">
              <div
                className="absolute inset-0 rounded-full opacity-30 blur-2xl"
                style={{ background: "var(--gradient-primary)" }}
              />
              <div
                className="relative grid h-24 w-24 place-items-center rounded-full text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Icon name="check" size={40} />
              </div>
            </div>
            <h2 className="mt-6 text-2xl font-bold tracking-tight text-foreground">
              {tr("planActivatedTitle")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {plan.name} {tr("planActiveNextBilling")}
            </p>
            <ShimmerButton
              onClick={() => navigate({ to: "/business" })}
              className="press mt-8 h-12 w-full rounded-2xl text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              {tr("goToDashboard")}
            </ShimmerButton>
          </div>
        )}

        {/* ── Step: Failed ── */}
        {step === "failed" && (
          <div className="flex flex-col items-center justify-center pt-16 text-center animate-pop-in">
            <div className="grid h-24 w-24 place-items-center rounded-full bg-destructive/15">
              <Icon name="x" size={40} className="text-destructive" />
            </div>
            <h2 className="mt-6 text-xl font-bold text-foreground">{tr("paymentExpiredTitle")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{tr("paymentTimeEnded")}</p>
            <ShimmerButton
              onClick={() => {
                setStep("select");
                setReq(null);
                setCountdown(600);
                setProofSent(false);
                setProofNote("");
              }}
              className="press mt-6 h-12 w-full rounded-2xl text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              {tr("tryAgainAction")}
            </ShimmerButton>
          </div>
        )}
      </main>

      <div className="py-3 text-center text-[10px] text-muted-foreground border-t border-border">
        © XTACK OFICIAL · Spotter Local v11
      </div>
    </div>
  );
}
