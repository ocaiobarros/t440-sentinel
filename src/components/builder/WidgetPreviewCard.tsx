import React, { useState } from "react";
import type { WidgetConfig } from "@/types/builder";
import DynamicIcon from "./DynamicIcon";
import { buildWidgetCSS, getGlassClass } from "@/lib/widget-style-utils";
import { MoreVertical, Copy, Settings2, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  widget: WidgetConfig;
  isSelected: boolean;
  onClick: (e?: React.MouseEvent) => void;
  isPreview?: boolean;
  onDuplicate?: (widget: WidgetConfig) => void;
  onEdit?: (widget: WidgetConfig) => void;
  onDelete?: (id: string) => void;
}

/** Use themed primary color, fallback to explicit style color */
const PRIMARY_CSS = "hsl(var(--primary))";

const WidgetPreviewCard = React.memo(function WidgetPreviewCard({ widget, isSelected, onClick, isPreview, onDuplicate, onEdit, onDelete }: Props) {
  const s = widget.style;
  const inlineCSS = buildWidgetCSS(s as any);
  const glassClass = getGlassClass(s as any);
  const selectedClass = isSelected ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : "";
  const isEditable = !isPreview && (onDuplicate || onEdit || onDelete);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={`h-full w-full rounded-lg border border-border/50 overflow-hidden cursor-pointer transition-all group/widget ${glassClass} ${selectedClass} ${isPreview ? "" : "hover:border-primary/30"}`}
      style={{
        ...inlineCSS,
        borderStyle: "solid",
      }}
    >
      {/* Title bar */}
      <div className="flex items-center gap-1.5 mb-1 widget-drag-handle cursor-grab active:cursor-grabbing relative" style={{ padding: `${(s.padding ?? 16) * 0.5}px ${s.padding ?? 16}px 0` }}>
        {s.icon && (
          <DynamicIcon
            name={s.icon}
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: s.iconColor || PRIMARY_CSS }}
          />
        )}
        <span
          className="text-[10px] uppercase tracking-wider truncate font-semibold flex-1"
          style={{
            fontFamily: s.titleFont || "'Orbitron', sans-serif",
            color: s.labelColor || s.textColor || "hsl(var(--muted-foreground))",
          }}
        >
          {widget.title}
        </span>

        {/* Context menu — edit mode only */}
        {isEditable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="opacity-0 group-hover/widget:opacity-100 transition-opacity h-5 w-5 rounded flex items-center justify-center
                  hover:bg-muted/40 text-muted-foreground hover:text-foreground z-20"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <MoreVertical className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-44 bg-card/95 backdrop-blur-xl border-border/50 z-50"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {onDuplicate && (
                <DropdownMenuItem onClick={() => onDuplicate(widget)} className="gap-2 text-xs cursor-pointer">
                  <Copy className="h-3.5 w-3.5" />
                  Duplicar
                  <span className="ml-auto text-[10px] text-muted-foreground/50 font-mono">Ctrl+D</span>
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(widget)} className="gap-2 text-xs cursor-pointer">
                  <Settings2 className="h-3.5 w-3.5" />
                  Editar
                  <span className="ml-auto text-[10px] text-muted-foreground/50 font-mono">Enter</span>
                </DropdownMenuItem>
              )}
              {(onDuplicate || onEdit) && onDelete && <DropdownMenuSeparator className="bg-border/30" />}
              {onDelete && (
                <DropdownMenuItem onClick={() => onDelete(widget.id)} className="gap-2 text-xs cursor-pointer text-destructive focus:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                  <span className="ml-auto text-[10px] text-muted-foreground/50 font-mono">Del</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Content area - type-specific preview */}
      <div
        className="flex items-center justify-center flex-1"
        style={{ padding: `4px ${s.padding ?? 16}px ${(s.padding ?? 16) * 0.5}px` }}
      >
        {renderTypePreview(widget)}
      </div>
    </div>
  );
});

export default WidgetPreviewCard;

function renderTypePreview(widget: WidgetConfig) {
  const s = widget.style;
  const accentColor = s.valueColor || PRIMARY_CSS;
  const valStyle: React.CSSProperties = {
    fontFamily: s.valueFont || "'JetBrains Mono', monospace",
    fontSize: s.valueFontSize || 24,
    color: accentColor,
  };

  switch (widget.widget_type) {
    case "stat":
      return (
        <div className="text-center">
          <div style={valStyle} className="font-bold">—</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">aguardando</div>
        </div>
      );
    case "gauge":
      return (
        <svg viewBox="0 0 100 60" className="w-full max-w-[80px]">
          <path d="M 10 55 A 40 40 0 0 1 90 55" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" strokeLinecap="round" />
          <path d="M 10 55 A 40 40 0 0 1 90 55" fill="none" stroke={accentColor} strokeWidth="6" strokeLinecap="round" strokeDasharray="125" strokeDashoffset="80" />
          <text x="50" y="50" textAnchor="middle" fill={accentColor} fontSize="12" fontFamily={s.valueFont || "'JetBrains Mono'"}>—</text>
        </svg>
      );
    case "timeseries":
      return (
        <div className="w-full h-full flex items-end gap-px opacity-40">
          {[30, 45, 38, 52, 48, 60, 55, 42].map((h, i) => (
            <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: accentColor }} />
          ))}
        </div>
      );
    case "table":
      return (
        <div className="w-full space-y-1 opacity-50">
          {[1, 2, 3].map((r) => (
            <div key={r} className="flex gap-2">
              <div className="h-2 flex-1 bg-muted rounded" />
              <div className="h-2 w-12 bg-muted rounded" />
            </div>
          ))}
        </div>
      );
    case "status":
      return (
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full pulse-green" style={{ background: accentColor }} />
          <span style={{ ...valStyle, fontSize: 16 }} className="font-bold">OK</span>
        </div>
      );
    case "progress":
      return (
        <div className="w-full">
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full w-[35%]" style={{ background: accentColor }} />
          </div>
        </div>
      );
    case "icon-value":
      return (
        <div className="flex items-center gap-3">
          {s.icon && <DynamicIcon name={s.icon} className="w-8 h-8" style={{ color: s.iconColor || PRIMARY_CSS }} />}
          <div style={valStyle} className="font-bold">—</div>
        </div>
      );
    case "image-map":
      return (
        <div className="w-full h-full relative overflow-hidden rounded">
          {widget.extra?.imageUrl ? (
            <img src={widget.extra.imageUrl as string} alt="Device" className="w-full h-full object-contain opacity-70" />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <span className="text-[9px]">Sem imagem</span>
            </div>
          )}
        </div>
      );
    case "traffic-light":
      return (
        <div className="flex flex-col gap-1 items-center">
          {["#FF4444", "#FFBF00"].map((c, i) => (
            <div key={i} className="w-3 h-3 rounded-full" style={{ background: `${c}30` }} />
          ))}
          <div className="w-3 h-3 rounded-full" style={{ background: accentColor }} />
        </div>
      );
    case "label":
      return (
        <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
          {widget.title}
        </span>
      );
    default:
      return <span className="text-xs text-muted-foreground">Widget</span>;
  }
}
