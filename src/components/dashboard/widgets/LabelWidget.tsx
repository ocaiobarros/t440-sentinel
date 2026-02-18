import { useMemo } from "react";

interface Props {
  title: string;
  config?: Record<string, unknown>;
}

export default function LabelWidget({ title, config }: Props) {
  const styleConfig = (config?.style as Record<string, unknown>) || {};
  const textColor = styleConfig.textColor as string | undefined;
  const titleFont = styleConfig.titleFont as string | undefined;
  const labelFontSize = styleConfig.labelFontSize as number | undefined;
  const valueFontSize = styleConfig.valueFontSize as number | undefined;
  const labelColor = styleConfig.labelColor as string | undefined;

  const fontSize = valueFontSize || labelFontSize || 14;
  const color = textColor || labelColor || undefined;

  const style = useMemo((): React.CSSProperties => ({
    fontSize,
    color,
    fontFamily: titleFont || "'Orbitron', sans-serif",
    textShadow: color
      ? `0 0 8px ${color}80, 0 0 20px ${color}40`
      : "0 0 6px hsl(var(--muted-foreground) / 0.3)",
  }), [fontSize, color, titleFont]);

  return (
    <div className="h-full flex items-center justify-center p-2">
      <span
        className="font-display uppercase tracking-widest text-muted-foreground text-center"
        style={style}
      >
        {title}
      </span>
    </div>
  );
}
