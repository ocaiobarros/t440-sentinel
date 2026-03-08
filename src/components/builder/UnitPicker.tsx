import { useState, useMemo } from "react";
import { UNIT_CATEGORIES, mapZabbixUnit, getUnitById } from "@/lib/unit-library";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Ruler, X } from "lucide-react";

interface Props {
  /** Currently selected unit ID (e.g. "data_rate/bps") */
  value?: string;
  /** Zabbix-provided unit string for auto-mapping */
  zabbixUnit?: string;
  /** Callback when user picks a unit */
  onChange: (unitId: string | undefined) => void;
}

export default function UnitPicker({ value, zabbixUnit, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Auto-map Zabbix unit as suggestion
  const autoMapped = useMemo(() => {
    if (value) return null; // user already chose
    return zabbixUnit ? mapZabbixUnit(zabbixUnit) : null;
  }, [value, zabbixUnit]);

  const effectiveValue = value || autoMapped || undefined;
  const selectedUnit = effectiveValue ? getUnitById(effectiveValue) : undefined;

  const filtered = useMemo(() => {
    if (!search.trim()) return UNIT_CATEGORIES;
    const q = search.toLowerCase();
    return UNIT_CATEGORIES
      .map((cat) => ({
        ...cat,
        units: cat.units.filter(
          (u) =>
            u.label.toLowerCase().includes(q) ||
            u.id.toLowerCase().includes(q) ||
            cat.label.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.units.length > 0);
  }, [search]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Ruler className="w-3 h-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">Unidade (Unit)</span>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between h-7 px-2 rounded-md border border-border/50 bg-background text-xs hover:border-primary/50 transition-colors"
          >
            {selectedUnit ? (
              <span className="font-mono text-[10px] truncate">
                {selectedUnit.label}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">Auto-detect</span>
            )}
            {autoMapped && !value && (
              <span className="text-[8px] px-1 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 ml-1 shrink-0">
                Zabbix
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start" sideOffset={4}>
          <div className="p-2 border-b border-border/30">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar unidade..."
                className="h-7 text-xs pl-7"
                autoFocus
              />
            </div>
          </div>

          <ScrollArea className="max-h-64">
            {/* Clear option */}
            <button
              type="button"
              onClick={() => { onChange(undefined); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors text-muted-foreground"
            >
              <X className="w-3 h-3" />
              Auto-detect (sem override)
            </button>

            {filtered.map((cat) => (
              <div key={cat.id}>
                <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-muted-foreground font-display bg-muted/30 sticky top-0">
                  {cat.icon} {cat.label}
                </div>
                {cat.units.map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    onClick={() => {
                      onChange(unit.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors ${
                      effectiveValue === unit.id ? "bg-primary/10 text-primary" : ""
                    }`}
                  >
                    <span className="font-mono text-[10px]">{unit.label}</span>
                    {unit.steps.length > 1 && (
                      <span className="text-[8px] text-muted-foreground">
                        {unit.steps.map((s) => s.suffix.trim()).filter(Boolean).join(" → ")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                Nenhuma unidade encontrada
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {autoMapped && !value && (
        <p className="text-[8px] text-primary/60 font-mono">
          Mapeado do Zabbix: "{zabbixUnit}" → {getUnitById(autoMapped)?.label}
        </p>
      )}
    </div>
  );
}
