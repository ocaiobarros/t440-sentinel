import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Send, Bot, Shield, Bell, MessageSquare, Wifi, Cpu, UserPlus, Save, Link2, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

function useTenantId() {
  const { user } = useAuth();
  return (user?.app_metadata as Record<string, string> | undefined)?.tenant_id ?? null;
}

interface TelegramConfig {
  bot_token: string;
  chat_id: string;
  notify_bgp_down: boolean;
  notify_high_cpu: boolean;
  notify_admin_login: boolean;
  interactive_mode: boolean;
}

const DEFAULT_CONFIG: TelegramConfig = {
  bot_token: "",
  chat_id: "",
  notify_bgp_down: true,
  notify_high_cpu: true,
  notify_admin_login: false,
  interactive_mode: false,
};

export default function TelegramSettings() {
  const { t } = useTranslation();
  const tenantId = useTenantId();
  const [config, setConfig] = useState<TelegramConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [webhookActive, setWebhookActive] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    loadConfig();
  }, [tenantId]);

  const loadConfig = async () => {
    const { data } = await supabase
      .from("telemetry_config")
      .select("config_key, config_value")
      .eq("tenant_id", tenantId!)
      .in("config_key", [
        "telegram_bot_token",
        "telegram_chat_id",
        "telegram_notify_bgp_down",
        "telegram_notify_high_cpu",
        "telegram_notify_admin_login",
        "telegram_interactive_mode",
        "telegram_webhook_active",
      ]);

    if (data && data.length > 0) {
      const map = Object.fromEntries(data.map((r) => [r.config_key, r.config_value]));
      setConfig({
        bot_token: map.telegram_bot_token || "",
        chat_id: map.telegram_chat_id || "",
        notify_bgp_down: map.telegram_notify_bgp_down !== "false",
        notify_high_cpu: map.telegram_notify_high_cpu !== "false",
        notify_admin_login: map.telegram_notify_admin_login === "true",
        interactive_mode: map.telegram_interactive_mode === "true",
      });
      setWebhookActive(map.telegram_webhook_active === "true");
    }
  };

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const entries = [
        { config_key: "telegram_bot_token", config_value: config.bot_token },
        { config_key: "telegram_chat_id", config_value: config.chat_id },
        { config_key: "telegram_notify_bgp_down", config_value: String(config.notify_bgp_down) },
        { config_key: "telegram_notify_high_cpu", config_value: String(config.notify_high_cpu) },
        { config_key: "telegram_notify_admin_login", config_value: String(config.notify_admin_login) },
        { config_key: "telegram_interactive_mode", config_value: String(config.interactive_mode) },
      ];

      for (const entry of entries) {
        await supabase
          .from("telemetry_config")
          .upsert(
            { tenant_id: tenantId, config_key: entry.config_key, config_value: entry.config_value },
            { onConflict: "tenant_id,config_key" }
          );
      }
      toast.success("Configurações do Telegram salvas!");
    } catch {
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const { error } = await supabase.functions.invoke("telegram-bot", {
        body: { action: "test_telegram", bot_token: config.bot_token, chat_id: config.chat_id },
      });
      if (error) throw error;
      toast.success("Mensagem de teste enviada!");
    } catch {
      toast.error("Falha ao enviar teste. Verifique Token e Chat ID.");
    } finally {
      setTesting(false);
    }
  };

  const handleSetWebhook = async () => {
    setSettingWebhook(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const webhookUrl = `https://${projectId}.supabase.co/functions/v1/telegram-bot`;

      const { data, error } = await supabase.functions.invoke("telegram-bot", {
        body: { action: "set_webhook", bot_token: config.bot_token, webhook_url: webhookUrl },
      });
      if (error) throw error;
      if (data?.ok || data?.result) {
        // Save webhook state
        await supabase
          .from("telemetry_config")
          .upsert(
            { tenant_id: tenantId!, config_key: "telegram_webhook_active", config_value: "true" },
            { onConflict: "tenant_id,config_key" }
          );
        setWebhookActive(true);
        toast.success("Webhook ativado! O bot agora responde a comandos.");
      } else {
        throw new Error(JSON.stringify(data));
      }
    } catch (err) {
      toast.error("Falha ao configurar webhook.");
      console.error(err);
    } finally {
      setSettingWebhook(false);
    }
  };

  const update = (key: keyof TelegramConfig, value: string | boolean) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="min-h-screen p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold tracking-wide text-foreground flex items-center gap-2">
          <Bot className="w-6 h-6 text-primary" />
          Configuração do Telegram
        </h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          Conecte o FLOWPULSE ao Telegram para alertas e comandos interativos
        </p>
      </div>

      {/* Credentials Card */}
      <Card className="glass-card border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Credenciais do Bot
          </CardTitle>
          <CardDescription className="text-xs font-mono">
            Obtenha o Bot Token via @BotFather no Telegram
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-mono text-muted-foreground">Bot Token</Label>
            <Input
              type="password"
              placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
              value={config.bot_token}
              onChange={(e) => update("bot_token", e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-mono text-muted-foreground">Chat ID</Label>
            <Input
              placeholder="-1001234567890"
              value={config.chat_id}
              onChange={(e) => update("chat_id", e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground/60">
              Use @userinfobot ou @RawDataBot para descobrir o Chat ID
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing || !config.bot_token || !config.chat_id}
              className="gap-2 font-mono text-xs"
            >
              <Send className="w-3 h-3" />
              {testing ? "Enviando…" : "Enviar Teste"}
            </Button>
            <Button
              variant={webhookActive ? "secondary" : "default"}
              size="sm"
              onClick={handleSetWebhook}
              disabled={settingWebhook || !config.bot_token}
              className="gap-2 font-mono text-xs"
            >
              {webhookActive ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              ) : (
                <Link2 className="w-3 h-3" />
              )}
              {settingWebhook ? "Ativando…" : webhookActive ? "Webhook Ativo" : "Ativar Webhook"}
            </Button>
          </div>
          {webhookActive && (
            <div className="flex items-center gap-2 text-[10px] text-emerald-500/80 font-mono">
              <CheckCircle2 className="w-3 h-3" />
              Bot recebendo comandos via webhook
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification Toggles */}
      <Card className="glass-card border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            Notificações
          </CardTitle>
          <CardDescription className="text-xs font-mono">
            Escolha quais eventos disparam alertas no Telegram
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: "notify_bgp_down" as const, icon: Wifi, label: "Queda de Sessão BGP", desc: "Alerta quando uma sessão BGP cai" },
            { key: "notify_high_cpu" as const, icon: Cpu, label: "CPU Alta (>90%)", desc: "Alerta quando CPU ultrapassa 90%" },
            { key: "notify_admin_login" as const, icon: UserPlus, label: "Login de Administrador", desc: "Notifica novo login com role admin" },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center">
                  <item.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                </div>
              </div>
              <Switch
                checked={config[item.key] as boolean}
                onCheckedChange={(v) => update(item.key, v)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Interactive Mode */}
      <Card className="glass-card border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            Modo Interativo
          </CardTitle>
          <CardDescription className="text-xs font-mono">
            Permita que o bot responda a comandos no chat
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-foreground">Habilitar Comandos de Chat</p>
              <p className="text-[10px] text-muted-foreground">
                O bot responderá a <code className="text-primary">/status</code>,{" "}
                <code className="text-primary">/flowmaps</code> e{" "}
                <code className="text-primary">/help</code>
              </p>
            </div>
            <Switch
              checked={config.interactive_mode}
              onCheckedChange={(v) => update("interactive_mode", v)}
            />
          </div>

          {config.interactive_mode && (
            <div className="rounded-md bg-accent/50 border border-border/30 p-3 space-y-1.5">
              <p className="text-[10px] font-display uppercase text-muted-foreground tracking-wider">
                Comandos disponíveis
              </p>
              {[
                { cmd: "/status", desc: "Resumo geral do NOC (hosts up/down, alertas ativos)" },
                { cmd: "/flowmaps", desc: "Navega mapas → links → gráfico de tráfego" },
                { cmd: "/help", desc: "Lista de comandos disponíveis" },
              ].map((c) => (
                <div key={c.cmd} className="flex gap-2 items-baseline">
                  <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/30">
                    {c.cmd}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{c.desc}</span>
                </div>
              ))}
              {!webhookActive && (
                <div className="flex items-center gap-1.5 mt-2 text-[10px] text-amber-500/80">
                  <AlertTriangle className="w-3 h-3" />
                  Ative o Webhook acima para que os comandos funcionem
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2 font-mono text-xs">
          <Save className="w-4 h-4" />
          {saving ? "Salvando…" : "Salvar Configurações"}
        </Button>
      </div>
    </div>
  );
}
