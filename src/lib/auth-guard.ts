// ============================================================
// SPOTTER LOCAL — Limite de tentativas (login / recuperação) — v41
// ------------------------------------------------------------
// Regras: login = 3 erros → bloqueio 30 min (dobra se continuar, até 24 h);
//         recuperação = 6 pedidos → bloqueio 30 min (mesma subida).
// Duas camadas:
//   1. SERVIDOR (migração 015: auth_guard_*) — vale em qualquer dispositivo.
//   2. LOCAL (localStorage) — trava já neste aparelho, mesmo sem a migração
//      ou sem rede.
// Se o servidor não responder ou a migração ainda não foi corrida, a camada
// do servidor é ignorada (a app nunca fica inutilizável por causa disto).
// ============================================================
import { supabase, SUPABASE_CONFIGURED } from "./supabase";

export type GuardKind = "login" | "recover";
export interface GuardState {
  locked: boolean;
  retryAfterSec: number;
  remaining: number;
}

export const GUARD_LIMITS: Record<GuardKind, number> = { login: 3, recover: 6 };
const BASE_LOCK_MIN = 30;
const MAX_LOCK_MIN = 1440;
const RESET_AFTER_MS = 24 * 60 * 60 * 1000;
const KEY = "xlocal.guard.v1";

interface LocalEntry {
  count: number;
  level: number;
  until: number; // ms epoch
  last: number;
}

function readAll(): Record<string, LocalEntry> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}
function writeAll(v: Record<string, LocalEntry>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* sem localStorage: ignora */
  }
}
const k = (kind: GuardKind, email: string) => `${kind}:${email.trim().toLowerCase()}`;

function localState(kind: GuardKind, email: string): GuardState {
  const lim = GUARD_LIMITS[kind];
  const e = readAll()[k(kind, email)];
  const now = Date.now();
  if (!e) return { locked: false, retryAfterSec: 0, remaining: lim };
  if (e.until > now) {
    return { locked: true, retryAfterSec: Math.ceil((e.until - now) / 1000), remaining: 0 };
  }
  if (now - e.last > RESET_AFTER_MS) return { locked: false, retryAfterSec: 0, remaining: lim };
  return { locked: false, retryAfterSec: 0, remaining: Math.max(lim - e.count, 0) };
}

function localFail(kind: GuardKind, email: string): GuardState {
  const lim = GUARD_LIMITS[kind];
  const all = readAll();
  const key = k(kind, email);
  const now = Date.now();
  let e = all[key] ?? { count: 0, level: 0, until: 0, last: now };
  if (e.until > now) return localState(kind, email);
  if (now - e.last > RESET_AFTER_MS) e = { count: 0, level: 0, until: 0, last: now };
  e.count += 1;
  e.last = now;
  if (e.count >= lim) {
    e.level += 1;
    const mins = Math.min(BASE_LOCK_MIN * 2 ** (e.level - 1), MAX_LOCK_MIN);
    e.count = 0;
    e.until = now + mins * 60_000;
  }
  all[key] = e;
  writeAll(all);
  return localState(kind, email);
}

function localClear(kind: GuardKind, email: string) {
  const all = readAll();
  delete all[k(kind, email)];
  writeAll(all);
}

// ---------- servidor (RPC) ----------
let serverDisabled = false; // migração 015 em falta → deixa de tentar nesta sessão

async function rpc(fn: string, kind: GuardKind, email: string): Promise<GuardState | null> {
  if (serverDisabled || !SUPABASE_CONFIGURED || !supabase) return null;
  try {
    const call = supabase.rpc(fn, { p_kind: kind, p_ident: email.trim().toLowerCase() });
    const res = await Promise.race([
      call,
      new Promise<null>((r) => setTimeout(() => r(null), 5000)),
    ]);
    if (!res) return null;
    const { data, error } = res as {
      data: unknown;
      error: { code?: string; message?: string } | null;
    };
    if (error) {
      // função inexistente (migração por correr) → não insistir
      if (
        error.code === "PGRST202" ||
        error.code === "42883" ||
        /could not find the function/i.test(error.message ?? "")
      ) {
        serverDisabled = true;
      }
      return null;
    }
    const d = data as { locked?: boolean; retry_after?: number; remaining?: number } | null;
    if (!d || typeof d !== "object") return null;
    return {
      locked: !!d.locked,
      retryAfterSec: Number(d.retry_after ?? 0),
      remaining: Number(d.remaining ?? GUARD_LIMITS[kind]),
    };
  } catch {
    return null;
  }
}

function merge(a: GuardState, b: GuardState | null): GuardState {
  if (!b) return a;
  return {
    locked: a.locked || b.locked,
    retryAfterSec: Math.max(a.retryAfterSec, b.retryAfterSec),
    remaining: Math.min(a.remaining, b.remaining),
  };
}

/** Consulta o estado SEM contar uma tentativa. */
export async function checkGuard(kind: GuardKind, email: string): Promise<GuardState> {
  return merge(localState(kind, email), await rpc("auth_guard_check", kind, email));
}

/** Conta uma tentativa falhada (login) ou um pedido feito (recover). */
export async function recordGuardFailure(kind: GuardKind, email: string): Promise<GuardState> {
  const local = localFail(kind, email);
  return merge(local, await rpc("auth_guard_fail", kind, email));
}

/** Login certo: limpa o contador. */
export async function recordGuardSuccess(kind: GuardKind, email: string): Promise<void> {
  localClear(kind, email);
  if (serverDisabled || !SUPABASE_CONFIGURED || !supabase) return;
  try {
    await supabase.rpc("auth_guard_ok", { p_kind: kind, p_ident: email.trim().toLowerCase() });
  } catch {
    /* ignorado */
  }
}

export function formatWait(sec: number): string {
  const m = Math.max(Math.ceil(sec / 60), 1);
  if (m < 60) return `${m} minuto${m === 1 ? "" : "s"}`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} hora${h === 1 ? "" : "s"}`;
}

export function lockMessage(kind: GuardKind, sec: number): string {
  return kind === "login"
    ? `Demasiadas tentativas erradas. Por segurança, espera ${formatWait(sec)} antes de tentar outra vez.`
    : `Já pediste a recuperação muitas vezes. Por segurança, espera ${formatWait(sec)} antes de pedir de novo.`;
}
