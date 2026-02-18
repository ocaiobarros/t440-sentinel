import type { DashboardConfig } from "@/types/builder";
import { GLOW_PRESETS, COLOR_PRESETS } from "@/types/builder";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Settings2 } from "lucide-react";

interface Props {
  config: DashboardConfig;
  onUpdate: (config: DashboardConfig) => void;
  connections: Array<{ id: string; name: string }>;
}

export default function DashboardSettingsPanel({ config, onUpdate, connections }: Props) {
  const updateSettings = (patch: Partial<DashboardConfig["settings"]>) => {
    onUpdate({ ...config, settings: { ...config.settings, ...patch } });
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Settings2 className="w-3.5 h-3.5 text-neon-green" />
          <h3 className="text-xs font-display font-semibold">Dashboard</h3>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">Nome</Label>
          <Input value={config.name} onChange={(e) => onUpdate({ ...config, name: e.target.value })} className="h-7 text-xs" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">Descrição</Label>
          <Textarea value={config.description} onChange={(e) => onUpdate({ ...config, description: e.target.value })} className="text-xs min-h-[50px]" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">Conexão Zabbix</Label>
          <Select value={config.zabbix_connection_id || ""} onValueChange={(v) => onUpdate({ ...config, zabbix_connection_id: v || null })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
            <SelectContent>
              {connections.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">Intervalo de polling: {config.settings.poll_interval_seconds}s</Label>
          <Slider
            value={[config.settings.poll_interval_seconds]}
            onValueChange={([v]) => updateSettings({ poll_interval_seconds: v })}
            min={10} max={300} step={10}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">Colunas do grid: {config.settings.cols}</Label>
          <Slider
            value={[config.settings.cols]}
            onValueChange={([v]) => updateSettings({ cols: v })}
            min={12} max={48} step={1}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">Altura da linha: {config.settings.rowHeight}px</Label>
          <Slider
            value={[config.settings.rowHeight]}
            onValueChange={([v]) => updateSettings({ rowHeight: v })}
            min={10} max={120} step={5}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-[10px] text-muted-foreground">Mostrar grid</Label>
          <Switch checked={config.settings.showGrid !== false} onCheckedChange={(v) => updateSettings({ showGrid: v })} />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-[10px] text-muted-foreground">Scanlines</Label>
          <Switch checked={config.settings.scanlines !== false} onCheckedChange={(v) => updateSettings({ scanlines: v })} />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-[10px] text-muted-foreground">Glow ambiente</Label>
          <Switch checked={config.settings.ambientGlow !== false} onCheckedChange={(v) => updateSettings({ ambientGlow: v })} />
        </div>

        {config.settings.ambientGlow && (
          <div className="space-y-1.5">
            <Label className="text-[10px] text-muted-foreground">Cor do glow ambiente</Label>
            <div className="flex flex-wrap gap-1">
              {COLOR_PRESETS.slice(0, 6).map((c) => (
                <button
                  key={c}
                  onClick={() => updateSettings({ ambientGlowColor: c })}
                  className={`w-5 h-5 rounded-full border-2 ${config.settings.ambientGlowColor === c ? "border-foreground" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">Background gradient</Label>
          <Input
            value={config.settings.bgGradient || ""}
            onChange={(e) => updateSettings({ bgGradient: e.target.value })}
            placeholder="linear-gradient(180deg, #0d1117, #040408)"
            className="h-7 text-[9px] font-mono"
          />
        </div>
      </div>
    </ScrollArea>
  );
}
