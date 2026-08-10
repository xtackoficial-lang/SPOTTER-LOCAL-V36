import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { priceText, type Place } from "@/lib/places-data";
import {
  fetchBusinessById,
  businessToPlace,
  fetchProducts,
  type ProductDB,
} from "@/lib/businesses-db";
import { useFavorites } from "@/lib/favorites-storage";
import { useChats } from "@/lib/chat-storage";
import { trackEvent } from "@/lib/analytics-db";
import { Icon } from "@/components/Icon";
import {
  BlockCover,
  BlockInfo,
  BlockAbout,
  BlockContactRow,
  BlockRouteBig,
  BlockRouteHero,
  BlockReserve,
  BlockGallery,
  BlockMenu,
  BlockRooms,
  BlockServices,
  BlockCatalog,
  BlockItinerary,
  type BlockContext,
} from "@/components/ProfileBlocks";
import {
  familyForCategory,
  getStructure,
  getTheme,
  getGalleryImageUrl,
  themeBackgroundStyle,
  DEFAULT_STRUCTURE_ID,
  type BlockId,
} from "@/lib/profile-styles";
import { getPlanById } from "@/lib/subscription-storage";
import {
  formatDistance,
  getUserLocation,
  distanceKm as calculateDistanceKm,
  type Coordinates,
} from "@/lib/geo-utils";
import { useT, useLocale, INTL_TAG, t } from "@/lib/i18n";
import { useOnboarding } from "@/lib/onboarding-storage";

// Cada bloco da Estrutura corresponde a um destes componentes. "cover"
// fica sempre fixo no topo e "reserve" sempre tem props extra (texto da
// mensagem), por isso são tratados em separado em PlaceDetail — esta
// lista cobre os blocos "simples", sem estado próprio.
const SIMPLE_BLOCKS: Partial<
  Record<BlockId, (props: { ctx: BlockContext }) => React.JSX.Element | null>
> = {
  info: BlockInfo,
  about: BlockAbout,
  contactRow: BlockContactRow,
  routeBig: BlockRouteBig,
  routeHero: BlockRouteHero,
  gallery: BlockGallery,
  menu: BlockMenu,
  rooms: BlockRooms,
  services: BlockServices,
  catalog: BlockCatalog,
  itinerary: BlockItinerary,
};

export const Route = createFileRoute("/place/$id")({
  head: () => ({ meta: [{ title: "Lugar — Spotter Local" }] }),
  component: PlaceDetail,
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <p className="text-muted-foreground">{t("placeNotFound")}</p>
      <Link
        to="/home"
        className="press rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground"
      >
        {t("backToHome")}
      </Link>
    </div>
  ),
});

function PlaceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const tr = useT();
  const [locale] = useLocale();
  const { draft } = useOnboarding();
  // O comerciante pode tocar em "Ver perfil público" no painel dele
  // para ver exactamente o que os clientes veem (ver merchant.tsx).
  // Aqui detectamos esse caso para: 1) mostrar um aviso no topo com
  // atalho de volta ao painel, e 2) não contar como visita real nas
  // Analytics dele (senão inflacionava as próprias estatísticas).
  const isOwnerPreview = draft.profileType === "business" && draft.business.businessId === id;
  const [place, setPlace] = useState<Place | null | undefined>(undefined); // undefined = a carregar
  const { has, toggle } = useFavorites();
  const { send } = useChats();
  const [msg, setMsg] = useState("");
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [products, setProducts] = useState<ProductDB[]>([]);

  useEffect(() => {
    getUserLocation().then(setUserLocation);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchBusinessById(id)
      .then((b) => {
        if (cancelled) return;
        setPlace(b ? businessToPlace(b) : null);
        // Conta como visita real ao perfil — sem isto o painel de
        // Analytics do comerciante (analytics.tsx) nunca tinha dados
        // verdadeiros e mostrava sempre números inventados. Excepto
        // quando é o próprio dono a pré-visualizar (isOwnerPreview) —
        // isso não é uma visita real de um cliente.
        if (b && !isOwnerPreview) trackEvent(id, "view");
      })
      .catch(() => {
        if (cancelled) return;
        setPlace(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Catálogo de produtos do negócio — antes existia toda a infraestrutura
  // (fetchProducts, CRUD em /merchant e /products com limites de plano)
  // mas o cliente final nunca via nenhum produto no perfil público porque
  // nada chamava fetchProducts aqui.
  useEffect(() => {
    let cancelled = false;
    fetchProducts(id)
      .then((list) => {
        if (!cancelled) setProducts(list.filter((p) => p.available));
      })
      .catch((err) => {
        console.warn("PlaceDetail: falha ao carregar produtos.", err);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const displayDistanceKm =
    userLocation && place && typeof place.lat === "number" && typeof place.lng === "number"
      ? calculateDistanceKm(userLocation, { lat: place.lat, lng: place.lng })
      : (place?.distanceKm ?? 0);

  // Estrutura & Tema do perfil: ausentes = "classica" + "classico",
  // reproduzindo exactamente o layout fixo que existia antes desta
  // funcionalidade — nenhum negócio já cadastrado muda de aspecto sem
  // o comerciante escolher activamente outra coisa.
  const family = place ? familyForCategory(place.category) : "outros";
  // maxStructures reforça aqui o mesmo limite já aplicado na escrita
  // (painel do comerciante) — defesa em profundidade: mesmo que um
  // structure_id de uma estrutura paga chegue a um negócio Free por
  // qualquer via fora da UI normal, a leitura pública não a mostra.
  // getPlanById é uma função pura (sem localStorage) — diferente de
  // useSubscription(), que não pode ser usado aqui porque guarda o
  // estado num localStorage único do dispositivo, pensado para o
  // próprio comerciante ver o plano dele, não para visitantes lerem o
  // plano de negócios de terceiros.
  const maxStructures = place ? getPlanById(place.planId ?? "free").maxStructures : 2;
  const structure = place
    ? getStructure(family, place.structureId ?? DEFAULT_STRUCTURE_ID, maxStructures)
    : null;
  const theme = getTheme(place?.themeId);
  // A imagem de fundo escolhida (galeria partilhada, base64, ~8.3MB no
  // total) só é carregada via import() dinâmico quando este perfil em
  // concreto tem uma escolhida — ver getGalleryImageUrl em
  // profile-styles.ts. Sem isto, a imagem entraria no ficheiro
  // principal do app, descarregado por todos os utilizadores em todos
  // os carregamentos, mesmo quem nunca abre um perfil com fundo.
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!place?.backgroundId) {
      setBackgroundUrl(null);
      return;
    }
    let cancelled = false;
    getGalleryImageUrl(place.backgroundId).then((url) => {
      if (!cancelled) setBackgroundUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [place?.backgroundId]);
  // block_order guarda a ordem que o comerciante escolheu dentro da
  // estrutura; se ainda não reordenou nada, usa a ordem-base da
  // Estrutura. Filtra blocos obsoletos (de uma Estrutura anterior) e
  // ACRESCENTA ao fim quaisquer blocos da Estrutura actual que ainda
  // não constem na lista — cobre o caso de o block_order gravado
  // nunca ter sido actualizado para a Estrutura nova (ex: gravado por
  // qualquer via fora do fluxo normal do painel). Sem isto, um bloco
  // novo da Estrutura escolhida (ex: o Cardápio, ao mudar de Free para
  // um plano com mais blocos) podia nunca aparecer na página pública.
  const blocksToRender: BlockId[] = structure
    ? place?.blockOrder && place.blockOrder.length > 0
      ? ([
          ...place.blockOrder.filter((b) => structure!.blocks.includes(b as BlockId)),
          ...structure.blocks.filter((b) => !place.blockOrder!.includes(b)),
        ] as BlockId[])
      : structure.blocks
    : [];

  if (place === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (!place) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-muted-foreground">{tr("placeNotFound")}</p>
        <Link
          to="/home"
          className="press rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground"
        >
          {tr("backToHome")}
        </Link>
      </div>
    );
  }

  const fav = has(place.id);

  const startChat = (text: string) => {
    send(place.id, place.name, place.icon, text);
    trackEvent(place.id, "message");
    navigate({ to: "/chat/$id", params: { id: place.id } });
  };

  // v27 — Antes usava sempre nome+endereço em texto, mesmo quando já
  // tínhamos as coordenadas GPS exactas gravadas (place.lat/place.lng).
  // Texto pode levar o Google Maps para o sítio errado (endereços
  // informais, sem número de porta, bairros mal referenciados); as
  // coordenadas exactas levam sempre ao pin certo.
  const hasExactCoords = typeof place.lat === "number" && typeof place.lng === "number";
  const routeHref = hasExactCoords
    ? `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        place.name + " " + place.address,
      )}`;
  const whatsappHref = `https://wa.me/${place.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
    tr("whatsappGreeting"),
  )}`;

  const ctx: BlockContext = {
    place,
    theme,
    products,
    fav,
    onBack: () => navigate({ to: "/home" }),
    onToggleFavorite: () => toggle(place.id),
    onRoute: () => {
      trackEvent(place.id, "click");
      window.open(routeHref, "_blank", "noopener,noreferrer");
    },
    onCall: () => {
      trackEvent(place.id, "call");
      window.location.href = `tel:${place.phone}`;
    },
    onWhatsapp: () => {
      trackEvent(place.id, "click");
      window.open(whatsappHref, "_blank", "noopener,noreferrer");
    },
    onProductClick: () => trackEvent(place.id, "click"),
  };

  return (
    <div className="min-h-screen pb-32" style={themeBackgroundStyle(theme, backgroundUrl)}>
      {isOwnerPreview && (
        <div className="sticky top-0 z-50 flex items-center justify-between gap-2 bg-foreground px-4 py-2.5 text-background">
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <Icon name="compass" size={13} /> {tr("previewBannerLabel")}
          </span>
          <button
            onClick={() => navigate({ to: "/merchant" })}
            className="press rounded-full bg-background/15 px-3 py-1 text-[11px] font-semibold"
          >
            {tr("previewBannerBack")}
          </button>
        </div>
      )}
      {/* "cover" é sempre o primeiro bloco, em todas as Estruturas —
          é a foto/identidade do negócio, não faz sentido reordenar
          para outro sítio. */}
      <BlockCover ctx={ctx} />

      <div className="-mt-6 rounded-t-[28px] pt-3 animate-slide-up">
        {blocksToRender.map((blockId, idx) => {
          if (blockId === "reserve") {
            return (
              <BlockReserve
                key={`${blockId}-${idx}`}
                ctx={ctx}
                msg={msg}
                onMsgChange={setMsg}
                onSend={startChat}
                quickReplies={[
                  tr("quickQuestionOpen"),
                  tr("quickQuestionAvailability"),
                  tr("quickQuestionDelivery"),
                ]}
              />
            );
          }
          const Block = SIMPLE_BLOCKS[blockId];
          if (!Block) return null;
          return <Block key={`${blockId}-${idx}`} ctx={ctx} />;
        })}

        {/* Website e estado tr("digitalBusiness") não fazem parte de
            nenhuma Estrutura — são informação factual sobre o negócio,
            mostrada sempre que existir, independente do layout
            escolhido. */}
        {(place.website || place.isDigital) && (
          <div className="px-4 pb-3 text-sm" style={{ color: theme.text }}>
            {place.isDigital && (
              <div
                className="flex items-center gap-2.5 font-medium"
                style={{ color: theme.accent }}
              >
                <Icon name="delivery" size={16} />
                <span>Negócio digital · disponível online</span>
              </div>
            )}
            {place.website && (
              <a
                href={place.website.startsWith("http") ? place.website : `https://${place.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 flex items-center gap-2.5"
                style={{ color: theme.accent }}
              >
                <Icon name="globe" size={16} />
                <span className="truncate">{place.website}</span>
              </a>
            )}
          </div>
        )}

        {/* ── Avaliações — fixo no fim, fora do sistema de Estruturas:
            é a mesma lógica de negócio madura de sempre, independente
            de como o resto do perfil está organizado. ── */}
        <div className="mt-3 px-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Icon name="star" size={16} className="fill-amber-400 stroke-amber-500" />
              <span className="text-sm font-semibold" style={{ color: theme.text }}>
                {tr("reviewsLabel")} · {place.rating} ({place.reviews})
              </span>
            </div>
            <Link
              to="/reviews/$id"
              params={{ id: place.id }}
              className="press text-xs font-semibold"
              style={{ color: theme.accent }}
            >
              {tr("seeAllLink")} →
            </Link>
          </div>
          <Link
            to="/reviews/$id"
            params={{ id: place.id }}
            className="press flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold"
            style={{
              border: `1px solid ${theme.border}`,
              background: theme.accentSoft,
              color: theme.accent,
            }}
          >
            <Icon name="star" size={15} className="fill-current" /> {tr("writeReviewAction")}
          </Link>
        </div>

        <Link
          to="/home"
          className="mt-6 inline-flex w-full items-center justify-center gap-1.5 px-4 text-xs"
          style={{ color: theme.sub }}
        >
          <Icon name="arrowLeft" size={12} /> {tr("backToDiscovery")}
        </Link>

        <div className="mt-6 text-center text-[10px] opacity-50" style={{ color: theme.sub }}>
          XTACK OFICIAL
        </div>
      </div>
    </div>
  );
}
