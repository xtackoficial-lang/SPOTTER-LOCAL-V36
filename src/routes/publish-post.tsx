// ============================================================
// SPOTTER — Publicar no feed (Ideia 1: só fotos, pago por duração)
// ------------------------------------------------------------
// Fluxo próprio, dedicado a M-Pesa (sem alternativa manual — a
// publicação só é criada pelo servidor depois do pagamento confirmar,
// porque precisa da foto já enviada para o Storage antes de mais nada).
// ============================================================
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import { ShimmerButton } from "@/components/ShimmerButton";
import { createMpesaPostPayment, type PostPackageId, type PaymentRequest } from "@/lib/payments-db";
import { MpesaPayerField } from "@/components/MpesaPayerField";
import { useMpesaConfirmation } from "@/lib/use-mpesa-confirmation";
import { normalizeWalletPhone } from "@/lib/validators";
import { uploadMedia } from "@/lib/storage-upload";
import { PROVINCES_MZ, citiesForProvince } from "@/lib/mozambique-locations";
import { useOnboarding } from "@/lib/onboarding-storage";
import { useAuth } from "@/lib/auth-context";
import { RequireBusiness } from "@/components/RequireBusiness";
import { isPlayStoreApp } from "@/lib/play-context";
import { PlayPlansNotice } from "@/components/PlayPlansNotice";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";

export const Route = createFileRoute("/publish-post")({
  head: () => ({ meta: [{ title: "Publicar no feed — Spotter Local" }] }),
  component: () => (
    <RequireBusiness>
      {isPlayStoreApp() ? <PlayPlansNotice /> : <PublishPostPage />}
    </RequireBusiness>
  ),
});

const PACKAGES: { id: PostPackageId; label: string; hours: string; price: number }[] = [
  { id: "24h", label: "24 horas", hours: "1 dia", price: 50 },
  { id: "3d", label: "3 dias", hours: "3 dias", price: 120 },
  { id: "7d", label: "7 dias", hours: "7 dias", price: 250 },
];

type Step = "form" | "waiting" | "done" | "failed";

function PublishPostPage() {
  const navigate = useNavigate();
  const { draft } = useOnboarding();
  const businessId = draft.business.businessId || "default";
  const { user } = useAuth();

  const [step, setStep] = useState<Step>("form");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [pkg, setPkg] = useState<PostPackageId>("24h");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [req, setReq] = useState<PaymentRequest | null>(null);
  const [payerPhone, setPayerPhone] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedPackage = PACKAGES.find((p) => p.id === pkg)!;

  const handlePickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!photoFile) {
      setError("Escolhe uma foto para publicar.");
      return;
    }
    if (!user) {
      setError("Precisas de ter sessão iniciada.");
      return;
    }
    const payerCheck = normalizeWalletPhone(payerPhone, "mpesa");
    if (!payerCheck.ok) {
      setError(payerCheck.error);
      return;
    }
    setError(null);
    setLoading(true);
    setUploading(true);
    try {
      // CORREÇÃO (varredura 2026-09-19): a política de Storage exige
      // que a 2ª pasta do caminho seja auth.uid() — usar businessId
      // aqui (que é gerado à parte, nunca igual ao uid) fazia o upload
      // ser rejeitado pelo RLS em silêncio, caindo no fallback base64
      // sem avisar ninguém que a foto nunca ficou guardada a sério.
      const photoUrl = await uploadMedia(photoFile, "post", user.id);
      setUploading(false);

      setStep("waiting"); // "confirma no telemóvel" — a chamada só responde depois do PIN
      const result = await createMpesaPostPayment(
        businessId,
        pkg,
        {
          photoUrl,
          caption: caption.trim() || undefined,
          city: city || undefined,
        },
        payerCheck.value,
      );
      setReq(result.payment);
      if (result.status === "confirmed") setStep("done");
      else if (result.status === "failed") {
        setError(result.error ?? "O pagamento não foi concluído.");
        setStep("form");
      }
      // "pending": continua em espera — useMpesaConfirmation volta a perguntar.
    } catch (err) {
      console.warn("Falha ao criar publicação:", err);
      setError(err instanceof Error ? err.message : "Não foi possível criar o pagamento.");
      setStep("form");
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  // Rede de segurança: se a resposta da cobrança ficou em dúvida, volta a perguntar à M-Pesa.
  useMpesaConfirmation(
    step === "waiting" && req?.status === "pending",
    req?.id,
    () => setStep("done"),
    () => setStep("failed"),
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="glass-bar sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
        <button
          onClick={() => navigate({ to: "/merchant", replace: true })}
          className="press rounded-full p-1"
        >
          <Icon name="chevronLeft" size={22} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Publicar no feed</h1>
      </div>

      <div className="mx-auto max-w-md px-4 py-6 space-y-6">
        {step === "form" && (
          <>
            <p className="text-sm text-muted-foreground">
              A tua foto aparece na Home de descoberta, durante o tempo que escolheres. Podes
              escolher publicar noutra cidade, não só na tua.
            </p>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePickPhoto}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="press flex h-48 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-card"
              >
                {photoPreview ? (
                  <img
                    loading="lazy"
                    decoding="async"
                    src={photoPreview}
                    alt="Pré-visualização"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Icon name="image" size={28} />
                    <span className="text-sm">Escolher foto</span>
                  </span>
                )}
              </button>
            </div>

            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Legenda (opcional)"
              rows={3}
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
                <option value="">Província (opcional)</option>
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
              <div className="text-sm font-semibold text-foreground">Duração</div>
              {PACKAGES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPkg(p.id)}
                  className={`press flex w-full items-center justify-between rounded-2xl border px-4 py-3 ${
                    pkg === p.id ? "border-primary bg-primary/10" : "border-border bg-card"
                  }`}
                >
                  <span className="text-sm font-medium text-foreground">{p.label}</span>
                  <span className="text-sm font-bold text-primary">{p.price} MZN</span>
                </button>
              ))}
            </div>

            <MpesaPayerField value={payerPhone} onChange={setPayerPhone} />

            {error && <p className="text-xs text-destructive">{error}</p>}

            <ShimmerButton
              onClick={handleSubmit}
              disabled={loading || !photoFile}
              className="press h-14 w-full rounded-2xl text-base font-bold text-primary-foreground disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}
            >
              {uploading
                ? "A enviar foto…"
                : loading
                  ? "A criar pagamento…"
                  : `Pagar ${selectedPackage.price} MZN e publicar`}
            </ShimmerButton>
          </>
        )}

        {step === "waiting" && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <Icon name="clock" size={40} className="text-primary" />
            <h2 className="text-lg font-bold text-foreground">A aguardar confirmação</h2>
            <p className="text-sm text-muted-foreground">
              Enviámos um pedido de pagamento para o teu M-Pesa. Abre o pedido no telemóvel e digita
              o teu PIN. A publicação aparece automaticamente assim que confirmares.
            </p>
            {req?.merchantRef && (
              <div className="w-full rounded-2xl border border-border bg-card p-4 text-left space-y-1">
                <div className="text-xs text-muted-foreground">Referência</div>
                <div className="font-mono font-semibold text-sm text-primary">
                  {req.merchantRef}
                </div>
              </div>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <Icon name="check-circle" size={48} className="text-emerald-600" />
            <h2 className="text-lg font-bold text-foreground">Publicação activa!</h2>
            <p className="text-sm text-muted-foreground">
              A tua foto já está a aparecer no feed de descoberta durante {selectedPackage.hours}.
            </p>
            <ShimmerButton
              onClick={() => navigate({ to: "/merchant", replace: true })}
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
