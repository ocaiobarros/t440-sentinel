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
        <div className="min-h-[300px] flex items-center justify-center p-8">
          <div className="glass-card rounded-xl p-6 border border-red-500/30 max-w-lg text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <h2 className="text-sm font-display font-bold text-foreground mb-2">
              {this.props.fallbackTitle || "Erro ao renderizar"}
            </h2>
            <pre className="text-[10px] font-mono text-red-400 bg-red-500/10 rounded p-3 overflow-auto max-h-[200px] text-left whitespace-pre-wrap">
              {this.state.error?.message || "Erro desconhecido"}
            </pre>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 text-xs text-neon-cyan hover:underline"
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
