import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ─── Helpers ────────────────────────────────────── */

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

/** Derive a valid 256-bit AES key from any string (hex or passphrase) */
async function deriveAesKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  // If it's a valid 64-char hex string (256-bit), use directly
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return crypto.subtle.importKey("raw", hexToBytes(secret), { name: "AES-GCM" }, false, usage);
  }
  // Otherwise, SHA-256 hash it to get exactly 32 bytes
  const encoded = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, usage);
}

async function encryptPassword(
  plaintext: string,
  encryptionKeyRaw: string,
): Promise<{ ciphertext: string; iv: string; tag: string }> {
  const cryptoKey = await deriveAesKey(encryptionKeyRaw, ["encrypt"]);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 }, cryptoKey, encoded,
  );

  const encryptedArray = new Uint8Array(encrypted);
  // Last 16 bytes are the auth tag
  const ciphertextBytes = encryptedArray.slice(0, encryptedArray.length - 16);
  const tagBytes = encryptedArray.slice(encryptedArray.length - 16);

  return {
    ciphertext: bytesToHex(ciphertextBytes),
    iv: bytesToHex(iv),
    tag: bytesToHex(tagBytes),
  };
}

async function decryptPassword(
  ciphertext: string, iv: string, tag: string, encryptionKeyRaw: string,
): Promise<string> {
  const cryptoKey = await deriveAesKey(encryptionKeyRaw, ["decrypt"]);
  const ivBytes = hexToBytes(iv);
  const ciphertextBytes = hexToBytes(ciphertext);
  const tagBytes = hexToBytes(tag);
  const combined = new Uint8Array(ciphertextBytes.length + tagBytes.length);
  combined.set(ciphertextBytes);
  combined.set(tagBytes, ciphertextBytes.length);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes, tagLength: 128 }, cryptoKey, combined,
  );
  return new TextDecoder().decode(decrypted);
}

/* ─── Zabbix test ────────────────────────────────── */

async function testZabbixConnection(url: string, username: string, password: string): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    // Try apiinfo.version first (no auth needed)
    const vRes = await fetch(`${url}/api_jsonrpc.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "apiinfo.version", params: [], id: 1 }),
    });
    const vData = await vRes.json();
    const version = vData.result ?? "unknown";

    // Try login
    const lRes = await fetch(`${url}/api_jsonrpc.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "user.login", params: { username, password }, id: 2 }),
    });
    const lData = await lRes.json();
    if (lData.error) {
      return { ok: false, version, error: `Login failed: ${lData.error.data ?? lData.error.message}` };
    }

    // Logout
    await fetch(`${url}/api_jsonrpc.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "user.logout", params: [], auth: lData.result, id: 3 }),
    });

    return { ok: true, version };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ─── Main ───────────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const encryptionKey = Deno.env.get("ZABBIX_ENCRYPTION_KEY");

  if (!encryptionKey) {
    return new Response(
      JSON.stringify({ error: "ZABBIX_ENCRYPTION_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    console.error("auth error:", userErr?.message ?? "no user");
    return new Response(
      JSON.stringify({ error: "Invalid token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const userId = user.id;
  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "list") {
      const { data, error } = await supabase
        .from("zabbix_connections")
        .select("id, name, url, username, is_active, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return json({ connections: data });
    }

    if (action === "create") {
      const { name, url, username, password } = body;
      if (!name || !url || !username || !password) {
        return json({ error: "name, url, username, password are required" }, 400);
      }

      // Get user's tenant
      const { data: tenantId, error: tErr } = await supabase.rpc("get_user_tenant_id", { p_user_id: userId });
      if (tErr || !tenantId) return json({ error: "Tenant not found" }, 400);

      const encrypted = await encryptPassword(password, encryptionKey);

      const { data: conn, error: insertErr } = await supabase
        .from("zabbix_connections")
        .insert({
          tenant_id: tenantId,
          name,
          url: url.replace(/\/+$/, ""), // trim trailing slashes
          username,
          password_ciphertext: encrypted.ciphertext,
          password_iv: encrypted.iv,
          password_tag: encrypted.tag,
          created_by: userId,
        })
        .select("id, name, url, username, is_active, created_at")
        .maybeSingle();

      if (insertErr) throw new Error(insertErr.message);
      if (!conn) return json({ error: "Failed to create connection (RLS)" }, 403);
      return json({ connection: conn }, 201);
    }

    if (action === "update") {
      const { id, name, url, username, password, is_active } = body;
      if (!id) return json({ error: "id is required" }, 400);

      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (url !== undefined) updates.url = url.replace(/\/+$/, "");
      if (username !== undefined) updates.username = username;
      if (is_active !== undefined) updates.is_active = is_active;

      if (password) {
        const encrypted = await encryptPassword(password, encryptionKey);
        updates.password_ciphertext = encrypted.ciphertext;
        updates.password_iv = encrypted.iv;
        updates.password_tag = encrypted.tag;
      }

      const { data: conn, error: updateErr } = await supabase
        .from("zabbix_connections")
        .update(updates)
        .eq("id", id)
        .select("id, name, url, username, is_active, updated_at")
        .maybeSingle();

      if (updateErr) throw new Error(updateErr.message);
      if (!conn) return json({ error: "Connection not found or access denied" }, 404);
      return json({ connection: conn });
    }

    if (action === "delete") {
      const { id } = body;
      if (!id) return json({ error: "id is required" }, 400);
      const { error: delErr } = await supabase
        .from("zabbix_connections")
        .delete()
        .eq("id", id);
      if (delErr) throw new Error(delErr.message);
      return json({ deleted: true });
    }

    if (action === "test") {
      const { id, url, username, password } = body;

      let testUrl = url;
      let testUser = username;
      let testPass = password;

      // If id provided, decrypt stored password
      if (id) {
        const serviceRole = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
          auth: { persistSession: false },
        });

        // Verify tenant access via user's supabase client
        const { data: connCheck } = await supabase
          .from("zabbix_connections")
          .select("id")
          .eq("id", id)
          .maybeSingle();
        if (!connCheck) return json({ error: "Connection not found" }, 404);

        // Fetch full record with service role
        const { data: conn } = await serviceRole
          .from("zabbix_connections")
          .select("url, username, password_ciphertext, password_iv, password_tag")
          .eq("id", id)
          .maybeSingle();
        if (!conn) return json({ error: "Connection not found" }, 404);

        testUrl = conn.url;
        testUser = conn.username;
        testPass = await decryptPassword(
          conn.password_ciphertext, conn.password_iv, conn.password_tag, encryptionKey,
        );
      }

      if (!testUrl || !testUser || !testPass) {
        return json({ error: "url, username, password required (or id for stored connection)" }, 400);
      }

      const result = await testZabbixConnection(testUrl, testUser, testPass);
      return json(result);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("zabbix-connections error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
