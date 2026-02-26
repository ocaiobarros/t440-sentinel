import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2, XCircle, Loader2, Play, RefreshCw,
  Server, Users, Building2, Shield, Zap, Clock,
} from "lucide-react";

interface TestResult {
  name: string;
  status: "idle" | "running" | "pass" | "fail";
  message: string;
  duration?: number;
  details?: string;
}

interface DiagnosticPanelProps {
  tenants: { id: string; name: string }[];
  selectedTenantId: string | null;
}

export default function DiagnosticPanel({ tenants, selectedTenantId }: DiagnosticPanelProps) {
  const [tests, setTests] = useState<TestResult[]>([
    { name: "Autenticação (JWT)", status: "idle", message: "Aguardando execução" },
    { name: "Listagem de Tenants", status: "idle", message: "Aguardando execução" },
    { name: "Listagem de Profiles", status: "idle", message: "Aguardando execução" },
    { name: "Listagem de Roles", status: "idle", message: "Aguardando execução" },
    { name: "Edge Function: invite-user", status: "idle", message: "Aguardando execução" },
    { name: "Vínculo de Organização", status: "idle", message: "Aguardando execução" },
    { name: "Limpeza de Teste", status: "idle", message: "Aguardando execução" },
  ]);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const updateTest = useCallback((index: number, update: Partial<TestResult>) => {
    setTests(prev => prev.map((t, i) => i === index ? { ...t, ...update } : t));
  }, []);

  const runDiagnostics = useCallback(async () => {
    setRunning(true);
    const startAll = Date.now();

    // Reset all
    setTests(prev => prev.map(t => ({ ...t, status: "running" as const, message: "Executando...", details: undefined, duration: undefined })));

    // 1. Auth check
    const t0 = Date.now();
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) throw new Error(error?.message || "Sem sessão ativa");
      updateTest(0, {
        status: "pass",
        message: `Logado como ${user.email}`,
        duration: Date.now() - t0,
        details: `user_id: ${user.id}\n tenant_id (metadata): ${user.app_metadata?.tenant_id || "N/A"}`,
      });
    } catch (e: any) {
      updateTest(0, { status: "fail", message: e.message, duration: Date.now() - t0 });
      setRunning(false);
      setLastRun(new Date().toLocaleTimeString("pt-BR"));
      return;
    }

    // 2. Tenants
    const t1 = Date.now();
    try {
      const { data, error, count } = await supabase
        .from("tenants").select("id, name", { count: "exact" });
      if (error) throw error;
      updateTest(1, {
        status: "pass",
        message: `${count ?? data?.length ?? 0} organização(ões) encontrada(s)`,
        duration: Date.now() - t1,
        details: (data ?? []).slice(0, 5).map(t => `• ${t.name} (${t.id.slice(0, 8)}...)`).join("\n"),
      });
    } catch (e: any) {
      updateTest(1, { status: "fail", message: e.message, duration: Date.now() - t1 });
    }

    // 3. Profiles
    const t2 = Date.now();
    try {
      const { data, error, count } = await supabase
        .from("profiles").select("id, email, tenant_id", { count: "exact" });
      if (error) throw error;
      updateTest(2, {
        status: "pass",
        message: `${count ?? data?.length ?? 0} perfil(is)`,
        duration: Date.now() - t2,
      });
    } catch (e: any) {
      updateTest(2, { status: "fail", message: e.message, duration: Date.now() - t2 });
    }

    // 4. Roles
    const t3 = Date.now();
    try {
      const { data, error, count } = await supabase
        .from("user_roles").select("id, user_id, role, tenant_id", { count: "exact" });
      if (error) throw error;
      updateTest(3, {
        status: "pass",
        message: `${count ?? data?.length ?? 0} role(s)`,
        duration: Date.now() - t3,
      });
    } catch (e: any) {
      updateTest(3, { status: "fail", message: e.message, duration: Date.now() - t3 });
    }

    // 5. invite-user Edge Function
    const testEmail = `diag-${Date.now()}@flowpulse.test`;
    const targetTenant = selectedTenantId || tenants[0]?.id;
    let createdUserId: string | null = null;

    const t4 = Date.now();
    try {
      if (!targetTenant) throw new Error("Nenhum tenant disponível para teste");

      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: testEmail,
          display_name: "Diagnóstico Automático",
          role: "viewer",
          password: "DiagTest@2026!",
          target_tenant_id: targetTenant,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      createdUserId = data?.user_id || null;

      updateTest(4, {
        status: "pass",
        message: data?.existing ? `Usuário existente vinculado` : `Usuário criado com sucesso`,
        duration: Date.now() - t4,
        details: `user_id: ${createdUserId}\nemail: ${testEmail}\nexisting: ${data?.existing}\nmoved: ${data?.moved}`,
      });
    } catch (e: any) {
      updateTest(4, {
        status: "fail",
        message: e.message,
        duration: Date.now() - t4,
        details: `email_teste: ${testEmail}\ntarget_tenant: ${targetTenant}\nErro completo: ${JSON.stringify(e)}`,
      });
    }

    // 6. Verify binding
    const t5 = Date.now();
    try {
      if (!createdUserId) throw new Error("Usuário não foi criado no passo anterior");

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("id, tenant_id, email")
        .eq("id", createdUserId)
        .maybeSingle();

      if (pErr) throw pErr;
      if (!profile) throw new Error("Profile não encontrado");

      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", createdUserId);

      if (rErr) throw rErr;

      const correctTenant = profile.tenant_id === targetTenant;
      const hasRole = roles?.some(r => r.tenant_id === targetTenant);

      if (!correctTenant) throw new Error(`Profile em tenant ${profile.tenant_id} (esperado: ${targetTenant})`);
      if (!hasRole) throw new Error(`Nenhuma role no tenant correto`);

      updateTest(5, {
        status: "pass",
        message: `Vínculo correto: tenant=${profile.tenant_id.slice(0, 8)}...`,
        duration: Date.now() - t5,
        details: `profile.tenant_id: ${profile.tenant_id}\nroles: ${JSON.stringify(roles)}`,
      });
    } catch (e: any) {
      updateTest(5, {
        status: "fail",
        message: e.message,
        duration: Date.now() - t5,
      });
    }

    // 7. Cleanup - delete test user profile & role (keep auth user for now)
    const t6 = Date.now();
    try {
      if (createdUserId) {
        await supabase.from("user_roles").delete().eq("user_id", createdUserId);
        // Note: can't delete profile via RLS (no DELETE policy), that's OK
        updateTest(6, {
          status: "pass",
          message: "Roles de teste removidas",
          duration: Date.now() - t6,
        });
      } else {
        updateTest(6, {
          status: "pass",
          message: "Nenhum dado para limpar",
          duration: Date.now() - t6,
        });
      }
    } catch (e: any) {
      updateTest(6, {
        status: "fail",
        message: e.message,
        duration: Date.now() - t6,
      });
    }

    setLastRun(new Date().toLocaleTimeString("pt-BR"));
    setRunning(false);
  }, [selectedTenantId, tenants, updateTest]);

  const passCount = tests.filter(t => t.status === "pass").length;
  const failCount = tests.filter(t => t.status === "fail").length;

  return (
    <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">
              DIAGNÓSTICO DO SISTEMA
            </h2>
            <p className="text-xs text-muted-foreground">
              Teste end-to-end: Auth → Criar Usuário → Vincular Organização
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastRun && (
            <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
              <Clock className="w-3 h-3" /> Último: {lastRun}
            </span>
          )}
          {passCount + failCount > 0 && (
            <div className="flex gap-1.5">
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                {passCount} OK
              </Badge>
              {failCount > 0 && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                  {failCount} FALHA
                </Badge>
              )}
            </div>
          )}
          <Button
            onClick={runDiagnostics}
            disabled={running}
            size="sm"
            className="gap-1.5"
          >
            {running ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {running ? "Executando..." : "Executar Diagnóstico"}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Target info */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Building2 className="w-3 h-3" />
          Tenant alvo: <span className="font-mono text-foreground">
            {tenants.find(t => t.id === (selectedTenantId || tenants[0]?.id))?.name || "Nenhum"}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <Server className="w-3 h-3" />
          Endpoint: <span className="font-mono text-foreground">invite-user</span>
        </span>
      </div>

      {/* Test results */}
      <ScrollArea className="max-h-[500px]">
        <div className="space-y-2">
          {tests.map((test, i) => (
            <Card key={i} className={`border-border/50 ${
              test.status === "fail" ? "border-red-500/30 bg-red-500/5" :
              test.status === "pass" ? "border-emerald-500/30 bg-emerald-500/5" :
              ""
            }`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {test.status === "idle" && <div className="w-4 h-4 rounded-full border border-muted-foreground/30" />}
                    {test.status === "running" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                    {test.status === "pass" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    {test.status === "fail" && <XCircle className="w-4 h-4 text-red-400" />}
                    <span className="text-sm font-medium text-foreground">{test.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {test.duration !== undefined && (
                      <span className="text-[10px] font-mono text-muted-foreground">{test.duration}ms</span>
                    )}
                    <Badge variant="outline" className={`text-[10px] ${
                      test.status === "pass" ? "text-emerald-400 border-emerald-500/30" :
                      test.status === "fail" ? "text-red-400 border-red-500/30" :
                      test.status === "running" ? "text-primary border-primary/30" :
                      "text-muted-foreground"
                    }`}>
                      {test.status === "idle" ? "PENDENTE" :
                       test.status === "running" ? "EXECUTANDO" :
                       test.status === "pass" ? "PASS" : "FAIL"}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1 ml-6">{test.message}</p>
                {test.details && (
                  <pre className="text-[10px] font-mono text-muted-foreground mt-2 ml-6 p-2 bg-muted/30 rounded border border-border/30 whitespace-pre-wrap">
                    {test.details}
                  </pre>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>

      {/* Instructions */}
      <div className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-2">
        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Para diagnóstico no Docker local (On-Premise):
        </h4>
        <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap">
{`# 1. Coletar relatório completo
bash scripts/diagnose-onprem.sh

# 2. Ver logs do container de functions
docker compose -f deploy/docker-compose.onprem.yml logs --tail=50 functions

# 3. Testar invite-user manualmente
curl -X POST http://localhost:8000/functions/v1/invite-user \\
  -H "Authorization: Bearer \\$JWT" \\
  -H "apikey: \\$ANON_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"test@test.com","role":"viewer","password":"Test@123"}'`}
        </pre>
      </div>
    </section>
  );
}
