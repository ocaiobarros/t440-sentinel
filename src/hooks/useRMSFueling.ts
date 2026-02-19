import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FuelingEntry {
  id: string;
  date: string;
  liters: number;
  reading: number | null;
  reading_type: "odometer" | "hourmeter" | null;
  driver_name: string | null;
  fleet_number: string | null;
  equipment_name: string | null;
}

interface FuelingResponse {
  entries: FuelingEntry[];
  count: number;
}

async function fetchFuelingEntries(startDate: string, endDate: string): Promise<FuelingResponse> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.access_token) throw new Error("Not authenticated");

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rms-fueling?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${session.session.access_token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`RMS Fueling API error ${res.status}: ${body}`);
  }

  return res.json();
}

export function useRMSFueling(startDate: string | null, endDate: string | null) {
  return useQuery<FuelingResponse>({
    queryKey: ["rms-fueling", startDate, endDate],
    queryFn: () => fetchFuelingEntries(startDate!, endDate!),
    enabled: !!startDate && !!endDate,
    staleTime: 5 * 60 * 1000, // 5 min
    retry: 1,
  });
}
