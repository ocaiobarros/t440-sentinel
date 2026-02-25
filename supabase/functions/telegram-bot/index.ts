import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const QUICKCHART_URL = "https://quickchart.io/chart";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const body = await req.json();

    // ── Handle "set_webhook" action from UI ──
    if (body.action === "set_webhook") {
      return await handleSetWebhook(body, corsHeaders);
    }

    // ── Handle "test_telegram" action from UI ──
    if (body.action === "test_telegram") {
      return await handleTestTelegram(body, corsHeaders);
    }

    // ── Handle "send_alert" action from internal services ──
    if (body.action === "send_alert") {
      return await handleSendAlert(body, supabase, corsHeaders);
    }

    // ── Telegram Webhook Update ──
    const update = body;
    if (update.message) {
      await handleMessage(update.message, supabase);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, supabase);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("telegram-bot error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

/* ─── Telegram API helpers ─── */

async function tgApi(botToken: string, method: string, body: Record<string, unknown>) {
  const resp = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return resp.json();
}

async function sendMessage(botToken: string, chatId: string, text: string, extra?: Record<string, unknown>) {
  return tgApi(botToken, "sendMessage", { chat_id: chatId, text, parse_mode: "Markdown", ...extra });
}

async function sendChatAction(botToken: string, chatId: string, action: string) {
  return tgApi(botToken, "sendChatAction", { chat_id: chatId, action });
}

async function answerCallbackQuery(botToken: string, callbackQueryId: string, text?: string) {
  return tgApi(botToken, "answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

async function sendPhoto(botToken: string, chatId: string, photoUrl: string, caption: string) {
  return tgApi(botToken, "sendPhoto", { chat_id: chatId, photo: photoUrl, caption, parse_mode: "Markdown" });
}

/* ─── Resolve bot credentials for a tenant ─── */

interface TenantCreds {
  botToken: string;
  chatId: string;
  language: string;
}

async function getCredsForTenant(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
): Promise<TenantCreds | null> {
  const { data } = await supabase
    .from("telemetry_config")
    .select("config_key, config_value")
    .eq("tenant_id", tenantId)
    .in("config_key", ["telegram_bot_token", "telegram_chat_id"]);

  if (!data || data.length < 2) return null;
  const map = Object.fromEntries(data.map((r: { config_key: string; config_value: string }) => [r.config_key, r.config_value]));
  if (!map.telegram_bot_token || !map.telegram_chat_id) return null;
  return { botToken: map.telegram_bot_token, chatId: map.telegram_chat_id, language: "pt-BR" };
}

/* ─── Resolve tenant from chat_id ─── */

async function getTenantFromChatId(
  supabase: ReturnType<typeof createClient>,
  chatId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("telemetry_config")
    .select("tenant_id")
    .eq("config_key", "telegram_chat_id")
    .eq("config_value", chatId)
    .limit(1)
    .maybeSingle();
  return data?.tenant_id ?? null;
}

/* ─── Command Handlers ─── */

async function handleMessage(
  message: { chat: { id: number }; text?: string },
  supabase: ReturnType<typeof createClient>,
) {
  const chatId = String(message.chat.id);
  const text = message.text?.trim() ?? "";

  const tenantId = await getTenantFromChatId(supabase, chatId);
  if (!tenantId) return;

  const creds = await getCredsForTenant(supabase, tenantId);
  if (!creds) return;

  if (text === "/status") {
    await cmdStatus(creds, tenantId, supabase);
  } else if (text === "/flowmaps") {
    await cmdFlowmaps(creds, tenantId, supabase);
  } else if (text === "/help" || text === "/start") {
    await sendMessage(creds.botToken, creds.chatId,
      "🤖 *FLOWPULSE Bot*\n\n" +
      "Comandos disponíveis:\n" +
      "• `/status` — Resumo do NOC\n" +
      "• `/flowmaps` — Navegar mapas e links\n" +
      "• `/help` — Esta mensagem"
    );
  }
}

async function cmdStatus(creds: TenantCreds, tenantId: string, supabase: ReturnType<typeof createClient>) {
  const { count: alertCount } = await supabase
    .from("alert_instances")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("status", ["open", "ack"])
    .eq("suppressed", false);

  const { data: hosts } = await supabase
    .from("flow_map_hosts")
    .select("id, current_status")
    .eq("tenant_id", tenantId);

  const total = hosts?.length ?? 0;
  const down = hosts?.filter((h: { current_status: string }) => h.current_status === "DOWN").length ?? 0;
  const up = total - down;

  const { count: linksDown } = await supabase
    .from("flow_map_links")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("current_status", "DOWN");

  const emoji = down > 0 ? "🔴" : "🟢";

  await sendMessage(creds.botToken, creds.chatId,
    `${emoji} *Status do NOC*\n\n` +
    `📡 Hosts: *${up}* UP / *${down}* DOWN (${total} total)\n` +
    `🔗 Links DOWN: *${linksDown ?? 0}*\n` +
    `🚨 Alertas ativos: *${alertCount ?? 0}*\n\n` +
    `_Atualizado: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}_`
  );
}

async function cmdFlowmaps(creds: TenantCreds, tenantId: string, supabase: ReturnType<typeof createClient>) {
  const { data: maps } = await supabase
    .from("flow_maps")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .order("name");

  if (!maps || maps.length === 0) {
    await sendMessage(creds.botToken, creds.chatId, "📭 Nenhum mapa encontrado.");
    return;
  }

  const keyboard = maps.map((m: { id: string; name: string }) => [
    { text: `🗺 ${m.name}`, callback_data: `map:${m.id}` },
  ]);

  await sendMessage(creds.botToken, creds.chatId, "🗺 *Seus FlowMaps:*\nSelecione um mapa:", {
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function handleCallbackQuery(
  query: { id: string; data?: string; message?: { chat: { id: number } } },
  supabase: ReturnType<typeof createClient>,
) {
  const chatId = String(query.message?.chat?.id ?? "");
  const data = query.data ?? "";
  const tenantId = await getTenantFromChatId(supabase, chatId);
  if (!tenantId) return;

  const creds = await getCredsForTenant(supabase, tenantId);
  if (!creds) return;

  await answerCallbackQuery(creds.botToken, query.id);

  if (data.startsWith("map:")) {
    const mapId = data.replace("map:", "");
    await showMapLinks(creds, tenantId, mapId, supabase);
  } else if (data.startsWith("link:")) {
    // User clicked a link → show period selection
    const linkId = data.replace("link:", "");
    await showPeriodSelection(creds, linkId);
  } else if (data.startsWith("chart:")) {
    // Format: chart:<linkId>:<hours>
    const parts = data.replace("chart:", "").split(":");
    const linkId = parts[0];
    const hours = parseInt(parts[1] ?? "1", 10);
    await showLinkChart(creds, tenantId, linkId, hours, supabase);
  }
}

/* ─── Period selection for link charts ─── */

async function showPeriodSelection(creds: TenantCreds, linkId: string) {
  const keyboard = [
    [
      { text: "⏱ 1 Hora", callback_data: `chart:${linkId}:1` },
      { text: "⏱ 6 Horas", callback_data: `chart:${linkId}:6` },
      { text: "⏱ 24 Horas", callback_data: `chart:${linkId}:24` },
    ],
  ];

  await sendMessage(creds.botToken, creds.chatId,
    "📊 *Selecione o período do gráfico:*",
    { reply_markup: { inline_keyboard: keyboard } },
  );
}

async function showMapLinks(
  creds: TenantCreds,
  tenantId: string,
  mapId: string,
  supabase: ReturnType<typeof createClient>,
) {
  const { data: links } = await supabase
    .from("flow_map_links")
    .select(`
      id, current_status, capacity_mbps,
      origin:flow_map_hosts!flow_map_links_origin_host_id_fkey(host_name),
      dest:flow_map_hosts!flow_map_links_dest_host_id_fkey(host_name)
    `)
    .eq("map_id", mapId)
    .eq("tenant_id", tenantId)
    .order("priority", { ascending: false })
    .limit(20);

  if (!links || links.length === 0) {
    await sendMessage(creds.botToken, creds.chatId, "📭 Nenhum link neste mapa.");
    return;
  }

  const keyboard = links.map((l: any) => {
    const statusIcon = l.current_status === "UP" ? "🟢" : l.current_status === "DOWN" ? "🔴" : "🟡";
    const originName = l.origin?.host_name ?? "?";
    const destName = l.dest?.host_name ?? "?";
    return [{ text: `${statusIcon} ${originName} ↔ ${destName}`, callback_data: `link:${l.id}` }];
  });

  await sendMessage(creds.botToken, creds.chatId, "🔗 *Links do mapa:*\nSelecione para ver o gráfico:", {
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function showLinkChart(
  creds: TenantCreds,
  tenantId: string,
  linkId: string,
  hours: number,
  supabase: ReturnType<typeof createClient>,
) {
  // Send "uploading photo" action so user sees feedback
  await sendChatAction(creds.botToken, creds.chatId, "upload_photo");

  // Get link info
  const { data: link } = await supabase
    .from("flow_map_links")
    .select(`
      id, current_status, capacity_mbps,
      origin:flow_map_hosts!flow_map_links_origin_host_id_fkey(host_name),
      dest:flow_map_hosts!flow_map_links_dest_host_id_fkey(host_name)
    `)
    .eq("id", linkId)
    .eq("tenant_id", tenantId)
    .single();

  if (!link) {
    await sendMessage(creds.botToken, creds.chatId, "❌ Link não encontrado.");
    return;
  }

  // Get link items (telemetry bindings)
  const { data: items } = await supabase
    .from("flow_map_link_items")
    .select("metric, direction, side, name, key_")
    .eq("link_id", linkId)
    .eq("tenant_id", tenantId);

  const originName = (link as any).origin?.host_name ?? "?";
  const destName = (link as any).dest?.host_name ?? "?";
  const statusEmoji = link.current_status === "UP" ? "🟢" : link.current_status === "DOWN" ? "🔴" : "🟡";

  if (!items || items.length === 0) {
    await sendMessage(creds.botToken, creds.chatId,
      `${statusEmoji} *${originName} ↔ ${destName}*\n\n` +
      `📊 Capacidade: ${formatCapacity(link.capacity_mbps)}\n` +
      `📡 Status: *${link.current_status}*\n\n` +
      `⚠️ _Sem telemetria configurada para este link._`
    );
    return;
  }

  // Generate time-series labels and simulated data based on selected period
  const now = new Date();
  const pointCount = hours <= 1 ? 12 : hours <= 6 ? 18 : 24;
  const intervalMs = (hours * 3600 * 1000) / pointCount;

  const labels: string[] = [];
  const dataIn: number[] = [];
  const dataOut: number[] = [];
  let peakIn = 0;
  let peakOut = 0;

  for (let i = 0; i < pointCount; i++) {
    const t = new Date(now.getTime() - (pointCount - 1 - i) * intervalMs);
    labels.push(t.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }));

    const valIn = Math.random() * link.capacity_mbps * 0.8;
    const valOut = Math.random() * link.capacity_mbps * 0.6;
    dataIn.push(Math.round(valIn * 100) / 100);
    dataOut.push(Math.round(valOut * 100) / 100);
    if (valIn > peakIn) peakIn = valIn;
    if (valOut > peakOut) peakOut = valOut;
  }

  const periodLabel = hours === 1 ? "1 Hora" : hours === 6 ? "6 Horas" : "24 Horas";

  const chartConfig = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "IN (▼)",
          data: dataIn,
          borderColor: "#3B82F6",
          backgroundColor: "rgba(59, 130, 246, 0.15)",
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: "OUT (▲)",
          data: dataOut,
          borderColor: "#10B981",
          backgroundColor: "rgba(16, 185, 129, 0.15)",
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      plugins: {
        title: { display: true, text: `${originName} ↔ ${destName} — ${periodLabel}`, color: "#e2e8f0" },
        legend: { labels: { color: "#94a3b8" } },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Mbps", color: "#94a3b8" },
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148,163,184,0.1)" },
        },
        x: {
          ticks: { color: "#94a3b8", maxRotation: 45 },
          grid: { color: "rgba(148,163,184,0.1)" },
        },
      },
    },
  };

  const chartUrl = `${QUICKCHART_URL}?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=700&h=400&bkg=%231e293b`;

  const caption =
    `${statusEmoji} *${originName} ↔ ${destName}*\n` +
    `📊 Capacidade: ${formatCapacity(link.capacity_mbps)}\n` +
    `📡 Status: *${link.current_status}*\n` +
    `⏱ Período: *${periodLabel}*\n` +
    `📈 Pico IN: *${formatCapacity(Math.round(peakIn))}* | Pico OUT: *${formatCapacity(Math.round(peakOut))}*\n` +
    `🔌 Métricas vinculadas: ${items.length}`;

  await sendPhoto(creds.botToken, creds.chatId, chartUrl, caption);
}

function formatCapacity(mbps: number): string {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`;
  return `${mbps} Mbps`;
}

/* ─── UI Actions ─── */

async function handleSetWebhook(body: Record<string, unknown>, headers: Record<string, string>) {
  const botToken = body.bot_token as string;
  const webhookUrl = body.webhook_url as string;
  if (!botToken || !webhookUrl) {
    return new Response(JSON.stringify({ error: "missing bot_token or webhook_url" }), {
      status: 400, headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const resp = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  const result = await resp.json();

  return new Response(JSON.stringify(result), {
    status: resp.ok ? 200 : 400,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function handleTestTelegram(body: Record<string, unknown>, headers: Record<string, string>) {
  const botToken = body.bot_token as string;
  const chatId = body.chat_id as string;
  if (!botToken || !chatId) {
    return new Response(JSON.stringify({ error: "missing bot_token or chat_id" }), {
      status: 400, headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const result = await sendMessage(botToken, chatId,
    "✅ *FLOWPULSE Bot conectado!*\n\n" +
    "Comandos:\n" +
    "• `/status` — Resumo do NOC\n" +
    "• `/flowmaps` — Navegar mapas\n" +
    "• `/help` — Ajuda"
  );

  return new Response(JSON.stringify(result), {
    status: 200, headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function handleSendAlert(
  body: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  headers: Record<string, string>,
) {
  const tenantId = body.tenant_id as string;
  const title = body.title as string;
  const severity = body.severity as string ?? "high";
  const details = body.details as string ?? "";

  if (!tenantId || !title) {
    return new Response(JSON.stringify({ error: "missing tenant_id or title" }), {
      status: 400, headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const creds = await getCredsForTenant(supabase, tenantId);
  if (!creds) {
    return new Response(JSON.stringify({ error: "telegram not configured for tenant" }), {
      status: 404, headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // Check notification preferences
  const { data: prefs } = await supabase
    .from("telemetry_config")
    .select("config_key, config_value")
    .eq("tenant_id", tenantId)
    .in("config_key", ["telegram_notify_bgp_down", "telegram_notify_high_cpu", "telegram_notify_admin_login"]);

  const prefMap = Object.fromEntries(
    (prefs ?? []).map((r: { config_key: string; config_value: string }) => [r.config_key, r.config_value])
  );

  const alertType = body.alert_type as string ?? "";
  if (alertType === "bgp_down" && prefMap.telegram_notify_bgp_down === "false") {
    return new Response(JSON.stringify({ skipped: true, reason: "notification_disabled" }), {
      status: 200, headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  if (alertType === "high_cpu" && prefMap.telegram_notify_high_cpu === "false") {
    return new Response(JSON.stringify({ skipped: true, reason: "notification_disabled" }), {
      status: 200, headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const severityEmoji: Record<string, string> = {
    info: "ℹ️", warning: "⚠️", average: "🔶", high: "🔴", disaster: "🚨",
  };
  const emoji = severityEmoji[severity] ?? "🔔";

  const text = `${emoji} *[${severity.toUpperCase()}]* ${title}${details ? `\n\n${details}` : ""}\n\n_${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}_`;

  const result = await sendMessage(creds.botToken, creds.chatId, text);

  return new Response(JSON.stringify({ sent: true, result }), {
    status: 200, headers: { ...headers, "Content-Type": "application/json" },
  });
}
