import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  widgetId?: string;
  widgetType?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Isolates each widget so a crash in one doesn't take down the whole dashboard.
 * Shows a compact fallback with retry button.
 */
export default class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[FlowPulse] Widget crashed — id=${this.props.widgetId} type=${this.props.widgetType}`,
      error,
      info.componentStack,
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass-card rounded-lg p-3 h-full flex flex-col items-center justify-center gap-2 border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <span className="text-[10px] font-display uppercase tracking-wider text-destructive/80">
            Erro ao processar dados
          </span>
          <span className="text-[9px] font-mono text-muted-foreground/60 text-center line-clamp-2 max-w-[90%]">
            {this.state.error?.message || "Falha inesperada"}
          </span>
          <button
            onClick={this.handleRetry}
            className="mt-1 flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Tentar novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
