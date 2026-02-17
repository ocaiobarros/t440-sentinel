import { useState, useRef, useCallback } from "react";
import type { ImageHotspot } from "@/types/builder";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Plus, Trash2, Target } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  imageUrl: string;
  hotspots: ImageHotspot[];
  onChange: (hotspots: ImageHotspot[]) => void;
}

export default function HotspotEditor({ imageUrl, hotspots, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  const selected = hotspots.find((h) => h.id === selectedId) ?? null;

  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isPlacing) return;
      const rect = imgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      const newHotspot: ImageHotspot = {
        id: crypto.randomUUID(),
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        telemetry_key: "",
        label: `LED ${hotspots.length + 1}`,
        size: 12,
        shape: "circle",
        default_color: "#39FF14",
      };
      onChange([...hotspots, newHotspot]);
      setSelectedId(newHotspot.id);
      setIsPlacing(false);
    },
    [isPlacing, hotspots, onChange],
  );

  const updateHotspot = (id: string, patch: Partial<ImageHotspot>) => {
    onChange(hotspots.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  };

  const deleteHotspot = (id: string) => {
    onChange(hotspots.filter((h) => h.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="space-y-3">
      {/* Image preview with hotspots */}
      <div
        ref={imgRef}
        onClick={handleImageClick}
        className={`relative rounded-md overflow-hidden border ${isPlacing ? "border-primary cursor-crosshair" : "border-border/50"}`}
      >
        <img src={imageUrl} alt="Device" className="w-full h-auto" draggable={false} />
        {hotspots.map((h) => (
          <div
            key={h.id}
            onClick={(e) => {
              e.stopPropagation();
              if (!isPlacing) setSelectedId(h.id);
            }}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all cursor-pointer ${
              selectedId === h.id ? "ring-2 ring-primary z-10" : "hover:scale-125"
            }`}
            style={{
              left: `${h.x}%`,
              top: `${h.y}%`,
              width: h.size || 12,
              height: h.shape === "bar-h" ? (h.size || 12) / 3 : h.shape === "bar-v" ? (h.size || 12) * 2 : h.size || 12,
              borderRadius: h.shape === "circle" ? "50%" : h.shape === "square" ? "2px" : "1px",
              backgroundColor: h.default_color || "#39FF14",
              boxShadow: `0 0 ${(h.size || 12) * 0.8}px ${h.default_color || "#39FF14"}`,
            }}
            title={h.label}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-1">
        <Button
          variant={isPlacing ? "default" : "outline"}
          size="sm"
          onClick={() => setIsPlacing(!isPlacing)}
          className="gap-1 text-[9px] flex-1"
        >
          <Target className="w-3 h-3" />
          {isPlacing ? "Clique na imagem..." : "Adicionar LED"}
        </Button>
      </div>

      {/* Hotspot list & editor */}
      <ScrollArea className="max-h-[250px]">
        <div className="space-y-1.5">
          {hotspots.map((h) => (
            <div
              key={h.id}
              onClick={() => setSelectedId(h.id)}
              className={`glass-card rounded-md p-2 cursor-pointer transition-all ${
                selectedId === h.id ? "border-primary/50" : "border-transparent hover:border-foreground/10"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: h.default_color || "#39FF14",
                      boxShadow: `0 0 6px ${h.default_color || "#39FF14"}`,
                    }}
                  />
                  <span className="text-[9px] font-mono truncate max-w-[100px]">{h.label}</span>
                </div>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteHotspot(h.id); }} className="h-5 w-5 text-destructive">
                  <Trash2 className="w-2.5 h-2.5" />
                </Button>
              </div>

              {/* Expanded editor */}
              {selectedId === h.id && (
                <div className="mt-2 space-y-2 border-t border-border/30 pt-2">
                  <div className="space-y-1">
                    <Label className="text-[9px] text-muted-foreground">Label</Label>
                    <Input value={h.label} onChange={(e) => updateHotspot(h.id, { label: e.target.value })} className="h-6 text-[9px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] text-muted-foreground">Telemetry Key</Label>
                    <Input
                      value={h.telemetry_key}
                      onChange={(e) => updateHotspot(h.id, { telemetry_key: e.target.value })}
                      placeholder="zbx:item:12345"
                      className="h-6 text-[9px] font-mono"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="space-y-1 flex-1">
                      <Label className="text-[9px] text-muted-foreground">Forma</Label>
                      <Select value={h.shape || "circle"} onValueChange={(v) => updateHotspot(h.id, { shape: v as ImageHotspot["shape"] })}>
                        <SelectTrigger className="h-6 text-[9px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="circle" className="text-[9px]">Círculo</SelectItem>
                          <SelectItem value="square" className="text-[9px]">Quadrado</SelectItem>
                          <SelectItem value="bar-h" className="text-[9px]">Barra H</SelectItem>
                          <SelectItem value="bar-v" className="text-[9px]">Barra V</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 flex-1">
                      <Label className="text-[9px] text-muted-foreground">Tamanho: {h.size || 12}px</Label>
                      <Slider
                        value={[h.size || 12]}
                        onValueChange={([v]) => updateHotspot(h.id, { size: v })}
                        min={4} max={40} step={2}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] text-muted-foreground">Cor padrão</Label>
                    <Input
                      type="color"
                      value={h.default_color || "#39FF14"}
                      onChange={(e) => updateHotspot(h.id, { default_color: e.target.value })}
                      className="h-6 w-10 p-0 border-0"
                    />
                  </div>
                  <div className="text-[8px] text-muted-foreground/70">
                    Pos: {h.x.toFixed(1)}% x {h.y.toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
