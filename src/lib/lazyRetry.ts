import { lazy, type ComponentType } from "react";

const CHUNK_RETRY_KEY = "flowpulse:chunk-retry";

/**
 * Wraps React.lazy with automatic retry on chunk load failure.
 * If a dynamic import fails (stale chunk after deploy), it reloads
 * the page exactly once per session to fetch updated assets.
 */
export function lazyRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    factory().catch((err) => {
      const alreadyRetried = sessionStorage.getItem(CHUNK_RETRY_KEY) === "1";
      if (!alreadyRetried) {
        console.warn("[lazyRetry] Chunk load failed, reloading page…", err);
        sessionStorage.setItem(CHUNK_RETRY_KEY, "1");
        window.location.reload();
      }
      // If already retried, let the error propagate to ErrorBoundary
      throw err;
    }),
  );
}
