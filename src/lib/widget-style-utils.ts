import type { CSSProperties } from "react";

/** Widget style configuration (mirrors WidgetStyle from builder types) */
interface StyleConfig {
  bg?: string;
  bgGradient?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  padding?: number;
  textColor?: string;
  glow?: string;
  glowColor?: string;
  glass?: boolean;
  [key: string]: unknown;
}

/** Build inline CSS from a widget style config object */
export function buildWidgetCSS(style: StyleConfig): CSSProperties {
  const css: CSSProperties = {};

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

/** Returns CSS class for glass effect based on style config */
export function getGlassClass(style: StyleConfig): string {
  return style.glass !== false ? "glass-card" : "";
}
