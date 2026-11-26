/**
 * Only same-origin relative paths may survive the `next` parameter. Protocol
 * relative values ("//evil.example"), absolute URLs, encoded separators, and
 * the login page itself are all rejected.
 */
export function safeNextPath(raw: string | string[] | undefined): string | null {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("\\") || raw.includes("\u0000")) return null;

  const loginPrefix = "/login";
  const [pathOnly] = raw.split("?");
  if (pathOnly === loginPrefix || pathOnly === `${loginPrefix}/`) return null;

  return raw;
}

export function loginNotice(reason: string | string[] | undefined): string | null {
  if (reason === "expired") {
    return "Sesi berakhir karena tidak ada aktivitas. Masuk kembali untuk melanjutkan.";
  }
  return null;
}
