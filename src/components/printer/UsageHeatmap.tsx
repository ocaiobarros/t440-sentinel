import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TrendingUp } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/* ─── Types ─── */
interface HeatmapCell { day: number; hour: number; value: number }
interface HeatmapData { grid: HeatmapCell[]; peak: { day: number; hour: number; value: number } | null }

interface Props {
  printers: { hostId: string; name: string }[];
}

const DAYS_PT = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/* ─── Color scale ─── */
function cellColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "rgba(128,128,128,0.08)";
  const t = Math.min(value / max, 1);
  if (t < 0.25) return `rgba(59,130,246,${0.15 + t * 1.4})`;   // blue
  if (t < 0.5) return `rgba(168,85,247,${0.3 + t * 0.8})`;     // purple
  if (t < 0.75) return `rgba(249,115,22,${0.4 + t * 0.6})`;    // orange
  return `rgba(239,68,68,${0.6 + t * 0.4})`;                    // red
}

function cellGlow(value: number, max: number): string {
  if (max === 0 || value === 0) return "none";
  const t = Math.min(value / max, 1);
  if (t > 0.75) return "0 0 12px rgba(239,68,68,0.6), 0 0 4px rgba(239,68,68,0.3)";
  return "none";
}

export default function UsageHeatmap({ printers }: Props) {
  const [selectedHost, setSelectedHost] = useState<string>("all");

  const { data: heatmapData, isLoading } = useQuery<HeatmapData>({
    queryKey: ["printer-heatmap", selectedHost],
    refetchInterval: 10 * 60_000,
    staleTime: 9 * 60_000,
    queryFn: async () => {
      const tenantId = (await supabase.auth.getUser()).data.user?.app_metadata?.tenant_id;
      if (!tenantId) return { grid: [], peak: null };
      const { data, error } = await supabase.functions.invoke("printer-status", {
        body: {
          tenant_id: tenantId,
          action: "usage_heatmap",
          host_id: selectedHost === "all" ? undefined : selectedHost,
        },
      });
      if (error) { console.warn("Heatmap fetch failed:", error); return { grid: [], peak: null }; }
      return data as HeatmapData;
    },
  });

  const grid = heatmapData?.grid ?? [];
  const peak = heatmapData?.peak ?? null;

  const maxValue = useMemo(() => {
    if (grid.length === 0) return 0;
    return Math.max(...grid.map((c) => c.value), 1);
  }, [grid]);

  // Build lookup: day -> hour -> value
  const lookup = useMemo(() => {
    const m = new Map<string, number>();
    grid.forEach((c) => m.set(`${c.day}-${c.hour}`, c.value));
    return m;
  }, [grid]);

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedHost} onValueChange={setSelectedHost}>
          <SelectTrigger className="w-[220px] h-8 text-xs">
            <SelectValue placeholder="Todas as impressoras" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as impressoras</SelectItem>
            {printers.map((p) => (
              <SelectItem key={p.hostId} value={p.hostId}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[9px] font-mono text-muted-foreground">Últimos 7 dias • Intervalo: 1h</span>
      </div>

      {isLoading ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <Loader2 className="w-6 h-6 text-neon-cyan animate-spin mx-auto mb-2" />
          <p className="text-xs text-muted-foreground font-mono">Processando histórico...</p>
        </div>
      ) : grid.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <p className="text-sm text-muted-foreground">Sem dados de histórico disponíveis</p>
        </div>
      ) : (
        <>
          {/* Heatmap Grid */}
          <div className="glass-card rounded-xl p-4 border border-border/30 overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Hour headers */}
              <div className="flex">
                <div className="w-20 shrink-0" />
                {HOURS.map((h) => (
                  <div key={h} className="flex-1 text-center text-[8px] font-mono text-muted-foreground pb-1">
                    {String(h).padStart(2, "0")}h
                  </div>
                ))}
              </div>

              {/* Rows */}
              {Array.from({ length: 7 }, (_, dayIdx) => (
                <div key={dayIdx} className="flex items-center">
                  <div className="w-20 shrink-0 text-[9px] font-mono text-muted-foreground pr-2 text-right">
                    {DAYS_PT[dayIdx]}
                  </div>
                  {HOURS.map((hour) => {
                    const val = lookup.get(`${dayIdx}-${hour}`) ?? 0;
                    const isPeak = peak && peak.day === dayIdx && peak.hour === hour;
                    return (
                      <div
                        key={hour}
                        className={`flex-1 aspect-square m-[1px] rounded-sm flex items-center justify-center cursor-default transition-all duration-300 ${
                          isPeak ? "ring-1 ring-red-400/60 animate-pulse" : ""
                        }`}
                        style={{
                          backgroundColor: cellColor(val, maxValue),
                          boxShadow: cellGlow(val, maxValue),
                        }}
                        title={`${DAYS_PT[dayIdx]} ${String(hour).padStart(2, "0")}h: ${val} páginas`}
                      >
                        {val > 0 && (
                          <span className="text-[6px] font-mono text-foreground/70">{val}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Legend */}
              <div className="flex items-center justify-end gap-2 mt-3">
                <span className="text-[8px] font-mono text-muted-foreground">Baixo</span>
                {[0.1, 0.25, 0.5, 0.75, 1].map((t) => (
                  <div
                    key={t}
                    className="w-4 h-3 rounded-sm"
                    style={{ backgroundColor: cellColor(t * 100, 100) }}
                  />
                ))}
                <span className="text-[8px] font-mono text-muted-foreground">Alto</span>
              </div>
            </div>
          </div>

          {/* Insight */}
          {peak && peak.value > 0 && (
            <div className="glass-card rounded-xl p-3 border border-neon-cyan/20 flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-neon-cyan shrink-0" />
              <div>
                <p className="text-xs font-display font-bold text-foreground">
                  Pico de demanda detectado: <span className="text-neon-cyan">{DAYS_PT[peak.day]}</span> às{" "}
                  <span className="text-neon-cyan">{String(peak.hour).padStart(2, "0")}h</span>
                </p>
                <p className="text-[9px] font-mono text-muted-foreground">
                  {peak.value} páginas impressas nesse horário
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
