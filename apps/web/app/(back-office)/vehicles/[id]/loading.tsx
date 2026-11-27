import { TableSkeleton } from "@/components/back-office/table-skeleton";

/**
 * Route-level loading state for the vehicle history page. The plate is not
 * known until the request resolves, so only the generic heading and skeleton
 * geometry render; nothing is invented.
 */
export default function VehicleHistoryLoading() {
  return (
    <main className="bo-page">
      <header className="bo-page-header">
        <div className="bo-page-header__text">
          <h1 className="bo-page-header__title">Riwayat kendaraan</h1>
        </div>
      </header>
      <div className="bo-stack">
        <TableSkeleton label="Memuat riwayat…" testId="vehicle-history-loading" withFilterBar={false} />
      </div>
    </main>
  );
}
