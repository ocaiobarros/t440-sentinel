import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

interface ColorMapEntry {
  color: string;
  label?: string;
}

interface ColorMapEditorProps {
  /** e.g. { "0": "#FF4444", "1": "#39FF14" } or { "0": { color: "#FF4444", label: "DOWN" } } */
  colorMap: Record<string, unknown>;
  onChange: (map: Record<string, unknown>) => void;
  defaultColor?: string;
  onDefaultColorChange?: (color: string) => void;
}

function parseEntry(val: unknown): ColorMapEntry {
  if (typeof val === "string") return { color: val, label: "" };
  if (val && typeof val === "object" && "color" in (val as any)) {
    const v = val as ColorMapEntry;
    return { color: v.color, label: v.label || "" };
  }
  return { color: "#A0A0A0", label: "" };
}

export default function ColorMapEditor({ colorMap, onChange, defaultColor, onDefaultColorChange }: ColorMapEditorProps) {
  const [newValue, setNewValue] = useState("");
  const [newColor, setNewColor] = useState("#39FF14");
  const [newLabel, setNewLabel] = useState("");

  const entries = Object.entries(colorMap).map(([key, val]) => ({
    key,
    ...parseEntry(val),
  }));

  const addEntry = () => {
    if (newValue.trim() === "") return;
    const entry: ColorMapEntry = { color: newColor };
    if (newLabel.trim()) entry.label = newLabel.trim();
    onChange({ ...colorMap, [newValue.trim()]: entry.label ? entry : entry.color });
    setNewValue("");
    setNewLabel("");
  };

  const removeEntry = (key: string) => {
    const copy = { ...colorMap };
    delete copy[key];
    onChange(copy);
  };

  const updateColor = (key: string, color: string) => {
    const existing = parseEntry(colorMap[key]);
    existing.color = color;
    onChange({ ...colorMap, [key]: existing.label ? existing : existing.color });
  };

  const updateLabel = (key: string, label: string) => {
    const existing = parseEntry(colorMap[key]);
    existing.label = label;
    onChange({ ...colorMap, [key]: label ? existing : existing.color });
  };

  return (
    <div className="space-y-3">
      <Label className="text-[10px] text-muted-foreground">
        Mapeamento Valor → Cor / Label
      </Label>
      <p className="text-[8px] text-muted-foreground/70">
        Defina qual cor e nome exibir para cada valor do Zabbix. Ex: 1 = Verde / OPERACIONAL.
      </p>

      {/* Existing entries */}
      <div className="space-y-1.5">
        {entries.map(({ key, color, label }) => (
          <div key={key} className="flex items-center gap-1.5 group">
            <Input
              value={key}
              disabled
              className="h-6 text-[9px] font-mono w-12 flex-shrink-0"
            />
            <span className="text-[9px] text-muted-foreground">=</span>
            <div
              className="w-5 h-5 rounded-full border border-border/50 flex-shrink-0 cursor-pointer relative overflow-hidden"
              style={{ background: color }}
            >
              <Input
                type="color"
                value={color}
                onChange={(e) => updateColor(key, e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <Input
              value={label || ""}
              onChange={(e) => updateLabel(key, e.target.value)}
              placeholder="Label (ex: UP)"
              className="h-6 text-[9px] flex-1 min-w-0"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeEntry(key)}
              className="h-5 w-5 opacity-0 group-hover:opacity-100 text-neon-red flex-shrink-0"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Add new entry */}
      <div className="space-y-1.5 p-2 border border-dashed border-border/30 rounded-md">
        <div className="flex items-center gap-1.5">
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Valor (ex: 0)"
            className="h-6 text-[9px] font-mono w-16"
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
          />
          <div className="flex items-center gap-0.5">
            {["#FF4444", "#39FF14", "#FFBF00", "#3B82F6", "#8B5CF6"].map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`w-4 h-4 rounded-full border transition-all ${newColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
            <Input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="w-5 h-5 p-0 border-0 bg-transparent cursor-pointer"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label exibição (ex: OPERACIONAL)"
            className="h-6 text-[9px] flex-1"
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={addEntry}
            disabled={!newValue.trim()}
            className="h-6 w-6 text-neon-green flex-shrink-0"
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Default color */}
      {onDefaultColorChange && (
        <div className="flex items-center gap-2 pt-1 border-t border-border/20">
          <Label className="text-[9px] text-muted-foreground whitespace-nowrap">Cor padrão (sem match):</Label>
          <div
            className="w-4 h-4 rounded-full border border-border/50 relative overflow-hidden cursor-pointer"
            style={{ background: defaultColor || "#A0A0A0" }}
          >
            <Input
              type="color"
              value={defaultColor || "#A0A0A0"}
              onChange={(e) => onDefaultColorChange(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
          <span className="text-[8px] font-mono text-muted-foreground">{defaultColor || "#A0A0A0"}</span>
        </div>
      )}

      {entries.length === 0 && (
        <p className="text-[8px] text-muted-foreground/50 italic">
          Nenhum mapeamento definido. Adicione valores e cores acima.
        </p>
      )}
    </div>
  );
}
