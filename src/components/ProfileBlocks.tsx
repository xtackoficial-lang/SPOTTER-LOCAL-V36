// ============================================================
// XTACK SPOTTER — Renderizador de blocos do Perfil do Comerciante
// ============================================================
// Cada bloco aqui corresponde a um BlockId em profile-styles.ts.
// place.$id.tsx decide a ORDEM (block_order) e passa o ProfileTheme
// escolhido — este ficheiro só sabe desenhar cada peça com a cor/fundo
// certos, incluindo o cuidado de contraste do tema LED/Glow (texto
// sempre sobre uma camada escura sólida antes do brilho, nunca
// brilho-sobre-brilho).
// ============================================================
import { Icon } from "./Icon";
import { priceText, type Place } from "@/lib/places-data";
import type { ProductDB } from "@/lib/businesses-db";
import type { ProfileTheme } from "@/lib/profile-styles";
import { useT } from "@/lib/i18n";

export interface BlockContext {
  place: Place;
  theme: ProfileTheme;
  products: ProductDB[];
  fav: boolean;
  onBack: () => void;
  onToggleFavorite: () => void;
  onRoute: () => void;
  onCall: () => void;
  onWhatsapp: () => void;
  onProductClick: (p: ProductDB) => void;
}

function glowShadow(theme: ProfileTheme) {
  return theme.glow ? `0 0 18px ${theme.accentSoft}` : "none";
}

export function BlockCover({ ctx }: { ctx: BlockContext }) {
  const { place, theme, fav, onBack, onToggleFavorite } = ctx;
  return (
    <div className="relative h-64 w-full overflow-hidden" style={{ background: theme.card }}>
      <img src={place.cover} alt={place.name} className="h-full w-full object-cover" />
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(180deg, rgba(0,0,0,0.05) 0%, ${theme.bg}E6 92%)` }}
      />
      <div className="absolute left-4 top-12 right-4 flex justify-between">
        <button
          onClick={onBack}
          className="press grid h-10 w-10 place-items-center rounded-full backdrop-blur"
          style={{
            background: "rgba(20,18,16,0.55)",
            border: `1px solid ${theme.border}`,
            color: theme.text,
          }}
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <button
          onClick={onToggleFavorite}
          className="press grid h-10 w-10 place-items-center rounded-full backdrop-blur"
          style={{
            background: "rgba(20,18,16,0.55)",
            border: `1px solid ${theme.border}`,
            color: theme.text,
          }}
        >
          <Icon
            name="heart"
            size={18}
            className={fav ? "fill-rose-500 stroke-rose-500" : ""}
            style={{ color: fav ? undefined : theme.text }}
          />
        </button>
      </div>
      {place.promo && (
        <div
          className="absolute left-4 bottom-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
          style={{ background: theme.accent, color: theme.bg, boxShadow: glowShadow(theme) }}
        >
          <Icon name="flame" size={12} /> {place.promo}
        </div>
      )}
    </div>
  );
}

export function BlockInfo({ ctx }: { ctx: BlockContext }) {
  const { place } = ctx;
  const theme = ctx.theme;
  const tr = useT();
  return (
    <div className="px-4 pb-3 pt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-xl font-bold tracking-tight" style={{ color: theme.text }}>
              {place.name}
            </h1>
            {place.verified && (
              <Icon
                name="verified"
                size={16}
                className="shrink-0"
                style={{ color: theme.accent }}
              />
            )}
          </div>
          <div className="mt-0.5 text-xs" style={{ color: theme.sub }}>
            {place.categoryLabel} · {priceText(place.priceLevel)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className="inline-flex items-center gap-1 text-base font-bold"
            style={{ color: theme.accent }}
          >
            <Icon name="star" size={14} className="fill-current" /> {place.rating}
          </div>
          <div className="text-[10px]" style={{ color: theme.sub }}>
            {place.reviews} {tr("reviewsLabel")}
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-start gap-2.5" style={{ color: theme.text }}>
          <Icon name="pin" size={14} className="mt-0.5 shrink-0" style={{ color: theme.accent }} />
          <span>
            {place.address}
            {place.neighborhood ? `, ${place.neighborhood}` : ""}, {place.city}
          </span>
        </div>
        <div className="flex items-center gap-2.5" style={{ color: theme.text }}>
          <Icon name="clock" size={14} style={{ color: theme.accent }} />
          <span>
            {place.hours} · {place.openNow ? tr("openLabel") : tr("closedLabel")}
          </span>
        </div>
      </div>
    </div>
  );
}

export function BlockAbout({ ctx }: { ctx: BlockContext }) {
  const { place, theme } = ctx;
  if (!place.description && place.tags.length === 0) return null;
  return (
    <div className="px-4 pb-3">
      {place.description && (
        <p className="text-sm leading-relaxed" style={{ color: theme.text, opacity: 0.85 }}>
          {place.description}
        </p>
      )}
      {place.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {place.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{ background: theme.accentSoft ?? "rgba(0,0,0,0.06)", color: theme.accent }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function BlockContactRow({ ctx }: { ctx: BlockContext }) {
  const { theme, onRoute, onCall, onWhatsapp } = ctx;
  const tr = useT();
  const items = [
    { icon: "navigation" as const, label: tr("routeAction"), onClick: onRoute },
    { icon: "phoneCall" as const, label: tr("callAction"), onClick: onCall },
    { icon: "message" as const, label: "WhatsApp", onClick: onWhatsapp },
  ];
  return (
    <div className="flex gap-2 px-4 pb-3">
      {items.map((it) => (
        <button
          key={it.label}
          onClick={it.onClick}
          className="press flex flex-1 flex-col items-center gap-1.5 rounded-2xl p-3 text-xs font-medium"
          style={{
            background: theme.card,
            border: `1px solid ${theme.border}`,
            color: theme.text,
            boxShadow: glowShadow(theme),
          }}
        >
          <Icon name={it.icon} size={18} style={{ color: theme.accent }} />
          {it.label}
        </button>
      ))}
    </div>
  );
}

// Botão de Rota grande — versão destacada das estruturas básicas
// (pedido do Abrão: Free também ganha um botão de Rota mais visível,
// mesmo sem cardápio/blocos avançados).
export function BlockRouteBig({ ctx }: { ctx: BlockContext }) {
  const { theme, onRoute } = ctx;
  const tr = useT();
  return (
    <div className="px-4 pb-3">
      <button
        onClick={onRoute}
        className="press flex w-full items-center gap-3 rounded-2xl p-4"
        style={{
          border: `1px solid ${theme.border}`,
          background: theme.glow
            ? `linear-gradient(135deg, ${theme.accentSoft}, transparent)`
            : theme.accentSoft,
          color: theme.text,
          boxShadow: glowShadow(theme),
        }}
      >
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
          style={{ background: theme.accent, color: theme.bg }}
        >
          <Icon name="navigation" size={18} />
        </div>
        <div className="text-left">
          <div className="text-sm font-bold">{tr("routeAction")}</div>
          <div className="text-[11px]" style={{ color: theme.sub }}>
            Abre no Google Maps ou Apple Maps
          </div>
        </div>
        <Icon name="chevronRight" size={18} className="ml-auto" style={{ color: theme.sub }} />
      </button>
    </div>
  );
}

// Versão "hero" do bloco de rota — fica logo abaixo da capa, antes da
// info textual, para a estrutura "Foco na Rota".
export function BlockRouteHero({ ctx }: { ctx: BlockContext }) {
  const { place, theme, onRoute } = ctx;
  return (
    <div className="px-4 pb-1 pt-3">
      <div
        className="rounded-3xl p-4"
        style={{
          border: `1px solid ${theme.border}`,
          background: theme.glow
            ? `linear-gradient(135deg, ${theme.accentSoft}, transparent)`
            : theme.card,
          boxShadow: glowShadow(theme),
        }}
      >
        <div
          className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide"
          style={{ color: theme.accent }}
        >
          <Icon name="navigation" size={13} /> Localização
        </div>
        <div className="mb-3 mt-1.5 text-sm" style={{ color: theme.text, opacity: 0.85 }}>
          {place.address}
          {place.neighborhood ? `, ${place.neighborhood}` : ""}, {place.city}
        </div>
        <button
          onClick={onRoute}
          className="press w-full rounded-xl py-3 text-sm font-bold"
          style={{ background: theme.accent, color: theme.bg }}
        >
          Iniciar rota
        </button>
      </div>
    </div>
  );
}

export function BlockReserve({
  ctx,
  msg,
  onMsgChange,
  onSend,
  quickReplies,
}: {
  ctx: BlockContext;
  msg: string;
  onMsgChange: (v: string) => void;
  onSend: (text: string) => void;
  quickReplies: string[];
}) {
  const { theme } = ctx;
  const tr = useT();
  return (
    <div className="px-4 pb-4">
      <div
        className="rounded-3xl p-4"
        style={{
          background: theme.card,
          border: `1px solid ${theme.border}`,
          boxShadow: glowShadow(theme),
        }}
      >
        <div className="text-sm font-semibold" style={{ color: theme.text }}>
          {tr("bookOrAskInfo")}
        </div>
        <p className="mt-1 text-xs" style={{ color: theme.sub }}>
          {tr("sendMessageToManager")}
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={msg}
            onChange={(e) => onMsgChange(e.target.value)}
            placeholder={tr("messageInputPlaceholder")}
            className="h-11 flex-1 rounded-xl bg-transparent px-3 text-sm outline-none"
            style={{ border: `1px solid ${theme.border}`, color: theme.text }}
          />
          <button
            disabled={!msg.trim()}
            onClick={() => onSend(msg.trim())}
            className="press grid h-11 w-11 shrink-0 place-items-center rounded-xl"
            style={{
              background: msg.trim() ? theme.accent : theme.border,
              color: theme.bg,
              boxShadow: msg.trim() ? glowShadow(theme) : "none",
            }}
          >
            <Icon name="send" size={15} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {quickReplies.map((s) => (
            <button
              key={s}
              onClick={() => onSend(s)}
              className="press rounded-full px-3 py-1.5 text-xs"
              style={{ border: `1px solid ${theme.border}`, color: theme.text }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BlockGallery({ ctx }: { ctx: BlockContext }) {
  const { place, theme } = ctx;
  if (!place.gallery || place.gallery.length === 0) return null;
  return (
    <div className="px-4 pb-3">
      <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {place.gallery.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={`${place.name} — foto ${i + 1}`}
            className="h-24 w-24 shrink-0 rounded-2xl object-cover"
            style={{ border: `1px solid ${theme.border}` }}
          />
        ))}
      </div>
    </div>
  );
}

// "menu" / "rooms" / "services" / "catalog" partilham o mesmo visual —
// é sempre uma lista de itens com nome e preço, vindos do catálogo real
// de produtos do comerciante (fetchProducts em businesses-db.ts). Só o
// título e o ícone mudam conforme a família do negócio, para o
// comerciante sentir que o bloco fala a língua do tipo de negócio dele.
function BlockProductList({
  ctx,
  title,
  icon,
}: {
  ctx: BlockContext;
  title: string;
  icon: string;
}) {
  const { theme, products, onProductClick } = ctx;
  if (products.length === 0) return null;
  return (
    <div className="px-4 pb-3">
      <div className="mb-2 flex items-center gap-2">
        <Icon name={icon} size={15} style={{ color: theme.accent }} />
        <div className="text-sm font-semibold" style={{ color: theme.text }}>
          {title}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {products.map((p) => (
          <button
            key={p.id}
            onClick={() => onProductClick(p)}
            className="press flex flex-col overflow-hidden rounded-2xl text-left"
            style={{ border: `1px solid ${theme.border}`, background: theme.card }}
          >
            <div className="h-20 w-full overflow-hidden" style={{ background: theme.bg }}>
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <div
                  className="flex h-full items-center justify-center"
                  style={{ color: theme.sub }}
                >
                  <Icon name="image" size={20} />
                </div>
              )}
            </div>
            <div className="p-2.5">
              <div className="truncate text-xs font-semibold" style={{ color: theme.text }}>
                {p.name}
              </div>
              <div className="mt-0.5 text-[11px] font-bold" style={{ color: theme.accent }}>
                {p.price.toLocaleString()} {p.currency}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function BlockMenu({ ctx }: { ctx: BlockContext }) {
  const tr = useT();
  return <BlockProductList ctx={ctx} title={tr("blockMenuTitle")} icon="restaurant" />;
}
export function BlockRooms({ ctx }: { ctx: BlockContext }) {
  const tr = useT();
  return <BlockProductList ctx={ctx} title={tr("blockRoomsTitle")} icon="hotel" />;
}
export function BlockServices({ ctx }: { ctx: BlockContext }) {
  const tr = useT();
  return <BlockProductList ctx={ctx} title={tr("blockServicesTitle")} icon="sparkles" />;
}
export function BlockCatalog({ ctx }: { ctx: BlockContext }) {
  const tr = useT();
  return <BlockProductList ctx={ctx} title={tr("blockCatalogTitle")} icon="store" />;
}
export function BlockItinerary({ ctx }: { ctx: BlockContext }) {
  const tr = useT();
  return <BlockProductList ctx={ctx} title={tr("blockItineraryTitle")} icon="tourism" />;
}
