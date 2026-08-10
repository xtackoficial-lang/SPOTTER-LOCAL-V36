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
import { Link, useLocation } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
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
  return (
    <nav className="sticky bottom-0 z-20 border-t border-border bg-card/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-center justify-around">
        {tabs.map((t) => {
          const active = pathname === t.to;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`relative flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] font-medium transition press ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {active && (
                <span
                  className="absolute -top-0.5 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full animate-pulse-ring-sm"
                  style={{ background: "var(--gradient-primary)" }}
                />
              )}
              <Icon
                name={t.icon}
                size={22}
                className={`transition-all duration-300 ${active ? "scale-110 drop-shadow-sm" : ""}`}
              />
              <span className="tracking-wide">{tr(t.key === "products" ? "products" : t.key)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
