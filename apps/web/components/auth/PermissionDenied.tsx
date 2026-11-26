import Link from "next/link";

interface PermissionDeniedProps {
  title: string;
  message: string;
  hint: string;
}

/**
 * Full-height permission-denied region with 403 semantics. Rendered instead of
 * an empty table so a denied role never mistakes an authorization failure for
 * "no data yet".
 */
export function PermissionDenied({ title, message, hint }: PermissionDeniedProps) {
  return (
    <section className="wp3-state" role="region" aria-labelledby="permission-denied-title" data-testid="permission-denied">
      <h2 className="wp3-state__title" id="permission-denied-title">
        {title}
      </h2>
      <p className="wp3-state__body">{message}</p>
      <p className="wp3-state__body">{hint}</p>
      <div className="wp3-state__actions">
        <Link className="wp3-btn" href="/">
          Kembali ke beranda
        </Link>
      </div>
    </section>
  );
}
