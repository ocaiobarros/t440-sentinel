import { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, RefreshCw, Save, Settings, Maximize2, Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface MonitoringHeaderProps {
  /** Title shown in the header */
  title: string;
  /** Subtitle / description */
  subtitle?: string;
  /** Icon element to show before title */
  icon?: React.ReactNode;
  /** Back navigation path */
  backPath: string;
  /** Called when Refresh is clicked */
  onRefresh?: () => void;
  /** Is data currently loading/refreshing */
  isRefreshing?: boolean;
  /** Called when Save is clicked */
  onSave?: () => void;
  /** Is save in progress */
  saving?: boolean;
  /** Called when Reconfigurar is clicked */
  onReconfigure?: () => void;
  /** Extra elements to render in the right side (e.g. poll interval, filters) */
  extraRight?: React.ReactNode;
  /** Last poll/refresh timestamp */
  lastRefresh?: Date | null;
}

/**
 * Unified header for all monitoring pages with kiosk mode support.
 * Reads `?kiosk=true` from URL and hides header + provides exit FAB.
 */
export default function MonitoringHeader({
  title,
  subtitle,
  icon,
  backPath,
  onRefresh,
  isRefreshing,
  onSave,
  saving,
  onReconfigure,
  extraRight,
  lastRefresh,
}: MonitoringHeaderProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isKiosk = searchParams.get("kiosk") === "true";

  const toggleKiosk = useCallback(() => {
    const next = !isKiosk;
    const sp = new URLSearchParams(searchParams);
    if (next) {
      sp.set("kiosk", "true");
      document.documentElement.requestFullscreen?.();
    } else {
      sp.delete("kiosk");
      document.exitFullscreen?.();
    }
    navigate(`?${sp.toString()}`, { replace: true });
  }, [isKiosk, searchParams, navigate]);

  return (
    <>
      {/* Header — hidden in kiosk */}
      <AnimatePresence>
        {!isKiosk && (
          <motion.div
            initial={{ y: -48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -48, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="relative z-10 border-b border-border/30 bg-card/50 backdrop-blur-xl"
          >
            <div className="w-full px-4 py-3 flex items-center justify-between gap-4">
              {/* Left: Back + Icon + Title */}
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  onClick={() => navigate(backPath)}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                {icon && (
                  <div className="shrink-0">
                    {icon}
                  </div>
                )}
                <div className="min-w-0">
                  <h1 className="text-sm font-display font-bold text-foreground truncate">{title}</h1>
                  {subtitle && (
                    <p className="text-[9px] font-mono text-muted-foreground truncate">{subtitle}</p>
                  )}
                </div>
              </div>

              {/* Right: Action buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                {lastRefresh && (
                  <span className="text-[9px] font-mono text-muted-foreground hidden lg:inline mr-1">
                    {lastRefresh.toLocaleTimeString("pt-BR")}
                  </span>
                )}

                {extraRight}

                {onRefresh && (
                  <Button onClick={onRefresh} disabled={isRefreshing} variant="outline" size="sm" className="gap-1.5 h-7">
                    <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
                    <span className="text-xs hidden sm:inline">Refresh</span>
                  </Button>
                )}

                {onSave && (
                  <Button onClick={onSave} disabled={saving} variant="outline" size="sm" className="gap-1.5 h-7">
                    <Save className={`w-3 h-3 ${saving ? "animate-pulse" : ""}`} />
                    <span className="text-xs hidden sm:inline">{saving ? "Salvando…" : "Salvar"}</span>
                  </Button>
                )}

                {onReconfigure && (
                  <Button onClick={onReconfigure} variant="outline" size="sm" className="gap-1.5 h-7">
                    <Settings className="w-3 h-3" />
                    <span className="text-xs hidden sm:inline">Reconfigurar</span>
                  </Button>
                )}

                <Button onClick={toggleKiosk} variant="outline" size="sm" className="gap-1.5 h-7">
                  {isKiosk ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                  <span className="text-xs hidden sm:inline">Kiosk</span>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kiosk exit FAB */}
      <AnimatePresence>
        {isKiosk && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={toggleKiosk}
            className="fixed bottom-4 right-4 z-50 h-10 w-10 rounded-full
              bg-card/80 backdrop-blur-lg border border-border/30
              flex items-center justify-center
              text-muted-foreground hover:text-foreground
              shadow-lg transition-colors"
            title="Sair do modo Kiosk"
          >
            <Minimize2 className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}

/** Hook to read kiosk state from URL */
export function useKioskMode() {
  const [searchParams] = useSearchParams();
  return searchParams.get("kiosk") === "true";
}
