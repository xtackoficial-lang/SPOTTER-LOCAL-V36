// ============================================================
// XTACK SPOTTER — Sistema de Aparência / Temas Sazonais (v14)
// ------------------------------------------------------------
// Configuração GLOBAL: o que o admin escolhe aqui aplica-se a TODOS os
// utilizadores da app, em tempo real (via Supabase Realtime). Sem
// Supabase configurado, cai num modo local (só afecta este dispositivo) —
// útil para o admin pré-visualizar antes de publicar.
// ============================================================
import { useEffect, useState, useCallback } from "react";
import { supabase, SUPABASE_CONFIGURED } from "./supabase";

// ── Identificadores de "página/cenário" controláveis ──────────────────
// Cada um corresponde a um ecrã real da app onde o fundo/animação pode
// ser personalizado. Mantém-se uma lista fechada (em vez de string livre)
// para que o editor no admin possa mostrar checkboxes claros.
export type ThemeScreen = "login" | "home" | "profile" | "merchant" | "business";

export const THEME_SCREENS: { id: ThemeScreen; label: string }[] = [
  { id: "login", label: "Página de login" },
  { id: "home", label: "Página principal (Descobrir)" },
  { id: "profile", label: "Perfil" },
  { id: "merchant", label: "Editar negócio (comerciante)" },
  { id: "business", label: "Painel do comerciante" },
];

// ── Tipos de fundo ──────────────────────────────────────────────────
export type BackgroundType = "gradient" | "color" | "image";

export interface ScreenAppearance {
  enabled: boolean; // se este cenário está sob controlo do tema activo
  backgroundType: BackgroundType;
  backgroundValue: string; // CSS gradient | cor sólida (hex/oklch) | URL da imagem
  animation: AnimationId;
  // Textos opcionais que sobrepõem os textos por omissão do ecrã.
  // Vazio/undefined = mantém o texto original do código.
  heading?: string;
  subtext?: string;
}

export type AnimationId =
  | "none"
  | "snow"
  | "confetti"
  | "hearts"
  | "stars"
  | "fireworks"
  | "leaves"
  | "bubbles";

export const ANIMATIONS: { id: AnimationId; label: string; emoji: string }[] = [
  { id: "none", label: "Sem animação", emoji: "—" },
  { id: "snow", label: "Neve (Natal/Ano Novo)", emoji: "❄️" },
  { id: "confetti", label: "Confettis (Festa/Aniversário)", emoji: "🎉" },
  { id: "hearts", label: "Corações (Dia dos Namorados)", emoji: "💕" },
  { id: "stars", label: "Estrelas brilhantes", emoji: "✨" },
  { id: "fireworks", label: "Fogos de artifício", emoji: "🎆" },
  { id: "leaves", label: "Folhas (Outono/Independência)", emoji: "🍃" },
  { id: "bubbles", label: "Bolhas suaves", emoji: "🫧" },
];

export interface AppTheme {
  themeName: string; // nome do tema activo, só para identificação no admin
  screens: Record<ThemeScreen, ScreenAppearance>;
  updatedAt: string;
}

const DEFAULT_SCREEN: ScreenAppearance = {
  enabled: false,
  backgroundType: "gradient",
  backgroundValue: "var(--gradient-hero)",
  animation: "none",
};

export function defaultTheme(): AppTheme {
  const screens = {} as Record<ThemeScreen, ScreenAppearance>;
  for (const s of THEME_SCREENS) {
    screens[s.id] = { ...DEFAULT_SCREEN };
  }
  return { themeName: "Padrão", screens, updatedAt: new Date().toISOString() };
}

// ── Pacotes pré-definidos por ocasião ───────────────────────────────
// Cada pacote já vem com fundo + animação sugeridos para login/home.
// O admin pode aplicar com um clique e depois afinar à mão.
export interface ThemePreset {
  id: string;
  label: string;
  emoji: string;
  build: () => Pick<AppTheme, "themeName" | "screens">;
}

function presetScreens(
  backgroundValue: string,
  animation: AnimationId,
  heading?: string,
  subtext?: string,
): Record<ThemeScreen, ScreenAppearance> {
  const screens = {} as Record<ThemeScreen, ScreenAppearance>;
  for (const s of THEME_SCREENS) {
    screens[s.id] = {
      enabled: s.id === "login" || s.id === "home",
      backgroundType: "gradient",
      backgroundValue,
      animation,
      heading: s.id === "login" ? heading : undefined,
      subtext: s.id === "login" ? subtext : undefined,
    };
  }
  return screens;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "natal",
    label: "Natal",
    emoji: "🎄",
    build: () => ({
      themeName: "Natal",
      screens: presetScreens(
        "linear-gradient(160deg, oklch(0.32 0.12 150) 0%, oklch(0.22 0.1 145) 55%, oklch(0.5 0.18 25) 100%)",
        "snow",
        "Boas Festas!",
        "Descubra os melhores presentes e ceias perto de si.",
      ),
    }),
  },
  {
    id: "ano-novo",
    label: "Ano Novo",
    emoji: "🎆",
    build: () => ({
      themeName: "Ano Novo",
      screens: presetScreens(
        "linear-gradient(160deg, oklch(0.25 0.1 280) 0%, oklch(0.35 0.15 300) 55%, oklch(0.6 0.2 38) 100%)",
        "fireworks",
        "Feliz Ano Novo!",
        "Comece o ano a descobrir o que Moçambique tem de melhor.",
      ),
    }),
  },
  {
    id: "pascoa",
    label: "Páscoa",
    emoji: "🐣",
    build: () => ({
      themeName: "Páscoa",
      screens: presetScreens(
        "linear-gradient(160deg, oklch(0.85 0.08 95) 0%, oklch(0.75 0.12 140) 60%, oklch(0.7 0.1 200) 100%)",
        "bubbles",
        "Feliz Páscoa!",
        "Aproveite a época para visitar os seus locais favoritos.",
      ),
    }),
  },
  {
    id: "dia-namorados",
    label: "Dia dos Namorados",
    emoji: "💕",
    build: () => ({
      themeName: "Dia dos Namorados",
      screens: presetScreens(
        "linear-gradient(160deg, oklch(0.55 0.2 0) 0%, oklch(0.45 0.18 350) 60%, oklch(0.35 0.1 280) 100%)",
        "hearts",
        "Feliz Dia dos Namorados!",
        "Encontre o restaurante perfeito para um jantar a dois.",
      ),
    }),
  },
  {
    id: "independencia",
    label: "Dia da Independência",
    emoji: "🇲🇿",
    build: () => ({
      themeName: "Dia da Independência",
      screens: presetScreens(
        "linear-gradient(160deg, oklch(0.45 0.15 145) 0%, oklch(0.55 0.2 38) 55%, oklch(0.2 0.02 0) 100%)",
        "stars",
        "Viva Moçambique!",
        "Celebre o nosso país descobrindo os negócios locais.",
      ),
    }),
  },
  {
    id: "festa",
    label: "Festa / Aniversário da app",
    emoji: "🎉",
    build: () => ({
      themeName: "Festa",
      screens: presetScreens(
        "linear-gradient(160deg, oklch(0.66 0.19 38) 0%, oklch(0.55 0.18 300) 60%, oklch(0.45 0.12 280) 100%)",
        "confetti",
        "É festa no Spotter Local!",
        "Descubra novidades e promoções especiais.",
      ),
    }),
  },
  {
    id: "padrao",
    label: "Padrão (remover tema)",
    emoji: "↩️",
    build: () => ({ themeName: "Padrão", screens: defaultTheme().screens }),
  },
];

// ── Persistência local (fallback sem Supabase / pré-visualização) ──────
const LOCAL_KEY = "xlocal.theme.v1";

function localRead(): AppTheme {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // mescla com o default para garantir que todos os ecrãs existem,
      // mesmo que tenham sido adicionados depois de o tema ter sido gravado
      const base = defaultTheme();
      return {
        ...base,
        ...parsed,
        screens: { ...base.screens, ...(parsed.screens ?? {}) },
      };
    }
  } catch {
    /* ignorado: falha de quota/acesso ao localStorage */
  }
  return defaultTheme();
}

function localWrite(theme: AppTheme) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(theme));
  } catch {
    /* ignorado: falha de quota/acesso ao localStorage */
  }
}

// ── Leitura/escrita remota (Supabase) ───────────────────────────────
export async function fetchTheme(): Promise<AppTheme> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from("app_theme")
        .select("config")
        .eq("id", "default")
        .maybeSingle();
      if (!error && data?.config && Object.keys(data.config).length > 0) {
        const base = defaultTheme();
        const remote = data.config as Partial<AppTheme>;
        const merged: AppTheme = {
          ...base,
          ...remote,
          screens: { ...base.screens, ...(remote.screens ?? {}) },
        };
        localWrite(merged); // mantém uma cópia local para offline
        return merged;
      }
    } catch (err) {
      console.warn("fetchTheme: falha ao ler tema do Supabase, a usar local.", err);
    }
  }
  return localRead();
}

export async function saveTheme(theme: AppTheme): Promise<{ error: string | null }> {
  const next: AppTheme = { ...theme, updatedAt: new Date().toISOString() };
  localWrite(next); // optimistic: aplica já neste dispositivo
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { error } = await supabase
        .from("app_theme")
        .update({ config: next, updated_at: next.updatedAt })
        .eq("id", "default");
      if (error) return { error: error.message };
      return { error: null };
    } catch (err) {
      console.warn("saveTheme: falha ao gravar tema no Supabase.", err);
      return {
        error: "Guardado apenas neste dispositivo — sem ligação ao Supabase para publicar a todos.",
      };
    }
  }
  return {
    error: "Sem Supabase configurado: o tema só foi guardado neste dispositivo.",
  };
}

// ── Hook reactivo: usado pelas páginas para saber o tema actual ───────
// Subscreve a mudanças em tempo real — quando o admin grava um novo
// tema, todos os utilizadores com a app aberta vêem a mudança sem
// precisar de fechar e reabrir.
export function useAppTheme() {
  const [theme, setTheme] = useState<AppTheme>(() => localRead());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTheme().then((t) => {
      if (!cancelled) {
        setTheme(t);
        setLoaded(true);
      }
    });

    if (!SUPABASE_CONFIGURED || !supabase) {
      return () => {
        cancelled = true;
      };
    }
    const client = supabase;
    const channel = client
      .channel("app_theme_changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "app_theme", filter: "id=eq.default" },
        (payload) => {
          const config = (payload.new as { config?: Partial<AppTheme> })?.config;
          if (!config) return;
          const base = defaultTheme();
          const merged: AppTheme = {
            ...base,
            ...config,
            screens: { ...base.screens, ...(config.screens ?? {}) },
          };
          setTheme(merged);
          localWrite(merged);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      client.removeChannel(channel);
    };
  }, []);

  // Devolve a aparência de um ecrã específico, já resolvida (com
  // fallback ao default se o ecrã não estiver activo).
  const getScreen = useCallback(
    (screen: ThemeScreen): ScreenAppearance => theme.screens[screen] ?? DEFAULT_SCREEN,
    [theme],
  );

  return { theme, loaded, getScreen };
}

// Hook utilitário para UMA única página: devolve directamente a
// aparência resolvida desse ecrã, já reactiva a alterações remotas.
export function useScreenAppearance(screen: ThemeScreen) {
  const { getScreen, loaded } = useAppTheme();
  return { appearance: getScreen(screen), loaded };
}
