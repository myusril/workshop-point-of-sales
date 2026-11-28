import {
  BluetoothPrinterTransport,
  type BluetoothTransportDeps,
  type EscposBluetoothBridge,
  type PrinterDevice,
} from "@/src/printing/bluetooth-transport";
import { PrinterUnavailableError } from "@/src/printing/sinks";

const printer: PrinterDevice = { name: "Xprinter XP-58", address: "66:77:88:99:AA:BB" };

function bridge(overrides: Partial<EscposBluetoothBridge> = {}): EscposBluetoothBridge {
  return {
    isAvailable: () => true,
    listBondedPrinters: () => [printer],
    print: jest.fn(async () => undefined),
    ...overrides,
  };
}

function deps(
  overrides: Partial<BluetoothTransportDeps> = {},
): BluetoothTransportDeps {
  return {
    platform: "android",
    osVersion: 34,
    loadModule: () => bridge(),
    requestConnectPermission: async () => true,
    ...overrides,
  };
}

describe("generic ESC/POS Bluetooth transport", () => {
  it("reports unavailable when the native module is absent (web/Jest)", async () => {
    const transport = new BluetoothPrinterTransport(
      deps({ platform: "web", loadModule: () => null }),
    );
    await expect(transport.isAvailable()).resolves.toBe(false);
    await expect(transport.listPrinters()).rejects.toThrow(
      "Pencetakan langsung hanya tersedia di aplikasi Android.",
    );
  });

  it("lists bonded printers only after the Bluetooth permission is granted", async () => {
    const request = jest.fn(async () => false);
    const transport = new BluetoothPrinterTransport(deps({ requestConnectPermission: request }));
    await expect(transport.listPrinters()).rejects.toBeInstanceOf(PrinterUnavailableError);
    await expect(transport.listPrinters()).rejects.toThrow("Izin Bluetooth ditolak");
    expect(request).toHaveBeenCalled();
  });

  it("surfaces a switched-off adapter instead of an empty list", async () => {
    const transport = new BluetoothPrinterTransport(
      deps({ loadModule: () => bridge({ isAvailable: () => false, listBondedPrinters: () => [] }) }),
    );
    await expect(transport.listPrinters()).rejects.toThrow("Bluetooth mati");
  });

  it("returns the paired printer list", async () => {
    const transport = new BluetoothPrinterTransport(deps());
    await expect(transport.listPrinters()).resolves.toEqual([printer]);
  });

  it("passes the injected Android version to the permission gate", async () => {
    const request = jest.fn(async () => true);
    const transport = new BluetoothPrinterTransport(
      deps({ osVersion: 30, requestConnectPermission: request }),
    );
    await transport.listPrinters();
    expect(request).toHaveBeenCalledWith(30);
  });

  it("refuses to print before a printer is selected", async () => {
    const transport = new BluetoothPrinterTransport(deps());
    await expect(transport.print(Uint8Array.from([0x1b, 0x40]))).rejects.toThrow(
      "Pilih printer terlebih dahulu.",
    );
  });

  it("writes ESC/POS bytes to the selected printer address", async () => {
    const print = jest.fn(async () => undefined);
    const transport = new BluetoothPrinterTransport(deps({ loadModule: () => bridge({ print }) }));
    transport.selectPrinter(printer);
    await transport.print(Uint8Array.from([0x1b, 0x40, 0x0a]));
    expect(print).toHaveBeenCalledWith("66:77:88:99:AA:BB", [0x1b, 0x40, 0x0a]);
  });

  it("wraps a native print failure with a Bahasa message", async () => {
    const transport = new BluetoothPrinterTransport(
      deps({
        loadModule: () =>
          bridge({
            print: async () => {
              throw new Error("read failed, socket might closed");
            },
          }),
      }),
    );
    transport.selectPrinter(printer);
    await expect(transport.print(Uint8Array.from([0x1b]))).rejects.toThrow(
      "Gagal mencetak: read failed, socket might closed",
    );
  });
});
