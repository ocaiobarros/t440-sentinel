/**
 * Performance logger — active in development AND production.
 *
 * Dev mode: logs all module load times.
 * Production: logs only when latency exceeds PROD_THRESHOLD_MS.
 *
 * Usage:
 *   const end = perfStart("Impressoras");
 *   // ... load data
 *   end(); // logs: [Performance] Impressoras carregado em X.Xms
 */

const PROD_THRESHOLD_MS = 1500;

export function perfStart(moduleName: string): () => void {
  const t0 = performance.now();
  return () => {
    const elapsed = performance.now() - t0;
    if (import.meta.env.DEV || elapsed > PROD_THRESHOLD_MS) {
      console.log(`[Performance] ${moduleName} carregado em ${elapsed.toFixed(1)}ms`);
    }
  };
}

/**
 * React hook wrapper — logs time from mount to first data load.
 * In production, only logs if load time exceeds threshold.
 */
export function perfLog(moduleName: string, loaded: boolean) {
  if (!(globalThis as any).__perf_marks) (globalThis as any).__perf_marks = {};
  const marks = (globalThis as any).__perf_marks;

  if (!marks[moduleName]) {
    marks[moduleName] = performance.now();
  }

  if (loaded && marks[moduleName] > 0) {
    const elapsed = performance.now() - marks[moduleName];
    if (import.meta.env.DEV || elapsed > PROD_THRESHOLD_MS) {
      console.log(`[Performance] ${moduleName} carregado em ${elapsed.toFixed(1)}ms`);
    }
    marks[moduleName] = -1; // prevent re-logging
  }
}

/**
 * Log telemetry latency — always active. Used by the latency monitor widget.
 */
export function perfLatency(label: string, latencyMs: number, details?: Record<string, number | string | undefined>) {
  if (import.meta.env.DEV || latencyMs > PROD_THRESHOLD_MS) {
    const detailStr = details
      ? " | " + Object.entries(details).map(([k, v]) => `${k}=${v ?? '?'}`).join(" | ")
      : "";
    console.log(`[Latency] ${label}: ${latencyMs.toFixed(0)}ms${detailStr}`);
  }
}
