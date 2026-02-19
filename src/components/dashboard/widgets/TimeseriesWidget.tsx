import { memo, useMemo, useRef } from "react";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { TelemetryTimeseriesData, TelemetryStatData } from "@/types/telemetry";
import { extractRawValue } from "@/lib/telemetry-utils";
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

interface ChartPoint {
  time: string;
  value?: number;
  [key: string]: unknown;
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

const MAX_BUFFER_POINTS = 20;

/** Round timestamp to nearest minute for alignment across series */
function roundToMinute(ts: number): number {
  return Math.round(ts / 60000) * 60000;
}

function TimeseriesWidgetInner({ telemetryKey, title, cache, config }: Props) {
  const extra = config?.extra as Record<string, unknown> | undefined;
  const series = (extra?.series as SeriesConfig[]) || (config?.series as SeriesConfig[]) || [];
  const timeRange = (extra?.time_range as string) || (config?.time_range as string) || "";
  const isMultiSeries = series.length > 1;

  // ── Fixed Y-axis domain from config ──
  const minY = (extra?.min_y as number) ?? (config?.min_y as number) ?? undefined;
  const maxY = (extra?.max_y as number) ?? (config?.max_y as number) ?? undefined;
  const fixedDomain: [number | "auto", number | "auto"] = [minY ?? "auto", maxY ?? "auto"];

  // ── Custom chart color from config ──
  const chartColor = (extra?.chartColor as string) || (config?.chartColor as string) || "";

  const { data } = useWidgetData({ telemetryKey, cache });
  const ts = data as TelemetryTimeseriesData | null;

  // ── Data retention buffer: accumulate scalar readings into a rolling history ──
  const bufferRef = useRef<ChartPoint[]>([]);
  const lastBufferTsRef = useRef<number>(0);

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

  // Single-series: prefer timeseries points, fall back to scalar accumulation
  const singleChartData = useMemo(() => {
    if (ts?.points && ts.points.length > 0) {
      // Full timeseries from backend — use it and sync buffer
      const pts = ts.points.map((p) => ({
        time: new Date(p.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        value: p.value,
      }));
      bufferRef.current = pts.slice(-MAX_BUFFER_POINTS);
      lastBufferTsRef.current = ts.points[ts.points.length - 1]?.ts || 0;
      return pts;
    }

    // No timeseries points — try to accumulate from scalar stat data
    if (data) {
      const raw = extractRawValue(data);
      if (raw !== null) {
        const num = parseFloat(raw);
        if (!isNaN(num)) {
          const now = Date.now();
          // Only add if enough time has passed (>5s) to avoid duplicates
          if (now - lastBufferTsRef.current > 5000) {
            lastBufferTsRef.current = now;
            bufferRef.current.push({
              time: new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              value: num,
            });
            if (bufferRef.current.length > MAX_BUFFER_POINTS) {
              bufferRef.current = bufferRef.current.slice(-MAX_BUFFER_POINTS);
            }
          }
        }
      }
    }

    // Return buffer (persisted data — never empty once populated)
    return bufferRef.current;
  }, [ts?.points, data]);

  const chartData = isMultiSeries ? (multiData || []) : singleChartData;
  const hasData = chartData.length > 0;

  // Detect if data looks like bps and compute unit
  const isBpsData = useMemo(() => {
    const extra2 = config?.extra as Record<string, unknown> | undefined;
    const unit = (extra2?.unit as string) || "";
    if (unit) return unit.toLowerCase().includes("bps") || unit.toLowerCase().includes("bit");
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

  // Resolve stroke & fill colors
  const strokeColor = chartColor || "hsl(var(--primary))";
  const gradientId = `grad-${telemetryKey}`;

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
                  series.map((s) => (
                    <linearGradient key={s.itemid} id={`grad-${s.itemid}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                    </linearGradient>
                  ))
                ) : (
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={strokeColor} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={strokeColor} stopOpacity={0.05} />
                  </linearGradient>
                )}
              </defs>
              <XAxis dataKey="time" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis
                domain={fixedDomain}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => unitInfo.divisor > 1 ? `${(v / unitInfo.divisor).toFixed(1)}` : String(v)}
              />
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
                  stroke={strokeColor}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
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
