import { useEffect } from "react";

const CHUNK_RELOAD_KEY = "flowpulse:chunk-reload-once";

function getErrorMessage(reason: unknown): string {
  if (typeof reason === "string") return reason;
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message?: unknown }).message ?? "");
  }
  return "";
}

function isChunkLoadError(message: string): boolean {
  return /Failed to fetch dynamically imported module|Failed to load module script|Loading chunk [^\s]+ failed|Importing a module script failed/i.test(
    message,
  );
}

/**
 * Recovers from stale Vite chunks after deploy (common on Vercel with cached HTML).
 * It reloads the page only once per tab session when a dynamic import chunk fails.
 */
export default function ChunkLoadRecovery() {
  useEffect(() => {
    const clearReloadFlagTimer = window.setTimeout(() => {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    }, 15000);

    const attemptRecovery = (message: string) => {
      if (!isChunkLoadError(message)) return;

      const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
      if (alreadyReloaded) return;

      sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
      window.location.reload();
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = getErrorMessage(event.reason);
      attemptRecovery(message);
    };

    const onError = (event: ErrorEvent) => {
      const message = [
        event.message || "",
        getErrorMessage(event.error),
      ]
        .filter(Boolean)
        .join(" | ");
      attemptRecovery(message);
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onError);

    return () => {
      window.clearTimeout(clearReloadFlagTimer);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
