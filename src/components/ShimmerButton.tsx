// ============================================================
// XTACK SPOTTER — Botão com onda de luz ao confirmar (v18)
// Ao clicar: micro-bounce + glow + shimmer dourado atravessa.
// Drop-in replacement para qualquer <button> com gradient-primary.
// ============================================================
import { useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** Classes extra além das base */
  className?: string;
  /** style inline (ex: background gradient) */
  style?: React.CSSProperties;
}

export function ShimmerButton({
  children,
  className = "",
  style,
  onClick,
  disabled,
  ...rest
}: ShimmerButtonProps) {
  const [waving, setWaving] = useState(false);
  const [pressing, setPressing] = useState(false);
  const waveRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;

    // Dispara a onda — reseta primeiro para poder repetir
    setWaving(false);
    setPressing(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setWaving(true);
        setPressing(true);
        // Remove as classes após a animação terminar
        setTimeout(() => setWaving(false), 680);
        setTimeout(() => setPressing(false), 400);
      });
    });

    onClick?.(e);
  };

  return (
    <button
      ref={btnRef}
      className={`shimmer-btn ${pressing ? "confirm-press" : ""} ${className}`}
      style={style}
      disabled={disabled}
      onClick={handleClick}
      {...rest}
    >
      {/* Onda de luz */}
      <span
        ref={waveRef}
        className={`shimmer-btn-wave ${waving ? "running" : ""}`}
        aria-hidden="true"
      />
      {/* Conteúdo real do botão — sempre em cima da onda */}
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </button>
  );
}
