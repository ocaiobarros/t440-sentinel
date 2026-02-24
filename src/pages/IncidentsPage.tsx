import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, Flame, Zap, Info, ShieldCheck, CheckCircle, Clock,
  Search, RefreshCw, XCircle, Filter,
} from "lucide-react";
import { useAlertInstances, useAlertRealtime, type AlertInstance } from "@/hooks/useIncidents";
import IncidentDetailDrawer from "@/components/incidents/IncidentDetailDrawer";
import { formatDistanceToNow } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

type SeverityFilter = "disaster" | "high" | "average" | "warning" | "info";
type StatusFilter = "open" | "ack" | "resolved";

const DATE_LOCALES: Record<string, typeof ptBR> = { "pt-BR": ptBR, en: enUS, es };

export default function IncidentsPage() {
  const { t, i18n } = useTranslation();
  const [severityFilters, setSeverityFilters] = useState<SeverityFilter[]>([]);
  const [statusFilters, setStatusFilters] = useState<StatusFilter[]>(["open", "ack"]);
  const [search, setSearch] = useState("");
  const [selectedAlert, setSelectedAlert] = useState<AlertInstance | null>(null);

  const SEVERITY_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
    disaster: { icon: Flame, color: "text-red-500", bg: "bg-red-500/10 border-red-500/30", label: t("incidents.disaster") },
    high: { icon: Zap, color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/30", label: t("incidents.high") },
    average: { icon: AlertTriangle, color: "text-neon-amber", bg: "bg-neon-amber/10 border-neon-amber/30", label: t("incidents.average") },
    warning: { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30", label: t("incidents.warning") },
    info: { icon: Info, color: "text-neon-cyan", bg: "bg-neon-cyan/10 border-neon-cyan/30", label: t("incidents.info") },
  };

  const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    open: { icon: XCircle, color: "text-neon-red", label: t("incidents.open") },
    ack: { icon: ShieldCheck, color: "text-neon-blue", label: t("incidents.ack") },
    resolved: { icon: CheckCircle, color: "text-neon-green", label: t("incidents.resolved") },
  };

  const { data: alerts, isLoading, refetch } = useAlertInstances({
    statuses: statusFilters.length ? statusFilters : undefined,
    severities: severityFilters.length ? severityFilters : undefined,
  });

  useAlertRealtime();

  const filtered = useMemo(() => {
    if (!alerts) return [];
    if (!search) return alerts;
    const s = search.toLowerCase();
    return alerts.filter(
      (a) =>
        a.title.toLowerCase().includes(s) ||
        a.summary?.toLowerCase().includes(s) ||
        a.dedupe_key.toLowerCase().includes(s) ||
        (a.payload as any)?.hostname?.toLowerCase().includes(s) ||
        (a.payload as any)?.host?.toLowerCase().includes(s)
    );
  }, [alerts, search]);

  const toggleSeverity = (s: SeverityFilter) =>
    setSeverityFilters((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  const toggleStatus = (s: StatusFilter) =>
    setStatusFilters((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  const counts = useMemo(() => {
    const c = { open: 0, ack: 0, resolved: 0, disaster: 0, high: 0, average: 0, warning: 0, info: 0 };
    (alerts ?? []).forEach((a) => {
      c[a.status]++;
      c[a.severity]++;
    });
    return c;
  }, [alerts]);

  const dateFnsLocale = DATE_LOCALES[i18n.language] || ptBR;

  return (
    <div className="h-full flex flex-col gap-0 overflow-hidden">
      {/* ── Header ── */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-neon-red" />
            <h1 className="text-lg font-display font-bold text-foreground">{t("incidents.title")}</h1>
            {!isLoading && (
              <Badge variant="outline" className="text-[10px] font-mono">
                {filtered.length} {t("incidents.alerts")}
              </Badge>
            )}
          </div>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-[10px]" onClick={() => refetch()}>
            <RefreshCw className="w-3 h-3" /> {t("incidents.refresh")}
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <Filter className="w-3 h-3 text-muted-foreground" />
            <span className="text-[9px] text-muted-foreground font-display uppercase tracking-wider">{t("incidents.status")}</span>
            {(Object.entries(STATUS_CONFIG) as [StatusFilter, typeof STATUS_CONFIG.open][]).map(([key, cfg]) => {
              const active = statusFilters.includes(key);
              return (
                <Button
                  key={key}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className={`h-6 text-[10px] gap-1 px-2 ${active ? `${cfg.color} bg-current/10` : ""}`}
                  onClick={() => toggleStatus(key)}
                >
                  <cfg.icon className="w-3 h-3" />
                  {cfg.label}
                  <span className="font-mono text-[9px] opacity-60">({counts[key]})</span>
                </Button>
              );
            })}
          </div>

          <div className="w-px h-4 bg-border" />

          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground font-display uppercase tracking-wider">{t("incidents.severity")}</span>
            {(Object.entries(SEVERITY_CONFIG) as [SeverityFilter, typeof SEVERITY_CONFIG.disaster][]).map(([key, cfg]) => {
              const active = severityFilters.includes(key);
              return (
                <Button
                  key={key}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className={`h-6 text-[10px] gap-1 px-2 ${active ? cfg.color : ""}`}
                  onClick={() => toggleSeverity(key)}
                >
                  <cfg.icon className="w-3 h-3" />
                  {cfg.label}
                  <span className="font-mono text-[9px] opacity-60">({counts[key]})</span>
                </Button>
              );
            })}
          </div>

          <div className="ml-auto">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                placeholder={t("incidents.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 w-48 pl-7 text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <CheckCircle className="w-10 h-10 opacity-30" />
            <p className="text-sm font-display">{t("incidents.noIncidents")}</p>
            <p className="text-xs">{t("incidents.adjustFilters")}</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b border-border text-[10px] text-muted-foreground font-display uppercase tracking-wider">
                <th className="py-2 px-3 text-left w-8">{t("incidents.sev")}</th>
                <th className="py-2 px-3 text-left w-10">Status</th>
                <th className="py-2 px-3 text-left">{t("incidents.host")}</th>
                <th className="py-2 px-3 text-left">{t("incidents.alert")}</th>
                <th className="py-2 px-3 text-left w-28">{t("incidents.start")}</th>
                <th className="py-2 px-3 text-left w-24">{t("incidents.duration")}</th>
                <th className="py-2 px-3 text-left w-12">{t("incidents.rc")}</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filtered.map((alert) => {
                  const sev = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info;
                  const st = STATUS_CONFIG[alert.status] ?? STATUS_CONFIG.open;
                  const SevIcon = sev.icon;
                  const StIcon = st.icon;
                  const hostName = (alert.payload as any)?.hostname || (alert.payload as any)?.host || "—";
                  const isRootCause = (alert.payload as any)?.is_root_cause === true;
                  const isolatedCount = (alert.payload as any)?.isolated_count;

                  return (
                    <motion.tr
                      key={alert.id}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      onClick={() => setSelectedAlert(alert)}
                      className={`border-b border-border/50 cursor-pointer transition-colors hover:bg-muted/30 ${
                        isRootCause ? "bg-neon-red/5 hover:bg-neon-red/10" : ""
                      } ${alert.status === "resolved" ? "opacity-50" : ""}`}
                    >
                      <td className="py-2 px-3">
                        <SevIcon className={`w-4 h-4 ${sev.color}`} />
                      </td>
                      <td className="py-2 px-3">
                        <StIcon className={`w-4 h-4 ${st.color}`} />
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-foreground truncate max-w-[160px]">
                        {hostName}
                      </td>
                      <td className="py-2 px-3 text-foreground truncate max-w-[300px]">
                        <span>{alert.title}</span>
                        {isolatedCount && (
                          <Badge variant="outline" className="ml-2 text-[8px] text-neon-red border-neon-red/30">
                            +{isolatedCount} {t("incidents.isolated")}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono text-muted-foreground">
                        {new Date(alert.opened_at).toLocaleString(i18n.language === "en" ? "en-US" : i18n.language === "es" ? "es" : "pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`font-mono ${alert.status !== "resolved" ? "text-neon-amber" : "text-muted-foreground"}`}>
                          {formatDistanceToNow(new Date(alert.opened_at), { locale: dateFnsLocale })}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        {isRootCause && (
                          <Flame className="w-3.5 h-3.5 text-neon-red animate-pulse" />
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>

      {/* ── Detail Drawer ── */}
      <IncidentDetailDrawer
        alert={selectedAlert}
        open={!!selectedAlert}
        onClose={() => setSelectedAlert(null)}
      />
    </div>
  );
}
