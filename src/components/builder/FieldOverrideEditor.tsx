import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Layers } from "lucide-react";

export interface FieldOverrideRule {
  id: string;
  /** Field matcher: regex or exact field name */
  fieldMatch: string;
  /** What property to override */
  property: "unit" | "color" | "label" | "decimals" | "hidden";
  /** The override value */
  value: string;
}

interface Props {
  overrides: FieldOverrideRule[];
  onChange: (overrides: FieldOverrideRule[]) => void;
}

let _counter = 0;
function newId() {
  return `fo_${Date.now()}_${++_counter}`;
}

export default function FieldOverrideEditor({ overrides, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);

  const addRule = () => {
    onChange([...overrides, { id: newId(), fieldMatch: "", property: "unit", value: "" }]);
    setExpanded(true);
  };

  const updateRule = (id: string, patch: Partial<FieldOverrideRule>) => {
    onChange(overrides.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRule = (id: string) => {
    onChange(overrides.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-2 p-2 rounded-md border border-border/30 bg-accent/5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full"
      >
        <Layers className="w-3 h-3 text-muted-foreground" />
        <span className="text-[9px] font-display text-muted-foreground uppercase tracking-wider">
          Field Overrides
        </span>
        {overrides.length > 0 && (
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 ml-auto">
            {overrides.length}
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-2">
          {overrides.map((rule) => (
            <div key={rule.id} className="space-y-1 p-1.5 rounded border border-border/20 bg-background/50">
              <div className="flex items-center gap-1.5">
                <Input
                  value={rule.fieldMatch}
                  onChange={(e) => updateRule(rule.id, { fieldMatch: e.target.value })}
                  placeholder="Nome do campo ou regex"
                  className="h-5 text-[9px] font-mono flex-1 px-1.5"
                />
                <button
                  type="button"
                  onClick={() => removeRule(rule.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <Select
                  value={rule.property}
                  onValueChange={(v) => updateRule(rule.id, { property: v as FieldOverrideRule["property"] })}
                >
                  <SelectTrigger className="h-5 text-[9px] w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unit" className="text-xs">Unidade</SelectItem>
                    <SelectItem value="color" className="text-xs">Cor</SelectItem>
                    <SelectItem value="label" className="text-xs">Label</SelectItem>
                    <SelectItem value="decimals" className="text-xs">Decimais</SelectItem>
                    <SelectItem value="hidden" className="text-xs">Ocultar</SelectItem>
                  </SelectContent>
                </Select>
                {rule.property === "color" ? (
                  <input
                    type="color"
                    value={rule.value || "#39FF14"}
                    onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                    className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer p-0"
                  />
                ) : rule.property === "hidden" ? (
                  <span className="text-[9px] text-muted-foreground">Campo será oculto</span>
                ) : (
                  <Input
                    value={rule.value}
                    onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                    placeholder={rule.property === "unit" ? "Ex: data_rate/bps" : rule.property === "decimals" ? "2" : "Display name"}
                    className="h-5 text-[9px] font-mono flex-1 px-1.5"
                  />
                )}
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addRule}
            className="h-5 text-[9px] gap-1 w-full"
          >
            <Plus className="w-3 h-3" /> Adicionar override
          </Button>

          {overrides.length === 0 && (
            <p className="text-[8px] text-muted-foreground text-center py-1">
              Sobrescreva unidade, cor ou label para campos específicos em widgets multi-série
            </p>
          )}
        </div>
      )}
    </div>
  );
}
