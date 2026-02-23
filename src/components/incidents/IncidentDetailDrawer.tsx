import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, ShieldCheck, Clock, ExternalLink, AlertTriangle, Info, Flame, Zap, XCircle } from "lucide-react";
import { useAlertEvents, useAlertActions, type AlertInstance } from "@/hooks/useIncidents";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface Props {
  alert: AlertInstance | null;
  open: boolean;
  onClose: () => void;
}

const SEVERITY_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  disaster: { icon: Flame, color: "text-red-500", label: "Desastre" },
  high: { icon: Zap, color: "text-orange-500", label: "Alta" },
  average: { icon: AlertTriangle, color: "text-neon-amber", label: "Média" },
  warning: { icon: AlertTriangle, color: "text-yellow-400", label: "Aviso" },
  info: { icon: Info, color: "text-neon-cyan", label: "Info" },
};

const EVENT_ICON: Record<string, React.ElementType> = {
  ACK: ShieldCheck,
  RESOLVE: CheckCircle,
  OPEN: XCircle,
  UPDATE: Clock,
};

export default function IncidentDetailDrawer({ alert, open, onClose }: Props) {
  const { data: events, isLoading } = useAlertEvents(alert?.id ?? null);
  const { transition } = useAlertActions();
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  if (!alert) return null;

  const sev = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info;
  const SevIcon = sev.icon;
  const hostName = alert.payload?.hostname || alert.payload?.host || alert.dedupe_key?.split(":")[1] || "—";
  const hostId = alert.payload?.hostid;
  const mapId = alert.payload?.map_id;
  const isolatedCount = alert.payload?.isolated_count;

  const handleAction = async (to: "ack" | "resolved") => {
    await transition.mutateAsync({ alertId: alert.id, to, message: message || undefined });
    setMessage("");
  };

  const goToFlowMap = () => {
    if (mapId) navigate(`/app/operations/flowmap/${mapId}`);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[420px] sm:w-[480px] bg-card border-border p-0 flex flex-col">
        <SheetHeader className="p-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <SevIcon className={`w-5 h-5 ${sev.color}`} />
            <SheetTitle className="text-sm font-display text-foreground truncate flex-1">
              {alert.title}
            </SheetTitle>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] ${sev.color} border-current`}>{sev.label}</Badge>
            <Badge variant="outline" className="text-[10px]">{alert.status.toUpperCase()}</Badge>
            {alert.suppressed && <Badge variant="destructive" className="text-[10px]">Suprimido</Badge>}
            {alert.ack_breached_at && <Badge variant="destructive" className="text-[10px]">SLA Ack Violado</Badge>}
            {alert.resolve_breached_at && <Badge variant="destructive" className="text-[10px]">SLA Resolve Violado</Badge>}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Summary */}
            <section className="space-y-2">
              <h4 className="text-[10px] font-display uppercase tracking-wider text-muted-foreground">Detalhes</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Host</span>
                  <div className="font-mono font-bold text-foreground">{hostName}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Início</span>
                  <div className="font-mono text-foreground">{format(new Date(alert.opened_at), "dd/MM HH:mm:ss")}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Duração</span>
                  <div className="font-mono text-neon-amber">{formatDistanceToNow(new Date(alert.opened_at), { locale: ptBR })}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Última vez</span>
                  <div className="font-mono text-foreground">{format(new Date(alert.last_seen_at), "dd/MM HH:mm:ss")}</div>
                </div>
              </div>
              {alert.summary && (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2 font-mono">{alert.summary}</p>
              )}
            </section>

            {/* Root Cause Integration */}
            {(isolatedCount || mapId) && (
              <section className="space-y-2">
                <h4 className="text-[10px] font-display uppercase tracking-wider text-muted-foreground">Causa Raiz</h4>
                <div className="rounded-lg border border-neon-red/20 bg-neon-red/5 p-3 space-y-2">
                  {isolatedCount && (
                    <div className="flex items-center gap-2 text-xs">
                      <Zap className="w-3.5 h-3.5 text-neon-red" />
                      <span className="text-neon-red font-bold">+{isolatedCount} hosts isolados</span>
                    </div>
                  )}
                  {mapId && (
                    <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 border-neon-cyan/30 text-neon-cyan" onClick={goToFlowMap}>
                      <ExternalLink className="w-3 h-3" /> Ver no FlowMap
                    </Button>
                  )}
                </div>
              </section>
            )}

            {/* Payload */}
            {Object.keys(alert.payload).length > 0 && (
              <section className="space-y-2">
                <h4 className="text-[10px] font-display uppercase tracking-wider text-muted-foreground">Dados Técnicos</h4>
                <div className="bg-muted/20 rounded-lg p-2 max-h-40 overflow-y-auto">
                  <pre className="text-[9px] font-mono text-muted-foreground whitespace-pre-wrap break-all">
                    {JSON.stringify(alert.payload, null, 2)}
                  </pre>
                </div>
              </section>
            )}

            {/* Timeline */}
            <section className="space-y-2">
              <h4 className="text-[10px] font-display uppercase tracking-wider text-muted-foreground">Timeline</h4>
              {isLoading ? (
                <div className="text-xs text-muted-foreground">Carregando...</div>
              ) : !events?.length ? (
                <div className="text-xs text-muted-foreground">Nenhum evento registrado.</div>
              ) : (
                <div className="relative space-y-0">
                  {events.map((ev, i) => {
                    const EvIcon = EVENT_ICON[ev.event_type] ?? Clock;
                    return (
                      <div key={ev.id} className="flex gap-3 pb-3 relative">
                        {/* Line */}
                        {i < events.length - 1 && (
                          <div className="absolute left-[9px] top-5 bottom-0 w-px bg-border" />
                        )}
                        <div className="shrink-0 w-[18px] h-[18px] rounded-full bg-muted flex items-center justify-center z-10">
                          <EvIcon className="w-3 h-3 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-foreground">{ev.event_type}</span>
                            <span className="text-[9px] text-muted-foreground font-mono">
                              {format(new Date(ev.occurred_at), "dd/MM HH:mm:ss")}
                            </span>
                          </div>
                          {ev.from_status && ev.to_status && (
                            <span className="text-[9px] text-muted-foreground">
                              {ev.from_status} → {ev.to_status}
                            </span>
                          )}
                          {ev.message && <p className="text-[9px] text-muted-foreground mt-0.5">{ev.message}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>

        {/* Actions */}
        {alert.status !== "resolved" && (
          <div className="p-4 border-t border-border space-y-2">
            <Textarea
              placeholder="Mensagem (opcional)..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="h-16 text-xs resize-none"
            />
            <div className="flex gap-2">
              {alert.status === "open" && (
                <Button
                  size="sm"
                  className="flex-1 gap-1.5 h-8 text-xs bg-neon-blue/20 text-neon-blue border border-neon-blue/30 hover:bg-neon-blue/30"
                  onClick={() => handleAction("ack")}
                  disabled={transition.isPending}
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> Acknowledge
                </Button>
              )}
              <Button
                size="sm"
                className="flex-1 gap-1.5 h-8 text-xs bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30"
                onClick={() => handleAction("resolved")}
                disabled={transition.isPending}
              >
                <CheckCircle className="w-3.5 h-3.5" /> Resolver
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
