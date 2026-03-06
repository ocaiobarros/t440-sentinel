import { useState } from "react";
import { useAdmin } from "./AdminContext";
import { useRMSConnections, type RMSConnectionItem } from "@/hooks/useRMSConnections";
import { useZabbixConnections, type ZabbixConnectionItem } from "@/hooks/useZabbixConnections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Building2, Cable, Fuel, Server, Wifi, WifiOff, Loader2, Pencil, Trash2, Plus, Save, Eye, EyeOff, CheckCircle2, XCircle,
} from "lucide-react";
import AdminBreadcrumb from "./AdminBreadcrumb";

export default function AdminConnectionsPage() {
  const { tenants, selectedTenantId, setSelectedTenantId, isSuperAdmin } = useAdmin();

  const rms = useRMSConnections();
  const [rmsDialogOpen, setRmsDialogOpen] = useState(false);
  const [rmsEditing, setRmsEditing] = useState<RMSConnectionItem | null>(null);
  const [rmsForm, setRmsForm] = useState({ name: "", url: "", api_token: "" });
  const [showRmsToken, setShowRmsToken] = useState(false);

  const zabbix = useZabbixConnections();
  const [zabbixDialogOpen, setZabbixDialogOpen] = useState(false);
  const [zabbixEditing, setZabbixEditing] = useState<ZabbixConnectionItem | null>(null);
  const [zabbixForm, setZabbixForm] = useState({ name: "", url: "", username: "", password: "" });
  const [showZabbixPass, setShowZabbixPass] = useState(false);

  const openRmsCreate = () => { setRmsEditing(null); setRmsForm({ name: "", url: "https://supabase.rmsgroup.app/functions/v1/fueling-entries-api", api_token: "" }); rms.clearTestResult(); setShowRmsToken(false); setRmsDialogOpen(true); };
  const openRmsEdit = (c: RMSConnectionItem) => { setRmsEditing(c); setRmsForm({ name: c.name, url: c.url, api_token: "" }); rms.clearTestResult(); setShowRmsToken(false); setRmsDialogOpen(true); };
  const handleRmsSave = async () => {
    if (rmsEditing) await rms.update({ id: rmsEditing.id, name: rmsForm.name, url: rmsForm.url, ...(rmsForm.api_token ? { api_token: rmsForm.api_token } : {}) });
    else await rms.create(rmsForm);
    setRmsDialogOpen(false);
  };
  const handleRmsTest = () => {
    if (rmsEditing) rms.testConnection({ id: rmsEditing.id, ...(rmsForm.api_token ? { api_token: rmsForm.api_token } : {}) });
    else rms.testConnection({ url: rmsForm.url, api_token: rmsForm.api_token });
  };

  const openZabbixCreate = () => { setZabbixEditing(null); setZabbixForm({ name: "", url: "", username: "", password: "" }); zabbix.clearTestResult(); setShowZabbixPass(false); setZabbixDialogOpen(true); };
  const openZabbixEdit = (c: ZabbixConnectionItem) => { setZabbixEditing(c); setZabbixForm({ name: c.name, url: c.url, username: c.username, password: "" }); zabbix.clearTestResult(); setShowZabbixPass(false); setZabbixDialogOpen(true); };
  const handleZabbixSave = async () => {
    if (zabbixEditing) await zabbix.update({ id: zabbixEditing.id, name: zabbixForm.name, url: zabbixForm.url, username: zabbixForm.username, ...(zabbixForm.password ? { password: zabbixForm.password } : {}) });
    else await zabbix.create(zabbixForm);
    setZabbixDialogOpen(false);
  };
  const handleZabbixTest = () => {
    if (zabbixEditing) zabbix.testConnection({ id: zabbixEditing.id, ...(zabbixForm.password ? { password: zabbixForm.password } : {}) });
    else zabbix.testConnection({ url: zabbixForm.url, username: zabbixForm.username, password: zabbixForm.password });
  };

  const renderConnectionRow = (c: { id: string; name: string; url: string; is_active: boolean }, onEdit: () => void, onRemove: () => void) => (
    <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
      <div className="flex items-center gap-3">
        {c.is_active ? <Wifi className="w-4 h-4 text-primary" /> : <WifiOff className="w-4 h-4 text-muted-foreground" />}
        <div>
          <p className="text-sm font-medium text-foreground">{c.name}</p>
          <p className="text-xs text-muted-foreground font-mono truncate max-w-[300px]">{c.url}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={c.is_active ? "default" : "outline"} className="text-xs">{c.is_active ? "Ativa" : "Inativa"}</Badge>
        <Button variant="ghost" size="icon" onClick={onEdit}><Pencil className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <AdminBreadcrumb items={[{ label: "Conexões de Dados" }]} />
      <h2 className="text-xl font-bold text-foreground font-[Orbitron] tracking-wide">Conexões de Dados</h2>

      {isSuperAdmin && tenants.length > 1 && (
        <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Building2 className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configurando para:</span>
            <Select value={selectedTenantId ?? ""} onValueChange={setSelectedTenantId}>
              <SelectTrigger className="w-52 h-9 bg-muted/50 border-border text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </section>
      )}

      {/* RMS */}
      <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3"><Fuel className="w-5 h-5 text-primary" /><h3 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">RMS FUELING</h3></div>
          <Button size="sm" onClick={openRmsCreate}><Plus className="w-4 h-4 mr-1" /> Nova Conexão</Button>
        </div>
        {rms.isLoading ? <Skeleton className="h-12 w-full" /> : rms.connections.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground"><Cable className="w-10 h-10 mx-auto mb-2 opacity-40" /><p className="text-sm">Nenhuma conexão RMS.</p></div>
        ) : (
          <div className="space-y-2">{rms.connections.map((c) => renderConnectionRow(c, () => openRmsEdit(c), async () => { await rms.remove(c.id); }))}</div>
        )}
      </section>

      {/* Zabbix */}
      <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3"><Server className="w-5 h-5 text-primary" /><h3 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">ZABBIX</h3></div>
          <Button size="sm" onClick={openZabbixCreate}><Plus className="w-4 h-4 mr-1" /> Nova Conexão</Button>
        </div>
        {zabbix.isLoading ? <Skeleton className="h-12 w-full" /> : zabbix.connections.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground"><Cable className="w-10 h-10 mx-auto mb-2 opacity-40" /><p className="text-sm">Nenhuma conexão Zabbix.</p></div>
        ) : (
          <div className="space-y-2">{zabbix.connections.map((c) => renderConnectionRow(c, () => openZabbixEdit(c), async () => { await zabbix.remove(c.id); }))}</div>
        )}
      </section>

      {/* RMS Dialog */}
      <Dialog open={rmsDialogOpen} onOpenChange={setRmsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{rmsEditing ? "Editar Conexão RMS" : "Nova Conexão RMS"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label className="text-xs text-muted-foreground">Nome</Label><Input value={rmsForm.name} onChange={(e) => setRmsForm((f) => ({ ...f, name: e.target.value }))} className="bg-muted/50 border-border" /></div>
            <div className="space-y-2"><Label className="text-xs text-muted-foreground">URL</Label><Input value={rmsForm.url} onChange={(e) => setRmsForm((f) => ({ ...f, url: e.target.value }))} className="bg-muted/50 border-border font-mono text-xs" /></div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">API Token {rmsEditing && <span className="text-muted-foreground/60">(deixe vazio para manter)</span>}</Label>
              <div className="relative">
                <Input type={showRmsToken ? "text" : "password"} value={rmsForm.api_token} onChange={(e) => setRmsForm((f) => ({ ...f, api_token: e.target.value }))} className="bg-muted/50 border-border pr-10" />
                <Button variant="ghost" size="icon" type="button" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowRmsToken(!showRmsToken)}>{showRmsToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</Button>
              </div>
            </div>
            {rms.testResult && <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${rms.testResult.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>{rms.testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}{rms.testResult.ok ? "Conexão ok!" : rms.testResult.error ?? "Falha."}</div>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleRmsTest} disabled={rms.testing}>{rms.testing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Wifi className="w-4 h-4 mr-1" />}Testar</Button>
            <Button onClick={handleRmsSave} disabled={rms.isCreating || rms.isUpdating || !rmsForm.name}>{(rms.isCreating || rms.isUpdating) ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zabbix Dialog */}
      <Dialog open={zabbixDialogOpen} onOpenChange={setZabbixDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{zabbixEditing ? "Editar Conexão Zabbix" : "Nova Conexão Zabbix"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label className="text-xs text-muted-foreground">Nome</Label><Input value={zabbixForm.name} onChange={(e) => setZabbixForm((f) => ({ ...f, name: e.target.value }))} className="bg-muted/50 border-border" /></div>
            <div className="space-y-2"><Label className="text-xs text-muted-foreground">URL</Label><Input value={zabbixForm.url} onChange={(e) => setZabbixForm((f) => ({ ...f, url: e.target.value }))} className="bg-muted/50 border-border font-mono text-xs" /></div>
            <div className="space-y-2"><Label className="text-xs text-muted-foreground">Usuário</Label><Input value={zabbixForm.username} onChange={(e) => setZabbixForm((f) => ({ ...f, username: e.target.value }))} className="bg-muted/50 border-border" /></div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Senha {zabbixEditing && <span className="text-muted-foreground/60">(deixe vazio para manter)</span>}</Label>
              <div className="relative">
                <Input type={showZabbixPass ? "text" : "password"} value={zabbixForm.password} onChange={(e) => setZabbixForm((f) => ({ ...f, password: e.target.value }))} className="bg-muted/50 border-border pr-10" />
                <Button variant="ghost" size="icon" type="button" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowZabbixPass(!showZabbixPass)}>{showZabbixPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</Button>
              </div>
            </div>
            {zabbix.testResult && <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${zabbix.testResult.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>{zabbix.testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}{zabbix.testResult.ok ? `Conectado — v${zabbix.testResult.version}` : zabbix.testResult.error ?? "Falha."}</div>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleZabbixTest} disabled={zabbix.testing}>{zabbix.testing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Wifi className="w-4 h-4 mr-1" />}Testar</Button>
            <Button onClick={handleZabbixSave} disabled={zabbix.isCreating || zabbix.isUpdating || !zabbixForm.name}>{(zabbix.isCreating || zabbix.isUpdating) ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
