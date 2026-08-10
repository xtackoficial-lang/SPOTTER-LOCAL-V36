import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { Icon } from "@/components/Icon";
import { useQRHistory } from "@/lib/qr-storage";
import { useT, useLocale, INTL_TAG } from "@/lib/i18n";

export const Route = createFileRoute("/qr")({
  head: () => ({ meta: [{ title: "Scanner QR — Spotter Local" }] }),
  component: QRScanner,
});

type ScanState = "idle" | "scanning" | "success" | "error";

function QRScanner() {
  const tr = useT();
  const [locale] = useLocale();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { scans, addScan, clear } = useQRHistory();

  const [state, setState] = useState<ScanState>("idle");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"scanner" | "history">("scanner");
  const [manualUrl, setManualUrl] = useState("");
  const [showManual, setShowManual] = useState(false);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startCamera = async () => {
    setError(null);
    setState("scanning");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        startScanLoop();
      }
    } catch {
      setError(tr("cameraUnavailableManual"));
      setState("error");
      setShowManual(true);
    }
  };

  const startScanLoop = () => {
    // Use BarcodeDetector API if available
    if ("BarcodeDetector" in window) {
      // @ts-expect-error BarcodeDetector not in TS types
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      intervalRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            handleResult(barcodes[0].rawValue);
          }
        } catch {
          /* ignore */
        }
      }, 400);
    } else {
      // Fallback: canvas + jsQR-style scan simulation
      intervalRef.current = setInterval(() => {
        if (!videoRef.current || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext("2d");
        if (!ctx) return;
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        // In production, integrate jsQR here
      }, 500);
    }
  };

  const handleResult = (url: string) => {
    stopCamera();
    addScan(url);
    setResult(url);
    setState("success");
  };

  const openResult = () => {
    if (!result) return;
    if (result.startsWith("http://") || result.startsWith("https://")) {
      window.open(result, "_blank", "noopener");
    } else {
      navigator.clipboard?.writeText(result).catch(() => {});
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setState("idle");
    setShowManual(false);
  };

  const submitManual = () => {
    const url = manualUrl.trim();
    if (!url) return;
    addScan(url);
    setResult(url);
    setState("success");
    setManualUrl("");
  };

  useEffect(() => () => stopCamera(), []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-5 pb-3 pt-12 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {tr("qrScannerTitle")}
            </h1>
            <p className="text-xs text-muted-foreground">{tr("qrScannerSubtitle")}</p>
          </div>
          <div className="flex gap-1 rounded-xl bg-muted p-1">
            {(["scanner", "history"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  if (t === "scanner") reset();
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition press ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                {t === "scanner"
                  ? tr("scanTabLabel")
                  : `${tr("historyTabLabel")} (${scans.length})`}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 py-5 pb-24">
        {tab === "scanner" ? (
          <div className="space-y-4 animate-slide-up">
            {/* Viewfinder */}
            <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl border-2 border-dashed border-border bg-muted">
              {state === "scanning" && (
                <>
                  <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
                  <canvas ref={canvasRef} className="hidden" />
                  {/* Scan animation */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="relative h-48 w-48">
                      {/* Corner brackets */}
                      {[
                        "top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl",
                        "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
                        "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
                        "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl",
                      ].map((cls, i) => (
                        <div key={i} className={`absolute h-8 w-8 border-white/90 ${cls}`} />
                      ))}
                      {/* Scan line */}
                      <div
                        className="absolute inset-x-4 h-0.5 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent animate-bounce"
                        style={{ top: "50%" }}
                      />
                    </div>
                  </div>
                  <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-white/90">
                    {tr("scanningLabel")}
                  </div>
                </>
              )}

              {state === "idle" && (
                <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
                  <div className="grid h-20 w-20 place-items-center rounded-3xl bg-accent text-accent-foreground">
                    <Icon name="qr" size={40} />
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">{tr("readyToScan")}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {tr("tapStartCameraHint")}
                    </div>
                  </div>
                </div>
              )}

              {state === "success" && (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center animate-pop-in">
                  <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/20 text-emerald-600">
                    <Icon name="check" size={32} />
                  </div>
                  <div className="text-sm font-semibold text-foreground">{tr("qrReadSuccess")}</div>
                  <div className="max-w-full truncate rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                    {result}
                  </div>
                </div>
              )}

              {state === "error" && (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="grid h-16 w-16 place-items-center rounded-full bg-destructive/20 text-destructive">
                    <Icon name="help" size={28} />
                  </div>
                  <div className="text-xs text-muted-foreground">{error}</div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2.5">
              {state === "idle" && (
                <button
                  onClick={startCamera}
                  className="press h-12 w-full rounded-2xl text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)]"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  <span className="flex items-center justify-center gap-2">
                    <Icon name="camera" size={18} /> {tr("startCameraAction")}
                  </span>
                </button>
              )}

              {state === "scanning" && (
                <button
                  onClick={() => {
                    stopCamera();
                    setState("idle");
                  }}
                  className="press h-12 w-full rounded-2xl border border-border bg-card text-sm font-medium text-foreground"
                >
                  {tr("stopCameraAction")}
                </button>
              )}

              {state === "success" && (
                <div className="space-y-2">
                  <button
                    onClick={openResult}
                    className="press h-12 w-full rounded-2xl text-sm font-semibold text-primary-foreground"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <Icon name="arrowRight" size={18} />
                      {result?.startsWith("http") ? tr("openLinkAction") : tr("copyContentAction")}
                    </span>
                  </button>
                  <button
                    onClick={reset}
                    className="press h-12 w-full rounded-2xl border border-border bg-card text-sm font-medium text-foreground"
                  >
                    {tr("scanAnotherAction")}
                  </button>
                </div>
              )}

              {(state === "error" || state === "idle") && (
                <button
                  onClick={() => setShowManual(!showManual)}
                  className="press h-11 w-full rounded-2xl border border-border bg-card text-xs font-medium text-muted-foreground"
                >
                  {showManual ? tr("hideManualField") : tr("pasteLinkManually")}
                </button>
              )}
            </div>

            {/* Manual input */}
            {showManual && (
              <div className="animate-slide-up rounded-2xl border border-border bg-card p-4">
                <div className="text-xs font-semibold text-foreground mb-2">
                  {tr("enterUrlManually")}
                </div>
                <div className="flex gap-2">
                  <input
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitManual()}
                    placeholder="https://..."
                    className="h-11 flex-1 rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus:border-primary"
                  />
                  <button
                    onClick={submitManual}
                    disabled={!manualUrl.trim()}
                    className="press h-11 w-11 grid place-items-center rounded-xl text-primary-foreground disabled:opacity-50"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <Icon name="arrowRight" size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* History tab */
          <div className="space-y-3 animate-slide-up">
            {scans.length === 0 ? (
              <div className="mt-12 rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
                  <Icon name="qr" size={26} />
                </div>
                <div className="mt-4 font-semibold text-foreground">{tr("noScansYet")}</div>
                <p className="mt-1 text-xs text-muted-foreground">{tr("scannedCodesAppearHere")}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{scans.length} scan(s)</span>
                  <button onClick={clear} className="text-xs text-destructive">
                    {tr("clearAllAction")}
                  </button>
                </div>
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card stagger">
                  {scans.map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() =>
                          s.url.startsWith("http")
                            ? window.open(s.url, "_blank", "noopener")
                            : navigator.clipboard?.writeText(s.url).catch(() => {})
                        }
                        className="press flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-accent/40"
                      >
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                          <Icon name={s.url.startsWith("http") ? "globe" : "message"} size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">
                            {s.label}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(s.scannedAt).toLocaleDateString(INTL_TAG[locale], {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                        <Icon
                          name="arrowRight"
                          size={14}
                          className="shrink-0 text-muted-foreground"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
