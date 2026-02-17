/** Shared types for the dashboard builder */

export interface WidgetStyle {
  /** Background color (CSS value) */
  bg?: string;
  /** Border color */
  borderColor?: string;
  /** Border width px */
  borderWidth?: number;
  /** Border radius px */
  borderRadius?: number;
  /** Text color */
  textColor?: string;
  /** Value/number color */
  valueColor?: string;
  /** Label color */
  labelColor?: string;
  /** Font family for title */
  titleFont?: string;
  /** Font family for values */
  valueFont?: string;
  /** Font size for value (px) */
  valueFontSize?: number;
  /** Glow effect: "none" | "green" | "red" | "amber" | "blue" | "cyan" | "custom" */
  glow?: string;
  /** Custom glow color (when glow="custom") */
  glowColor?: string;
  /** Icon name from lucide-react */
  icon?: string;
  /** Icon color */
  iconColor?: string;
  /** Opacity 0-100 */
  opacity?: number;
  /** Glass effect */
  glass?: boolean;
  /** Background gradient */
  bgGradient?: string;
  /** Padding px */
  padding?: number;
}

export interface WidgetConfig {
  id: string;
  widget_type: string;
  title: string;
  /** react-grid-layout position */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Minimum dimensions */
  minW?: number;
  minH?: number;
  /** Visual customization */
  style: WidgetStyle;
  /** Zabbix query config */
  query: {
    source: string;
    method: string;
    params: Record<string, unknown>;
  };
  /** Adapter config */
  adapter: {
    type: string;
    value_field?: string;
    history_type?: number;
    telemetry_key?: string;
  };
  /** Any extra config */
  extra: Record<string, unknown>;
}

export interface DashboardConfig {
  id?: string;
  name: string;
  description: string;
  zabbix_connection_id: string | null;
  settings: {
    poll_interval_seconds: number;
    cols: number;
    rowHeight: number;
    /** Dashboard background */
    bg?: string;
    bgGradient?: string;
    /** Grid overlay */
    showGrid?: boolean;
    /** Scanline effect */
    scanlines?: boolean;
    /** Ambient glow */
    ambientGlow?: boolean;
    ambientGlowColor?: string;
    /** Category theme from preset */
    category?: string;
  };
  widgets: WidgetConfig[];
}

/** Hotspot definition for image-map widgets */
export interface ImageHotspot {
  id: string;
  /** Position as percentage 0-100 */
  x: number;
  y: number;
  /** Telemetry key to bind LED to */
  telemetry_key: string;
  /** Label shown on hover */
  label: string;
  /** LED size px */
  size?: number;
  /** Shape of the hotspot */
  shape?: "circle" | "square" | "bar-h" | "bar-v";
  /** Color mapping: value→color or value→{color, label} */
  color_map?: Record<string, unknown>;
  /** Default color when no match */
  default_color?: string;
}

export const WIDGET_TYPES = [
  { type: "stat", label: "Stat", icon: "Hash", description: "Valor numérico com unidade e trend", minW: 2, minH: 1 },
  { type: "gauge", label: "Gauge", icon: "Gauge", description: "Indicador semicircular com min/max", minW: 2, minH: 2 },
  { type: "timeseries", label: "Timeseries", icon: "TrendingUp", description: "Gráfico de linha temporal", minW: 3, minH: 2 },
  { type: "table", label: "Tabela", icon: "Table2", description: "Tabela de dados com colunas", minW: 3, minH: 2 },
  { type: "text", label: "Texto", icon: "Type", description: "Texto livre ou markdown", minW: 2, minH: 1 },
  { type: "status", label: "Status LED", icon: "CircleDot", description: "LED de status com color_map customizado", minW: 1, minH: 1 },
  { type: "progress", label: "Barra %", icon: "BarChart3", description: "Barra de progresso horizontal", minW: 2, minH: 1 },
  { type: "icon-value", label: "Ícone+Valor", icon: "Zap", description: "Ícone dinâmico com valor e cor", minW: 2, minH: 1 },
  { type: "image-map", label: "Image Map", icon: "Image", description: "Imagem interativa com LEDs mapeados", minW: 3, minH: 3 },
  { type: "traffic-light", label: "Semáforo", icon: "AlertTriangle", description: "Semáforo 3 estados com color_map", minW: 1, minH: 2 },
  { type: "label", label: "Label", icon: "Tag", description: "Label estático para organização", minW: 1, minH: 1 },
] as const;

export const GLOW_PRESETS = [
  { value: "none", label: "Sem glow" },
  { value: "green", label: "Verde Neon", color: "hsl(110 100% 54%)" },
  { value: "red", label: "Vermelho", color: "hsl(0 100% 40%)" },
  { value: "amber", label: "Âmbar", color: "hsl(43 100% 50%)" },
  { value: "blue", label: "Azul", color: "hsl(210 100% 60%)" },
  { value: "cyan", label: "Ciano", color: "hsl(180 100% 50%)" },
  { value: "custom", label: "Personalizado" },
] as const;

export const FONT_OPTIONS = [
  { value: "'Orbitron', sans-serif", label: "Orbitron" },
  { value: "'JetBrains Mono', monospace", label: "JetBrains Mono" },
  { value: "'Inter', sans-serif", label: "Inter" },
  { value: "monospace", label: "Monospace" },
  { value: "sans-serif", label: "Sans-serif" },
] as const;

export const COLOR_PRESETS = [
  "#39FF14", // neon green
  "#FFBF00", // amber
  "#8B0000", // deep red
  "#FF4444", // bright red
  "#3B82F6", // blue
  "#06B6D4", // cyan
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#F97316", // orange
  "#FFFFFF", // white
  "#A0A0A0", // gray
  "#000000", // black
] as const;

export function createDefaultWidget(type: string, x = 0, y = 0): WidgetConfig {
  const def = WIDGET_TYPES.find((t) => t.type === type) || WIDGET_TYPES[0];
  return {
    id: crypto.randomUUID(),
    widget_type: type,
    title: def.label,
    x,
    y,
    w: def.minW + 1,
    h: def.minH,
    minW: def.minW,
    minH: def.minH,
    style: {
      glass: true,
      glow: "none",
      opacity: 100,
      borderRadius: 8,
      padding: 16,
      titleFont: "'Orbitron', sans-serif",
      valueFont: "'JetBrains Mono', monospace",
    },
    query: { source: "zabbix", method: "item.get", params: {} },
    adapter: { type: "auto" },
    extra: {},
  };
}
