# Empty spare-part list on mobile — investigation

Date: 2026-11-28. Branch `chore/empty-spare-parts`. Delivery class `standard`.

## Reported symptom

On the Infinix X6882 (Android 14) after Owner sign-in and a catalog reload, the Jual screen
showed `Stok server · 28 Nov 2026 13.45 WIB` while the Spare-part list showed `Belum ada data`.

`Stok server` means the last catalog refresh reached the server and returned HTTP 200. The empty
state therefore came from a successful, empty response, not from a failed fetch, a stale cache, or
an offline fallback.

## Conclusion

**No catalog, page-cache, or mobile read-path defect. The list was correctly empty for the outlet
the session was pinned to.** The dev database carried E2E-created outlets, and an OWNER/ADMIN
mobile sign-in pins the session to the alphabetically first active outlet of the business
(`packages/auth/src/login.ts` `activeOutletId = scope.outlets[0]`, scope ordered by outlet name in
`packages/auth/src/scope.ts`). The E2E outlet `Outlet Cabang mx02ncc1c6c420` sorts before
`Outlet Pusat`, so the session fetched that outlet's catalog — 0 products, 0 services, HTTP 200 —
and the Jual screen honestly rendered `Belum ada data`.

Two contributing factors, both data/workflow, neither in the catalog read path:

1. **Test-data contamination.** `npm run test:e2e:web` resets the disposable dev schema at the
   start of a run and leaves the outlets and staff it created behind afterwards. Two such outlets
   were present in the dev volume.
2. **Default outlet selection for multi-outlet roles.** An OWNER/ADMIN is scoped to every active
   outlet, and mobile sign-in takes the first one in name order. This is deterministic but not
   what the operator sees on the web back-office (which shows the current `activeOutletId`), so a
   demo run over a contaminated database silently lands on an empty outlet.

Outlet scoping itself is correct: the same session token returned the seeded product after
switching to `Outlet Pusat`. No product code, seed, schema, auth, or money path changed in this
investigation.

## 1. Environment

| Item | Value |
|---|---|
| Branch / commit | `chore/empty-spare-parts`, base `2583f2c` |
| Node | `26.13.1` via `fnm exec --using=26.13.1` |
| Dev database | Compose service `db` (`workshop-pos-dev_workshop_pos_dev_db`), `postgres:19-alpine`, `127.0.0.1:55432/workshop_pos` |
| Web server | `npm run dev -- --port 3100` with the root `.env` exported |
| Device | Infinix X6882 (Hot 50), Android 14, `13313704BD004233`, `adb devices` state `device`, no emulator |
| Accounts | Four seed accounts provisioned with a per-run random password (`packages/auth/src/provision-cli.ts`, `WP3_ALLOW_PROVISION=1`); password never written to the repository |

## 2. Current-database forensics (before the reset)

```text
outlets (name order):
  700d3cb0-e846-4668-ac79-fce46090f887 | Outlet Cabang mx02ncc1c6c420 | created 2026-11-28 07:11:15Z
  8b4f199e-39a0-49c8-bae9-b94068002b58 | Outlet E2E mx02n8kk02c177 Ubah | created 2026-11-28 07:11:11Z
  b0000000-0000-4000-8000-000000000002 | Outlet Pusat                    | created 2026-11-28 07:08:44Z

products: 8 rows, all outlet b0000000-…-0002 (BRK-001 Kampas rem depan + 7 E2E-created SKUs)
services: 2 rows, all outlet b0000000-…-0002
orders:   14 rows, all outlet b0000000-…-0002
owner (seed_owner_rina) sessions by activeOutletId:
  b0000000-…-0002 n=31, 700d3cb0-…f887 n=12, 8b4f199e-…2b58 n=2
```

Both extra outlet names match the E2E fixtures: `Outlet E2E <suffix> Ubah` comes from
`apps/web/tests/e2e/outlets.spec.ts` "creates and edits an outlet…", `Outlet Cabang <suffix>` from
the same spec's two-outlet cashier case. Every product, service, and order stayed in `Outlet Pusat`.

Mobile-shaped sign-in against the contaminated database:

```sh
POST /api/v1/auth/login {"identifier":"owner@example.com","surface":"mobile"}
→ HTTP 200, session.activeOutletId = 700d3cb0-e846-4668-ac79-fce46090f887
   session.outletIds = [700d3cb0…, 8b4f199e…, b0000000…]

GET /api/v1/catalog/products?type=product&status=active&pageSize=100&page=1&sort=name&dir=asc
→ HTTP 200, total 0, items []
GET /api/v1/catalog/services?type=service&status=active&pageSize=100&page=1&sort=name&dir=asc
→ HTTP 200, total 0
```

Switching the same bearer session to the seed outlet (`POST /api/v1/auth/session/outlet`
`{"outletId":"b0000000-0000-4000-8000-000000000002"}`) and repeating the identical request:

```text
products → HTTP 200, total 8, first {sku BRK-001, name Kampas rem depan, price 250000, stockOnHand 14}
services → HTTP 200, total 2, first {code SRV-001, name Ganti oli mesin}
```

Same token, same query string, same code path: the difference is only the outlet the session was
pinned to. The catalog API is outlet-scoped and correct.

## 3. Clean-database baseline

```sh
docker compose -f compose.dev.yaml down -v
docker compose -f compose.dev.yaml up -d --wait db
npm run db:migrate
npm run db:seed
# provision CLI with a per-run random password
```

`db:seed` output: `Seed complete: 1 business, 1 outlet, 1 settings, 4 users, 4 staff-outlet rows,
1 product, 1 service, 1 customer, 1 vehicle, 1 opening ledger row, stock-on-hand 20`.

```sh
POST /api/v1/auth/login {"identifier":"owner@example.com","surface":"mobile"}
→ HTTP 200, role OWNER, session.activeOutletId = b0000000-0000-4000-8000-000000000002
   session.outletIds = [b0000000-0000-4000-8000-000000000002]

GET /api/v1/catalog/products?type=product&status=active&pageSize=100&page=1&sort=name&dir=asc
→ HTTP 200, total 1, totalPages 1, items [{sku BRK-001, name Kampas rem depan, outletId b0000000…0002}]
GET /api/v1/catalog/services?type=service&status=active&pageSize=100&page=1&sort=name&dir=asc
→ HTTP 200, total 1
```

Mobile pipeline against the same seeded server — real `createMobileEndpoints` HTTP calls, the real
`createCacheRefresher`, the real repository, and a real SQLite database (`node:sqlite`), executed
once as a throwaway script and then removed:

```json
{
  "activeOutletId": "b0000000-0000-4000-8000-000000000002",
  "refresh": { "catalog": 2, "customers": 1, "vehicles": 1, "orders": 0,
               "refreshedAt": "2026-11-28T07:26:34.470Z" },
  "productRowsViaSql": 1,
  "listCatalog": ["BRK-001 Kampas rem depan"]
}
```

The SQL probe was
`SELECT count(*) FROM cached_catalog WHERE item_type='PRODUCT' AND outlet_id=? AND is_active=1`
with the session's active outlet — 1 row. `listCatalog(db, outletId, { itemType: "PRODUCT" })`
returned exactly that row. The `itemType` filter, outlet scoping, and `is_active` handling in
`apps/mobile/src/db/repository.ts` and `apps/mobile/src/cache/refresh.ts` are sound.

## 4. Regression coverage already in place

No new test was added; the existing suite already fails if either side of the read path regresses:

- `apps/mobile/tests/cache-refresh.test.ts` — a successful refresh writes the catalog snapshot and
  `listCatalog` reads the item back; a failed refresh keeps the previous snapshot; a generation
  change aborts the write. A silently dropped or mis-scoped cached row fails these.
- `apps/web/tests/catalog-inventory.integration.test.ts` — outlet-scoped list/filter reads and
  per-outlet SKU uniqueness through the real service layer. A broken `type`/`status` filter or a
  cross-outlet leak fails these.

Not asserted anywhere, and left as a documented residual risk rather than a test: the default
active outlet chosen for a multi-outlet OWNER/ADMIN on mobile. It is auth/scope behavior outside
this investigation's ownership, and the current result (first outlet by name) is deterministic.

## 5. Device verification

See §5.1. The build was run with `npx expo run:android --device 13313704BD004233`, the dev API was
reached through `adb reverse tcp:3100 tcp:3100`, and the app was signed in as the seed Owner
against the freshly reseeded database.

### 5.1 Result — verified on the real device

| Step | Observed |
|---|---|
| `adb devices` | `13313704BD004233  device` (Infinix X6882, Android 14); no emulator/AVD started |
| Build/install | `npx expo run:android --device 13313704BD004233` with `ANDROID_HOME` exported and `EXPO_PUBLIC_API_URL=http://127.0.0.1:3100` → `BUILD SUCCESSFUL in 2m 55s`, debug APK installed and launched |
| API reachability | `adb reverse tcp:3100 tcp:3100`, so the phone's `127.0.0.1:3100` hits the host dev server (the previous `tcp:3000` reverse from §7.20 was kept) |
| Owner sign-in | `owner@example.com` (seed Owner Rina Wijaya) against the reseeded database → PIN enrollment (6 digits) → Jual screen |
| Jual header | `Outlet Pusat`, `Pemilik: Rina Wijaya`, `Online` |
| First render | Spare-part list already showed `Kampas rem depan` / `BRK-001 · stok sementara 20` / `Rp 250.000`, labelled `Stok sementara` before the explicit refresh |
| After `Muat ulang katalog, pelanggan, dan stok` | Label became `Stok server · 28 Nov 2026 14.34 WIB`, still `Kampas rem depan` / `BRK-001 · stok 20` / `Rp 250.000` — the founder's exact symptom (`Stok server` + populated list) reproduced as the correct state |
| `Belum ada data` | Not shown; the empty state appears only when the active outlet has no active catalog rows, as in §2 |

`logcat` during the session showed no catalog/network error; the only JS warning is the known
development-only `ROUTE_NAMES_CHANGED` notice documented in §7.20, unrelated to the catalog.

## 6. Recommendation

- Before any device demo, either reseed the disposable dev database
  (`docker compose -f compose.dev.yaml down -v && …`) or switch the active outlet to the outlet that
  owns the catalog. E2E runs legitimately leave their outlets and staff behind.
- Do not treat `Belum ada data` with a fresh `Stok server` timestamp as a sync bug: it is the honest
  empty state for an outlet with no active catalog rows. Compare the session's `activeOutletId` with
  the outlet that owns the products first.
- If the founder wants an OWNER/ADMIN mobile session to remember the last outlet used, or to prefer
  the seed/default outlet instead of the first by name, that is an auth/scope change and needs its
  own brief; it was deliberately not made here.
