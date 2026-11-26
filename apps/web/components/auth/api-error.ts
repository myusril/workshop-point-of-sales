import { apiErrorSchema, type ApiError } from "@workshop-pos/contracts";

export interface FormErrorState {
  message: string;
  fieldErrors: Record<string, string[]>;
  retryAfterSeconds?: number;
}

const STATUS_FALLBACKS: Record<number, string> = {
  400: "Periksa kembali isian Anda.",
  401: "Sesi Anda berakhir. Masuk kembali untuk melanjutkan.",
  403: "Anda tidak memiliki izin untuk tindakan ini.",
  404: "Data yang diminta tidak ditemukan.",
  409: "Data ini sudah digunakan. Periksa kembali isian Anda.",
  429: "Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba lagi.",
  500: "Terjadi kesalahan pada server. Coba lagi.",
};

/**
 * Reads the shared `{ error: { code, message, fieldErrors? } }` envelope and
 * always returns copy the UI can render. Never surfaces a raw response body.
 */
export async function readApiError(response: Response): Promise<FormErrorState> {
  const fallback = STATUS_FALLBACKS[response.status] ?? "Permintaan gagal. Coba lagi.";

  try {
    const body: unknown = await response.json();
    const parsed: ApiError = apiErrorSchema.parse(body);
    const message = parsed.error.message.trim();
    return {
      message: message.length > 0 ? message : fallback,
      fieldErrors: parsed.error.fieldErrors ?? {},
      retryAfterSeconds: parsed.error.retryAfterSeconds,
    };
  } catch {
    return { message: fallback, fieldErrors: {} };
  }
}

export const NETWORK_ERROR_MESSAGE =
  "Tidak dapat terhubung. Periksa jaringan, lalu coba lagi.";

/** Maps a server `retryAfterSeconds` to the shortest honest countdown copy. */
export function formatLockoutCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes} menit ${String(seconds).padStart(2, "0")} detik`;
}
