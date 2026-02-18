import { memo, useMemo, useRef, useCallback } from "react";
import { motion, useSpring, useTransform, AnimatePresence } from "framer-motion";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import { extractRawValue, getMappedStatus } from "@/lib/telemetry-utils";
import { formatDynamicValue } from "@/lib/format-utils";
import { BatteryWarning, Zap, Timer, Activity, BatteryCharging, ShieldCheck, AlertTriangle } from "lucide-react";

// ── Types ──
interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
  config?: Record<string, unknown>;
  compact?: boolean;
}

// ── Battery State Machine ──
type BatteryState = "charging" | "ready" | "discharging" | "shutdown";

// ── Color palette ──
const STATE_COLORS: Record<BatteryState, string> = {
  charging: "rgb(0, 220, 255)",     // Cyan
  ready: "rgb(0, 220, 80)",         // Green
  discharging: "rgb(255, 160, 0)",  // Orange (overridden by pct-based color when low)
  shutdown: "rgb(255, 30, 30)",     // Emergency Red
};

const STATE_LABELS: Record<BatteryState, string> = {
  charging: "RECOVERING",
  ready: "AC NORMAL",
  discharging: "DISCHARGING",
  shutdown: "SHUTDOWN IMMINENT",
};

// ── Color helpers ──
interface RGBStop { pct: number; r: number; g: number; b: number }
const BATTERY_STOPS: RGBStop[] = [
  { pct: 0,   r: 255, g: 0,   b: 0   },
  { pct: 25,  r: 255, g: 80,  b: 0   },
  { pct: 50,  r: 255, g: 200, b: 0   },
  { pct: 75,  r: 100, g: 220, b: 50  },
  { pct: 100, r: 0,   g: 220, b: 80  },
];

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function getBatteryColor(pct: number): string {
  const clamped = Math.min(100, Math.max(0, pct));
  if (clamped <= BATTERY_STOPS[0].pct) {
    const s = BATTERY_STOPS[0];
    return `rgb(${s.r}, ${s.g}, ${s.b})`;
  }
  const last = BATTERY_STOPS[BATTERY_STOPS.length - 1];
  if (clamped >= last.pct) return `rgb(${last.r}, ${last.g}, ${last.b})`;

  for (let i = 0; i < BATTERY_STOPS.length - 1; i++) {
    const a = BATTERY_STOPS[i];
    const b = BATTERY_STOPS[i + 1];
    if (clamped >= a.pct && clamped <= b.pct) {
      const t = (clamped - a.pct) / (b.pct - a.pct);
      return `rgb(${lerp(a.r, b.r, t)}, ${lerp(a.g, b.g, t)}, ${lerp(a.b, b.b, t)})`;
    }
  }
  return `rgb(128, 128, 128)`;
}

const SEGMENT_COUNT = 20;
const EMERGENCY_RED = "rgb(255, 30, 30)";
const MAX_HISTORY = 6;
// Default linear drain: assume ~3h total discharge time for fallback
const DEFAULT_LINEAR_RATE_PER_MIN = 1; // 1 minute lost per minute (real-time)

// ── Voltage Decay Rate estimation (Method B - Pop Protect) ──
// Only uses readings captured WHILE discharging (status-gated).
// Static voltage → linear fallback; rapid drops → accelerated countdown.
function estimateRuntimeByDecayRate(
  voltage: number,
  criticalV: number,
  dischargeHistory: { v: number; t: number }[],
): { display: string; suffix: string } {
  const distToCritical = Math.max(0, voltage - criticalV);

  if (distToCritical <= 0) {
    return { display: "0", suffix: "m" };
  }

  // Try to calculate actual decay rate from discharge-only history
  if (dischargeHistory.length >= 2) {
    const first = dischargeHistory[0];
    const last = dischargeHistory[dischargeHistory.length - 1];
    const elapsedMs = last.t - first.t;
    const voltageDrop = first.v - last.v;

    if (elapsedMs > 0) {
      const elapsedMinutes = elapsedMs / 60000;

      if (voltageDrop > 0.001 && elapsedMinutes > 0) {
        // Voltage IS dropping → use actual decay rate (Eat Time effect)
        const dropPerMinute = voltageDrop / elapsedMinutes;
        const minutesLeft = Math.max(1, Math.round(distToCritical / dropPerMinute));
        if (minutesLeft >= 60) {
          const h = Math.floor(minutesLeft / 60);
          const m = minutesLeft % 60;
          return { display: String(h), suffix: `h ${String(m).padStart(2, "0")}m` };
        }
        return { display: String(minutesLeft), suffix: "m" };
      }

      // Voltage is STATIC during discharge (high-quality battery) → linear fallback
      // Estimate based on distance to critical using a standard ~3h total curve
      const totalRange = Math.max(1, voltage - criticalV + (first.v - criticalV)) / 2;
      const fullMinutes = 180; // assume 3h total autonomy
      const remainingRatio = distToCritical / Math.max(0.1, totalRange);
      const minutesLeft = Math.max(1, Math.round(remainingRatio * fullMinutes - elapsedMinutes * DEFAULT_LINEAR_RATE_PER_MIN));
      if (minutesLeft >= 60) {
        const h = Math.floor(minutesLeft / 60);
        const m = minutesLeft % 60;
        return { display: String(h), suffix: `h ${String(m).padStart(2, "0")}m` };
      }
      return { display: String(minutesLeft), suffix: "m" };
    }
  }

  // No history yet → non-linear curve fallback based on distance to critical
  const maxRange = 5; // ~5V typical safe range
  const ratio = Math.min(1, distToCritical / maxRange);
  const curvedRatio = Math.pow(ratio, 0.6);
  const estimatedMinutes = Math.max(1, Math.round(curvedRatio * 180));
  if (estimatedMinutes >= 60) {
    const h = Math.floor(estimatedMinutes / 60);
    const m = estimatedMinutes % 60;
    return { display: String(h), suffix: `h ${String(m).padStart(2, "0")}m` };
  }
  return { display: String(estimatedMinutes), suffix: "m" };
}

// ── Universal trigger: supports binary (0/1) and string (on/off) ──
function matchesValue(raw: string | null, target: string): boolean {
  if (raw === null) return false;
  return raw.trim().toLowerCase() === target.trim().toLowerCase();
}

function BatteryBarWidgetInner({ telemetryKey, title, cache, config, compact }: Props) {
  const { data, isInitial } = useWidgetData({ telemetryKey, cache });
  const rawValue = extractRawValue(data);
  const numValue = rawValue !== null ? parseFloat(rawValue) : 0;

  // ── Voltage history for decay rate — STATUS-GATED ──
  // Only records while discharging to prevent ghost countdowns from AC fluctuations.
  const dischargeHistoryRef = useRef<{ v: number; t: number }[]>([]);
  const lastRecordedRef = useRef<number>(0);
  const wasChargingRef = useRef(true); // reset history on state transition

  const extra = (config?.extra as Record<string, unknown>) || config || {};
  const minVoltage = (extra.minVoltage as number) ?? (extra.min as number) ?? 22;
  const maxVoltage = (extra.maxVoltage as number) ?? (extra.max as number) ?? 27;
  const criticalThreshold = (extra.criticalThreshold as number) ?? (extra.critical as number) ?? 23;
  const unit = (extra.units as string) || "V";

  // ── Color mapping ──
  const colorMap = (config?.color_map as Record<string, unknown>) || (extra?.color_map as Record<string, unknown>);
  const defaultColor = (config?.default_color as string) || (extra?.default_color as string) || undefined;
  const mappedStatus = getMappedStatus(rawValue, colorMap, defaultColor);
  const hasMapping = colorMap && rawValue !== null && mappedStatus.label !== rawValue && mappedStatus.label !== "N/A";

  // ── Style config ──
  const styleConfig = (config?.style as Record<string, unknown>) || {};
  const valueColor = styleConfig.valueColor as string | undefined;
  const labelColor = styleConfig.labelColor as string | undefined;
  const titleFont = styleConfig.titleFont as string | undefined;
  const valueFont = styleConfig.valueFont as string | undefined;
  const valueFontSize = styleConfig.valueFontSize as number | undefined;
  const iconColor = styleConfig.iconColor as string | undefined;
  const textAlign = (styleConfig.textAlign as string) || "center";

  // ── Auto-suffix formatting ──
  const manualUnit = (extra.unit as string) || (config?.unit as string) || undefined;
  const decimals = (extra.decimals as number) ?? 1;
  const formatted = useMemo(() => {
    if (hasMapping) return formatDynamicValue(mappedStatus.label, title, { isMappedLabel: true });
    return formatDynamicValue(numValue, title, {
      manualUnit: manualUnit || unit,
      zabbixUnit: unit,
      decimals,
    });
  }, [hasMapping, mappedStatus.label, numValue, title, manualUnit, unit, decimals]);

  // ── Smart Runtime Mode config ──
  const runtimeEnabled = (extra.runtimeEnabled as boolean) ?? false;
  const runtimeStatusKey = (extra.runtimeStatusKey as string) || "";
  const runtimeDischargingValue = (extra.runtimeDischargingValue as string) || "1";
  const runtimeTimeKey = (extra.runtimeTimeKey as string) || "";
  const runtimeCalcMethod = (extra.runtimeCalcMethod as string) || "auto";

  // ── XPS Precision fields (Method A) ──
  const amperageKey = (extra.amperageKey as string) || "";
  const capacityAh = (extra.capacityAh as number) ?? 0;

  // ── Multi-Alarm (Secondary Status Key) ──
  const secondaryAlarmKey = (extra.secondaryAlarmKey as string) || "";
  const secondaryAlarmValue = (extra.secondaryAlarmValue as string) || "1";

  // ── Read telemetry from cache ──
  const statusEntry = runtimeEnabled && runtimeStatusKey ? cache.get(runtimeStatusKey) : undefined;
  const statusRaw = statusEntry ? extractRawValue(statusEntry.data) : null;

  const amperageEntry = runtimeEnabled && amperageKey ? cache.get(amperageKey) : undefined;
  const amperageRaw = amperageEntry ? extractRawValue(amperageEntry.data) : null;
  const amperageNum = amperageRaw !== null ? parseFloat(amperageRaw) : 0;

  const runtimeEntry = runtimeEnabled && runtimeTimeKey ? cache.get(runtimeTimeKey) : undefined;
  const runtimeRaw = runtimeEntry ? extractRawValue(runtimeEntry.data) : null;

  const secondaryEntry = secondaryAlarmKey ? cache.get(secondaryAlarmKey) : undefined;
  const secondaryRaw = secondaryEntry ? extractRawValue(secondaryEntry.data) : null;
  const isSecondaryAlarm = useMemo(() => {
    if (!secondaryAlarmKey || secondaryRaw === null) return false;
    return matchesValue(secondaryRaw, secondaryAlarmValue);
  }, [secondaryAlarmKey, secondaryRaw, secondaryAlarmValue]);

  // ── Universal trigger ──
  const isDischarging = useMemo(() => {
    if (!runtimeEnabled) return false;
    if (statusRaw === null) return false;
    return matchesValue(statusRaw, runtimeDischargingValue);
  }, [runtimeEnabled, statusRaw, runtimeDischargingValue]);

  // ── Status-gated voltage recording ──
  // Only record while discharging; clear history on AC restore
  if (!isDischarging) {
    // AC is UP → clear discharge history to prevent ghost countdowns
    if (!wasChargingRef.current) {
      dischargeHistoryRef.current = [];
      wasChargingRef.current = true;
    }
  } else {
    wasChargingRef.current = false;
    // Record voltage only during discharge (throttled)
    if (rawValue !== null && !isNaN(numValue)) {
      const now = Date.now();
      if (now - lastRecordedRef.current >= 5000) {
        lastRecordedRef.current = now;
        const hist = dischargeHistoryRef.current;
        hist.push({ v: numValue, t: now });
        if (hist.length > MAX_HISTORY) hist.shift();
      }
    }
  }

  // ── Detect voltage trend (rising = recovering for Pop Protect) ──
  const isVoltageRising = useMemo(() => {
    const hist = dischargeHistoryRef.current;
    if (hist.length < 2) return false;
    return hist[hist.length - 1].v > hist[hist.length - 2].v;
  }, [numValue]); // eslint-disable-line -- intentional re-eval on numValue change

  // ── Battery percentage ──
  const pct = useMemo(() => {
    if (maxVoltage <= minVoltage) return 0;
    return Math.min(100, Math.max(0, ((numValue - minVoltage) / (maxVoltage - minVoltage)) * 100));
  }, [numValue, minVoltage, maxVoltage]);

  // ── State Machine ──
  const batteryState: BatteryState = useMemo(() => {
    if (isSecondaryAlarm) return "shutdown";
    if (numValue <= criticalThreshold && rawValue !== null) return "shutdown";
    if (!runtimeEnabled) return "ready";
    if (isDischarging) return "discharging";
    // AC Normal: check if charging
    if (amperageNum > 0 && !isDischarging) return "charging"; // XPS: positive amperage + not discharging
    if (isVoltageRising && !isDischarging) return "charging";  // Pop: voltage rising
    return "ready";
  }, [isSecondaryAlarm, numValue, criticalThreshold, rawValue, runtimeEnabled, isDischarging, amperageNum, isVoltageRising]);

  // ── Adaptive Runtime Calculation (Dual-Engine) ──
  const runtimeFormatted = useMemo(() => {
    // SHUTDOWN → fixed label
    if (batteryState === "shutdown") {
      return { display: "0", suffix: "m", numericValue: 0 };
    }

    // Not discharging → no countdown
    if (batteryState !== "discharging") {
      return null; // signal to show state label instead
    }

    // Direct runtime from Zabbix
    if (runtimeRaw !== null && runtimeRaw !== undefined) {
      return formatDynamicValue(runtimeRaw, "Uptime", { zabbixUnit: "s", decimals: 0 });
    }

    // Method A (XPS Precision): capacity × voltage / amperage
    const useMethodA = (runtimeCalcMethod === "xps" || runtimeCalcMethod === "auto") &&
      amperageNum > 0 && capacityAh > 0;

    if (useMethodA) {
      const runtimeHours = (capacityAh * numValue) / amperageNum;
      const totalSeconds = runtimeHours * 3600;
      return formatDynamicValue(totalSeconds, "Uptime", { zabbixUnit: "s", decimals: 0 });
    }

    // Method B (Pop Protect): voltage decay rate with "Eat Time" effect
    if (runtimeCalcMethod === "estimate" || runtimeCalcMethod === "auto") {
      const est = estimateRuntimeByDecayRate(numValue, criticalThreshold, dischargeHistoryRef.current);
      return { display: est.display, suffix: est.suffix, numericValue: null };
    }

    return { display: "--", suffix: "h --m", numericValue: null };
  }, [batteryState, runtimeRaw, runtimeCalcMethod, amperageNum, capacityAh, numValue, criticalThreshold]);

  // Amperage formatted
  const amperageFormatted = useMemo(() => {
    if (amperageNum > 0) {
      return formatDynamicValue(amperageNum, "Amperage", { manualUnit: "A", decimals: 1 });
    }
    return null;
  }, [amperageNum]);

  // Active method label
  const activeMethod = useMemo(() => {
    if (batteryState !== "discharging") return "idle";
    if (runtimeRaw !== null) return "direct";
    if (amperageNum > 0 && capacityAh > 0) return "xps";
    return "estimate";
  }, [batteryState, runtimeRaw, amperageNum, capacityAh]);

  const showRuntime = runtimeEnabled;

  // ── Dynamic coloring based on state ──
  const stateColor = STATE_COLORS[batteryState];
  const dynamicColor = isSecondaryAlarm ? EMERGENCY_RED :
    batteryState === "discharging" ? getBatteryColor(pct) :
    stateColor;
  const color = hasMapping ? mappedStatus.color : (valueColor || dynamicColor);

  const isCritical = batteryState === "shutdown";

  const springPct = useSpring(pct, { stiffness: 80, damping: 20 });
  const widthStr = useTransform(springPct, (v) => `${v}%`);
  const litSegments = useMemo(() => Math.round((pct / 100) * SEGMENT_COUNT), [pct]);

  const alignClass = textAlign === "left" ? "items-start text-left" : textAlign === "right" ? "items-end text-right" : "items-center text-center";
  const runtimeColor = batteryState === "shutdown" ? EMERGENCY_RED :
    batteryState === "discharging" ? getBatteryColor(pct) :
    stateColor;
  const isRuntimeLow = pct < 20 || batteryState === "shutdown";

  const emergencyStyle = isCritical ? {
    borderColor: "hsl(0 100% 45%)",
    boxShadow: "0 0 15px hsla(0, 100%, 45%, 0.4), inset 0 0 15px hsla(0, 100%, 45%, 0.1)",
  } : undefined;

  // State icon
  const StateIcon = batteryState === "charging" ? BatteryCharging :
    batteryState === "shutdown" ? AlertTriangle :
    batteryState === "discharging" ? Timer :
    ShieldCheck;

  return (
    <motion.div
      initial={isInitial ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className={`glass-card rounded-lg ${compact ? "p-2 gap-1" : "p-3 gap-1.5"} h-full flex flex-col justify-between border border-border/50 relative overflow-hidden ${
        isCritical ? "battery-critical-pulse" : ""
      }`}
      style={emergencyStyle}
    >
      {/* ── TOP: Title row ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap
            className={`${compact ? "w-3 h-3" : "w-4 h-4"} shrink-0`}
            style={{
              color: iconColor || color,
              filter: `drop-shadow(0 0 6px ${iconColor || color})`,
              transition: "all 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
          <span
            className={`${compact ? "text-[8px]" : "text-[10px]"} font-display uppercase tracking-wider truncate`}
            style={{
              color: labelColor || undefined,
              fontFamily: titleFont || undefined,
              transition: "all 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            {title}
          </span>
        </div>
        {isCritical && (
          <BatteryWarning
            className={`${compact ? "w-3 h-3" : "w-4 h-4"} text-destructive shrink-0`}
            style={{ animation: "battery-icon-blink 1.5s ease-in-out infinite" }}
          />
        )}
      </div>

      {/* ── Voltage value ── */}
      <div className={`flex flex-col ${alignClass}`}>
        <span
          className="font-bold leading-none"
          style={{
            color,
            fontFamily: valueFont || "'JetBrains Mono', monospace",
            fontSize: valueFontSize ? `${valueFontSize}px` : (compact ? "18px" : "24px"),
            textShadow: `0 0 15px ${color}80, 0 0 5px ${color}`,
            transition: "all 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {formatted.display}
          {formatted.suffix && (
            <span style={{ fontSize: "0.7em", opacity: 0.85 }}>{formatted.suffix}</span>
          )}
        </span>
      </div>

      {/* ── CENTER: 20-Segment Battery Bar (always visible) ── */}
      <div className="relative">
        <div className={`flex gap-[2px] ${compact ? "h-2.5" : showRuntime ? "h-3" : "h-4"}`} style={{ transition: "height 0.4s ease" }}>
          {Array.from({ length: SEGMENT_COUNT }).map((_, i) => {
            const segPct = ((i + 0.5) / SEGMENT_COUNT) * 100;
            const segColor = isSecondaryAlarm ? EMERGENCY_RED :
              batteryState === "charging" ? STATE_COLORS.charging :
              getBatteryColor(segPct);
            const isLit = i < litSegments;
            return (
              <motion.div
                key={i}
                className="flex-1 rounded-[2px]"
                initial={false}
                animate={{ opacity: isLit ? 1 : 0.15, scale: isLit ? 1 : 0.95 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                style={{
                  background: segColor,
                  boxShadow: isLit ? `0 0 6px ${segColor}80, inset 0 1px 0 rgba(255,255,255,0.2)` : "none",
                }}
              />
            );
          })}
        </div>
        <div className={`absolute top-0 left-0 ${compact ? "h-2.5" : showRuntime ? "h-3" : "h-4"} pointer-events-none rounded-sm`} style={{ width: "100%", transition: "height 0.4s ease" }}>
          <motion.div
            className="h-full rounded-sm"
            style={{
              width: widthStr,
              background: "transparent",
              boxShadow: `0 0 12px ${dynamicColor}60, 0 0 4px ${dynamicColor}40`,
              transition: "box-shadow 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>
      </div>

      {/* ── BOTTOM: Runtime/Status row ── */}
      <AnimatePresence mode="wait">
        {showRuntime && (
          <motion.div
            key={`state-${batteryState}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35 }}
            className="flex items-center justify-between overflow-hidden"
          >
            {/* Bottom Left: Runtime countdown OR State label */}
            <div className="flex items-center gap-1">
              <StateIcon
                className={`${compact ? "w-2.5 h-2.5" : "w-3 h-3"} shrink-0`}
                style={{
                  color: runtimeColor,
                  filter: `drop-shadow(0 0 4px ${runtimeColor})`,
                  animation: batteryState === "charging" ? "pulse 2s ease-in-out infinite" : undefined,
                }}
              />
              {runtimeFormatted ? (
                // Discharging/Shutdown → show countdown
                <span
                  className="font-bold font-mono leading-none"
                  style={{
                    color: runtimeColor,
                    fontSize: valueFontSize ? `${valueFontSize * 0.65}px` : (compact ? "12px" : "15px"),
                    fontFamily: valueFont || "'JetBrains Mono', monospace",
                    textShadow: `0 0 12px ${runtimeColor}aa, 0 0 4px ${runtimeColor}`,
                    animation: isRuntimeLow ? "battery-icon-blink 1.2s ease-in-out infinite" : undefined,
                    transition: "color 0.8s, text-shadow 0.8s",
                  }}
                >
                  {batteryState === "shutdown" ? (
                    <>0<span style={{ fontSize: "0.7em", opacity: 0.85 }}>m</span></>
                  ) : (
                    <>
                      {runtimeFormatted.display}
                      <span style={{ fontSize: "0.7em", opacity: 0.85 }}>{runtimeFormatted.suffix}</span>
                    </>
                  )}
                </span>
              ) : (
                // Charging/Ready → show state label
                <span
                  className="font-bold leading-none uppercase tracking-wider"
                  style={{
                    color: stateColor,
                    fontSize: compact ? "9px" : "11px",
                    fontFamily: titleFont || "'JetBrains Mono', monospace",
                    textShadow: `0 0 10px ${stateColor}80`,
                    transition: "color 0.8s, text-shadow 0.8s",
                  }}
                >
                  {STATE_LABELS[batteryState]}
                </span>
              )}
              {activeMethod !== "idle" && activeMethod !== "direct" && batteryState === "discharging" && (
                <span className={`${compact ? "text-[5px]" : "text-[7px]"} uppercase tracking-widest opacity-40 font-mono`}
                  style={{ color: runtimeColor }}
                >
                  {activeMethod === "xps" ? "XPS" : "EST"}
                </span>
              )}
            </div>

            {/* Bottom Right: Amperage (if available) OR shutdown label */}
            {batteryState === "shutdown" ? (
              <span
                className="font-bold uppercase tracking-wider"
                style={{
                  color: EMERGENCY_RED,
                  fontSize: compact ? "7px" : "9px",
                  fontFamily: titleFont || undefined,
                  textShadow: `0 0 10px ${EMERGENCY_RED}80`,
                  animation: "battery-icon-blink 1s ease-in-out infinite",
                }}
              >
                SHUTDOWN
              </span>
            ) : amperageFormatted ? (
              <div className="flex items-center gap-1">
                <Activity
                  className={`${compact ? "w-2.5 h-2.5" : "w-3 h-3"} shrink-0`}
                  style={{ color: runtimeColor, filter: `drop-shadow(0 0 4px ${runtimeColor})`, opacity: 0.8 }}
                />
                <span
                  className="font-bold font-mono leading-none"
                  style={{
                    color: runtimeColor,
                    fontSize: valueFontSize ? `${valueFontSize * 0.6}px` : (compact ? "11px" : "13px"),
                    fontFamily: valueFont || "'JetBrains Mono', monospace",
                    textShadow: `0 0 8px ${runtimeColor}80`,
                    opacity: 0.9,
                    transition: "color 0.8s, text-shadow 0.8s",
                  }}
                >
                  {amperageFormatted.display}
                  <span style={{ fontSize: "0.7em", opacity: 0.85 }}>{amperageFormatted.suffix}</span>
                </span>
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Range labels ── */}
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-mono" style={{ color: labelColor || undefined, transition: "color 0.5s" }}>
          {minVoltage}{unit}
        </span>
        <span className="text-[8px] font-mono font-bold" style={{ color: dynamicColor, transition: "color 0.5s" }}>
          {pct.toFixed(0)}%
        </span>
        <span className="text-[8px] font-mono" style={{ color: labelColor || undefined, transition: "color 0.5s" }}>
          {maxVoltage}{unit}
        </span>
      </div>
    </motion.div>
  );
}

const BatteryBarWidget = memo(BatteryBarWidgetInner);
export default BatteryBarWidget;
