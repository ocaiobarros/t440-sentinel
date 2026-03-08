import { useState } from "react";
import type { ThresholdConfig, ThresholdStep } from "@/lib/threshold-engine";
import { createDefaultThresholds } from "@/lib/threshold-engine";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Thermometer } from "lucide-react";

interface Props {
  config?: ThresholdConfig;
  onChange: (config: ThresholdConfig | undefined) => void;
}

export default function ThresholdEditor({ config, onChange }: Props) {
  const [enabled, setEnabled] = useState(!!config);

  const handleToggle = (on: boolean) => {
    setEnabled(on);
    if (on && !config) {
      onChange(createDefaultThresholds());
    } else if (!on) {
      onChange(undefined);
    }
  };

  const updateStep = (idx: number, patch: Partial<ThresholdStep>) => {
    if (!config) return;
    const steps = [...config.steps];
    steps[idx] = { ...steps[idx], ...patch };
    onChange({ ...config, steps });
  };

  const addStep = () => {
    if (!config) return;
    const maxVal = config.steps.length ? Math.max(...config.steps.map((s) => s.value)) : 0;
    onChange({
      ...config,
      steps: [...config.steps, { value: maxVal + 10, color: "#A0A0A0", label: "" }],
    });
  };

  const removeStep = (idx: number) => {
    if (!config) return;
    onChange({ ...config, steps: config.steps.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-2 p-2 rounded-md border border-border/30 bg-accent/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Thermometer className="w-3 h-3 text-muted-foreground" />
          <span className="text-[9px] font-display text-muted-foreground uppercase tracking-wider">
            Thresholds
          </span>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>

      {enabled && config && (
        <div className="space-y-1.5">
          {/* Mode toggle */}
          <div className="flex items-center gap-2">
            <Label className="text-[9px] text-muted-foreground">Modo:</Label>
            <button
              type="button"
              onClick={() => onChange({ ...config, mode: "absolute" })}
              className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                config.mode === "absolute"
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "text-muted-foreground border-border/30 hover:border-foreground/30"
              }`}
            >
              Absoluto
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...config, mode: "percentage" })}
              className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                config.mode === "percentage"
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "text-muted-foreground border-border/30 hover:border-foreground/30"
              }`}
            >
              Percentual
            </button>
          </div>

          {/* Steps */}
          {[...config.steps]
            .sort((a, b) => a.value - b.value)
            .map((step, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                {/* Color swatch */}
                <input
                  type="color"
                  value={step.color}
                  onChange={(e) => updateStep(idx, { color: e.target.value })}
                  className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer shrink-0 p-0"
                />
                {/* Value */}
                <Input
                  type="number"
                  value={step.value}
                  onChange={(e) => updateStep(idx, { value: parseFloat(e.target.value) || 0 })}
                  className="h-5 w-16 text-[9px] font-mono px-1.5"
                  placeholder="≥"
                />
                {/* Label */}
                <Input
                  value={step.label || ""}
                  onChange={(e) => updateStep(idx, { label: e.target.value })}
                  className="h-5 text-[9px] flex-1 min-w-0 px-1.5"
                  placeholder="Label"
                />
                {/* Text color */}
                <input
                  type="color"
                  value={step.textColor || "#FFFFFF"}
                  onChange={(e) => updateStep(idx, { textColor: e.target.value })}
                  className="w-4 h-4 rounded border-0 bg-transparent cursor-pointer shrink-0 p-0"
                  title="Cor do texto"
                />
                <button
                  type="button"
                  onClick={() => removeStep(idx)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addStep}
            className="h-5 text-[9px] gap-1 w-full"
          >
            <Plus className="w-3 h-3" /> Adicionar faixa
          </Button>

          {/* Preview bar */}
          <div className="flex h-3 rounded overflow-hidden border border-border/30">
            {[...config.steps]
              .sort((a, b) => a.value - b.value)
              .map((step, idx) => (
                <div
                  key={idx}
                  className="flex-1 flex items-center justify-center"
                  style={{ background: step.color }}
                >
                  <span className="text-[7px] font-mono" style={{ color: step.textColor || "#fff" }}>
                    ≥{step.value}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
