// ============================================================
// XTACK SPOTTER — Fundo animado do hero (v18)
// Smoke fluido + Glass blobs — estilo wallpaper iPhone
// Fica sempre atrás do conteúdo (z-index: 0), sem tapar nada.
// ============================================================

export function HeroBgCanvas() {
  return (
    <div className="hero-bg-canvas" aria-hidden="true">
      {/* Camada de fumo orgânico */}
      <div className="hero-smoke hero-smoke-1" />
      <div className="hero-smoke hero-smoke-2" />

      {/* Shimmer dourado suave */}
      <div className="hero-gold-shimmer" />

      {/* Glass blobs translúcidos */}
      <div className="hero-blob hero-blob-1" />
      <div className="hero-blob hero-blob-2" />
      <div className="hero-blob hero-blob-3" />
    </div>
  );
}
