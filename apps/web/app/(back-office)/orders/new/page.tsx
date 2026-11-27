import { can } from "@workshop-pos/auth";
import {
  catalogListQuerySchema,
  vehicleListQuerySchema,
  type ProductItem,
  type ServiceItem,
} from "@workshop-pos/contracts";
import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { listCatalog } from "@/app/api/v1/catalog/_lib/catalog-service";
import { listVehicles } from "@/app/api/v1/vehicles/_lib/vehicle-service";
import { PageHeader } from "@/components/back-office/page-header";
import { ErrorState } from "@/components/back-office/state-block";
import { SaleScreen } from "@/components/orders/sale-screen";
import { getAuthRuntime, getSessionPayload, requirePageAuthContext } from "@/lib/auth/server";
import { listTechnicians } from "@/lib/order-service";
import { getSettings } from "@workshop-pos/db";

export const metadata: Metadata = {
  title: "Transaksi baru — Workshop POS",
};

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const authContext = await requirePageAuthContext();
  const session = await getSessionPayload(authContext);

  if (
    !can(session.user.role, "create_sale") &&
    !can(session.user.role, "service_intake")
  ) {
    forbidden();
  }

  const outletId = authContext.activeOutletId ?? authContext.outletIds[0];
  if (!outletId) forbidden();

  const context = {
    ...authContext,
    activeOutletId: outletId,
    outletIds: [outletId],
  };
  const db = getAuthRuntime().db;

  let productItems: ProductItem[] = [];
  let serviceItems: ServiceItem[] = [];
  let vehicles: Awaited<ReturnType<typeof listVehicles>> | null = null;
  let technicians: Awaited<ReturnType<typeof listTechnicians>> | null = null;
  let taxRate = 11;
  let discountCap = 0;
  let failure: string | null = null;

  try {
    const [products, services, vehiclePage, technicianPage, settings] = await Promise.all([
      listCatalog(
        db,
        context,
        catalogListQuerySchema.parse({
          type: "product",
          status: "active",
          page: 1,
          pageSize: 100,
          sort: "name",
          dir: "asc",
        }),
      ),
      listCatalog(
        db,
        context,
        catalogListQuerySchema.parse({
          type: "service",
          status: "active",
          page: 1,
          pageSize: 100,
          sort: "name",
          dir: "asc",
        }),
      ),
      listVehicles(
        db,
        context,
        vehicleListQuerySchema.parse({ page: 1, pageSize: 25, sort: "plate", dir: "asc" }),
      ),
      listTechnicians(db, context),
      getSettings(db, { businessId: context.user.businessId, outletIds: [outletId] }, outletId),
    ]);

    productItems = products.items.filter(
      (item): item is ProductItem => item.itemType === "PRODUCT",
    );
    serviceItems = services.items.filter(
      (item): item is ServiceItem => item.itemType === "SERVICE",
    );
    vehicles = vehiclePage;
    technicians = technicianPage;
    taxRate = settings?.taxRate ?? 11;
    discountCap = settings?.cashierDiscountCapPercent ?? 0;
  } catch (error) {
    failure = error instanceof Error ? error.message : "Katalog gagal dimuat.";
  }

  if (failure || !vehicles || !technicians) {
    return (
      <div className="bo-page bo-stack">
        <PageHeader
          title="Transaksi baru"
          backLink={{ href: "/orders", label: "Kembali ke daftar transaksi" }}
        />
        <ErrorState title="Transaksi baru tidak dapat dimuat.">
          <p>{failure ?? "Katalog gagal dimuat."}</p>
          <p>Keranjang belum dibuat dan tidak ada data yang tersimpan.</p>
        </ErrorState>
      </div>
    );
  }

  return (
    <div className="bo-page bo-stack">
      <PageHeader
        title="Transaksi baru"
        description="Satu transaksi untuk spare part dan jasa, satu pembayaran, satu struk."
        backLink={{ href: "/orders", label: "Kembali ke daftar transaksi" }}
      />
      <SaleScreen
        role={session.user.role}
        canCreateSale={can(session.user.role, "create_sale")}
        outletId={outletId}
        taxRate={taxRate}
        cashierDiscountCapPercent={discountCap}
        products={productItems}
        services={serviceItems}
        vehicles={vehicles.items}
        technicians={technicians.items}
      />
    </div>
  );
}
