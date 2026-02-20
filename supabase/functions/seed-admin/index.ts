import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ADMIN_EMAIL = "admin@flowpulse.local";
const ADMIN_DEFAULT_PASSWORD = "admin";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if any profiles exist — only seed if DB is empty
    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id")
      .limit(1);

    if (profilesError) {
      return new Response(JSON.stringify({ error: profilesError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profiles && profiles.length > 0) {
      return new Response(
        JSON.stringify({ message: "Admin já existe. Seed ignorado.", seeded: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the master admin user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "Administrador" },
    });

    if (createError || !newUser.user) {
      return new Response(
        JSON.stringify({ error: createError?.message || "Failed to create admin user" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // The handle_new_user trigger will auto-create profile + tenant + admin role
    // We also need to make this user a super_admin by updating the email used in is_super_admin()
    // The is_super_admin function checks for 'caio.barros@madeplant.com.br' — 
    // we'll update the profile email to match so is_super_admin works, 
    // OR we update the function. For now, let the trigger handle it.

    return new Response(
      JSON.stringify({
        message: `Admin seed criado: ${ADMIN_EMAIL} / ${ADMIN_DEFAULT_PASSWORD}`,
        seeded: true,
        user_id: newUser.user.id,
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
