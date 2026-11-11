// ============================================================
// Barra de separadores em vidro "líquido" (estilo iOS)
// ------------------------------------------------------------
// - Uma pastilha de vidro desliza com mola entre os separadores.
// - Ao tocar, a pastilha cresce um pouco (como a lente do iOS).
// - Dá para pousar o dedo e ARRASTAR pela barra: a pastilha segue o
//   dedo, com reflexo, e ao soltar abre o separador onde parou.
// - Um toque simples continua a ser uma ligação normal (Link).
// - "Reduzir movimento" do sistema desliga as animações.
// ============================================================
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { prefersReducedMotion, Spring, SPRINGS } from "@/lib/spring";

export type GlassTab = { to: string; label: string; icon: string };

const PAD = 5; // quanto a lente passa para fora da célula
const DRAG_THRESHOLD = 8; // px antes de contar como arrasto

// Cada página monta a sua própria barra: guardo a última posição/velocidade da
// lente para a nova barra continuar o movimento (em vez de "saltar").
const memory: { key: string; x: number; v: number; cell: number } = {
  key: "",
  x: 0,
  v: 0,
  cell: 0,
};

export function GlassTabBar({
  tabs,
  activeIndex,
}: {
  tabs: readonly GlassTab[];
  activeIndex: number;
}) {
  const navigate = useNavigate();
  const rowRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pressed, setPressed] = useState(false);
  const [dragX, setDragX] = useState<number | null>(null); // centro da pastilha em px
  const [visual, setVisual] = useState(activeIndex); // separador "aceso"
  const gesture = useRef<{ id: number; startX: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const lensRef = useRef<HTMLSpanElement>(null);
  const sx = useRef(new Spring(0, SPRINGS.lens)); // posição
  const sc = useRef(new Spring(1, SPRINGS.scale)); // escala
  const raf = useRef(0);
  const started = useRef(false);

  const n = tabs.length;
  const cell = width / n;

  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A rota mudou (toque, botão voltar…): a pastilha vai para o separador certo.
  useEffect(() => {
    if (gesture.current === null) setVisual(activeIndex);
  }, [activeIndex]);

  const indexAt = useCallback(
    (clientX: number) => {
      const r = rowRef.current?.getBoundingClientRect();
      if (!r || cell === 0) return visual;
      return Math.max(0, Math.min(n - 1, Math.floor((clientX - r.left) / cell)));
    },
    [cell, n, visual],
  );

  const tick = () => {
    try {
      navigator.vibrate?.(6);
    } catch {
      /* sem vibração */
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    gesture.current = { id: e.pointerId, startX: e.clientX, moved: false };
    setPressed(true);
    suppressClick.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (!g.moved && Math.abs(e.clientX - g.startX) > DRAG_THRESHOLD) {
      g.moved = true;
      try {
        rowRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* ignorar */
      }
    }
    if (g.moved) {
      const r = rowRef.current!.getBoundingClientRect();
      const x = Math.max(cell / 2, Math.min(width - cell / 2, e.clientX - r.left));
      setDragX(x);
      const idx = indexAt(e.clientX);
      if (idx !== visual) {
        setVisual(idx);
        tick();
      }
    }
  };

  const end = (e: React.PointerEvent, cancelled = false) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    setPressed(false);
    if (g.moved) {
      suppressClick.current = true;
      setDragX(null);
      const idx = cancelled ? activeIndex : indexAt(e.clientX);
      setVisual(idx);
      if (!cancelled && idx !== activeIndex) navigate({ to: tabs[idx].to, replace: true });
    }
  };

  const dragging = dragX !== null;
  const hasPill = visual >= 0 && width > 0;
  const pillX = dragging ? dragX - cell / 2 : Math.max(0, visual) * cell;
  const targetScale = dragging ? 1.12 : pressed ? 1.07 : 1;

  // Pinta a lente: posição + escala vêm das molas; a velocidade estica/achata
  // a lente (como uma gota de líquido a deslizar).
  const paint = useCallback(() => {
    const el = lensRef.current;
    if (!el) return;
    const v = sx.current.v;
    const stretch = Math.min(Math.abs(v) / 3200, 0.22);
    const scaleX = sc.current.x * (1 + stretch);
    const scaleY = sc.current.x * (1 - stretch * 0.55);
    el.style.transform = `translate3d(${sx.current.x}px,0,0) scale(${scaleX},${scaleY})`;
    memory.x = sx.current.x;
    memory.v = sx.current.v;
  }, []);

  const run = useCallback(() => {
    if (raf.current) return;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const a = sx.current.step(dt);
      const b = sc.current.step(dt);
      paint();
      raf.current = a || b ? requestAnimationFrame(loop) : 0;
    };
    raf.current = requestAnimationFrame(loop);
  }, [paint]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  useLayoutEffect(() => {
    if (!hasPill) return;
    sx.current.cfg = dragging ? SPRINGS.follow : SPRINGS.lens;
    sx.current.target = pillX;
    sc.current.target = targetScale;
    const key = tabs.map((t) => t.to).join("|");
    if (!started.current) {
      started.current = true;
      sc.current.jump(targetScale);
      if (memory.key === key && memory.cell === cell && !prefersReducedMotion()) {
        // continua de onde a barra da página anterior ficou (com a mesma velocidade)
        sx.current.x = memory.x;
        sx.current.v = memory.v;
      } else {
        sx.current.jump(pillX);
      }
      memory.key = key;
      memory.cell = cell;
    }
    if (prefersReducedMotion()) {
      sx.current.jump(pillX);
      sc.current.jump(targetScale);
      paint();
      return;
    }
    paint();
    run();
  }, [hasPill, pillX, dragging, targetScale, paint, run, tabs, cell]);

  return (
    <>
      {/* Espaço no fim da página para a barra flutuante não tapar o conteúdo */}
      <div aria-hidden className="h-[92px] shrink-0" />
      <nav className="pointer-events-none sticky bottom-0 z-20 h-0">
        <div className="glass-float pointer-events-auto absolute bottom-[max(env(safe-area-inset-bottom),0.875rem)] left-3.5 right-3.5 mx-auto h-[66px] max-w-md px-1.5 md:max-w-xl">
          <div
            ref={rowRef}
            className="relative grid h-full touch-pan-y select-none"
            style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => end(e)}
            onPointerCancel={(e) => end(e, true)}
            onClickCapture={(e) => {
              if (suppressClick.current) {
                e.preventDefault();
                e.stopPropagation();
                suppressClick.current = false;
              }
            }}
          >
            {hasPill && (
              <span
                aria-hidden
                ref={lensRef}
                className={`glass-lens pointer-events-none absolute -bottom-2 -top-2 rounded-[40px] ${
                  dragging ? "is-dragging" : ""
                }`}
                style={{ left: -PAD, width: cell + PAD * 2 }}
              />
            )}
            {tabs.map((t, i) => {
              const lit = i === visual;
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  replace
                  draggable={false}
                  className={`relative z-10 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors duration-300 ${
                    lit ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Icon
                    name={t.icon}
                    size={22}
                    className={`glass-tab-icon ${lit ? "is-lit" : ""}`}
                  />
                  <span className="tracking-wide">{t.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
