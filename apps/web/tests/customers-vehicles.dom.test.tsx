import {
  ANONYMIZED_CUSTOMER_NAME,
  CUSTOMER_PAGE_SIZES,
  HISTORY_PAGE_SIZES,
  vehicleListQuerySchema,
  type CustomerListItem,
  type HistoryOrder,
  type VehicleListItem,
} from "@workshop-pos/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Pagination } from "../components/back-office/pagination";
import {
  CustomersEmptyState,
  CustomersErrorPanel,
  CustomersFilteredEmptyState,
  CustomersOutOfRangeState,
} from "../components/customers/customer-states";
import { CustomersTable } from "../components/customers/customers-table";
import {
  CustomerPickerResults,
  type CustomerPickerResultState,
} from "../components/vehicles/customer-picker";
import { VehicleHistoryTable } from "../components/vehicles/history-table";
import { VehicleFilter } from "../components/vehicles/vehicle-filter";
import {
  VehicleHistoryEmptyState,
  VehicleHistoryOutOfRangeState,
  VehiclesEmptyState,
  VehiclesErrorPanel,
  VehiclesFilteredEmptyState,
  VehiclesOutOfRangeState,
} from "../components/vehicles/vehicle-states";
import { VehicleReuseNotice } from "../components/vehicles/vehicle-form";
import { VehiclesTable } from "../components/vehicles/vehicles-table";

const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const VEHICLE_ID = "22222222-2222-4222-8222-222222222222";
const OUTLET_ID = "b0000000-0000-4000-8000-000000000002";

const maskedCustomer: CustomerListItem = {
  id: CUSTOMER_ID,
  name: "Budi Santoso",
  anonymizedAt: null,
  createdAt: "2026-11-20T03:00:00.000Z",
  updatedAt: "2026-11-26T07:05:00.000Z",
  phoneMasked: "0812••••7890",
  vehicleCount: 2,
};

const anonymizedCustomer: CustomerListItem = {
  ...maskedCustomer,
  id: "33333333-3333-4333-8333-333333333333",
  name: ANONYMIZED_CUSTOMER_NAME,
  anonymizedAt: "2026-11-26T08:00:00.000Z",
  phoneMasked: "",
  vehicleCount: 1,
};

const vehicle: VehicleListItem = {
  id: VEHICLE_ID,
  normalizedPlate: "B1234XYZ",
  brand: "Honda",
  model: "Beat",
  year: 2020,
  color: null,
  odometer: 12_345,
  customerId: CUSTOMER_ID,
  customerName: "Budi Santoso",
  customerAnonymized: false,
  createdAt: "2026-11-20T03:00:00.000Z",
  updatedAt: "2026-11-26T07:05:00.000Z",
};

const unpaidOrder: HistoryOrder = {
  id: "44444444-4444-4444-8444-444444444444",
  orderNumber: "INV-2026-0001",
  kind: "SERVICE",
  status: "COMPLETED",
  createdAt: "2026-11-26T07:05:00.000Z",
  completedAt: "2026-11-26T09:00:00.000Z",
  paidAt: null,
  outletId: OUTLET_ID,
  outletName: "Outlet Pusat",
  odometer: 12_000,
  total: "150000",
  paidTotal: "0",
  balanceDue: "150000",
  paymentStatus: "UNPAID",
  lines: [{ lineType: "SERVICE", description: "Ganti oli", quantity: 2, lineTotal: "50000" }],
};

const partialOrder: HistoryOrder = {
  ...unpaidOrder,
  id: "66666666-6666-4666-8666-666666666666",
  orderNumber: "INV-2026-0003",
  paidTotal: "50000",
  balanceDue: "100000",
  paymentStatus: "PARTIAL",
};

const voidedOrder: HistoryOrder = {
  ...unpaidOrder,
  id: "55555555-5555-4555-8555-555555555555",
  orderNumber: "INV-2026-0002",
  status: "VOID",
  total: "90000",
  paidTotal: "0",
  balanceDue: "0",
  paymentStatus: "VOID",
  lines: [],
};

const manyLinesOrder: HistoryOrder = {
  ...unpaidOrder,
  lines: Array.from({ length: 5 }, (_, index) => ({
    lineType: "SERVICE" as const,
    description: `Jasa ${index + 1}`,
    quantity: 1,
    lineTotal: "10000",
  })),
};

describe("customer list", () => {
  it("renders only the masked phone in the table", () => {
    const html = renderToStaticMarkup(
      <CustomersTable
        items={[maskedCustomer]}
        canManageCustomers
        canManagePersonalData
        empty={null}
      />,
    );

    expect(html).toContain("0812••••7890");
    expect(html).not.toContain("081234567890");
    expect(html).toContain("Daftar pelanggan");
  });

  it("links the vehicle count to the filtered vehicle list", () => {
    const html = renderToStaticMarkup(<CustomersTable items={[maskedCustomer]} canManageCustomers={false} canManagePersonalData={false} />);

    expect(html).toContain(`href="/vehicles?customerId=${CUSTOMER_ID}"`);
    expect(html).toContain('aria-label="Lihat 2 kendaraan Budi Santoso"');
  });

  it("shows the anonymized sentinel, chip, and an em dash for the phone", () => {
    const html = renderToStaticMarkup(
      <CustomersTable items={[anonymizedCustomer]} canManageCustomers={false} canManagePersonalData />,
    );

    expect(html).toContain(ANONYMIZED_CUSTOMER_NAME);
    expect(html).toContain("Dianonimkan");
    expect(html).toContain("bo-chip");
    expect(html).toContain(">—<");
    expect(html).not.toContain("0812••••7890");
  });

  it("keeps two row actions at most and never offers Ubah or Anonimkan in the row", () => {
    const html = renderToStaticMarkup(
      <CustomersTable
        items={[maskedCustomer, anonymizedCustomer]}
        canManageCustomers
        canManagePersonalData
      />,
    );

    // Active row: Ubah + Data pribadi. Anonymized row: Data pribadi only.
    expect(html.match(/bo-icon-button/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Ubah Budi Santoso"');
    expect(html).toContain('aria-label="Data pribadi Budi Santoso"');
    expect(html).toContain(`aria-label="Data pribadi ${ANONYMIZED_CUSTOMER_NAME}"`);
    expect(html).not.toContain(`aria-label="Ubah ${ANONYMIZED_CUSTOMER_NAME}"`);
    expect(html).not.toContain('aria-label="Anonimkan');
    expect(html).not.toContain('aria-label="Ekspor data');
  });

  it("keeps the personal-data action for an already anonymized record", () => {
    const html = renderToStaticMarkup(
      <CustomersTable items={[anonymizedCustomer]} canManageCustomers canManagePersonalData />,
    );

    expect(html).toContain(`aria-label="Data pribadi ${ANONYMIZED_CUSTOMER_NAME}"`);
    expect(html).toContain("Dianonimkan");
  });

  it("offers no personal-data action to a role without the permission", () => {
    const html = renderToStaticMarkup(
      <CustomersTable items={[maskedCustomer]} canManageCustomers canManagePersonalData={false} />,
    );

    expect(html).toContain('aria-label="Ubah Budi Santoso"');
    expect(html).not.toContain("Data pribadi");
  });

  it("renders no action column for a role that may only read", () => {
    const html = renderToStaticMarkup(
      <CustomersTable items={[maskedCustomer]} canManageCustomers={false} canManagePersonalData={false} />,
    );

    expect(html).not.toContain("Aksi");
    expect(html).toContain("Budi Santoso");
  });
});

describe("customer states", () => {
  it("distinguishes true zero, filtered empty, out-of-range, and a failed read", () => {
    const emptyHtml = renderToStaticMarkup(
      <CustomersEmptyState canManage createAction={<button type="button">Tambahkan pelanggan</button>} />,
    );
    expect(emptyHtml).toContain("Belum ada pelanggan.");
    expect(emptyHtml).toContain("Tambahkan pelanggan");
    expect(emptyHtml).not.toContain('role="alert"');

    const readOnlyHtml = renderToStaticMarkup(<CustomersEmptyState canManage={false} />);
    expect(readOnlyHtml).toContain("Hanya Pemilik, Admin, atau Kasir yang dapat menambahkan pelanggan.");
    expect(readOnlyHtml).not.toContain("Tambahkan pelanggan pertama");

    const filteredHtml = renderToStaticMarkup(
      <CustomersFilteredEmptyState query="budi" resetHref="/customers" />,
    );
    expect(filteredHtml).toContain("Tidak ada pelanggan untuk &quot;budi&quot;.");
    expect(filteredHtml).toContain("Hapus pencarian");

    const outOfRangeHtml = renderToStaticMarkup(
      <CustomersOutOfRangeState total={60} pageOneHref="/customers?q=budi" />,
    );
    expect(outOfRangeHtml).toContain("Halaman ini tidak berisi pelanggan.");
    expect(outOfRangeHtml).toContain("Daftar berisi 60 pelanggan.");
    expect(outOfRangeHtml).toContain('href="/customers?q=budi"');
    expect(outOfRangeHtml).toContain("Ke halaman pertama");
    expect(outOfRangeHtml).not.toContain("Belum ada pelanggan.");

    const errorHtml = renderToStaticMarkup(
      <CustomersErrorPanel
        message="Data pelanggan gagal dimuat. Periksa koneksi, lalu coba lagi."
        retryHref="/customers"
      />,
    );
    expect(errorHtml).toContain("Data pelanggan gagal dimuat.");
    expect(errorHtml).toContain('role="alert"');
    expect(errorHtml).toContain("Coba lagi");
    expect(errorHtml).not.toContain("0 pelanggan");
  });
});

describe("vehicle list", () => {
  it("renders the canonical plate as a 44 px link to its history", () => {
    const html = renderToStaticMarkup(
      <VehiclesTable items={[vehicle]} canManageVehicles empty={null} />,
    );

    expect(html).toContain("bo-cell-mono");
    expect(html).toContain("inline-flex min-h-11 items-center");
    expect(html).toContain(">B1234XYZ<");
    expect(html).toContain(`href="/vehicles/${VEHICLE_ID}"`);
    expect(html).toContain("Honda Beat");
    expect(html).toContain("12.345 km");
    expect(html).toContain("Budi Santoso");
  });

  it("hides the edit action for a read-only role", () => {
    const html = renderToStaticMarkup(
      <VehiclesTable items={[vehicle]} canManageVehicles={false} empty={null} />,
    );

    expect(html).not.toContain("Aksi");
    expect(html).not.toContain(`aria-label="Ubah B1234XYZ"`);
  });

  it("names the existing owner and flags a different selected customer", () => {
    const sameOwnerHtml = renderToStaticMarkup(
      <VehicleReuseNotice
        vehicleId={VEHICLE_ID}
        plate="B1234XYZ"
        ownerName="Budi Santoso"
        selectedCustomerName="Budi Santoso"
        differentOwner={false}
        onOpen={() => undefined}
      />,
    );

    expect(sameOwnerHtml).toContain("Kendaraan dengan plat ini sudah ada dan digunakan kembali.");
    expect(sameOwnerHtml).toContain("Kendaraan ini terdaftar atas nama Budi Santoso.");
    expect(sameOwnerHtml).toContain("Buka kendaraan B1234XYZ");
    expect(sameOwnerHtml).not.toContain("Pelanggan berbeda.");
    expect(sameOwnerHtml).not.toContain("Kendaraan B1234XYZ dibuat.");

    const differentOwnerHtml = renderToStaticMarkup(
      <VehicleReuseNotice
        vehicleId={VEHICLE_ID}
        plate="B1234XYZ"
        ownerName="Budi Santoso"
        selectedCustomerName="Siti Aminah"
        differentOwner
        onOpen={() => undefined}
      />,
    );

    expect(differentOwnerHtml).toContain("Pelanggan berbeda.");
    expect(differentOwnerHtml).toContain("Anda memilih Siti Aminah, bukan Budi Santoso.");
    expect(differentOwnerHtml).toContain("Periksa kembali sebelum melanjutkan servis.");
  });
});

describe("vehicle filters", () => {
  it("surfaces the customer drill-down as a removable active filter", () => {
    const query = vehicleListQuerySchema.parse({ customerId: CUSTOMER_ID });
    const html = renderToStaticMarkup(
      <VehicleFilter
        query={query}
        hasSearch={false}
        resetHref="/vehicles"
        removeCustomerHref="/vehicles"
      />,
    );

    expect(html).toContain('aria-label="Filter aktif"');
    expect(html).toContain("Hanya kendaraan milik satu pelanggan");
    expect(html).toContain('aria-label="Hapus filter pelanggan"');
    expect(html).toContain("Hapus semua filter");
    expect(html).toContain(`name="customerId" value="${CUSTOMER_ID}"`);
  });

  it("renders no active filter chip without a customer drill-down", () => {
    const query = vehicleListQuerySchema.parse({});
    const html = renderToStaticMarkup(
      <VehicleFilter
        query={query}
        hasSearch={false}
        resetHref="/vehicles"
        removeCustomerHref="/vehicles"
      />,
    );

    expect(html).not.toContain("Filter aktif");
    expect(html).toContain('action="/vehicles"');
  });
});

describe("vehicle states", () => {
  it("distinguishes true zero, filtered empty, out-of-range, and a failed vehicle read", () => {
    const emptyHtml = renderToStaticMarkup(
      <VehiclesEmptyState canManage createAction={<button type="button">Tambahkan kendaraan</button>} />,
    );
    expect(emptyHtml).toContain("Belum ada kendaraan.");
    expect(emptyHtml).toContain("Tambahkan kendaraan");

    const readOnlyHtml = renderToStaticMarkup(<VehiclesEmptyState canManage={false} />);
    expect(readOnlyHtml).toContain("Hanya Pemilik, Admin, atau Kasir yang dapat menambahkan kendaraan.");
    expect(readOnlyHtml).not.toContain("Tambahkan kendaraan pertama");

    const filteredHtml = renderToStaticMarkup(
      <VehiclesFilteredEmptyState query="b 9999 zzz" resetHref="/vehicles" />,
    );
    expect(filteredHtml).toContain("Tidak ada kendaraan untuk &quot;b 9999 zzz&quot;.");
    expect(filteredHtml).toContain("Hapus pencarian");

    const customerFilteredHtml = renderToStaticMarkup(
      <VehiclesFilteredEmptyState query="" resetHref="/vehicles" customerFiltered />,
    );
    expect(customerFilteredHtml).toContain("Tidak ada kendaraan untuk pelanggan ini.");
    expect(customerFilteredHtml).toContain("Filter pelanggan aktif");
    expect(customerFilteredHtml).toContain("Hapus filter");

    const outOfRangeHtml = renderToStaticMarkup(
      <VehiclesOutOfRangeState total={30} pageOneHref="/vehicles?q=B1234XYZ" />,
    );
    expect(outOfRangeHtml).toContain("Halaman ini tidak berisi kendaraan.");
    expect(outOfRangeHtml).toContain("Daftar berisi 30 kendaraan.");
    expect(outOfRangeHtml).toContain('href="/vehicles?q=B1234XYZ"');
    expect(outOfRangeHtml).not.toContain("Belum ada kendaraan.");

    const errorHtml = renderToStaticMarkup(
      <VehiclesErrorPanel message="Data kendaraan gagal dimuat." retryHref="/vehicles" />,
    );
    expect(errorHtml).toContain("Data kendaraan gagal dimuat.");
    expect(errorHtml).toContain("Coba lagi");
    expect(errorHtml).not.toContain("0 kendaraan");
  });

  it("keeps an empty history honest and offers no fake intake action", () => {
    const html = renderToStaticMarkup(<VehicleHistoryEmptyState plate="B1234XYZ" />);

    expect(html).toContain("Belum ada riwayat untuk plat ini.");
    expect(html).toContain("B1234XYZ");
    expect(html).toContain("modul transaksi");
    expect(html).not.toContain("Mulai servis");
  });

  it("names an out-of-range history page instead of an empty history", () => {
    const html = renderToStaticMarkup(
      <VehicleHistoryOutOfRangeState total={12} pageOneHref={`/vehicles/${VEHICLE_ID}`} />,
    );

    expect(html).toContain("Halaman ini tidak berisi transaksi.");
    expect(html).toContain("Riwayat berisi 12 transaksi.");
    expect(html).toContain(`href="/vehicles/${VEHICLE_ID}"`);
    expect(html).not.toContain("Belum ada riwayat untuk plat ini.");
  });
});

describe("customer picker", () => {
  const readyState: CustomerPickerResultState = {
    key: "k",
    status: "ready",
    items: [maskedCustomer],
    total: 7,
    query: "budi",
  };

  function renderResults(state: CustomerPickerResultState) {
    return renderToStaticMarkup(
      <CustomerPickerResults
        idPrefix="create-vehicle"
        state={state}
        value={null}
        onChange={() => undefined}
        onRetry={() => undefined}
        disabled={false}
      />,
    );
  }

  it("states how many results of the total are shown inside a capped radiogroup", () => {
    const html = renderResults(readyState);

    expect(html).toContain("Menampilkan 1 dari 7 pelanggan.");
    expect(html).toContain("Persempit pencarian untuk menemukan pelanggan lain.");
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain("max-h-64 overflow-y-auto");
    expect(html).toContain('type="radio"');
    expect(html).toContain("0812••••7890");
  });

  it("separates a true zero from a search with no matches", () => {
    const zeroHtml = renderResults({
      key: "k",
      status: "ready",
      items: [],
      total: 0,
      query: "",
    });
    expect(zeroHtml).toContain("Belum ada pelanggan pada bisnis ini.");
    expect(zeroHtml).toContain("Tambahkan pelanggan lewat tombol Tambah pelanggan di atas");
    // The action row already owns the create button; the result never repeats it.
    expect(zeroHtml).not.toContain("<button");

    const noMatchHtml = renderResults({
      key: "k",
      status: "ready",
      items: [],
      total: 0,
      query: "tidak ada",
    });
    expect(noMatchHtml).toContain("Tidak ada pelanggan yang cocok dengan &quot;tidak ada&quot;.");
    expect(noMatchHtml).not.toContain("Belum ada pelanggan pada bisnis ini.");
  });

  it("offers a retry for a failed picker read and a loading status", () => {
    const errorHtml = renderResults({
      key: "k",
      status: "error",
      items: [],
      total: 0,
      query: "",
      message: "Daftar pelanggan gagal dimuat. Periksa koneksi, lalu coba lagi.",
    });
    expect(errorHtml).toContain('role="alert"');
    expect(errorHtml).toContain("Coba lagi");

    const loadingHtml = renderResults({
      key: "k",
      status: "loading",
      items: [],
      total: 0,
      query: "",
    });
    expect(loadingHtml).toContain("Memuat pelanggan…");
    expect(loadingHtml).toContain('role="status"');
  });
});

describe("vehicle history", () => {
  it("flags an unpaid order with its balance and renders the item line", () => {
    const html = renderToStaticMarkup(<VehicleHistoryTable orders={[unpaidOrder]} empty={null} />);

    expect(html).toContain("Belum lunas");
    expect(html).toContain("bo-chip--warning");
    expect(html).toContain("Rp\u00a0150.000");
    expect(html).toContain("12.000 km");
    expect(html).toContain("2 × Ganti oli");
    expect(html).toContain("Rp\u00a050.000");
    expect(html).toContain("Jasa");
    expect(html).toContain("26 Nov 2026");
    expect(html).not.toContain("14.05 WIB");
  });

  it("uses warning for partial payment and danger for a voided order", () => {
    const partialHtml = renderToStaticMarkup(
      <VehicleHistoryTable orders={[partialOrder]} empty={null} />,
    );
    expect(partialHtml).toContain("Dibayar sebagian");
    expect(partialHtml).toContain("bo-chip--warning");
    expect(partialHtml).toContain("Rp\u00a0100.000");

    const voidHtml = renderToStaticMarkup(
      <VehicleHistoryTable orders={[voidedOrder, unpaidOrder]} empty={null} />,
    );
    expect(voidHtml).toContain("Dibatalkan");
    expect(voidHtml).toContain("bo-chip--danger");
    expect(voidHtml).toContain("INV-2026-0002");
    expect(voidHtml).toContain("Rp\u00a090.000");
  });

  it("collapses long line lists to three lines behind an accessible expander", () => {
    const html = renderToStaticMarkup(
      <VehicleHistoryTable orders={[manyLinesOrder]} empty={null} />,
    );

    const beforeDetails = html.slice(0, html.indexOf("<details"));
    expect(beforeDetails.match(/<li /g)).toHaveLength(3);
    expect(beforeDetails).toContain("Jasa 3");
    expect(beforeDetails).not.toContain("Jasa 4");
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("+2 item lainnya");
    expect(html).toContain("Jasa 5");
  });
});

describe("pagination summaries", () => {
  it("states the customer row range and the customer page sizes", () => {
    const html = renderToStaticMarkup(
      <Pagination
        page={2}
        pageSize={25}
        total={60}
        totalPages={3}
        basePath="/customers"
        query={{ q: "budi" }}
        label="pelanggan"
        pageSizes={CUSTOMER_PAGE_SIZES}
      />,
    );

    expect(html).toContain("Menampilkan 26–50 dari 60 pelanggan");
    expect(html).toContain("Halaman 2 dari 3");
    expect(html).toContain("Tampilkan 25 baris per halaman");
    expect(html).toContain("Tampilkan 50 baris per halaman");
    expect(html).toContain("q=budi");
  });

  it("offers 10/25/50/100 rows for vehicle history", () => {
    const html = renderToStaticMarkup(
      <Pagination
        page={1}
        pageSize={10}
        total={12}
        totalPages={2}
        basePath={`/vehicles/${VEHICLE_ID}`}
        query={{}}
        label="transaksi"
        pageSizes={HISTORY_PAGE_SIZES}
      />,
    );

    expect(html).toContain("Menampilkan 1–10 dari 12 transaksi");
    for (const size of HISTORY_PAGE_SIZES) {
      expect(html).toContain(`Tampilkan ${size} baris per halaman`);
    }
  });
});
