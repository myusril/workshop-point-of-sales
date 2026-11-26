import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Route the links point at, e.g. `/catalog`. */
  basePath: string;
  /** Current filters, so pagination keeps them. */
  query: Record<string, string | undefined>;
  /** Unit for the text summary, e.g. "produk & jasa". */
  label: string;
  pageSizes?: readonly number[];
}

const DEFAULT_PAGE_SIZES = [25, 50, 100] as const;

function hrefFor(
  basePath: string,
  query: Record<string, string | undefined>,
  page: number,
  pageSize: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value.length > 0) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return `${basePath}?${params.toString()}`;
}

/**
 * Explicit pagination (§6.7): page sizes 25/50/100, a text summary
 * ("1–25 dari 240"), labelled previous/next links, and no infinite scroll.
 * The current page is announced in text, not colour.
 */
export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  basePath,
  query,
  label,
  pageSizes = DEFAULT_PAGE_SIZES,
}: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const firstRow = total > 0 ? Math.min((page - 1) * pageSize + 1, total) : 0;
  const lastRow = total > 0 ? Math.min(page * pageSize, total) : 0;

  const summary =
    total === 0
      ? `Tidak ada ${label} untuk filter ini.`
      : `Menampilkan ${firstRow}–${lastRow} dari ${total} ${label}`;

  return (
    <nav className="bo-pagination" aria-label="Navigasi halaman">
      <span className="bo-pagination__summary">{summary}</span>

      <div className="bo-pagination__controls">
        <span className="bo-pagination__sizes">
          <span className="bo-muted">Baris per halaman</span>
          {pageSizes.map((size) => (
            <Link
              key={size}
              href={hrefFor(basePath, query, 1, size)}
              aria-current={size === pageSize ? "true" : undefined}
              aria-label={`Tampilkan ${size} baris per halaman`}
            >
              {size}
            </Link>
          ))}
        </span>

        <span className="bo-pagination__position bo-muted">
          Halaman {Math.min(page, safeTotalPages)} dari {safeTotalPages}
        </span>

        {page > 1 ? (
          <Link
            className={buttonVariants({ variant: "secondary" })}
            href={hrefFor(basePath, query, page - 1, pageSize)}
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft aria-hidden="true" />
            Sebelumnya
          </Link>
        ) : (
          <span className="bo-pagination__disabled" aria-disabled="true">
            <ChevronLeft aria-hidden="true" />
            Sebelumnya
          </span>
        )}

        {page < safeTotalPages ? (
          <Link
            className={buttonVariants({ variant: "secondary" })}
            href={hrefFor(basePath, query, page + 1, pageSize)}
            aria-label="Halaman berikutnya"
          >
            Berikutnya
            <ChevronRight aria-hidden="true" />
          </Link>
        ) : (
          <span className="bo-pagination__disabled" aria-disabled="true">
            Berikutnya
            <ChevronRight aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}
