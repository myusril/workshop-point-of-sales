import type { Metadata } from "next";
import type { ReactNode } from "react";

import { BackOfficeShell } from "@/components/back-office/back-office-shell";
import { getSessionPayload, requirePageAuthContext } from "@/lib/auth/server";
import { backOfficeNavItems } from "@/lib/navigation-items";

export const metadata: Metadata = {
  title: "Back-office — Workshop POS",
};

export const dynamic = "force-dynamic";

/**
 * Persistent back-office frame for every authenticated screen in this group.
 * The guard runs here as well as in each page, so a direct URL still redirects
 * to `/login?next=…` before any shell chrome streams. WP3 pages keep their own
 * permission checks and `forbidden()` calls; this layout only wraps them.
 */
export default async function BackOfficeLayout({ children }: { children: ReactNode }) {
  const authContext = await requirePageAuthContext();
  const session = await getSessionPayload(authContext);

  return (
    <BackOfficeShell session={session} navItems={backOfficeNavItems(session.user.role)}>
      {children}
    </BackOfficeShell>
  );
}
