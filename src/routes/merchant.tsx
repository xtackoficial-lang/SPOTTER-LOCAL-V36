import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useOnboarding, BUSINESS_CATEGORIES } from "@/lib/onboarding-storage";
import { useProducts } from "@/lib/products-storage";
import { useSubscription } from "@/lib/subscription-storage";
import { useAuth } from "@/lib/auth-context";
import { upsertBusiness, fetchBusinessById } from "@/lib/businesses-db";
import { extractCoordinatesFromGoogleMaps, resolveLocationInput, getUserLocation, type Coordinates } from "@/lib/geo-utils";
import { BusinessBottomNav } from "@/components/BusinessBottomNav";
import { Icon } from "@/components/Icon";
import { RequireBusiness } from "@/components/RequireBusiness";
import { useState, useRef, useEffect } from "react";
import { useScreenAppearance } from "@/lib/theme-storage";
import { useT, t } from "@/lib/i18n";
import { ThemeAnimationOnly, resolveBackgroundStyle } from "@/components/ThemeBackdrop";
import {
  familyForCategory,
  getAvailableStructures,
  getStructure,
  STRUCTURES_BY_FAMILY,
  THEMES,
  ADVANCED_BLOCKS,
  BACKGROUND_GALLERY,
  getGalleryImageUrl,
  DEFAULT_STRUCTURE_ID,
  DEFAULT_THEME_ID,
  countSwapsThisMonth,
  recordThemeSwap,
  type BlockId,
} from "@/lib/profile-styles";
import { PROVINCES_MZ, citiesForProvince, PROVINCE_CENTER_MZ } from "@/lib/mozambique-locations";
import { uploadMedia, uploadMediaBatch, deleteMediaByUrl } from "@/lib/storage-upload";

export const Route = createFileRoute("/merchant")({
  head: () => ({ meta: [{ title: "Editar Perfil — Spotter Local" }] }),
  component: () => (
    <RequireBusiness>
      <MerchantPanel />
    </RequireBusiness>
  ),
});

// ─── tipos ────────────────────────────────────────────────────────────────────
type Tab = "perfil" | "visual" | "galeria" | "produtos" | "horario";

// ─── helpers ──────────────────────────────────────────────────────────────────
// ─── componente principal ─────────────────────────────────────────────────────
function MerchantPanel() {
  const tr = useT();
  const BLOCK_LABELS: Record<string, string> = {
    cover: tr("structBlockCoverLabel"),
    info: tr("structBlockInfoLabel"),
    about: tr("structBlockAboutLabel"),
    contactRow: tr("structBlockContactLabel"),
    routeBig: tr("structBlockRouteBigLabel"),
    routeHero: tr("structBlockRouteHeroLabel"),
    reserve: tr("structBlockReserveLabel"),
    menu: tr("structBlockMenuLabel"),
    rooms: tr("structBlockRoomsLabel"),
    services: tr("structBlockServicesLabel"),
    catalog: tr("structBlockCatalogLabel"),
    itinerary: tr("structBlockItineraryLabel"),
    gallery: tr("structBlockGalleryLabel"),
  };
  const DAYS = [
    tr("dayMon"),
    tr("dayTue"),
    tr("dayWed"),
    tr("dayThu"),
    tr("dayFri"),
    tr("daySat"),
    tr("daySun"),
  ];
  const navigate = useNavigate();
  const { draft, hydrated, updateBusiness } = useOnboarding();
  const { user } = useAuth();
  const businessId = draft.business.businessId || "default";
  const { sub, plan, isBlocked, isOverdue } = useSubscription(businessId);
  const { products, add, update, remove, toggle } = useProducts(businessId);
  const [syncing, setSyncing] = useState(false);
  const { appearance } = useScreenAppearance("merchant");

  const [tab, setTab] = useState<Tab>("perfil");
  const [saved, setSaved] = useState(false);
  // BUG CORRIGIDO (2026-08-15): saveProfile() mostrava sempre "Guardado!"
  // mesmo quando a gravação no Supabase falhava — os dados ficavam só
  // localmente, mas os clientes vêem o Supabase, não o localStorage do
  // comerciante. Adicionado estado de erro explícito para guardar perfil.
  const [saveError, setSaveError] = useState<string | null>(null);
  // BUG CORRIGIDO (2026-08-15): erros de upload (capa/galeria/produto)
  // só apareciam na consola — o utilizador não via nada. Adicionado
  // estado de erro separado para cada tipo de upload.
  const [uploadCoverError, setUploadCoverError] = useState<string | null>(null);
  const [uploadGalleryError, setUploadGalleryError] = useState<string | null>(null);
  const [uploadProductImageError, setUploadProductImageError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  // perfil local
  const [name, setName] = useState(draft.business.businessName || "");
  const [desc, setDesc] = useState(draft.business.description || "");
  // Tags — descoberto na auditoria de 2026-07-08: o campo já existia no
  // Place (usado na Busca para procurar por palavra-chave) mas NUNCA
  // havia um sítio no painel para o preencher — todo negócio real ficava
  // sempre com tags vazias, tornando essa parte da Busca inútil na
  // prática. Guardado como texto separado por vírgulas, mais simples de
  // editar do que uma lista.
  const [tagsText, setTagsText] = useState((draft.business.tags ?? []).join(", "));
  const [phone, setPhone] = useState(draft.business.phone || "");
  const [website, setWebsite] = useState(draft.business.website || "");
  const [ownerName, setOwnerName] = useState(draft.business.ownerName || "");
  const [category, setCategory] = useState(draft.business.category || "");
  // Província/Cidade/Bairro — ver mozambique-locations.ts. A Província
  // é o que decide quem vê o negócio na Home/Busca; Cidade e Bairro são
  // só detalhe de endereço mostrado no perfil público.
  const [province, setProvince] = useState(draft.business.province || "");
  const [city, setCity] = useState(draft.business.city || "");
  const [neighborhood, setNeighborhood] = useState(draft.business.neighborhood || "");
  const [mapsLink, setMapsLink] = useState(draft.business.googleMapsLink || "");
  const [mapsCoords, setMapsCoords] = useState<Coordinates | null>(
    draft.business.lat != null && draft.business.lng != null
      ? { lat: draft.business.lat, lng: draft.business.lng }
      : null,
  );
  // v29 — Mesmo mecanismo do onboarding (LocationStep): botão de GPS +
  // resolução de Plus Code/link curto. Antes, quem já tinha terminado o
  // onboarding só conseguia corrigir a localização aqui colando um link
  // longo à mão — sem botão de GPS nem suporte a Plus Code/link curto,
  // ficava mais limitado do que o próprio onboarding.
  const [locatingGPS, setLocatingGPS] = useState(false);
  const [gpsError, setGpsError] = useState(false);
  const [resolvingLink, setResolvingLink] = useState(false);

  const handleUseCurrentLocation = async () => {
    setLocatingGPS(true);
    setGpsError(false);
    const coords = await getUserLocation(10000);
    setLocatingGPS(false);
    if (!coords) {
      setGpsError(true);
      return;
    }
    setMapsLink(`${coords.lat},${coords.lng}`);
    setMapsCoords(coords);
  };

  const handleMapsLinkChange = async (value: string) => {
    setMapsLink(value);
    const immediate = extractCoordinatesFromGoogleMaps(value);
    setMapsCoords(immediate);
    if (immediate) return;

    setResolvingLink(true);
    const reference = province
      ? PROVINCE_CENTER_MZ[province as keyof typeof PROVINCE_CENTER_MZ]
      : undefined;
    const resolved = await resolveLocationInput(value, reference);
    setResolvingLink(false);
    setMapsCoords(resolved);
  };

  // horário
  const [openTime, setOpenTime] = useState(draft.business.hours?.open || "08:00");
  const [closeTime, setCloseTime] = useState(draft.business.hours?.close || "18:00");
  const [alwaysOpen, setAlwaysOpen] = useState(draft.business.hours?.alwaysOpen || false);
  const [isDigital, setIsDigital] = useState(draft.business.isDigital || false);
  const [openDays, setOpenDays] = useState<number[]>(
    draft.business.hours?.openDays ?? [0, 1, 2, 3, 4, 5, 6],
  );

  // galeria
  const [gallery, setGallery] = useState<string[]>(draft.business.gallery || []);
  const [cover, setCover] = useState<string | undefined>(draft.business.coverImage);
  const coverRef = useRef<HTMLInputElement>(null);
  // Ref separada da capa "grande" (aba Galeria) — o header tem o seu próprio
  // input de capa (avatar pequeno) sempre montado; usar a MESMA ref para os
  // dois <input> fazia o React perder a referência para um deles sempre
  // que a aba Galeria estava activa, porque ambos coexistiam no DOM ao
  // mesmo tempo apontando para a mesma variável.
  const coverRefBig = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // produto
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [pName, setPName] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [pCat, setPCat] = useState("");
  const [pAvail, setPAvail] = useState(true);
  const [pImage, setPImage] = useState<string | undefined>();
  const pImageRef = useRef<HTMLInputElement>(null);

  // visual (Estrutura & Tema do perfil)
  const family = familyForCategory(category);
  const [structureId, setStructureId] = useState(
    draft.business.structureId ?? DEFAULT_STRUCTURE_ID,
  );
  const [themeId, setThemeId] = useState(draft.business.themeId ?? DEFAULT_THEME_ID);
  const [backgroundId, setBackgroundId] = useState<string | undefined>(draft.business.backgroundId);
  const structure = getStructure(family, structureId);
  const [blockOrder, setBlockOrder] = useState<BlockId[]>(
    (draft.business.blockOrder as BlockId[] | undefined)?.filter((b) =>
      structure.blocks.includes(b),
    ) ?? structure.blocks,
  );
  const [draggedBlockIdx, setDraggedBlockIdx] = useState<number | null>(null);
  const [dragOverBlockIdx, setDragOverBlockIdx] = useState<number | null>(null);
  // Simplificação da aba Visual (2026-07-07): a maioria dos comerciantes
  // fica bem com a ordem que a Estrutura já traz — mostrar o
  // reordenamento sempre visível confundia com a escolha de Estrutura
  // (pareciam a mesma coisa). Agora fica escondido atrás de um toggle
  // "opcional", só para quem realmente quer personalizar.
  const [showBlockOrder, setShowBlockOrder] = useState(false);
  const [swapsUsed, setSwapsUsed] = useState<number | null>(null); // null = a carregar
  const [visualSaved, setVisualSaved] = useState(false);
  const [visualError, setVisualError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft.business.businessId) return;
    countSwapsThisMonth(draft.business.businessId).then(setSwapsUsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza Estrutura/blocos quando a categoria muda de família (ex:
  // Restaurante → Farmácia: comida → saude_servicos). BUG CORRIGIDO:
  // sem isto, structureId e blockOrder ficavam "presos" na família
  // antiga — a lista "Estrutura do perfil" não mostrava NENHUM botão
  // seleccionado (porque o structureId guardado não existe na família
  // nova) e "Ordem dos blocos" continuava a mostrar blocos que já não
  // pertencem a nenhuma estrutura da categoria actual (ex: "Cardápio"
  // numa Farmácia). Se o comerciante gravasse o perfil nesse estado, o
  // structure_id/block_order inválidos ficavam gravados no Supabase.
  const prevFamilyRef = useRef(family);
  useEffect(() => {
    if (prevFamilyRef.current === family) return;
    prevFamilyRef.current = family;
    const stillValid = STRUCTURES_BY_FAMILY[family].some((s) => s.id === structureId);
    if (!stillValid) {
      const fallback = getStructure(family, DEFAULT_STRUCTURE_ID);
      setStructureId(fallback.id);
      setBlockOrder(fallback.blocks);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family]);

  // FIX (auditoria pré-lançamento): uploadingCover, uploadingGallery e
  // uploadingProductImage estavam declarados DEPOIS do "if (!hydrated)
  // return" abaixo — violação das Regras dos Hooks. No 1º render
  // (hydrated=false) o React registava menos hooks; assim que os dados
  // carregavam (hydrated=true) o React encontrava mais hooks do que no
  // render anterior e crashava o painel do comerciante com "Rendered
  // more hooks than during the previous render". Movidos para aqui.
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [uploadingProductImage, setUploadingProductImage] = useState(false);

  if (!hydrated) return <div className="min-h-screen bg-background" />;

  const cat = BUSINESS_CATEGORIES.find((c) => c.id === category);

  // ── guardar perfil ──
  async function saveProfile() {
    if (isBlocked || isOverdue) return; // conta bloqueada/atrasada não pode editar perfil
    // Máximo de 6 tags, sem vazios/duplicados — evita alguém colar um
    // parágrafo inteiro aqui em vez de palavras-chave curtas.
    const tags = Array.from(
      new Set(
        tagsText
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ).slice(0, 6);
    updateBusiness({
      businessName: name,
      description: desc,
      tags,
      phone,
      website,
      ownerName,
      category,
      province,
      city,
      neighborhood,
      hours: { open: openTime, close: closeTime, alwaysOpen, openDays },
      gallery,
      coverImage: cover,
      googleMapsLink: mapsLink,
      lat: isDigital ? undefined : mapsCoords?.lat,
      lng: isDigital ? undefined : mapsCoords?.lng,
      isDigital,
    });
    // BUG CORRIGIDO (2026-08-15): antes, a sincronização com o Supabase
    // era "best-effort" — se falhasse, os dados ficavam só no localStorage
    // local do comerciante. Mas os clientes vêem o Supabase, não o
    // localStorage do comerciante. O "Guardado!" aparecia sempre, mesmo
    // quando o nome/descrição/fotos nunca chegaram ao servidor.
    // Agora: quando o Supabase está configurado, só mostra "Guardado!"
    // após confirmação real. Se falhar, mostra erro claro.
    // Sem Supabase configurado (modo de desenvolvimento), guarda só
    // localmente e mostra "Guardado!" como antes (comportamento intencional).
    if (user && draft.business.businessId) {
      setSyncing(true);
      setSaveError(null);
      try {
        // upsert() do Supabase não preserva colunas omitidas do payload
        // (UPDATE SET só com as colunas enviadas) — busca-se o registo
        // actual primeiro para não apagar structure_id/theme_id/
        // block_order (escolhidos na aba Visual) sempre que o
        // comerciante guarda esta aba.
        const current = await fetchBusinessById(draft.business.businessId);
        await upsertBusiness({
          ...(current ?? {}),
          id: draft.business.businessId,
          owner_id: user.id,
          business_name: name,
          owner_name: ownerName || undefined,
          category,
          city,
          province: province || undefined,
          neighborhood: neighborhood || undefined,
          country: draft.business.country || tr("defaultCountry"),
          address: "",
          phone,
          description: desc,
          tags,
          website: website || undefined,
          cover_image: cover || undefined,
          gallery,
          always_open: alwaysOpen,
          hours_open: openTime,
          hours_close: closeTime,
          open_days: openDays,
          plan_id: plan.id,
          plan_status: sub?.status ?? "active",
          lat: isDigital ? undefined : mapsCoords?.lat,
          lng: isDigital ? undefined : mapsCoords?.lng,
          is_digital: isDigital,
          // rating/reviews_count NÃO são enviados aqui: são calculados pela
          // função update_business_rating() a partir das reviews reais.
          // Reenviá-los como 0 sempre que o perfil é guardado zerava a
          // média de avaliações de qualquer negócio que editasse o perfil.
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch (err) {
        console.warn("Falha ao sincronizar perfil do negócio com Supabase:", err);
        setSaveError(tr("saveErrorInternet"));
      } finally {
        setSyncing(false);
      }
    } else {
      // Modo sem Supabase configurado (desenvolvimento local) —
      // guarda só localmente e mostra "Guardado!" como antes.
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  // ── guardar Estrutura/Tema do perfil (aba Visual) ──
  // Acção própria, separada de saveProfile(): troca de Estrutura/Tema
  // tem um limite mensal incluído no plano (Free 1, Starter 2, Pro 3,
  // Premium 4 — ver THEMES/getPlanById), por isso precisa de verificar
  // o histórico antes de gravar, em vez de gravar sempre como o resto
  // do perfil.
  async function saveVisual() {
    if (isBlocked || isOverdue) return;
    const businessId = draft.business.businessId;
    const changedStructureOrTheme =
      structureId !== (draft.business.structureId ?? DEFAULT_STRUCTURE_ID) ||
      themeId !== (draft.business.themeId ?? DEFAULT_THEME_ID) ||
      backgroundId !== draft.business.backgroundId;

    // Só consome o limite mensal quando Estrutura ou Tema mudaram de
    // facto — reordenar os blocos dentro da mesma Estrutura/Tema é
    // edição livre, não uma "troca".
    if (changedStructureOrTheme) {
      // swapsUsed ainda null = a contagem real do Supabase ainda não
      // chegou (ex: ligação lenta). Tratar isso como "zero usadas"
      // permitia contornar o limite mensal clicando em Guardar antes
      // da contagem carregar — por isso bloqueia em vez de assumir.
      if (swapsUsed === null) {
        setVisualError(tr("checksVerifyingSwaps"));
        return;
      }
      if (swapsUsed >= plan.themeSwapsPerMonth) {
        setVisualError(
          `Já usou as ${plan.themeSwapsPerMonth} trocas de Estrutura/Tema incluídas no plano ${plan.name} este mês. Volta a poder trocar no próximo mês, ou faz upgrade de plano para mais trocas.`,
        );
        return;
      }
    }

    setVisualError(null);
    updateBusiness({ structureId, themeId, backgroundId, blockOrder });

    if (!businessId || !user) {
      // Sem negócio/sessão ainda (ex: a meio do onboarding) — guarda
      // só localmente, sem consumir o limite mensal nem mostrar erro;
      // será sincronizado da próxima vez que houver businessId.
      setVisualSaved(true);
      setTimeout(() => setVisualSaved(false), 2500);
      return;
    }

    try {
      // upsert() do Supabase não preserva colunas omitidas do
      // payload (faz UPDATE SET só das colunas enviadas, mas com
      // os valores literalmente enviados — colunas ausentes ficam
      // ao critério do default da tabela). Por isso busca-se o
      // registo actual e envia-se por completo, só trocando
      // structure_id/theme_id/block_order — caso contrário esta
      // troca de Tema apagava a galeria, o site, a localização e o
      // estado "negócio digital" de qualquer negócio já cadastrado.
      const current = await fetchBusinessById(businessId);
      await upsertBusiness({
        ...(current ?? {}),
        id: businessId,
        owner_id: user.id,
        business_name: name,
        category,
        city: draft.business.city || "",
        country: draft.business.country || tr("defaultCountry"),
        address: current?.address || "",
        phone,
        description: desc,
        website: website || undefined,
        cover_image: cover || undefined,
        gallery,
        always_open: alwaysOpen,
        hours_open: openTime,
        hours_close: closeTime,
        open_days: openDays,
        plan_id: plan.id,
        plan_status: sub?.status ?? "active",
        lat: isDigital ? undefined : mapsCoords?.lat,
        lng: isDigital ? undefined : mapsCoords?.lng,
        is_digital: isDigital,
        structure_id: structureId,
        theme_id: themeId,
        background_id: backgroundId,
        block_order: blockOrder,
      });
    } catch (err) {
      // A gravação remota falhou — o cliente nunca veria esta
      // alteração. Não consome o limite mensal nem mostra "Guardado!":
      // o comerciante fica a saber que precisa de tentar de novo, em
      // vez de pensar (erradamente) que já está tudo a funcionar.
      console.warn("Falha ao sincronizar Estrutura/Tema com Supabase:", err);
      setVisualError(tr("saveErrorInternet"));
      return;
    }

    if (changedStructureOrTheme) {
      await recordThemeSwap(businessId, structureId, themeId);
      setSwapsUsed((n) => (n ?? 0) + 1);
    }
    setVisualSaved(true);
    setTimeout(() => setVisualSaved(false), 2500);
  }

  // ── cover upload ──
  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingCover(true);
    // BUG CORRIGIDO (2026-08-15): antes, erros de upload só iam para a
    // consola — o utilizador não via nada e ficava sem saber porque a
    // foto de capa não aparecia. Agora mostra mensagem de erro na UI.
    setUploadCoverError(null);
    try {
      const url = await uploadMedia(file, "cover", user.id);
      setCover(url);
      updateBusiness({ coverImage: url });
      if (draft.business.businessId) {
        const current = await fetchBusinessById(draft.business.businessId);
        await upsertBusiness({
          ...(current ?? {}),
          id: draft.business.businessId,
          owner_id: user.id,
          business_name: name || draft.business.businessName || "Negócio",
          category: category || draft.business.category || "other",
          city: city || draft.business.city || "",
          country: draft.business.country || tr("defaultCountry"),
          cover_image: url,
        });
      }
    } catch (err) {
      console.warn("Falha ao enviar a foto de capa:", err);
      setUploadCoverError("Não foi possível enviar a foto de capa. Verifique a ligação e tente novamente.");
    } finally {
      setUploadingCover(false);
    }
  }

  // ── galeria upload ──
  // Limite real depende do plano (galleryLimit) — Starter 6, Pro 20, Premium 40.
  // A galeria está disponível em TODOS os planos: nenhum precisa de upgrade
  // para começar a publicar fotos do seu negócio.
  const GALLERY_LIMIT = plan.galleryLimit;

  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !user) return;
    const room = GALLERY_LIMIT - gallery.length;
    if (room <= 0) return; // limite do plano atingido — botão já fica escondido neste caso
    const accepted = files.slice(0, room);
    setUploadingGallery(true);
    setUploadGalleryError(null);
    try {
      const urls = await uploadMediaBatch(accepted, "gallery", user.id);
      const next = [...gallery, ...urls];
      setGallery(next);
      updateBusiness({ gallery: next });
      if (draft.business.businessId) {
        const current = await fetchBusinessById(draft.business.businessId);
        await upsertBusiness({
          ...(current ?? {}),
          id: draft.business.businessId,
          owner_id: user.id,
          business_name: name || draft.business.businessName || "Negócio",
          category: category || draft.business.category || "other",
          city: city || draft.business.city || "",
          country: draft.business.country || tr("defaultCountry"),
          gallery: next,
        });
      }
    } catch (err) {
      console.warn("Falha ao enviar fotos da galeria:", err);
      setUploadGalleryError("Não foi possível enviar as fotos. Verifique a ligação e tente novamente.");
    } finally {
      setUploadingGallery(false);
    }
  }

  async function removeGalleryPhoto(idx: number) {
    const removedUrl = gallery[idx];
    const next = gallery.filter((_, i) => i !== idx);
    setGallery(next);
    updateBusiness({ gallery: next });
    if (removedUrl) void deleteMediaByUrl(removedUrl);
    if (user && draft.business.businessId) {
      try {
        const current = await fetchBusinessById(draft.business.businessId);
        await upsertBusiness({
          ...(current ?? {}),
          id: draft.business.businessId,
          owner_id: user.id,
          business_name: name || draft.business.businessName || "Negócio",
          category: category || draft.business.category || "other",
          city: city || draft.business.city || "",
          country: draft.business.country || tr("defaultCountry"),
          gallery: next,
        });
      } catch {
        // ignore
      }
    }
  }

  // Move uma foto para a posição anterior/seguinte — usado pelas setas e
  // como alternativa acessível ao arrastar e soltar (que pode ser difícil
  // de usar em telas pequenas ou para quem prefere não arrastar).
  async function moveGalleryPhoto(idx: number, direction: -1 | 1) {
    const target = idx + direction;
    if (target < 0 || target >= gallery.length) return;
    const next = [...gallery];
    [next[idx], next[target]] = [next[target], next[idx]];
    setGallery(next);
    updateBusiness({ gallery: next });
    if (user && draft.business.businessId) {
      try {
        const current = await fetchBusinessById(draft.business.businessId);
        await upsertBusiness({
          ...(current ?? {}),
          id: draft.business.businessId,
          owner_id: user.id,
          business_name: name || draft.business.businessName || "Negócio",
          category: category || draft.business.category || "other",
          city: city || draft.business.city || "",
          country: draft.business.country || tr("defaultCountry"),
          gallery: next,
        });
      } catch {
        // ignore
      }
    }
  }

  // Reordenação por arrastar e soltar (drag-and-drop).
  async function reorderGalleryByDrag(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    const next = [...gallery];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setGallery(next);
    updateBusiness({ gallery: next });
    if (user && draft.business.businessId) {
      try {
        const current = await fetchBusinessById(draft.business.businessId);
        await upsertBusiness({
          ...(current ?? {}),
          id: draft.business.businessId,
          owner_id: user.id,
          business_name: name || draft.business.businessName || "Negócio",
          category: category || draft.business.category || "other",
          city: city || draft.business.city || "",
          country: draft.business.country || tr("defaultCountry"),
          gallery: next,
        });
      } catch {
        // ignore
      }
    }
  }

  function reorderBlocksByDrag(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    const next = [...blockOrder];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setBlockOrder(next);
  }

  // Trocar de Estrutura muda o conjunto de blocos disponíveis — recomeça
  // a ordem do zero com a ordem-base da nova Estrutura, em vez de
  // arrastar blocos de uma estrutura diferente que já não existem nela.
  function selectStructure(newStructureId: string) {
    setStructureId(newStructureId);
    setBlockOrder(getStructure(family, newStructureId).blocks);
  }

  function setCoverFromGallery(img: string) {
    setCover(img);
    updateBusiness({ coverImage: img });
  }

  // ── produto form ──
  function openAddProduct() {
    setPName("");
    setPDesc("");
    setPPrice("");
    setPCat("");
    setPAvail(true);
    setPImage(undefined);
    setEditProductId(null);
    setShowAddProduct(true);
  }

  function openEditProduct(p: ReturnType<typeof useProducts>["products"][0]) {
    setPName(p.name);
    setPDesc(p.description);
    setPPrice(String(p.price));
    setPCat(p.category);
    setPAvail(p.available);
    setPImage(p.imageUrl);
    setEditProductId(p.id);
    setShowAddProduct(true);
  }

  async function handleProductImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingProductImage(true);
    // BUG CORRIGIDO (2026-08-15): erro de upload da foto do produto só
    // ia para a consola — o comerciante ficava sem foto sem perceber porquê.
    setUploadProductImageError(null);
    try {
      const url = await uploadMedia(file, "product", user.id);
      setPImage(url);
    } catch (err) {
      console.warn("Falha ao enviar a foto do produto:", err);
      setUploadProductImageError("Não foi possível enviar a foto. Verifique a ligação e tente novamente.");
    } finally {
      setUploadingProductImage(false);
    }
  }

  function saveProduct() {
    if (!pName.trim() || !pPrice) return;
    const data = {
      name: pName.trim(),
      description: pDesc.trim(),
      price: parseFloat(pPrice),
      currency: "MZN" as const,
      category: pCat || tr("generalCategory"),
      imageUrl: pImage,
      available: pAvail,
    };
    if (editProductId) {
      update(editProductId, data);
    } else {
      add(data);
    }
    setShowAddProduct(false);
  }

  function toggleDay(i: number) {
    setOpenDays((prev) => (prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i]));
  }

  // ── render ──
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* header */}
      <header
        className="relative overflow-hidden px-5 pb-6 pt-12"
        style={
          appearance.enabled
            ? resolveBackgroundStyle(appearance)
            : { background: "var(--gradient-hero)" }
        }
      >
        {appearance.enabled && <ThemeAnimationOnly appearance={appearance} />}
        <div className="pointer-events-none absolute -right-16 -top-10 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <button
          onClick={() => navigate({ to: "/business" })}
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-white/80"
        >
          <Icon name="arrowLeft" size={14} /> Painel
        </button>
        <div className="relative flex items-end gap-4">
          {/* cover / avatar */}
          <div className="relative">
            <div
              className="h-20 w-20 rounded-2xl border-2 border-white/30 bg-white/20 overflow-hidden flex items-center justify-center cursor-pointer shadow-lg"
              onClick={() => coverRef.current?.click()}
            >
              {cover ? (
                <img src={cover} alt="capa" className="h-full w-full object-cover" />
              ) : (
                <Icon name="camera" size={24} className="text-white/70" />
              )}
              {uploadingCover && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl">
                  <Icon name="pin" size={18} className="animate-spin text-white" />
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity rounded-2xl">
                <Icon name="camera" size={18} className="text-white" />
              </div>
            </div>
            <input
              ref={coverRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCoverUpload}
            />
          </div>
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/70">A editar</div>
            <div className="mt-0.5 text-xl font-bold text-white tracking-tight">
              {name || tr("yourBusinessFallback")}
            </div>
            {cat && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-white/80">
                <Icon name={cat.icon} size={12} /> {cat.label}
              </div>
            )}
          </div>
        </div>

        {/* Ver o perfil como um cliente vê — só faz sentido depois do
            negócio já ter sido criado (tem businessId).
            Antes este botão só navegava para /place/$id sem gravar nada
            primeiro — como a página pública lê sempre os dados direto do
            Supabase (fetchBusinessById), qualquer alteração feita e não
            gravada explicitamente na aba (botão "Guardar…" próprio de
            cada aba) ficava invisível na pré-visualização, parecendo que
            "não gravou". Agora este botão grava a aba activa primeiro. */}
        {draft.business.businessId && (
          <button
            onClick={async () => {
              if (previewLoading) return;
              setPreviewLoading(true);
              try {
                if (tab === "visual") {
                  await saveVisual();
                } else if (tab !== "produtos") {
                  // "perfil", "galeria" e "horario" partilham o mesmo
                  // formulário/estado e são gravados por saveProfile().
                  await saveProfile();
                }
                // "produtos" já grava cada produto de imediato ao
                // confirmar no diálogo — nada para gravar aqui.
                navigate({ to: "/place/$id", params: { id: draft.business.businessId! } });
              } finally {
                setPreviewLoading(false);
              }
            }}
            disabled={previewLoading || isBlocked || isOverdue}
            className="press mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/10 py-2.5 text-xs font-semibold text-white backdrop-blur-sm disabled:opacity-60"
          >
            {previewLoading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />{" "}
                A gravar…
              </>
            ) : (
              <>
                <Icon name="compass" size={14} /> {tr("previewPublicProfile")}
              </>
            )}
          </button>
        )}

        {/* tabs */}
        <div className="mt-5 flex gap-1 rounded-2xl bg-black/20 p-1">
          {(["perfil", "visual", "galeria", "produtos", "horario"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-xl py-2 text-[11px] font-semibold capitalize transition-all flex items-center justify-center gap-1 ${
                tab === t ? "bg-white text-foreground shadow" : "text-white/70"
              }`}
            >
              {t === "perfil"
                ? tr("tabPerfil")
                : t === "visual"
                  ? tr("tabVisual")
                  : t === "galeria"
                    ? tr("tabGaleria")
                    : t === "produtos"
                      ? tr("tabProdutos")
                      : tr("tabHorario")}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 px-5 py-5 pb-28 space-y-5">
        {(isBlocked || isOverdue) && (
          <div className="flex items-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-3.5 text-sm text-destructive">
            <Icon name="lock" size={16} className="shrink-0" />
            <span>
              {isBlocked ? tr("accountBlockedTitle") + "." : tr("paymentOverdue") + "."}{" "}
              {tr("blockedEditHint")}o perfil.
            </span>
          </div>
        )}

        {/* ── aba: perfil ── */}
        {tab === "perfil" && (
          <div className="space-y-4 animate-slide-up">
            <Section title={tr("businessInfoSectionTitle")}>
              <Field label={tr("businessNameLabel2")}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={tr("businessNamePlaceholder")}
                  className="input-base"
                />
              </Field>
              <Field label={tr("categoryLabel2")}>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="input-base"
                >
                  <option value="">Selecionar categoria</option>
                  {BUSINESS_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={tr("descriptionLabel2")}>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}
                  placeholder={tr("descriptionPlaceholder")}
                  className="input-base resize-none"
                />
              </Field>
              <Field label={tr("tagsLabel")}>
                <input
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder={tr("tagsPlaceholder")}
                  className="input-base"
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground">{tr("tagsHint")}</p>
              </Field>

              {/* Toggle: negócio digital (sem loja física) */}
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                      É um negócio digital
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {tr("noPhysicalStore")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDigital((v) => !v)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${isDigital ? "bg-violet-600" : "bg-muted"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isDigital ? "translate-x-5" : "translate-x-0.5"}`}
                    />
                  </button>
                </div>
                {isDigital && (
                  <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-violet-50 px-3 py-2 text-[11px] text-violet-700">
                    <Icon name="delivery" size={12} />O teu negócio aparecerá na categoria "Online"
                    — sem distância nem mapa.
                  </div>
                )}
              </div>

              {/* Campo de localização — escondido quando é negócio digital */}
              {!isDigital && (
                <>
                  {/* Província é o que decide quem vê o negócio na Home/
                      Busca (ver mozambique-locations.ts) — só disponível
                      para Moçambique, onde há lista curada. */}
                  {(draft.business.country || "Moçambique") === "Moçambique" ? (
                    <>
                      <Field label={tr("provinceLabel")}>
                        <select
                          value={province}
                          onChange={(e) => {
                            setProvince(e.target.value);
                            setCity(""); // trocar de província limpa a cidade antiga
                          }}
                          className="input-base"
                        >
                          <option value="">{tr("selectProvincePlaceholder")}</option>
                          {PROVINCES_MZ.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {province && (
                        <Field label={tr("cityLabel")}>
                          <select
                            value={citiesForProvince(province).includes(city) ? city : ""}
                            onChange={(e) => setCity(e.target.value)}
                            className="input-base"
                          >
                            <option value="">{tr("selectCityPlaceholder")}</option>
                            {citiesForProvince(province).map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          {/* Se a cidade guardada não está na lista (dado
                              antigo, ou vila não coberta), mostra um
                              campo de texto para não perder o valor. */}
                          {city && !citiesForProvince(province).includes(city) && (
                            <input
                              value={city}
                              onChange={(e) => setCity(e.target.value)}
                              placeholder={tr("cityPlaceholder")}
                              className="input-base mt-1.5"
                            />
                          )}
                        </Field>
                      )}
                    </>
                  ) : (
                    <Field label={tr("cityProvinceLabel")}>
                      <input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder={tr("cityPlaceholder")}
                        className="input-base"
                      />
                    </Field>
                  )}
                  <Field label={tr("neighborhoodLabel")}>
                    <input
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder={tr("neighborhoodPlaceholder")}
                      className="input-base"
                    />
                  </Field>

                  <Field label={tr("exactLocationLabel")}>
                    <p className="mb-2 -mt-1 text-[11px] text-muted-foreground">
                      Mantenha a localização exacta actualizada — é o que leva os clientes até à
                      porta certa.
                    </p>
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      disabled={locatingGPS}
                      className="press flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 text-sm font-semibold text-primary disabled:opacity-60"
                    >
                      <Icon name="pin" size={15} className={locatingGPS ? "animate-spin" : ""} />
                      {locatingGPS ? "A obter localização…" : "Usar a minha localização actual"}
                    </button>
                    {gpsError && (
                      <p className="mt-1.5 text-[11px] text-amber-600">
                        Não conseguimos aceder à sua localização. Verifique se permitiu o acesso
                        ao GPS, ou cole o link abaixo.
                      </p>
                    )}
                    <div className="mt-2.5 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <div className="h-px flex-1 bg-border" />
                      ou cole manualmente
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <input
                      value={mapsLink}
                      onChange={(e) => void handleMapsLinkChange(e.target.value)}
                      placeholder={tr("googleMapsPlaceholder")}
                      className="input-base mt-2"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Link do Google Maps (curto ou longo) ou código de mais/plus code.
                    </p>
                    {resolvingLink && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Icon name="pin" size={11} className="animate-spin" /> A verificar
                        localização…
                      </div>
                    )}
                    {!resolvingLink && mapsLink && (
                      <div
                        className={`mt-1.5 flex items-center gap-1.5 text-[11px] ${mapsCoords ? "text-emerald-600" : "text-amber-600"}`}
                      >
                        <Icon name={mapsCoords ? "check" : "alert"} size={12} />
                        {mapsCoords
                          ? `Localização encontrada (${mapsCoords.lat.toFixed(4)}, ${mapsCoords.lng.toFixed(4)})`
                          : tr("coordsReadError")}
                      </div>
                    )}
                  </Field>
                </>
              )}
            </Section>

            <Section title={tr("contactsSectionTitle")}>
              <Field label={tr("phoneWhatsAppLabel")}>
                <div className="flex items-center gap-2">
                  <span className="flex h-11 items-center rounded-xl border border-border bg-muted px-3 text-sm text-muted-foreground">
                    +258
                  </span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="84 000 0000"
                    type="tel"
                    className="input-base flex-1"
                  />
                </div>
              </Field>
              <Field label={tr("websiteLabel")}>
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder={tr("websitePlaceholder")}
                  type="url"
                  className="input-base"
                />
              </Field>
              <Field label={tr("ownerNameLabel")}>
                <input
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder={tr("yourNamePlaceholder")}
                  className="input-base"
                />
              </Field>
            </Section>

            <Section title={tr("planBenefitsSectionTitle")}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Selo de verificação</span>
                {plan.hasVerifiedBadge ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    <Icon name="verified" size={12} /> Activo
                  </span>
                ) : (
                  <button
                    onClick={() => navigate({ to: "/subscribe" })}
                    className="text-[11px] font-semibold text-primary underline"
                  >
                    Upgrade p/ Premium
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Suporte da empresa</span>
                {plan.hasCompanySupport ? (
                  <Link
                    to="/profile"
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"
                  >
                    <Icon name="help" size={12} /> Contactar
                  </Link>
                ) : (
                  <button
                    onClick={() => navigate({ to: "/subscribe" })}
                    className="text-[11px] font-semibold text-primary underline"
                  >
                    Upgrade p/ Premium
                  </button>
                )}
              </div>
            </Section>

            <button
              onClick={saveProfile}
              disabled={isBlocked || isOverdue || syncing}
              className="press w-full h-12 rounded-2xl text-sm font-bold text-white shadow-[var(--shadow-soft)] flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}
            >
              {syncing ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  A guardar…
                </>
              ) : saved ? (
                <>
                  <Icon name="check" size={16} /> Guardado!
                </>
              ) : (
                <>
                  <Icon name="send" size={16} /> Guardar alterações
                </>
              )}
            </button>
            {saveError && (
              <p className="mt-1.5 text-xs text-destructive font-medium text-center">{saveError}</p>
            )}
          </div>
        )}

        {/* ── aba: visual (Estrutura & Tema do perfil) ── */}
        {tab === "visual" && (
          <div className="space-y-5 animate-slide-up">
            {/* Explicação geral no topo — antes cada bloco tinha a sua
                mini-explicação técnica e não ficava claro que os 3
                escolhem coisas diferentes do MESMO perfil. */}
            <div className="rounded-2xl bg-primary/5 px-3.5 py-3 text-[11px] leading-relaxed text-foreground">
              <span className="font-semibold">{tr("visualIntroTitle")}</span>{" "}
              {tr("visualIntroBody")}
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-foreground">{tr("whatAppearsTitle")}</p>
              <p className="mb-3 text-[11px] text-muted-foreground">
                {tr("whatAppearsBody")} {tr("structuresAvailableFor")}{" "}
                {cat?.label ?? tr("thisTypeOfBusiness")} —{" "}
                {tr("planIncludesN")
                  .replace("{n}", String(plan.maxStructures))
                  .replace("{plan}", plan.name)}
                .
              </p>
              <div className="flex flex-wrap gap-2">
                {getAvailableStructures(family, plan.maxStructures).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => selectStructure(s.id)}
                    className={`press flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                      structureId === s.id
                        ? "text-primary-foreground"
                        : "border border-border text-foreground"
                    }`}
                    style={structureId === s.id ? { background: "var(--gradient-primary)" } : {}}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {/* BUG CORRIGIDO: comparava sempre com 6 (máximo global),
                  mas famílias como "loja" (4), "saude_servicos" (4) e
                  "outros" (3) têm menos estruturas no total — mostrava
                  este botão de upgrade prometendo mais estruturas que
                  na verdade não existem para essas categorias. Agora
                  compara com o total real de estruturas da família do
                  negócio. */}
              {plan.maxStructures < STRUCTURES_BY_FAMILY[family].length && (
                <button
                  onClick={() => navigate({ to: "/subscribe" })}
                  className="press mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-primary"
                >
                  <Icon name="lock" size={12} /> {tr("seeMoreStructuresUpgrade")}
                </button>
              )}

              {/* Simplificação (2026-07-07): "Ordem dos blocos" era uma
                  secção separada, à parte, e confundia-se com a escolha
                  de Estrutura acima — parecia a mesma coisa duas vezes.
                  Agora fica junto, escondida atrás de um toggle, só para
                  quem realmente quer mudar a ordem que a Estrutura já
                  trouxe (a maioria dos comerciantes não precisa). */}
              <button
                onClick={() => setShowBlockOrder((v) => !v)}
                className="press mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"
              >
                <Icon name={showBlockOrder ? "chevronDown" : "chevronRight"} size={12} />
                {tr("customizeBlockOrderToggle")}
              </button>
              {showBlockOrder && (
                <div className="mt-2.5 space-y-1.5 rounded-2xl border border-dashed border-border p-3">
                  <p className="mb-1 text-[11px] text-muted-foreground">{tr("blockOrderHint")}</p>
                  {blockOrder.map((blockId, idx) => (
                    <div
                      key={`${blockId}-${idx}`}
                      draggable
                      onDragStart={() => setDraggedBlockIdx(idx)}
                      onDragEnter={() => {
                        if (draggedBlockIdx !== null && draggedBlockIdx !== idx)
                          setDragOverBlockIdx(idx);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedBlockIdx !== null) reorderBlocksByDrag(draggedBlockIdx, idx);
                        setDraggedBlockIdx(null);
                        setDragOverBlockIdx(null);
                      }}
                      onDragEnd={() => {
                        setDraggedBlockIdx(null);
                        setDragOverBlockIdx(null);
                      }}
                      className={`flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 cursor-grab active:cursor-grabbing transition-opacity ${
                        draggedBlockIdx === idx ? "opacity-40" : ""
                      } ${dragOverBlockIdx === idx ? "ring-2 ring-primary" : ""}`}
                    >
                      <Icon name="dot" size={14} className="text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground">
                        {BLOCK_LABELS[blockId] ?? blockId}
                      </span>
                      {ADVANCED_BLOCKS.has(blockId) && (
                        <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">
                          PLANO PAGO
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tema + Fundo eram duas secções separadas ao mesmo nível
                que "Estrutura" — mas são as duas só sobre aparência
                (cor/imagem), nunca sobre o que aparece. Agrupadas numa
                única secção "Aparência" para ficar claro que são as
                duas metades da mesma decisão (podes combinar as duas). */}
            <div>
              <p className="mb-1 text-sm font-semibold text-foreground">{tr("appearanceTitle")}</p>
              <p className="mb-3 text-[11px] text-muted-foreground">{tr("appearanceBody")}</p>

              <p className="mb-1.5 text-[11px] font-semibold text-foreground">
                {tr("colorSubLabel")}
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.values(THEMES).map((th) => (
                  <button
                    key={th.id}
                    onClick={() => setThemeId(th.id)}
                    className={`press flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                      themeId === th.id ? "ring-2" : "border border-border"
                    }`}
                    style={{
                      background: themeId === th.id ? th.accentSoft : undefined,
                      color: themeId === th.id ? th.accent : undefined,
                      ...(themeId === th.id ? { boxShadow: `0 0 0 1px ${th.accent}` } : {}),
                    }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: th.accent }} />
                    {th.label}
                    {th.glow && <Icon name="sparkles" size={11} />}
                  </button>
                ))}
              </div>

              <p className="mb-1.5 mt-4 text-[11px] font-semibold text-foreground">
                {tr("backgroundSubLabel")}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setBackgroundId(undefined)}
                  className={`press rounded-full px-3.5 py-2 text-xs font-semibold ${
                    !backgroundId
                      ? "text-primary-foreground"
                      : "border border-border text-foreground"
                  }`}
                  style={!backgroundId ? { background: "var(--gradient-primary)" } : {}}
                >
                  {tr("noBackgroundOption")}
                </button>
                {BACKGROUND_GALLERY.map((bg) => (
                  <button
                    key={bg.id}
                    onClick={() => setBackgroundId(bg.id)}
                    className={`press overflow-hidden rounded-full border-2 ${
                      backgroundId === bg.id ? "border-primary" : "border-transparent"
                    }`}
                  >
                    <BackgroundThumb backgroundId={bg.id} label={bg.label} />
                  </button>
                ))}
              </div>
            </div>

            {swapsUsed !== null && (
              <p className="text-[11px] text-muted-foreground">
                Trocas de Estrutura/Tema usadas este mês: {swapsUsed} de {plan.themeSwapsPerMonth}{" "}
                (incluídas no plano {plan.name}). Reordenar os blocos não conta como troca.
              </p>
            )}
            {visualError && (
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                {visualError}
              </p>
            )}

            <button
              onClick={saveVisual}
              disabled={isBlocked || isOverdue}
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-primary-foreground disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}
            >
              {visualSaved ? (
                <>
                  <Icon name="check" size={16} /> Guardado!
                </>
              ) : (
                <>
                  <Icon name="send" size={16} /> Guardar aparência
                </>
              )}
            </button>

            {/* Antes só havia o botão "Ver perfil público" lá no topo do
                painel — aqui, logo a seguir a gravar, é onde faz mais
                sentido ir ver o resultado imediatamente. */}
            {draft.business.businessId && (
              <button
                onClick={async () => {
                  await saveVisual();
                  navigate({ to: "/place/$id", params: { id: draft.business.businessId! } });
                }}
                disabled={isBlocked || isOverdue}
                className="press flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border text-xs font-semibold text-foreground disabled:opacity-50"
              >
                <Icon name="compass" size={14} /> {tr("saveAndPreview")}
              </button>
            )}
          </div>
        )}

        {/* ── aba: galeria ── */}
        {tab === "galeria" && (
          <div className="space-y-5 animate-slide-up">
            {/* capa */}
            <Section title={tr("coverPhotoSectionTitle")}>
              <div
                className="relative h-44 w-full rounded-2xl border-2 border-dashed border-border bg-muted overflow-hidden flex items-center justify-center cursor-pointer group"
                onClick={() => coverRefBig.current?.click()}
              >
                {cover ? (
                  <>
                    <img src={cover} alt="capa" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Icon name="camera" size={24} className="text-white" />
                      <span className="text-xs text-white font-medium">Alterar foto</span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Icon name="image" size={32} />
                    <span className="text-sm font-medium">Toque para adicionar capa</span>
                    <span className="text-xs">JPG, PNG — recomendado 1200×400</span>
                  </div>
                )}
                {uploadingCover && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50">
                    <Icon name="pin" size={22} className="animate-spin text-white" />
                    <span className="text-xs text-white font-medium">A enviar…</span>
                  </div>
                )}
              </div>
              <input
                ref={coverRefBig}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCoverUpload}
              />
              {uploadCoverError && (
                <p className="mt-1 text-xs text-destructive font-medium">{uploadCoverError}</p>
              )}
            </Section>

            {/* galeria */}
            <Section
              title={`Galeria (${gallery.length}/${GALLERY_LIMIT})`}
              action={
                gallery.length < GALLERY_LIMIT ? (
                  <button
                    onClick={() => galleryRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary"
                  >
                    <Icon name="plus" size={13} /> Adicionar
                  </button>
                ) : undefined
              }
            >
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleGalleryUpload}
              />
              {uploadingGallery && (
                <div className="mb-2 flex items-center gap-1.5 text-[11px] text-primary">
                  <Icon name="pin" size={11} className="animate-spin" /> A enviar fotos…
                </div>
              )}
              {uploadGalleryError && (
                <p className="mb-2 text-xs text-destructive font-medium">{uploadGalleryError}</p>
              )}
              {gallery.length === 0 ? (
                <button
                  onClick={() => galleryRef.current?.click()}
                  className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-muted-foreground"
                >
                  <Icon name="camera" size={28} />
                  <span className="text-sm">Adicionar fotos do negócio</span>
                </button>
              ) : (
                <>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    Arraste as fotos para reordenar, ou use as setas. A primeira foto é a que
                    aparece em destaque na lista de pesquisa.
                  </p>
                  {gallery.length > GALLERY_LIMIT && (
                    <p className="mb-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700">
                      As últimas {gallery.length - GALLERY_LIMIT} foto(s) estão guardadas mas
                      ocultas no seu perfil público — o plano {plan.name} mostra até {GALLERY_LIMIT}
                      . Fazer upgrade torna-as visíveis de novo, sem precisar de as carregar outra
                      vez.
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {gallery.map((img, idx) => (
                      <div
                        key={idx}
                        draggable
                        onDragStart={() => setDraggedIdx(idx)}
                        onDragEnter={() => {
                          if (draggedIdx !== null && draggedIdx !== idx) setDragOverIdx(idx);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedIdx !== null) reorderGalleryByDrag(draggedIdx, idx);
                          setDraggedIdx(null);
                          setDragOverIdx(null);
                        }}
                        onDragEnd={() => {
                          setDraggedIdx(null);
                          setDragOverIdx(null);
                        }}
                        className={`relative aspect-square rounded-xl overflow-hidden group cursor-grab active:cursor-grabbing transition-opacity ${
                          draggedIdx === idx ? "opacity-40" : ""
                        } ${dragOverIdx === idx ? "ring-2 ring-primary" : ""} ${
                          idx >= GALLERY_LIMIT ? "opacity-50" : ""
                        }`}
                      >
                        <img
                          src={img}
                          alt=""
                          className="h-full w-full object-cover pointer-events-none"
                        />
                        {idx >= GALLERY_LIMIT && (
                          <div className="absolute inset-x-0 top-0 bg-amber-500/90 px-1 py-0.5 text-center text-[8px] font-bold text-white">
                            OCULTA
                          </div>
                        )}
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setCoverFromGallery(img)}
                            className="rounded-lg bg-white/20 px-2 py-1 text-[10px] text-white font-medium"
                          >
                            Usar como capa
                          </button>
                          <button
                            onClick={() => removeGalleryPhoto(idx)}
                            className="rounded-lg bg-destructive/80 px-2 py-1 text-[10px] text-white font-medium"
                          >
                            Remover
                          </button>
                        </div>
                        {/* setas de reordenação — alternativa ao arrastar, sempre visíveis em ecrãs tácteis */}
                        <div className="absolute bottom-1 right-1 flex gap-0.5">
                          {idx > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveGalleryPhoto(idx, -1);
                              }}
                              className="grid h-5 w-5 place-items-center rounded-md bg-black/60 text-white"
                              title={tr("moveLeftTitle")}
                            >
                              <Icon name="chevronLeft" size={11} />
                            </button>
                          )}
                          {idx < gallery.length - 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveGalleryPhoto(idx, 1);
                              }}
                              className="grid h-5 w-5 place-items-center rounded-md bg-black/60 text-white"
                              title={tr("moveRightTitle")}
                            >
                              <Icon name="chevronRight" size={11} />
                            </button>
                          )}
                        </div>
                        {cover === img && (
                          <div className="absolute top-1 left-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-white">
                            CAPA
                          </div>
                        )}
                      </div>
                    ))}
                    {gallery.length < GALLERY_LIMIT && (
                      <button
                        onClick={() => galleryRef.current?.click()}
                        className="aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground"
                      >
                        <Icon name="plus" size={20} />
                        <span className="text-[10px] mt-1">Adicionar</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </Section>

            <button
              onClick={saveProfile}
              disabled={isBlocked || isOverdue}
              className="press w-full h-12 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}
            >
              {saved ? (
                <>
                  <Icon name="check" size={16} /> Guardado!
                </>
              ) : (
                <>
                  <Icon name="send" size={16} /> Guardar fotos
                </>
              )}
            </button>
          </div>
        )}

        {/* ── aba: produtos ── */}
        {tab === "produtos" && (
          <div className="space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Produtos e serviços</p>
                <p className="text-xs text-muted-foreground">
                  {products.length}/{plan.maxProducts} do seu plano
                </p>
              </div>
              {products.length < plan.maxProducts && (
                <button
                  onClick={openAddProduct}
                  className="press flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  <Icon name="plus" size={13} /> Adicionar
                </button>
              )}
            </div>

            {products.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border py-10 text-center">
                <Icon name="tag" size={32} className="text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Nenhum produto ainda</p>
                <p className="text-xs text-muted-foreground px-8">
                  Adicione produtos ou serviços para os clientes verem no seu perfil.
                </p>
                <button
                  onClick={openAddProduct}
                  className="press mt-1 rounded-full px-5 py-2.5 text-xs font-semibold text-white"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  Adicionar primeiro produto
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-soft)]"
                  >
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="h-14 w-14 rounded-xl object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                        <Icon name="tag" size={20} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                        {!p.available && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                            Indisponível
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{p.description}</p>
                      <p className="mt-0.5 text-sm font-bold text-primary">
                        {p.price.toLocaleString("pt-MZ")} MZN
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5 items-end">
                      <button
                        onClick={() => openEditProduct(p)}
                        className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <Icon name="schedule" size={14} />
                      </button>
                      <button
                        onClick={() => toggle(p.id)}
                        className={`rounded-lg border p-1.5 transition-colors ${p.available ? "border-emerald-300 text-emerald-600" : "border-border text-muted-foreground"}`}
                      >
                        <Icon name="check" size={14} />
                      </button>
                      <button
                        onClick={() => remove(p.id)}
                        className="rounded-lg border border-destructive/30 p-1.5 text-destructive/70"
                      >
                        <Icon name="logout" size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── aba: horário ── */}
        {tab === "horario" && (
          <div className="space-y-4 animate-slide-up">
            <Section title={tr("statusSectionTitle")}>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-foreground">Aberto 24 horas</p>
                  <p className="text-xs text-muted-foreground">Ignora os horários abaixo</p>
                </div>
                <div
                  onClick={() => setAlwaysOpen(!alwaysOpen)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${alwaysOpen ? "bg-primary" : "bg-muted"}`}
                >
                  <div
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${alwaysOpen ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </div>
              </label>
            </Section>

            {!alwaysOpen && (
              <>
                <Section title={tr("workingDaysSectionTitle")}>
                  <div className="flex gap-2 flex-wrap">
                    {DAYS.map((d, i) => (
                      <button
                        key={d}
                        onClick={() => toggleDay(i)}
                        className={`press h-9 w-9 rounded-xl text-xs font-semibold transition-all ${
                          openDays.includes(i)
                            ? "text-white shadow-[var(--shadow-soft)]"
                            : "border border-border text-muted-foreground"
                        }`}
                        style={
                          openDays.includes(i) ? { background: "var(--gradient-primary)" } : {}
                        }
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </Section>

                <Section title={tr("hoursSectionTitle")}>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={tr("openingTimeLabel")}>
                      <input
                        type="time"
                        value={openTime}
                        onChange={(e) => setOpenTime(e.target.value)}
                        className="input-base"
                      />
                    </Field>
                    <Field label={tr("closingTimeLabel")}>
                      <input
                        type="time"
                        value={closeTime}
                        onChange={(e) => setCloseTime(e.target.value)}
                        className="input-base"
                      />
                    </Field>
                  </div>
                </Section>

                {/* preview visual */}
                <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Pré-visualização
                  </p>
                  <div className="space-y-1.5">
                    {DAYS.map((d, i) => {
                      const isOpen = openDays.includes(i);
                      return (
                        <div key={d} className="flex items-center justify-between text-sm">
                          <span
                            className={`font-medium ${isOpen ? "text-foreground" : "text-muted-foreground/50"}`}
                          >
                            {d}
                          </span>
                          <span className={isOpen ? "text-foreground" : "text-muted-foreground/50"}>
                            {isOpen ? `${openTime} – ${closeTime}` : tr("closedLabel")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <button
              onClick={saveProfile}
              disabled={isBlocked || isOverdue}
              className="press w-full h-12 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}
            >
              {saved ? (
                <>
                  <Icon name="check" size={16} /> Guardado!
                </>
              ) : (
                <>
                  <Icon name="send" size={16} /> Guardar horário
                </>
              )}
            </button>
          </div>
        )}
      </main>

      {/* ── modal: adicionar / editar produto ── */}
      {showAddProduct && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddProduct(false);
          }}
        >
          <div className="w-full rounded-t-3xl bg-background p-5 pb-10 animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">
                {editProductId ? tr("editProductTitle") : tr("newProductTitle")}
              </h2>
              <button
                onClick={() => setShowAddProduct(false)}
                className="rounded-xl border border-border p-2 text-muted-foreground"
              >
                <Icon name="arrowLeft" size={16} />
              </button>
            </div>

            {/* imagem do produto */}
            <div
              className="mb-4 relative h-36 w-full rounded-2xl border-2 border-dashed border-border bg-muted overflow-hidden flex items-center justify-center cursor-pointer group"
              onClick={() => pImageRef.current?.click()}
            >
              {pImage ? (
                <>
                  <img src={pImage} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Icon name="camera" size={22} className="text-white" />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Icon name="image" size={28} />
                  <span className="text-xs">Foto do produto (opcional)</span>
                </div>
              )}
              {uploadingProductImage && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Icon name="pin" size={20} className="animate-spin text-white" />
                </div>
              )}
            </div>
            <input
              ref={pImageRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleProductImage}
            />
            {uploadProductImageError && (
              <p className="mt-1 text-xs text-destructive font-medium text-center">{uploadProductImageError}</p>
            )}

            <div className="space-y-3">
              <Field label={tr("productNameLabel2")}>
                <input
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  placeholder={tr("productNamePlaceholder2")}
                  className="input-base"
                />
              </Field>
              <Field label={tr("descriptionLabel2")}>
                <textarea
                  value={pDesc}
                  onChange={(e) => setPDesc(e.target.value)}
                  rows={2}
                  placeholder={tr("briefDescPlaceholder")}
                  className="input-base resize-none"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={tr("priceRequiredLabel")}>
                  <input
                    value={pPrice}
                    onChange={(e) => setPPrice(e.target.value)}
                    placeholder="0.00"
                    type="number"
                    min="0"
                    className="input-base"
                  />
                </Field>
                <Field label={tr("categoryLabel2")}>
                  <input
                    value={pCat}
                    onChange={(e) => setPCat(e.target.value)}
                    placeholder={tr("productCatPlaceholder")}
                    className="input-base"
                  />
                </Field>
              </div>
              <label className="flex items-center justify-between">
                <span className="text-sm text-foreground">Disponível agora</span>
                <div
                  onClick={() => setPAvail(!pAvail)}
                  className={`relative h-6 w-11 rounded-full transition-colors cursor-pointer ${pAvail ? "bg-primary" : "bg-muted"}`}
                >
                  <div
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${pAvail ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </div>
              </label>
            </div>

            <button
              onClick={saveProduct}
              disabled={!pName.trim() || !pPrice}
              className="press mt-5 w-full h-12 rounded-2xl text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Icon name="check" size={16} /> {editProductId ? "Actualizar" : "Adicionar produto"}
            </button>
          </div>
        </div>
      )}

      <BusinessBottomNav />

      {/* estilos inline para os inputs */}
      <style>{`
        .input-base {
          width: 100%;
          height: 2.75rem;
          border-radius: 0.75rem;
          border: 1px solid var(--border);
          background: var(--input);
          padding: 0 0.75rem;
          font-size: 0.875rem;
          color: var(--foreground);
          outline: none;
          transition: border-color 0.15s;
        }
        .input-base:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px oklch(0.66 0.19 38 / 0.12);
        }
        textarea.input-base {
          height: auto;
          padding-top: 0.625rem;
          padding-bottom: 0.625rem;
        }
        select.input-base {
          appearance: none;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

// ─── sub-componentes ──────────────────────────────────────────────────────────
// Carrega a miniatura de uma imagem de fundo via import() dinâmico
// (ver getGalleryImageUrl em profile-styles.ts) — evita que as imagens
// (base64, ~8.3MB no total) entrem no ficheiro principal do app.
function BackgroundThumb({ backgroundId, label }: { backgroundId: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getGalleryImageUrl(backgroundId).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [backgroundId]);

  if (!url) {
    return <div className="h-9 w-16 animate-pulse bg-muted" />;
  }
  return <img src={url} alt={label} className="h-9 w-16 object-cover" loading="lazy" />;
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
