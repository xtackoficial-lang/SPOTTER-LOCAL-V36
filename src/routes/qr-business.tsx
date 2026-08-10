// ============================================================
// SPOTTER — QR Code do negócio (para imprimir/partilhar)
// ------------------------------------------------------------
// Gera localmente (sem depender de nenhuma API externa em tempo de
// execução) um QR code que aponta para a página pública do negócio
// (/place/$businessId). O comerciante pode descarregar a imagem para
// imprimir e colocar na loja, mesa, vitrine, etc.
//
// Distinto de /qr, que é o leitor de QR codes (câmara) — esta página
// é o gerador, para o próprio negócio.
// ============================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useOnboarding } from "@/lib/onboarding-storage";
import { BusinessBottomNav } from "@/components/BusinessBottomNav";
import { Icon } from "@/components/Icon";
import { RequireBusiness } from "@/components/RequireBusiness";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/qr-business")({
  head: () => ({ meta: [{ title: "QR Code do negócio — Spotter Local" }] }),
  component: () => (
    <RequireBusiness>
      <QRBusinessPage />
    </RequireBusiness>
  ),
});

function QRBusinessPage() {
  const tr = useT();
  const { draft } = useOnboarding();
  const businessId = draft.business.businessId || "default";
  const businessName = draft.business.businessName || tr("myBusinessLabel");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const profileUrl = `${window.location.origin}/place/${businessId}`;

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, profileUrl, {
      width: 280,
      margin: 2,
      color: { dark: "#1a1a1a", light: "#ffffff" },
    })
      .then(() => {
        setError(false);
        setDataUrl(canvasRef.current?.toDataURL("image/png") ?? null);
      })
      .catch((err) => {
        console.warn("Falha ao gerar QR code:", err);
        setError(true);
      });
  }, [profileUrl]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `spotter-qr-${businessName.toLowerCase().replace(/\s+/g, "-")}.png`;
    a.click();
  };

  const handleCopyLink = () => {
    navigator.clipboard
      .writeText(profileUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: businessName, url: profileUrl }).catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-5 py-4">
        <Link
          to="/business"
          className="press grid h-9 w-9 place-items-center rounded-xl border border-border bg-card"
        >
          <Icon name="arrowLeft" size={16} />
        </Link>
        <h1 className="text-base font-semibold tracking-tight text-foreground">
          {tr("businessQrTitle")}
        </h1>
      </header>

      <main className="flex-1 px-5 py-6 pb-24">
        <p className="text-sm text-muted-foreground">{tr("printQrHint")}</p>

        <div className="mt-6 flex flex-col items-center gap-4 rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          {error ? (
            <div className="flex h-[280px] w-[280px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-center text-xs text-muted-foreground">
              <Icon name="alert" size={24} />
              {tr("qrGenerateError")}
            </div>
          ) : (
            <canvas ref={canvasRef} className="rounded-2xl" />
          )}
          <div className="text-center">
            <div className="text-sm font-semibold text-foreground">{businessName}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{profileUrl}</div>
          </div>
        </div>

        <div className="mt-5 space-y-2.5">
          <button
            onClick={handleDownload}
            disabled={!dataUrl}
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-primary-foreground disabled:opacity-50"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Icon name="download" size={16} /> {tr("downloadImageAction")}
          </button>
          <div className="flex gap-2.5">
            <button
              onClick={handleShare}
              className="press flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card text-xs font-medium text-foreground"
            >
              <Icon name="send" size={14} /> {tr("shareQrAction")}
            </button>
            <button
              onClick={handleCopyLink}
              className="press flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card text-xs font-medium text-foreground"
            >
              <Icon name={copied ? "check" : "copy"} size={14} />{" "}
              {copied ? tr("qrCopiedLink") : tr("copyLinkAction")}
            </button>
          </div>
        </div>
      </main>
      <BusinessBottomNav />
    </div>
  );
}
