const SKELETON_ROWS = 5;

interface PageSkeletonProps {
  /** Loading copy in Bahasa Indonesia, e.g. "Memuat pengguna…". */
  label: string;
  /** Stable hook for component tests and E2E assertions. */
  testId: string;
  /** The users screen renders a filter bar between the panel header and rows. */
  withFilterBar?: boolean;
}

/**
 * Suspense fallback for the back-office list screens. It repeats the loaded
 * panel structure (header, optional filter bar, rows, form panel) so the real
 * content replaces it without a layout jump, and it deliberately offers no
 * actions while data is still in flight. Only `label` is exposed to assistive
 * tech; the shapes below it are decorative.
 */
export function PageSkeleton({ label, testId, withFilterBar = false }: PageSkeletonProps) {
  return (
    <div className="wp3-loading" role="status" aria-busy="true" data-testid={testId}>
      <section className="wp3-panel">
        <div className="wp3-panel__header">
          <h2 className="wp3-panel__title">{label}</h2>
        </div>
        <div aria-hidden="true">
          {withFilterBar ? (
            <div className="wp3-filterbar">
              <div className="wp3-skeleton-field" />
              <div className="wp3-skeleton-field" />
              <div className="wp3-skeleton-field" />
              <div className="wp3-skeleton-action" />
            </div>
          ) : null}
          <div className="wp3-panel__body">
            <div className="wp3-skeleton-stack">
              {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <div className="wp3-skeleton-row" key={index} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="wp3-panel" aria-hidden="true">
        <div className="wp3-panel__header">
          <div className="wp3-skeleton-title" />
        </div>
        <div className="wp3-panel__body">
          <div className="wp3-skeleton-stack">
            <div className="wp3-skeleton-line" />
            <div className="wp3-skeleton-line" />
          </div>
        </div>
      </section>
    </div>
  );
}
