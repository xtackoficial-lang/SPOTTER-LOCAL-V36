// ============================================================
// XTACK SPOTTER — Pedidos dentro do chat (v18)
// Fluxo: cliente selecciona itens do catálogo → envia pedido
// → comerciante aceita/recusa → histórico de ambos os lados.
// Usa Supabase quando disponível, cai para localStorage.
// ============================================================
import { supabase, SUPABASE_CONFIGURED } from "./supabase";

export type OrderStatus =
  | "pending" // enviado, aguarda resposta do comerciante
  | "accepted" // aceite pelo comerciante
  | "rejected" // recusado
  | "delivered" // entregue (marcado pelo comerciante)
  | "cancelled"; // cancelado pelo cliente

export interface OrderItem {
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number; // MZN
}

export interface Order {
  id: string;
  businessId: string;
  businessName: string;
  clientId: string; // userId ou "guest-<uuid>"
  items: OrderItem[];
  total: number; // MZN
  note?: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

// Formato real da tabela "orders" no Supabase — colunas em snake_case,
// como todas as outras tabelas do projecto (businesses, products, etc.).
// BUG CORRIGIDO (2026-07-07): o código anterior fazia
// `supabase.from("orders").insert(newOrder)` a enviar o objecto Order
// tal e qual, em camelCase (businessId, clientId, createdAt...). O
// Postgres cria colunas em snake_case por omissão, por isso o INSERT
// falhava sempre (coluna "businessid" ou "businessId" inexistente),
// caía silenciosamente no catch, e a app parecia "funcionar" porque
// tinha fallback para localStorage — mas os pedidos nunca chegavam ao
// Supabase, e por isso nunca apareciam no dispositivo do comerciante.
interface OrderRow {
  id: string;
  business_id: string;
  business_name: string;
  client_id: string;
  items: OrderItem[];
  total: number;
  note?: string | null;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

function toRow(order: Order): OrderRow {
  return {
    id: order.id,
    business_id: order.businessId,
    business_name: order.businessName,
    client_id: order.clientId,
    items: order.items,
    total: order.total,
    note: order.note ?? null,
    status: order.status,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  };
}

function fromRow(row: OrderRow): Order {
  return {
    id: row.id,
    businessId: row.business_id,
    businessName: row.business_name,
    clientId: row.client_id,
    items: row.items ?? [],
    total: row.total,
    note: row.note ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const LOCAL_KEY = "xlocal.orders.v1";

function localRead(): Order[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}
function localWrite(orders: Order[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(orders));
  } catch {
    /* falha silenciosa — ignorar erro de storage/sync */
  }
}

// ── Criar pedido ──────────────────────────────────────────
export async function createOrder(
  order: Omit<Order, "id" | "createdAt" | "updatedAt">,
): Promise<Order> {
  const now = new Date().toISOString();
  const newOrder: Order = {
    ...order,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from("orders")
        .insert(toRow(newOrder))
        .select()
        .single();
      if (!error && data) return fromRow(data as OrderRow);
      if (error) console.warn("createOrder: erro do Supabase, a guardar localmente.", error);
    } catch (err) {
      console.warn("createOrder: Supabase indisponível, a guardar localmente.", err);
    }
  }
  const orders = localRead();
  orders.push(newOrder);
  localWrite(orders);
  return newOrder;
}

// ── Buscar pedidos de um cliente ──────────────────────────
export async function fetchClientOrders(clientId: string): Promise<Order[]> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (!error && data) return (data as OrderRow[]).map(fromRow);
    } catch {
      /* falha silenciosa — ignorar erro de storage/sync */
    }
  }
  return localRead()
    .filter((o) => o.clientId === clientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── Buscar pedidos de um negócio ──────────────────────────
export async function fetchBusinessOrders(businessId: string): Promise<Order[]> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (!error && data) return (data as OrderRow[]).map(fromRow);
    } catch {
      /* falha silenciosa — ignorar erro de storage/sync */
    }
  }
  return localRead()
    .filter((o) => o.businessId === businessId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── Actualizar status (pelo comerciante) ──────────────────
export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  const now = new Date().toISOString();
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status, updated_at: now })
        .eq("id", orderId);
      if (!error) return;
    } catch {
      /* falha silenciosa — ignorar erro de storage/sync */
    }
  }
  const orders = localRead();
  const idx = orders.findIndex((o) => o.id === orderId);
  if (idx !== -1) {
    orders[idx].status = status;
    orders[idx].updatedAt = now;
  }
  localWrite(orders);
}
