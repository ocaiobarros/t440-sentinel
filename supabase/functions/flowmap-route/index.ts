import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Fetches a driving route between two coordinates using the public OSRM API.
 * Returns GeoJSON LineString geometry that follows roads.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { origin_lat, origin_lon, dest_lat, dest_lon } = await req.json();

    if (!origin_lat || !origin_lon || !dest_lat || !dest_lon) {
      return new Response(
        JSON.stringify({ error: "Missing coordinates" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // OSRM expects lon,lat order
    const url = `https://router.project-osrm.org/route/v1/driving/${origin_lon},${origin_lat};${dest_lon},${dest_lat}?overview=full&geometries=geojson`;

    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`OSRM returned ${resp.status}`);
    }

    const data = await resp.json();

    if (!data.routes || data.routes.length === 0) {
      // Fallback: straight line
      return new Response(
        JSON.stringify({
          geometry: {
            type: "LineString",
            coordinates: [
              [origin_lon, origin_lat],
              [dest_lon, dest_lat],
            ],
          },
          distance_km: 0,
          duration_min: 0,
          routed: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const route = data.routes[0];

    return new Response(
      JSON.stringify({
        geometry: route.geometry,
        distance_km: Math.round((route.distance / 1000) * 100) / 100,
        duration_min: Math.round((route.duration / 60) * 100) / 100,
        routed: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
