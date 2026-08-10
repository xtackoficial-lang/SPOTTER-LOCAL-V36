// ============================================================
// XTACK SPOTTER — Cupões com código (v18)
// O comerciante cria cupões com código alfanumérico,
// desconto em % ou valor fixo, validade e limite de usos.
// O cliente insere o código no carrinho → valida → desconto.
// ============================================================
import { supabase, SUPABASE_CONFIGURED } from "./supabase";

export type DiscountType = "percent" | "fixed"; // % ou MZN fixo

export interface Coupon {
  id: string;
  businessId: string;
  code: string; // ex: "VERAO25"
  description?: string;
  discountType: DiscountType;
  discountValue: number; // 25 = 25% ou 25 MZN
  minOrderValue?: number; // mínimo de pedido para activar
  maxUses?: number; // null = ilimitado
  usedCount: number;
  expiresAt?: string; // ISO date
  active: boolean;
  createdAt: string;
}

// Formato real da tabela "coupons" no Supabase — colunas em
// snake_case, como o resto do projecto. BUG CORRIGIDO (2026-07-07): o
// código anterior enviava o objecto Coupon directamente em camelCase
// (businessId, discountType, minOrderValue...) para insert()/select(),
// o que nunca bate certo com colunas snake_case — o INSERT falhava
// sempre e caía silenciosamente no fallback local, por isso nenhum
// cupão criado por um comerciante chegava a existir no Supabase.
interface CouponRow {
  id: string;
  business_id: string;
  code: string;
  description?: string | null;
  discount_type: DiscountType;
  discount_value: number;
  min_order_value?: number | null;
  max_uses?: number | null;
  used_count: number;
  expires_at?: string | null;
  active: boolean;
  created_at: string;
}

function toRow(coupon: Coupon): CouponRow {
  return {
    id: coupon.id,
    business_id: coupon.businessId,
    code: coupon.code,
    description: coupon.description ?? null,
    discount_type: coupon.discountType,
    discount_value: coupon.discountValue,
    min_order_value: coupon.minOrderValue ?? null,
    max_uses: coupon.maxUses ?? null,
    used_count: coupon.usedCount,
    expires_at: coupon.expiresAt ?? null,
    active: coupon.active,
    created_at: coupon.createdAt,
  };
}

function fromRow(row: CouponRow): Coupon {
  return {
    id: row.id,
    businessId: row.business_id,
    code: row.code,
    description: row.description ?? undefined,
    discountType: row.discount_type,
    discountValue: row.discount_value,
    minOrderValue: row.min_order_value ?? undefined,
    maxUses: row.max_uses ?? undefined,
    usedCount: row.used_count,
    expiresAt: row.expires_at ?? undefined,
    active: row.active,
    createdAt: row.created_at,
  };
}

const LOCAL_KEY = "xlocal.coupons.v1";
function localRead(): Coupon[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}
function localWrite(c: Coupon[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(c));
  } catch {
    /* falha silenciosa — ignorar erro de storage/sync */
  }
}

// ── Criar cupão (pelo comerciante) ───────────────────────
export async function createCoupon(
  coupon: Omit<Coupon, "id" | "usedCount" | "createdAt">,
): Promise<Coupon> {
  const newCoupon: Coupon = {
    ...coupon,
    id: crypto.randomUUID(),
    usedCount: 0,
    createdAt: new Date().toISOString(),
  };
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from("coupons")
        .insert(toRow(newCoupon))
        .select()
        .single();
      if (!error && data) return fromRow(data as CouponRow);
      if (error) console.warn("createCoupon: erro do Supabase, a guardar localmente.", error);
    } catch {
      /* falha silenciosa — ignorar erro de storage/sync */
    }
  }
  const list = localRead();
  list.push(newCoupon);
  localWrite(list);
  return newCoupon;
}

// ── Validar código ────────────────────────────────────────
export interface CouponValidation {
  valid: boolean;
  coupon?: Coupon;
  error?: string;
  discountAmount?: number; // MZN calculado
}

export function validateCoupon(coupon: Coupon, orderTotal: number): CouponValidation {
  if (!coupon.active) return { valid: false, error: "Cupão inactivo." };
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date())
    return { valid: false, error: "Cupão expirado." };
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses)
    return { valid: false, error: "Cupão esgotado." };
  if (coupon.minOrderValue && orderTotal < coupon.minOrderValue)
    return {
      valid: false,
      error: `Pedido mínimo de ${coupon.minOrderValue} MZN para usar este cupão.`,
    };
  const discountAmount =
    coupon.discountType === "percent"
      ? Math.round((orderTotal * coupon.discountValue) / 100)
      : coupon.discountValue;
  return { valid: true, coupon, discountAmount };
}

// ── Buscar cupão por código + negócio ────────────────────
export async function fetchCouponByCode(businessId: string, code: string): Promise<Coupon | null> {
  const normalised = code.trim().toUpperCase();
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data } = await supabase
        .from("coupons")
        .select("*")
        .eq("business_id", businessId)
        .ilike("code", normalised)
        .single();
      if (data) return fromRow(data as CouponRow);
    } catch {
      /* falha silenciosa — ignorar erro de storage/sync */
    }
  }
  return (
    localRead().find((c) => c.businessId === businessId && c.code.toUpperCase() === normalised) ??
    null
  );
}

// ── Buscar todos os cupões de um negócio ─────────────────
export async function fetchBusinessCoupons(businessId: string): Promise<Coupon[]> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data } = await supabase
        .from("coupons")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (data) return (data as CouponRow[]).map(fromRow);
    } catch {
      /* falha silenciosa — ignorar erro de storage/sync */
    }
  }
  return localRead().filter((c) => c.businessId === businessId);
}

// ── Marcar cupão como usado ───────────────────────────────
// Usa a função RPC increment_coupon_use (ver SUPABASE_SETUP.sql) para
// incrementar de forma atómica — sem isto (SELECT + UPDATE separados),
// dois clientes a usar o mesmo cupão ao mesmo tempo podiam ambos ler
// usedCount antes do outro gravar, perdendo um dos incrementos.
export async function incrementCouponUse(couponId: string): Promise<void> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { error } = await supabase.rpc("increment_coupon_use", { coupon_id: couponId });
      if (!error) return;
      console.warn("incrementCouponUse: erro do Supabase.", error);
    } catch {
      /* falha silenciosa — ignorar erro de storage/sync */
    }
  }
  const list = localRead();
  const idx = list.findIndex((c) => c.id === couponId);
  if (idx !== -1) list[idx].usedCount += 1;
  localWrite(list);
}
