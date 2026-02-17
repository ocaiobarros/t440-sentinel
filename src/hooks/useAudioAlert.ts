import { useCallback, useRef, useState } from "react";

/**
 * Audio Engine: generates a short beep via Web Audio API when a widget enters critical state.
 * Respects browser autoplay policies — audio context is resumed on first user interaction.
 */
export function useAudioAlert() {
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem("flowpulse:audio-muted") === "true"; } catch { return false; }
  });
  const ctxRef = useRef<AudioContext | null>(null);
  const lastBeepRef = useRef<Map<string, number>>(new Map());
  const COOLDOWN_MS = 3000; // don't beep same widget more than once every 3s

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  /** Play a short alert beep (two-tone siren, ~200ms) */
  const playBeep = useCallback((widgetId: string) => {
    if (muted) return;

    const now = Date.now();
    const last = lastBeepRef.current.get(widgetId) || 0;
    if (now - last < COOLDOWN_MS) return;
    lastBeepRef.current.set(widgetId, now);

    try {
      const ctx = getCtx();
      const t = ctx.currentTime;

      // First tone (higher)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "square";
      osc1.frequency.setValueAtTime(880, t);
      gain1.gain.setValueAtTime(0.08, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc1.connect(gain1).connect(ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.12);

      // Second tone (lower, slight delay)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "square";
      osc2.frequency.setValueAtTime(660, t + 0.1);
      gain2.gain.setValueAtTime(0.06, t + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc2.connect(gain2).connect(ctx.destination);
      osc2.start(t + 0.1);
      osc2.stop(t + 0.25);
    } catch {
      // Silent fail — audio not available
    }
  }, [muted, getCtx]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try { localStorage.setItem("flowpulse:audio-muted", String(next)); } catch {}
      return next;
    });
  }, []);

  return { muted, toggleMute, playBeep };
}
