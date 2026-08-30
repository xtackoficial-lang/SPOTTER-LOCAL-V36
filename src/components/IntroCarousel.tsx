// ============================================================
// XTACK SPOTTER — Introdução deslizável (primeira vez que a app abre)
// ------------------------------------------------------------
// Pedido do Abrão (2026-08-27): 3 fotos que a pessoa arrasta para o
// lado sobre a app, mostradas só na PRIMEIRA vez que alguém abre a
// app, antes do cadastro/login. Depois de ver (ou saltar), nunca mais
// aparece nesse aparelho — guardado em localStorage.
//
// Implementado com CSS scroll-snap nativo (sem bibliotecas extra):
// funciona por arrasto do dedo/rato, é suave, e o indicador de bolinhas
// segue o scroll automaticamente via IntersectionObserver.
//
// PARA TROCAR AS IMAGENS PELAS FOTOS REAIS DO ABRÃO: substituir os 3
// ficheiros em /public/onboarding-intro/s1.png, s2.png, s3.png — não é
// preciso mexer neste componente.
// ============================================================
import { useEffect, useRef, useState } from "react";

const SEEN_KEY = "xlocal.intro.seen.v1";

export function hasSeenIntro(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // se localStorage falhar, não bloqueia ninguém — mostra a app normal
  }
}

function markIntroSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignorado */
  }
}

const SLIDES = [
  {
    image: "/onboarding-intro/s1.png",
    title: "Descubra negócios perto de si",
    subtitle: "Restaurantes, barbearias, hotéis e muito mais — na tua cidade.",
  },
  {
    image: "/onboarding-intro/s2.png",
    title: "Tudo num só lugar",
    subtitle: "Encontra, compara e contacta negócios locais em segundos.",
  },
  {
    image: "/onboarding-intro/s3.png",
    title: "O teu negócio merece ser visto",
    subtitle: "Cadastra grátis e chega a mais clientes hoje mesmo.",
  },
];

export function IntroCarousel({ onFinish }: { onFinish: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const slides = Array.from(track.children) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            const idx = slides.indexOf(entry.target as HTMLElement);
            if (idx !== -1) setActive(idx);
          }
        });
      },
      { root: track, threshold: [0.6] },
    );
    slides.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  const finish = () => {
    markIntroSeen();
    onFinish();
  };

  const goTo = (idx: number) => {
    const track = trackRef.current;
    if (!track) return;
    const slide = track.children[idx] as HTMLElement | undefined;
    slide?.scrollIntoView({ behavior: "smooth", inline: "start" });
  };

  const isLast = active === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      <button
        onClick={finish}
        className="press absolute right-4 top-12 z-10 rounded-full bg-white/15 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm"
      >
        Saltar
      </button>

      {/* Pista deslizável — scroll-snap nativo dá o arrasto suave e o
          "encaixe" em cada ecrã, sem precisar de nenhuma biblioteca de
          gestos. Funciona com o dedo no telemóvel e com o rato no
          desktop (clicar e arrastar já funciona por defeito no scroll
          horizontal com touch/trackpad; utilizadores de rato normal
          usam as bolinhas ou o botão). */}
      <div
        ref={trackRef}
        className="intro-track no-scrollbar flex flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {SLIDES.map((slide, i) => (
          <div
            key={i}
            className="flex h-full w-full shrink-0 snap-start snap-always flex-col items-center justify-center px-8"
          >
            <img
              src={slide.image}
              alt=""
              className="aspect-square w-full max-w-sm rounded-[32px] object-cover shadow-2xl"
              draggable={false}
            />
            <h2 className="mt-8 text-center text-2xl font-extrabold text-white">
              {slide.title}
            </h2>
            <p className="mt-2 max-w-xs text-center text-sm text-white/70">
              {slide.subtitle}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-6 px-8 pb-12 pt-2">
        <div className="flex gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Ir para o ecrã ${i + 1}`}
              className={`h-2 rounded-full transition-all ${
                i === active ? "w-6 bg-white" : "w-2 bg-white/30"
              }`}
            />
          ))}
        </div>

        {isLast ? (
          <button
            onClick={finish}
            className="press h-13 w-full max-w-sm rounded-2xl py-3.5 text-sm font-bold text-white shadow-lg"
            style={{ background: "var(--gradient-primary)" }}
          >
            Começar
          </button>
        ) : (
          <button
            onClick={() => goTo(active + 1)}
            className="press h-13 w-full max-w-sm rounded-2xl border border-white/25 py-3.5 text-sm font-bold text-white"
          >
            Seguinte
          </button>
        )}
      </div>
    </div>
  );
}
