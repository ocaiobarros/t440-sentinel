/**
 * Thermal color scale with smooth HSL interpolation.
 * Maps temperature values to colors: Blue → Cyan → Green → Yellow → Orange → Red
 * No external dependencies — pure math interpolation.
 */

interface ThermalStop {
  temp: number;
  h: number; // hue
  s: number; // saturation %
  l: number; // lightness %
}

const THERMAL_STOPS: ThermalStop[] = [
  { temp: 10, h: 210, s: 100, l: 55 },  // Blue
  { temp: 20, h: 170, s: 100, l: 45 },  // Cyan/Teal
  { temp: 25, h: 55,  s: 100, l: 50 },  // Yellow
  { temp: 30, h: 30,  s: 100, l: 50 },  // Orange
  { temp: 35, h: 0,   s: 100, l: 45 },  // Red
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Get an interpolated thermal color for a given temperature in °C.
 * Returns an HSL string ready for CSS usage.
 */
export function getThermalColor(tempC: number): string {
  if (tempC <= THERMAL_STOPS[0].temp) {
    const s = THERMAL_STOPS[0];
    return `hsl(${s.h}, ${s.s}%, ${s.l}%)`;
  }
  if (tempC >= THERMAL_STOPS[THERMAL_STOPS.length - 1].temp) {
    const s = THERMAL_STOPS[THERMAL_STOPS.length - 1];
    return `hsl(${s.h}, ${s.s}%, ${s.l}%)`;
  }

  for (let i = 0; i < THERMAL_STOPS.length - 1; i++) {
    const a = THERMAL_STOPS[i];
    const b = THERMAL_STOPS[i + 1];
    if (tempC >= a.temp && tempC <= b.temp) {
      const t = (tempC - a.temp) / (b.temp - a.temp);
      const h = lerp(a.h, b.h, t);
      const s = lerp(a.s, b.s, t);
      const l = lerp(a.l, b.l, t);
      return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
    }
  }

  return `hsl(0, 0%, 60%)`; // fallback
}

/**
 * Get a thermal glow box-shadow string for CSS.
 */
export function getThermalGlow(tempC: number): string {
  const color = getThermalColor(tempC);
  return `0 0 8px ${color}, 0 0 20px ${color}40`;
}

/**
 * Check if a widget title/key looks like a temperature metric.
 */
export function isThermalMetric(title: string, unit?: string): boolean {
  const lower = (title + " " + (unit || "")).toLowerCase();
  return /temp|°c|°f|celsius|thermal|inlet|exhaust|cpu\s*temp/i.test(lower);
}
