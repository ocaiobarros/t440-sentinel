import { useState } from "react";
import { useRMSConnections, type RMSConnectionItem } from "@/hooks/useRMSConnections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, Wifi, WifiOff, Loader2, CheckCircle2, XCircle,
  ArrowLeft, Zap, Fuel,
} from "lucide-react";
import { Link } from "react-router-dom";

export default function RMSConnections() {
  const {
    connections, isLoading, create, isCreating, update, isUpdating,
    remove, isDeleting, testConnection, testing, testResult, clearTestResult,
  } = useRMSConnections();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RMSConnectionItem | null>(null);
  const [form, setForm] = useState({ name: "", url: "", api_token: "" });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", url: "https://supabase.rmsgroup.app/functions/v1/fueling-entries-api", api_token: "" });
    clearTestResult();
    setDialogOpen(true);
  };

  const openEdit = (conn: RMSConnectionItem) => {
    setEditing(conn);
    setForm({ name: conn.name, url: conn.url, api_token: "" });
    clearTestResult();
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      const payload: Record<string, unknown> = { id: editing.id };
      if (form.name !== editing.name) payload.name = form.name;
      if (form.url !== editing.url) payload.url = form.url;
      if (form.api_token) payload.api_token = form.api_token;
      await update(payload as Parameters<typeof update>[0]);
    } else {
      await create(form);
    }
    setDialogOpen(false);
  };

  const handleTest = () => {
    if (editing) {
      if (form.api_token) {
        testConnection({ url: form.url, api_token: form.api_token });
      } else {
        testConnection({ id: editing.id });
      }
    } else {
      testConnection({ url: form.url, api_token: form.api_token });
    }
  };

  return (
    <div className="min-h-screen bg-background grid-pattern scanlines relative p-4 md:p-6 lg:p-8">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[250px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link to="/">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Fuel className="w-6 h-6 text-primary" />
            <h1 className="font-display text-xl font-bold tracking-wider text-primary text-glow-green">
              CONEXÕES RMS
            </h1>
          </div>

          {/* Navigation tabs */}
          <div className="flex items-center gap-1 ml-4">
            <Link to="/settings/connections">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
                Zabbix
              </Button>
            </Link>
            <Button variant="secondary" size="sm" className="text-xs">
              RMS
            </Button>
          </div>

          <div className="ml-auto">
            <Button onClick={openCreate} className="font-semibold">
              <Plus className="w-4 h-4 mr-2" /> Nova Conexão
            </Button>
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : connections.length === 0 ? (
          <Card className="glass-card-elevated border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Fuel className="w-12 h-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground mb-2">Nenhuma conexão RMS configurada</p>
              <p className="text-sm text-muted-foreground/60 mb-6">
                Adicione uma conexão com a API de abastecimento RMS para começar.
              </p>
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" /> Adicionar Conexão
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {connections.map((conn) => (
              <Card key={conn.id} className="glass-card-elevated">
                <CardContent className="flex items-center gap-4 py-4 px-5">
                  <div className={`w-2 h-2 rounded-full ${conn.is_active ? "bg-primary pulse-green" : "bg-muted-foreground/40"}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground truncate">{conn.name}</span>
                      {conn.is_active ? (
                        <Wifi className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      ) : (
                        <WifiOff className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs font-mono text-muted-foreground truncate">{conn.url}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Switch
                      checked={conn.is_active}
                      onCheckedChange={(checked) => update({ id: conn.id, is_active: checked })}
                      disabled={isUpdating}
                    />

                    <Button variant="ghost" size="icon" onClick={() => testConnection({ id: conn.id })} disabled={testing} title="Testar conexão">
                      {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    </Button>

                    <Button variant="ghost" size="icon" onClick={() => openEdit(conn)}>
                      <Pencil className="w-4 h-4" />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover conexão?</AlertDialogTitle>
                          <AlertDialogDescription>
                            A conexão "{conn.name}" será removida permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => remove(conn.id)}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create / Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="glass-card-elevated border-border sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display tracking-wide">
                {editing ? "Editar Conexão RMS" : "Nova Conexão RMS"}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Nome</Label>
                <Input
                  placeholder="Frota Principal"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  maxLength={100}
                  className="bg-muted/50 border-border"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">URL da API</Label>
                <Input
                  placeholder="https://supabase.rmsgroup.app/functions/v1/fueling-entries-api"
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  required
                  type="url"
                  className="bg-muted/50 border-border font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Token de Acesso {editing && <span className="text-xs text-muted-foreground/60">(deixe em branco para manter)</span>}
                </Label>
                <Input
                  type="password"
                  placeholder={editing ? "••••••••" : "c6b63f7c-0f68-..."}
                  value={form.api_token}
                  onChange={(e) => setForm((f) => ({ ...f, api_token: e.target.value }))}
                  required={!editing}
                  className="bg-muted/50 border-border font-mono text-sm"
                />
              </div>

              {/* Test result */}
              {testResult && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${testResult.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive-foreground"}`}>
                  {testResult.ok ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      <span>Conexão válida! API respondendo.</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{testResult.error}</span>
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTest}
                  disabled={testing || (!form.url || (!form.api_token && !editing))}
                  className="flex-1"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                  Testar
                </Button>

                <Button type="submit" disabled={isCreating || isUpdating} className="flex-1 font-semibold">
                  {(isCreating || isUpdating) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {editing ? "Salvar" : "Criar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
