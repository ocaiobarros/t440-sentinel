import { useRef, useState, useEffect, useCallback } from "react";

interface UseWidgetVisibilityOptions {
  /** Root margin to pre-load widgets slightly before they enter viewport */
  rootMargin?: string;
  /** Once visible, how long to wait before going to standby after leaving viewport (ms) */
  standbyDelayMs?: number;
}

/**
 * Hook: tracks widget visibility via IntersectionObserver.
 * Returns a ref to attach to the widget container and a boolean `isVisible`.
 * Widgets use this to skip expensive renders (Recharts SVG) when off-screen.
 */
export function useWidgetVisibility({
  rootMargin = "100px 0px",
  standbyDelayMs = 500,
}: UseWidgetVisibilityOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true); // start visible to avoid flash
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Immediately wake up
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          setIsVisible(true);
        } else {
          // Delay standby to avoid flicker during fast scrolls
          if (!timerRef.current) {
            timerRef.current = setTimeout(() => {
              timerRef.current = null;
              setIsVisible(false);
            }, standbyDelayMs);
          }
        }
      },
      { rootMargin, threshold: 0 },
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [rootMargin, standbyDelayMs]);

  return { containerRef, isVisible };
}
