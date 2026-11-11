// ============================================================
// SPOTTER — Carrossel de fotos (ao estilo Instagram)
// ------------------------------------------------------------
// • Desliza uma foto de cada vez, a seguir o dedo, com encaixe.
// • Contador "2/5" no canto de cima à direita.
// • Pontinhos POR BAIXO da foto (máx. 5 visíveis; os das pontas encolhem).
// • Setas só no computador, aparecem ao passar o rato.
// • Tocar numa foto abre-a em ecrã inteiro (pinça / duplo toque para ampliar).
// Uma foto só = imagem simples.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Dots, ImageViewer } from "@/components/ImageViewer";

export function PhotoCarousel({
  photos,
  alt,
  className = "aspect-[4/5]",
  zoomable = true,
}: {
  photos: string[];
  alt: string;
  /** Tamanho da zona da foto (por defeito 4:5, como o Instagram). */
  className?: string;
  /** Tocar numa foto abre-a em ecrã inteiro (por defeito sim). */
  zoomable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const list = photos.filter(Boolean);
  const many = list.length > 1;

  // Se a lista mudar (ex.: edição), não ficar num índice que já não existe.
  useEffect(() => {
    if (index > list.length - 1) setIndex(0);
  }, [list.length, index]);

  const open = (n: number) => (zoomable ? setViewer(n) : undefined);
  const viewerEl =
    viewer !== null ? (
      <ImageViewer images={list} startIndex={viewer} alt={alt} onClose={() => setViewer(null)} />
    ) : null;

  if (!many) {
    return (
      <>
        <img
          loading="lazy"
          decoding="async"
          src={list[0]}
          alt={alt}
          draggable={false}
          className={`w-full select-none object-cover ${className}`}
          style={zoomable ? { cursor: "zoom-in" } : undefined}
          onClick={() => open(0)}
        />
        {viewerEl}
      </>
    );
  }

  const go = (n: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({
      left: Math.max(0, Math.min(list.length - 1, n)) * el.clientWidth,
      behavior: "smooth",
    });
  };

  return (
    <div className="group w-full">
      <div className={`relative w-full overflow-hidden bg-neutral-200 ${className}`}>
        <div
          ref={ref}
          onScroll={(e) => {
            const el = e.currentTarget;
            const k = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
            if (k !== index) setIndex(k);
          }}
          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {list.map((src, i) => (
            <img
              key={`${src}-${i}`}
              loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              src={src}
              alt={`${alt} (${i + 1}/${list.length})`}
              className="h-full w-full shrink-0 snap-center snap-always select-none object-cover"
              style={zoomable ? { cursor: "zoom-in" } : undefined}
              onClick={() => open(i)}
            />
          ))}
        </div>

        <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold leading-none text-white">
          {index + 1}/{list.length}
        </div>

        {index > 0 && (
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={() => go(index - 1)}
            className="absolute left-2 top-1/2 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black opacity-0 shadow transition-opacity group-hover:opacity-100 md:grid"
          >
            <Icon name="chevronLeft" size={16} />
          </button>
        )}
        {index < list.length - 1 && (
          <button
            type="button"
            aria-label="Foto seguinte"
            onClick={() => go(index + 1)}
            className="absolute right-2 top-1/2 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black opacity-0 shadow transition-opacity group-hover:opacity-100 md:grid"
          >
            <Icon name="chevronRight" size={16} />
          </button>
        )}
      </div>

      <Dots count={list.length} index={index} className="py-2.5" />
      {viewerEl}
    </div>
  );
}
