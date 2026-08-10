// ============================================================
// XTACK SPOTTER — Breathing Glow Loader (v18 — Parte 3)
// Spinner premium com anéis pulsantes + glow + blobs de vidro.
// Uso: <BreathingLoader /> ou <BreathingLoader label="A carregar…" />
// ============================================================

interface BreathingLoaderProps {
  /** Texto debaixo do spinner (opcional) */
  label?: string;
  /** Sub-texto mais pequeno (opcional) */
  sub?: string;
  /** Tamanho base em px — default 64 */
  size?: number;
  /** Envolve num ecrã centrado full-height */
  fullScreen?: boolean;
}

export function BreathingLoader({
  label,
  sub,
  size = 64,
  fullScreen = false,
}: BreathingLoaderProps) {
  const inner = (
    <div className="flex flex-col items-center gap-5">
      {/* Spinner com breathing */}
      <div className="relative" style={{ width: size + 48, height: size + 48 }}>
        {/* Orb de glow — respira mais lentamente */}
        <div
          className="absolute rounded-full bg-primary/20"
          style={{
            inset: -8,
            animation: "sp-glow-breathe 3.8s ease-in-out infinite",
            filter: "blur(8px)",
          }}
        />
        {/* Anel exterior — breathing lento */}
        <div
          className="absolute rounded-full border border-primary/25"
          style={{
            inset: 0,
            animation: "sp-ring-breathe 3.8s ease-in-out infinite",
          }}
        />
        {/* Anel intermédio — breathing com delay */}
        <div
          className="absolute rounded-full border border-primary/18"
          style={{
            inset: 12,
            animation: "sp-ring-breathe 3.8s ease-in-out infinite",
            animationDelay: "0.55s",
          }}
        />
        {/* Spinner duplo central */}
        <div className="absolute" style={{ inset: 24 }}>
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin-cw" />
          <div
            className="absolute rounded-full border-2 border-transparent border-b-primary/50 animate-spin-ccw"
            style={{ inset: 6 }}
          />
          {/* Ponto central pulsante */}
          <div
            className="absolute rounded-full bg-primary"
            style={{
              inset: 14,
              animation: "pulse-scale 1.8s ease-in-out infinite",
            }}
          />
        </div>
      </div>

      {/* Barra de progresso indeterminada */}
      <div className="w-14 progress-bar-indeterminate" />

      {/* Textos */}
      {(label || sub) && (
        <div className="text-center animate-loading-content-in" style={{ animationDelay: "0.2s" }}>
          {label && <p className="text-sm font-medium text-foreground">{label}</p>}
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-0 bg-background">
        {/* Blobs de fundo subtis — mesma estética do splash */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="absolute rounded-full"
            style={{
              width: 320,
              height: 400,
              top: -120,
              left: -80,
              background:
                "radial-gradient(ellipse at 40% 35%, oklch(0.66 0.19 38 / 0.10) 0%, transparent 70%)",
              borderRadius: "60% 40% 55% 45% / 50% 60% 40% 50%",
              animation: "sp-blob-1 22s ease-in-out infinite",
              filter: "blur(2px)",
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              width: 240,
              height: 300,
              bottom: -80,
              right: -60,
              background:
                "radial-gradient(ellipse at 55% 45%, oklch(0.55 0.22 290 / 0.08) 0%, transparent 70%)",
              borderRadius: "45% 55% 40% 60% / 55% 40% 65% 35%",
              animation: "sp-blob-2 28s ease-in-out infinite",
              animationDelay: "-10s",
              filter: "blur(2px)",
            }}
          />
        </div>
        {inner}
      </div>
    );
  }

  return inner;
}
