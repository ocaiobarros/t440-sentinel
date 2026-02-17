import type { WidgetConfig, WidgetStyle } from "@/types/builder";
import DynamicIcon from "./DynamicIcon";

interface Props {
  widget: WidgetConfig;
  isSelected: boolean;
  onClick: () => void;
  isPreview?: boolean;
}

/** Build inline CSS from widget style config */
function buildWidgetCSS(style: WidgetStyle): React.CSSProperties {
  const css: React.CSSProperties = {};

  if (style.bgGradient) {
    css.background = style.bgGradient;
  } else if (style.bg) {
    css.backgroundColor = style.bg;
  }

  if (style.borderColor) css.borderColor = style.borderColor;
  if (style.borderWidth !== undefined) css.borderWidth = style.borderWidth;
  if (style.borderRadius !== undefined) css.borderRadius = style.borderRadius;
  if (style.opacity !== undefined) css.opacity = style.opacity / 100;
  if (style.padding !== undefined) css.padding = style.padding;
  if (style.textColor) css.color = style.textColor;

  // Glow box-shadow
  if (style.glow && style.glow !== "none") {
    const glowColors: Record<string, string> = {
      green: "110, 100%, 54%",
      red: "0, 100%, 40%",
      amber: "43, 100%, 50%",
      blue: "210, 100%, 60%",
      cyan: "180, 100%, 50%",
    };
    const hsl = style.glow === "custom" && style.glowColor
      ? style.glowColor
      : glowColors[style.glow]
        ? `hsl(${glowColors[style.glow]})`
        : undefined;

    if (hsl) {
      const c = style.glow === "custom" ? hsl : hsl;
      css.boxShadow = `0 0 8px ${c}4D, 0 0 20px ${c}26, inset 0 0 8px ${c}0D`;
    }
  }

  return css;
}

export default function WidgetPreviewCard({ widget, isSelected, onClick, isPreview }: Props) {
  const s = widget.style;
  const inlineCSS = buildWidgetCSS(s);

  const glassClass = s.glass !== false ? "glass-card" : "";
  const selectedClass = isSelected ? "ring-2 ring-neon-green ring-offset-1 ring-offset-background" : "";

  return (
    <div
      onClick={onClick}
      className={`h-full w-full rounded-lg border border-border/50 overflow-hidden cursor-pointer transition-all ${glassClass} ${selectedClass} ${isPreview ? "" : "hover:border-foreground/20"}`}
      style={{
        ...inlineCSS,
        borderStyle: "solid",
      }}
    >
      {/* Title bar */}
      <div className="flex items-center gap-1.5 mb-1" style={{ padding: `${(s.padding ?? 16) * 0.5}px ${s.padding ?? 16}px 0` }}>
        {s.icon && (
          <DynamicIcon
            name={s.icon}
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: s.iconColor || "#39FF14" }}
          />
        )}
        <span
          className="text-[10px] uppercase tracking-wider truncate font-semibold"
          style={{
            fontFamily: s.titleFont || "'Orbitron', sans-serif",
            color: s.labelColor || s.textColor || "hsl(215 10% 50%)",
          }}
        >
          {widget.title}
        </span>
      </div>

      {/* Content area - type-specific preview */}
      <div
        className="flex items-center justify-center flex-1"
        style={{ padding: `4px ${s.padding ?? 16}px ${(s.padding ?? 16) * 0.5}px` }}
      >
        {renderTypePreview(widget)}
      </div>
    </div>
  );
}

function renderTypePreview(widget: WidgetConfig) {
  const s = widget.style;
  const valStyle: React.CSSProperties = {
    fontFamily: s.valueFont || "'JetBrains Mono', monospace",
    fontSize: s.valueFontSize || 24,
    color: s.valueColor || "#39FF14",
  };

  switch (widget.widget_type) {
    case "stat":
      return (
        <div className="text-center">
          <div style={valStyle} className="font-bold">—</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">aguardando</div>
        </div>
      );
    case "gauge":
      return (
        <svg viewBox="0 0 100 60" className="w-full max-w-[80px]">
          <path d="M 10 55 A 40 40 0 0 1 90 55" fill="none" stroke="hsl(220 15% 20%)" strokeWidth="6" strokeLinecap="round" />
          <path d="M 10 55 A 40 40 0 0 1 90 55" fill="none" stroke={s.valueColor || "#39FF14"} strokeWidth="6" strokeLinecap="round" strokeDasharray="125" strokeDashoffset="80" />
          <text x="50" y="50" textAnchor="middle" fill={s.valueColor || "#39FF14"} fontSize="12" fontFamily={s.valueFont || "'JetBrains Mono'"}>—</text>
        </svg>
      );
    case "timeseries":
      return (
        <div className="w-full h-full flex items-end gap-px opacity-40">
          {[30, 45, 38, 52, 48, 60, 55, 42].map((h, i) => (
            <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: s.valueColor || "#39FF14" }} />
          ))}
        </div>
      );
    case "table":
      return (
        <div className="w-full space-y-1 opacity-50">
          {[1, 2, 3].map((r) => (
            <div key={r} className="flex gap-2">
              <div className="h-2 flex-1 bg-muted rounded" />
              <div className="h-2 w-12 bg-muted rounded" />
            </div>
          ))}
        </div>
      );
    case "status":
      return (
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full pulse-green" style={{ background: s.valueColor || "#39FF14" }} />
          <span style={{ ...valStyle, fontSize: 16 }} className="font-bold">OK</span>
        </div>
      );
    case "progress":
      return (
        <div className="w-full">
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full w-[35%]" style={{ background: s.valueColor || "#39FF14" }} />
          </div>
        </div>
      );
    case "icon-value":
      return (
        <div className="flex items-center gap-3">
          {s.icon && <DynamicIcon name={s.icon} className="w-8 h-8" style={{ color: s.iconColor || "#39FF14" }} />}
          <div style={valStyle} className="font-bold">—</div>
        </div>
      );
    default:
      return <span className="text-xs text-muted-foreground">Widget</span>;
  }
}
