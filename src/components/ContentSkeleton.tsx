import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

/**
 * Content-area-only skeleton shown inside the persistent dashboard layout
 * while a lazy page chunk loads (no full-screen wrapper).
 */
const ContentSkeleton = () => (
  <div className="relative w-full min-w-0" role="status" aria-live="polite" aria-busy="true">
    <div className="sticky top-4 z-10 mb-5 flex justify-center">
      <div className="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">데이터를 불러오는 중입니다...</p>
      </div>
    </div>
    <div className="mb-6 space-y-2">
      <Skeleton className="h-7 w-48 sm:h-8 sm:w-64" />
      <Skeleton className="h-4 w-72 sm:w-96" />
    </div>
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-2 w-full" />
        </div>
      ))}
    </div>
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-6">
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border/60 pb-3 last:border-0">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default ContentSkeleton;
