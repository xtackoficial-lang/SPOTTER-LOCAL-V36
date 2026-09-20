// ============================================================
// SPOTTER — Publicar no feed (Ideia 1: só fotos, pago por duração)
// ------------------------------------------------------------
// Fluxo próprio, dedicado a ZumboPay (sem alternativa manual — a
// publicação só é criada pelo webhook depois do pagamento confirmar,
// porque precisa da foto já enviada para o Storage antes de mais nada).
// ============================================================
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import { ShimmerButton } from "@/components/ShimmerButton";
import {
  createZumboPayPostPayment,
  type PostPackageId,
  type PaymentRequest,
} from "@/lib/payments-db";
import { uploadMedia } from "@/lib/storage-upload";
import { PROVINCES_MZ, citiesForProvince } from "@/lib/mozambique-locations";
import { useOnboarding } from "@/lib/onboarding-storage";
import { useAuth } from "@/lib/auth-context";
import { RequireBusiness } from "@/components/RequireBusiness";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";

export const Route = createFileRoute("/publish-post")({
  head: () => ({ meta: [{ title: "Publicar no feed — Spotter Local" }] }),
  component: () => (
    <RequireBusiness>
      <PublishPostPage />
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
  const [zumboPopupBlocked, setZumboPopupBlocked] = useState(false);
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

      const { payment, paymentUrl } = await createZumboPayPostPayment(businessId, pkg, {
        photoUrl,
        caption: caption.trim() || undefined,
        city: city || undefined,
      });
      setReq(payment);
      const opened = window.open(paymentUrl, "_blank", "noopener,noreferrer");
      if (!opened) setZumboPopupBlocked(true);
      setStep("waiting");
    } catch (err) {
      console.warn("Falha ao criar publicação:", err);
      setError(err instanceof Error ? err.message : "Não foi possível criar o pagamento.");
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  // Confirmação automática — mesmo padrão de /boost e /payment: Realtime
  // com fallback de polling, porque a linha de business_posts só é
  // criada pelo webhook depois do pagamento confirmar.
  useEffect(() => {
    if (step !== "waiting" || !req?.id) return;
    if (!SUPABASE_CONFIGURED || !supabase) return;
    const client = supabase;

    const channel = client
      .channel(`zumbopay-post-${req.id}`)
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
              Completa o pagamento na página que abriu. A publicação aparece automaticamente assim
              que confirmares.
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
            <h2 className="text-lg font-bold text-foreground">Publicação activa!</h2>
            <p className="text-sm text-muted-foreground">
              A tua foto já está a aparecer no feed de descoberta durante {selectedPackage.hours}.
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
