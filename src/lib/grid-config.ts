/**
 * NOC-Ready grid configuration for react-grid-layout.
 *
 * Breakpoints tuned for:
 *   sm  → laptops / small monitors (≤1280px)
 *   md  → 1080p Full-HD (1280–1919px)
 *   lg  → 2K / QHD (1920–2559px)
 *   xl  → 4K UHD (2560–3839px)
 *   xxl → Ultrawide / video-walls (≥3840px)
 */

export const GRID_BREAKPOINTS = { xxl: 3840, xl: 2560, lg: 1920, md: 1280, sm: 0 } as const;
export const GRID_COLS        = { xxl: 48,   xl: 36,   lg: 24,   md: 18,   sm: 12 } as const;
export const GRID_ROW_HEIGHTS = { xxl: 20,   xl: 18,   lg: 15,   md: 14,   sm: 12 } as const;
export const GRID_MARGIN: [number, number] = [4, 4];
export const GRID_CONTAINER_PADDING: [number, number] = [0, 0];

/** Default cols / rowHeight persisted in dashboard settings */
export const DEFAULT_COLS = 24;
export const DEFAULT_ROW_HEIGHT = 15;

/**
 * Given a container width, return the active breakpoint key.
 */
export function activeBreakpoint(width: number): keyof typeof GRID_BREAKPOINTS {
  if (width >= GRID_BREAKPOINTS.xxl) return "xxl";
  if (width >= GRID_BREAKPOINTS.xl) return "xl";
  if (width >= GRID_BREAKPOINTS.lg) return "lg";
  if (width >= GRID_BREAKPOINTS.md) return "md";
  return "sm";
}

/**
 * Scale a base layout (designed for `baseCols`) to a target column count.
 * Preserves relative positions and sizes.
 */
export function scaleLayout(
  layout: Array<{ i: string; x: number; y: number; w: number; h: number }>,
  baseCols: number,
  targetCols: number,
) {
  if (baseCols === targetCols) return layout;
  const ratio = targetCols / baseCols;
  return layout.map((item) => ({
    ...item,
    x: Math.round(item.x * ratio),
    w: Math.max(1, Math.round(item.w * ratio)),
    // h stays the same — rowHeight scaling handles vertical proportion
  }));
}
