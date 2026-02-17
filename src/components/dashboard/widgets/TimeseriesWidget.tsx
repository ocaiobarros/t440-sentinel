import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { TelemetryTimeseriesData } from "@/types/telemetry";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
}

export default function TimeseriesWidget({ telemetryKey, title, cache }: Props) {
  const { data } = useWidgetData({ telemetryKey, cache });
  const ts = data as TelemetryTimeseriesData | null;

  const chartData = (ts?.points || []).map((p) => ({
    time: new Date(p.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    value: p.value,
  }));

  return (
    <div className="glass-card rounded-lg p-4 h-full flex flex-col border border-border/50">
      <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </span>
      <div className="flex-1 min-h-0">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id={`grad-${telemetryKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(110 100% 54%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(110 100% 54%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fill: "hsl(215 10% 50%)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(215 10% 50%)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(220 20% 10%)",
                  border: "1px solid hsl(220 15% 25%)",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "hsl(180 10% 88%)",
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(110 100% 54%)"
                strokeWidth={2}
                fill={`url(#grad-${telemetryKey})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground/50 text-xs font-mono">
            Aguardando dados…
          </div>
        )}
      </div>
    </div>
  );
}
