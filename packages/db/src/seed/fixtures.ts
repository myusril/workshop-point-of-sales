import { staffRole } from "../schema/index.ts";

export type StaffRoleValue = (typeof staffRole.enumValues)[number];

/**
 * Deterministic seed identifiers. Every value is synthetic: these are demo
 * fixtures, never production data. Tests assert against these ids.
 */
export const SEED_BUSINESS_ID = "b0000000-0000-4000-8000-000000000001";
export const SEED_OUTLET_ID = "b0000000-0000-4000-8000-000000000002";
export const SEED_SETTINGS_ID = "b0000000-0000-4000-8000-000000000003";
export const SEED_PRODUCT_ID = "c0000000-0000-4000-8000-000000000001";
export const SEED_SERVICE_ID = "c0000000-0000-4000-8000-000000000002";
export const SEED_CUSTOMER_ID = "d0000000-0000-4000-8000-000000000001";
export const SEED_VEHICLE_ID = "d0000000-0000-4000-8000-000000000002";
export const SEED_OPENING_LEDGER_ID = "e0000000-0000-4000-8000-000000000001";

export interface SeedUserFixture {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: StaffRoleValue;
  staffOutletId: string;
}

/**
 * One staff member per role. No credential/account rows and no password hash:
 * WP3 provisions Better Auth credentials. Usernames are left unset for WP3.
 */
export const SEED_USERS: readonly SeedUserFixture[] = [
  {
    id: "seed_owner_rina",
    name: "Rina Wijaya",
    email: "owner@example.com",
    phone: "081200000001",
    role: "OWNER",
    staffOutletId: "b0000000-0000-4000-8000-000000000004",
  },
  {
    id: "seed_admin_andi",
    name: "Andi Pratama",
    email: "admin@example.com",
    phone: "081200000002",
    role: "ADMIN",
    staffOutletId: "b0000000-0000-4000-8000-000000000005",
  },
  {
    id: "seed_cashier_dewi",
    name: "Dewi Lestari",
    email: "cashier@example.com",
    phone: "081200000003",
    role: "CASHIER",
    staffOutletId: "b0000000-0000-4000-8000-000000000006",
  },
  {
    id: "seed_mechanic_agus",
    name: "Agus Saputra",
    email: "mechanic@example.com",
    phone: "081200000004",
    role: "MECHANIC",
    staffOutletId: "b0000000-0000-4000-8000-000000000007",
  },
];

export const SEED_BUSINESS = {
  id: SEED_BUSINESS_ID,
  name: "Bengkel Contoh Jaya",
  timezone: "Asia/Jakarta",
} as const;

export const SEED_OUTLET = {
  id: SEED_OUTLET_ID,
  businessId: SEED_BUSINESS_ID,
  name: "Outlet Pusat",
} as const;

export const SEED_SETTINGS = {
  id: SEED_SETTINGS_ID,
  businessId: SEED_BUSINESS_ID,
  outletId: SEED_OUTLET_ID,
  taxRate: 11,
  cashierDiscountCapPercent: 0,
  idleTimeoutMinutes: 30,
  receiptPaperWidth: 58,
  voidReasonMinLength: 10,
  receiptPrefix: "",
} as const;

export const SEED_PRODUCT = {
  id: SEED_PRODUCT_ID,
  businessId: SEED_BUSINESS_ID,
  outletId: SEED_OUTLET_ID,
  sku: "BRK-001",
  name: "Kampas rem depan",
  unit: "pcs",
  cost: 150000n,
  price: 250000n,
  lowStockThreshold: 5,
} as const;

export const SEED_SERVICE = {
  id: SEED_SERVICE_ID,
  businessId: SEED_BUSINESS_ID,
  outletId: SEED_OUTLET_ID,
  code: "SRV-001",
  name: "Ganti oli mesin",
  price: 50000n,
  durationMinutes: 30,
} as const;

export const SEED_CUSTOMER = {
  id: SEED_CUSTOMER_ID,
  businessId: SEED_BUSINESS_ID,
  name: "Budi Santoso",
  phone: "081234567890",
} as const;

export const SEED_VEHICLE = {
  id: SEED_VEHICLE_ID,
  businessId: SEED_BUSINESS_ID,
  customerId: SEED_CUSTOMER_ID,
  normalizedPlate: "B1234XYZ",
  brand: "Honda",
  model: "Beat 110",
  year: 2021,
  color: "Hitam",
  odometer: 12450,
} as const;

export const SEED_OPENING_STOCK = {
  id: SEED_OPENING_LEDGER_ID,
  businessId: SEED_BUSINESS_ID,
  outletId: SEED_OUTLET_ID,
  productId: SEED_PRODUCT_ID,
  entryType: "STOCK_IN",
  quantityBefore: 0,
  quantityAfter: 20,
  reason: "Stok awal",
  sourceType: "STOCK_IN",
  createdBy: "seed_owner_rina",
} as const;
