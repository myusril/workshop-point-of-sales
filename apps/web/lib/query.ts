/**
 * Builds a route href from the current query state. Empty/undefined values are
 * dropped so "Hapus filter" produces the canonical bare URL, and overrides win
 * without mutating the input.
 */
export function buildQueryHref(
  basePath: string,
  query: Record<string, string | number | undefined>,
  overrides: Record<string, string | number | undefined> = {},
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries({ ...query, ...overrides })) {
    if (value === undefined) continue;
    const serialized = String(value);
    if (serialized.length === 0) continue;
    params.set(key, serialized);
  }

  const serialized = params.toString();
  return serialized.length > 0 ? `${basePath}?${serialized}` : basePath;
}
