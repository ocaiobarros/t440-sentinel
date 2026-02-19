import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ─── Crypto helpers (same as zabbix-connections) ─── */

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function deriveAesKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return crypto.subtle.importKey("raw", hexToBytes(secret), { name: "AES-GCM" }, false, usage);
  }
  const encoded = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, usage);
}

async function encryptToken(plaintext: string, encryptionKeyRaw: string) {
  const cryptoKey = await deriveAesKey(encryptionKeyRaw, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, cryptoKey, encoded);
  const arr = new Uint8Array(encrypted);
  return {
    ciphertext: bytesToHex(arr.slice(0, arr.length - 16)),
    iv: bytesToHex(iv),
    tag: bytesToHex(arr.slice(arr.length - 16)),
  };
}

async function decryptToken(ciphertext: string, iv: string, tag: string, encryptionKeyRaw: string): Promise<string> {
  const cryptoKey = await deriveAesKey(encryptionKeyRaw, ["decrypt"]);
  const combined = new Uint8Array(hexToBytes(ciphertext).length + hexToBytes(tag).length);
  combined.set(hexToBytes(ciphertext));
  combined.set(hexToBytes(tag), hexToBytes(ciphertext).length);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: hexToBytes(iv), tagLength: 128 }, cryptoKey, combined);
  return new TextDecoder().decode(decrypted);
}

/* ─── RMS API test ─── */

async function testRMSConnection(url: string, token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const testUrl = new URL(url);
    testUrl.searchParams.set("startDate", "2025-01-01");
    testUrl.searchParams.set("endDate", "2025-01-02");
    testUrl.searchParams.set("page", "1");
    testUrl.searchParams.set("pageSize", "1");

    const res = await fetch(testUrl.toString(), {
      headers: { "x-api-token": token, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    await res.json(); // consume body
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ─── Main ─── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const encryptionKey = Deno.env.get("ZABBIX_ENCRYPTION_KEY"); // reuse same key

  if (!encryptionKey) {
    return new Response(JSON.stringify({ error: "Encryption key not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = claimsData.claims.sub as string;
  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "list") {
      const { data, error } = await supabase
        .from("rms_connections")
        .select("id, name, url, is_active, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return json({ connections: data });
    }

    if (action === "create") {
      const { name, url, api_token } = body;
      if (!name || !url || !api_token) return json({ error: "name, url, api_token are required" }, 400);

      const { data: tenantId, error: tErr } = await supabase.rpc("get_user_tenant_id", { p_user_id: userId });
      if (tErr || !tenantId) return json({ error: "Tenant not found" }, 400);

      const encrypted = await encryptToken(api_token, encryptionKey);

      const { data: conn, error: insertErr } = await supabase
        .from("rms_connections")
        .insert({
          tenant_id: tenantId,
          name,
          url: url.replace(/\/+$/, ""),
          token_ciphertext: encrypted.ciphertext,
          token_iv: encrypted.iv,
          token_tag: encrypted.tag,
          created_by: userId,
        })
        .select("id, name, url, is_active, created_at")
        .single();

      if (insertErr) throw new Error(insertErr.message);
      return json({ connection: conn }, 201);
    }

    if (action === "update") {
      const { id, name, url, api_token, is_active } = body;
      if (!id) return json({ error: "id is required" }, 400);

      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (url !== undefined) updates.url = url.replace(/\/+$/, "");
      if (is_active !== undefined) updates.is_active = is_active;

      if (api_token) {
        const encrypted = await encryptToken(api_token, encryptionKey);
        updates.token_ciphertext = encrypted.ciphertext;
        updates.token_iv = encrypted.iv;
        updates.token_tag = encrypted.tag;
      }

      const { data: conn, error: updateErr } = await supabase
        .from("rms_connections")
        .update(updates)
        .eq("id", id)
        .select("id, name, url, is_active, updated_at")
        .single();

      if (updateErr) throw new Error(updateErr.message);
      return json({ connection: conn });
    }

    if (action === "delete") {
      const { id } = body;
      if (!id) return json({ error: "id is required" }, 400);
      const { error: delErr } = await supabase.from("rms_connections").delete().eq("id", id);
      if (delErr) throw new Error(delErr.message);
      return json({ deleted: true });
    }

    if (action === "test") {
      const { id, url, api_token } = body;

      let testUrl = url;
      let testToken = api_token;

      if (id) {
        const serviceRole = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
          auth: { persistSession: false },
        });

        // Verify tenant access
        const { data: connCheck } = await supabase.from("rms_connections").select("id").eq("id", id).single();
        if (!connCheck) return json({ error: "Connection not found" }, 404);

        const { data: conn } = await serviceRole
          .from("rms_connections")
          .select("url, token_ciphertext, token_iv, token_tag")
          .eq("id", id)
          .single();
        if (!conn) return json({ error: "Connection not found" }, 404);

        testUrl = conn.url;
        testToken = await decryptToken(conn.token_ciphertext, conn.token_iv, conn.token_tag, encryptionKey);
      }

      if (!testUrl || !testToken) return json({ error: "url and api_token required (or id for stored)" }, 400);

      const result = await testRMSConnection(testUrl, testToken);
      return json(result);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("rms-connections error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
