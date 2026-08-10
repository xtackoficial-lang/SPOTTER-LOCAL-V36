import { useState } from "react";
import {
  ArrowLeft, Heart, MapPin, Clock, Navigation, Phone, MessageCircle,
  Star, Send, Lock, Check, Sparkles, ChevronRight, UtensilsCrossed,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────
// DADOS DE REFERÊNCIA — "Restaurante Mar Azul" (o mesmo negócio do
// print que o Abrão enviou), usado como conteúdo piloto em todas as
// estruturas e temas, para comparação directa lado a lado.
// ─────────────────────────────────────────────────────────────────
const BUSINESS = {
  name: "Restaurante Mar Azul",
  category: "Restaurante",
  priceLevel: "$$",
  rating: 4.7,
  reviews: 312,
  address: "Av. Marginal, 1234, Maputo",
  hoursText: "Aberto 24h",
  openNow: true,
  phone: "+258 84 000 0001",
  description: "Cozinha de mariscos com vista para o mar. Pratos do dia e ambiente familiar.",
  cover:
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80",
  gallery: [
    "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&q=80",
    "https://images.unsplash.com/photo-1551632436-cbf8dd35adfa?w=600&q=80",
    "https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=600&q=80",
  ],
  menu: [
    { name: "Camarão grelhado", price: "650 MZN" },
    { name: "Lagosta à Mar Azul", price: "1 200 MZN" },
    { name: "Peixe do dia", price: "480 MZN" },
  ],
};

// ─────────────────────────────────────────────────────────────────
// TEMAS — cor de destaque + fundo. Independentes da Estrutura.
// O LED/Glow é uma opção de tema disponível para qualquer categoria,
// não só negócios online — pedido explícito do Abrão, com cuidado
// extra de contraste (nunca dourado-sobre-dourado, texto sempre com
// camada escura sólida por trás antes do glow).
// ─────────────────────────────────────────────────────────────────
const THEMES = {
  classico: {
    label: "Clássico XTACK",
    accent: "#D4A24C",
    accentSoft: "rgba(212,162,76,0.14)",
    bg: "#0E0D0C",
    card: "#171512",
    text: "#F4EFE6",
    sub: "#A89A86",
    border: "rgba(212,162,76,0.18)",
    glow: false,
  },
  oceano: {
    label: "Oceano",
    accent: "#3FB6C9",
    accentSoft: "rgba(63,182,201,0.14)",
    bg: "#0A1416",
    card: "#0F1E21",
    text: "#E9F6F8",
    sub: "#7FA3A8",
    border: "rgba(63,182,201,0.2)",
    glow: false,
  },
  terra: {
    label: "Terracota",
    accent: "#E07A4C",
    accentSoft: "rgba(224,122,76,0.14)",
    bg: "#150E0B",
    card: "#1E1410",
    text: "#F6ECE3",
    sub: "#B79A87",
    border: "rgba(224,122,76,0.2)",
    glow: false,
  },
  led: {
    label: "LED / Glow",
    accent: "#39FF8E",
    accentSoft: "rgba(57,255,142,0.12)",
    bg: "#050608",
    card: "#0B0D10",
    text: "#F2FFF6",
    sub: "#7FA98F",
    border: "rgba(57,255,142,0.35)",
    glow: true,
  },
};

// ─────────────────────────────────────────────────────────────────
// ESTRUTURAS — organização dos blocos.
// "free1" / "free2": as 2 estruturas básicas do plano Free, sem
// cardápio, mas com botão de Rota e bloco de reserva mais destacados
// (pedido do Abrão). "pago1": exemplo de estrutura paga, com cardápio
// e blocos adicionais. O comerciante reordena os blocos dentro da
// estrutura escolhida — por isso cada bloco é uma peça independente.
// ─────────────────────────────────────────────────────────────────
const STRUCTURES = {
  free_classica: {
    label: "Clássica",
    plan: "free",
    blocks: ["cover", "info", "routeBig", "about", "contactRow", "reserve"],
  },
  free_mapa: {
    label: "Foco na Rota",
    plan: "free",
    blocks: ["cover", "routeHero", "info", "about", "contactRow", "reserve"],
  },
  pago_cardapio: {
    label: "Com Cardápio",
    plan: "pago",
    blocks: ["cover", "info", "menu", "gallery", "about", "routeBig", "contactRow", "reserve"],
  },
};

function StarRating({ rating }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <Star size={15} fill="currentColor" strokeWidth={0} />
      <b>{rating}</b>
    </span>
  );
}

// ── Blocos individuais ──────────────────────────────────────────
function BlockCover({ t }) {
  return (
    <div style={{ position: "relative", height: 230 }}>
      <img
        src={BUSINESS.cover}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg, rgba(0,0,0,0.05) 0%, ${t.bg}E6 92%)`,
        }}
      />
      <div style={{ position: "absolute", top: 14, left: 14, right: 14, display: "flex", justifyContent: "space-between" }}>
        <Circle t={t}><ArrowLeft size={18} /></Circle>
        <Circle t={t}><Heart size={18} /></Circle>
      </div>
    </div>
  );
}
function Circle({ t, children }) {
  return (
    <div
      style={{
        width: 36, height: 36, borderRadius: 999, display: "grid", placeItems: "center",
        background: "rgba(20,18,16,0.55)", backdropFilter: "blur(6px)", color: t.text,
        border: `1px solid ${t.border}`,
      }}
    >
      {children}
    </div>
  );
}

function BlockInfo({ t }) {
  return (
    <div style={{ padding: "0 16px 14px", marginTop: -36, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 800, color: t.text, lineHeight: 1.15 }}>
            {BUSINESS.name}
          </div>
          <div style={{ fontSize: 13, color: t.sub, marginTop: 2 }}>
            {BUSINESS.category} · {BUSINESS.priceLevel}
          </div>
        </div>
        <div style={{ textAlign: "right", color: t.accent, fontSize: 15, whiteSpace: "nowrap" }}>
          <StarRating rating={BUSINESS.rating} />
          <div style={{ fontSize: 11, color: t.sub, marginTop: 1 }}>{BUSINESS.reviews} avaliações</div>
        </div>
      </div>
      <Row icon={<MapPin size={14} />} text={BUSINESS.address} t={t} />
      <Row icon={<Clock size={14} />} text={`${BUSINESS.hoursText} · Aberto`} t={t} />
    </div>
  );
}
function Row({ icon, text, t }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, color: t.text, fontSize: 13.5 }}>
      <span style={{ color: t.accent }}>{icon}</span>
      {text}
    </div>
  );
}

function BlockAbout({ t }) {
  return (
    <div style={{ padding: "4px 16px 14px", color: t.text, fontSize: 13.5, lineHeight: 1.5, opacity: 0.92 }}>
      {BUSINESS.description}
    </div>
  );
}

function BlockContactRow({ t }) {
  const items = [
    { icon: <Navigation size={16} />, label: "Rota" },
    { icon: <Phone size={16} />, label: "Ligar" },
    { icon: <MessageCircle size={16} />, label: "WhatsApp" },
  ];
  return (
    <div style={{ display: "flex", gap: 8, padding: "4px 16px 14px" }}>
      {items.map((it) => (
        <div
          key={it.label}
          style={{
            flex: 1, borderRadius: 16, padding: "12px 4px", textAlign: "center",
            border: `1px solid ${t.border}`, background: t.card, color: t.text,
            boxShadow: t.glow ? `0 0 14px ${t.accentSoft}` : "none",
          }}
        >
          <div style={{ color: t.accent, display: "flex", justifyContent: "center", marginBottom: 4 }}>{it.icon}</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}

// Botão de Rota grande — versão "destacada" pedida pelo Abrão para as
// estruturas Free: maior, com a acção principal mais óbvia, e um
// subtítulo curto a dizer ao cliente o que vai acontecer.
function BlockRouteBig({ t }) {
  return (
    <div style={{ padding: "4px 16px 14px" }}>
      <button
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          borderRadius: 18, padding: "14px 16px", border: `1px solid ${t.border}`,
          background: t.glow
            ? `linear-gradient(135deg, ${t.accentSoft}, transparent)`
            : t.accentSoft,
          color: t.text, boxShadow: t.glow ? `0 0 22px ${t.accentSoft}` : "none",
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 999, background: t.accent, display: "grid",
          placeItems: "center", color: t.bg, flexShrink: 0,
        }}>
          <Navigation size={18} />
        </div>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>Ver rota até aqui</div>
          <div style={{ fontSize: 11.5, color: t.sub }}>Abre no Google Maps ou Apple Maps</div>
        </div>
        <ChevronRight size={18} style={{ marginLeft: "auto", color: t.sub }} />
      </button>
    </div>
  );
}

// Versão "hero" do bloco de rota — usado na estrutura "Foco na Rota":
// fica logo abaixo da capa, antes até da info textual, para clientes
// que só querem chegar lá o mais rápido possível.
function BlockRouteHero({ t }) {
  return (
    <div style={{ padding: "12px 16px 6px" }}>
      <div
        style={{
          borderRadius: 20, padding: 16, border: `1px solid ${t.border}`,
          background: t.glow ? `linear-gradient(135deg, ${t.accentSoft}, transparent)` : t.card,
          boxShadow: t.glow ? `0 0 26px ${t.accentSoft}` : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.accent, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>
          <Navigation size={14} /> A 0 m de si agora
        </div>
        <div style={{ color: t.text, fontSize: 14, marginTop: 6, marginBottom: 12, opacity: 0.85 }}>
          {BUSINESS.address}
        </div>
        <button style={{
          width: "100%", padding: "12px 0", borderRadius: 14, border: "none",
          background: t.accent, color: t.bg, fontWeight: 800, fontSize: 14,
        }}>
          Iniciar rota
        </button>
      </div>
    </div>
  );
}

function BlockReserve({ t }) {
  return (
    <div style={{ padding: "4px 16px 22px" }}>
      <div style={{ borderRadius: 18, border: `1px solid ${t.border}`, background: t.card, padding: 16 }}>
        <div style={{ fontWeight: 700, color: t.text, fontSize: 14.5 }}>Reservar / pedir info</div>
        <div style={{ fontSize: 12, color: t.sub, marginTop: 3, marginBottom: 12 }}>
          Envie uma mensagem ao gerente. Resposta no chat do app.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{
            flex: 1, borderRadius: 999, border: `1px solid ${t.border}`, padding: "10px 14px",
            fontSize: 12.5, color: t.sub,
          }}>
            Mesa para 2 às 20h…
          </div>
          <button style={{
            width: 42, height: 42, borderRadius: 999, border: "none", background: t.accent,
            color: t.bg, display: "grid", placeItems: "center", flexShrink: 0,
            boxShadow: t.glow ? `0 0 16px ${t.accentSoft}` : "none",
          }}>
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function BlockMenu({ t }) {
  return (
    <div style={{ padding: "10px 16px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <UtensilsCrossed size={15} style={{ color: t.accent }} />
        <div style={{ fontWeight: 700, color: t.text, fontSize: 14.5 }}>Cardápio</div>
        <span style={{
          marginLeft: "auto", fontSize: 10, fontWeight: 700, color: t.accent, background: t.accentSoft,
          padding: "2px 8px", borderRadius: 999,
        }}>
          PLANO PAGO
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {BUSINESS.menu.map((item) => (
          <div
            key={item.name}
            style={{
              display: "flex", justifyContent: "space-between", padding: "10px 12px",
              borderRadius: 12, border: `1px solid ${t.border}`, background: t.card,
              color: t.text, fontSize: 13.5,
            }}
          >
            <span>{item.name}</span>
            <b style={{ color: t.accent }}>{item.price}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlockGallery({ t }) {
  return (
    <div style={{ padding: "4px 16px 14px" }}>
      <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
        {BUSINESS.gallery.map((src) => (
          <img
            key={src}
            src={src}
            alt=""
            style={{ width: 96, height: 72, borderRadius: 12, objectFit: "cover", border: `1px solid ${t.border}`, flexShrink: 0 }}
          />
        ))}
      </div>
    </div>
  );
}

const BLOCK_MAP = {
  cover: BlockCover,
  info: BlockInfo,
  about: BlockAbout,
  contactRow: BlockContactRow,
  routeBig: BlockRouteBig,
  routeHero: BlockRouteHero,
  reserve: BlockReserve,
  menu: BlockMenu,
  gallery: BlockGallery,
};

// ─────────────────────────────────────────────────────────────────
export default function App() {
  const [structureKey, setStructureKey] = useState("free_classica");
  const [themeKey, setThemeKey] = useState("classico");
  const structure = STRUCTURES[structureKey];
  const t = THEMES[themeKey];
  const isPaidStructure = structure.plan === "pago";

  return (
    <div style={{ minHeight: "100vh", background: "#080706", fontFamily: "Inter, system-ui, sans-serif", padding: "28px 16px 60px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <header style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ color: "#D4A24C", fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>
            Spotter Local · Protótipo
          </div>
          <h1 style={{ color: "#F4EFE6", fontSize: 22, fontWeight: 800, margin: "6px 0 4px" }}>
            Estruturas &amp; Temas de Perfil — Restaurante
          </h1>
          <p style={{ color: "#8C7E6B", fontSize: 13, margin: 0 }}>
            Mesmo negócio (Mar Azul), estrutura e tema diferentes. Escolhe abaixo para comparar.
          </p>
        </header>

        {/* ── Seletor de Estrutura ── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: "#8C7E6B", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
            1. Estrutura (organização dos blocos)
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(STRUCTURES).map(([key, s]) => (
              <button
                key={key}
                onClick={() => setStructureKey(key)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 999,
                  border: structureKey === key ? "1px solid #D4A24C" : "1px solid #2A251E",
                  background: structureKey === key ? "rgba(212,162,76,0.14)" : "#141210",
                  color: structureKey === key ? "#D4A24C" : "#B6A88F",
                  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                }}
              >
                {s.plan === "pago" && <Lock size={11} />}
                {s.label}
                <span style={{ fontSize: 10, opacity: 0.65 }}>
                  {s.plan === "free" ? "· Free" : "· Pago"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Seletor de Tema ── */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ color: "#8C7E6B", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
            2. Tema (cor + fundo)
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(THEMES).map(([key, th]) => (
              <button
                key={key}
                onClick={() => setThemeKey(key)}
                style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 999,
                  border: themeKey === key ? `1px solid ${th.accent}` : "1px solid #2A251E",
                  background: themeKey === key ? th.accentSoft : "#141210",
                  color: themeKey === key ? th.accent : "#B6A88F",
                  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  boxShadow: themeKey === key && th.glow ? `0 0 14px ${th.accentSoft}` : "none",
                }}
              >
                <span style={{ width: 11, height: 11, borderRadius: 999, background: th.accent, display: "inline-block" }} />
                {th.label}
                {th.glow && <Sparkles size={11} />}
              </button>
            ))}
          </div>
        </div>

        {/* ── Frame de telefone ── */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div
            style={{
              width: 360, borderRadius: 38, border: "10px solid #1C1A17", background: t.bg,
              overflow: "hidden", boxShadow: "0 30px 60px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ maxHeight: 680, overflowY: "auto" }}>
              {structure.blocks.map((blockKey) => {
                const Block = BLOCK_MAP[blockKey];
                return <Block key={blockKey} t={t} />;
              })}
              <div style={{ textAlign: "center", padding: "0 0 18px", color: t.sub, fontSize: 10.5, opacity: 0.6 }}>
                XTACK OFICIAL
              </div>
            </div>
          </div>
        </div>

        {/* ── Nota sobre o plano ── */}
        <div style={{ textAlign: "center", marginTop: 18 }}>
          {isPaidStructure ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#D4A24C", fontSize: 12.5 }}>
              <Check size={14} /> Estrutura paga — inclui cardápio, galeria e mais blocos.
            </div>
          ) : (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#8C7E6B", fontSize: 12.5 }}>
              <Lock size={14} /> Estrutura Free — sem cardápio. Upgrade desbloqueia 3 a 6 estruturas com mais blocos.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
