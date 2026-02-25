/**
 * Dev-only performance logger for module load times.
 * Logs are only emitted in development mode.
 *
 * Usage:
 *   const end = perfStart("Impressoras");
 *   // ... load data
 *   end(); // logs: [Performance] Impressoras carregado em X.Xms
 */
export function perfStart(moduleName: string): () => void {
  if (import.meta.env.PROD) return () => {};
  const t0 = performance.now();
  return () => {
    const elapsed = (performance.now() - t0).toFixed(1);
    console.log(`[Performance] ${moduleName} carregado em ${elapsed}ms`);
  };
}

/**
 * React hook wrapper — logs time from mount to first data load.
 */
export function perfLog(moduleName: string, loaded: boolean) {
  if (import.meta.env.PROD) return;
  if (!(globalThis as any).__perf_marks) (globalThis as any).__perf_marks = {};
  const marks = (globalThis as any).__perf_marks;

  if (!marks[moduleName]) {
    marks[moduleName] = performance.now();
  }

  if (loaded && marks[moduleName] > 0) {
    const elapsed = (performance.now() - marks[moduleName]).toFixed(1);
    console.log(`[Performance] ${moduleName} carregado em ${elapsed}ms`);
    marks[moduleName] = -1; // prevent re-logging
  }
}
