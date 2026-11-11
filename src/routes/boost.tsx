// ============================================================
// SPOTTER — /boost (Turbinar) foi retirado
// ------------------------------------------------------------
// O Turbinar deixou de ser vendido na app. Quem abrir um link antigo
// para /boost é levado para o painel. Os destaques que já estavam
// pagos continuam a aparecer até acabarem (home.tsx e search.tsx).
// ============================================================
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/boost")({
  beforeLoad: () => {
    throw redirect({ to: "/business" });
  },
});
