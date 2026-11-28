import type { Metadata } from "next";
import type { ReactNode } from "react";

import { BackOfficeShell } from "@/components/back-office/back-office-shell";
import {
  getAuthRuntime,
  getPageAuthContext,
  getSessionPayload,
  requirePageAuthContext,
} from "@/lib/auth/server";
import { backOfficeNavItems } from "@/lib/navigation-items";
import { DEFAULT_PRODUCT_NAME, getBrandingForBusiness } from "@/lib/settings-service";

export const dynamic = "force-dynamic";

/**
 * Browser title for the shell frame. Every page still owns its own title
 * (`Beranda — …`, `Pengaturan — …`); this default covers routes without one.
 *
 * Metadata must never redirect, so it resolves the session without the page
 * guard and falls back to the default wordmark when signed out.
 */
export async function generateMetadata(): Promise<Metadata> {
  const authContext = await getPageAuthContext();
  if (!authContext) return { title: DEFAULT_PRODUCT_NAME };

  const branding = await getBrandingForBusiness(
    getAuthRuntime().db,
    authContext.user.businessId,
  );
  return { title: branding.productName };
}

/**
 * Persistent back-office frame for every authenticated screen in this group.
 * The guard runs here as well as in each page, so a direct URL still redirects
 * to `/login?next=…` before any shell chrome streams. WP3 pages keep their own
 * permission checks and `forbidden()` calls; this layout only wraps them.
 *
 * Branding is read for every authenticated role (FR-071); it is not a setting,
 * so it never consults `manage_settings`.
 */
export default async function BackOfficeLayout({ children }: { children: ReactNode }) {
  const authContext = await requirePageAuthContext();
  const session = await getSessionPayload(authContext);
  const branding = await getBrandingForBusiness(
    getAuthRuntime().db,
    authContext.user.businessId,
  );

  return (
    <BackOfficeShell
      session={session}
      navItems={backOfficeNavItems(session.user.role)}
      branding={branding}
    >
      {children}
    </BackOfficeShell>
  );
}
