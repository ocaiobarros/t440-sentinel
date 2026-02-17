import { memo, useMemo } from "react";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { TelemetryTimeseriesData } from "@/types/telemetry";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Legend } from "recharts";

/** Auto-detect best unit based on max value */
function detectUnit(maxVal: number): { divisor: number; suffix: string } {
  if (maxVal >= 1_000_000_000) return { divisor: 1_000_000_000, suffix: " Gbps" };
  if (maxVal >= 1_000_000) return { divisor: 1_000_000, suffix: " Mbps" };
  if (maxVal >= 1_000) return { divisor: 1_000, suffix: " Kbps" };
  return { divisor: 1, suffix: " bps" };
}

interface SeriesConfig {
  itemid: string;
  name: string;
  key_: string;
  color: string;
  alias?: string;
}

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
  config?: Record<string, unknown>;
}

const TIME_RANGE_LABELS: Record<string, string> = {
  "1h": "Last 1h",
  "3h": "Last 3h",
  "6h": "Last 6h",
  "12h": "Last 12h",
  "24h": "Last 24h",
  "7d": "Last 7d",
  "30d": "Last 30d",
};

/** Round timestamp to nearest minute for alignment across series */
function roundToMinute(ts: number): number {
  return Math.round(ts / 60000) * 60000;
}

function TimeseriesWidgetInner({ telemetryKey, title, cache, config }: Props) {
  const extra = config?.extra as Record<string, unknown> | undefined;
  const series = (extra?.series as SeriesConfig[]) || (config?.series as SeriesConfig[]) || [];
  const timeRange = (extra?.time_range as string) || (config?.time_range as string) || "";
  const isMultiSeries = series.length > 1;

  const { data } = useWidgetData({ telemetryKey, cache });
  const ts = data as TelemetryTimeseriesData | null;

  // Build display key mapping: itemid → alias or name
  const seriesDisplayMap = useMemo(() => {
    const map = new Map<string, { displayName: string; color: string }>();
    series.forEach((s) => {
      map.set(s.itemid, {
        displayName: s.alias?.trim() || s.name,
        color: s.color,
      });
    });
    return map;
  }, [series]);

  // For multi-series: merge all series data aligned by rounded timestamp
  const multiData = useMemo(() => {
    if (!isMultiSeries) return null;
    const allPoints: Map<number, Record<string, number>> = new Map();

    series.forEach((s) => {
      const key = `zbx:item:${s.itemid}`;
      const entry = cache.get(key);
      if (!entry) return;
      const tsData = entry.data as TelemetryTimeseriesData | null;
      if (!tsData?.points) return;
      const displayName = seriesDisplayMap.get(s.itemid)?.displayName || s.name;
      for (const p of tsData.points) {
        const rounded = roundToMinute(p.ts);
        const existing = allPoints.get(rounded) || {};
        existing[displayName] = p.value;
        allPoints.set(rounded, existing);
      }
    });

    return Array.from(allPoints.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, values]) => ({
        time: new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        ...values,
      }));
  }, [isMultiSeries, series, cache, seriesDisplayMap]);

  const singleChartData = useMemo(
    () =>
      (ts?.points || []).map((p) => ({
        time: new Date(p.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        value: p.value,
      })),
    [ts?.points],
  );

  const chartData = isMultiSeries ? (multiData || []) : singleChartData;
  const hasData = chartData.length > 0;

  // Detect if data looks like bps and compute unit
  const isBpsData = useMemo(() => {
    const extra2 = config?.extra as Record<string, unknown> | undefined;
    const unit = (extra2?.unit as string) || "";
    if (unit) return unit.toLowerCase().includes("bps") || unit.toLowerCase().includes("bit");
    // Heuristic: if max value > 10000, likely bps
    let max = 0;
    for (const row of chartData) {
      for (const [k, v] of Object.entries(row)) {
        if (k !== "time" && typeof v === "number" && v > max) max = v;
      }
    }
    return max > 10000;
  }, [chartData, config]);

  const unitInfo = useMemo(() => {
    if (!isBpsData) return { divisor: 1, suffix: "" };
    let max = 0;
    for (const row of chartData) {
      for (const [k, v] of Object.entries(row)) {
        if (k !== "time" && typeof v === "number" && v > max) max = v;
      }
    }
    return detectUnit(max);
  }, [isBpsData, chartData]);

  const formatValue = (val: number) => {
    if (unitInfo.divisor === 1) return String(val);
    return (val / unitInfo.divisor).toFixed(2);
  };

  return (
    <div className="glass-card rounded-lg p-4 h-full flex flex-col border border-border/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <div className="flex items-center gap-1.5">
          {unitInfo.suffix && (
            <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/30">
              {unitInfo.suffix.trim()}
            </span>
          )}
          {timeRange && (
            <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              {TIME_RANGE_LABELS[timeRange] || timeRange}
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                {isMultiSeries ? (
                  series.map((s) => {
                    const dn = seriesDisplayMap.get(s.itemid)?.displayName || s.name;
                    return (
                      <linearGradient key={s.itemid} id={`grad-${s.itemid}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                      </linearGradient>
                    );
                  })
                ) : (
                  <linearGradient id={`grad-${telemetryKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                )}
              </defs>
              <XAxis dataKey="time" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => unitInfo.divisor > 1 ? `${(v / unitInfo.divisor).toFixed(1)}` : String(v)} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "hsl(var(--foreground))",
                }}
                isAnimationActive={false}
                formatter={(value: number, name: string) => [
                  `${formatValue(value)}${unitInfo.suffix}`,
                  name,
                ]}
              />
              {isMultiSeries ? (
                <>
                  {series.map((s) => {
                    const dn = seriesDisplayMap.get(s.itemid)?.displayName || s.name;
                    return (
                      <Area
                        key={s.itemid}
                        type="monotone"
                        dataKey={dn}
                        name={dn}
                        stroke={s.color}
                        strokeWidth={2}
                        fill={`url(#grad-${s.itemid})`}
                        isAnimationActive={false}
                        connectNulls={true}
                      />
                    );
                  })}
                  <Legend
                    wrapperStyle={{ fontSize: 9, fontFamily: "monospace" }}
                    iconType="line"
                    iconSize={8}
                  />
                </>
              ) : (
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill={`url(#grad-${telemetryKey})`}
                  isAnimationActive={false}
                  connectNulls={true}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground/50 text-xs font-mono">
            {(isMultiSeries || timeRange) ? "Sem dados no período" : "Aguardando dados…"}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(TimeseriesWidgetInner);
