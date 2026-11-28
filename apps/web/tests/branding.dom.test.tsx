import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  brandInitials,
  homeBrandLabel,
  ProductBrand,
} from "../components/product-brand";

const LONG_NAME = `Bengkel Maju ${"S".repeat(67)}`;

describe("buyer branding mark (FR-071)", () => {
  it("falls back to the default text wordmark when no logo is stored", () => {
    const html = renderToStaticMarkup(
      <ProductBrand productName="Workshop POS" logoPath={null} />,
    );

    expect(html).toContain("Workshop POS");
    expect(html).not.toContain("<img");
    expect(html).toContain('class="product-brand__name"');
  });

  it("renders a saved product name instead of the placeholder", () => {
    const html = renderToStaticMarkup(
      <ProductBrand productName="Bengkel Maju" logoPath={null} />,
    );

    expect(html).toContain("Bengkel Maju");
    expect(html).not.toContain("Workshop POS");
  });

  it("renders the saved logo as a decorative image next to the name", () => {
    const html = renderToStaticMarkup(
      <ProductBrand productName="Bengkel Maju" logoPath="/logo.svg" />,
    );

    expect(html).toContain('src="/logo.svg"');
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Bengkel Maju");
  });

  it("keeps a blank or missing logo out of the markup", () => {
    const html = renderToStaticMarkup(
      <ProductBrand productName="Bengkel Maju" logoPath="" />,
    );

    expect(html).not.toContain("<img");
    expect(html).toContain("Bengkel Maju");
  });

  it("keeps an 80-character name whole in text and title so CSS can ellipsize", () => {
    expect(LONG_NAME).toHaveLength(80);

    const html = renderToStaticMarkup(
      <ProductBrand productName={LONG_NAME} logoPath={null} />,
    );

    expect(html).toContain(LONG_NAME);
    expect(html).toContain(`title="${LONG_NAME}"`);
    expect(html).toContain('class="product-brand__name"');
  });

  it("shows a compact logo in the collapsed rail and no name text", () => {
    const html = renderToStaticMarkup(
      <ProductBrand productName="Bengkel Maju" logoPath="/logo.svg" compact />,
    );

    expect(html).toContain("product-brand__logo--compact");
    expect(html).not.toContain("Bengkel Maju");
  });

  it("shows up to two initials when the collapsed rail has no logo", () => {
    const html = renderToStaticMarkup(
      <ProductBrand productName="Bengkel Maju" logoPath={null} compact />,
    );

    expect(html).toContain("BM");
    expect(html).toContain('aria-hidden="true"');
  });

  it("derives initials from the first two words, including a long name", () => {
    expect(brandInitials("Workshop POS")).toBe("WP");
    expect(brandInitials("Bengkel Maju Sejahtera")).toBe("BM");
    expect(brandInitials("Bengkel")).toBe("B");
    expect(brandInitials(LONG_NAME)).toBe("BM");
    expect(brandInitials("  bengkel   maju  ")).toBe("BM");
  });

  it("announces the home link with the product name and destination", () => {
    expect(homeBrandLabel("Bengkel Maju")).toBe("Bengkel Maju — Beranda");
  });
});
