import * as SecureStore from "expo-secure-store";

/**
 * Secret storage port. The device keeps the bearer token, session snapshot, and
 * the local PIN verifier here; nothing secret ever reaches SQLite or a log.
 */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createExpoSecretStore(): SecretStore {
  return {
    async get(key) {
      return SecureStore.getItemAsync(key);
    },
    async set(key, value) {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    },
    async delete(key) {
      await SecureStore.deleteItemAsync(key);
    },
  };
}

/** In-memory store for unit tests; never used by the shipped app. */
export function createMemorySecretStore(
  initial: Record<string, string> = {},
): SecretStore & { snapshot(): Record<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    async get(key) {
      return data.get(key) ?? null;
    },
    async set(key, value) {
      data.set(key, value);
    },
    async delete(key) {
      data.delete(key);
    },
    snapshot() {
      return Object.fromEntries(data);
    },
  };
}
