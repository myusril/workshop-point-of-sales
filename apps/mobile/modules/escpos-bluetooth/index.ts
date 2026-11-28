import { requireNativeModule, type NativeModule } from "expo";

export interface BondedPrinter {
  name: string;
  address: string;
}

export declare class EscposBluetoothNativeModule extends NativeModule {
  isAvailable(): boolean;
  listBondedPrinters(): BondedPrinter[];
  print(address: string, bytes: number[]): Promise<void>;
}

export default requireNativeModule<EscposBluetoothNativeModule>("EscposBluetooth");
