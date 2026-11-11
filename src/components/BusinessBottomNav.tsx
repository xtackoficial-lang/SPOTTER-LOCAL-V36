// ============================================================
// SPOTTER — Menu inferior do comerciante
// ------------------------------------------------------------
// Variante do BottomNav para as páginas do painel comercial
// (/business, /merchant, /products, /business-inbox, /qr-business,
// /analytics). Substitui "Início"/"Pesquisa" (que tiram o comerciante
// do contexto comercial) por um atalho directo a "Painel", mantendo
// Mensagens e Perfil — que continuam a fazer sentido em ambos os
// contextos, já que é a mesma conta.
// ============================================================
import { useLocation } from "@tanstack/react-router";
import { GlassTabBar } from "@/components/GlassTabBar";
import { useT } from "@/lib/i18n";

const tabs = [
  { to: "/business", key: "panel", icon: "chart" },
  { to: "/products", key: "products", icon: "tag" },
  { to: "/business-inbox", key: "chat", icon: "chat" },
  { to: "/profile", key: "profile", icon: "user" },
] as const;

export function BusinessBottomNav() {
  const { pathname } = useLocation();
  const tr = useT();
  const items = tabs.map((t) => ({ to: t.to, icon: t.icon, label: tr(t.key) }));
  return <GlassTabBar tabs={items} activeIndex={tabs.findIndex((t) => pathname === t.to)} />;
}
