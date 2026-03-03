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
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[300px] flex items-center justify-center p-8 bg-background">
          <div className="rounded-xl p-6 border border-destructive/30 max-w-lg text-center bg-card shadow-lg">
            <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-3" />
            <h2 className="text-sm font-bold text-foreground mb-2">
              {this.props.fallbackTitle || "Erro ao renderizar"}
            </h2>
            <pre className="text-[10px] font-mono text-destructive bg-destructive/10 rounded p-3 overflow-auto max-h-[200px] text-left whitespace-pre-wrap">
              {this.state.error?.message || "Erro desconhecido"}
            </pre>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 text-xs text-primary hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
