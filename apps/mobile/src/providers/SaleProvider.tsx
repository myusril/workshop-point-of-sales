import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { hasAction, type StoredSession } from "@/src/auth/session-store";
import { useAuth } from "@/src/providers/AuthProvider";
import { getRuntime } from "@/src/providers/runtime";
import { useSync } from "@/src/providers/SyncProvider";
import type { CachedCatalogItem, OutletSettings } from "@/src/db/repository";
import { getOutletSettings } from "@/src/db/repository";
import { commitLocalSale, type CommitSaleResult } from "@/src/domain/commit-sale";
import {
  cartPricing,
  emptyCart,
  lineSubtotal,
  SaleRuleError,
  type CartLine,
  type CartState,
  type PlannedPayment,
} from "@/src/domain/sale";
import { isDiscountAboveCap, PricingError, type OrderPricing } from "@/src/pricing/order-pricing";

/**
 * Sale state shared by the Jual tab, the cart, and the payment screen.
 *
 * The cart is in memory (leaving a non-empty cart asks for confirmation), while
 * a committed sale is durable in SQLite before the success screen appears.
 */

export interface SaleContextValue {
  cart: CartState;
  settings: OutletSettings | null;
  outletName: string;
  customer: { id: string; name: string } | null;
  vehicle: { id: string; plate: string; brand: string; model: string } | null;
  pricing: OrderPricing | null;
  pricingError: string | null;
  productSubtotal: bigint;
  serviceSubtotal: bigint;
  discountBlocked: boolean;
  discountBlockReason: string | null;
  canDiscount: boolean;
  addItem: (item: CachedCatalogItem) => void;
  setQuantity: (lineKey: string, quantity: number) => void;
  removeLine: (lineKey: string) => void;
  restoreLine: (line: CartLine, index: number) => void;
  setOrderDiscountPercent: (percent: number | null) => void;
  setOrderDiscountAmount: (amount: bigint) => void;
  setCustomer: (customer: { id: string; name: string } | null) => void;
  setVehicle: (
    vehicle: { id: string; plate: string; brand: string; model: string } | null,
  ) => void;
  clearCart: () => void;
  reloadSettings: () => Promise<void>;
  checkout: (
    payments: readonly PlannedPayment[],
    options?: { clientKey?: string },
  ) => Promise<CommitSaleResult>;
}

const SaleContext = createContext<SaleContextValue | null>(null);

export const MAX_LINE_QUANTITY = 999;

function cartLineFromItem(item: CachedCatalogItem): CartLine {
  return {
    lineKey: `${item.id}-${Date.now().toString(36)}`,
    lineType: item.itemType,
    catalogItemId: item.id,
    description: item.name,
    unitPrice: BigInt(item.price),
    quantity: 1,
    discountPercent: null,
    discountAmount: 0n,
    technicianId: null,
  };
}

export function SaleProvider({ children }: { children: ReactNode }) {
  const runtime = getRuntime();
  const { session } = useAuth();
  const { online, lastSummary, reload: reloadQueue, runNow } = useSync();
  const [cart, setCart] = useState<CartState>(() => emptyCart());
  const [settings, setSettings] = useState<OutletSettings | null>(null);
  const [customer, setCustomer] = useState<SaleContextValue["customer"]>(null);
  const [vehicle, setVehicle] = useState<SaleContextValue["vehicle"]>(null);

  const activeOutletId = session?.activeOutletId ?? null;
  const outletName =
    session?.outlets.find((outlet) => outlet.id === activeOutletId)?.name ?? "Outlet";

  const reloadSettings = useCallback(async () => {
    if (!activeOutletId) return;
    const loaded = await getOutletSettings(
      runtime.db,
      activeOutletId,
      new Date().toISOString(),
    );
    setSettings(loaded);
  }, [activeOutletId, runtime]);

  useEffect(() => {
    // Outlet policy lives in SQLite and is refreshed after a sync; async read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadSettings();
  }, [reloadSettings, lastSummary]);

  const addItem = useCallback(
    (item: CachedCatalogItem) => {
      if (!item.isActive) return;
      setCart((current) => {
        const existing = current.lines.find(
          (line) => line.catalogItemId === item.id && line.lineType === item.itemType,
        );
        if (existing) {
          return {
            ...current,
            lines: current.lines.map((line) =>
              line.lineKey === existing.lineKey
                ? { ...line, quantity: Math.min(MAX_LINE_QUANTITY, line.quantity + 1) }
                : line,
            ),
          };
        }
        return { ...current, lines: [...current.lines, cartLineFromItem(item)] };
      });
    },
    [],
  );

  const setQuantity = useCallback((lineKey: string, quantity: number) => {
    setCart((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.lineKey === lineKey
          ? {
              ...line,
              quantity: Math.max(1, Math.min(MAX_LINE_QUANTITY, Math.trunc(quantity))),
            }
          : line,
      ),
    }));
  }, []);

  const removeLine = useCallback((lineKey: string) => {
    setCart((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.lineKey !== lineKey),
    }));
  }, []);

  const restoreLine = useCallback((line: CartLine, index: number) => {
    setCart((current) => {
      if (current.lines.some((entry) => entry.lineKey === line.lineKey)) return current;
      const lines = [...current.lines];
      lines.splice(Math.max(0, Math.min(index, lines.length)), 0, line);
      return { ...current, lines };
    });
  }, []);

  const setOrderDiscountPercent = useCallback((percent: number | null) => {
    setCart((current) => ({
      ...current,
      discountPercent:
        percent === null ? null : Math.max(0, Math.min(100, Math.trunc(percent))),
      discountAmount: 0n,
    }));
  }, []);

  const setOrderDiscountAmount = useCallback((amount: bigint) => {
    setCart((current) => ({
      ...current,
      discountPercent: null,
      discountAmount: amount < 0n ? 0n : amount,
    }));
  }, []);

  const clearCart = useCallback(() => {
    setCart(emptyCart());
    setCustomer(null);
    setVehicle(null);
  }, []);

  const taxRate = settings?.taxRate ?? 11;
  const pricingResult = useMemo<{ pricing: OrderPricing | null; error: string | null }>(() => {
    if (cart.lines.length === 0) return { pricing: null, error: null };
    try {
      return { pricing: cartPricing(cart, taxRate), error: null };
    } catch (error) {
      if (error instanceof PricingError) return { pricing: null, error: error.message };
      throw error;
    }
  }, [cart, taxRate]);

  const discountBlocked = useMemo(() => {
    if (!pricingResult.pricing) return false;
    return (
      isDiscountAboveCap(
        pricingResult.pricing.subtotal,
        pricingResult.pricing.discountTotal,
        settings?.cashierDiscountCapPercent ?? 0,
      ) && !hasAction(session, "override_discount")
    );
  }, [pricingResult.pricing, session, settings?.cashierDiscountCapPercent]);

  const checkout = useCallback(
    async (payments: readonly PlannedPayment[], options?: { clientKey?: string }) => {
      if (!session) throw new SaleRuleError("session", "Sesi berakhir. Masuk kembali.");
      if (!hasAction(session, "create_sale")) {
        throw new SaleRuleError(
          "role",
          "Peran Anda tidak dapat membuat penjualan. Hubungi Admin atau Pemilik.",
        );
      }
      if (!settings) throw new SaleRuleError("settings", "Pengaturan outlet belum dimuat.");
      const result = await commitLocalSale(runtime.db, {
        cart,
        settings,
        session: session as StoredSession,
        outletName,
        payments,
        customer,
        vehicle,
        clientKey: options?.clientKey,
      });
      clearCart();
      await reloadQueue();
      if (online) void runNow();
      return result;
    },
    [cart, clearCart, customer, online, outletName, reloadQueue, runNow, runtime, session, settings, vehicle],
  );

  const value = useMemo<SaleContextValue>(
    () => ({
      cart,
      settings,
      outletName,
      customer,
      vehicle,
      pricing: pricingResult.pricing,
      pricingError: pricingResult.error,
      productSubtotal: lineSubtotal(cart, "PRODUCT"),
      serviceSubtotal: lineSubtotal(cart, "SERVICE"),
      discountBlocked,
      discountBlockReason: discountBlocked
        ? `Diskon di atas ${settings?.cashierDiscountCapPercent ?? 0}% memerlukan persetujuan Admin atau Pemilik.`
        : null,
      canDiscount: true,
      addItem,
      setQuantity,
      removeLine,
      restoreLine,
      setOrderDiscountPercent,
      setOrderDiscountAmount,
      setCustomer,
      setVehicle,
      clearCart,
      reloadSettings,
      checkout,
    }),
    [
      cart,
      settings,
      outletName,
      customer,
      vehicle,
      pricingResult.pricing,
      pricingResult.error,
      discountBlocked,
      addItem,
      setQuantity,
      removeLine,
      restoreLine,
      setOrderDiscountPercent,
      setOrderDiscountAmount,
      clearCart,
      reloadSettings,
      checkout,
    ],
  );

  return <SaleContext.Provider value={value}>{children}</SaleContext.Provider>;
}

export function useSale(): SaleContextValue {
  const value = useContext(SaleContext);
  if (!value) throw new Error("SaleProvider is missing.");
  return value;
}
