/**
 * Buyer branding mark (FR-071).
 *
 * Presentational only: the back-office shell and the login card render the
 * same logo / name / initials rule, so a saved `productName` can never drift
 * between surfaces. No data access and no client hooks here — the callers own
 * the link wrapper, the accessible name, and the refresh path.
 */

interface ProductBrandProps {
  productName: string;
  logoPath: string | null;
  /** Collapsed rail or compact mark: logo only, else up to two initials. */
  compact?: boolean;
}

/** Up to two word initials, used when no logo is configured. */
export function brandInitials(productName: string): string {
  const words = productName.trim().split(/\s+/).filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("");
  return initials.toLocaleUpperCase("id-ID");
}

/** Accessible name of the shell's home link. */
export function homeBrandLabel(productName: string): string {
  return `${productName} — Beranda`;
}

export function ProductBrand({
  productName,
  logoPath,
  compact = false,
}: ProductBrandProps) {
  if (compact) {
    return logoPath ? (
      // Buyer-supplied path or arbitrary https URL: `next/image` would need a
      // configured remote host and an optimizer route per buyer domain.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="product-brand__logo product-brand__logo--compact"
        src={logoPath}
        alt=""
        aria-hidden="true"
      />
    ) : (
      <span className="product-brand__initials" aria-hidden="true">
        {brandInitials(productName)}
      </span>
    );
  }

  return (
    <>
      {logoPath ? (
        // See the compact branch above: the logo URL is buyer-configured.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="product-brand__logo" src={logoPath} alt="" aria-hidden="true" />
      ) : null}
      <span className="product-brand__name" title={productName}>
        {productName}
      </span>
    </>
  );
}
