"use client";

import type { OutletSummary, SessionPayload } from "@workshop-pos/contracts";
import {
  Boxes,
  LayoutDashboard,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Store,
  SunMoon,
  Users,
  Wifi,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { NETWORK_ERROR_MESSAGE, readApiError } from "@/components/auth/api-error";
import { ROLE_LABELS } from "@/components/auth/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  isBackOfficeNavItemActive,
  type BackOfficeNavIcon,
  type BackOfficeNavItem,
} from "@/lib/navigation";

const SIDEBAR_STORAGE_KEY = "wpos-sidebar-collapsed";

/**
 * Collapse preference is an external store, not React state copied from an
 * effect: the server renders the expanded rail, then the browser snapshot
 * applies the saved choice without a cascading render.
 */
const collapseListeners = new Set<() => void>();
let collapseCache: boolean | null = null;

function readCollapsedPreference(): boolean {
  if (collapseCache !== null) return collapseCache;
  try {
    collapseCache = window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    collapseCache = false;
  }
  return collapseCache;
}

function subscribeCollapsed(listener: () => void): () => void {
  collapseListeners.add(listener);
  return () => {
    collapseListeners.delete(listener);
  };
}

function writeCollapsedPreference(value: boolean): void {
  collapseCache = value;
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(value));
  } catch {
    // Persistence is a convenience; the in-memory snapshot still works.
  }
  for (const listener of collapseListeners) listener();
}

const NAV_ICONS: Record<BackOfficeNavIcon, LucideIcon> = {
  home: LayoutDashboard,
  catalog: Package,
  inventory: Boxes,
  users: Users,
  outlets: Store,
};

interface BackOfficeShellProps {
  session: SessionPayload;
  /** Role-filtered destinations resolved on the server. */
  navItems: BackOfficeNavItem[];
  children: ReactNode;
}

interface SidebarContentProps {
  session: SessionPayload;
  collapsed: boolean;
  navItems: BackOfficeNavItem[];
  outlets: OutletSummary[];
  selectedOutletId: string;
  outletPending: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
  onSwitchOutlet: (outletId: string) => void;
  showCollapseToggle: boolean;
}

function SidebarContent({
  session,
  collapsed,
  navItems,
  outlets,
  selectedOutletId,
  outletPending,
  onToggleCollapsed,
  onNavigate,
  onSwitchOutlet,
  showCollapseToggle,
}: SidebarContentProps) {
  const pathname = usePathname();
  const switcherId = useId();
  const activeOutlet =
    outlets.find((outlet) => outlet.id === selectedOutletId) ?? null;
  const showSwitcher = outlets.length > 1;
  const roleLabel = ROLE_LABELS[session.user.role];

  return (
    <>
      <div className="bo-sidebar__brand">
        <Link href="/" className="bo-wordmark" aria-label="Workshop POS — Beranda" onClick={onNavigate}>
          {collapsed ? "WP" : "Workshop POS"}
        </Link>
        {showCollapseToggle ? (
          <button
            type="button"
            className="bo-icon-button"
            aria-label={collapsed ? "Bentangkan menu samping" : "Ciutkan menu samping"}
            aria-pressed={collapsed}
            onClick={onToggleCollapsed}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" />
            ) : (
              <PanelLeftClose aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      <nav className="bo-nav" aria-label="Navigasi utama">
        <ul className="bo-nav__list">
          {navItems.map((item) => {
            const Icon = NAV_ICONS[item.icon];
            const active = isBackOfficeNavItemActive(item.href, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="bo-nav__link"
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  onClick={onNavigate}
                >
                  <Icon aria-hidden="true" className="bo-nav__icon" />
                  {collapsed ? (
                    <span className="bo-sr-only">{item.label}</span>
                  ) : (
                    <span className="bo-nav__label">{item.label}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="bo-sidebar__footer">
        {showSwitcher ? (
          <div className="bo-field">
            {collapsed ? (
              <button
                type="button"
                className="bo-icon-button"
                aria-label="Bentangkan menu untuk memilih outlet"
                onClick={() => {
                  onToggleCollapsed?.();
                  window.setTimeout(() => {
                    document.getElementById(switcherId)?.focus();
                  }, 0);
                }}
              >
                <Store aria-hidden="true" />
              </button>
            ) : (
              <>
                <label className="bo-field__label" htmlFor={switcherId}>
                  Outlet aktif
                </label>
                <select
                  id={switcherId}
                  className="bo-select"
                  value={selectedOutletId}
                  disabled={outletPending}
                  aria-describedby={outletPending ? `${switcherId}-pending` : undefined}
                  onChange={(event) => {
                    onSwitchOutlet(event.target.value);
                  }}
                >
                  {outlets.map((outlet) => (
                    <option key={outlet.id} value={outlet.id}>
                      {outlet.name}
                      {outlet.isActive ? "" : " (nonaktif)"}
                    </option>
                  ))}
                </select>
              </>
            )}
            {outletPending ? (
              <p className="bo-field__hint" id={`${switcherId}-pending`} role="status">
                Mengganti outlet aktif…
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="bo-sidebar__identity">
          {collapsed ? (
            <span className="bo-sr-only">
              {session.user.name}, {roleLabel}
              {activeOutlet ? `, ${activeOutlet.name}` : ""}
            </span>
          ) : (
            <>
              <span className="bo-sidebar__name">{session.user.name}</span>
              <span className="bo-sidebar__meta">
                {roleLabel}
                {activeOutlet ? ` · ${activeOutlet.name}` : outlets.length === 0 ? " · Tanpa outlet" : ""}
              </span>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      className="bo-icon-button"
      aria-label="Ganti tema terang atau gelap"
      title="Ganti tema"
      onClick={() => {
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
      }}
    >
      <SunMoon aria-hidden="true" />
    </button>
  );
}

function ConnectionChip() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => {
      setOnline(window.navigator.onLine);
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return (
    <span className={online ? "bo-chip bo-chip--success" : "bo-chip bo-chip--warning"} role="status">
      {online ? <Wifi aria-hidden="true" className="size-3" /> : <WifiOff aria-hidden="true" className="size-3" />}
      {online ? "Online" : "Offline"}
    </span>
  );
}

/**
 * Back-office frame: skip link, persistent 264/72 px sidebar (280 px drawer
 * below 1024 px), 56 px top bar with global search, and the `#konten-utama`
 * focus target. Navigation is filtered by the signed-in role.
 */
export function BackOfficeShell({ session, navItems, children }: BackOfficeShellProps) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    readCollapsedPreference,
    () => false,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const outlets = session.outlets;
  const [selectedOutletId, setSelectedOutletId] = useState(session.session.activeOutletId ?? "");
  const [outletPending, setOutletPending] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const activeOutlet =
    outlets.find((outlet) => outlet.id === selectedOutletId) ?? null;
  const roleLabel = ROLE_LABELS[session.user.role];

  async function switchOutlet(outletId: string) {
    if (outletId === selectedOutletId) return;

    const previousOutletId = selectedOutletId;
    setSelectedOutletId(outletId);
    setOutletPending(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch("/api/v1/auth/session/outlet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outletId }),
      });

      if (!response.ok) {
        setSelectedOutletId(previousOutletId);
        setError((await readApiError(response)).message);
        return;
      }

      const outletName = outlets.find((outlet) => outlet.id === outletId)?.name ?? "outlet baru";
      setStatus(`Outlet aktif diganti ke ${outletName}.`);
      router.refresh();
    } catch {
      setSelectedOutletId(previousOutletId);
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setOutletPending(false);
    }
  }

  async function signOut() {
    setLogoutPending(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch("/api/v1/auth/logout", { method: "POST" });
      if (!response.ok) {
        setError((await readApiError(response)).message);
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setLogoutPending(false);
    }
  }

  const sidebarProps = {
    session,
    collapsed,
    navItems,
    outlets,
    selectedOutletId,
    outletPending,
    onSwitchOutlet: (outletId: string) => {
      void switchOutlet(outletId);
    },
  };

  return (
    <div className="bo-shell" data-collapsed={collapsed ? "true" : "false"}>
      <a className="bo-skip-link" href="#konten-utama">
        Lewati ke konten utama
      </a>

      <aside className="bo-sidebar" aria-label="Bilah samping">
        <SidebarContent
          {...sidebarProps}
          showCollapseToggle
          onToggleCollapsed={() => {
            writeCollapsedPreference(!collapsed);
          }}
        />
      </aside>

      <div className="bo-frame">
        <header className="bo-topbar">
          <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
            <Dialog.Trigger asChild>
              <button type="button" className="bo-icon-button bo-topbar__menu" aria-label="Buka menu navigasi">
                <Menu aria-hidden="true" />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
              <Dialog.Content className="bo-drawer" aria-describedby={undefined}>
                <Dialog.Title className="bo-sr-only">Menu navigasi</Dialog.Title>
                <div className="bo-sidebar__brand">
                  <span className="bo-wordmark">Menu</span>
                  <Dialog.Close asChild>
                    <button type="button" className="bo-icon-button" aria-label="Tutup menu navigasi">
                      <X aria-hidden="true" />
                    </button>
                  </Dialog.Close>
                </div>
                <SidebarContent
                  {...sidebarProps}
                  collapsed={false}
                  showCollapseToggle={false}
                  onNavigate={() => {
                    setDrawerOpen(false);
                  }}
                />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          <Link href="/" className="bo-topbar__mobile-brand">
            Workshop POS
          </Link>

          <form className="bo-search" action="/catalog" method="get" role="search">
            <label className="bo-sr-only" htmlFor="bo-global-search">
              Telusuri katalog
            </label>
            <Input
              ref={searchRef}
              id="bo-global-search"
              name="q"
              type="search"
              placeholder="Cari produk atau jasa"
              autoComplete="off"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.currentTarget.value = "";
                }
              }}
            />
            <Button type="submit" variant="secondary">
              Cari
            </Button>
          </form>

          <div className="bo-topbar__meta">
            <ConnectionChip />

            <ThemeToggle />

            <div className="bo-topbar__identity">
              <span className="bo-topbar__name">{session.user.name}</span>
              <span className="bo-topbar__role">
                {roleLabel}
                {activeOutlet ? ` · ${activeOutlet.name}` : ""}
              </span>
            </div>

            <Button
              variant="secondary"
              disabled={logoutPending}
              onClick={() => {
                void signOut();
              }}
            >
              {logoutPending ? "Keluar…" : "Keluar"}
            </Button>
          </div>

          {error ? (
            <p className="bo-alert bo-alert--danger bo-span-full" role="alert">
              {error}
            </p>
          ) : null}
          {status ? (
            <p className="bo-alert bo-alert--success bo-span-full" role="status">
              {status}
            </p>
          ) : null}
        </header>

        <div id="konten-utama" className="bo-main" tabIndex={-1}>
          {children}
        </div>
      </div>
    </div>
  );
}
