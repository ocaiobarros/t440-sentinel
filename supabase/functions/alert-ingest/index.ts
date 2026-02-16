import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ─── types ──────────────────────────────────────── */
interface IngestEvent {
  source: string;            // "zabbix"
  triggerid?: string;
  hostid?: string;
  hostgroupid?: string;
  host?: string;
  trigger_name?: string;
  severity?: string;         // "high", "disaster", etc.
  status?: string;           // "PROBLEM" | "OK" | "OK (3)" etc.
  value?: string;            // "1" = PROBLEM, "0" = OK
  title?: string;
  description?: string;
  zabbix_connection_id?: string;
  dashboard_id?: string;
  tags?: Record<string, string>;
  [key: string]: unknown;
}

interface AlertRule {
  id: string;
  tenant_id: string;
  source: string;
  matchers: Record<string, unknown>;
  dedupe_key_template: string;
  severity: string;
  auto_resolve: boolean;
  resolve_on_missing: boolean;
  is_enabled: boolean;
  escalation_policy_id: string | null;
  sla_policy_id: string | null;
  zabbix_connection_id: string | null;
  dashboard_id: string | null;
}

/* ─── helpers ────────────────────────────────────── */

/** Clean Zabbix status strings: "OK (3)" → "OK" */
function cleanStatus(raw?: string): string {
  if (!raw) return "";
  return raw.replace(/\s*\(.*\)$/, "").trim().toUpperCase();
}

/** True when event signals recovery */
function isOkEvent(evt: IngestEvent): boolean {
  const st = cleanStatus(evt.status);
  if (st === "OK" || st === "RESOLVED") return true;
  if (evt.value === "0") return true;
  return false;
}

/** Map Zabbix numeric severity (0-5) or string to our enum */
function mapSeverity(raw?: string): string {
  const map: Record<string, string> = {
    "0": "info",
    "1": "info",
    "2": "warning",
    "3": "average",
    "4": "high",
    "5": "disaster",
    info: "info",
    warning: "warning",
    average: "average",
    high: "high",
    disaster: "disaster",
  };
  return map[(raw ?? "").toLowerCase()] ?? "high";
}

/** Render dedupe key from template + payload.
 *  Template example: "{{source}}:{{triggerid}}"
 */
function renderDedupeKey(
  template: string,
  evt: IngestEvent,
  rule: AlertRule,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (key === "source") return evt.source ?? rule.source;
    if (key === "rule_id") return rule.id;
    return String((evt as Record<string, unknown>)[key] ?? "");
  });
}

/** Simple matcher: every key in matchers must equal the event field.
 *  Supports exact match and array-of-values ("any of").
 */
function matchesRule(rule: AlertRule, evt: IngestEvent): boolean {
  if (!rule.is_enabled) return false;
  if (rule.source !== evt.source) return false;
  if (
    rule.zabbix_connection_id &&
    evt.zabbix_connection_id &&
    rule.zabbix_connection_id !== evt.zabbix_connection_id
  )
    return false;

  const matchers = rule.matchers as Record<string, unknown>;
  for (const [key, expected] of Object.entries(matchers)) {
    const actual = (evt as Record<string, unknown>)[key];
    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
    } else if (String(expected) !== String(actual ?? "")) {
      return false;
    }
  }
  return true;
}

/* ─── main handler ───────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json();
    const events: IngestEvent[] = Array.isArray(body) ? body : [body];
    const results: Array<{ dedupe_key: string; action: string; alert_id?: string; error?: string }> = [];

    for (const evt of events) {
      try {
        const result = await processEvent(supabase, evt);
        results.push(result);
      } catch (err) {
        results.push({
          dedupe_key: evt.triggerid ?? "unknown",
          action: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("alert-ingest error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

/* ─── event processor ────────────────────────────── */

async function processEvent(
  supabase: ReturnType<typeof createClient>,
  evt: IngestEvent,
) {
  // 1. Fetch all enabled rules for this source
  const { data: rules, error: rulesErr } = await supabase
    .from("alert_rules")
    .select("*")
    .eq("source", evt.source ?? "zabbix")
    .eq("is_enabled", true);

  if (rulesErr) throw new Error(`rules fetch: ${rulesErr.message}`);
  if (!rules || rules.length === 0) {
    return { dedupe_key: "no-rule", action: "skipped_no_rule" };
  }

  // 2. Find first matching rule
  const rule = (rules as AlertRule[]).find((r) => matchesRule(r, evt));
  if (!rule) {
    return { dedupe_key: "no-match", action: "skipped_no_match" };
  }

  // 3. Build dedupe key
  const dedupeKey = renderDedupeKey(rule.dedupe_key_template, evt, rule);
  const severity = mapSeverity(evt.severity ?? rule.severity);
  const title = evt.title ?? evt.trigger_name ?? evt.description ?? dedupeKey;
  const isOk = isOkEvent(evt);

  // 4. Check maintenance
  const scope: Record<string, string> = {};
  if (evt.zabbix_connection_id) scope.zabbix_connection_id = evt.zabbix_connection_id;
  if (evt.dashboard_id ?? rule.dashboard_id) scope.dashboard_id = (evt.dashboard_id ?? rule.dashboard_id)!;
  if (evt.triggerid) scope.triggerid = evt.triggerid;
  if (evt.hostid) scope.hostid = evt.hostid;
  if (evt.hostgroupid) scope.hostgroupid = evt.hostgroupid;

  const { data: maintenanceId } = await supabase.rpc("is_in_maintenance", {
    p_tenant_id: rule.tenant_id,
    p_now: new Date().toISOString(),
    p_scope: scope,
  });

  const isSuppressed = !!maintenanceId;

  // 5. Check existing alert
  const { data: existing } = await supabase
    .from("alert_instances")
    .select("id, status, severity, title, suppressed")
    .eq("tenant_id", rule.tenant_id)
    .eq("dedupe_key", dedupeKey)
    .in("status", ["open", "ack"])
    .limit(1)
    .maybeSingle();

  // Build payload to store
  const eventPayload: Record<string, unknown> = { ...evt };
  delete eventPayload.source; // already tracked

  // ── CASE A: OK event → auto-resolve existing ──
  if (isOk) {
    if (!existing) {
      return { dedupe_key: dedupeKey, action: "ok_no_open_alert" };
    }
    if (!rule.auto_resolve) {
      return { dedupe_key: dedupeKey, action: "ok_auto_resolve_disabled", alert_id: existing.id };
    }

    // Resolve via direct update (service role, no auth context)
    const { error: resolveErr } = await supabase
      .from("alert_instances")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        payload: eventPayload,
      })
      .eq("id", existing.id);

    if (resolveErr) throw new Error(`resolve: ${resolveErr.message}`);

    // Write event
    await supabase.from("alert_events").insert({
      tenant_id: rule.tenant_id,
      alert_id: existing.id,
      event_type: "AUTO_RESOLVE",
      from_status: existing.status,
      to_status: "resolved",
      message: "Auto-resolved by OK event",
      payload: eventPayload,
    });

    // Broadcast
    await broadcastAlertUpdate(supabase, rule, existing.id, "resolved", severity, title);

    return { dedupe_key: dedupeKey, action: "auto_resolved", alert_id: existing.id };
  }

  // ── CASE B: PROBLEM event, existing alert → refresh ──
  if (existing) {
    const changes: Record<string, unknown> = {
      last_seen_at: new Date().toISOString(),
      payload: eventPayload,
      updated_at: new Date().toISOString(),
    };

    // Update severity/title if changed
    if (severity !== existing.severity) changes.severity = severity;
    if (title !== existing.title) changes.title = title;

    // Update suppression if status changed
    if (isSuppressed && !existing.suppressed) {
      changes.suppressed = true;
      changes.suppressed_by_maintenance_id = maintenanceId;
    } else if (!isSuppressed && existing.suppressed) {
      changes.suppressed = false;
      changes.suppressed_by_maintenance_id = null;
    }

    const { error: updateErr } = await supabase
      .from("alert_instances")
      .update(changes)
      .eq("id", existing.id);

    if (updateErr) throw new Error(`refresh: ${updateErr.message}`);

    // Write refresh event
    await supabase.from("alert_events").insert({
      tenant_id: rule.tenant_id,
      alert_id: existing.id,
      event_type: isSuppressed ? "REFRESH_SUPPRESSED" : "REFRESH",
      from_status: existing.status,
      to_status: existing.status,
      message: isSuppressed ? `Suppressed by maintenance ${maintenanceId}` : null,
      payload: eventPayload,
    });

    await broadcastAlertUpdate(supabase, rule, existing.id, existing.status, severity, title);

    return { dedupe_key: dedupeKey, action: isSuppressed ? "refreshed_suppressed" : "refreshed", alert_id: existing.id };
  }

  // ── CASE C: PROBLEM event, no existing alert → create ──
  const { data: newAlert, error: insertErr } = await supabase
    .from("alert_instances")
    .insert({
      tenant_id: rule.tenant_id,
      dedupe_key: dedupeKey,
      title,
      severity,
      status: "open",
      rule_id: rule.id,
      payload: eventPayload,
      suppressed: isSuppressed,
      suppressed_by_maintenance_id: maintenanceId ?? null,
    })
    .select("id")
    .single();

  if (insertErr) throw new Error(`insert: ${insertErr.message}`);

  // Write open event
  await supabase.from("alert_events").insert({
    tenant_id: rule.tenant_id,
    alert_id: newAlert.id,
    event_type: isSuppressed ? "OPEN_SUPPRESSED" : "OPEN",
    from_status: null,
    to_status: "open",
    message: isSuppressed ? `Suppressed by maintenance ${maintenanceId}` : "New alert opened",
    payload: eventPayload,
  });

  // Broadcast
  await broadcastAlertUpdate(supabase, rule, newAlert.id, "open", severity, title);

  // 6. Materialize escalation notifications (if not suppressed and policy exists)
  if (!isSuppressed && rule.escalation_policy_id) {
    await materializeEscalation(supabase, rule, newAlert.id);
  }

  return {
    dedupe_key: dedupeKey,
    action: isSuppressed ? "opened_suppressed" : "opened",
    alert_id: newAlert.id,
  };
}

/* ─── escalation materializer ────────────────────── */

async function materializeEscalation(
  supabase: ReturnType<typeof createClient>,
  rule: AlertRule,
  alertId: string,
) {
  const { data: steps, error } = await supabase
    .from("escalation_steps")
    .select("*")
    .eq("policy_id", rule.escalation_policy_id!)
    .eq("tenant_id", rule.tenant_id)
    .eq("enabled", true)
    .order("step_order", { ascending: true });

  if (error || !steps || steps.length === 0) return;

  const now = new Date();
  const notifications = steps.map((step) => {
    const nextAttempt = new Date(now.getTime() + step.delay_seconds * 1000);
    return {
      tenant_id: rule.tenant_id,
      alert_id: alertId,
      policy_id: rule.escalation_policy_id,
      step_id: step.id,
      channel_id: step.channel_id,
      status: "pending",
      next_attempt_at: nextAttempt.toISOString(),
      request: { target: step.target, throttle_seconds: step.throttle_seconds },
      response: {},
    };
  });

  const { error: insertErr } = await supabase
    .from("alert_notifications")
    .insert(notifications);

  if (insertErr) {
    console.error("Failed to materialize escalation:", insertErr.message);
  }
}

/* ─── realtime broadcast ─────────────────────────── */

async function broadcastAlertUpdate(
  supabase: ReturnType<typeof createClient>,
  rule: AlertRule,
  alertId: string,
  status: string,
  severity: string,
  title: string,
) {
  try {
    const channel = rule.dashboard_id
      ? `dashboard:${rule.dashboard_id}`
      : `tenant:${rule.tenant_id}`;

    await supabase.channel(channel).send({
      type: "broadcast",
      event: "ALERT_UPDATE",
      payload: {
        alert_id: alertId,
        status,
        severity,
        title,
        ts: new Date().toISOString(),
        rule_id: rule.id,
        dashboard_id: rule.dashboard_id,
      },
    });
  } catch (err) {
    console.error("broadcast error:", err);
  }
}
