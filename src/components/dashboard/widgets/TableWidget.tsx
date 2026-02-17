import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { TelemetryTableData } from "@/types/telemetry";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
}

export default function TableWidget({ telemetryKey, title, cache }: Props) {
  const { data } = useWidgetData({ telemetryKey, cache });
  const tableData = data as TelemetryTableData | null;

  return (
    <div className="glass-card rounded-lg p-4 h-full flex flex-col border border-border/50">
      <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </span>
      <ScrollArea className="flex-1 min-h-0">
        {tableData?.columns && tableData.rows ? (
          <Table>
            <TableHeader>
              <TableRow className="border-border/30 hover:bg-transparent">
                {tableData.columns.map((col, i) => (
                  <TableHead key={i} className="text-[10px] font-display uppercase text-muted-foreground py-1 px-2 h-auto">
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.rows.map((row, ri) => (
                <TableRow key={ri} className="border-border/20 hover:bg-accent/30">
                  {(row as unknown[]).map((cell, ci) => (
                    <TableCell key={ci} className="text-xs font-mono py-1 px-2">
                      {String(cell ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground/50 text-xs font-mono">
            Aguardando dados…
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
