import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import i18n from "@/i18n";

export interface Profile {
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  job_title: string | null;
  phone: string | null;
  language: string | null;
}

/**
 * Shared hook so Sidebar, Header and Settings page all reflect the same profile.
 * Uses a module-level cache + event emitter so every consumer stays in sync.
 */
const listeners = new Set<() => void>();
let cached: Profile | null = null;

function notify() {
  listeners.forEach((fn) => fn());
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(cached);
  const [loading, setLoading] = useState(!cached);

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, email, job_title, phone, language")
      .eq("id", user.id)
      .single();
    if (data) {
      cached = data as Profile;
      // Sync language from DB on load
      if (data.language && data.language !== i18n.language) {
        i18n.changeLanguage(data.language);
        localStorage.setItem("flowpulse-lang", data.language);
      }
      notify();
    }
  }, [user]);

  // subscribe to cache changes
  useEffect(() => {
    const handler = () => setProfile({ ...cached });
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  // initial fetch
  useEffect(() => {
    if (!user) return;
    if (cached) { setProfile(cached); setLoading(false); return; }
    refresh().finally(() => setLoading(false));
  }, [user, refresh]);

  return { profile, loading, refresh };
}
