import { useMemo } from "react";
import { icons, type LucideProps } from "lucide-react";
import { Icon } from "@iconify/react";

interface Props extends Omit<LucideProps, "ref"> {
  name: string;
}

/** Render any lucide icon by name string, or @iconify icon if it contains ":" */
export default function DynamicIcon({ name, ...props }: Props) {
  const isIconify = name.includes(":");

  const LucideIcon = useMemo(() => {
    if (isIconify) return null;
    const key = name as keyof typeof icons;
    if (icons[key]) return icons[key];

    const pascal = name
      .split(/[-_\s]+/)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join("") as keyof typeof icons;
    if (icons[pascal]) return icons[pascal];

    return null;
  }, [name, isIconify]);

  if (isIconify) {
    const { className, style } = props;
    return <Icon icon={name} className={className as string} style={style} />;
  }

  if (!LucideIcon) {
    return <span className="inline-block w-4 h-4 rounded-full bg-muted-foreground/20" />;
  }

  return <LucideIcon {...props} />;
}

/** Get all available icon names */
export function getIconNames(): string[] {
  return Object.keys(icons);
}
