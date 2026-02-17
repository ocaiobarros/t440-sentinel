import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  type?: string;
}

export default function WidgetSkeleton({ type }: Props) {
  return (
    <div className="glass-card rounded-lg p-4 h-full flex flex-col border border-border/50 animate-pulse">
      {/* Title skeleton */}
      <Skeleton className="h-3 w-24 mb-3 bg-muted/50" />
      
      {/* Content skeleton varies by type */}
      {type === "gauge" ? (
        <div className="flex-1 flex items-center justify-center">
          <Skeleton className="w-20 h-10 rounded-full bg-muted/30" />
        </div>
      ) : type === "timeseries" ? (
        <div className="flex-1 flex items-end gap-px">
          {[30, 45, 38, 52, 48, 60, 55, 42, 50, 35].map((h, i) => (
            <Skeleton key={i} className="flex-1 rounded-t bg-muted/30" style={{ height: `${h}%` }} />
          ))}
        </div>
      ) : type === "progress" ? (
        <div className="flex-1 flex flex-col justify-center gap-2">
          <div className="flex justify-between">
            <Skeleton className="h-2 w-16 bg-muted/30" />
            <Skeleton className="h-3 w-10 bg-muted/30" />
          </div>
          <Skeleton className="h-3 w-full rounded-full bg-muted/30" />
        </div>
      ) : type === "status" ? (
        <div className="flex-1 flex items-center justify-center gap-2">
          <Skeleton className="w-4 h-4 rounded-full bg-muted/30" />
          <Skeleton className="h-4 w-16 bg-muted/30" />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <Skeleton className="h-8 w-20 bg-muted/30" />
        </div>
      )}
    </div>
  );
}
