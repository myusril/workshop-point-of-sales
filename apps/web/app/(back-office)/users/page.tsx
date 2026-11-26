import { AuthError, can, listOutlets, listStaffUsers, type AuthContext } from "@workshop-pos/auth";
import {
  listUsersQuerySchema,
  type Outlet,
  type ListUsersQuery,
  type UserListResponse,
} from "@workshop-pos/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { Suspense } from "react";

import { AppBar } from "@/components/auth/AppBar";
import { ROLE_LABELS } from "@/components/auth/labels";
import { PageSkeleton } from "@/components/back-office/PageSkeleton";
import { getAuthRuntime, getSessionPayload, requirePageAuthContext } from "@/lib/auth/server";

import { UserCreateForm } from "./user-create-form";
import { UsersTable } from "./users-table";

export const metadata: Metadata = {
  title: "Pengguna — Workshop POS",
};

export const dynamic = "force-dynamic";

interface UsersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function buildUsersHref(params: {
  search?: string;
  role?: string;
  status?: string;
  page?: number;
}): string {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.role) query.set("role", params.role);
  if (params.status) query.set("status", params.status);
  if (params.page && params.page > 1) query.set("page", String(params.page));

  const serialized = query.toString();
  return serialized.length > 0 ? `/users?${serialized}` : "/users";
}

const DEFAULT_QUERY: ListUsersQuery = { page: 1, pageSize: 20 };

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const params = await searchParams;
  // The guard explains an idle-timeout sign-out (reason=expired) on /login.
  const authContext = await requirePageAuthContext();
  const session = await getSessionPayload(authContext);

  // A direct URL outside the role's permissions renders forbidden.tsx in this
  // segment with an HTTP 403 status, never a 200 page that only looks denied.
  // Nothing below may stream before this check runs.
  if (!can(session.user.role, "manage_users")) forbidden();

  const parsedQuery = listUsersQuerySchema.safeParse({
    search: firstValue(params.search)?.trim() || undefined,
    role: firstValue(params.role) || undefined,
    status: firstValue(params.status) || undefined,
    page: firstValue(params.page),
  });
  const query = parsedQuery.success ? parsedQuery.data : DEFAULT_QUERY;

  return (
    <>
      <AppBar session={session} current="users" />
      <main className="wp3-page">
        <header className="wp3-page__header">
          <div>
            <h1 className="wp3-page__title">Pengguna</h1>
            <p className="wp3-page__lead">
              Kelola akun staf, peran, dan penugasan outlet. Setiap perubahan akses dicatat di log audit.
            </p>
          </div>
        </header>

        <div className="wp3-page__body">
          {/* Suspense sits after the permission check: a denied role still gets
              a real 403 instead of a streamed 200. */}
          <Suspense
            fallback={<PageSkeleton label="Memuat pengguna…" testId="users-loading" withFilterBar />}
          >
            <UsersData authContext={authContext} query={query} />
          </Suspense>
        </div>
      </main>
    </>
  );
}

interface UsersDataProps {
  authContext: AuthContext;
  query: ListUsersQuery;
}

async function UsersData({ authContext, query }: UsersDataProps) {
  let users: UserListResponse | null = null;
  let outlets: Outlet[] = [];
  let loadError: string | null = null;

  try {
    const { db } = getAuthRuntime();
    users = await listStaffUsers(db, authContext, query);
    outlets = (await listOutlets(db, authContext)).items;
  } catch (error) {
    loadError =
      error instanceof AuthError
        ? error.message
        : "Data pengguna gagal dimuat. Periksa koneksi, lalu coba lagi.";
  }

  const currentHref = buildUsersHref({
    search: query.search,
    role: query.role,
    status: query.status,
    page: query.page,
  });
  const hasFilters = Boolean(query.search || query.role || query.status);
  const totalPages = users ? Math.max(1, Math.ceil(users.total / users.pageSize)) : 1;
  const firstRow = users && users.total > 0 ? (users.page - 1) * users.pageSize + 1 : 0;
  const lastRow = users ? Math.min(users.page * users.pageSize, users.total) : 0;

  if (loadError || !users) {
    return (
      <section
        className="wp3-state"
        role="alert"
        aria-labelledby="users-error-title"
        data-testid="users-load-error"
      >
        <h2 className="wp3-state__title" id="users-error-title">
          Data pengguna gagal dimuat.
        </h2>
        <p className="wp3-state__body">
          {loadError ?? "Data pengguna gagal dimuat. Periksa koneksi, lalu coba lagi."} Daftar dan jumlah
          pengguna tidak ditampilkan agar tidak menyesatkan.
        </p>
        <div className="wp3-state__actions">
          <Link className="wp3-btn" href={currentHref}>
            Coba lagi
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="wp3-panel" aria-labelledby="users-list-title">
        <div className="wp3-panel__header">
          <h2 className="wp3-panel__title" id="users-list-title">
            Daftar pengguna
          </h2>
          <span className="wp3-panel__meta">{users.total} pengguna</span>
        </div>

        <form className="wp3-filterbar" method="get" action="/users" role="search">
          <div className="wp3-field">
            <label className="wp3-label" htmlFor="users-search">
              Cari
            </label>
            <input
              className="wp3-input"
              id="users-search"
              name="search"
              type="search"
              defaultValue={query.search ?? ""}
              placeholder="Nama, email, atau nomor HP"
            />
          </div>
          <div className="wp3-field">
            <label className="wp3-label" htmlFor="users-role">
              Peran
            </label>
            <select className="wp3-select" id="users-role" name="role" defaultValue={query.role ?? ""}>
              <option value="">Semua peran</option>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="wp3-field">
            <label className="wp3-label" htmlFor="users-status">
              Status
            </label>
            <select className="wp3-select" id="users-status" name="status" defaultValue={query.status ?? ""}>
              <option value="">Semua status</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
          </div>
          <div className="wp3-filterbar__actions">
            <button className="wp3-btn" type="submit">
              Terapkan filter
            </button>
            {hasFilters ? (
              <Link className="wp3-btn wp3-btn--quiet" href="/users">
                Hapus filter
              </Link>
            ) : null}
          </div>
        </form>

        {users.items.length === 0 ? (
          <div className="wp3-state wp3-panel__body" data-testid="users-empty">
            {users.total > 0 ? (
              <>
                <h3 className="wp3-state__title">Halaman ini tidak berisi pengguna.</h3>
                <p className="wp3-state__body">
                  Daftar berisi {users.total} pengguna. Kembali ke halaman pertama untuk melihatnya.
                </p>
                <div className="wp3-state__actions">
                  <Link className="wp3-btn" href="/users">
                    Ke halaman pertama
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h3 className="wp3-state__title">
                  {hasFilters ? "Tidak ada pengguna yang cocok." : "Belum ada pengguna selain Anda."}
                </h3>
                <p className="wp3-state__body">
                  {hasFilters
                    ? `Tidak ada hasil untuk filter yang dipilih${
                        query.search ? `, termasuk "${query.search}"` : ""
                      }. Hapus filter atau coba kata lain.`
                    : "Tambahkan kasir, mekanik, atau admin pertama dan tugaskan ke outlet."}
                </p>
                <div className="wp3-state__actions">
                  {hasFilters ? (
                    <Link className="wp3-btn" href="/users">
                      Hapus filter
                    </Link>
                  ) : (
                    <a className="wp3-btn wp3-btn--primary" href="#tambah-pengguna">
                      Tambah pengguna
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <UsersTable users={users.items} outlets={outlets} />
            <div className="wp3-pagination">
              <span className="wp3-pagination__summary">
                Menampilkan {firstRow}–{lastRow} dari {users.total} pengguna
              </span>
              <div className="wp3-pagination__controls">
                {users.page > 1 ? (
                  <Link
                    className="wp3-btn"
                    href={buildUsersHref({
                      search: query.search,
                      role: query.role,
                      status: query.status,
                      page: users.page - 1,
                    })}
                  >
                    Sebelumnya
                  </Link>
                ) : null}
                {users.page < totalPages ? (
                  <Link
                    className="wp3-btn"
                    href={buildUsersHref({
                      search: query.search,
                      role: query.role,
                      status: query.status,
                      page: users.page + 1,
                    })}
                  >
                    Berikutnya
                  </Link>
                ) : null}
              </div>
            </div>
          </>
        )}
      </section>

      <UserCreateForm outlets={outlets} />
    </>
  );
}
