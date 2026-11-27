import { Directory, Paths } from "expo-file-system";

/**
 * Receipt exports contain customer names, plates, and amounts. They live in one
 * dedicated cache directory so sign-out, session expiry, and revocation can
 * remove them together with the SQLite cache (FR-006).
 */

const RECEIPT_DIRECTORY = "workshop-pos-struk";

export function receiptDirectory(): Directory {
  return new Directory(Paths.cache, RECEIPT_DIRECTORY);
}

export function prepareReceiptDirectory(): Directory {
  const directory = receiptDirectory();
  if (!directory.exists) directory.create({ intermediates: true, overwrite: true });
  return directory;
}

export function clearReceiptFiles(): void {
  const directory = receiptDirectory();
  if (directory.exists) directory.delete();
}
