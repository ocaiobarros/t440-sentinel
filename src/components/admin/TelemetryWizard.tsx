import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Radio,
  MessageSquare,
  Shield,
  ChevronRight,
  ChevronLeft,
  Zap,
  RefreshCw,
} from "lucide-react";

type StepStatus = "idle" | "loading" | "success" | "error";

interface ChatOption {
  id: number | string;
  title: string;
  type: string;
}

export default function TelemetryWizard() {
  const { toast } = useToast();
  const [step, setStep] = useState(0);

  // Step 0 - Webhook Token
  const [webhookToken, setWebhookToken] = useState("");
  const [showWebhookToken, setShowWebhookToken] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<StepStatus>("idle");
  const [webhookError, setWebhookError] = useState("");

  // Step 1 - Telegram Bot Token
  const [botToken, setBotToken] = useState("");
  const [showBotToken, setShowBotToken] = useState(false);
  const [botStatus, setBotStatus] = useState<StepStatus>("idle");
  const [botError, setBotError] = useState("");

  // Step 2 - Telegram Chat ID
  const [chatId, setChatId] = useState("");
  const [chatStatus, setChatStatus] = useState<StepStatus>("idle");
  const [chatError, setChatError] = useState("");
  const [chatOptions, setChatOptions] = useState<ChatOption[]>([]);
  const [detectingChat, setDetectingChat] = useState(false);

  // Final
  const [saving, setSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);

  const testWebhookPing = async () => {
    if (!webhookToken.trim()) return;
    setWebhookStatus("loading");
    setWebhookError("");
    try {
      const { data, error } = await supabase.functions.invoke("telemetry-wizard", {
        body: { action: "ping-webhook", token: webhookToken.trim() },
      });
      if (error) throw error;
      if (data?.ok) {
        setWebhookStatus("success");
      } else {
        setWebhookStatus("error");
        setWebhookError(data?.error ?? `Status ${data?.status}`);
      }
    } catch (e: any) {
      setWebhookStatus("error");
      setWebhookError(e.message || "Falha na conexão");
    }
  };

  const testBotToken = async () => {
    if (!botToken.trim()) return;
    setBotStatus("loading");
    setBotError("");
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken.trim()}/getMe`);
      const data = await res.json();
      if (data.ok) {
        setBotStatus("success");
      } else {
        setBotStatus("error");
        setBotError(data.description ?? "Token inválido");
      }
    } catch (e: any) {
      setBotStatus("error");
      setBotError(e.message || "Falha na conexão");
    }
  };

  const detectChatId = async () => {
    if (!botToken.trim()) {
      toast({ variant: "destructive", title: "Erro", description: "Configure o Bot Token primeiro (Passo 2)." });
      return;
    }
    setDetectingChat(true);
    setChatOptions([]);
    try {
      const { data, error } = await supabase.functions.invoke("telemetry-wizard", {
        body: { action: "fetch-telegram-updates", bot_token: botToken.trim() },
      });
      if (error) throw error;
      if (data?.chats?.length > 0) {
        setChatOptions(data.chats);
        toast({ title: "Chats detectados!", description: `${data.chats.length} chat(s) encontrado(s).` });
      } else {
        toast({
          variant: "destructive",
          title: "Nenhum chat encontrado",
          description: "Envie uma mensagem ao bot no Telegram e tente novamente.",
        });
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro", description: e.message || "Falha ao buscar chats." });
    } finally {
      setDetectingChat(false);
    }
  };

  const testChatId = async () => {
    if (!chatId.trim() || !botToken.trim()) return;
    setChatStatus("loading");
    setChatError("");
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId.trim(),
          text: "✅ <b>FLOWPULSE INTELLIGENCE</b>\n\nConexão com Telegram verificada com sucesso!",
          parse_mode: "HTML",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setChatStatus("success");
      } else {
        setChatStatus("error");
        setChatError(data.description ?? "Chat ID inválido");
      }
    } catch (e: any) {
      setChatStatus("error");
      setChatError(e.message || "Falha na conexão");
    }
  };

  const handleFinalize = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("telemetry-wizard", {
        body: {
          action: "save-secrets",
          secrets: {
            ...(webhookToken.trim() ? { FLOWPULSE_WEBHOOK_TOKEN: webhookToken.trim() } : {}),
            ...(botToken.trim() ? { TELEGRAM_BOT_TOKEN: botToken.trim() } : {}),
            ...(chatId.trim() ? { TELEGRAM_CHAT_ID: chatId.trim() } : {}),
          },
        },
      });
      if (error) throw error;

      const results = data?.results ?? {};
      const allValid = Object.values(results).every((r: any) => r.valid);

      if (allValid) {
        setSaveComplete(true);
        toast({ title: "Configuração concluída!", description: "Todas as credenciais foram validadas com sucesso." });
      } else {
        const failed = Object.entries(results)
          .filter(([, r]: any) => !r.valid)
          .map(([k, r]: any) => `${k}: ${r.error}`)
          .join("; ");
        toast({ variant: "destructive", title: "Validação parcial", description: failed });
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro", description: e.message || "Falha ao salvar." });
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    { label: "Webhook Token", icon: Shield },
    { label: "Bot Token", icon: Radio },
    { label: "Chat ID", icon: MessageSquare },
  ];

  const StatusIcon = ({ status, error }: { status: StepStatus; error?: string }) => {
    if (status === "loading") return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
    if (status === "success") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (status === "error") return (
      <div className="flex items-center gap-1">
        <XCircle className="w-4 h-4 text-destructive" />
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    );
    return null;
  };

  if (saveComplete) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-8 text-center space-y-4">
        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
        <h3 className="text-lg font-bold font-[Orbitron] text-foreground">TELEMETRIA CONFIGURADA</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          O pipeline Zabbix → FlowPulse → Telegram está ativo. Alertas serão processados automaticamente.
        </p>
        <Button variant="outline" onClick={() => { setSaveComplete(false); setStep(0); }}>
          <RefreshCw className="w-4 h-4 mr-2" /> Reconfigurar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isDone = i < step;
          return (
            <div key={i} className="flex items-center gap-2">
              <button
                onClick={() => setStep(i)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono transition-all ${
                  isActive
                    ? "bg-primary/10 border border-primary/30 text-primary"
                    : isDone
                    ? "bg-green-500/10 border border-green-500/30 text-green-500"
                    : "bg-muted/30 border border-border text-muted-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{s.label}</span>
                <Badge variant="outline" className="text-[10px] px-1.5">
                  {i + 1}/3
                </Badge>
              </button>
              {i < steps.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          );
        })}
      </div>

      {/* Step 0: Webhook Token */}
      {step === 0 && (
        <div className="rounded-xl border border-border bg-card/60 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Token de Autenticação do Webhook</h3>
              <p className="text-xs text-muted-foreground">
                Token usado no header <code className="bg-muted px-1 rounded">Authorization: Bearer &lt;token&gt;</code> das requisições do Zabbix.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">FLOWPULSE_WEBHOOK_TOKEN</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showWebhookToken ? "text" : "password"}
                  value={webhookToken}
                  onChange={(e) => { setWebhookToken(e.target.value); setWebhookStatus("idle"); }}
                  placeholder="FP-XXXX-XXXX-XXXX-XXX"
                  className="bg-muted/50 border-border font-mono pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowWebhookToken(!showWebhookToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showWebhookToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button
                variant="outline"
                onClick={testWebhookPing}
                disabled={!webhookToken.trim() || webhookStatus === "loading"}
              >
                {webhookStatus === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                <span className="ml-1">Testar Ping</span>
              </Button>
            </div>
            <StatusIcon status={webhookStatus} error={webhookError} />
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setStep(1)} disabled={!webhookToken.trim()}>
              Próximo <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 1: Telegram Bot Token */}
      {step === 1 && (
        <div className="rounded-xl border border-border bg-card/60 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Radio className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Token do Bot Telegram</h3>
              <p className="text-xs text-muted-foreground">
                Obtido via <code className="bg-muted px-1 rounded">@BotFather</code> no Telegram. Formato: <code className="bg-muted px-1 rounded">123456:ABC-DEF...</code>
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">TELEGRAM_BOT_TOKEN</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showBotToken ? "text" : "password"}
                  value={botToken}
                  onChange={(e) => { setBotToken(e.target.value); setBotStatus("idle"); }}
                  placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                  className="bg-muted/50 border-border font-mono pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowBotToken(!showBotToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showBotToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button
                variant="outline"
                onClick={testBotToken}
                disabled={!botToken.trim() || botStatus === "loading"}
              >
                {botStatus === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span className="ml-1">Validar</span>
              </Button>
            </div>
            <StatusIcon status={botStatus} error={botError} />
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(0)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <Button onClick={() => setStep(2)} disabled={!botToken.trim()}>
              Próximo <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Telegram Chat ID */}
      {step === 2 && (
        <div className="rounded-xl border border-border bg-card/60 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Chat ID do Telegram</h3>
              <p className="text-xs text-muted-foreground">
                ID do grupo ou canal onde as notificações serão enviadas.
              </p>
            </div>
          </div>

          {/* Auto-detect helper */}
          <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Zap className="w-4 h-4" />
              Detecção Automática
            </div>
            <p className="text-xs text-muted-foreground">
              1. Adicione o bot ao grupo/canal no Telegram<br />
              2. Envie qualquer mensagem no grupo<br />
              3. Clique em "Detectar Chat ID" abaixo
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={detectChatId}
              disabled={detectingChat || !botToken.trim()}
            >
              {detectingChat ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Detectar Chat ID
            </Button>

            {chatOptions.length > 0 && (
              <div className="space-y-2 mt-2">
                <Label className="text-xs text-muted-foreground">Chats Encontrados:</Label>
                <div className="grid gap-2">
                  {chatOptions.map((c) => (
                    <button
                      key={String(c.id)}
                      onClick={() => { setChatId(String(c.id)); setChatStatus("idle"); }}
                      className={`flex items-center justify-between p-3 rounded-lg border text-sm transition-all ${
                        chatId === String(c.id)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-muted/30 text-foreground hover:border-primary/30"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        <span className="font-medium">{c.title}</span>
                        <Badge variant="outline" className="text-[10px]">{c.type}</Badge>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">TELEGRAM_CHAT_ID (ou insira manualmente)</Label>
            <div className="flex gap-2">
              <Input
                value={chatId}
                onChange={(e) => { setChatId(e.target.value); setChatStatus("idle"); }}
                placeholder="-1001234567890"
                className="bg-muted/50 border-border font-mono"
              />
              <Button
                variant="outline"
                onClick={testChatId}
                disabled={!chatId.trim() || !botToken.trim() || chatStatus === "loading"}
              >
                {chatStatus === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                <span className="ml-1">Enviar Teste</span>
              </Button>
            </div>
            <StatusIcon status={chatStatus} error={chatError} />
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <Button
              onClick={handleFinalize}
              disabled={saving || !webhookToken.trim() || !botToken.trim() || !chatId.trim()}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              Finalizar e Validar Tudo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
