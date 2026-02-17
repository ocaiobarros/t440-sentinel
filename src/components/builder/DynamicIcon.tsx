import { lazy, Suspense, useMemo } from "react";
import { icons, type LucideProps } from "lucide-react";

interface Props extends Omit<LucideProps, "ref"> {
  name: string;
}

/** Render any lucide icon by name string */
export default function DynamicIcon({ name, ...props }: Props) {
  const Icon = useMemo(() => {
    // Try exact match first, then PascalCase conversion
    const key = name as keyof typeof icons;
    if (icons[key]) return icons[key];

    // Try converting kebab-case to PascalCase
    const pascal = name
      .split(/[-_\s]+/)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join("") as keyof typeof icons;
    if (icons[pascal]) return icons[pascal];

    return null;
  }, [name]);

  if (!Icon) {
    return <span className="inline-block w-4 h-4 rounded-full bg-muted-foreground/20" />;
  }

  return <Icon {...props} />;
}

/** Get all available icon names */
export function getIconNames(): string[] {
  return Object.keys(icons);
}
