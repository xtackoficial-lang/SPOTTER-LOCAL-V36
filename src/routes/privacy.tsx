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
          {tr("privacyAndTermsTitle")}
        </h1>
      </header>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-border bg-card px-5 py-2">
        <button
          onClick={() => setTab("privacy")}
          className={`press flex-1 rounded-xl py-2 text-xs font-semibold transition ${tab === "privacy" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          {tr("privacyTabLabel")}
        </button>
        <button
          onClick={() => setTab("terms")}
          className={`press flex-1 rounded-xl py-2 text-xs font-semibold transition ${tab === "terms" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          {tr("termsTabLabel")}
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
                  {tr("whoWeAreBody")}
                </p>
              </LegalBlock>
              <LegalBlock title={tr("privacyDataCollected")}>
                <p>
                  <strong>{tr("dataLocationLabel")}</strong> {tr("dataLocationBody")}
                </p>
                <p>
                  <strong>{tr("dataAccountLabel")}</strong> {tr("dataAccountBody")}
                </p>
                <p>
                  <strong>{tr("emailUsageLabel")}</strong> {tr("emailUsageBody")}
                </p>
                <p>
                  <strong>{tr("dataBusinessLabel")}</strong> {tr("dataBusinessBody")}
                </p>
                <p>
                  <strong>{tr("dataUsageLabel")}</strong> {tr("dataUsageBody").replace("{ads}", tr("privacyAds"))}
                </p>
              </LegalBlock>
              <LegalBlock title={tr("privacyDevicePerms")}>
                <p>
                  <strong>{tr("gpsPermLabel")}</strong> {tr("gpsPermBody")}
                </p>
                <p>
                  <strong>{tr("cameraPermLabel")}</strong> {tr("cameraPermBody")}
                </p>
                <p>
                  <strong>{tr("pushPermLabel")}</strong> {tr("pushPermBody")}
                </p>
                <p>
                  <strong>{tr("internetPermLabel")}</strong> {tr("internetPermBody")}
                </p>
              </LegalBlock>
              <LegalBlock title={tr("privacyThirdParty")}>
                <p>{tr("thirdPartyIntro")}</p>
                <p>
                  • <strong>{tr("supabaseLabel")}</strong> {tr("supabaseBody")}
                </p>
                <p>
                  • <strong>{tr("firebaseLabel")}</strong> {tr("firebaseBody")}
                </p>
                <p>
                  • <strong>{tr("unsplashLabel")}</strong> {tr("unsplashBody")}
                </p>
              </LegalBlock>
              <LegalBlock title={tr("privacyYourRights")}>
                <p>
                  {tr("yourRightsBody")}
                </p>
              </LegalBlock>
              <LegalBlock title={tr("privacyMinors")}>
                <p>
                  {tr("minorsBody")}
                </p>
              </LegalBlock>
              <LegalBlock title={tr("privacySecurity")}>
                <p>
                  {tr("securityBody")}
                </p>
              </LegalBlock>
              <LegalBlock title={tr("privacyPolicyChanges")}>
                <p>
                  {tr("policyChangesBody")}
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
                href={`mailto:xtackoficial@gmail.com?subject=${encodeURIComponent(tr("privacyPolicyLabel") + " Spotter Local")}`}
                className="press flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-left hover:bg-accent/40"
              >
                <span className="inline-flex items-center gap-3 text-sm font-medium text-foreground">
                  <Icon name="help" size={16} className="text-primary" /> {tr("contactAboutPrivacyLabel")}
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
              {tr("lastUpdatedLabel")}: Junho 2026 · {tr("developedBySuffix")} XTACK OFICIAL ·
              xtackoficial@gmail.com
            </div>

            <Section title={tr("termsOfUseTitle")}>
              <LegalBlock title={tr("termsSection1Title")}>
                <p>
                  {tr("termsSection1Body")}
                </p>
              </LegalBlock>
              <LegalBlock title={tr("termsSection2Title")}>
                <p>
                  {tr("termsSection2Body")}
                </p>
              </LegalBlock>
              <LegalBlock title={tr("termsSection3Title")}>
                <p>• {tr("termsAccountBullet1")}</p>
                <p>• {tr("termsAccountBullet2")}</p>
                <p>• {tr("termsAccountBullet3")}</p>
                <p>• {tr("termsAccountBullet4")}</p>
                <p>• {tr("termsAccountBullet5")}</p>
              </LegalBlock>
              <LegalBlock title={tr("termsSection4Title")}>
                <p>{tr("termsUsageIntro")}</p>
                <p>• {tr("termsUsageBullet1")}</p>
                <p>• {tr("termsUsageBullet2")}</p>
                <p>• {tr("termsUsageBullet3")}</p>
                <p>• {tr("termsUsageBullet4")}</p>
                <p>• {tr("termsUsageBullet5")}</p>
              </LegalBlock>
              <LegalBlock title={tr("termsSection5Title")}>
                <p>
                  {tr("termsSection5Body")}
                </p>
              </LegalBlock>
              <LegalBlock title={tr("termsSection6Title")}>
                <p>• {tr("termsPlansBullet1")}</p>
                <p>
                  • {tr("termsPlansBullet2")}
                </p>
                <p>• {tr("termsPlansBullet3")}</p>
                <p>• {tr("termsPlansBullet4")}</p>
                <p>• {tr("termsPlansBullet5")}</p>
              </LegalBlock>
              <LegalBlock title={tr("termsSection7Title")}>
                <p>
                  {tr("termsSection7Body")}
                </p>
              </LegalBlock>
              <LegalBlock title={tr("termsSection8Title")}>
                <p>
                  {tr("termsSection8Body")}
                </p>
              </LegalBlock>
              <LegalBlock title={tr("termsSection9Title")}>
                <p>
                  {tr("termsSection9Body")}
                </p>
              </LegalBlock>
              <LegalBlock title={tr("termsSection10Title")}>
                <p>
                  {tr("termsSection10Body")}
                </p>
              </LegalBlock>
              <LegalBlock title={tr("termsSection11Title")}>
                <p>XTACK OFICIAL · xtackoficial@gmail.com · WhatsApp: +258 870 480 970</p>
                <p>
                  {tr("complaintsResponseHint")}
                </p>
              </LegalBlock>
            </Section>

            <a
              href={`mailto:xtackoficial@gmail.com?subject=${encodeURIComponent(tr("termsOfUseShortLabel") + " Spotter Local")}`}
              className="press flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-left hover:bg-accent/40"
            >
              <span className="inline-flex items-center gap-3 text-sm font-medium text-foreground">
                <Icon name="help" size={16} className="text-primary" /> {tr("termsQuestionsLabel")}
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
