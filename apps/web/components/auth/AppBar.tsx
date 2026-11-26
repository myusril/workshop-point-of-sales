import { can } from "@workshop-pos/auth";
import type { SessionPayload } from "@workshop-pos/contracts";
import Link from "next/link";

import { SessionBar } from "./SessionBar";

type CurrentSection = "home" | "users" | "outlets";

interface AppBarProps {
  session: SessionPayload;
  current: CurrentSection;
}

/**
 * Minimal identity bar for the WP3 screens. The persistent navigation shell,
 * sidebar, and command palette belong to WP4; this only exposes the links a
 * role may actually use.
 */
export function AppBar({ session, current }: AppBarProps) {
  const canManageUsers = can(session.user.role, "manage_users");
  const canManageOutlets = can(session.user.role, "manage_outlets");

  return (
    <header className="wp3-appbar">
      <div className="wp3-appbar__inner">
        <div className="wp3-appbar__start">
          <Link className="wp3-appbar__brand" href="/">
            Workshop POS
          </Link>
          <nav className="wp3-appbar__nav" aria-label="Navigasi utama">
            <Link href="/" aria-current={current === "home" ? "page" : undefined}>
              Beranda
            </Link>
            {canManageUsers ? (
              <Link href="/users" aria-current={current === "users" ? "page" : undefined}>
                Pengguna
              </Link>
            ) : null}
            {canManageOutlets ? (
              <Link href="/outlets" aria-current={current === "outlets" ? "page" : undefined}>
                Outlet
              </Link>
            ) : null}
          </nav>
        </div>

        <SessionBar
          user={session.user}
          outlets={session.outlets}
          activeOutletId={session.session.activeOutletId}
        />
      </div>
    </header>
  );
}
