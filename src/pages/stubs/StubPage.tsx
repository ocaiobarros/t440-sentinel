import { Construction } from "lucide-react";
import { useLocation } from "react-router-dom";

export default function StubPage() {
  const location = useLocation();
  const segment = location.pathname.split("/").filter(Boolean).pop() ?? "";
  const title = segment.charAt(0).toUpperCase() + segment.slice(1);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
      <Construction className="w-12 h-12 text-muted-foreground/40" />
      <h2 className="text-lg font-display font-bold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        Este módulo está em desenvolvimento e será liberado em breve.
      </p>
    </div>
  );
}
