import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/Icon";
import {
  useOnboarding,
  LANGUAGES,
  COUNTRIES,
  INTERESTS,
  BUSINESS_CATEGORIES,
  type BusinessProfile,
} from "@/lib/onboarding-storage";
import { useAuth } from "@/lib/auth-context";
import { useT, setLocale as setAppLocale, type Locale as AppLocale } from "@/lib/i18n";
import { syncProfileToSupabase } from "@/lib/auth";
import { upsertBusiness } from "@/lib/businesses-db";
import { ShimmerButton } from "@/components/ShimmerButton";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";
import { extractCoordinatesFromGoogleMaps, resolveLocationInput, getUserLocation } from "@/lib/geo-utils";
import { PROVINCES_MZ, citiesForProvince, PROVINCE_CENTER_MZ } from "@/lib/mozambique-locations";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Configurar perfil — Spotter Local" }] }),
  component: Onboarding,
});

type Step =
  | "profileType"
  | "p-language"
  | "p-location"
  | "p-visitor"
  | "p-interests"
  | "b-language"
  | "b-location"
  | "b-category"
  | "b-hours"
  | "b-details"
  | "b-verifying"
  | "done";

function Onboarding() {
  const tr = useT();
  const navigate = useNavigate();
  const { draft, hydrated, update, updatePersonal, updateBusiness, reset } = useOnboarding();
  const { user, setProfileType } = useAuth();
  const [step, setStepRaw] = useState<Step>("profileType");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncingBusiness, setSyncingBusiness] = useState(false);
  const [restoredOnce, setRestoredOnce] = useState(false);

  // Restaura o último passo visitado (uma única vez, depois de hidratar),
  // para que recarregar a página a meio do onboarding não obrigue o
  // utilizador a recomeçar do zero. Só restaura se ainda não completou
  // e se o passo guardado for um dos passos válidos.
  useEffect(() => {
    if (!hydrated || restoredOnce) return;
    setRestoredOnce(true);
    const VALID_STEPS: Step[] = [
      "profileType",
      "p-language",
      "p-location",
      "p-visitor",
      "p-interests",
      "b-language",
      "b-location",
      "b-category",
      "b-hours",
      "b-details",
      "b-verifying",
      "done",
    ];
    if (!draft.completed && draft.lastStep && (VALID_STEPS as string[]).includes(draft.lastStep)) {
      setStepRaw(draft.lastStep as Step);
    }
  }, [hydrated, restoredOnce, draft.completed, draft.lastStep]);

  // Substitui setStep directo: além de mudar o passo localmente, grava-o
  // no draft (localStorage) para a função de restauro acima funcionar.
  const setStep = (next: Step) => {
    setStepRaw(next);
    update({ lastStep: next });
  };

  useEffect(() => {
    if (!hydrated) return;
    if (draft.completed) navigate({ to: "/home" });
  }, [hydrated, draft.completed, navigate]);

  const totalSteps = step.startsWith("p-") ? 4 : step.startsWith("b-") ? 6 : 1;
  const currentStepNum = useMemo(() => {
    const map: Record<string, number> = {
      "p-language": 1,
      "p-location": 2,
      "p-visitor": 3,
      "p-interests": 4,
      "b-language": 1,
      "b-location": 2,
      "b-category": 3,
      "b-hours": 4,
      "b-details": 5,
      "b-verifying": 6,
    };
    return map[step] ?? 0;
  }, [step]);

  if (!hydrated) return <div className="min-h-screen bg-background" />;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        step={step}
        currentStepNum={currentStepNum}
        totalSteps={totalSteps}
        onBack={() => goBack(step, setStep)}
        onReset={reset}
      />
      <div key={step} className="flex-1 px-6 pb-8 animate-slide-up">
        {step === "profileType" && (
          <ProfileTypeStep
            onPick={(t) => {
              update({ profileType: t });
              setProfileType(t); // persiste o tipo de conta também junto ao login, não só no draft local
              setStep(t === "personal" ? "p-language" : "b-language");
            }}
          />
        )}

        {step === "p-language" && (
          <LanguageStep
            value={draft.personal.language}
            onChange={(v) => {
              updatePersonal({ language: v });
              // Aplica já a escolha à app inteira (o subtítulo deste
              // passo promete "a interface vai adaptar-se") — antes só
              // ficava guardado no draft e nunca mudava nada no ecrã.
              setAppLocale(v as AppLocale);
            }}
            onNext={() => setStep("p-location")}
          />
        )}
        {step === "p-location" && (
          <LocationStep
            country={draft.personal.country}
            province={draft.personal.province}
            city={draft.personal.city}
            onChange={(c, p, ci) => updatePersonal({ country: c, province: p, city: ci })}
            onNext={() => setStep("p-visitor")}
          />
        )}
        {step === "p-visitor" && (
          <VisitorStep
            value={draft.personal.visitorType ?? null}
            onChange={(v) => updatePersonal({ visitorType: v })}
            onNext={() => setStep("p-interests")}
          />
        )}
        {step === "p-interests" && (
          <InterestsStep
            value={draft.personal.interests ?? []}
            onChange={(v) => updatePersonal({ interests: v })}
            onFinish={() => {
              update({ completed: true });
              // best-effort: não bloqueia a navegação se falhar
              syncProfileToSupabase({
                name: draft.personal.name,
                province: draft.personal.province,
                city: draft.personal.city,
                country: draft.personal.country,
                favoriteCategory: draft.personal.interests?.[0],
              });
              navigate({ to: "/home" });
            }}
          />
        )}

        {step === "b-language" && (
          <LanguageStep
            value={draft.business.language}
            onChange={(v) => {
              updateBusiness({ language: v });
              setAppLocale(v as AppLocale);
            }}
            onNext={() => setStep("b-location")}
          />
        )}
        {step === "b-location" && (
          <LocationStep
            country={draft.business.country}
            province={draft.business.province}
            city={draft.business.city}
            neighborhood={draft.business.neighborhood}
            onNeighborhoodChange={(v) => updateBusiness({ neighborhood: v })}
            googleMapsLink={draft.business.googleMapsLink}
            lat={draft.business.lat}
            lng={draft.business.lng}
            onChange={(c, p, ci) => updateBusiness({ country: c, province: p, city: ci })}
            onMapsLinkChange={(link, coords) =>
              updateBusiness({
                googleMapsLink: link,
                lat: coords?.lat,
                lng: coords?.lng,
              })
            }
            onNext={() => setStep("b-category")}
          />
        )}
        {step === "b-category" && (
          <CategoryStep
            name={draft.business.businessName ?? ""}
            category={draft.business.category ?? ""}
            custom={draft.business.customCategory ?? ""}
            onChange={(name, cat, custom) =>
              updateBusiness({ businessName: name, category: cat, customCategory: custom })
            }
            onNext={() => setStep("b-hours")}
          />
        )}
        {step === "b-hours" && (
          <HoursStep
            hours={draft.business.hours ?? { open: "08:00", close: "18:00", alwaysOpen: false }}
            onChange={(h) => updateBusiness({ hours: h })}
            onNext={() => setStep("b-details")}
          />
        )}
        {step === "b-details" && (
          <DetailsStep
            business={draft.business}
            onChange={updateBusiness}
            syncing={syncingBusiness}
            syncError={syncError}
            onSubmit={async () => {
              update({ verificationSubmittedAt: new Date().toISOString() });
              // Sincroniza o negócio com o Supabase (best-effort): se o
              // utilizador estiver autenticado, cria/actualiza a linha em
              // "businesses" para que o painel admin e outros dispositivos
              // o vejam. Se falhar (sem rede, sem login), o draft local
              // já guardou tudo — o utilizador não fica bloqueado por isto.
              if (user) {
                setSyncingBusiness(true);
                setSyncError(null);
                try {
                  const result = await upsertBusiness({
                    id: draft.business.businessId,
                    owner_id: user.id,
                    business_name: draft.business.businessName || tr("businessNameless"),
                    owner_name: draft.business.ownerName || undefined,
                    category: draft.business.category || "other",
                    city: draft.business.city || "",
                    province: draft.business.province || undefined,
                    neighborhood: draft.business.neighborhood || undefined,
                    country: draft.business.country || tr("defaultCountry"),
                    address: "",
                    phone: draft.business.phone || "",
                    description: draft.business.description || "",
                    website: draft.business.website || undefined,
                    cover_image: draft.business.coverImage || undefined,
                    gallery: draft.business.gallery,
                    always_open: draft.business.hours?.alwaysOpen ?? false,
                    hours_open: draft.business.hours?.open ?? "08:00",
                    hours_close: draft.business.hours?.close ?? "18:00",
                    verified: false,
                    plan_id: "free",
                    plan_status: "active",
                    lat: draft.business.lat,
                    lng: draft.business.lng,
                    rating: 0,
                    reviews_count: 0,
                    created_at: new Date().toISOString(),
                  });
                  // upsertBusiness nunca lança — devolve null tanto se o
                  // Supabase não estiver configurado (modo demo, esperado)
                  // como se a sincronização falhar de verdade. Só avisamos
                  // quando está configurado e mesmo assim falhou.
                  if (result === null && SUPABASE_CONFIGURED) {
                    setSyncError(tr("cannotSyncOnline"));
                  }
                } catch (err) {
                  console.warn("Falha ao sincronizar negócio com Supabase:", err);
                  setSyncError(tr("cannotSyncOnline"));
                } finally {
                  setSyncingBusiness(false);
                }
              }
              setStep("b-verifying");
            }}
          />
        )}
        {step === "b-verifying" && (
          <VerifyingStep
            onContinue={() => {
              update({ completed: true });
              // Conta comercial: entra automaticamente no plano Free (sem
              // trial, sem pagamento) e vai directo para o painel. A
              // escolha de um plano pago é opcional e fica disponível no
              // painel ("Fazer upgrade"), não é forçada aqui.
              navigate({ to: "/business" });
            }}
          />
        )}
      </div>
    </div>
  );
}

function goBack(step: Step, setStep: (s: Step) => void) {
  const order: Step[] = [
    "profileType",
    "p-language",
    "p-location",
    "p-visitor",
    "p-interests",
    "b-language",
    "b-location",
    "b-category",
    "b-hours",
    "b-details",
    "b-verifying",
  ];
  const idx = order.indexOf(step);
  if (idx <= 0) return;
  const prev = order[idx - 1];
  if (step === "p-language" || step === "b-language") {
    setStep("profileType");
    return;
  }
  setStep(prev);
}

function Header({
  step,
  currentStepNum,
  totalSteps,
  onBack,
  onReset,
}: {
  step: Step;
  currentStepNum: number;
  totalSteps: number;
  onBack: () => void;
  onReset: () => void;
}) {
  const tr = useT();
  const pct = totalSteps > 1 ? (currentStepNum / totalSteps) * 100 : 0;
  return (
    <div className="sticky top-0 z-10 bg-background/90 px-6 pb-3 pt-5 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="press grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground hover:bg-accent"
          aria-label={tr("backAction")}
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <div className="text-xs font-medium tracking-wide text-muted-foreground">
          {step === "profileType"
            ? tr("chooseProfileTypeLabel")
            : `Passo ${currentStepNum} de ${totalSteps}`}
        </div>
        <button
          onClick={onReset}
          aria-label={tr("resetAction")}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          {tr("resetAction")}
        </button>
      </div>
      {totalSteps > 1 && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%`, background: "var(--gradient-primary)" }}
          />
        </div>
      )}
    </div>
  );
}

function StepTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mt-4 mb-6">
      <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight text-foreground">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

function PrimaryButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <ShimmerButton
      className="press mt-6 h-12 w-full rounded-2xl text-base font-semibold text-primary-foreground shadow-[var(--shadow-soft)] disabled:opacity-40"
      style={{ background: disabled ? undefined : "var(--gradient-primary)" }}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </ShimmerButton>
  );
}

function ProfileTypeStep({ onPick }: { onPick: (t: "personal" | "business") => void }) {
  const tr = useT();
  return (
    <>
      <StepTitle title={tr("howWillUseSpotter")} subtitle={tr("canChangeLater")} />
      <div className="space-y-4 stagger">
        <button
          onClick={() => onPick("personal")}
          className="press group w-full overflow-hidden rounded-3xl border border-border bg-card p-5 text-left shadow-[var(--shadow-soft)] transition hover:border-primary/40 hover:shadow-[var(--shadow-lift)]"
        >
          <div className="flex items-start gap-4">
            <div
              className="grid h-14 w-14 place-items-center rounded-2xl text-primary-foreground shadow-[var(--shadow-soft)]"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Icon name="compass" size={24} />
            </div>
            <div className="flex-1">
              <div className="text-base font-semibold tracking-tight text-foreground">
                Perfil Pessoal
              </div>
              <div className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Explorar restaurantes, farmácias, hotéis e serviços perto de si.
              </div>
            </div>
            <Icon
              name="chevronRight"
              size={18}
              className="mt-2 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary"
            />
          </div>
        </button>

        <button
          onClick={() => onPick("business")}
          className="press group w-full overflow-hidden rounded-3xl border border-border bg-card p-5 text-left shadow-[var(--shadow-soft)] transition hover:border-primary/40 hover:shadow-[var(--shadow-lift)]"
        >
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
              <Icon name="store" size={24} />
            </div>
            <div className="flex-1">
              <div className="text-base font-semibold tracking-tight text-foreground">
                Perfil Comercial
              </div>
              <div className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Cadastre o seu negócio e seja encontrado por clientes da sua zona.
              </div>
            </div>
            <Icon
              name="chevronRight"
              size={18}
              className="mt-2 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary"
            />
          </div>
        </button>
      </div>
    </>
  );
}

function LanguageStep({
  value,
  onChange,
  onNext,
}: {
  value?: string;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  const tr = useT();
  return (
    <>
      <StepTitle title={tr("chooseLanguageTitle")} subtitle={tr("chooseLanguageSubtitle")} />
      <div className="grid grid-cols-2 gap-3 stagger">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            onClick={() => onChange(l.code)}
            className={`press flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
              value === l.code
                ? "border-primary bg-accent shadow-[var(--shadow-soft)]"
                : "border-border bg-card hover:border-primary/40"
            }`}
          >
            <span
              className={`grid h-9 w-9 place-items-center rounded-xl text-xs font-bold tracking-wide ${value === l.code ? "text-primary-foreground" : "bg-muted text-foreground"}`}
              style={value === l.code ? { background: "var(--gradient-primary)" } : undefined}
            >
              {l.short}
            </span>
            <span className="font-medium text-foreground">{l.label}</span>
          </button>
        ))}
      </div>
      <PrimaryButton disabled={!value} onClick={onNext}>
        Continuar
      </PrimaryButton>
    </>
  );
}

function LocationStep({
  country,
  province,
  city,
  onChange,
  onNext,
  googleMapsLink,
  lat,
  lng,
  onMapsLinkChange,
  neighborhood,
  onNeighborhoodChange,
}: {
  country?: string;
  province?: string;
  city?: string;
  onChange: (c: string, p: string, ci: string) => void;
  onNext: () => void;
  googleMapsLink?: string;
  lat?: number;
  lng?: number;
  onMapsLinkChange?: (link: string, coords: { lat: number; lng: number } | null) => void;
  neighborhood?: string;
  onNeighborhoodChange?: (v: string) => void;
}) {
  const tr = useT();
  const [search, setSearch] = useState("");
  const filtered = COUNTRIES.filter((c) => c.toLowerCase().includes(search.toLowerCase()));
  const isBusiness = typeof onMapsLinkChange === "function";
  const hasCoords = typeof lat === "number" && typeof lng === "number";
  // Só Moçambique tem lista curada de Províncias/Cidades (ver
  // mozambique-locations.ts) — decisão do Abrão de 2026-07-07: a
  // Província passa a ser o nível PRINCIPAL de correspondência entre
  // cliente e comerciante (Beira ⇄ Sofala já são entendidos como a
  // mesma área), em vez do antigo texto livre que não batia certo.
  const isMZ = country === "Moçambique";
  const provinceCities = citiesForProvince(province);
  // "Outra" cidade: se a cidade guardada não está na lista da
  // província (ex: vila pequena não coberta, ou dado antigo de antes
  // desta funcionalidade existir), mostra logo o campo de texto em vez
  // de esconder o valor já preenchido.
  const [customCity, setCustomCity] = useState(
    () => !!city && provinceCities.length > 0 && !provinceCities.includes(city),
  );
  // v25 — Botão "Usar a minha localização actual": antes, a única forma
  // de dar coordenadas ao negócio era copiar um link do Google Maps à
  // mão (abrir a app, tocar Partilhar, Copiar link, voltar aqui, colar)
  // — muita gente complicava-se ou desistia a meio. Isto usa a permissão
  // de GPS do próprio telemóvel, um toque, sem sair da app.
  const [locatingGPS, setLocatingGPS] = useState(false);
  const [gpsError, setGpsError] = useState(false);

  const [resolvingLink, setResolvingLink] = useState(false);

  // v26 — Antes só reconhecia links longos com coordenadas já no texto.
  // Agora também resolve: Plus Codes (ex: "3C72+J2J", o que o Google
  // Maps/WhatsApp partilha por omissão) usando a província já escolhida
  // como referência, e links curtos (maps.app.goo.gl) seguindo o
  // redirect. Isto cobre o que a maioria das pessoas cola sem saber que
  // precisava do link "longo".
  const handleMapsLinkChange = async (value: string) => {
    if (!onMapsLinkChange) return;
    // Actualiza o texto já, com o resultado síncrono se houver — para o
    // campo não parecer "preso" enquanto aguardamos a resolução async.
    const immediate = extractCoordinatesFromGoogleMaps(value);
    onMapsLinkChange(value, immediate);
    if (immediate) return;

    setResolvingLink(true);
    const reference =
      isMZ && province ? PROVINCE_CENTER_MZ[province as keyof typeof PROVINCE_CENTER_MZ] : undefined;
    const resolved = await resolveLocationInput(value, reference);
    setResolvingLink(false);
    onMapsLinkChange(value, resolved);
  };

  const handleUseCurrentLocation = async () => {
    if (!onMapsLinkChange) return;
    setLocatingGPS(true);
    setGpsError(false);
    const coords = await getUserLocation(10000);
    setLocatingGPS(false);
    if (!coords) {
      setGpsError(true);
      return;
    }
    // Guarda como se fosse um link colado, para reaproveitar o mesmo
    // fluxo de leitura de coordenadas já usado no resto da app.
    onMapsLinkChange(`${coords.lat},${coords.lng}`, coords);
  };

  return (
    <>
      <StepTitle title={tr("whereAreYouTitle")} subtitle={tr("whereAreYouSubtitle")} />
      <Label className="text-xs">{tr("countryLabel")}</Label>
      <div className="relative mt-1">
        <Icon
          name="search"
          size={14}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder={tr("searchCountryPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 rounded-xl pl-9"
        />
      </div>
      <div className="mt-3 max-h-[200px] overflow-y-auto rounded-2xl border border-border bg-card">
        {filtered.map((c) => (
          <button
            key={c}
            onClick={() => {
              // Mudar de país invalida a Província/Cidade escolhidas
              // antes (eram de outro país) — recomeça do zero.
              setCustomCity(false);
              onChange(c, "", "");
            }}
            className={`flex w-full items-center justify-between border-b border-border px-4 py-3 text-left text-sm transition last:border-0 ${
              country === c
                ? "bg-accent font-semibold text-accent-foreground"
                : "text-foreground hover:bg-accent/40"
            }`}
          >
            {c} {country === c && <Icon name="check" size={14} className="text-primary" />}
          </button>
        ))}
      </div>

      {isMZ ? (
        <>
          <Label className="mt-5 block text-xs">{tr("provinceLabel")}</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {PROVINCES_MZ.map((p) => (
              <button
                key={p}
                onClick={() => {
                  setCustomCity(false);
                  // Trocar de província limpa a cidade — evita ficar
                  // com uma cidade da província antiga presa ao mudar.
                  onChange(country ?? "", p, "");
                }}
                className={`press rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${
                  province === p
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {province && (
            <>
              <Label className="mt-5 block text-xs">{tr("cityLabel")}</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {provinceCities.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setCustomCity(false);
                      onChange(country ?? "", province, c);
                    }}
                    className={`press rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${
                      !customCity && city === c
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground"
                    }`}
                  >
                    {c}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setCustomCity(true);
                    onChange(country ?? "", province, "");
                  }}
                  className={`press rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${
                    customCity
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  {tr("otherCityOption")}
                </button>
              </div>
              {customCity && (
                <Input
                  placeholder={tr("cityPlaceholder")}
                  value={city ?? ""}
                  onChange={(e) => onChange(country ?? "", province, e.target.value)}
                  className="mt-2 h-11 rounded-xl"
                />
              )}
              <p className="mt-1.5 text-[11px] text-muted-foreground">{tr("provinceMatchHint")}</p>
            </>
          )}
        </>
      ) : (
        <>
          <Label className="mt-5 block text-xs">{tr("cityProvinceLabel")}</Label>
          <Input
            placeholder={tr("cityPlaceholder")}
            value={city ?? ""}
            onChange={(e) => onChange(country ?? "", "", e.target.value)}
            className="mt-1 h-11 rounded-xl"
          />
        </>
      )}

      {isBusiness && (
        <>
          <Label className="mt-5 block text-xs">{tr("neighborhoodLabel")}</Label>
          <Input
            placeholder={tr("neighborhoodPlaceholder")}
            value={neighborhood ?? ""}
            onChange={(e) => onNeighborhoodChange?.(e.target.value)}
            className="mt-1 h-11 rounded-xl"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">{tr("neighborhoodHint")}</p>

          <Label className="mt-5 block text-xs">{tr("exactLocationLabel")}</Label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Coloque a localização exacta do seu negócio — é o que leva os clientes até à porta
            certa.
          </p>

          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={locatingGPS}
            className="press mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 text-sm font-semibold text-primary disabled:opacity-60"
          >
            <Icon name="pin" size={16} className={locatingGPS ? "animate-spin" : ""} />
            {locatingGPS ? "A obter localização…" : "Usar a minha localização actual"}
          </button>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Toque aqui estando no local do negócio — mais rápido, um só toque.
          </p>
          {gpsError && (
            <p className="mt-1.5 text-[11px] text-amber-600">
              Não conseguimos aceder à sua localização. Verifique se permitiu o acesso ao GPS, ou
              cole o link do Google Maps abaixo.
            </p>
          )}

          <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            ou cole manualmente
            <div className="h-px flex-1 bg-border" />
          </div>
          <Input
            placeholder={tr("googleMapsPlaceholder")}
            value={googleMapsLink ?? ""}
            onChange={(e) => handleMapsLinkChange(e.target.value)}
            className="mt-2 h-11 rounded-xl"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Cole o link do Google Maps (curto ou longo) ou o código de mais/plus code (ex:
            3C72+J2J) do local do negócio.
          </p>
          {resolvingLink && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Icon name="pin" size={12} className="animate-spin" /> A verificar localização…
            </div>
          )}
          {!resolvingLink && googleMapsLink && (
            <div
              className={`mt-2 flex items-center gap-1.5 text-[11px] ${hasCoords ? "text-emerald-600" : "text-amber-600"}`}
            >
              <Icon name={hasCoords ? "check" : "alert"} size={12} />
              {hasCoords
                ? `Localização encontrada (${lat!.toFixed(4)}, ${lng!.toFixed(4)})`
                : "Não foi possível reconhecer esta localização. Experimente o botão \"Usar a minha localização actual\" acima, ou cole só os números (ex: -25.9655, 32.5832)."}
            </div>
          )}
        </>
      )}

      <PrimaryButton disabled={!country || (isMZ ? !province || !city : !city)} onClick={onNext}>
        Continuar
      </PrimaryButton>
    </>
  );
}

function VisitorStep({
  value,
  onChange,
  onNext,
}: {
  value: "tourist" | "local" | null;
  onChange: (v: "tourist" | "local") => void;
  onNext: () => void;
}) {
  const tr = useT();
  return (
    <>
      <StepTitle
        title={tr("touristOrResident")}
        subtitle="Vamos personalizar o que aparece primeiro."
      />
      <div className="space-y-3 stagger">
        <button
          onClick={() => onChange("tourist")}
          className={`press flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition ${
            value === "tourist"
              ? "border-primary bg-accent shadow-[var(--shadow-soft)]"
              : "border-border bg-card hover:border-primary/40"
          }`}
        >
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
            <Icon name="plane" size={22} />
          </div>
          <div className="flex-1">
            <div className="font-semibold tracking-tight text-foreground">Sou turista</div>
            <div className="text-xs leading-relaxed text-muted-foreground">
              Hotéis, pontos turísticos, praias, rent-a-car, restaurantes gourmet.
            </div>
          </div>
        </button>
        <button
          onClick={() => onChange("local")}
          className={`press flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition ${
            value === "local"
              ? "border-primary bg-accent shadow-[var(--shadow-soft)]"
              : "border-border bg-card hover:border-primary/40"
          }`}
        >
          <div
            className="grid h-12 w-12 place-items-center rounded-2xl text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Icon name="rental" size={22} />
          </div>
          <div className="flex-1">
            <div className="font-semibold tracking-tight text-foreground">Resido aqui</div>
            <div className="text-xs leading-relaxed text-muted-foreground">
              Farmácias de serviço, supermercados, clínicas, promoções do dia.
            </div>
          </div>
        </button>
      </div>
      <PrimaryButton disabled={!value} onClick={onNext}>
        Continuar
      </PrimaryButton>
    </>
  );
}

function InterestsStep({
  value,
  onChange,
  onFinish,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  onFinish: () => void;
}) {
  const tr = useT();
  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };
  return (
    <>
      <StepTitle title={tr("whatInterestsYou")} subtitle={tr("selectAtLeast3")} />
      <div className="flex flex-wrap gap-2 stagger">
        {INTERESTS.map((i) => {
          const on = value.includes(i.id);
          return (
            <button
              key={i.id}
              onClick={() => toggle(i.id)}
              className={`press inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm transition ${
                on
                  ? "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-soft)]"
                  : "border-border bg-card text-foreground hover:border-primary/40"
              }`}
            >
              <Icon name={i.icon} size={14} /> {i.label}
            </button>
          );
        })}
      </div>
      <PrimaryButton disabled={value.length < 3} onClick={onFinish}>
        {value.length < 3
          ? `${tr("selectMoreNeeded")} ${3 - value.length}`
          : tr("finishProfileAction")}
      </PrimaryButton>
    </>
  );
}

function CategoryStep({
  name,
  category,
  custom,
  onChange,
  onNext,
}: {
  name: string;
  category: string;
  custom: string;
  onChange: (name: string, category: string, custom: string) => void;
  onNext: () => void;
}) {
  const tr = useT();
  return (
    <>
      <StepTitle title={tr("yourBusinessTitle")} subtitle={tr("nameAndCategorySubtitle")} />
      <Label className="text-xs">{tr("businessNameLabel3")}</Label>
      <Input
        placeholder={tr("businessNamePlaceholder3")}
        value={name}
        onChange={(e) => onChange(e.target.value, category, custom)}
        className="mt-1 h-11 rounded-xl"
      />
      <Label className="mt-5 block text-xs">Categoria</Label>
      <div className="mt-2 flex flex-wrap gap-2">
        {BUSINESS_CATEGORIES.map((c) => {
          const on = category === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onChange(name, c.id, custom)}
              className={`press inline-flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm transition ${
                on
                  ? "border-primary bg-accent text-accent-foreground shadow-[var(--shadow-soft)]"
                  : "border-border bg-card text-foreground hover:border-primary/40"
              }`}
            >
              <Icon name={c.icon} size={14} /> {c.label}
            </button>
          );
        })}
      </div>
      {category === "other" && (
        <Input
          placeholder={tr("describeBusinessTypePlaceholder")}
          value={custom}
          onChange={(e) => onChange(name, category, e.target.value)}
          className="mt-3 h-11 rounded-xl"
        />
      )}
      <PrimaryButton
        disabled={!name || !category || (category === "other" && !custom)}
        onClick={onNext}
      >
        Continuar
      </PrimaryButton>
    </>
  );
}

function HoursStep({
  hours,
  onChange,
  onNext,
}: {
  hours: { open: string; close: string; alwaysOpen: boolean };
  onChange: (h: { open: string; close: string; alwaysOpen: boolean }) => void;
  onNext: () => void;
}) {
  const tr = useT();
  return (
    <>
      <StepTitle
        title={tr("operatingHoursTitle")}
        subtitle="Importante para aparecermos como 'aberto agora'."
      />
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground">
            <Icon name="clock" size={18} />
          </div>
          <div>
            <div className="font-medium text-foreground">Aberto 24h</div>
            <div className="text-xs text-muted-foreground">Sempre disponível</div>
          </div>
        </div>
        <Switch
          checked={hours.alwaysOpen}
          onCheckedChange={(v) => onChange({ ...hours, alwaysOpen: v })}
        />
      </div>

      {!hours.alwaysOpen && (
        <div className="mt-4 grid grid-cols-2 gap-3 animate-slide-up">
          <div>
            <Label className="text-xs">Abre às</Label>
            <Input
              type="time"
              value={hours.open}
              onChange={(e) => onChange({ ...hours, open: e.target.value })}
              className="mt-1 h-11 rounded-xl"
            />
          </div>
          <div>
            <Label className="text-xs">Fecha às</Label>
            <Input
              type="time"
              value={hours.close}
              onChange={(e) => onChange({ ...hours, close: e.target.value })}
              className="mt-1 h-11 rounded-xl"
            />
          </div>
        </div>
      )}
      <PrimaryButton onClick={onNext}>{tr("continueAction")}</PrimaryButton>
    </>
  );
}

function DetailsStep({
  business,
  onChange,
  onSubmit,
  syncing,
  syncError,
}: {
  business: Partial<BusinessProfile>;
  onChange: (patch: Partial<BusinessProfile>) => void;
  onSubmit: () => void;
  syncing?: boolean;
  syncError?: string | null;
}) {
  const tr = useT();
  const ok = business.description && business.phone && business.ownerName;
  return (
    <>
      <StepTitle title={tr("finalDetailsTitle")} subtitle={tr("moreCompleteMoreVisible")} />
      <div className="space-y-4">
        <div>
          <Label className="text-xs">{tr("descriptionLabel4")}</Label>
          <Textarea
            placeholder={tr("whatBusinessOffersPlaceholder")}
            value={business.description ?? ""}
            onChange={(e) => onChange({ description: e.target.value })}
            className="mt-1 min-h-[90px] rounded-xl"
          />
        </div>
        <div>
          <Label className="text-xs">{tr("attendanceNumberLabel")}</Label>
          <Input
            placeholder="+258 ..."
            value={business.phone ?? ""}
            onChange={(e) => onChange({ phone: e.target.value })}
            className="mt-1 h-11 rounded-xl"
          />
        </div>
        <div>
          <Label className="text-xs">{tr("ownerManagerLabel")}</Label>
          <Input
            placeholder={tr("yourNamePlaceholder")}
            value={business.ownerName ?? ""}
            onChange={(e) => onChange({ ownerName: e.target.value })}
            className="mt-1 h-11 rounded-xl"
          />
        </div>
        <div>
          <Label className="text-xs">{tr("officialWebsiteLabel")}</Label>
          <Input
            placeholder="https://..."
            value={business.website ?? ""}
            onChange={(e) => onChange({ website: e.target.value })}
            className="mt-1 h-11 rounded-xl"
          />
        </div>
        <div>
          <Label className="text-xs">{tr("coverImageLabel")}</Label>
          <Input
            placeholder={tr("coverImagePlaceholder")}
            value={business.coverImage ?? ""}
            onChange={(e) => onChange({ coverImage: e.target.value })}
            className="mt-1 h-11 rounded-xl"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            A capa é o que o cliente clica para ir ao seu site oficial. Pode adicionar fotos da
            galeria depois.
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl bg-accent p-4 text-xs text-accent-foreground">
        <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
        <div>
          {tr("privacyNotice")}
          visíveis apenas para a auditoria XTACK. Nunca são expostos ao público.
        </div>
      </div>

      {syncError && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-300/40 p-3 text-xs text-amber-700">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          <span>{syncError}</span>
        </div>
      )}

      <PrimaryButton disabled={!ok || syncing} onClick={onSubmit}>
        {syncing ? "A enviar..." : "Enviar para verificação"}
      </PrimaryButton>
    </>
  );
}

function VerifyingStep({ onContinue }: { onContinue: () => void }) {
  const tr = useT();
  const [phase, setPhase] = useState(0);

  // Simula progresso automático: 0 → 1 → 2 ao longo de ~3s
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1200);
    const t2 = setTimeout(() => setPhase(2), 2800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className="flex flex-col items-center pt-8 text-center">
      {/* Ícone de sucesso com burst + glow */}
      <div className="relative">
        {/* Burst ao entrar */}
        <div
          className="absolute inset-[-16px] rounded-full bg-primary/25 animate-success-burst"
          style={{ animationDelay: "0.1s" }}
        />
        {/* Glow pulsante */}
        <div className="absolute inset-[-4px] rounded-full bg-primary/20 animate-verify-glow" />
        {/* Anel exterior girando */}
        <div
          className="absolute inset-[-4px] rounded-full border-2 border-dashed border-primary/30 animate-spin-cw"
          style={{ animationDuration: "8s" }}
        />
        {/* Círculo principal */}
        <div
          className="relative grid h-24 w-24 place-items-center rounded-full text-primary-foreground shadow-[var(--shadow-lift)] animate-pop-in"
          style={{ background: "var(--gradient-primary)" }}
        >
          {/* Checkmark SVG animado */}
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
            <polyline
              points="8,22 18,32 36,14"
              stroke="white"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="40"
              strokeDashoffset="0"
              style={{ animation: "check-draw 0.5s cubic-bezier(0.22,1,0.36,1) 0.3s both" }}
            />
          </svg>
        </div>
      </div>

      <h1
        className="mt-7 text-2xl font-bold tracking-tight text-foreground animate-slide-up"
        style={{ animationDelay: "0.2s" }}
      >
        Negócio submetido!
      </h1>
      <p
        className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground animate-slide-up"
        style={{ animationDelay: "0.3s" }}
      >
        A verificação corre em segundo plano. Pode fechar a app ou continuar a explorar — nada
        congela.
      </p>

      {/* Barra de progresso */}
      <div className="mt-6 w-full animate-slide-up" style={{ animationDelay: "0.35s" }}>
        <div className="progress-bar-indeterminate" />
      </div>

      {/* Timeline com entrada em cascata */}
      <div className="mt-6 w-full space-y-3 text-left">
        {[
          { label: tr("dataSubmittedLabel"), done: true, delay: "0.4s" },
          { label: "Verificação de segurança", active: phase >= 1, delay: "0.5s" },
          { label: "Código de validação por email", active: phase >= 2, delay: "0.6s" },
          { label: tr("businessGoesLiveLabel"), delay: "0.7s" },
        ].map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 animate-stagger-in"
            style={{ animationDelay: item.delay }}
          >
            <div
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-all duration-500 ${
                item.done
                  ? "text-primary-foreground"
                  : item.active
                    ? "bg-accent text-accent-foreground animate-timeline-pulse"
                    : "bg-muted text-muted-foreground"
              }`}
              style={item.done ? { background: "var(--gradient-primary)" } : undefined}
            >
              {item.done ? (
                <Icon name="check" size={14} />
              ) : item.active ? (
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              ) : null}
            </div>
            <span
              className={`text-sm ${item.active ? "font-semibold text-foreground" : "text-foreground"}`}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <PrimaryButton onClick={onContinue}>{tr("continueExploringAction")}</PrimaryButton>
    </div>
  );
}

function TimelineItem({
  label,
  done,
  active,
}: {
  label: string;
  done?: boolean;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <div
        className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${
          done
            ? "text-primary-foreground"
            : active
              ? "bg-accent text-accent-foreground"
              : "bg-muted text-muted-foreground"
        }`}
        style={done ? { background: "var(--gradient-primary)" } : undefined}
      >
        {done ? (
          <Icon name="check" size={14} />
        ) : active ? (
          <Icon name="dot" size={10} className="fill-current" />
        ) : null}
      </div>
      <span className={`text-sm ${active ? "font-semibold text-foreground" : "text-foreground"}`}>
        {label}
      </span>
    </div>
  );
}
