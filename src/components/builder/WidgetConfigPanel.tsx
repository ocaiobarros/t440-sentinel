import { useState, useMemo } from "react";
import type { WidgetConfig, WidgetStyle, ImageHotspot } from "@/types/builder";
import { GLOW_PRESETS, FONT_OPTIONS, COLOR_PRESETS } from "@/types/builder";
import { getIconNames } from "./DynamicIcon";
import DynamicIcon from "./DynamicIcon";
import ImageUploader from "./ImageUploader";
import HotspotEditor from "./HotspotEditor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, X, Search, Palette, Type, Sparkles, Database, Settings2, ImageIcon } from "lucide-react";

interface Props {
  widget: WidgetConfig;
  onUpdate: (widget: WidgetConfig) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function ColorPicker({ value, onChange, label }: { value?: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1.5 flex-wrap">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={`w-5 h-5 rounded-full border-2 transition-all ${value === c ? "border-foreground scale-110" : "border-transparent"}`}
            style={{ background: c }}
          />
        ))}
        <Input
          type="color"
          value={value || "#39FF14"}
          onChange={(e) => onChange(e.target.value)}
          className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer"
        />
      </div>
    </div>
  );
}

export default function WidgetConfigPanel({ widget, onUpdate, onDelete, onClose }: Props) {
  const [iconSearch, setIconSearch] = useState("");

  const updateStyle = (patch: Partial<WidgetStyle>) => {
    onUpdate({ ...widget, style: { ...widget.style, ...patch } });
  };

  const allIcons = useMemo(() => getIconNames(), []);
  const filteredIcons = useMemo(
    () => (iconSearch ? allIcons.filter((n) => n.toLowerCase().includes(iconSearch.toLowerCase())).slice(0, 40) : allIcons.slice(0, 40)),
    [iconSearch, allIcons],
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-neon-green" />
          <span className="text-xs font-display font-semibold">Configurar Widget</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => onDelete(widget.id)} className="h-6 w-6 text-neon-red hover:text-neon-red/80">
            <Trash2 className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <Tabs defaultValue="style" className="p-3">
          <TabsList className="w-full grid grid-cols-5 h-7">
            <TabsTrigger value="style" className="text-[9px] gap-1 px-1"><Palette className="w-3 h-3" />Visual</TabsTrigger>
            <TabsTrigger value="text" className="text-[9px] gap-1 px-1"><Type className="w-3 h-3" />Texto</TabsTrigger>
            <TabsTrigger value="icon" className="text-[9px] gap-1 px-1"><Sparkles className="w-3 h-3" />Ícone</TabsTrigger>
            <TabsTrigger value="image" className="text-[9px] gap-1 px-1"><ImageIcon className="w-3 h-3" />Imagem</TabsTrigger>
            <TabsTrigger value="data" className="text-[9px] gap-1 px-1"><Database className="w-3 h-3" />Dados</TabsTrigger>
          </TabsList>

          {/* ── VISUAL TAB ── */}
          <TabsContent value="style" className="space-y-4 mt-3">
            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Título</Label>
              <Input
                value={widget.title}
                onChange={(e) => onUpdate({ ...widget, title: e.target.value })}
                className="h-7 text-xs"
              />
            </div>

            {/* Background */}
            <ColorPicker value={widget.style.bg} onChange={(v) => updateStyle({ bg: v })} label="Cor de fundo" />

            {/* Border */}
            <ColorPicker value={widget.style.borderColor} onChange={(v) => updateStyle({ borderColor: v })} label="Cor da borda" />

            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Espessura da borda: {widget.style.borderWidth ?? 1}px</Label>
              <Slider
                value={[widget.style.borderWidth ?? 1]}
                onValueChange={([v]) => updateStyle({ borderWidth: v })}
                min={0} max={6} step={1}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Arredondamento: {widget.style.borderRadius ?? 8}px</Label>
              <Slider
                value={[widget.style.borderRadius ?? 8]}
                onValueChange={([v]) => updateStyle({ borderRadius: v })}
                min={0} max={32} step={1}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Opacidade: {widget.style.opacity ?? 100}%</Label>
              <Slider
                value={[widget.style.opacity ?? 100]}
                onValueChange={([v]) => updateStyle({ opacity: v })}
                min={10} max={100} step={5}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Padding: {widget.style.padding ?? 16}px</Label>
              <Slider
                value={[widget.style.padding ?? 16]}
                onValueChange={([v]) => updateStyle({ padding: v })}
                min={0} max={40} step={2}
              />
            </div>

            {/* Glass effect */}
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-muted-foreground">Efeito Glass</Label>
              <Switch
                checked={widget.style.glass !== false}
                onCheckedChange={(v) => updateStyle({ glass: v })}
              />
            </div>

            {/* Glow */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Efeito Glow</Label>
              <div className="flex flex-wrap gap-1">
                {GLOW_PRESETS.map((g) => (
                  <button
                    key={g.value}
                    onClick={() => updateStyle({ glow: g.value })}
                    className={`text-[9px] px-2 py-1 rounded-full border transition-all ${
                      widget.style.glow === g.value
                        ? "border-neon-green bg-neon-green/10 text-neon-green"
                        : "border-border/50 text-muted-foreground hover:border-foreground/30"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              {widget.style.glow === "custom" && (
                <ColorPicker value={widget.style.glowColor} onChange={(v) => updateStyle({ glowColor: v })} label="Cor do glow" />
              )}
            </div>

            {/* Gradient */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Gradiente de fundo</Label>
              <Input
                value={widget.style.bgGradient || ""}
                onChange={(e) => updateStyle({ bgGradient: e.target.value })}
                placeholder="linear-gradient(135deg, #1a1a2e 0%, #0a0a15 100%)"
                className="h-7 text-[9px] font-mono"
              />
            </div>
          </TabsContent>

          {/* ── TEXT TAB ── */}
          <TabsContent value="text" className="space-y-4 mt-3">
            <ColorPicker value={widget.style.textColor} onChange={(v) => updateStyle({ textColor: v })} label="Cor do texto" />
            <ColorPicker value={widget.style.valueColor} onChange={(v) => updateStyle({ valueColor: v })} label="Cor do valor" />
            <ColorPicker value={widget.style.labelColor} onChange={(v) => updateStyle({ labelColor: v })} label="Cor do label" />

            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Fonte do título</Label>
              <Select value={widget.style.titleFont || FONT_OPTIONS[0].value} onValueChange={(v) => updateStyle({ titleFont: v })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value} className="text-xs" style={{ fontFamily: f.value }}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Fonte do valor</Label>
              <Select value={widget.style.valueFont || FONT_OPTIONS[1].value} onValueChange={(v) => updateStyle({ valueFont: v })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value} className="text-xs" style={{ fontFamily: f.value }}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Tamanho do valor: {widget.style.valueFontSize ?? 24}px</Label>
              <Slider
                value={[widget.style.valueFontSize ?? 24]}
                onValueChange={([v]) => updateStyle({ valueFontSize: v })}
                min={12} max={72} step={2}
              />
            </div>
          </TabsContent>

          {/* ── ICON TAB ── */}
          <TabsContent value="icon" className="space-y-4 mt-3">
            <ColorPicker value={widget.style.iconColor} onChange={(v) => updateStyle({ iconColor: v })} label="Cor do ícone" />

            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Buscar ícone</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  placeholder="thermometer, fan, cpu..."
                  className="h-7 text-xs pl-7"
                />
              </div>
            </div>

            <div className="grid grid-cols-6 gap-1 max-h-[200px] overflow-y-auto">
              {filteredIcons.map((name) => (
                <button
                  key={name}
                  onClick={() => updateStyle({ icon: name })}
                  className={`p-1.5 rounded transition-all ${
                    widget.style.icon === name
                      ? "bg-neon-green/20 border border-neon-green/50"
                      : "hover:bg-accent/50 border border-transparent"
                  }`}
                  title={name}
                >
                  <DynamicIcon name={name} className="w-4 h-4 mx-auto" />
                </button>
              ))}
            </div>

            {widget.style.icon && (
              <div className="flex items-center justify-between glass-card rounded-md p-2">
                <div className="flex items-center gap-2">
                  <DynamicIcon name={widget.style.icon} className="w-5 h-5" style={{ color: widget.style.iconColor }} />
                  <span className="text-xs text-muted-foreground">{widget.style.icon}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => updateStyle({ icon: undefined })} className="h-6 text-[9px]">Remover</Button>
              </div>
            )}
          </TabsContent>

          {/* ── IMAGE TAB ── */}
          <TabsContent value="image" className="space-y-4 mt-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Imagem do dispositivo</Label>
              <ImageUploader
                currentUrl={(widget.extra?.imageUrl as string) || undefined}
                onUploaded={(url) => onUpdate({ ...widget, extra: { ...widget.extra, imageUrl: url } })}
                onRemove={() => {
                  const { imageUrl, ...rest } = widget.extra;
                  onUpdate({ ...widget, extra: rest });
                }}
              />
            </div>

            {widget.extra?.imageUrl && (
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground">
                  LEDs interativos ({((widget.extra?.hotspots as ImageHotspot[]) || []).length})
                </Label>
                <HotspotEditor
                  imageUrl={widget.extra.imageUrl as string}
                  hotspots={((widget.extra?.hotspots as ImageHotspot[]) || [])}
                  onChange={(hotspots) => onUpdate({ ...widget, extra: { ...widget.extra, hotspots } })}
                />
              </div>
            )}

            {!widget.extra?.imageUrl && (
              <p className="text-[9px] text-muted-foreground">
                Faça upload de uma imagem (frontal do servidor, firewall, antena...) e depois adicione LEDs interativos mapeados para telemetry keys do Zabbix.
              </p>
            )}

            {widget.widget_type !== "image-map" && widget.extra?.imageUrl && (
              <p className="text-[9px] text-neon-amber">
                💡 Dica: mude o tipo do widget para "Image Map" na aba Dados para usar LEDs interativos no viewer.
              </p>
            )}
          </TabsContent>


          <TabsContent value="data" className="space-y-4 mt-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Tipo do widget</Label>
              <Input value={widget.widget_type} disabled className="h-7 text-xs" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Telemetry Key</Label>
              <Input
                value={widget.adapter.telemetry_key || ""}
                onChange={(e) => onUpdate({ ...widget, adapter: { ...widget.adapter, telemetry_key: e.target.value } })}
                placeholder="zbx:item:12345"
                className="h-7 text-[9px] font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Método Zabbix</Label>
              <Select
                value={widget.query.method}
                onValueChange={(v) => onUpdate({ ...widget, query: { ...widget.query, method: v } })}
              >
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["item.get", "history.get", "trigger.get", "problem.get", "host.get", "hostgroup.get", "trend.get"].map((m) => (
                    <SelectItem key={m} value={m} className="text-xs font-mono">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Params (JSON)</Label>
              <textarea
                value={JSON.stringify(widget.query.params, null, 2)}
                onChange={(e) => {
                  try {
                    const params = JSON.parse(e.target.value);
                    onUpdate({ ...widget, query: { ...widget.query, params } });
                  } catch { /* ignore parse errors while typing */ }
                }}
                className="w-full h-24 bg-background border border-border rounded-md p-2 text-[9px] font-mono text-foreground resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Value Field</Label>
              <Input
                value={widget.adapter.value_field || "lastvalue"}
                onChange={(e) => onUpdate({ ...widget, adapter: { ...widget.adapter, value_field: e.target.value } })}
                className="h-7 text-xs font-mono"
              />
            </div>
          </TabsContent>
        </Tabs>
      </ScrollArea>
    </div>
  );
}
