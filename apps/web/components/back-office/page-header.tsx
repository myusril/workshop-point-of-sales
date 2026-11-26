import Link from "next/link";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Detail pages show "Kembali ke daftar" before the title. */
  backLink?: { href: string; label: string };
}

/**
 * Page header (§6.5): one `h1`, optional one-line description, one primary
 * action area aligned to the first line. Long titles wrap instead of clipping.
 */
export function PageHeader({ title, description, actions, backLink }: PageHeaderProps) {
  return (
    <header className="bo-page-header">
      <div className="bo-page-header__text">
        {backLink ? (
          <Link className="bo-back-link" href={backLink.href}>
            {backLink.label}
          </Link>
        ) : null}
        <h1 className="bo-page-header__title">{title}</h1>
        {description ? <p className="bo-page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="bo-page-header__actions">{actions}</div> : null}
    </header>
  );
}
