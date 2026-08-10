import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { CATEGORY_FILTERS } from "@/lib/places-data";
import { useDiscoverPlaces } from "@/lib/businesses-db";
import { useOnboarding } from "@/lib/onboarding-storage";
import { PlaceCard } from "@/components/PlaceCard";
import { BottomNav } from "@/components/BottomNav";
import { Icon } from "@/components/Icon";
import {
  getUserLocation,
  distanceKm as calculateDistanceKm,
  type Coordinates,
} from "@/lib/geo-utils";
import { getActiveBoostedBusinessIds, applyBoostOrder } from "@/lib/boost-storage";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "Buscar — Spotter Local" }] }),
  component: SearchPage,
});

type Sort = "distance" | "rating" | "name" | "price";

function SearchPage() {
  const tr = useT();
  // BUG CORRIGIDO (2026-07-07): esta página carregava negócios do país
  // inteiro sem nenhum filtro de cidade — um utilizador em Manica podia
  // ver (e encontrar por nome) negócios de Inhambane, só porque a Home
  // filtra por cidade mas a Busca nunca filtrava. Decisão do Abrão: por
  // omissão restringe à cidade do utilizador, com opção de expandir ao
  // país inteiro (`nationwide`), útil por exemplo para quem procura
  // antes de viajar.
  const { draft } = useOnboarding();
  const profile = draft.profileType === "business" ? draft.business : draft.personal;
  const profileCity = profile.city?.trim();
  const profileProvince = profile.province?.trim();
  const [nationwide, setNationwide] = useState(false);
  // Sem cidade/província guardada no perfil (ainda não preencheu, ou
  // negócio digital sem localização) não há o que restringir — cai
  // para nacional automaticamente, sem mostrar uma lista vazia sem
  // motivo.
  const { places: allPlaces } = useDiscoverPlaces(
    nationwide || (!profileProvince && !profileCity)
      ? undefined
      : { province: profileProvince, city: profileCity },
  );
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("distance");
  const [boostedIds, setBoostedIds] = useState<string[]>([]);

  useEffect(() => {
    getActiveBoostedBusinessIds().then(setBoostedIds);
  }, []);

  useEffect(() => {
    getUserLocation().then(setUserLocation);
  }, []);

  const results = useMemo(() => {
    let list = allPlaces.map((p) => {
      if (userLocation && typeof p.lat === "number" && typeof p.lng === "number") {
        return { ...p, distanceKm: calculateDistanceKm(userLocation, { lat: p.lat, lng: p.lng }) };
      }
      if (!p.lat || !p.lng) return { ...p, distanceKm: Infinity };
      return p;
    });

    if (cat === "online") {
      list = list.filter((p) => p.isDigital);
      if (q) {
        const s = q.toLowerCase();
        list = list.filter((p) =>
          [p.name, p.categoryLabel, p.tags.join(" "), p.description].some((x) =>
            x.toLowerCase().includes(s),
          ),
        );
      }
      list.sort((a, b) => b.rating - a.rating);
    } else {
      list = list.filter((p) => !p.isDigital);
      list = list.filter((p) => {
        if (cat !== "all" && p.category !== cat) return false;
        if (openOnly && !p.openNow) return false;
        if (q) {
          const s = q.toLowerCase();
          return [p.name, p.categoryLabel, p.tags.join(" "), p.description].some((x) =>
            x.toLowerCase().includes(s),
          );
        }
        return true;
      });
      if (sort === "distance") {
        list.sort((a, b) => {
          if (!isFinite(a.distanceKm) && !isFinite(b.distanceKm)) return 0;
          if (!isFinite(a.distanceKm)) return 1;
          if (!isFinite(b.distanceKm)) return -1;
          return a.distanceKm - b.distanceKm;
        });
      }
      if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
      if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "pt"));
      if (sort === "price") list.sort((a, b) => a.priceLevel - b.priceLevel);
    }

    // O destaque ("Turbinar") só se sobrepõe em ordenações de descoberta
    // geral (distância/rating). Em "nome" ou "preço" o utilizador pediu
    // uma ordem específica, que deve ser respeitada sem excepções.
    if (cat !== "online" && (sort === "distance" || sort === "rating")) {
      const boostedSet = new Set(boostedIds);
      list = list.map((p) => (boostedSet.has(p.id) ? { ...p, boosted: true } : p));
      list = applyBoostOrder(list, boostedIds);
    }
    return list;
  }, [allPlaces, userLocation, q, cat, openOnly, sort, boostedIds]);

  const SORT_OPTIONS: { value: Sort; label: string; icon: string }[] = [
    { value: "distance", label: tr("sortNearest"), icon: "navigation" },
    { value: "rating", label: tr("sortBestRated"), icon: "star" },
    { value: "name", label: tr("sortNameAZ"), icon: "search" },
    { value: "price", label: tr("sortCheapest"), icon: "tag" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-5 pb-3 pt-12 backdrop-blur-xl">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{tr("searchTitle")}</h1>

        {/* Campo de pesquisa */}
        <div className="relative mt-3">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            autoFocus
            placeholder={tr("searchInputPlaceholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-12 rounded-2xl pl-10"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <Icon name="arrowLeft" size={14} />
            </button>
          )}
        </div>

        {/* Filtro por categoria */}
        <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CATEGORY_FILTERS.map((c) => {
            const on = cat === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`press flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground"
                }`}
              >
                <Icon name={c.icon} size={12} /> {c.label}
              </button>
            );
          })}
        </div>

        {/* Alcance da busca: só a cidade do utilizador (omissão) ou país
            inteiro. Escondido para negócios digitais (já são nacionais
            por natureza) ou quando não há cidade guardada no perfil. */}
        {cat !== "online" && (profileProvince || profileCity) && (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setNationwide(false)}
              className={`press flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                !nationwide
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              <Icon name="pin" size={12} /> {profileProvince || profileCity}
            </button>
            <button
              onClick={() => setNationwide(true)}
              className={`press flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                nationwide
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              <Icon name="tourism" size={12} /> {tr("searchScopeCountry")}
            </button>
          </div>
        )}

        {/* Ordenação + Aberto agora — oculto na aba Online */}
        {cat !== "online" && (
          <div className="mt-3 flex items-center gap-2">
            {/* Toggle aberto agora */}
            <button
              onClick={() => setOpenOnly((v) => !v)}
              className={`press flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                openOnly
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-700"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${openOnly ? "bg-emerald-500" : "bg-muted-foreground"}`}
              />
              {tr("openNowFilter")}
            </button>

            {/* Botões de ordenação */}
            <div className="flex flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setSort(o.value)}
                  className={`press flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition ${
                    sort === o.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  <Icon name={o.icon} size={11} /> {o.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {cat === "online" && (
          <div className="mt-3 flex items-center gap-1.5 rounded-2xl bg-violet-50 px-3 py-2 text-[11px] text-violet-700">
            <Icon name="delivery" size={12} />
            Serviços digitais · disponíveis em todo o país
          </div>
        )}
      </header>

      <main className="flex-1 space-y-4 px-5 py-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {results.length} {results.length === 1 ? tr("resultCount") : tr("resultCountPlural")}
          </span>
          {q && (
            <span>
              {tr("forQuery")} "<strong className="text-foreground">{q}</strong>"
            </span>
          )}
        </div>

        <div className="space-y-3 stagger">
          {results.map((p) => (
            <PlaceCard key={p.id} place={p} />
          ))}
        </div>

        {results.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
            <Icon name="search" size={32} className="text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">{tr("nothingFound")}</p>
            <p className="text-xs text-muted-foreground">{tr("tryAnotherWord")}</p>
            <button
              onClick={() => {
                setQ("");
                setCat("all");
                setOpenOnly(false);
              }}
              className="press mt-1 rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground"
            >
              {tr("clearFilters")}
            </button>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
