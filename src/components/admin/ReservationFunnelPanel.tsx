import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  TrendingUp,
  Bookmark,
  CheckCircle2,
  AlertTriangle,
  Timer,
} from "lucide-react";

interface ReservaRow {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  label: string;
}

interface FunnelMetrics {
  total: number;
  pendente: number;
  em_andamento: number;
  concluido: number;
  cancelado: number;
  conversionRate: number;
  avgActivationHours: number | null;
}

function computeMetrics(reservas: ReservaRow[]): FunnelMetrics {
  const total = reservas.length;
  const pendente = reservas.filter((r) => r.status === "pendente").length;
  const em_andamento = reservas.filter((r) => r.status === "em_andamento").length;
  const concluido = reservas.filter((r) => r.status === "concluido").length;
  const cancelado = reservas.filter((r) => r.status === "cancelado").length;

  const conversionRate = total > 0 ? (concluido / total) * 100 : 0;

  // Average activation time for completed reservations
  const completedReservas = reservas.filter((r) => r.status === "concluido");
  let avgActivationHours: number | null = null;
  if (completedReservas.length > 0) {
    const totalMs = completedReservas.reduce((sum, r) => {
      return sum + (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime());
    }, 0);
    avgActivationHours = totalMs / completedReservas.length / (1000 * 60 * 60);
  }

  return { total, pendente, em_andamento, concluido, cancelado, conversionRate, avgActivationHours };
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
}

export default function ReservationFunnelPanel() {
  const { data: reservas, isLoading } = useQuery({
    queryKey: ["reservation-funnel"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flow_map_reservas")
        .select("id, status, created_at, updated_at, label")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReservaRow[];
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  const metrics = computeMetrics(reservas ?? []);

  const cards = [
    {
      label: "Total Reservas",
      value: String(metrics.total),
      icon: Bookmark,
      color: "text-primary",
      bgColor: "bg-primary/5 border-primary/20",
    },
    {
      label: "Taxa de Conversão",
      value: `${metrics.conversionRate.toFixed(1)}%`,
      subtitle: `${metrics.concluido} de ${metrics.total}`,
      icon: TrendingUp,
      color: metrics.conversionRate > 50 ? "text-green-500" : "text-amber-500",
      bgColor: metrics.conversionRate > 50 ? "bg-green-500/5 border-green-500/20" : "bg-amber-500/5 border-amber-500/20",
    },
    {
      label: "Tempo Médio (SLA)",
      value: metrics.avgActivationHours !== null ? formatHours(metrics.avgActivationHours) : "—",
      subtitle: "Criação → Conclusão",
      icon: Timer,
      color: metrics.avgActivationHours !== null && metrics.avgActivationHours < 48 ? "text-green-500" : "text-amber-500",
      bgColor: metrics.avgActivationHours !== null && metrics.avgActivationHours < 48 ? "bg-green-500/5 border-green-500/20" : "bg-amber-500/5 border-amber-500/20",
    },
    {
      label: "Aguardando",
      value: String(metrics.pendente + metrics.em_andamento),
      subtitle: `${metrics.pendente} pendentes · ${metrics.em_andamento} em andamento`,
      icon: Clock,
      color: "text-blue-400",
      bgColor: "bg-blue-500/5 border-blue-500/20",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`rounded-lg border p-4 ${card.bgColor}`}
            >
              <div className="flex items-center justify-between mb-3">
                <Icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <p className={`text-2xl font-bold font-[Orbitron] ${card.color}`}>
                {card.value}
              </p>
              <p className="text-xs font-medium text-foreground mt-1">{card.label}</p>
              {card.subtitle && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{card.subtitle}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Status breakdown bar */}
      {metrics.total > 0 && (
        <div className="rounded-lg border border-border bg-card/40 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Funil de Ativação
          </p>
          <div className="flex h-6 rounded-full overflow-hidden bg-muted/50">
            {metrics.concluido > 0 && (
              <div
                className="bg-green-500 flex items-center justify-center transition-all"
                style={{ width: `${(metrics.concluido / metrics.total) * 100}%` }}
                title={`Concluído: ${metrics.concluido}`}
              >
                <span className="text-[9px] font-bold text-white">{metrics.concluido}</span>
              </div>
            )}
            {metrics.em_andamento > 0 && (
              <div
                className="bg-blue-500 flex items-center justify-center transition-all"
                style={{ width: `${(metrics.em_andamento / metrics.total) * 100}%` }}
                title={`Em andamento: ${metrics.em_andamento}`}
              >
                <span className="text-[9px] font-bold text-white">{metrics.em_andamento}</span>
              </div>
            )}
            {metrics.pendente > 0 && (
              <div
                className="bg-amber-500 flex items-center justify-center transition-all"
                style={{ width: `${(metrics.pendente / metrics.total) * 100}%` }}
                title={`Pendente: ${metrics.pendente}`}
              >
                <span className="text-[9px] font-bold text-white">{metrics.pendente}</span>
              </div>
            )}
            {metrics.cancelado > 0 && (
              <div
                className="bg-destructive flex items-center justify-center transition-all"
                style={{ width: `${(metrics.cancelado / metrics.total) * 100}%` }}
                title={`Cancelado: ${metrics.cancelado}`}
              >
                <span className="text-[9px] font-bold text-white">{metrics.cancelado}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span className="text-[10px] text-muted-foreground">Concluído ({metrics.concluido})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-[10px] text-muted-foreground">Em andamento ({metrics.em_andamento})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="text-[10px] text-muted-foreground">Pendente ({metrics.pendente})</span>
            </div>
            {metrics.cancelado > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-destructive" />
                <span className="text-[10px] text-muted-foreground">Cancelado ({metrics.cancelado})</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
