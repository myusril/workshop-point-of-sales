import { requireOptionalNativeModule } from "expo";
import { PermissionsAndroid, Platform } from "react-native";

import { PrinterUnavailableError, type PrinterTransport } from "./sinks";
import type {
  BondedPrinter,
  EscposBluetoothNativeModule,
} from "../../modules/escpos-bluetooth";

/**
 * Generic ESC/POS over Bluetooth SPP (FR-040, DESIGN §7.6).
 *
 * Mainstream 58 mm and 80 mm receipt printers (Epson, Xprinter, Rongta, Zjiang,
 * Star, …) accept the same ESC/POS byte stream over the Bluetooth serial-port
 * profile. Pairing is left to Android Settings; this transport lists bonded
 * devices and writes the bytes `encodeEscPos` already produces. No vendor SDK
 * and no Epson ePOS terms are involved.
 *
 * The native module is loaded lazily so Jest and non-Android platforms can
 * still import the receipt screen. Every failure is surfaced as a Bahasa
 * `PrinterUnavailableError`; nothing is swallowed or retried silently.
 */

export type PrinterDevice = BondedPrinter;

export interface EscposBluetoothBridge {
  isAvailable(): boolean;
  listBondedPrinters(): PrinterDevice[];
  print(address: string, bytes: number[]): Promise<void>;
}

export interface BluetoothTransportDeps {
  platform: string;
  osVersion: number;
  loadModule(): EscposBluetoothBridge | null;
  requestConnectPermission(): Promise<boolean>;
}

function loadNativeModule(): EscposBluetoothBridge | null {
  // Optional lookup: null on web, Jest, and any build without the module.
  return requireOptionalNativeModule<EscposBluetoothNativeModule>("EscposBluetooth");
}

async function requestConnectPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  // Android 11 and below grant BLUETOOTH at install time.
  if (Number(Platform.Version) < 31) return true;

  type AndroidPermission = Parameters<typeof PermissionsAndroid.check>[0];
  const permission = PermissionsAndroid.PERMISSIONS
    .BLUETOOTH_CONNECT as AndroidPermission | undefined;
  if (!permission) return true;

  if (await PermissionsAndroid.check(permission)) return true;
  const result = await PermissionsAndroid.request(permission, {
    title: "Izin Bluetooth",
    message:
      "Aplikasi memerlukan izin Bluetooth untuk mencetak struk ke printer.",
    buttonPositive: "Izinkan",
    buttonNegative: "Batal",
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export function defaultBluetoothDeps(): BluetoothTransportDeps {
  return {
    platform: Platform.OS,
    osVersion: Number(Platform.Version),
    loadModule: loadNativeModule,
    requestConnectPermission,
  };
}

export class BluetoothPrinterTransport implements PrinterTransport {
  private selected: PrinterDevice | null = null;

  constructor(private readonly deps: BluetoothTransportDeps = defaultBluetoothDeps()) {}

  private bridge(): EscposBluetoothBridge {
    const bridge = this.deps.loadModule();
    if (!bridge) {
      throw new PrinterUnavailableError(
        "Pencetakan langsung hanya tersedia di aplikasi Android.",
      );
    }
    return bridge;
  }

  async isAvailable(): Promise<boolean> {
    if (this.deps.platform !== "android") return false;
    try {
      return this.bridge().isAvailable();
    } catch {
      return false;
    }
  }

  async listPrinters(): Promise<PrinterDevice[]> {
    if (this.deps.platform !== "android") {
      throw new PrinterUnavailableError(
        "Pencetakan langsung hanya tersedia di aplikasi Android.",
      );
    }
    if (!(await this.deps.requestConnectPermission())) {
      throw new PrinterUnavailableError(
        "Izin Bluetooth ditolak. Izinkan akses Bluetooth untuk mencetak struk.",
      );
    }
    const bridge = this.bridge();
    if (!bridge.isAvailable()) {
      throw new PrinterUnavailableError(
        "Bluetooth mati. Nyalakan Bluetooth lalu coba lagi.",
      );
    }
    try {
      return bridge.listBondedPrinters();
    } catch (error) {
      throw new PrinterUnavailableError(
        error instanceof Error && error.message
          ? error.message
          : "Daftar printer tidak dapat dibaca.",
      );
    }
  }

  selectPrinter(device: PrinterDevice | null): void {
    this.selected = device;
  }

  selectedPrinter(): PrinterDevice | null {
    return this.selected;
  }

  async print(bytes: Uint8Array): Promise<void> {
    if (!this.selected) {
      throw new PrinterUnavailableError("Pilih printer terlebih dahulu.");
    }
    const bridge = this.bridge();
    try {
      await bridge.print(this.selected.address, Array.from(bytes));
    } catch (error) {
      const detail =
        error instanceof Error && error.message
          ? error.message
          : "Printer tidak merespons.";
      throw new PrinterUnavailableError(`Gagal mencetak: ${detail}`);
    }
  }
}
