// ============================================================
// Mola física (estilo Apple) — não é curva de tempo
// ------------------------------------------------------------
// Resolve F = -k·(x - alvo) - c·v com integração por passos pequenos.
// Se o alvo muda a meio (ex.: largas o dedo), a VELOCIDADE actual é
// mantida, por isso o movimento continua com inércia em vez de
// recomeçar — é isto que dá a sensação "física" do iOS.
// ============================================================
export type SpringConfig = { stiffness: number; damping: number; mass?: number };

export const SPRINGS = {
  /** posição da lente quando assenta */
  lens: { stiffness: 380, damping: 28 },
  /** lente colada ao dedo durante o arrasto (rígida, quase sem atraso) */
  follow: { stiffness: 1100, damping: 58 },
  /** escala (crescer ao tocar) */
  scale: { stiffness: 320, damping: 19 },
} as const satisfies Record<string, SpringConfig>;

export class Spring {
  x: number;
  v = 0;
  target: number;
  constructor(
    initial: number,
    public cfg: SpringConfig,
  ) {
    this.x = initial;
    this.target = initial;
  }
  /** avança `dt` segundos; devolve true enquanto ainda se mexe */
  step(dt: number): boolean {
    const m = this.cfg.mass ?? 1;
    const h = 1 / 240; // sub-passos estáveis
    let left = Math.min(dt, 1 / 20);
    while (left > 0) {
      const d = Math.min(h, left);
      const a = (-this.cfg.stiffness * (this.x - this.target) - this.cfg.damping * this.v) / m;
      this.v += a * d;
      this.x += this.v * d;
      left -= d;
    }
    const moving = Math.abs(this.x - this.target) > 0.05 || Math.abs(this.v) > 0.5;
    if (!moving) {
      this.x = this.target;
      this.v = 0;
    }
    return moving;
  }
  jump(x: number) {
    this.x = x;
    this.target = x;
    this.v = 0;
  }
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
