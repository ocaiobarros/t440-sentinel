import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield,
  Radio,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Activity,
  Clock,
  Zap,
} from "lucide-react";

interface HealthData {
  secrets: Record<string, { configured: boolean }>;
  heartbeat: {
    last_webhook_at: string;
    last_webhook_source: string;
    event_count: number;
  } | null;
  alert_count: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s atrás`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

export default function TelemetryHealthPanel() {
  const { data, isLoading } = useQuery<HealthData>({
    queryKey: ["telemetry-health"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("telemetry-wizard", {
        body: { action: "health-check" },
      });
      if (error) throw error;
      return data as HealthData;
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  const secrets = data?.secrets ?? {};
  const heartbeat = data?.heartbeat;
  const alertCount = data?.alert_count ?? 0;

  const secretItems = [
    { key: "FLOWPULSE_WEBHOOK_TOKEN", label: "Webhook Token", icon: Shield, color: "text-amber-400" },
    { key: "TELEGRAM_BOT_TOKEN", label: "Bot Telegram", icon: Radio, color: "text-blue-400" },
    { key: "TELEGRAM_CHAT_ID", label: "Chat ID", icon: MessageSquare, color: "text-emerald-400" },
  ];

  const allConfigured = secretItems.every((s) => secrets[s.key]?.configured);
  const lastEvent = heartbeat?.last_webhook_at;
  const isStale = lastEvent ? (Date.now() - new Date(lastEvent).getTime()) > 300_000 : true; // >5min = stale

  return (
    <div className="space-y-3">
      {/* Status summary bar */}
      <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${
        allConfigured && !isStale
          ? "border-green-500/30 bg-green-500/5"
          : allConfigured && isStale
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-destructive/30 bg-destructive/5"
      }`}>
        <Activity className={`w-4 h-4 ${
          allConfigured && !isStale ? "text-green-500" : allConfigured ? "text-amber-500" : "text-destructive"
        }`} />
        <span className="text-xs font-mono font-medium text-foreground">
          {allConfigured && !isStale
            ? "Pipeline ativo — todos os serviços operacionais"
            : allConfigured
            ? "Pipeline configurado — sem eventos recentes"
            : "Pipeline incompleto — configure os serviços abaixo"}
        </span>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {secretItems.map((item) => {
          const configured = secrets[item.key]?.configured ?? false;
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              className={`rounded-lg border p-4 transition-all ${
                configured
                  ? "border-green-500/20 bg-green-500/5"
                  : "border-border bg-muted/30"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-5 h-5 ${configured ? "text-green-500" : "text-muted-foreground"}`} />
                {configured ? (
                  <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-500 bg-green-500/10">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> OK
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive bg-destructive/10">
                    <XCircle className="w-3 h-3 mr-1" /> Pendente
                  </Badge>
                )}
              </div>
              <p className="text-xs font-medium text-foreground">{item.label}</p>
              <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{item.key}</p>
            </div>
          );
        })}

        {/* Heartbeat card */}
        <div className={`rounded-lg border p-4 ${
          lastEvent && !isStale
            ? "border-green-500/20 bg-green-500/5"
            : lastEvent
            ? "border-amber-500/20 bg-amber-500/5"
            : "border-border bg-muted/30"
        }`}>
          <div className="flex items-center justify-between mb-2">
            <Zap className={`w-5 h-5 ${
              lastEvent && !isStale ? "text-green-500" : lastEvent ? "text-amber-500" : "text-muted-foreground"
            }`} />
            {lastEvent ? (
              <Badge variant="outline" className={`text-[10px] ${
                isStale
                  ? "border-amber-500/30 text-amber-500 bg-amber-500/10"
                  : "border-green-500/30 text-green-500 bg-green-500/10"
              }`}>
                <Clock className="w-3 h-3 mr-1" /> {timeAgo(lastEvent)}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground">
                Sem dados
              </Badge>
            )}
          </div>
          <p className="text-xs font-medium text-foreground">Último Webhook</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-mono text-muted-foreground">
              {heartbeat?.event_count ?? 0} eventos
            </span>
            {heartbeat?.last_webhook_source && (
              <span className="text-[10px] text-muted-foreground">• {heartbeat.last_webhook_source}</span>
            )}
          </div>
          {alertCount > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">{alertCount} alertas no banco</p>
          )}
        </div>
      </div>
    </div>
  );
}
