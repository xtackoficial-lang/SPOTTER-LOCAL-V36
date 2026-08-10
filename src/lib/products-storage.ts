// Produtos do Comerciante — CRUD local com sincronização Supabase (best-effort)
import { useEffect, useState } from "react";
import {
  upsertProduct,
  deleteProduct as deleteProductRemote,
  fetchProducts,
  type ProductDB,
} from "./businesses-db";

export interface Product {
  id: string;
  businessId: string;
  name: string;
  description: string;
  price: number;
  currency: "MZN";
  category: string;
  imageUrl?: string;
  available: boolean;
  createdAt: string;
  updatedAt: string;
}

const KEY = "xlocal.products.v1";

function read(): Product[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function write(data: Product[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignorado: falha de quota/acesso ao localStorage */
  }
}

// Envia o produto para o Supabase em segundo plano. Nunca lança e nunca
// bloqueia a UI — o localStorage já é a fonte de verdade imediata; isto
// é só para o produto aparecer também na tabela "products" do Supabase
// e ficar visível a outros dispositivos / ao painel admin.
function syncProductRemote(p: Product) {
  upsertProduct({
    id: p.id,
    business_id: p.businessId,
    name: p.name,
    description: p.description,
    price: p.price,
    currency: p.currency,
    category: p.category,
    image_url: p.imageUrl,
    available: p.available,
  }).catch((err) => console.warn("syncProductRemote: falha ao sincronizar produto.", err));
}

function productDBToLocal(p: ProductDB): Product {
  return {
    id: p.id,
    businessId: p.business_id,
    name: p.name,
    description: p.description,
    price: p.price,
    currency: (p.currency as "MZN") || "MZN",
    category: p.category,
    imageUrl: p.image_url,
    available: p.available,
    createdAt: p.created_at,
    updatedAt: p.updated_at ?? p.created_at,
  };
}

export function useProducts(businessId: string) {
  const [products, setProducts] = useState<Product[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProducts(read().filter((p) => p.businessId === businessId));
    setHydrated(true);

    // Busca produtos remotos e mescla com os locais — sem isto, um
    // produto criado/editado noutro dispositivo (ou no painel admin)
    // nunca aparecia aqui, mesmo já estando guardado no Supabase, porque
    // este hook só lia do localStorage deste dispositivo. Compara
    // updated_at para decidir qual versão é a mais recente quando o
    // mesmo id existe nos dois lados.
    fetchProducts(businessId)
      .then((remote) => {
        if (cancelled || remote.length === 0) return;
        const all = read();
        const byId = new Map(all.map((p) => [p.id, p]));
        let changed = false;
        for (const r of remote) {
          const local = byId.get(r.id);
          const converted = productDBToLocal(r);
          if (!local || new Date(converted.updatedAt) > new Date(local.updatedAt)) {
            byId.set(r.id, converted);
            changed = true;
          }
        }
        if (!changed) return;
        const merged = [...byId.values()];
        write(merged);
        if (!cancelled) setProducts(merged.filter((p) => p.businessId === businessId));
      })
      .catch((err) => console.warn("useProducts: falha ao sincronizar produtos remotos.", err));

    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const sync = (all: Product[]) => {
    write(all);
    setProducts(all.filter((p) => p.businessId === businessId));
  };

  const add = (data: Omit<Product, "id" | "businessId" | "createdAt" | "updatedAt">) => {
    const all = read();
    const now = new Date().toISOString();
    const product: Product = {
      ...data,
      id: crypto.randomUUID(),
      businessId,
      createdAt: now,
      updatedAt: now,
    };
    sync([...all, product]);
    syncProductRemote(product);
    return product;
  };

  const update = (id: string, patch: Partial<Product>) => {
    let updated: Product | undefined;
    const all = read().map((p) => {
      if (p.id !== id) return p;
      updated = { ...p, ...patch, updatedAt: new Date().toISOString() };
      return updated;
    });
    sync(all);
    if (updated) syncProductRemote(updated);
  };

  const remove = (id: string) => {
    sync(read().filter((p) => p.id !== id));
    deleteProductRemote(id).catch((err) =>
      console.warn("remove: falha ao remover produto remoto.", err),
    );
  };

  const toggle = (id: string) => {
    let updated: Product | undefined;
    const all = read().map((p) => {
      if (p.id !== id) return p;
      updated = { ...p, available: !p.available, updatedAt: new Date().toISOString() };
      return updated;
    });
    sync(all);
    if (updated) syncProductRemote(updated);
  };

  return { products, hydrated, add, update, remove, toggle };
}
