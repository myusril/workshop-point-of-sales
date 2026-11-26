import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  /** Bahasa loading copy, e.g. "Memuat produk…". */
  label: string;
  testId: string;
  rows?: number;
  withFilterBar?: boolean;
}

/**
 * Suspense fallback that mirrors the catalog/inventory panel geometry: the
 * filter bar stays 56 px, each row is 44 px, so content swaps in without a
 * layout shift. Only the label reaches assistive technology.
 */
export function TableSkeleton({ label, testId, rows = 6, withFilterBar = true }: TableSkeletonProps) {
  return (
    <div className="bo-panel" role="status" aria-busy="true" data-testid={testId}>
      <div className="bo-panel__header">
        <h2 className="bo-panel__title">{label}</h2>
      </div>
      {withFilterBar ? (
        <div className="bo-filterbar" aria-hidden="true">
          <Skeleton className="h-11 w-full max-w-[280px] flex-1" />
          <Skeleton className="h-11 w-full max-w-[220px] flex-1" />
          <Skeleton className="h-11 w-36" />
        </div>
      ) : null}
      <div aria-hidden="true">
        <div className="bo-skeleton-row bo-skeleton-row--flush" />
        {Array.from({ length: rows }, (_, index) => (
          <div className="bo-skeleton-row bo-skeleton-row--flush" key={index} />
        ))}
      </div>
    </div>
  );
}
