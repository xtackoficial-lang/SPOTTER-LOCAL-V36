// ============================================================
// Error Boundary global — sem isto, qualquer erro de render em
// qualquer parte da app (ex: undefined.algo, array mal acedido)
// faz o React desmontar tudo e deixa uma tela completamente
// branca, sem mensagem e sem forma de recuperar a não ser
// fechar e reabrir o app. Isto apanha esse caso e mostra um
// ecrã de erro com opção de recarregar.
// ============================================================
import { Component, type ReactNode } from "react";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { t } from "@/lib/i18n";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("ErrorBoundary apanhou um erro:", error, info);
    reportLovableError(error, { boundary: "app_root_error_boundary" });
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 24,
            textAlign: "center",
            background: "#f9f6f2",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#d45a20"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>
            {t("somethingWentWrong")}
          </div>
          <p style={{ fontSize: 13, color: "#6b6b6b", maxWidth: 280 }}>
            {t("unexpectedErrorReload")}
          </p>
          <button
            onClick={this.handleReload}
            style={{
              marginTop: 8,
              height: 44,
              padding: "0 24px",
              borderRadius: 16,
              border: "none",
              background: "#d45a20",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {t("reloadAction")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
