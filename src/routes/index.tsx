import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/lib/auth-context";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";
import { useScreenAppearance } from "@/lib/theme-storage";
import { ThemeBackdrop } from "@/components/ThemeBackdrop";
import { ShimmerButton } from "@/components/ShimmerButton";
import { BreathingLoader } from "@/components/BreathingLoader";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Spotter Local — Descubra lugares perto de si" },
      {
        name: "description",
        content: "Encontre restaurantes, farmácias, hotéis e serviços abertos agora perto de você.",
      },
    ],
  }),
  component: Welcome,
});

type Mode = "choose" | "email" | "loading";

function SocialButton({
  icon,
  label,
  onClick,
  delay = 0,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  delay?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="press flex h-13 w-full items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm font-medium text-foreground shadow-sm transition hover:bg-accent/40 hover:border-primary/30 active:scale-[0.98]"
      style={{ animationDelay: `${delay}ms` }}
    >
      {icon === "google" ? (
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      ) : icon === "apple" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.06.04c-.22.15-2.15 1.26-2.13 3.76.03 2.99 2.62 3.99 2.65 4-.03.07-.41 1.4-1.3 2.78M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11" />
        </svg>
      ) : null}
      {label}
    </button>
  );
}

function AnimatedOrb({ className, delay = "0s" }: { className: string; delay?: string }) {
  return (
    <div
      className={`pointer-events-none absolute rounded-full blur-3xl animate-float ${className}`}
      style={{ animationDelay: delay }}
    />
  );
}

function Welcome() {
  const navigate = useNavigate();
  const {
    login,
    loginWithOAuth,
    register,
    user,
    loading: authLoading,
    suspended,
    clearSuspendedNotice,
  } = useAuth();
  const { appearance } = useScreenAppearance("login");
  const tr = useT();
  const [mode, setMode] = useState<Mode>("choose");
  const [isSignup, setIsSignup] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Se o utilizador já tem sessão activa (ex: fechou e reabriu o app),
  // salta directamente para /home em vez de mostrar a tela de login outra
  // vez. home.tsx já trata de redireccionar para /onboarding se o perfil
  // ainda não estiver completo.
  useEffect(() => {
    if (!authLoading && user) {
      navigate({ to: "/home" });
    }
  }, [authLoading, user, navigate]);

  // Conta suspensa pelo admin (ver auth-context.ts) — mostra o aviso uma
  // vez e volta ao ecrã normal de login, já sem sessão.
  useEffect(() => {
    if (suspended) {
      setError(tr("accountSuspendedNotice"));
      setMode("email");
      clearSuspendedNotice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suspended]);

  if (authLoading || user) {
    return <BreathingLoader fullScreen label={tr("verifyingSession")} />;
  }

  const handleContinue = async () => {
    if (!email || !password) return;
    setMode("loading");
    setError("");
    const result = isSignup ? await register(email, password, name) : await login(email, password);
    if (result.error) {
      setError(result.error);
      setMode("email");
    } else {
      navigate({ to: "/onboarding" });
    }
  };

  const handleGuest = () => navigate({ to: "/onboarding" });

  const handleSocialLogin = async (provider: "google" | "apple") => {
    setError("");
    setMode("loading");
    const { error: oauthError } = await loginWithOAuth(provider);
    if (oauthError) {
      // Só chega aqui se o pedido falhar antes do redirect (ex: provider
      // não configurado no Supabase, ou sem rede). Em caso de sucesso o
      // browser é redireccionado para o Google/Apple e este código nem
      // chega a continuar a correr nesta página.
      setError(oauthError);
      setMode("choose");
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Hero gradient — animado por omissão, ou controlado pelo tema sazonal activo no admin */}
      {appearance.enabled ? (
        <ThemeBackdrop appearance={appearance} className="absolute inset-x-0 top-0 h-[65vh]" />
      ) : (
        <div
          className="absolute inset-x-0 top-0 h-[65vh] gradient-pan"
          style={{ background: "var(--gradient-hero)" }}
        />
      )}

      {/* Orbs decorativos */}
      <AnimatedOrb className="-left-20 top-28 h-80 w-80 bg-white/10" delay="0s" />
      <AnimatedOrb className="-right-16 top-8 h-64 w-64 bg-white/8" delay="1.3s" />
      <AnimatedOrb className="left-1/3 top-40 h-40 w-40 bg-white/6" delay="0.7s" />

      {/* Partículas brilhantes */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute h-1 w-1 rounded-full bg-white/40 animate-float"
            style={{
              left: `${15 + i * 14}%`,
              top: `${10 + (i % 3) * 12}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${3 + i * 0.4}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex flex-1 flex-col px-6 pb-8 pt-14">
        {/* Logo */}
        <div
          className={`flex items-center gap-3 text-primary-foreground transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-primary-foreground/20 backdrop-blur-xl ring-1 ring-white/20">
            <Icon name="pin" size={22} />
            <span className="absolute -right-1 -top-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/60 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-white/80" />
            </span>
          </div>
          <div>
            <div className="text-lg font-bold leading-none tracking-tight">Spotter Local</div>
            <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">
              {tr("byXtack")}
            </div>
          </div>
        </div>

        {/* Hero text */}
        <div
          className={`mt-10 text-primary-foreground transition-all duration-700 delay-100 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          <h1 className="text-[2.8rem] font-bold leading-[1.03] tracking-tight">
            {appearance.enabled && appearance.heading ? (
              appearance.heading
            ) : (
              <>
                {tr("heroTitleLine1")}
                <br />
                <span className="shine-text">{tr("heroTitleLine2")}</span>
              </>
            )}
          </h1>
          <p className="mt-4 max-w-xs text-sm leading-relaxed opacity-85">
            {appearance.enabled && appearance.subtext ? appearance.subtext : tr("heroSubtext")}
          </p>

          {/* Feature badges */}
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { icon: "restaurant", label: tr("badgeRestaurants") },
              { icon: "pharmacy", label: tr("badgePharmacies") },
              { icon: "hotel", label: tr("badgeHotels") },
              { icon: "search", label: tr("badgeLocalSearch") },
            ].map((f, i) => (
              <span
                key={f.label}
                className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm ring-1 ring-white/10 animate-slide-up"
                style={{ animationDelay: `${0.3 + i * 0.06}s` }}
              >
                <Icon name={f.icon} size={11} />
                {f.label}
              </span>
            ))}
          </div>
        </div>

        {/* Card de autenticação */}
        <div
          className={`mt-auto rounded-[28px] border border-white/30 bg-card/96 p-6 shadow-[var(--shadow-lift)] backdrop-blur-2xl transition-all duration-700 delay-200 animate-auth-card-enter ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          {mode === "loading" ? (
            <div className="py-6">
              <BreathingLoader
                size={48}
                label={isSignup ? tr("creatingAccount") : tr("signingIn")}
                sub={tr("pleaseWait")}
              />
            </div>
          ) : mode === "choose" ? (
            <>
              <h2 className="text-[1.15rem] font-bold tracking-tight text-foreground">
                {tr("startInSeconds")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {SUPABASE_CONFIGURED ? tr("cloudDataSaved") : tr("demoModeLocalData")}
              </p>

              {/* Login social & Iniciar sessão */}
              <div className="mt-5 space-y-2.5">
                <SocialButton
                  icon="google"
                  label={tr("continueWithGoogle")}
                  onClick={() => handleSocialLogin("google")}
                  delay={0}
                />
                <button
                  className="press flex h-13 w-full items-center justify-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 text-sm font-bold text-primary hover:bg-primary/15 transition shadow-sm"
                  onClick={() => {
                    setIsSignup(false);
                    setMode("email");
                  }}
                >
                  <Icon name="user" size={18} />
                  Iniciar Sessão (Conta existente)
                </button>
              </div>

              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] text-muted-foreground">{tr("or")}</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-2.5">
                <button
                  className="press flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-border bg-muted/60 text-sm font-medium text-foreground hover:bg-accent/50 transition"
                  onClick={() => {
                    setIsSignup(true);
                    setMode("email");
                  }}
                >
                  <Icon name="mail" size={16} className="text-primary" />{" "}
                  {tr("createAccountWithEmail")}
                </button>
                <ShimmerButton
                  className="press flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl text-sm font-bold text-primary-foreground shadow-[var(--shadow-soft)] transition hover:opacity-90"
                  style={{ background: "var(--gradient-primary)" }}
                  onClick={handleGuest}
                >
                  {tr("continueWithoutAccount")} <Icon name="arrowRight" size={15} />
                </ShimmerButton>
              </div>

              <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
                {tr("byContinuingAgree")}{" "}
                <Link to="/privacy" className="underline decoration-dotted hover:text-primary">
                  {tr("terms")}
                </Link>{" "}
                {tr("andThe")}{" "}
                <Link to="/privacy" className="underline decoration-dotted hover:text-primary">
                  {tr("privacyPolicy")}
                </Link>
                .
              </p>

              {error && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs text-destructive animate-slide-up">
                  <Icon name="x" size={12} /> {error}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-[1.1rem] font-bold tracking-tight text-foreground">
                  {isSignup ? tr("createAccount") : tr("signIn")}
                </h2>
                <button
                  onClick={() => {
                    setMode("choose");
                    setError("");
                  }}
                  className="press inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Icon name="arrowLeft" size={12} /> {tr("back")}
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {isSignup && (
                  <div className="animate-slide-up">
                    <div className="mb-1 text-xs font-semibold text-foreground">{tr("name")}</div>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={tr("yourName")}
                      className="h-12 w-full rounded-2xl border border-input bg-background px-4 text-sm outline-none focus:border-primary transition"
                    />
                  </div>
                )}
                <div>
                  <div className="mb-1 text-xs font-semibold text-foreground">Email</div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={tr("yourEmail")}
                    className="h-12 w-full rounded-2xl border border-input bg-background px-4 text-sm outline-none focus:border-primary transition"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold text-foreground">
                    {tr("passwordLabel")}
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleContinue()}
                    placeholder={tr("minSixChars")}
                    className="h-12 w-full rounded-2xl border border-input bg-background px-4 text-sm outline-none focus:border-primary transition"
                  />
                </div>
                {error && (
                  <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs text-destructive animate-slide-up">
                    <Icon name="x" size={12} /> {error}
                  </div>
                )}
                <ShimmerButton
                  className="press h-12 w-full rounded-2xl text-sm font-bold text-primary-foreground disabled:opacity-40 transition hover:opacity-90"
                  style={{ background: "var(--gradient-primary)" }}
                  disabled={!email || !password}
                  onClick={handleContinue}
                >
                  {isSignup ? tr("createAccount") : tr("signIn")}
                </ShimmerButton>
                <button
                  className="w-full text-center text-xs text-muted-foreground hover:text-primary transition"
                  onClick={() => {
                    setIsSignup((v) => !v);
                    setError("");
                  }}
                >
                  {isSignup ? tr("alreadyHaveAccount") : tr("noAccountYet")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
