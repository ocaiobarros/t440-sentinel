import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function usePlatformAdmin() {
  const { user } = useAuth();

  // Fast check from JWT app_metadata
  const jwtFlag = !!user?.app_metadata?.is_platform_admin;

  // Authoritative check from DB
  const { data, isLoading } = useQuery({
    queryKey: ["platform-admin", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_platform_admin", {
        p_user_id: user!.id,
      });
      if (error) {
        console.warn("[usePlatformAdmin] RPC error:", error.message);
        return false;
      }
      return !!data;
    },
  });

  const isPlatformAdmin = data ?? jwtFlag;

  return {
    isPlatformAdmin,
    isLoading,
  };
}
