import { buildLocalReceipt } from "@/src/printing/receipt";
import {
  createThermalChannel,
  PrinterUnavailableError,
  receiptHtml,
} from "@/src/printing/sinks";
import { testReceipt } from "./helpers/fixtures";

describe("receipt output channels (DESIGN §7.6)", () => {
  it("fails the thermal path explicitly when no transport exists", async () => {
    const channel = createThermalChannel();
    const template = buildLocalReceipt(testReceipt());
    await expect(channel.run(template, "LOKAL-ABCDEF")).rejects.toBeInstanceOf(
      PrinterUnavailableError,
    );
    await expect(channel.run(template, "LOKAL-ABCDEF")).rejects.toThrow(
      "Printer tidak terhubung.",
    );
  });

  it("hands ESC/POS bytes to an available transport", async () => {
    const holder: { bytes?: Uint8Array } = {};
    const print = jest.fn(async (bytes: Uint8Array) => {
      holder.bytes = bytes;
    });
    const channel = createThermalChannel({ isAvailable: async () => true, print });
    const template = buildLocalReceipt(testReceipt());
    await channel.run(template, "LOKAL-ABCDEF");
    expect(print).toHaveBeenCalledTimes(1);
    expect(holder.bytes).toBeDefined();
    expect(Array.from(holder.bytes?.slice(0, 2) ?? [])).toEqual([0x1b, 0x40]);
  });

  it("builds a paper-white PDF document at the outlet width", () => {
    const template = buildLocalReceipt(testReceipt({ paperWidth: 80 }));
    const html = receiptHtml(template, 80);
    expect(html).toContain("size: 80mm auto");
    expect(html).toContain("background: #ffffff");
    expect(html).toContain("299.700");
  });
});
