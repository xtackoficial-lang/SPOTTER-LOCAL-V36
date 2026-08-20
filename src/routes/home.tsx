import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useOnboarding } from "@/lib/onboarding-storage";
import { CATEGORY_FILTERS } from "@/lib/places-data";
import { useDiscoverPlaces } from "@/lib/businesses-db";
import { PlaceCard } from "@/components/PlaceCard";
import { BottomNav } from "@/components/BottomNav";
import { Icon } from "@/components/Icon";
import {
  getUserLocation,
  distanceKm as calculateDistanceKm,
  formatDistance,
  type Coordinates,
} from "@/lib/geo-utils";
import { useScreenAppearance } from "@/lib/theme-storage";
import { ThemeAnimationOnly, resolveBackgroundStyle } from "@/components/ThemeBackdrop";
import { HeroBgCanvas } from "@/components/HeroBgCanvas";
import { BreathingLoader } from "@/components/BreathingLoader";
import { getActiveBoostedBusinessIds, applyBoostOrder } from "@/lib/boost-storage";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/home")({
  head: () => ({ meta: [{ title: "Spotter Local — Descobrir" }] }),
  component: Home,
});

function SkeletonCard() {
  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <div className="flex gap-3">
        <div className="h-16 w-16 shrink-0 rounded-2xl bg-muted shimmer" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3.5 w-3/4 rounded-full bg-muted shimmer" />
          <div className="h-3 w-1/2 rounded-full bg-muted shimmer" />
          <div className="h-3 w-1/3 rounded-full bg-muted shimmer" />
        </div>
      </div>
    </div>
  );
}

function Home() {
  const navigate = useNavigate();
  const tr = useT();
  const { draft, hydrated } = useOnboarding();
  const { appearance } = useScreenAppearance("home");
  const isBiz = draft.profileType === "business";
  const profile = isBiz ? draft.business : draft.personal;
  const profileCity = profile.city?.trim();
  const profileProvince = profile.province?.trim();
  // BUG CORRIGIDO (2026-07-07): a Home só mostrava negócios da cidade/
  // província escolhida no início da criação da conta, sem NENHUMA forma
  // de ver mais além disso — o utilizador ficava preso. Decisão do
  // Abrão: mostrar por omissão a cidade/província de casa, mas nunca
  // impedir de ver mais negócios fora dela (o mesmo toggle já existe na
  // Busca — ver src/routes/search.tsx).
  const [nationwide, setNationwide] = useState(false);
  const { places: allPlaces, loading: placesLoading } = useDiscoverPlaces(
    nationwide ? undefined : { province: profileProvince, city: profileCity },
  );
  const [cat, setCat] = useState<string>("all");
  const [mounted, setMounted] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [boostedIds, setBoostedIds] = useState<string[]>([]);

  useEffect(() => {
    getActiveBoostedBusinessIds().then(setBoostedIds);
  }, []);

  useEffect(() => {
    if (hydrated && !draft.completed) navigate({ to: "/onboarding" });
  }, [hydrated, draft.completed, navigate]);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Pede a localização do utilizador uma vez, ao abrir a Home. Se recusar
  // ou falhar (sem GPS, sem permissão), getUserLocation nunca rejeita —
  // devolve null e os negócios mostram a distância de referência em vez
  // da real, sem travar nem mostrar erro.
  useEffect(() => {
    getUserLocation().then((loc) => {
      if (loc) setUserLocation(loc);
      else setLocationDenied(true);
    });
  }, []);

  const places = useMemo(() => {
    let list = allPlaces.map((p) => {
      // Quando o negócio tem coordenadas reais (lat/lng do Google Maps) e
      // sabemos onde o utilizador está, calculamos a distância real em km.
      // Negócios sem GPS ficam com Infinity → vão automaticamente para o fim.
      if (userLocation && typeof p.lat === "number" && typeof p.lng === "number") {
        return { ...p, distanceKm: calculateDistanceKm(userLocation, { lat: p.lat, lng: p.lng }) };
      }
      // Sem GPS do negócio: Infinity garante que fica no fim da lista
      if (!p.lat || !p.lng) return { ...p, distanceKm: Infinity };
      return p;
    });

    if (cat === "online") {
      // Aba Online: só negócios digitais, sem ordenação por distância
      list = list.filter((p) => p.isDigital);
      list = list.sort((a, b) => b.rating - a.rating);
    } else {
      // Exclui sempre negócios digitais da pesquisa geral
      list = list.filter((p) => !p.isDigital);
      if (cat !== "all") list = list.filter((p) => p.category === cat);
      list = list.sort((a, b) => {
        // Infinity vai para o fim, finitos ordenados por distância
        if (!isFinite(a.distanceKm) && !isFinite(b.distanceKm)) return 0;
        if (!isFinite(a.distanceKm)) return 1;
        if (!isFinite(b.distanceKm)) return -1;
        return a.distanceKm - b.distanceKm;
      });
    }

    const boostedSet = new Set(boostedIds);
    list = list.map((p) => (boostedSet.has(p.id) ? { ...p, boosted: true } : p));
    return applyBoostOrder(list, boostedIds);
  }, [cat, userLocation, allPlaces, boostedIds]);

  const featured = allPlaces.filter((p) => p.promo).slice(0, 5);
  const openNow = allPlaces.filter((p) => p.openNow);

  if (!hydrated || placesLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        {/* Hero com BreathingLoader */}
        <div
          className="relative h-52 overflow-hidden"
          style={{ background: "var(--gradient-hero)" }}
        >
          <HeroBgCanvas />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <BreathingLoader size={40} />
          </div>
        </div>
        <main className="flex-1 px-5 py-6 space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header hero */}
      <header
        className={`relative overflow-hidden px-5 pb-8 pt-12 text-primary-foreground ${appearance.enabled ? "" : "gradient-pan"}`}
        style={
          appearance.enabled
            ? resolveBackgroundStyle(appearance)
            : { background: "var(--gradient-hero)" }
        }
      >
        {/* Fundo animado — smoke + glass blobs (sempre activo, atrás de tudo) */}
        <HeroBgCanvas />
        <ThemeAnimationOnly appearance={appearance} />
        {/* Decorative orbs */}
        <div className="pointer-events-none absolute -right-16 -top-10 h-56 w-56 rounded-full bg-white/10 blur-3xl animate-float" />
        <div
          className="pointer-events-none absolute -left-12 bottom-0 h-40 w-40 rounded-full bg-white/8 blur-2xl animate-float"
          style={{ animationDelay: "1.5s" }}
        />

        {/* Greeting */}
        <div
          className={`relative flex items-center justify-between transition-all duration-600 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
        >
          <div className="min-w-0">
            <button
              onClick={() => setNationwide((v) => !v)}
              className="press inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[10px] font-medium backdrop-blur-sm"
            >
              <Icon name={nationwide ? "tourism" : userLocation ? "navigation" : "pin"} size={10} />
              {nationwide
                ? tr("searchScopeCountry")
                : profileProvince || profile.city || tr("cityFallback")}
              {!nationwide && profile.country ? `, ${profile.country}` : ""}
              {!nationwide && !userLocation && !locationDenied && (
                <span className="opacity-70">· {tr("locating")}</span>
              )}
              <Icon name="chevronDown" size={10} className="opacity-70" />
            </button>
            <h1 className="mt-2 truncate text-2xl font-bold tracking-tight">
              {appearance.enabled && appearance.heading
                ? appearance.heading
                : `${tr("greetingHello")}${isBiz && draft.business.businessName ? `, ${draft.business.businessName}` : ""}!`}
            </h1>
            <p className="mt-1 text-xs opacity-80">
              {appearance.enabled && appearance.subtext
                ? appearance.subtext
                : tr("whatToDiscoverToday")}
            </p>
          </div>
          {isBiz && (
            <Link
              to="/business"
              className="press inline-flex items-center gap-2 rounded-full bg-primary-foreground/20 px-4 py-2 text-xs font-semibold ring-1 ring-white/20 backdrop-blur-xl animate-glow-pulse"
            >
              <Icon name="chart" size={13} /> {tr("panel")}
            </Link>
          )}
        </div>

        {/* Search bar */}
        <Link
          to="/search"
          className="press relative mt-5 flex items-center gap-3 rounded-2xl bg-card px-4 py-3.5 text-sm text-muted-foreground shadow-[var(--shadow-lift)] animate-slide-up"
          style={{ animationDelay: "0.1s" }}
        >
          <div
            className="grid h-8 w-8 place-items-center rounded-xl"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Icon name="search" size={16} className="text-white" />
          </div>
          <span>{tr("homeSearchPlaceholder")}</span>
          <Icon name="arrowRight" size={14} className="ml-auto text-muted-foreground/60" />
        </Link>

        {/* Quick stats badges */}
        <div className="mt-4 flex gap-2 animate-slide-up" style={{ animationDelay: "0.18s" }}>
          <span className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-sm">
            <Icon name="flame" size={12} /> {featured.length} {tr("promotions")}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-sm">
            <Icon name="check" size={12} /> {openNow.length} {tr("openNowCount")}
          </span>
        </div>
      </header>

      <main className="flex-1 pb-8">
        {/* Categories */}
        <section className="mt-6 px-5">
          <h2
            className="mb-3 text-sm font-bold tracking-tight text-foreground animate-slide-up"
            style={{ animationDelay: "0.05s" }}
          >
            {tr("categories")}
          </h2>
          <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1 no-scrollbar">
            {CATEGORY_FILTERS.map((c, i) => {
              const on = cat === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setCat(c.id)}
                  className={`press flex shrink-0 items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-semibold transition-all duration-300 animate-slide-in-right ${
                    on
                      ? "border-primary/50 text-primary-foreground shadow-[var(--shadow-soft)]"
                      : "border-border bg-card text-foreground hover:border-primary/30"
                  }`}
                  style={{
                    animationDelay: `${i * 0.04}s`,
                    ...(on ? { background: "var(--gradient-primary)" } : {}),
                  }}
                >
                  <Icon name={c.icon} size={13} className={on ? "text-white" : ""} />
                  {c.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Featured / Promos */}
        {cat === "all" && featured.length > 0 && (
          <section className="mt-7 animate-fade-in">
            <div className="mb-3.5 flex items-center justify-between px-5">
              <h2 className="inline-flex items-center gap-2 text-sm font-bold tracking-tight text-foreground">
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-white"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  <Icon name="flame" size={13} />
                </span>
                {tr("todaysPromotions")}
              </h2>
              <Link
                to="/search"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {tr("seeAllLink")} <Icon name="arrowRight" size={12} />
              </Link>
            </div>
            <div className="-mx-5 flex gap-4 overflow-x-auto px-5 pb-3 no-scrollbar">
              {featured.map((p, i) => (
                <Link
                  key={p.id}
                  to="/place/$id"
                  params={{ id: p.id }}
                  className="press group relative w-60 shrink-0 overflow-hidden rounded-3xl shadow-[var(--shadow-lift)] card-lift animate-card-enter"
                  style={{ animationDelay: `${i * 0.07}s` }}
                >
                  <img
                    src={p.cover}
                    alt={p.name}
                    loading="lazy"
                    className="h-44 w-full object-cover transition duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  {/* Promo badge */}
                  <div className="absolute right-3 top-3">
                    <div className="rounded-full bg-destructive px-2.5 py-1 text-[10px] font-bold text-white shadow-lg">
                      {p.promo}
                    </div>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-3.5 text-white">
                    <div className="truncate text-sm font-bold">{p.name}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] opacity-90">
                      <span className="inline-flex items-center gap-0.5">
                        <Icon name="star" size={11} className="fill-amber-400 stroke-amber-500" />
                        {p.rating}
                      </span>
                      <span>·</span>
                      <span>{formatDistance(p.distanceKm)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Main list */}
        <section className="mt-6 px-5">
          <h2 className="mb-3.5 text-sm font-bold tracking-tight text-foreground animate-slide-up">
            {cat === "all"
              ? `${tr("openNowWithCount")} · ${openNow.length}`
              : cat === "online"
                ? "🌐 Negócios Online"
                : CATEGORY_FILTERS.find((c) => c.id === cat)?.label}
          </h2>
          {cat === "online" && (
            <p className="mb-4 text-xs text-muted-foreground">
              Serviços digitais disponíveis em todo o país — designers, freelancers, lojas online e
              mais.
            </p>
          )}
          <div className="space-y-4 stagger">
            {places.map((p) => (
              <PlaceCard key={p.id} place={p} />
            ))}
            {places.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border bg-card p-10 text-center animate-pop-in">
                {cat === "online" ? (
                  <>
                    <Icon name="delivery" size={28} className="text-violet-400" />
                    <div className="text-sm font-medium text-foreground">
                      Sem negócios online ainda
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Regista o teu negócio digital e aparece aqui.
                    </div>
                  </>
                ) : (
                  <>
                    <Icon name="search" size={28} className="text-muted-foreground" />
                    <div className="text-sm font-medium text-foreground">
                      {tr("noResultsCategory")}
                    </div>
                    <div className="text-xs text-muted-foreground">{tr("nothingInCategory")}</div>
                  </>
                )}
                <button
                  onClick={() => setCat("all")}
                  className="press mt-1 rounded-xl px-4 py-2 text-xs font-semibold text-primary-foreground"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  {tr("seeAllCategories")}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* XTACK footer */}
        <div className="mt-8 px-5 text-center text-[10px] text-muted-foreground/50">
          {tr("poweredBy")} <span className="font-semibold text-primary/60">XTACK OFICIAL</span>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
