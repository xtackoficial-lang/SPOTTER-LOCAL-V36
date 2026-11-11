// Rate limiting para Edge Functions (janela fixa, guardada no Postgres).
// Usa a função SQL check_rate_limit (migração 021). Se a base de dados falhar,
// o pedido PASSA (fail-open): é preferível não bloquear utilizadores reais por
// uma falha do limitador; o erro fica no log.
export type LimitResult = { allowed: boolean; remaining: number; retryAfter: number };

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

export async function rateLimit(
  sb: RpcClient,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<LimitResult> {
  try {
    const { data, error } = await sb.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed: boolean; remaining: number; retry_after: number }
      | undefined;
    if (!row) throw new Error("resposta vazia");
    return { allowed: !!row.allowed, remaining: row.remaining ?? 0, retryAfter: row.retry_after ?? 0 };
  } catch (e) {
    console.error("rate-limit: falha ao verificar (pedido deixado passar)", e);
    return { allowed: true, remaining: limit, retryAfter: 0 };
  }
}

/** Resposta 429 em português, com o cabeçalho Retry-After (segundos). */
export function tooManyRequests(retryAfter: number, headers: Record<string, string> = {}): Response {
  const secs = Math.max(1, Math.ceil(retryAfter));
  const wait = secs >= 120 ? `${Math.ceil(secs / 60)} minutos` : `${secs} segundos`;
  return new Response(
    JSON.stringify({ error: `Fizeste demasiados pedidos. Tenta de novo daqui a ${wait}.`, code: "rate_limited", retryAfter: secs }),
    { status: 429, headers: { ...headers, "Content-Type": "application/json", "Retry-After": String(secs) } },
  );
}

/** IP do pedido (para rotas sem sessão). */
export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ??
    "unknown"
  ) || "unknown";
}

/** Limites por função (pedidos / janela). Ajusta aqui num só sítio. */
export const LIMITS = {
  r2Put: { limit: 60, window: 60 },          // 60 envios de foto/min (lote de 26 cabe)
  r2Delete: { limit: 60, window: 60 },
  payment: { limit: 10, window: 600 },       // 10 pedidos de pagamento / 10 min
  deleteAccount: { limit: 3, window: 3600 }, // 3 / hora
  reservationRespond: { limit: 30, window: 60 },
  merchantPromo: { limit: 10, window: 3600 },// 10 promoções / hora
  translate: { limit: 40, window: 60 },      // 40 traduções / minuto por utilizador
} as const;
