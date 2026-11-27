"use client";

import type { OrderDetail, OrderLine, ProductItem, ServiceItem } from "@workshop-pos/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError } from "@/components/auth/api-error";
import { Field } from "@/components/back-office/field";
import { StatusToast } from "@/components/back-office/status-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatIdr } from "@/lib/format";
import { ORDER_LINE_TYPE_LABELS } from "@/lib/order-labels";

interface OrderLinesEditorProps {
  order: OrderDetail;
  products: ProductItem[];
  services: ServiceItem[];
}

interface LineState {
  quantity: string;
  discountPercent: string;
}

/**
 * Line editing (FR-044, FR-031, FR-032): add, re-quantify, discount, or remove
 * while the order is editable. Every change re-prices on the server; the screen
 * only shows what came back.
 */
export function OrderLinesEditor({ order, products, services }: OrderLinesEditorProps) {
  const router = useRouter();
  const [lineState, setLineState] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      order.lines.map((line) => [
        line.id,
        {
          quantity: String(line.quantity),
          discountPercent: line.discountPercent === null ? "" : String(line.discountPercent),
        },
      ]),
    ),
  );
  const [selection, setSelection] = useState("");
  const [addQuantity, setAddQuantity] = useState("1");
  const [addDiscount, setAddDiscount] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editable = order.permissions.canEditLines;

  async function run(key: string, work: () => Promise<Response>, success: string) {
    setPending(key);
    setError(null);
    try {
      const response = await work();
      if (!response.ok) {
        const failure = await readApiError(response);
        setError(failure.message);
        return;
      }
      setMessage(success);
      router.refresh();
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setPending(null);
    }
  }

  function updateLine(lineId: string, changes: Partial<LineState>) {
    setLineState((current) => ({
      ...current,
      [lineId]: { ...(current[lineId] ?? { quantity: "1", discountPercent: "" }), ...changes },
    }));
  }

  async function saveLine(line: OrderLine) {
    const state = lineState[line.id];
    if (!state) return;
    const quantity = Number(state.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("Jumlah harus bilangan bulat minimal 1.");
      return;
    }
    const percent = state.discountPercent.trim();
    if (percent.length > 0) {
      const value = Number(percent);
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        setError("Diskon baris harus bilangan bulat 0 sampai 100.");
        return;
      }
    }

    await run(
      `save-${line.id}`,
      () =>
        fetch(`/api/v1/orders/${order.id}/lines/${line.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            quantity,
            ...(percent.length > 0 ? { discountPercent: Number(percent) } : {}),
          }),
        }),
      "Baris diperbarui.",
    );
  }

  async function removeLine(line: OrderLine) {
    await run(
      `remove-${line.id}`,
      () => fetch(`/api/v1/orders/${order.id}/lines/${line.id}`, { method: "DELETE" }),
      "Baris dihapus.",
    );
  }

  async function addLine() {
    if (!selection) {
      setError("Pilih spare part atau jasa terlebih dahulu.");
      return;
    }
    const quantity = Number(addQuantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("Jumlah harus bilangan bulat minimal 1.");
      return;
    }
    const percent = addDiscount.trim();
    if (percent.length > 0) {
      const value = Number(percent);
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        setError("Diskon baris harus bilangan bulat 0 sampai 100.");
        return;
      }
    }

    const [lineType, catalogItemId] = selection.split(":");
    await run(
      "add",
      () =>
        fetch(`/api/v1/orders/${order.id}/lines`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lineType,
            catalogItemId,
            quantity,
            ...(percent.length > 0 ? { discountPercent: Number(percent) } : {}),
          }),
        }),
      "Baris ditambahkan.",
    );
    setSelection("");
    setAddQuantity("1");
    setAddDiscount("");
  }

  return (
    <section className="bo-panel" aria-label="Baris transaksi">
      <div className="bo-panel__header">
        <h2 className="bo-panel__title">Baris transaksi</h2>
        <p className="bo-panel__meta">{order.lines.length} baris</p>
      </div>
      <div className="bo-panel__body bo-panel__body--flush">
        {error ? (
          <p className="bo-alert bo-alert--danger m-4" role="alert">
            {error}
          </p>
        ) : null}
        {order.lines.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">Tambahkan minimal satu item.</p>
        ) : (
          <ul className="flex flex-col" aria-label="Baris transaksi">
            {order.lines.map((line) => {
              const state = lineState[line.id] ?? { quantity: "1", discountPercent: "" };
              return (
                <li
                  key={line.id}
                  className="flex flex-col gap-3 border-b border-line-subtle p-4 last:border-b-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{line.description}</p>
                      <p className="text-xs text-ink-muted">
                        {ORDER_LINE_TYPE_LABELS[line.lineType]}
                        {line.technicianName ? ` · ${line.technicianName}` : ""}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">
                      {formatIdr(line.lineTotal)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    {editable ? (
                      <>
                        <div className="bo-filterbar__field">
                          <label className="text-xs" htmlFor={`qty-${line.id}`}>
                            Jumlah
                          </label>
                          <Input
                            id={`qty-${line.id}`}
                            aria-label={`Jumlah ${line.description}`}
                            className="w-24"
                            type="number"
                            min={1}
                            max={999}
                            step={1}
                            value={state.quantity}
                            onChange={(event) => {
                              updateLine(line.id, { quantity: event.target.value });
                            }}
                          />
                        </div>
                        <div className="bo-filterbar__field">
                          <label className="text-xs" htmlFor={`discount-${line.id}`}>
                            Diskon baris (%)
                          </label>
                          <Input
                            id={`discount-${line.id}`}
                            aria-label={`Diskon ${line.description}`}
                            className="w-24"
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={state.discountPercent}
                            placeholder="0"
                            onChange={(event) => {
                              updateLine(line.id, { discountPercent: event.target.value });
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending !== null}
                          onClick={() => {
                            void saveLine(line);
                          }}
                        >
                          Simpan
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={pending !== null || order.lines.length <= 1}
                          onClick={() => {
                            void removeLine(line);
                          }}
                        >
                          Hapus
                        </Button>
                      </>
                    ) : (
                      <p className="text-xs text-ink-muted">
                        {line.quantity} × {formatIdr(line.unitPrice)}
                        {BigInt(line.discountAmount) > 0n
                          ? ` · diskon ${formatIdr(line.discountAmount)}`
                          : ""}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editable ? (
        <div className="bo-panel__body flex flex-col gap-3 border-t border-line">
          <h3 className="text-sm font-semibold">Tambah baris</h3>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px_120px_auto]">
            <Field label="Spare part atau jasa" htmlFor="add-line-item">
              <select
                id="add-line-item"
                className="bo-select"
                value={selection}
                onChange={(event) => {
                  setSelection(event.target.value);
                }}
              >
                <option value="">Pilih item</option>
                <optgroup label="Spare part">
                  {products.map((product) => (
                    <option key={product.id} value={`PRODUCT:${product.id}`}>
                      {product.name} · {formatIdr(product.price)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Jasa">
                  {services.map((service) => (
                    <option key={service.id} value={`SERVICE:${service.id}`}>
                      {service.name} · {formatIdr(service.price)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </Field>
            <Field label="Jumlah" htmlFor="add-line-quantity">
              <Input
                id="add-line-quantity"
                type="number"
                min={1}
                max={999}
                step={1}
                value={addQuantity}
                onChange={(event) => {
                  setAddQuantity(event.target.value);
                }}
              />
            </Field>
            <Field label="Diskon (%)" htmlFor="add-line-discount">
              <Input
                id="add-line-discount"
                type="number"
                min={0}
                max={100}
                step={1}
                value={addDiscount}
                onChange={(event) => {
                  setAddDiscount(event.target.value);
                }}
              />
            </Field>
            <div className="flex items-end">
              <Button
                type="button"
                variant="secondary"
                disabled={pending !== null}
                onClick={() => {
                  void addLine();
                }}
              >
                Tambah baris
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="bo-panel__body text-sm text-ink-muted">
          Baris tidak dapat diubah pada status ini
          {order.status === "ESTIMATED" ? " (kembalikan ke draf untuk mengubah estimasi)" : ""}.
        </p>
      )}

      {message ? <StatusToast message={message} onDismiss={() => setMessage(null)} /> : null}
    </section>
  );
}
