// ============================================================
// XTACK SPOTTER — Fundo temático + animações sazonais (v14)
// ------------------------------------------------------------
// Componente "passivo": recebe a aparência já resolvida (ver
// theme-storage.ts) e limita-se a desenhá-la. Não sabe nada de Supabase
// nem de admin — só pinta o fundo e, por cima, uma camada de partículas
// animadas em CSS puro (leve, sem libraries de animação extra).
// ============================================================
import { useMemo } from "react";
import type { AnimationId, ScreenAppearance } from "@/lib/theme-storage";

interface Particle {
  left: number; // %
  delay: number; // s
  duration: number; // s
  size: number; // px ou rem-ish
  drift: number; // px de deslocamento horizontal durante a queda
}

function makeParticles(count: number, seedBase: number): Particle[] {
  // Geração pseudo-aleatória determinística (mesmo "seed" = mesmo layout),
  // para a animação não saltar/recompor a cada re-render do componente.
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const seed = (seedBase + i * 37.13) % 100;
    particles.push({
      left: (seed * 1.7) % 100,
      delay: (seed % 10) * 0.6,
      duration: 6 + (seed % 7),
      size: 8 + (seed % 14),
      drift: ((seed % 5) - 2) * 18,
    });
  }
  return particles;
}

const PARTICLE_GLYPH: Record<AnimationId, string | null> = {
  none: null,
  snow: "❄",
  confetti: null, // confetti usa blocos coloridos, não emoji
  hearts: "♥",
  stars: "✦",
  fireworks: null, // fireworks usa explosões CSS, não emoji
  leaves: "🍃",
  bubbles: null, // bubbles usa círculos translúcidos, não emoji
};

const CONFETTI_COLORS = ["#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#FF8FE0", "#FFA94D"];

function AnimationLayer({ animation }: { animation: AnimationId }) {
  const particles = useMemo(() => makeParticles(animation === "stars" ? 18 : 26, 7), [animation]);
  const bursts = useMemo(
    () => [
      { left: 22, top: 22, delay: 0, color: "#FFD93D" },
      { left: 70, top: 16, delay: 0.9, color: "#FF6B6B" },
      { left: 45, top: 32, delay: 1.8, color: "#4D96FF" },
      { left: 80, top: 38, delay: 2.6, color: "#6BCB77" },
    ],
    [],
  );

  if (animation === "none") return null;

  if (animation === "confetti") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {particles.map((p, i) => (
          <span
            key={i}
            className="absolute top-[-5%] block animate-theme-fall"
            style={
              {
                left: `${p.left}%`,
                width: `${Math.max(p.size * 0.5, 5)}px`,
                height: `${Math.max(p.size * 0.8, 8)}px`,
                backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                borderRadius: i % 3 === 0 ? "50%" : "2px",
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                "--theme-drift": `${p.drift}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    );
  }

  if (animation === "bubbles") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {particles.map((p, i) => (
          <span
            key={i}
            className="absolute bottom-[-8%] block rounded-full border border-white/40 bg-white/10 animate-theme-rise"
            style={
              {
                left: `${p.left}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration + 2}s`,
                "--theme-drift": `${p.drift}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    );
  }

  if (animation === "fireworks") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {bursts.map((b, i) => (
          <span
            key={i}
            className="absolute h-1 w-1 rounded-full animate-theme-firework"
            style={{
              left: `${b.left}%`,
              top: `${b.top}%`,
              backgroundColor: b.color,
              boxShadow: `0 0 0 0 ${b.color}`,
              animationDelay: `${b.delay}s`,
            }}
          />
        ))}
      </div>
    );
  }

  // snow / hearts / stars / leaves — partícula única em queda com glyph
  const glyph = PARTICLE_GLYPH[animation];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute top-[-8%] block select-none animate-theme-fall text-white/80"
          style={
            {
              left: `${p.left}%`,
              fontSize: `${p.size}px`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--theme-drift": `${p.drift}px`,
            } as React.CSSProperties
          }
        >
          {glyph}
        </span>
      ))}
    </div>
  );
}

/**
 * Resolve o objecto de style CSS para um dado ScreenAppearance, sem
 * envolver nada em JSX. Útil quando o elemento de fundo já existe como
 * uma tag fixa na página (ex: um <header>) e só queremos substituir o
 * `style` dele, sem trocar a estrutura/tag do elemento.
 */
export function resolveBackgroundStyle(appearance: ScreenAppearance): React.CSSProperties {
  if (appearance.backgroundType === "image") {
    return {
      backgroundImage: `url(${appearance.backgroundValue})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  if (appearance.backgroundType === "color") {
    return { backgroundColor: appearance.backgroundValue };
  }
  return { background: appearance.backgroundValue };
}

/**
 * Apenas a camada de animação + escurecimento (sem o fundo), para colocar
 * como filho absoluto dentro de um elemento que já tem o seu próprio
 * background definido via resolveBackgroundStyle.
 */
export function ThemeAnimationOnly({ appearance }: { appearance: ScreenAppearance }) {
  return (
    <>
      {appearance.backgroundType === "image" && <div className="absolute inset-0 bg-black/35" />}
      <AnimationLayer animation={appearance.animation} />
    </>
  );
}

/**
 * Aplica o fundo (gradiente/cor/imagem) e, por cima, a camada de animação,
 * dentro do <div> de fundo já existente em cada página (ver uso em
 * index.tsx, home.tsx, etc.). O conteúdo real da página continua a ser
 * renderizado pelo próprio chamador, como children.
 */
export function ThemeBackdrop({
  appearance,
  className = "",
  children,
}: {
  appearance: ScreenAppearance;
  className?: string;
  children?: React.ReactNode;
}) {
  const style: React.CSSProperties =
    appearance.backgroundType === "image"
      ? {
          backgroundImage: `url(${appearance.backgroundValue})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : appearance.backgroundType === "color"
        ? { backgroundColor: appearance.backgroundValue }
        : { background: appearance.backgroundValue };

  return (
    <div className={`relative overflow-hidden ${className}`} style={style}>
      {appearance.backgroundType === "image" && (
        // Camada de escurecimento para o texto continuar legível sobre
        // fotos — sem isto, imagens claras tornam o texto branco ilegível.
        <div className="absolute inset-0 bg-black/35" />
      )}
      <AnimationLayer animation={appearance.animation} />
      {children}
    </div>
  );
}
