import { describe, expect, it } from "vitest";

import {
  ANONYMIZED_CUSTOMER_NAME,
  anonymizeCustomerSchema,
  createCustomerSchema,
  createVehicleSchema,
  customerExportSchema,
  customerListItemSchema,
  customerListQuerySchema,
  customerSchema,
  historyOrderSchema,
  maskPhone,
  updateCustomerSchema,
  updateVehicleSchema,
  vehicleDetailResponseSchema,
  vehicleHistoryQuerySchema,
  vehicleHistoryResponseSchema,
  vehicleListItemSchema,
  vehicleListQuerySchema,
  vehicleResponseSchema,
} from "../src/index.ts";

const CUSTOMER_ID = "d0000000-0000-4000-8000-000000000001";
const VEHICLE_ID = "d0000000-0000-4000-8000-000000000002";
const OUTLET_ID = "b0000000-0000-4000-8000-000000000002";
const ORDER_ID = "f0000000-0000-4000-8000-000000000001";

const customer = {
  id: CUSTOMER_ID,
  name: "Budi Santoso",
  phone: "081234567890",
  address: null,
  notes: null,
  anonymizedAt: null,
  createdAt: "2026-01-02T03:04:05.000Z",
  updatedAt: "2026-01-02T03:04:05.000Z",
} as const;

const vehicle = {
  id: VEHICLE_ID,
  normalizedPlate: "B1234XYZ",
  brand: "Honda",
  model: "Beat 110",
  year: 2021,
  color: "Hitam",
  odometer: 12450,
  vin: null,
  notes: null,
  customerId: CUSTOMER_ID,
  customerName: customer.name,
  customerAnonymized: false,
  createdAt: "2026-01-02T03:04:05.000Z",
  updatedAt: "2026-01-02T03:04:05.000Z",
} as const;

const historyOrder = {
  id: ORDER_ID,
  orderNumber: "INV-0001",
  kind: "SERVICE",
  status: "PAID",
  createdAt: "2026-01-02T03:04:05.000Z",
  completedAt: "2026-01-02T04:00:00.000Z",
  paidAt: "2026-01-02T04:05:00.000Z",
  outletId: OUTLET_ID,
  outletName: "Outlet Pusat",
  odometer: 12450,
  total: "299700",
  paidTotal: "299700",
  balanceDue: "0",
  paymentStatus: "PAID",
  lines: [
    { lineType: "PRODUCT", description: "Kampas rem depan", quantity: 1, lineTotal: "250000" },
    { lineType: "SERVICE", description: "Ganti oli mesin", quantity: 1, lineTotal: "49700" },
  ],
} as const;

describe("customer contracts", () => {
  it("normalizes the phone on write and rejects unusable numbers", () => {
    expect(createCustomerSchema.parse({ name: "Budi Santoso", phone: "+62 812-3456-7890" }).phone).toBe(
      "081234567890",
    );
    expect(createCustomerSchema.safeParse({ name: "B", phone: "081234567890" }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ name: "Budi Santoso", phone: "12345" }).success).toBe(false);
  });

  it("keeps address and notes nullable on update but requires one change", () => {
    expect(updateCustomerSchema.parse({ address: null, notes: null })).toEqual({
      address: null,
      notes: null,
    });
    expect(updateCustomerSchema.safeParse({}).success).toBe(false);
  });

  it("masks phone numbers for lists without leaking the full value", () => {
    expect(maskPhone("081234567890")).toBe("0812••••7890");
    expect(maskPhone("081234567")).toBe("08•••••67");
    expect(maskPhone("")).toBe("—");

    const listItem = customerListItemSchema.parse({
      ...customer,
      phoneMasked: maskPhone(customer.phone),
      vehicleCount: 1,
    });
    expect(listItem).not.toHaveProperty("phone");
    expect(listItem).not.toHaveProperty("address");
    expect(listItem).not.toHaveProperty("notes");
    expect(listItem.phoneMasked).not.toContain("081234567890");
  });

  it("accepts the anonymized sentinel name and requires a meaningful reason", () => {
    expect(customerSchema.parse({ ...customer, name: ANONYMIZED_CUSTOMER_NAME, phone: "" }).name).toBe(
      ANONYMIZED_CUSTOMER_NAME,
    );
    expect(anonymizeCustomerSchema.safeParse({ reason: "singkat" }).success).toBe(false);
    expect(anonymizeCustomerSchema.parse({ reason: "Permintaan penghapusan data" }).reason).toContain(
      "penghapusan",
    );
  });

  it("round-trips list queries, page sizes, and the export document", () => {
    expect(customerListQuerySchema.parse({ page: "2", pageSize: "50" })).toMatchObject({
      page: 2,
      pageSize: 50,
      sort: "name",
      dir: "asc",
    });
    expect(customerListQuerySchema.safeParse({ pageSize: "10" }).success).toBe(false);

    const exported = customerExportSchema.parse({
      formatVersion: 1,
      exportedAt: "2026-01-02T03:04:05.000Z",
      customer,
      vehicles: [
        {
          id: VEHICLE_ID,
          normalizedPlate: "B1234XYZ",
          brand: "Honda",
          model: "Beat 110",
          year: 2021,
          color: "Hitam",
          odometer: 12450,
          vin: null,
          notes: null,
        },
      ],
      orders: [
        {
          id: ORDER_ID,
          orderNumber: "INV-0001",
          kind: "SERVICE",
          status: "PAID",
          outletName: "Outlet Pusat",
          createdAt: "2026-01-02T03:04:05.000Z",
          completedAt: "2026-01-02T04:00:00.000Z",
          odometer: 12450,
          total: "299700",
          balanceDue: "0",
        },
      ],
    });
    expect(customerExportSchema.parse(JSON.parse(JSON.stringify(exported)))).toEqual(exported);
  });
});

describe("vehicle and history contracts", () => {
  it("accepts raw plate input and validates year/odometer bounds", () => {
    expect(
      createVehicleSchema.parse({
        plate: "b 1234 xyz",
        brand: "Honda",
        model: "Beat 110",
        customerId: CUSTOMER_ID,
        year: 2021,
        odometer: 0,
      }),
    ).toMatchObject({ plate: "b 1234 xyz", year: 2021, odometer: 0 });

    expect(
      createVehicleSchema.safeParse({
        plate: "B1234XYZ",
        brand: "Honda",
        model: "Beat 110",
        customerId: CUSTOMER_ID,
        year: 1885,
      }).success,
    ).toBe(false);
    expect(
      createVehicleSchema.safeParse({
        plate: "B1234XYZ",
        brand: "Honda",
        model: "Beat 110",
        customerId: CUSTOMER_ID,
        odometer: -1,
      }).success,
    ).toBe(false);
    expect(
      createVehicleSchema.safeParse({
        plate: "",
        brand: "Honda",
        model: "Beat 110",
        customerId: CUSTOMER_ID,
      }).success,
    ).toBe(false);
    expect(updateVehicleSchema.safeParse({ vin: "MH1-JF12E1" }).success).toBe(true);
  });

  it("round-trips the reuse response and list query", () => {
    const response = vehicleResponseSchema.parse({ item: vehicle, reused: true });
    expect(vehicleResponseSchema.parse(JSON.parse(JSON.stringify(response)))).toEqual(response);

    const listItem = vehicleListItemSchema.parse(vehicle);
    expect(listItem).not.toHaveProperty("vin");
    expect(listItem).not.toHaveProperty("notes");

    const detail = vehicleDetailResponseSchema.parse({ item: vehicle });
    expect(vehicleDetailResponseSchema.parse(JSON.parse(JSON.stringify(detail)))).toEqual(detail);

    expect(vehicleListQuerySchema.parse({ q: "xyz", customerId: CUSTOMER_ID })).toMatchObject({
      q: "xyz",
      customerId: CUSTOMER_ID,
      sort: "plate",
      dir: "asc",
    });
  });

  it("round-trips a paginated history page with visit totals and scope", () => {
    const payload = vehicleHistoryResponseSchema.parse({
      vehicle,
      orders: [historyOrder],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
      totals: { visits: 1, totalSpent: "299700", outstanding: "0" },
      scope: { allOutlets: true, outletId: null, outletName: null },
    });
    expect(vehicleHistoryResponseSchema.parse(JSON.parse(JSON.stringify(payload)))).toEqual(payload);
    expect(payload.vehicle).not.toHaveProperty("vin");
    expect(payload.vehicle).not.toHaveProperty("notes");
    expect(historyOrderSchema.shape.paymentStatus.options).toEqual([
      "PAID",
      "PARTIAL",
      "UNPAID",
      "VOID",
    ]);
  });

  it("rejects unsupported history page sizes and non-uuid outlet filters", () => {
    expect(vehicleHistoryQuerySchema.parse({ pageSize: "10" }).pageSize).toBe(10);
    expect(vehicleHistoryQuerySchema.safeParse({ pageSize: "20" }).success).toBe(false);
    expect(vehicleHistoryQuerySchema.safeParse({ outletId: "outlet-a" }).success).toBe(false);
  });
});
