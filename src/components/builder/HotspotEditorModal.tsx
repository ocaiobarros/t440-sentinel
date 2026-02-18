import { useState, useRef, useCallback, useEffect } from "react";
import type { ImageHotspot } from "@/types/builder";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import ColorMapEditor from "./ColorMapEditor";
import {
  X, Save, Undo2, Target, Move, ZoomIn, ZoomOut, Maximize2,
  Trash2, Eye, EyeOff, Crosshair,
} from "lucide-react";

interface Props {
  imageUrl: string;
  hotspots: ImageHotspot[];
  onSave: (hotspots: ImageHotspot[]) => void;
  onDiscard: () => void;
}

export default function HotspotEditorModal({ imageUrl, hotspots: initial, onSave, onDiscard }: Props) {
  const [hotspots, setHotspots] = useState<ImageHotspot[]>(() => JSON.parse(JSON.stringify(initial)));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState(true);

  // Zoom & pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imgElRef = useRef<HTMLImageElement>(null);

  const selected = hotspots.find((h) => h.id === selectedId) ?? null;

  // ── Zoom helpers ──
  const zoomIn = () => setZoom((z) => Math.min(4, z + 0.25));
  const zoomOut = () => setZoom((z) => Math.max(0.5, z - 0.25));
  const zoomReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // ── Wheel zoom ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setZoom((z) => Math.max(0.5, Math.min(4, z + delta)));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // ── Spacebar hold for pan mode ──
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setSpaceHeld(false);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // ── Keyboard nudge ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selectedId) return;
      if (e.code === "Space") return; // handled above
      const step = e.shiftKey ? 0.5 : 0.1;
      let dx = 0, dy = 0;
      if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "Delete" || e.key === "Backspace") {
        deleteHotspot(selectedId);
        return;
      } else return;

      e.preventDefault();
      setHotspots((prev) =>
        prev.map((h) =>
          h.id === selectedId
            ? { ...h, x: Math.max(0, Math.min(100, +(h.x + dx).toFixed(1))), y: Math.max(0, Math.min(100, +(h.y + dy).toFixed(1))) }
            : h
        )
      );
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId]);

  // ── Pan: left-click drag (default mode, not placing/not on hotspot) OR spacebar+click ──
  const handlePanStart = useCallback((e: React.MouseEvent) => {
    // Don't pan if clicking on a hotspot element
    if ((e.target as HTMLElement).closest("[data-hotspot]")) return;
    
    // Pan conditions: left-click in default mode (not placing), OR spacebar held
    const canPan = e.button === 0 && (spaceHeld || !isPlacing);
    if (!canPan) return;

    // If not placing and not space-held, this is left-click pan (default navigation)
    // If placing and not space-held, don't pan — let click-to-place handle it
    if (isPlacing && !spaceHeld) return;

    e.preventDefault();
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [isPlacing, pan, spaceHeld]);

  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e: MouseEvent) => {
      setPan({
        x: panStart.current.panX + (e.clientX - panStart.current.x),
        y: panStart.current.panY + (e.clientY - panStart.current.y),
      });
    };
    const onUp = () => setIsPanning(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [isPanning]);

  // ── Get % position relative to the actual <img> element ──
  const getPercentFromImg = useCallback((clientX: number, clientY: number) => {
    const img = imgElRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }, []);

  // ── Click to place (only in placing mode) ──
  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingId || isPanning) return;
    if (!isPlacing) return;
    if (spaceHeld) return; // spacebar pan mode, don't place
    
    const pos = getPercentFromImg(e.clientX, e.clientY);
    if (!pos) return;
    const newH: ImageHotspot = {
      id: crypto.randomUUID(), x: pos.x, y: pos.y,
      telemetry_key: "", label: `LED ${hotspots.length + 1}`,
      size: 12, shape: "circle", default_color: "#39FF14",
      glowRadius: 1, blinkOnCritical: true, showValue: false,
    };
    setHotspots((prev) => [...prev, newH]);
    setSelectedId(newH.id);
    setIsPlacing(false);
  }, [isPlacing, draggingId, isPanning, spaceHeld, hotspots.length, getPercentFromImg]);

  // ── Drag hotspot (click on existing point) ──
  const handleDragStart = useCallback((e: React.MouseEvent, id: string) => {
    if (spaceHeld) return; // don't drag points during pan mode
    e.stopPropagation(); e.preventDefault();
    setDraggingId(id);
    const onMove = (ev: MouseEvent) => {
      const pos = getPercentFromImg(ev.clientX, ev.clientY);
      if (!pos) return;
      setHotspots((prev) => prev.map((h) => (h.id === id ? { ...h, x: pos.x, y: pos.y } : h)));
    };
    const onUp = () => { setDraggingId(null); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [getPercentFromImg, spaceHeld]);

  const updateHotspot = (id: string, patch: Partial<ImageHotspot>) => {
    setHotspots((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  };

  const deleteHotspot = (id: string) => {
    setHotspots((prev) => prev.filter((h) => h.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // Determine cursor
  const getCursor = () => {
    if (isPanning || spaceHeld) return "cursor-grab";
    if (isPlacing) return "cursor-crosshair";
    return "cursor-default";
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 glass-card-elevated shrink-0">
        <div className="flex items-center gap-3">
          <Crosshair className="w-4 h-4 text-primary" />
          <span className="text-sm font-display font-semibold">Hardware Twin — Editor</span>
          <span className="text-[10px] text-muted-foreground font-mono">{hotspots.length} LEDs</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 glass-card rounded-md px-2 py-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={zoomOut}><ZoomOut className="w-3 h-3" /></Button>
            <span className="text-[10px] font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={zoomIn}><ZoomIn className="w-3 h-3" /></Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={zoomReset}><Maximize2 className="w-3 h-3" /></Button>
          </div>

          {/* Live preview toggle */}
          <Button
            variant={livePreview ? "default" : "outline"}
            size="sm"
            className="gap-1 text-[10px] h-7"
            onClick={() => setLivePreview(!livePreview)}
          >
            {livePreview ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            Live
          </Button>

          {/* Place mode */}
          <Button
            variant={isPlacing ? "default" : "outline"}
            size="sm"
            className="gap-1 text-[10px] h-7"
            onClick={() => setIsPlacing(!isPlacing)}
          >
            <Target className="w-3 h-3" />
            {isPlacing ? "Clique na imagem..." : "Adicionar LED"}
          </Button>

          {/* Discard */}
          <Button variant="ghost" size="sm" className="gap-1 text-[10px] h-7 text-destructive" onClick={onDiscard}>
            <Undo2 className="w-3 h-3" /> Descartar
          </Button>

          {/* Save */}
          <Button size="sm" className="gap-1 text-[10px] h-7" onClick={() => onSave(hotspots)}>
            <Save className="w-3 h-3" /> Salvar & Fechar
          </Button>
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div
          ref={containerRef}
          className={`flex-1 overflow-hidden relative ${getCursor()}`}
          onMouseDown={handlePanStart}
        >
          {/* Transformed wrapper — only handles zoom/pan transform */}
          <div
            className="absolute transition-transform duration-100"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              left: "50%",
              top: "50%",
              marginLeft: "-40%",
              marginTop: "-35%",
              width: "80%",
            }}
          >
            {/* The image itself — used for coordinate calculations */}
            <div className="relative" onClick={handleImageClick}>
              <img
                ref={imgElRef}
                src={imageUrl}
                alt="Device"
                className="w-full h-auto select-none block"
                draggable={false}
              />
              {/* Hotspot overlays positioned relative to image */}
              {hotspots.map((h) => {
                const size = h.size || 12;
                const glowMul = h.glowRadius || 1;
                const height = h.shape === "bar-h" ? size / 3 : h.shape === "bar-v" ? size * 2 : size;
                const radius = h.shape === "circle" ? "50%" : h.shape === "square" ? "2px" : "1px";
                const color = h.default_color || "#39FF14";

                return (
                  <div
                    key={h.id}
                    data-hotspot
                    onMouseDown={(e) => handleDragStart(e, h.id)}
                    onClick={(e) => { e.stopPropagation(); if (!isPlacing) setSelectedId(h.id); }}
                    className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all ${
                      draggingId === h.id ? "cursor-grabbing z-20 scale-125" : "cursor-grab"
                    } ${selectedId === h.id ? "ring-2 ring-primary z-10" : "hover:scale-110"}`}
                    style={{ left: `${h.x}%`, top: `${h.y}%` }}
                  >
                    {/* Glow */}
                    {livePreview && (
                      <div
                        className="absolute inset-0"
                        style={{
                          width: size, height, borderRadius: radius,
                          boxShadow: `0 0 ${size * glowMul}px ${color}, 0 0 ${size * glowMul * 2}px ${color}50`,
                        }}
                      />
                    )}
                    {/* Core */}
                    <div
                      style={{
                        width: size, height, borderRadius: radius,
                        backgroundColor: color,
                        boxShadow: livePreview ? `inset 0 0 ${size / 3}px rgba(255,255,255,0.3)` : undefined,
                        border: !livePreview ? "1px solid hsl(var(--primary))" : undefined,
                      }}
                    />
                    {/* Label */}
                    <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none text-[8px] font-mono text-muted-foreground"
                      style={{ top: height + 3 }}
                    >
                      {h.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Help text */}
          <div className="absolute bottom-3 left-3 text-[9px] text-muted-foreground/60 flex flex-col gap-0.5 pointer-events-none">
            <span><Move className="w-2.5 h-2.5 inline mr-1" />Arraste para navegar • Scroll = Zoom</span>
            <span>Espaço+Drag = Pan alternativo</span>
            <span>⬆⬇⬅➡ Setas = nudge 0.1% (Shift = 0.5%)</span>
            <span>Use "Adicionar LED" para posicionar novos pontos</span>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="w-72 border-l border-border/30 glass-card flex flex-col shrink-0">
          <div className="px-3 py-2 border-b border-border/30">
            <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground">
              {selected ? `Editando: ${selected.label}` : "Selecione um LED"}
            </span>
          </div>

          <ScrollArea className="flex-1">
            {selected ? (
              <div className="p-3 space-y-3">
                {/* Label */}
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground">Label</Label>
                  <Input value={selected.label} onChange={(e) => updateHotspot(selected.id, { label: e.target.value })} className="h-7 text-[10px]" />
                </div>

                {/* Telemetry Key */}
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground">Telemetry Key</Label>
                  <Input
                    value={selected.telemetry_key}
                    onChange={(e) => updateHotspot(selected.id, { telemetry_key: e.target.value })}
                    placeholder="zbx:item:12345"
                    className="h-7 text-[10px] font-mono"
                  />
                </div>

                {/* Shape & Size */}
                <div className="flex gap-2">
                  <div className="space-y-1 flex-1">
                    <Label className="text-[9px] text-muted-foreground">Forma</Label>
                    <Select value={selected.shape || "circle"} onValueChange={(v) => updateHotspot(selected.id, { shape: v as ImageHotspot["shape"] })}>
                      <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="circle" className="text-[10px]">Círculo</SelectItem>
                        <SelectItem value="square" className="text-[10px]">Quadrado</SelectItem>
                        <SelectItem value="bar-h" className="text-[10px]">Barra H</SelectItem>
                        <SelectItem value="bar-v" className="text-[10px]">Barra V</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 flex-1">
                    <Label className="text-[9px] text-muted-foreground">Tamanho: {selected.size || 12}px</Label>
                    <Slider value={[selected.size || 12]} onValueChange={([v]) => updateHotspot(selected.id, { size: v })} min={4} max={40} step={2} />
                  </div>
                </div>

                {/* Glow Radius */}
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground">Raio do Glow: {selected.glowRadius || 1}x</Label>
                  <Slider value={[selected.glowRadius || 1]} onValueChange={([v]) => updateHotspot(selected.id, { glowRadius: v })} min={1} max={5} step={0.5} />
                </div>

                {/* Blink on Critical */}
                <div className="flex items-center justify-between">
                  <Label className="text-[9px] text-muted-foreground">Piscar em estado crítico</Label>
                  <Switch checked={selected.blinkOnCritical !== false} onCheckedChange={(v) => updateHotspot(selected.id, { blinkOnCritical: v })} />
                </div>

                {/* Show Value */}
                <div className="flex items-center justify-between">
                  <Label className="text-[9px] text-muted-foreground">Exibir valor sobre LED</Label>
                  <Switch checked={selected.showValue === true} onCheckedChange={(v) => updateHotspot(selected.id, { showValue: v })} />
                </div>

                {/* Default Color */}
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground">Cor padrão</Label>
                  <Input type="color" value={selected.default_color || "#39FF14"} onChange={(e) => updateHotspot(selected.id, { default_color: e.target.value })} className="h-7 w-12 p-0 border-0" />
                </div>

                {/* Color Map */}
                <ColorMapEditor
                  colorMap={selected.color_map || {}}
                  onChange={(map) => updateHotspot(selected.id, { color_map: map })}
                  defaultColor={selected.default_color || "#39FF14"}
                  onDefaultColorChange={(c) => updateHotspot(selected.id, { default_color: c })}
                />

                {/* Position info */}
                <div className="text-[8px] text-muted-foreground/60 font-mono pt-1 border-t border-border/20">
                  Pos: {selected.x.toFixed(1)}% × {selected.y.toFixed(1)}%
                </div>

                {/* Delete */}
                <Button variant="outline" size="sm" className="w-full gap-1 text-[10px] h-7 text-destructive border-destructive/30" onClick={() => deleteHotspot(selected.id)}>
                  <Trash2 className="w-3 h-3" /> Remover LED
                </Button>
              </div>
            ) : (
              <div className="p-3">
                {/* Hotspot list */}
                <div className="space-y-1">
                  {hotspots.length === 0 && (
                    <p className="text-[9px] text-muted-foreground text-center py-4">
                      Nenhum LED adicionado.<br />Clique em "Adicionar LED" e depois na imagem.
                    </p>
                  )}
                  {hotspots.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => setSelectedId(h.id)}
                      className="w-full flex items-center gap-2 glass-card rounded-md p-2 text-left hover:border-primary/30 transition-all"
                    >
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: h.default_color || "#39FF14", boxShadow: `0 0 6px ${h.default_color || "#39FF14"}` }} />
                      <span className="text-[10px] font-mono truncate flex-1">{h.label}</span>
                      <span className="text-[8px] text-muted-foreground/50">{h.x.toFixed(0)}%,{h.y.toFixed(0)}%</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>

          {selected && (
            <div className="p-2 border-t border-border/30">
              <Button variant="ghost" size="sm" className="w-full text-[10px] h-7" onClick={() => setSelectedId(null)}>
                ← Voltar à lista
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
