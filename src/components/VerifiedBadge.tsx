// Selo de verificação — pedido do Abrão (2026-09-07): o ícone "verified"
// (BadgeCheck da lucide-react) é um ícone de contorno (só stroke, sem
// preenchimento), por isso em tamanhos pequenos (12-16px) não se parecia
// nada com os selos sólidos e recortados do Instagram/Facebook/WhatsApp.
// Este componente desenha a forma exacta: três quadrados arredondados
// sobrepostos e rodados (criando as pontas recortadas da "roseta"),
// preenchidos com currentColor, com um check branco por cima — o mesmo
// desenho que esses apps usam.
interface VerifiedBadgeProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
}

export function VerifiedBadge({
  size = 16,
  className,
  style,
  "aria-label": ariaLabel,
}: VerifiedBadgeProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={className}
      style={style}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <g transform="translate(20,20)">
        <rect x="-14" y="-14" width="28" height="28" rx="7" fill="currentColor" />
        <rect
          x="-14"
          y="-14"
          width="28"
          height="28"
          rx="7"
          fill="currentColor"
          transform="rotate(25)"
        />
        <rect
          x="-14"
          y="-14"
          width="28"
          height="28"
          rx="7"
          fill="currentColor"
          transform="rotate(50)"
        />
      </g>
      <path
        d="M13 20.5l4.5 4.5 9-9.5"
        stroke="white"
        strokeWidth="3.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
