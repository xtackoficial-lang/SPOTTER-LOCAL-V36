import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacidade e Termos — Spotter Local" }] }),
  component: PrivacyPage,
});

const PRIVACY_KEY = "xlocal.privacy.v1";

function loadSettings() {
  try {
    const s = localStorage.getItem(PRIVACY_KEY);
    return s ? JSON.parse(s) : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

const defaultSettings = {
  shareLocation: true,
  showProfileToMerchants: true,
  personalizedAds: false,
};

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
        <Icon name={icon} size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {description}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
        aria-checked={checked}
        role="switch"
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function LegalBlock({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="press flex w-full items-center justify-between px-4 py-3.5 text-left"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <Icon
          name={open ? "chevronDown" : "chevronRight"}
          size={14}
          className="text-muted-foreground shrink-0"
        />
      </button>
      {open && (
        <div className="border-t border-border px-4 py-4 text-[12px] leading-relaxed text-muted-foreground space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

function PrivacyPage() {
  const tr = useT();
  const navigate = useNavigate();
  const [settings, setSettingsState] = useState(loadSettings);
  const [exported, setExported] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<"privacy" | "terms">("privacy");

  function update(patch: Partial<typeof defaultSettings>) {
    const next = { ...settings, ...patch };
    setSettingsState(next);
    localStorage.setItem(PRIVACY_KEY, JSON.stringify(next));
  }

  function handleExport() {
    const data = {
      exportDate: new Date().toISOString(),
      privacySettings: settings,
      note: tr("privacyExportedData") + ". Para mais informações contacte xtackoficial@gmail.com",
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = tr("privacyExportFilename");
    a.click();
    setExported(true);
    setTimeout(() => setExported(false), 3000);
  }

  function handleDeleteAccount() {
    const keys = Object.keys(localStorage).filter(
      (k) => k.startsWith("xlocal.") || k.startsWith("spotter."),
    );
    keys.forEach((k) => localStorage.removeItem(k));
    navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-5 py-4">
        <Link
          to="/profile"
          className="press grid h-9 w-9 place-items-center rounded-xl border border-border bg-card"
        >
          <Icon name="arrowLeft" size={16} />
        </Link>
        <h1 className="text-base font-semibold tracking-tight text-foreground">
          Privacidade & Termos
        </h1>
      </header>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-border bg-card px-5 py-2">
        <button
          onClick={() => setTab("privacy")}
          className={`press flex-1 rounded-xl py-2 text-xs font-semibold transition ${tab === "privacy" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Privacidade
        </button>
        <button
          onClick={() => setTab("terms")}
          className={`press flex-1 rounded-xl py-2 text-xs font-semibold transition ${tab === "terms" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Termos de Uso
        </button>
      </div>

      <main className="flex-1 space-y-6 px-5 py-5 pb-24">
        {tab === "privacy" && (
          <>
            <Section title={tr("myDataSection")}>
              <ToggleRow
                icon="pin"
                title={tr("shareLocationTitle")}
                description={tr("shareLocationDesc")}
                checked={settings.shareLocation}
                onChange={(v) => update({ shareLocation: v })}
              />
              <ToggleRow
                icon="store"
                title={tr("showProfileTitle")}
                description={tr("showProfileDesc")}
                checked={settings.showProfileToMerchants}
                onChange={(v) => update({ showProfileToMerchants: v })}
              />
              <ToggleRow
                icon="megaphone"
                title={tr("personalizedAdsTitle")}
                description={tr("personalizedAdsDesc")}
                checked={settings.personalizedAds}
                onChange={(v) => update({ personalizedAds: v })}
              />
            </Section>

            <Section title={tr("privacyFullPolicyTitle")}>
              <LegalBlock title={tr("privacyWhoWeAre")}>
                <p>
                  O Spotter Local é uma aplicação desenvolvida pela XTACK OFICIAL (doravante "nós"),
                  com sede em Inhambane e Maputo, Moçambique. Contacto: xtackoficial@gmail.com
                </p>
              </LegalBlock>
              <LegalBlock title={tr("privacyDataCollected")}>
                <p>
                  <strong>Dados de localização:</strong> Apenas usados para ordenar resultados por
                  proximidade. Nunca guardados nos nossos servidores sem o teu consentimento
                  explícito.
                </p>
                <p>
                  <strong>Dados de conta:</strong> Nome, email e password (com hash SHA-256)
                  guardados de forma segura no Supabase (infra-estrutura na UE).
                </p>
                <p>
                  <strong>Dados de negócio:</strong> Nome, categoria, localização, fotos, horários e
                  contactos fornecidos voluntariamente pelos comerciantes.
                </p>
                <p>
                  <strong>Dados de uso:</strong> Pesquisas e visualizações de perfis, usados para
                  melhorar recomendações (apenas se "{tr("privacyAds")}" estiver activo).
                </p>
              </LegalBlock>
              <LegalBlock title={tr("privacyDevicePerms")}>
                <p>
                  <strong>Localização (GPS):</strong> Opcional. Usada para ordenar negócios por
                  distância. Podes recusar e a app funciona na mesma.
                </p>
                <p>
                  <strong>Câmara:</strong> Usada apenas pelo scanner QR. Nunca acedemos à câmara sem
                  acção explícita tua.
                </p>
                <p>
                  <strong>Notificações Push:</strong> Opcionais. Usadas para alertar sobre promoções
                  e mensagens de negócios.
                </p>
                <p>
                  <strong>Internet:</strong> Necessária para sincronizar dados com o Supabase e
                  carregar imagens.
                </p>
              </LegalBlock>
              <LegalBlock title={tr("privacyThirdParty")}>
                <p>Não vendemos os teus dados a terceiros. Usamos:</p>
                <p>
                  • <strong>Supabase</strong> (base de dados, infra-estrutura EU) — para guardar
                  perfis de negócios e contas.
                </p>
                <p>
                  • <strong>Firebase</strong> (Google) — apenas para notificações push, se
                  activadas.
                </p>
                <p>
                  • <strong>Unsplash</strong> — imagens de capa genéricas para negócios sem foto
                  própria.
                </p>
              </LegalBlock>
              <LegalBlock title={tr("privacyYourRights")}>
                <p>
                  Tens direito a: aceder aos teus dados, rectificá-los, exportá-los (botão abaixo) e
                  eliminá-los a qualquer momento. Para exerceres esses direitos envia um email para
                  xtackoficial@gmail.com.
                </p>
              </LegalBlock>
              <LegalBlock title={tr("privacyMinors")}>
                <p>
                  O Spotter Local não é dirigido a menores de 13 anos. Se souberes que um menor
                  forneceu dados pessoais, contacta-nos para os eliminar.
                </p>
              </LegalBlock>
              <LegalBlock title={tr("privacySecurity")}>
                <p>
                  Passwords são armazenadas com hash (nunca em texto claro). A comunicação com o
                  servidor usa HTTPS/TLS. Os tokens de sessão expiram automaticamente.
                </p>
              </LegalBlock>
              <LegalBlock title={tr("privacyPolicyChanges")}>
                <p>
                  Qualquer alteração significativa será comunicada via notificação na app. A data de
                  última actualização é: Junho 2026.
                </p>
              </LegalBlock>
            </Section>

            <Section title={tr("yourRightsSection")}>
              <button
                onClick={handleExport}
                className="press flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-left hover:bg-accent/40"
              >
                <span className="inline-flex items-center gap-3 text-sm font-medium text-foreground">
                  <Icon name="send" size={16} className="text-primary" /> {tr("exportMyData")}
                </span>
                <Icon
                  name={exported ? "check" : "chevronRight"}
                  size={14}
                  className="text-muted-foreground"
                />
              </button>
              <a
                href="mailto:xtackoficial@gmail.com?subject=Política%20de%20Privacidade%20Spotter%20Local"
                className="press flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-left hover:bg-accent/40"
              >
                <span className="inline-flex items-center gap-3 text-sm font-medium text-foreground">
                  <Icon name="help" size={16} className="text-primary" /> Contactar sobre
                  privacidade
                </span>
                <Icon name="chevronRight" size={14} className="text-muted-foreground" />
              </a>
            </Section>

            <Section title={tr("dangerZone")}>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="press flex w-full items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3.5 text-left text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  <Icon name="x" size={16} /> {tr("deleteAccountAction")}
                </button>
              ) : (
                <div className="space-y-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                  <p className="text-xs leading-relaxed text-destructive">
                    {tr("deleteAccountWarning")}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="press flex-1 rounded-xl border border-border bg-card py-2.5 text-xs font-semibold text-foreground"
                    >
                      {tr("cancelAction")}
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      className="press flex-1 rounded-xl bg-destructive py-2.5 text-xs font-semibold text-white"
                    >
                      {tr("confirmDeleteAction")}
                    </button>
                  </div>
                </div>
              )}
            </Section>
          </>
        )}

        {tab === "terms" && (
          <>
            <div className="rounded-2xl border border-border bg-card px-4 py-3.5 text-[11px] text-muted-foreground">
              Última actualização: Junho 2026 · Desenvolvido por XTACK OFICIAL ·
              xtackoficial@gmail.com
            </div>

            <Section title={tr("termsOfUseTitle")}>
              <LegalBlock title="1. Aceitação dos Termos">
                <p>
                  Ao utilizar o Spotter Local, aceitas estes Termos de Uso. Se não concordares, não
                  deverás utilizar a aplicação.
                </p>
              </LegalBlock>
              <LegalBlock title="2. Descrição do serviço">
                <p>
                  O Spotter Local é uma plataforma de descoberta de negócios locais em Moçambique.
                  Permite aos utilizadores encontrar restaurantes, hotéis, farmácias e outros
                  serviços perto de si, e aos comerciantes listarem e promoverem os seus negócios.
                </p>
              </LegalBlock>
              <LegalBlock title="3. Conta de utilizador">
                <p>• Podes usar o Spotter Local sem conta para explorar negócios.</p>
                <p>• Para criar avaliações ou enviar mensagens é necessária conta.</p>
                <p>• Comerciantes precisam de conta para gerir o perfil do seu negócio.</p>
                <p>• És responsável pela confidencialidade da tua password.</p>
                <p>• Só podes ter uma conta por pessoa/negócio.</p>
              </LegalBlock>
              <LegalBlock title="4. Regras de uso">
                <p>É proibido:</p>
                <p>• Publicar informações falsas ou enganosas sobre negócios.</p>
                <p>• Criar avaliações falsas ou pagas (astroturfing).</p>
                <p>• Usar a plataforma para spam, fraude ou actividades ilegais.</p>
                <p>• Tentar aceder a contas de outros utilizadores.</p>
                <p>• Fazer scraping ou uso automatizado sem autorização.</p>
              </LegalBlock>
              <LegalBlock title="5. Conteúdo dos comerciantes">
                <p>
                  Os comerciantes são responsáveis pelo conteúdo que publicam (fotos, descrições,
                  horários, preços). A XTACK OFICIAL reserva-se o direito de remover conteúdo que
                  viole estes termos ou que seja enganoso.
                </p>
              </LegalBlock>
              <LegalBlock title="6. Planos e pagamentos">
                <p>• O plano Free é gratuito e permanece sempre disponível.</p>
                <p>
                  • Planos pagos (Starter 300 MZN, Pro 500 MZN, Premium 900 MZN) são cobrados
                  mensalmente via M-Pesa ou e-Mola.
                </p>
                <p>• Cancelamentos entram em vigor no fim do período pago.</p>
                <p>• Não há reembolsos por períodos parciais.</p>
                <p>• Os preços podem ser actualizados com aviso prévio de 30 dias.</p>
              </LegalBlock>
              <LegalBlock title="7. Propriedade intelectual">
                <p>
                  O Spotter Local, logótipo, marca e código são propriedade da XTACK OFICIAL. Ao
                  publicar fotos ou texto na plataforma, concedes à XTACK OFICIAL uma licença
                  não-exclusiva para exibir esse conteúdo na app.
                </p>
              </LegalBlock>
              <LegalBlock title="8. Limitação de responsabilidade">
                <p>
                  A XTACK OFICIAL não garante a exactidão de horários, preços ou disponibilidade dos
                  negócios listados. Essas informações são fornecidas pelos próprios comerciantes.
                  Não somos responsáveis por experiências negativas em negócios descobertos através
                  da app.
                </p>
              </LegalBlock>
              <LegalBlock title="9. Disponibilidade do serviço">
                <p>
                  Fazemos o possível para manter o Spotter Local disponível 24/7, mas não garantimos
                  disponibilidade ininterrupta. Manutenções ou falhas técnicas podem ocorrer.
                </p>
              </LegalBlock>
              <LegalBlock title="10. Lei aplicável">
                <p>
                  Estes termos são regidos pela lei moçambicana. Para questões legais, o foro
                  competente é o de Inhambane, Moçambique.
                </p>
              </LegalBlock>
              <LegalBlock title="11. Contacto">
                <p>XTACK OFICIAL · xtackoficial@gmail.com · WhatsApp: +258 870 480 970</p>
                <p>
                  Para reclamações, dúvidas ou remoção de conteúdo, responderemos em até 72 horas.
                </p>
              </LegalBlock>
            </Section>

            <a
              href="mailto:xtackoficial@gmail.com?subject=Termos%20de%20Uso%20Spotter%20Local"
              className="press flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-left hover:bg-accent/40"
            >
              <span className="inline-flex items-center gap-3 text-sm font-medium text-foreground">
                <Icon name="help" size={16} className="text-primary" /> Dúvidas sobre os termos
              </span>
              <Icon name="chevronRight" size={14} className="text-muted-foreground" />
            </a>
          </>
        )}

        <p className="text-center text-[10px] text-muted-foreground">
          Spotter Local · by XTACK OFICIAL
        </p>
      </main>
    </div>
  );
}
