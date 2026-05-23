import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsLoadingProps {
  label?: string;
  className?: string;
  height?: number;
}

/**
 * Unified loading indicator for stats cards.
 * Shows a spinner + reassuring text so users know data is being fetched.
 */
export const StatsLoading = ({ label = "데이터를 불러오는 중입니다...", className, height = 220 }: StatsLoadingProps) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20",
        className,
      )}
      style={{ minHeight: height }}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      <p className="text-xs sm:text-sm text-muted-foreground">{label}</p>
    </div>
  );
};

export default StatsLoading;
