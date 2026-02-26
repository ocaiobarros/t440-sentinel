/**
 * FlowPulse Edge Functions — Main Router (On-Premise)
 *
 * Este é o main service do supabase/edge-runtime em modo self-hosted.
 * Recebe todos os requests via Kong e delega para o worker correto
 * usando EdgeRuntime.userWorkers.create().
 *
 * Baseado em: https://github.com/supabase/edge-runtime/blob/main/examples/main/index.ts
 */

const FUNCTIONS_DIR = "/home/deno/functions";

console.log("[FlowPulse] Main function router started");

addEventListener("beforeunload", () => {
  console.log("[FlowPulse] Main worker exiting");
});

addEventListener("unhandledrejection", (ev: any) => {
  console.error("[FlowPulse] Unhandled rejection:", ev);
  ev.preventDefault();
});

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const { pathname } = url;

  const headers = new Headers({ "Content-Type": "application/json" });

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };

  // Health check
  if (pathname === "/_internal/health" || pathname === "/" || pathname === "") {
    return new Response(
      JSON.stringify({ status: "ok", message: "FlowPulse Edge Functions Router" }),
      { status: 200, headers },
    );
  }

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Extract function name from path
  // Kong strips /functions/v1/ so we get /<function-name> or /<function-name>/...
  const pathParts = pathname.split("/").filter(Boolean);
  const functionName = pathParts[0];

  if (!functionName || functionName === "main") {
    return new Response(
      JSON.stringify({ error: "missing function name in request" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const servicePath = `${FUNCTIONS_DIR}/${functionName}`;

  try {
    // Create (or reuse) an isolated worker for this function
    const worker = await (EdgeRuntime as any).userWorkers.create({
      servicePath,
      memoryLimitMb: 150,
      workerTimeoutMs: 5 * 60 * 1000,
      noModuleCache: false,
      envVars: Object.entries(Deno.env.toObject()),
      forceCreate: false,
      cpuTimeSoftLimitMs: 10000,
      cpuTimeHardLimitMs: 20000,
    });

    return await worker.fetch(req);
  } catch (e: any) {
    // Retry on worker retired
    if (e instanceof Deno.errors.WorkerAlreadyRetired) {
      try {
        const worker = await (EdgeRuntime as any).userWorkers.create({
          servicePath,
          memoryLimitMb: 150,
          workerTimeoutMs: 5 * 60 * 1000,
          noModuleCache: false,
          envVars: Object.entries(Deno.env.toObject()),
          forceCreate: true,
          cpuTimeSoftLimitMs: 10000,
          cpuTimeHardLimitMs: 20000,
        });
        return await worker.fetch(req);
      } catch (retryErr: any) {
        console.error(`[FlowPulse] Retry failed for ${functionName}:`, retryErr);
      }
    }

    console.error(`[FlowPulse] Error invoking ${functionName}:`, e);

    // Check if function directory doesn't exist
    const errorMsg = String(e);
    const status = errorMsg.includes("not found") || errorMsg.includes("No such file") ? 404 : 500;

    return new Response(
      JSON.stringify({
        error: `Failed to invoke function '${functionName}'`,
        details: errorMsg,
      }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
