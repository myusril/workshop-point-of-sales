export type BackOfficeNavIcon = "home" | "catalog" | "inventory" | "users" | "outlets";

export interface BackOfficeNavItem {
  href: string;
  label: string;
  icon: BackOfficeNavIcon;
}

/**
 * Client-safe route matching. Kept free of any auth/DB import so the shell
 * can use it without pulling the server-only auth barrel into the browser
 * bundle. Role filtering lives in `navigation-items.ts` (server only).
 */
export function isBackOfficeNavItemActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
