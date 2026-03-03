import React from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const CHUNK_RELOAD_KEY = "flowpulse:chunk-reload-once";

function isChunkLoadError(message: string): boolean {
  return /Failed to fetch dynamically imported module|Failed to load module script|Loading chunk [^\s]+ failed|Importing a module script failed/i.test(
    message,
  );
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);

    const message = error?.message ?? "";
    if (!isChunkLoadError(message)) return;

    const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
    if (alreadyReloaded) return;

    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || "Erro desconhecido";
      const isChunkError = isChunkLoadError(message);

      return (
        <div className="min-h-[300px] flex items-center justify-center p-8 bg-background">
          <div className="rounded-xl p-6 border border-destructive/30 max-w-lg text-center bg-card shadow-lg">
            <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-3" />
            <h2 className="text-sm font-bold text-foreground mb-2">
              {this.props.fallbackTitle || "Erro ao renderizar"}
            </h2>
            {isChunkError ? (
              <p className="text-xs text-muted-foreground mb-3">
                Detectamos uma versão desatualizada dos arquivos do app. Recarregue para sincronizar com o deploy atual.
              </p>
            ) : null}
            <pre className="text-[10px] font-mono text-destructive bg-destructive/10 rounded p-3 overflow-auto max-h-[200px] text-left whitespace-pre-wrap">
              {message}
            </pre>
            <button
              onClick={() => {
                if (isChunkError) {
                  sessionStorage.removeItem(CHUNK_RELOAD_KEY);
                  window.location.reload();
                  return;
                }
                this.setState({ hasError: false, error: null });
              }}
              className="mt-4 text-xs text-primary hover:underline"
            >
              {isChunkError ? "Recarregar aplicação" : "Tentar novamente"}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

