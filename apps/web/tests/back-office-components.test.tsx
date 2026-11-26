import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DataTable, type DataTableColumn } from "../components/back-office/data-table";
import { PageHeader } from "../components/back-office/page-header";
import { Pagination } from "../components/back-office/pagination";
import { EmptyState, ErrorState } from "../components/back-office/state-block";
import { StatusChip } from "../components/back-office/status-chip";
import {
  formatIdr,
  formatIdrDelta,
  formatStockDelta,
  formatStockQuantity,
  formatWibDate,
  formatWibDateTime,
} from "../lib/format";

describe("PageHeader", () => {
  it("renders one h1, the description, and the action area", () => {
    const html = renderToStaticMarkup(
      <PageHeader title="Produk & Jasa" description="Kelola spare part dan jasa." actions={<button type="button">Produk baru</button>} />,
    );

    expect(html.match(/<h1/g)?.length).toBe(1);
    expect(html).toContain("Produk &amp; Jasa");
    expect(html).toContain("Kelola spare part dan jasa.");
    expect(html).toContain("Produk baru");
  });

  it("keeps a long title in the heading instead of truncating it", () => {
    const longTitle = "Produk dan jasa dengan nama yang sangat panjang untuk menguji pembungkusan judul halaman";
    const html = renderToStaticMarkup(<PageHeader title={longTitle} />);

    expect(html).toContain(longTitle);
  });
});

describe("StatusChip", () => {
  it("carries the status text and a tone class, never colour alone", () => {
    const html = renderToStaticMarkup(<StatusChip tone="warning">Stok menipis</StatusChip>);

    expect(html).toContain("Stok menipis");
    expect(html).toContain("bo-chip--warning");
  });

  it("defaults to the neutral tone", () => {
    const html = renderToStaticMarkup(<StatusChip>Nonaktif</StatusChip>);

    expect(html).toContain("bo-chip--neutral");
    expect(html).toContain("Nonaktif");
  });
});

describe("Empty and error states", () => {
  it("distinguishes true zero from a fetch failure", () => {
    const emptyHtml = renderToStaticMarkup(
      <EmptyState title="Belum ada produk atau jasa.">Tambahkan produk pertama.</EmptyState>,
    );
    const errorHtml = renderToStaticMarkup(
      <ErrorState title="Data katalog gagal dimuat." actions={<button type="button">Coba lagi</button>}>
        Data gagal dimuat.
      </ErrorState>,
    );

    expect(emptyHtml).toContain("Belum ada produk atau jasa.");
    expect(emptyHtml).not.toContain('role="alert"');
    expect(errorHtml).toContain('role="alert"');
    expect(errorHtml).toContain("Coba lagi");
    expect(errorHtml).toContain("bo-state--danger");
  });

  it("renders an accompanying action and body copy", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="Tidak ada hasil." actions={<button type="button">Hapus filter</button>}>
        Katalog berhasil dibaca tetapi tidak ada item yang cocok.
      </EmptyState>,
    );

    expect(html).toContain("Hapus filter");
    expect(html).toContain("Katalog berhasil dibaca");
  });
});

describe("Pagination", () => {
  it("states the row range, page position, and page sizes in text", () => {
    const html = renderToStaticMarkup(
      <Pagination
        page={2}
        pageSize={25}
        total={240}
        totalPages={10}
        basePath="/catalog"
        query={{ q: "oli" }}
        label="produk & jasa"
      />,
    );

    expect(html).toContain("Menampilkan 26–50 dari 240 produk &amp; jasa");
    expect(html).toContain("Halaman 2 dari 10");
    expect(html).toContain("Halaman sebelumnya");
    expect(html).toContain("Halaman berikutnya");
    expect(html).toContain("Tampilkan 25 baris per halaman");
    expect(html).toContain("q=oli");
  });

  it("disables the previous link on the first page and the next link on the last page", () => {
    const firstPage = renderToStaticMarkup(
      <Pagination page={1} pageSize={25} total={40} totalPages={2} basePath="/catalog" query={{}} label="produk" />,
    );
    const lastPage = renderToStaticMarkup(
      <Pagination page={2} pageSize={25} total={40} totalPages={2} basePath="/catalog" query={{}} label="produk" />,
    );

    expect(firstPage).toContain('aria-disabled="true"');
    expect(firstPage).not.toContain('aria-label="Halaman sebelumnya"');
    expect(lastPage).toContain('aria-label="Halaman sebelumnya"');
    expect(lastPage).not.toContain('aria-label="Halaman berikutnya"');
  });

  it("reports an empty filter result without inventing rows", () => {
    const html = renderToStaticMarkup(
      <Pagination page={1} pageSize={25} total={0} totalPages={0} basePath="/inventory" query={{}} label="pergerakan stok" />,
    );

    expect(html).toContain("Tidak ada pergerakan stok untuk filter ini.");
    expect(html).not.toContain("Menampilkan 0–0");
  });
});

describe("formatters", () => {
  it("formats canonical digit strings as grouped rupiah without floats", () => {
    expect(formatIdr("1234567")).toBe("Rp\u00a01.234.567");
    expect(formatIdr("0")).toBe("Rp\u00a00");
    expect(formatIdrDelta("250000")).toBe("+Rp\u00a0250.000");
    expect(formatIdrDelta("0")).toBe("Rp\u00a00");
  });

  it("renders unknown or malformed money as an em dash, never a fake zero", () => {
    expect(formatIdr(null)).toBe("—");
    expect(formatIdr(undefined)).toBe("—");
    expect(formatIdr("")).toBe("—");
    expect(formatIdr("00123")).toBe("—");
    expect(formatIdr("12.5")).toBe("—");
  });

  it("formats WIB timestamps and dense dates from UTC input", () => {
    expect(formatWibDateTime("2026-11-26T07:05:00.000Z")).toBe("26 November 2026, 14.05 WIB");
    expect(formatWibDate("2026-11-26T07:05:00.000Z")).toBe("26 Nov 2026");
    expect(formatWibDateTime("not-a-date")).toBe("—");
  });

  it("uses the typographic minus for negative stock values", () => {
    expect(formatStockQuantity(-1)).toBe("\u22121");
    expect(formatStockQuantity(12)).toBe("12");
    expect(formatStockDelta(5)).toBe("+5");
    expect(formatStockDelta(-2)).toBe("\u22122");
    expect(formatStockDelta(0)).toBe("0");
  });
});

interface Row {
  id: string;
  name: string;
  stock: number;
}

const tableColumns: DataTableColumn<Row>[] = [
  { id: "name", header: "Nama", ariaSort: "ascending", cell: (row) => row.name },
  { id: "stock", header: "Stok", numeric: true, ariaSort: "none", cell: (row) => row.stock },
];

describe("DataTable", () => {
  it("renders a caption, scoped header, aria-sort, and the rows", () => {
    const html = renderToStaticMarkup(
      <DataTable
        caption="Daftar produk uji"
        columns={tableColumns}
        data={[{ id: "1", name: "Kampas rem depan", stock: 4 }]}
        getRowKey={(row) => row.id}
      />,
    );

    expect(html).toContain("Daftar produk uji");
    expect(html).toContain("scope=\"col\"");
    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain("Kampas rem depan");
    expect(html).toContain("bo-cell-num");
  });

  it("keeps the header and renders the empty state when there are no rows", () => {
    const html = renderToStaticMarkup(
      <DataTable
        caption="Buku besar"
        columns={tableColumns}
        data={[]}
        getRowKey={(row) => row.id}
        empty={<p>Belum ada pergerakan stok.</p>}
      />,
    );

    expect(html).toContain("Buku besar");
    expect(html).toContain("Belum ada pergerakan stok.");
    expect(html).toContain("<thead");
    expect(html).not.toContain("<tbody><tr");
  });
});
