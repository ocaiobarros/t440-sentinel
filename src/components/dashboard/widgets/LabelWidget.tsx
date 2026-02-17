interface Props {
  title: string;
  config?: Record<string, unknown>;
}

export default function LabelWidget({ title, config }: Props) {
  return (
    <div className="h-full flex items-center justify-center p-2">
      <span
        className="font-display uppercase tracking-widest text-muted-foreground text-center"
        style={{
          fontSize: (config?.style as any)?.valueFontSize || 14,
          color: (config?.style as any)?.textColor || undefined,
          fontFamily: (config?.style as any)?.titleFont || "'Orbitron', sans-serif",
        }}
      >
        {title}
      </span>
    </div>
  );
}
