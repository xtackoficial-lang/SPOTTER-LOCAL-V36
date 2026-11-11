// ============================================================
// SPOTTER — Visualizador de fotos em ecrã inteiro (ao estilo Instagram)
// ------------------------------------------------------------
// • Fundo preto, foto a toda a largura, sem botões de zoom.
// • Pinça: aproxima/afasta à volta dos dedos e, ao largar, a foto volta
//   suavemente ao sítio (como no Instagram). Mudar PINCH_SPRINGS_BACK para
//   false faz a pinça ficar onde a deixaste.
// • Duplo toque: aproxima no ponto tocado e FICA ampliada (dá para arrastar);
//   outro duplo toque afasta.
// • Com zoom: arrastar mexe na foto. Sem zoom: deslizar para o lado segue o
//   dedo e troca de foto; arrastar para cima/baixo fecha (o fundo esvanece).
// • Computador: roda do rato aproxima no cursor, duplo clique, arrastar,
//   setas ← → e Esc.
// • Contador "2/5" em cima e pontinhos em baixo (máx. 5 visíveis, como no Instagram).
// Sem dependências.
// ============================================================
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const PINCH_SPRINGS_BACK = true; // true = ao largar a pinça a foto volta ao tamanho normal
const CLOSE_DISTANCE = 110; // px de arrasto vertical que fecham a foto
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type View = { s: number; x: number; y: number };
const IDENTITY: View = { s: 1, x: 0, y: 0 };

export function ImageViewer({
  images,
  startIndex = 0,
  alt = "",
  onClose,
}: {
  images: string[];
  startIndex?: number;
  alt?: string;
  onClose: () => void;
}) {
  const tr = useT();
  const total = images.length;
  const first = clamp(startIndex, 0, Math.max(total - 1, 0));
  const [i, setI] = useState(first);
  const [view, setView] = useState<View>(IDENTITY);
  const [dragY, setDragY] = useState(0); // arrasto vertical para fechar
  const [touching, setTouching] = useState(false); // durante o gesto não há animação
  const [pinching, setPinching] = useState(false); // dois dedos: bloqueia o deslize entre fotos
  const [shown, setShown] = useState(false); // fade de entrada
  const many = total > 1;
  const zoomed = view.s > 1.01;

  const track = useRef<HTMLDivElement>(null);
  const iRef = useRef(first);
  const viewRef = useRef<View>(IDENTITY);
  viewRef.current = view;
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const lastTouchEnd = useRef(0);
  const locked = useRef(false); // ampliada por duplo toque/roda: não volta sozinha
  // Estado do gesto em curso (refs: não precisam de re-render).
  const g = useRef<{
    mode: "none" | "pending" | "pan" | "pinch" | "drag" | "swipe";
    x0: number;
    y0: number;
    base: View;
    dist0: number;
    mid0: { x: number; y: number };
    moved: boolean;
  }>({ mode: "none", x0: 0, y0: 0, base: IDENTITY, dist0: 1, mid0: { x: 0, y: 0 }, moved: false });
  const mouse = useRef<{ x: number; y: number; base: View } | null>(null);

  // ── geometria ────────────────────────────────────────────
  const geom = useCallback(() => {
    const el = track.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const img = el.querySelector<HTMLImageElement>(`[data-slide="${iRef.current}"] img`);
    return {
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      W: r.width,
      H: r.height,
      w: img?.offsetWidth ?? r.width,
      h: img?.offsetHeight ?? r.height,
    };
  }, []);

  // Mantém a foto dentro do ecrã (sem deixar buracos pretos quando está ampliada).
  const bound = useCallback(
    (v: View): View => {
      const q = geom();
      if (!q || v.s <= 1) return v.s < 1 ? IDENTITY : v.s === 1 ? IDENTITY : v;
      const mx = Math.max(0, (q.w * v.s - q.W) / 2);
      const my = Math.max(0, (q.h * v.s - q.H) / 2);
      return { s: v.s, x: clamp(v.x, -mx, mx), y: clamp(v.y, -my, my) };
    },
    [geom],
  );

  // Ponto (cx,cy) do ecrã fica parado enquanto a escala muda para `s`.
  const zoomAt = useCallback(
    (cx: number, cy: number, s: number, from: View): View => {
      const q = geom();
      if (!q) return from;
      const px = cx - q.cx;
      const py = cy - q.cy;
      const ix = (px - from.x) / from.s;
      const iy = (py - from.y) / from.s;
      return { s, x: px - s * ix, y: py - s * iy };
    },
    [geom],
  );

  const reset = useCallback(() => {
    locked.current = false;
    setView(IDENTITY);
  }, []);

  const goTo = useCallback(
    (n: number) => {
      const el = track.current;
      if (!el || total === 0) return;
      const k = clamp(n, 0, total - 1);
      el.scrollTo({ left: k * el.clientWidth, behavior: "smooth" });
    },
    [total],
  );

  // ── ciclo de vida ────────────────────────────────────────
  useLayoutEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = first * el.clientWidth;
  }, [first]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (many && e.key === "ArrowRight") goTo(iRef.current + 1);
      else if (many && e.key === "ArrowLeft") goTo(iRef.current - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, many, onClose]);

  const raf = useRef(0);
  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = track.current;
      if (!el) return;
      const k = clamp(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)), 0, total - 1);
      if (k !== iRef.current) {
        iRef.current = k;
        setI(k);
        locked.current = false;
        setView(IDENTITY);
      }
    });
  };

  const closeWithSlide = (dir: number) => {
    setTouching(false);
    setDragY(dir * window.innerHeight * 0.6);
    setShown(false);
    window.setTimeout(onClose, 170);
  };

  // ── toque ────────────────────────────────────────────────
  const dist = (t: React.TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid = (t: React.TouchList) => ({
    x: (t[0].clientX + t[1].clientX) / 2,
    y: (t[0].clientY + t[1].clientY) / 2,
  });

  const onTouchStart = (e: React.TouchEvent) => {
    setTouching(true);
    const st = g.current;
    if (e.touches.length >= 2) {
      st.mode = "pinch";
      setPinching(true);
      st.dist0 = Math.max(1, dist(e.touches));
      st.mid0 = mid(e.touches);
      st.base = viewRef.current;
      st.moved = true;
      setDragY(0);
    } else {
      const t = e.touches[0];
      st.x0 = t.clientX;
      st.y0 = t.clientY;
      st.base = viewRef.current;
      st.moved = false;
      st.mode = viewRef.current.s > 1.01 ? "pan" : "pending";
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const st = g.current;
    if (st.mode === "pinch" && e.touches.length >= 2) {
      const s = clamp((st.base.s * dist(e.touches)) / st.dist0, 0.6, MAX_SCALE);
      const m = mid(e.touches);
      const q = geom();
      if (!q) return;
      // O ponto que estava entre os dedos no início fica entre os dedos agora.
      const ix = (st.mid0.x - q.cx - st.base.x) / st.base.s;
      const iy = (st.mid0.y - q.cy - st.base.y) / st.base.s;
      setView({ s, x: m.x - q.cx - s * ix, y: m.y - q.cy - s * iy });
      return;
    }
    const t = e.touches[0];
    const dx = t.clientX - st.x0;
    const dy = t.clientY - st.y0;
    if (Math.abs(dx) + Math.abs(dy) > 6) st.moved = true;
    if (st.mode === "pan") {
      setView(bound({ s: st.base.s, x: st.base.x + dx, y: st.base.y + dy }));
    } else if (st.mode === "pending" && Math.abs(dx) + Math.abs(dy) > 8) {
      st.mode = Math.abs(dy) > Math.abs(dx) * 1.2 ? "drag" : "swipe";
    }
    if (st.mode === "drag") setDragY(dy);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    lastTouchEnd.current = Date.now();
    const st = g.current;
    if (st.mode === "pinch") {
      if (e.touches.length >= 2) return;
      setTouching(false);
      setPinching(false);
      setView((v) => {
        if (v.s < 1.05) {
          locked.current = false;
          return IDENTITY;
        }
        if (PINCH_SPRINGS_BACK && !locked.current) return IDENTITY;
        locked.current = true;
        return bound(v);
      });
      if (e.touches.length === 1) {
        // Ficou um dedo: continua a arrastar a foto.
        const t = e.touches[0];
        st.mode = "pan";
        st.x0 = t.clientX;
        st.y0 = t.clientY;
        st.base = viewRef.current;
      } else st.mode = "none";
      return;
    }
    if (e.touches.length > 0) return;
    setTouching(false);

    if (st.mode === "drag") {
      st.mode = "none";
      setDragY((d) => {
        if (Math.abs(d) > CLOSE_DISTANCE) {
          closeWithSlide(d > 0 ? 1 : -1);
          return d;
        }
        return 0;
      });
      return;
    }

    // Duplo toque → aproxima no ponto tocado / afasta.
    const t = e.changedTouches[0];
    if (!st.moved && t) {
      const now = Date.now();
      const lt = lastTap.current;
      if (now - lt.t < 300 && Math.hypot(t.clientX - lt.x, t.clientY - lt.y) < 40) {
        lastTap.current = { t: 0, x: 0, y: 0 };
        if (viewRef.current.s > 1.01) reset();
        else {
          locked.current = true;
          setView(bound(zoomAt(t.clientX, t.clientY, DOUBLE_TAP_SCALE, IDENTITY)));
        }
      } else lastTap.current = { t: now, x: t.clientX, y: t.clientY };
    }
    st.mode = "none";
  };

  const onTouchCancel = () => {
    setTouching(false);
    setPinching(false);
    setDragY(0);
    g.current.mode = "none";
  };

  // ── rato (computador) ────────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    const s = clamp(viewRef.current.s * Math.exp(-e.deltaY * 0.0025), 1, MAX_SCALE);
    locked.current = s > 1.01;
    setView(bound(zoomAt(e.clientX, e.clientY, s, viewRef.current)));
  };
  const onMouseDown = (e: React.MouseEvent) => {
    if (!zoomed) return;
    mouse.current = { x: e.clientX, y: e.clientY, base: viewRef.current };
    setTouching(true);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const m = mouse.current;
    if (!m) return;
    setView(bound({ s: m.base.s, x: m.base.x + e.clientX - m.x, y: m.base.y + e.clientY - m.y }));
  };
  const endMouse = () => {
    if (mouse.current) {
      mouse.current = null;
      setTouching(false);
    }
  };

  if (total === 0) return null;
  const fade = clamp(1 - Math.abs(dragY) / 320, 0.25, 1);
  const chrome = zoomed || Math.abs(dragY) > 4 ? 0 : 1; // esconde os controlos ao ampliar/arrastar
  const smooth = touching ? "none" : "transform .22s cubic-bezier(.2,.8,.2,1)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-[70] select-none"
      style={{
        background: `rgba(0,0,0,${shown ? 0.97 * fade : 0})`,
        transition: touching ? "none" : "background .2s ease",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        ref={track}
        onScroll={onScroll}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endMouse}
        onMouseLeave={endMouse}
        className="flex h-full w-full snap-x snap-mandatory overflow-y-hidden overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          overflowX: zoomed || pinching ? "hidden" : "auto",
          touchAction: zoomed || pinching ? "none" : "pan-x",
          opacity: shown ? 1 : 0,
          transition: "opacity .18s ease",
        }}
      >
        {images.map((src, n) => (
          <div
            key={`${src}-${n}`}
            data-slide={n}
            className="flex h-full w-full shrink-0 snap-center snap-always items-center justify-center"
          >
            <img
              src={src}
              alt={alt ? `${alt} — ${n + 1}/${total}` : ""}
              loading={Math.abs(n - i) <= 1 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              className="max-h-full max-w-full object-contain"
              style={{
                transform:
                  n === i
                    ? `translate(${view.x}px, ${view.y + dragY}px) scale(${view.s})`
                    : undefined,
                transition: smooth,
                cursor: zoomed ? "grab" : "zoom-in",
                willChange: "transform",
              }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => {
                e.stopPropagation();
                // Em ecrã tátil o duplo toque já foi tratado; o "dblclick" sintetizado
                // a seguir não pode desfazê-lo.
                if (Date.now() - lastTouchEnd.current < 700) return;
                if (viewRef.current.s > 1.01) reset();
                else {
                  locked.current = true;
                  setView(bound(zoomAt(e.clientX, e.clientY, DOUBLE_TAP_SCALE, IDENTITY)));
                }
              }}
            />
          </div>
        ))}
      </div>

      {/* Controlos: somem quando ampliaste ou estás a arrastar. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-3"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 12px)",
          opacity: chrome * (shown ? 1 : 0),
          transition: "opacity .2s ease",
        }}
      >
        <span className="w-9" />
        {many ? (
          <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white">
            {i + 1}/{total}
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label={tr("closeAria")}
          className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full text-2xl leading-none text-white"
        >
          ✕
        </button>
      </div>

      {many && (
        <>
          <Dots
            count={total}
            index={i}
            dark
            className="absolute inset-x-0"
            style={{
              bottom: "max(env(safe-area-inset-bottom), 18px)",
              opacity: chrome,
              transition: "opacity .2s ease",
            }}
          />
          {i > 0 && (
            <button
              type="button"
              aria-label="‹"
              onClick={(e) => {
                e.stopPropagation();
                goTo(i - 1);
              }}
              className="absolute left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-xl text-black shadow md:grid"
              style={{ opacity: chrome }}
            >
              ‹
            </button>
          )}
          {i < total - 1 && (
            <button
              type="button"
              aria-label="›"
              onClick={(e) => {
                e.stopPropagation();
                goTo(i + 1);
              }}
              className="absolute right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-xl text-black shadow md:grid"
              style={{ opacity: chrome }}
            >
              ›
            </button>
          )}
        </>
      )}
    </div>
  );
}

// Pontinhos "à Instagram": no máximo 5 visíveis; os das pontas encolhem quando há mais.
export function Dots({
  count,
  index,
  dark = false,
  className = "",
  style,
}: {
  count: number;
  index: number;
  /** true = sobre fundo preto (pontos brancos); false = sobre a página. */
  dark?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const WINDOW = 5;
  const w0 = count <= WINDOW ? 0 : clamp(index - 2, 0, count - WINDOW);
  const on = dark ? "#fff" : "var(--color-primary, #e8590c)";
  const off = dark ? "rgba(255,255,255,.4)" : "rgba(120,120,120,.4)";
  return (
    <div
      className={`pointer-events-none flex items-center justify-center ${className}`}
      style={style}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, k) => {
        const inWin = count <= WINDOW || (k >= w0 && k < w0 + WINDOW);
        const edge =
          count > WINDOW &&
          ((k === w0 && w0 > 0) || (k === w0 + WINDOW - 1 && w0 + WINDOW < count));
        const size = !inWin ? 0 : edge ? 4 : 6;
        return (
          <span
            key={k}
            className="rounded-full"
            style={{
              width: size,
              height: size,
              margin: inWin ? "0 2.5px" : 0,
              background: k === index ? on : off,
              transition: "all .2s ease",
            }}
          />
        );
      })}
    </div>
  );
}
