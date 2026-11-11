// ============================================================
// SPOTTER — Texto da notificação quando um negócio publica
// ------------------------------------------------------------
// Função pura (sem Deno nem rede), testada em tests/event-notify.test.mjs.
// Exemplo: título "Hotel Bom Gosto publicou uma foto", corpo "Feira de Artesanato".
// ============================================================
export interface EventForNotify {
  business_name: string;
  title: string;
  photo_count: number;
}

const clip = (s: string, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
};

export function buildEventNotification(e: EventForNotify): { title: string; body: string } {
  const who = clip(e.business_name || "Um negócio", 50);
  const n = Math.max(1, Math.floor(Number(e.photo_count) || 1));
  const what = n > 1 ? `publicou ${n} fotos` : "publicou uma foto";
  return { title: `${who} ${what}`, body: clip(e.title, 120) };
}
