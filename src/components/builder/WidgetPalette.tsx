import { WIDGET_TYPES, createDefaultWidget, type WidgetConfig } from "@/types/builder";
import DynamicIcon from "./DynamicIcon";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";

interface Props {
  onAddWidget: (widget: WidgetConfig) => void;
}

export default function WidgetPalette({ onAddWidget }: Props) {
  return (
    <div className="space-y-2">
      <h3 className="text-[10px] font-display uppercase tracking-widest text-muted-foreground px-1">
        Widgets
      </h3>
      <div className="grid grid-cols-2 gap-1.5">
        {WIDGET_TYPES.map((wt) => (
          <motion.button
            key={wt.type}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onAddWidget(createDefaultWidget(wt.type))}
            className="glass-card rounded-md p-2.5 text-left hover:border-neon-green/30 transition-colors group cursor-pointer border border-transparent"
          >
            <div className="flex items-center gap-2 mb-1">
              <DynamicIcon name={wt.icon} className="w-3.5 h-3.5 text-neon-green group-hover:text-glow-green" />
              <span className="text-[10px] font-display font-semibold text-foreground">{wt.label}</span>
            </div>
            <p className="text-[9px] text-muted-foreground leading-tight">{wt.description}</p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
