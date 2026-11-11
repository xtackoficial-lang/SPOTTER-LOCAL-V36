import { useLocation } from "@tanstack/react-router";
import { GlassTabBar } from "@/components/GlassTabBar";
import { useT } from "@/lib/i18n";

const tabs = [
  { to: "/home", key: "discover", icon: "compass" },
  { to: "/search", key: "search", icon: "search" },
  { to: "/qr", key: "qr", icon: "qr" },
  { to: "/chats", key: "chat", icon: "chat" },
  { to: "/profile", key: "profile", icon: "user" },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  const tr = useT();
  const items = tabs.map((t) => ({
    to: t.to,
    icon: t.icon,
    label: t.key === "qr" ? "QR Scan" : tr(t.key),
  }));
  return <GlassTabBar tabs={items} activeIndex={tabs.findIndex((t) => pathname === t.to)} />;
}
