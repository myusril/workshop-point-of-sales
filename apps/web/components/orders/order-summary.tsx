import type { OrderDetail } from "@workshop-pos/contracts";

import { formatIdr } from "@/lib/format";

interface OrderSummaryProps {
  detail: OrderDetail;
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "flex items-baseline justify-between gap-4 font-semibold" : "flex items-baseline justify-between gap-4"}>
      <dt className="text-ink-secondary">{label}</dt>
      <dd className={strong ? "text-base tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  );
}

/** One money column for every figure; the server computed each value. */
export function OrderSummary({ detail }: OrderSummaryProps) {
  const orderDiscount = BigInt(detail.discountAmount ?? "0");
  const lineDiscount = BigInt(detail.discountTotal) - orderDiscount;

  return (
    <section className="bo-panel" aria-label="Ringkasan nilai transaksi">
      <div className="bo-panel__header">
        <h2 className="bo-panel__title">Ringkasan</h2>
      </div>
      <div className="bo-panel__body">
        <dl className="flex flex-col gap-2 text-sm">
          <Row label="Subtotal" value={formatIdr(detail.subtotal)} />
          {lineDiscount > 0n ? (
            <Row label="Diskon baris" value={formatIdr(lineDiscount)} />
          ) : null}
          {orderDiscount > 0n ? (
            <Row label="Diskon transaksi" value={formatIdr(orderDiscount)} />
          ) : null}
          <Row label={`PPN ${detail.taxRate}%`} value={formatIdr(detail.taxTotal)} />
          <Row label="Total" value={formatIdr(detail.total)} strong />
          <Row label="Total dibayar" value={formatIdr(detail.paidTotal)} />
          <Row label="Sisa tagihan" value={formatIdr(detail.balanceDue)} strong />
          {BigInt(detail.changeTotal) > 0n ? (
            <Row label="Kembalian" value={formatIdr(detail.changeTotal)} strong />
          ) : null}
        </dl>
      </div>
    </section>
  );
}
