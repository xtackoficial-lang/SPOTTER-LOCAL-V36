// Navegação do painel do comerciante.
// Regra: o painel (business, merchant, products, business-inbox, qr-business,
// analytics, ...) ocupa UMA entrada no histórico. Entre páginas do painel usa-se
// `replace`, por isso o botão "voltar" do telemóvel sai do painel de uma vez,
// em vez de passar por cada página aberta, uma a uma.
type Nav = (opts: { to: string; replace?: boolean }) => unknown;

// Sai do painel: volta à página de onde o comerciante veio (início, perfil...).
// Se não houver histórico (abriu o painel directamente), vai ao início.
export function leavePanel(navigate: Nav) {
  const idx = (window.history.state as { __TSR_index?: number } | null)?.__TSR_index ?? 0;
  if (idx > 0) window.history.back();
  else navigate({ to: "/home", replace: true });
}
