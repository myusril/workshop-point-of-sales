# Workshop POS — UI State Matrix

**Status:** Normative for implementation and design QA
**Version:** 1.0.0
**Date:** 2026-11-26
**Companions:** `docs/ui/DESIGN.md` (visual system, components), `docs/ui/tokens.json` (values)
**Scope:** Web back-office and Android-first mobile app

This matrix defines the required states, recovery paths, and copy intent for every major surface. A screen is not complete when its happy path renders. It is complete when the applicable states below are implemented, visually distinct, keyboard-accessible, and announced to assistive technology.

Copy below is proposed product copy in Bahasa Indonesia. It is intent, not final legal or tax wording. Buyer vocabulary decisions in `DESIGN.md` §12 may replace individual nouns, but the state distinctions and recovery paths do not change.

---

## 1. State vocabulary

| State | Definition | Non-negotiable rule |
|---|---|---|
| **Default** | The screen has current, valid data and no exceptional condition. | The primary action is obvious and enabled only when the domain allows it. |
| **Loading** | The first meaningful data for the surface is not yet available. | Skeletons match final geometry; no layout shift; the region is `aria-busy` and has a text alternative. |
| **Empty** | The request succeeded but there is nothing to show. | Distinguish true zero, filtered no-results, and not-yet-configured. Each has a different explanation and action. |
| **Error** | The request failed, or the action could not be completed. | Never render `Rp 0`, "0 transaksi", or an empty state for a failure. Use `—` for unknown values and provide a retry. |
| **Permission-denied** | The signed-in role or outlet scope may not perform the action or view the record. | Name what is denied, which role can act, and how to ask. Do not render an empty table or a silent dead button. |
| **Offline** | The device cannot reach the server. | State what still works, what is read-only, and that local data is cached. Never claim server confirmation. |
| **Syncing** | Locally committed work is being sent to the server, or a server read is refreshing. | Per-item state; no duplicate submission; do not block unrelated work. |
| **Sync-conflict** | The server rejected or altered a queued change and a human decision is required. | No silent resolution and no deletion. Show local vs server values and the money already taken; require an explicit decision. |
| **Destructive-confirmation** | The action removes access, reverses money/stock, or cannot be undone. | State object, consequence, scope, and required reason. Confirm button repeats the verb. Cancel receives initial focus. |
| **Success** | The action completed and the persisted state is confirmed. | Say whether it is server-confirmed or local-only. Announce the new state politely. |
| **Long content** | Names, amounts, plate values, tender lists, or item counts exceed the happy-path length. | Names wrap (max 2 lines) with full value available; money, plates, and document numbers never wrap or clip; tables scroll inside their container; page-level overflow is zero. |

### 1.1 Zero, empty, and error are different

| Situation | Presentation | Example |
|---|---|---|
| True zero | A real computed zero from successful data | `Belum ada penjualan hari ini.` and `Rp 0` in a report for a day with no orders |
| No results for a filter/search | The query is echoed and a reset is offered | `Tidak ada hasil untuk "oli". Hapus filter atau coba kata lain.` |
| Not configured yet | A setup explanation and a first action | `Tambahkan produk pertama untuk mulai berjualan.` |
| Fetch/action failure | An error block with cause, effect, and retry; unknown numbers are `—` | `Data gagal dimuat. Periksa koneksi, lalu coba lagi.` |
| Permission-limited | A specific denial, not an empty state | `Hanya Pemilik yang dapat membatalkan transaksi yang sudah dibayar.` |

### 1.2 Universal rules

1. **No fake success.** A server action that has not been confirmed is not "Berhasil". Offline commits say "Tersimpan di perangkat. Menunggu sinkron."
2. **No fake zero.** A failed fetch never becomes `Rp 0`, `0 item`, or "Tidak ada data". Use `—` and an error with retry.
3. **Stable loading.** Skeletons use the final row height, column widths, and card height. A refresh keeps stale data visible with a "Memperbarui…" notice instead of blanking the screen.
4. **Permission-aware rendering.** If a role can never perform an action, omit the control and, where useful, show a one-line explanation. If an action is temporarily unavailable (offline, missing prerequisite, pending sync), render it disabled with a visible and programmatic reason (`aria-describedby`), never a silent dead click.
5. **Offline is persistent.** A banner or status chip remains visible while offline. Cached reads are labeled with their timestamp. Sale-capable flows continue; server-dependent flows say so before the user starts.
6. **Sync is per item.** Each queued transaction has its own state and retry. A failing item never blocks the others. The queue survives app kill and restart.
7. **Conflict is human.** No conflict is resolved by retry, refresh, or "ignore". Money remains the local amount the customer paid; stock remains server-authoritative; the resolution is audited.
8. **Destructive actions preview consequences.** Show the object, the financial/stock effect, the required reason, and what cannot be undone. The confirm button is not the default focus; the cancel button is.
9. **Success is specific.** Confirm the amount, the new status, the receipt action, or the local/server distinction. Announce changes in a live region; do not rely on color or sound.
10. **Long content is a test case.** Every surface must be tested with a 60-character product name, a 12-digit rupiah total, a plate with no separators, a 200-character reason, and a 30-item queue.
11. **Color is a second signal.** Status chips have text; rails have adjacent labels; deltas have signs and accessible labels; offline has an icon and words.
12. **One primary action.** A state never presents two competing filled accent buttons.

---

## 2. Surface matrices

### 2.1 Login and session

Scope: web email/username + password; mobile device PIN enrollment, user list + 6-digit PIN; shared-device shift change; session expiry; logout with a pending queue.

| State | UI treatment | Copy intent (Bahasa Indonesia) | Recovery / next action |
|---|---|---|---|
| Default | Web: centered 400 px form on canvas, wordmark above, email/username, password, "Masuk", outlet note if applicable. Mobile: first online sign-in sets a 6-digit device PIN, then the user list with initials and role and a PIN keypad. | `Masuk` / `Buat PIN perangkat` / `Ulangi PIN` / `Pilih pengguna` / `Masukkan PIN 6 digit` | Submit; `Lupa kata sandi` for web Owner/Admin; `Ganti pengguna` on mobile. |
| Loading | Submit button preserves width, becomes "Memeriksa…", disabled; a progress line appears. PIN dots fill as typed. Rate-limit countdown is visible, not a toast. | `Memeriksa…` / `Tunggu 30 detik sebelum mencoba lagi.` | Wait; retry after countdown. Do not clear the identifier field. |
| Empty | First-run installation with no owner account. Setup state, not an empty login form. | `Belum ada akun. Siapkan akun Pemilik untuk memulai.` | `Siapkan akun Pemilik` (online). |
| Error | Invalid credentials are generic and do not reveal which field failed. Network errors are distinct. Deactivated or revoked accounts get a terminal explanation. Five failures trigger a lockout with countdown. | `Email atau kata sandi tidak cocok.` / `Tidak dapat terhubung. Periksa jaringan.` / `Akun dinonaktifkan. Hubungi Pemilik.` | Retry; wait for lockout; contact Owner. No password hint that reveals the credential. |
| Permission-denied | Deactivated user, revoked device, or no outlet assignment. No cached customer data is shown. | `Akun ini tidak memiliki akses. Hubungi Pemilik untuk mengaktifkan kembali.` | Close app or return to user list; Owner reactivates. |
| Offline | Web: login is blocked because the session requires the server. Mobile: a previously signed-in user may unlock with PIN against the cached session, clearly labeled "Mode offline"; otherwise blocked. | `Masuk memerlukan koneksi.` / `Mode offline. Transaksi akan disinkronkan saat terhubung.` | Connect; or unlock cached session on mobile; otherwise retry. |
| Syncing | After a successful login, the app loads cached data and syncs in the background. Login is not blocked by sync. | `Menyinkronkan data…` | Continue into the app; sync state is visible in the shell. |
| Sync-conflict | After login, a banner reports unresolved conflicts and links to the inbox. | `2 transaksi perlu tinjauan.` | `Buka antrean`; resolve before day close. |
| Destructive-confirmation | Logout with an unsynced queue: "Sinkronkan dulu", "Tetap di sini", or a last-resort "Keluar" that requires a reason. Session-expiry dialog preserves the current draft if possible. | `3 transaksi belum tersinkron. Keluar dan hapus data lokal?` | Sync first (preferred); stay; last-resort logout with reason. |
| Success | Redirect to the role's home. Announce the identity, role, and outlet. | `Masuk sebagai Dewi, Kasir, Outlet A.` | Proceed to the role home. |
| Long content | Long user names and outlet names truncate with the full value available on the profile sheet. PIN is never displayed. | — | — |

### 2.2 Dashboard

Scope: exception-first home for Owner/Admin/Cashier; role-specific cards. Not a chart wall.

| State | UI treatment | Copy intent (Bahasa Indonesia) | Recovery / next action |
|---|---|---|---|
| Default | Today's sales, expected cash, pending sync, low stock, and a short exception list (voids, overrides, unresolved conflicts). Cards use borders, not shadows. | `Ringkasan hari ini` / `Perlu perhatian` | Open a card's detail; start a sale; open the sync queue. |
| Loading | Skeleton cards and table rows match final dimensions. No spinner-only page. | `Memuat ringkasan…` | Wait; the shell remains usable. |
| Empty | New installation setup checklist: add first product, add first service, create cashier, test receipt. | `Siapkan bengkel Anda` / `Tambahkan produk pertama` | Complete setup steps; each links to the relevant screen. |
| Error | Per-widget error with `—` values and a retry; page-level failure keeps the shell and shows a retry block. A failed widget never shows zero. | `Ringkasan penjualan gagal dimuat.` | `Coba lagi`; other widgets remain usable. |
| Permission-denied | Widgets are role-scoped: Mechanic sees assigned jobs, not finance; Cashier sees own outlet only; Admin/Owner see all outlets. Unauthorized widgets are absent, not blank. | `Ringkasan keuangan hanya untuk Admin dan Pemilik.` | Use the permitted area; ask an Admin for figures. |
| Offline | Cached snapshot labeled with time; actions requiring the server are disabled with a reason; pending queue is prominent. | `Data tersimpan, terakhir diperbarui 14.05 WIB.` | Continue offline sales; sync when connected. |
| Syncing | Figures show "Memperbarui…" while retaining the last value; last-updated timestamp changes on success. | `Memperbarui ringkasan…` | Wait; no action required. |
| Sync-conflict | A dedicated card counts unresolved conflicts and states that those transactions are excluded from totals. | `2 transaksi belum masuk laporan karena konflik.` | `Tinjau konflik`; resolve. |
| Destructive-confirmation | Not applicable on the dashboard. Day close lives in Reports. | — | — |
| Success | After an action, affected figures refresh with a polite announcement. | `Data diperbarui 14.05 WIB.` | Continue. |
| Long content | Large totals use full rupiah, not abbreviations; card values wrap labels, never clip numbers; outlet names truncate with full value. | — | — |

### 2.3 POS cart (Jual)

Scope: web counter sale and mobile sale. One mixed cart, category subtotals, one total.

| State | UI treatment | Copy intent (Bahasa Indonesia) | Recovery / next action |
|---|---|---|---|
| Default | Mixed cart with a category label ("Spare part" / "Jasa") plus icon, name, quantity stepper, unit price, line total, and visible remove. Category subtotals above the total. "Bayar" disabled until a valid payable line exists. | `Keranjang` / `Subtotal spare part` / `Subtotal jasa` / `Total` / `Bayar` | Add a line; edit quantity; pay. |
| Loading | Catalog search shows inline skeleton suggestions; existing cart remains fully usable and the total remains computed. Only the initial empty-screen suggestions use skeletons. | `Mencari spare part dan jasa…` | Wait for suggestions; cart is not blocked. |
| Empty | Empty cart explanation with one primary and one secondary action. No fake "popular items". | `Keranjang masih kosong. Tambah spare part atau jasa.` | `Tambah spare part` (primary) / `Tambah jasa` (secondary). |
| Error | Catalog fetch failed; cart stays intact; inline error above the add row; adding is blocked until retry. If cart data exists, its total is still shown. | `Katalog gagal dimuat. Keranjang Anda tetap aman.` | `Coba lagi`; cart is preserved. |
| Permission-denied | Mechanic does not see the Jual tab; a direct route shows a full-page denial naming the allowed role. Cashier discount above cap: control disabled with reason and an approval path; price edit absent. | `Mekanik tidak dapat membuat transaksi. Masuk dengan akun Kasir.` / `Diskon di atas 0% memerlukan persetujuan Admin.` | Switch user; request approval; continue without discount. |
| Offline | Offline banner; catalog from cache; stock labeled "Stok sementara"; sale proceeds; totals are local and exact. | `Anda offline. Transaksi tetap bisa dibuat dan akan disinkronkan otomatis.` | Complete the sale; queue is visible. |
| Syncing | After commit, the sale shows "Menyimpan…" then "Menunggu sinkron". The cart clears only after the local durable save. The commit button cannot be double-submitted. | `Menyimpan transaksi…` / `Menunggu sinkron` | Wait; continue the next sale. |
| Sync-conflict | The sale is moved to the conflict inbox; the cart is not restored or duplicated. A banner reports the conflict. Money already taken stays recorded. | `Transaksi perlu tinjauan. Jangan ulangi penjualan.` | `Buka konflik`; resolve explicitly. |
| Destructive-confirmation | Clearing a non-empty cart asks for confirmation with the line count. Single-line removal is immediate with a 5 s undo and a live announcement. Leaving an unsaved cart asks before discarding. | `Kosongkan keranjang? 3 item akan dihapus.` / `Perubahan belum disimpan. Tinggalkan halaman?` | Cancel; stay; remove deliberately. |
| Success | New line highlighted and announced with the new total. Paid cart clears and offers the receipt. | `Kampas rem depan ditambahkan. Total Rp 299.700.` | Continue; pay; print/share. |
| Long content | Long names wrap to 2 lines with full value on the line detail; quantity up to 3 digits; 12-digit totals fit or the summary scrolls internally; row actions never clip. | — | — |

### 2.4 Payment

Scope: payment sheet with cash, transfer, QRIS, split tender, change, local commit.

| State | UI treatment | Copy intent (Bahasa Indonesia) | Recovery / next action |
|---|---|---|---|
| Default | Total due, outstanding balance, method rows, amount display, keypad, "Bayar Rp …". Non-cash reference field appears when selected. Split payment keeps "Sisa tagihan" visible. | `Total` / `Sisa tagihan` / `Metode pembayaran` / `Bayar Rp 299.700` | Enter amount; choose method; confirm. |
| Loading | Processing button "Menyimpan…" with preserved width and disabled state. Local commit acknowledges within 1 s; network sync is separate. Existing tender rows load as skeletons only if a draft is being restored. | `Menyimpan pembayaran…` | Wait; do not tap again. |
| Empty | No outstanding balance or a zero-total order. No payment form. | `Tidak ada tagihan.` | Close; return to the order. |
| Error | Non-cash overpayment, invalid amount, missing reference, or server failure before commit. Inline error near the field. A failure after local commit is not an error: it becomes a local success with a pending-sync label. | `Transfer tidak boleh melebihi sisa tagihan Rp 199.700.` / `Jumlah tidak valid.` | Correct the amount/method; retry before commit; do not pay twice after commit. |
| Permission-denied | Mechanic cannot record payment. Cashier can pay; discount approval is not part of this sheet. | `Mekanik tidak dapat mencatat pembayaran.` | Switch to a Cashier/Admin account. |
| Offline | Cash is allowed and commits locally. Non-cash is recorded as "Belum terverifikasi" with a reference; the app never implies the bank/QRIS payment was verified. Receipt is local. | `Pembayaran tunai tersimpan di perangkat.` / `Belum terverifikasi` | Complete; print local receipt; sync later. |
| Syncing | Tender rows show a queued state; the order can be completed locally. Retry is idempotent. | `Menyinkronkan pembayaran…` | Wait; retry; do not duplicate tender lines. |
| Sync-conflict | If stock or cash-reporting conflicts arise after payment, the payment remains recorded and the order is flagged. The cashier is told not to collect again. | `Pembayaran sudah diterima. Transaksi perlu tinjauan, jangan ulangi pembayaran.` | Resolve in the conflict inbox; refund only through an explicit void. |
| Destructive-confirmation | Removing a tender before confirmation asks with the method and amount. After the order is paid, tenders cannot be deleted; use the void flow. No partial refunds exist. | `Hapus pembayaran Tunai Rp 100.000?` | Cancel; keep the tender; or use void after payment. |
| Success | Change is shown prominently; status becomes "Dibayar"; receipt actions appear. | `Pembayaran berhasil. Kembalian Rp 300.` | `Cetak struk` / `Bagikan struk`. |
| Long content | Up to 6 tender rows scroll; 12-digit amounts and 64-character references do not clip; change remains visible above the action bar. | — | — |

### 2.5 Receipt preview, print, and share

Scope: 58 mm (35 column) and 80 mm (48 column) preview; thermal print; browser/PDF fallback; reprint; offline local receipt.

| State | UI treatment | Copy intent (Bahasa Indonesia) | Recovery / next action |
|---|---|---|---|
| Default | Paper-white preview at the outlet's configured width; print primary, share/PDF secondary. Customer, plate, items, totals, tenders, change, mechanic, footer. | `Pratinjau struk` / `Cetak struk` / `Bagikan struk` | Print; share; save PDF. |
| Loading | Printer discovery and print show "Mencari printer…" and a determinate print state. The preview is already readable. | `Mencari printer…` | Wait; cancel discovery if it hangs and use fallback. |
| Empty | Order is not paid; no receipt exists. | `Struk tersedia setelah pembayaran.` | Complete payment; return. |
| Error | Printer unreachable, render failure, or permission error. The preview stays available. A failed print never produces a blank page silently. | `Printer tidak terhubung.` | `Coba lagi`; web: `Cetak via browser`; mobile: `Simpan PDF` / `Bagikan PDF`. |
| Permission-denied | Staff without access to the order or outlet cannot preview or print it. Reprint of another outlet's order is denied. | `Anda tidak memiliki akses ke struk ini.` | Return to permitted orders; ask an Admin. |
| Offline | Local receipt is stamped "SALINAN LOKAL — BELUM TERSINKRON" with a local reference. Print/share works without internet. | `Salinan lokal, belum tersinkron.` | Print/share now; final number after sync. |
| Syncing | The local reference remains until the server assigns the final invoice number. Reopening after sync shows the final number. | `Menunggu nomor nota final.` | Wait; reprint after sync if needed. |
| Sync-conflict | Receipt is marked "PERLU TINJAUAN"; it is not presented as a final paid receipt until resolved. | `Struk ini perlu tinjauan.` | Open the conflict; resolve before reprint. |
| Destructive-confirmation | No destructive action. Reprint is labeled "SALINAN"; a voided order's reprint is stamped "DIBATALKAN" and keeps the original timestamp. | `SALINAN` / `DIBATALKAN` | Reprint is safe; voiding is a separate action. |
| Success | Print or share confirmation with the action taken. Reprint count increments in the audit log. | `Struk tercetak.` / `Struk dibagikan.` | Close; return to the order. |
| Long content | Long item names wrap to a second line; amount moves to its own line; tender reference moves to the next line; totals never truncate. Test 20 worst-case receipts at 35 and 48 columns. | — | — |

### 2.6 Vehicle lookup

Scope: global and intake search by plate, suffix, customer, or note number; cached results; duplicate guard.

| State | UI treatment | Copy intent (Bahasa Indonesia) | Recovery / next action |
|---|---|---|---|
| Default | One search field. Empty state shows recent vehicles and the placeholder. Results show canonical plate in mono, brand/model, owner, outlet, last odometer, and "Servis terakhir". | `Cari nomor polisi, pelanggan, atau nota` | Search; open a result; add a vehicle. |
| Loading | Debounced search with a skeleton list that matches result-row height; query stays visible and editable. | `Mencari kendaraan…` | Wait; edit the query. |
| Empty | No query: guidance. No result: "Kendaraan belum terdaftar" with add action. These are distinct from a search failure. | `Kendaraan belum terdaftar.` | `Tambah kendaraan`; adjust search. |
| Error | Search failed; do not show "not found". Explain that the vehicle may exist but could not be checked. | `Pencarian gagal. Kendaraan mungkin ada, tetapi belum dapat diperiksa.` | `Coba lagi`; try the exact plate; retry when online. |
| Permission-denied | Outlet scope: Cashier/Mechanic see only their outlet. Mechanic can view but not create. | `Hanya menampilkan kendaraan Outlet A.` / `Mekanik tidak dapat menambah kendaraan.` | Ask an Admin/Cashier; switch outlet if permitted. |
| Offline | Cached search is available and labeled. Creating a new vehicle requires a connection to prevent duplicate plates. | `Hasil dari data tersimpan. Kendaraan baru memerlukan koneksi.` | View cached history; add vehicle when online. |
| Syncing | Cache refresh runs in the background and does not block typing; stale results are labeled. | `Memperbarui data kendaraan…` | Wait; cached results remain usable. |
| Sync-conflict | A duplicate plate arrives from another device or outlet. No silent merge. | `Plat ini sudah terdaftar pada kendaraan lain. Tinjau sebelum menyimpan.` | Owner/Admin reviews; link or correct the record; audit. |
| Destructive-confirmation | No delete or merge from this screen. Ownership changes and merges are audited Admin/Owner actions. | — | Use the vehicle detail action; confirm there. |
| Success | Match announced; canonical plate, owner, and last service shown. | `Kendaraan ditemukan: B1234XYZ, Honda Beat, Budi Santoso.` | Open history; start intake; create order. |
| Long content | Long owner names and addresses wrap; ambiguous plates show owner and outlet; suffix-only queries return multiple candidates; no auto zero-padding. | — | — |

### 2.7 Vehicle history

Scope: reverse-chronological service history per plate; outlet scoping; unpaid and pending flags.

| State | UI treatment | Copy intent (Bahasa Indonesia) | Recovery / next action |
|---|---|---|---|
| Default | Vehicle identity header (plate, brand/model, owner), last odometer, total visits, reverse-chronological list with date, type, items, labor, odometer, mechanic, total, payment status. Unpaid orders flagged with balance. | `Riwayat kendaraan` / `Servis terakhir` / `Kunjungan` | Open an entry; reprint; create a new order. |
| Loading | Identity header renders immediately from the lookup; history rows use skeletons matching row height. | `Memuat riwayat…` | Wait. |
| Empty | Successful request with no orders. | `Belum ada riwayat untuk plat ini.` | `Mulai servis`; create the first order. |
| Error | History fetch failed; do not show zero visits. | `Riwayat gagal dimuat.` | `Coba lagi`; keep the vehicle header. |
| Permission-denied | Outlet scope for Cashier/Mechanic; Owner/Admin see all. A scope note is visible, not a silent partial list. | `Hanya menampilkan riwayat Outlet A.` | Switch outlet if permitted; ask an Admin for cross-outlet history. |
| Offline | Cached first page is available with timestamp; deeper pages require connection. | `Data tersimpan, terakhir diperbarui 14.05 WIB.` | View cached; connect for full history. |
| Syncing | Pending orders from this device are listed as "Belum tersinkron" and excluded from totals until confirmed. | `1 transaksi belum tersinkron dan belum masuk total.` | Sync; refresh. |
| Sync-conflict | Conflicted orders are flagged "Perlu tinjauan" and excluded from totals. | `Transaksi ini perlu tinjauan.` | Open conflict; resolve. |
| Destructive-confirmation | No destructive action on history entries. Corrections use the order's own void/edit rules. | — | Open the order. |
| Success | A newly created order appears at the top with a highlight and announcement. | `Nota servis baru ditambahkan ke riwayat.` | Print; continue. |
| Long content | 1,000 orders paginate; long item lists collapse to "3 item" with expand; totals do not abbreviate; page-level overflow is zero. | — | — |

### 2.8 Service intake

Scope: plate-first intake, vehicle and customer capture, complaint, odometer, mechanic, estimate start. MVP creation is online-only; cached history remains readable offline.

| State | UI treatment | Copy intent (Bahasa Indonesia) | Recovery / next action |
|---|---|---|---|
| Default | Plate field first, normalized preview, existing-vehicle summary, vehicle form (brand, model, year, color, odometer), customer, complaint, mechanic, "Mulai pengerjaan" / "Simpan sebagai estimasi". | `Cari nomor polisi` / `Keluhan pelanggan` / `Odometer (km)` / `Mekanik` | Save; start; print intake slip. |
| Loading | Plate lookup shows a small inline progress; save button "Menyimpan…". Form fields remain editable where safe. | `Mencari kendaraan…` / `Menyimpan nota servis…` | Wait; do not double-submit. |
| Empty | No vehicle: inline add form prefilled with the plate. No mechanics: explanatory link to staff setup. | `Kendaraan belum terdaftar.` / `Belum ada mekanik. Tambahkan pengguna dengan peran Mekanik.` | Add vehicle; add mechanic; save. |
| Error | Invalid plate characters, duplicate plate, negative odometer, missing mechanic, server error. Inline field errors plus a summary. | `Nomor polisi hanya boleh berisi huruf dan angka.` / `Odometer tidak boleh negatif.` | Correct the field; retry save. |
| Permission-denied | Cashier/Mechanic are outlet-scoped; Mechanic cannot issue estimates. Owner/Admin all. | `Hanya Admin atau Pemilik yang dapat menerbitkan estimasi.` | Ask an Admin; continue intake without estimate. |
| Offline | Cached vehicle lookup works; new vehicle and new service order require a connection in MVP. The screen says so before data entry. | `Nota servis baru memerlukan koneksi. Riwayat tersimpan tetap bisa dilihat.` | Connect; or view cached history. |
| Syncing | Saving is a server-bound action; show a determinate save state, then success. No queued intake in MVP. | `Menyimpan nota servis…` | Wait; retry on failure. |
| Sync-conflict | A plate was reassigned or duplicated on another device. | `Plat ini berubah di perangkat lain. Tinjau data kendaraan sebelum melanjutkan.` | Owner/Admin reviews; re-link; audit. |
| Destructive-confirmation | Discard an unsaved draft or leave a dirty form. | `Buang draf nota servis? Data yang belum disimpan akan hilang.` | Cancel; stay; discard deliberately. |
| Success | Order number and status shown; intake slip print/share offered. | `Nota servis dibuat: SRV/2026/000123.` | Print slip; start work; add lines. |
| Long content | Complaint max 500 characters with counter; 7-digit odometer; long names wrap; long customer notes scroll inside the field. | — | — |

### 2.9 Inventory adjustment

Scope: ledger-first stock movement; no direct on-hand edit; server-authoritative stock.

| State | UI treatment | Copy intent (Bahasa Indonesia) | Recovery / next action |
|---|---|---|---|
| Default | Item identity, current stock, movement type, quantity, reason, optional reference, preview "Stok saat ini 12 → Stok setelah 9". Save disabled until valid. | `Sesuaikan stok` / `Jenis penyesuaian` / `Stok saat ini` / `Stok setelah` / `Alasan` | Choose movement; enter quantity and reason; save. |
| Loading | Item detail skeleton; save "Menyimpan…". No optimistic final quantity. | `Memuat data stok…` / `Menyimpan penyesuaian…` | Wait. |
| Empty | No products or no movements yet. | `Belum ada produk. Tambahkan produk untuk mengelola stok.` / `Belum ada pergerakan stok.` | Add product; create first movement. |
| Error | Validation, fetch, or server failure. The preview is cleared on failure; no partial ledger claim. | `Jumlah harus lebih dari 0.` / `Penyesuaian gagal disimpan.` | Correct; retry. |
| Permission-denied | Admin/Owner only. Cashier/Mechanic do not see the action; direct URL gets a specific 403. | `Hanya Admin atau Pemilik yang dapat menyesuaikan stok.` | Ask an Admin; request a correction. |
| Offline | Action is disabled with a visible reason; cached stock is labeled. | `Penyesuaian stok memerlukan koneksi karena stok ditentukan server.` | Connect; retry. |
| Syncing | Save shows "Menyimpan…"; success waits for the ledger confirmation. | `Menyimpan penyesuaian…` | Wait; do not repeat. |
| Sync-conflict | Server stock changed since the page loaded. Show both numbers and require a reload before saving. | `Stok berubah sejak halaman dibuka. Periksa angka terbaru sebelum menyimpan.` | Reload; re-enter the movement; never overwrite blindly. |
| Destructive-confirmation | Negative stock override or a count correction. Requires reason and Admin/Owner permission. Show resulting negative stock and ledger flag. | `Stok akan menjadi −1 dan ditandai override. Lanjutkan?` | Cancel; adjust quantity; or confirm with reason. |
| Success | Before → after is shown with the ledger reference; low-stock list updates. | `Stok diperbarui: 12 → 9.` | View ledger; continue. |
| Long content | Product names wrap; 200-character reason; large quantities fit; reference field caps at 100 characters. | — | — |

### 2.10 Transaction void

Scope: whole-order void with reason, permission, stock reversal, refund lines, receipt stamp; no partial refunds.

| State | UI treatment | Copy intent (Bahasa Indonesia) | Recovery / next action |
|---|---|---|---|
| Default | Order identity, status, totals, payments, stock impact, and the void action only if the role permits. Impact preview before confirming. | `Batalkan transaksi` / `Dampak pembatalan` | Open confirmation; choose reason; confirm. |
| Loading | Order fetch skeleton; void processing "Membatalkan…" with disabled confirm. | `Memuat transaksi…` / `Membatalkan transaksi…` | Wait; do not repeat. |
| Empty | Already void (terminal). No action. | `Transaksi ini sudah dibatalkan.` | View audit; create a new order if needed. |
| Error | Reason shorter than 10 characters, missing refund method, server failure, or permission failure. | `Alasan minimal 10 karakter.` / `Pembatalan gagal. Tidak ada perubahan.` | Complete the reason; retry; ask the permitted role. |
| Permission-denied | Cashier never voids recorded orders. Admin voids unpaid orders. Owner voids paid orders. Copy names the role. | `Hanya Pemilik yang dapat membatalkan transaksi yang sudah dibayar.` | Ask the Owner to void while online; do not improvise a refund. |
| Offline | Void is disabled; it is a financial reversal and requires the server. | `Pembatalan memerlukan koneksi.` | Connect; retry. |
| Syncing | A queued transaction must sync before it can be voided. | `Sinkronkan transaksi ini sebelum membatalkan.` | Open the queue; sync; return. |
| Sync-conflict | Unresolved conflict blocks void until reviewed. | `Selesaikan konflik transaksi ini terlebih dahulu.` | Open conflict; resolve; then void. |
| Destructive-confirmation | Mandatory reason (min 10 chars), refund method for paid orders, Owner re-authentication (PIN on mobile, password on web) for paid void, full refund lines, stock restoration preview, irreversible notice. Confirm button repeats "Batalkan transaksi"; cancel is initial focus. | `Batalkan transaksi? Transaksi tetap tersimpan di riwayat dan tidak dapat dipulihkan.` | Cancel; or confirm with reason and permission. |
| Success | Status stamped "Dibatalkan"; stock restored exactly once; receipt reprint stamped "DIBATALKAN"; audit entry. | `Transaksi dibatalkan. Stok dikembalikan.` | Reprint stamped receipt; review audit. |
| Long content | Long reason scrolls; many payment rows list individually; long order numbers stay on one line and remain copyable, with the surrounding header truncating instead. | — | — |

### 2.11 Reports

Scope: daily sales, payment mix, service vs product, technician productivity, stock valuation, end-of-day; CSV export; close-day confirmation.

| State | UI treatment | Copy intent (Bahasa Indonesia) | Recovery / next action |
|---|---|---|---|
| Default | Date range, outlet, report tabs, figures, and export for permitted roles. Period and outlet in the title. Tables and direct labels, not chart-only. | `Laporan penjualan` / `Periode` / `Ekspor CSV` | Change period; export; close day. |
| Loading | Skeleton tables and a progress notice for long reports. Filters remain usable; no blank white page. | `Menyiapkan laporan…` | Wait; cancel by navigating away if needed. |
| Empty | Successful request with no orders. True zero; may show `Rp 0`. Filter-empty is a separate message. | `Tidak ada transaksi pada 26 November 2026.` / `Tidak ada hasil untuk filter ini.` | Change period; clear filters. |
| Error | Figures show `—`, an error block with retry. Never zeros. Last successful snapshot, if any, is labeled. | `Laporan gagal dimuat. Angka tidak ditampilkan.` | `Coba lagi`; narrow the period. |
| Permission-denied | Mechanic has no reports. Cashier sees own outlet only. Export is Owner/Admin only and hidden, not disabled, for others. | `Laporan hanya untuk Admin dan Pemilik.` / `Ekspor hanya untuk Admin dan Pemilik.` | Ask an Admin; use the permitted view. |
| Offline | Reports require the server. A cached last snapshot may be shown read-only with a timestamp; export is disabled. | `Laporan memerlukan koneksi. Data tersimpan hanya untuk dilihat.` | Connect; retry. |
| Syncing | Pending transactions are counted and explicitly excluded from figures. A banner links to the queue. | `3 transaksi belum tersinkron dan tidak termasuk dalam laporan ini.` | Sync; then refresh the report. |
| Sync-conflict | Conflicted transactions are excluded and counted; the report is not silently partial. | `2 transaksi perlu tinjauan dan belum masuk laporan.` | Resolve conflicts; refresh. |
| Destructive-confirmation | `Tutup kasir` counts the drawer and shows variance before anything locks; `Tutup hari` locks the business date. Show expected vs counted cash, variance in rupiah, required reason for variance, and a pending-sync block. Day close cannot be undone. | `Tutup kasir` / `Uang fisik dihitung` / `Selisih kas` / `Tutup hari 26 November 2026? Hari yang ditutup tidak dapat dibuka kembali.` | Cancel; count cash; resolve pending; confirm. |
| Success | Export produces a toast with the filename; close-day shows a locked summary and audit entry. | `CSV diunduh: penjualan-2026-11-26.csv.` / `Hari ditutup.` | Share/download; print summary. |
| Long content | 12 months and 100,000 lines paginate; totals stay full rupiah; tables scroll internally; CSV values match the screen exactly. | — | — |

### 2.12 Staff and roles

Scope: staff list, create/deactivate, role and outlet assignment, session/device revocation. Owner-only.

| State | UI treatment | Copy intent (Bahasa Indonesia) | Recovery / next action |
|---|---|---|---|
| Default | Staff list with name, role, outlet, status, last active. Create action. Role help explains access in plain language. | `Pengguna` / `Peran` / `Outlet` / `Tambah pengguna` | Create; edit; deactivate; revoke device. |
| Loading | List skeleton; save "Menyimpan…". Role changes show an impact summary. | `Memuat pengguna…` | Wait. |
| Empty | No staff except the Owner. | `Belum ada pengguna selain Anda.` | `Tambah pengguna`; assign a role. |
| Error | Duplicate identity, invalid role, missing outlet, or server failure. Field-level messages. | `Nomor HP sudah digunakan pengguna lain.` / `Peran wajib dipilih.` | Correct; retry. |
| Permission-denied | Owner only. Admin/Cashier/Mechanic do not see the navigation; direct URL gets a 403. | `Hanya Pemilik yang dapat mengelola pengguna.` | Ask the Owner. |
| Offline | Read-only cached list; create/edit/deactivate disabled with reason. | `Perubahan pengguna memerlukan koneksi.` | Connect; retry. |
| Syncing | Save waits for server confirmation; audit entry follows. Access changes apply on the user's next request. | `Menyimpan perubahan akses…` | Wait; tell the user to reload. |
| Sync-conflict | The record changed on another device. | `Data pengguna berubah di perangkat lain. Muat ulang sebelum menyimpan.` | Reload; reapply. |
| Destructive-confirmation | Deactivation ends active sessions; role change expands or reduces access. No hard delete. | `Nonaktifkan Dewi? Sesi aktif akan diakhiri.` / `Ubah peran menjadi Admin? Pengguna akan melihat semua outlet.` | Cancel; confirm; audit. |
| Success | Created, updated, deactivated, or device revoked, with audit reference. | `Pengguna dibuat.` / `Akses dicabut.` | Return to list; verify status. |
| Long content | Long names and emails wrap; 50 staff per outlet paginate; role/outlet values never truncate to ambiguity. | — | — |

### 2.13 Settings: tax, outlet, receipt

Scope: PPN rate, discount caps, outlet identity, receipt header/footer, paper width, branding. Owner-only edits.

| State | UI treatment | Copy intent (Bahasa Indonesia) | Recovery / next action |
|---|---|---|---|
| Default | Sectioned form with current values, effective-date note, and a receipt preview. Save disabled until dirty and valid. | `Pengaturan pajak` / `Identitas outlet` / `Struk` / `Simpan pengaturan` | Edit; preview; save. |
| Loading | Form skeleton; save "Menyimpan…". | `Memuat pengaturan…` | Wait. |
| Empty | No outlet configured (first run). Defaults shown with a create prompt. | `Buat outlet pertama untuk mengatur pajak dan struk.` | `Buat outlet`; complete setup. |
| Error | Tax must be an integer 0–100; paper width 58 or 80; footer max 3 lines at 35 columns; save failure. Inline errors. | `Tarif pajak harus antara 0 dan 100.` / `Baris footer maksimal 3 baris.` | Correct; retry. |
| Permission-denied | Owner-only for edits. Admin who can view settings sees read-only fields with the reason; save is absent. | `Hanya Pemilik yang dapat mengubah pengaturan.` | Ask the Owner. |
| Offline | Read-only cached settings; save disabled. | `Pengaturan memerlukan koneksi untuk diubah.` | Connect; retry. |
| Syncing | Save "Menyimpan…" then a confirmed effective note. | `Menyimpan pengaturan…` | Wait; verify the preview. |
| Sync-conflict | Settings changed elsewhere since load. | `Pengaturan berubah di perangkat lain. Muat ulang sebelum menyimpan.` | Reload; reapply consciously. |
| Destructive-confirmation | Tax rate change affects future orders only; a confirmation states this. Receipt branding changes affect future reprints, not already issued receipts. No destructive delete. | `Ubah tarif pajak? Transaksi lama tidak berubah.` | Cancel; confirm; audit. |
| Success | Saved, with the effective rule and audit reference. | `Pengaturan disimpan. Berlaku untuk transaksi berikutnya.` | Preview a receipt; close. |
| Long content | Outlet name/address wrap; footer is line-counted; receipt preview shows overflow before save. | — | — |

### 2.14 Sync queue and conflict inbox

Scope: device outbox, per-item sync state, retry, conflict resolution, explicit void of a queued sale.

| State | UI treatment | Copy intent (Bahasa Indonesia) | Recovery / next action |
|---|---|---|---|
| Default | List of queued items with local reference, amount, time, and state. Manual "Sinkronkan sekarang". Per-item retry. | `Antrean sinkron` / `Menunggu sinkron` / `Perlu tinjauan` | Sync; open an item; resolve. |
| Loading | Queue reads local storage immediately; only the server refresh shows a small progress line. No full-screen spinner. | `Memeriksa antrean…` | Wait; local items remain visible. |
| Empty | All items synced. | `Semua transaksi tersinkron.` | Return to selling. |
| Error | Per-item failure with next retry time; global failure does not hide items. Retry is safe and idempotent. | `Sinkron gagal. Akan dicoba lagi otomatis.` | `Coba lagi`; check connection; keep the app open. |
| Permission-denied | Any user sees the device queue. Override resolution is Admin/Owner only. Cashier may void with a reason; Mechanic is read-only. | `Override stok hanya untuk Admin atau Pemilik.` | Ask an Admin; choose void if permitted. |
| Offline | Queue remains; manual sync disabled until connection. | `Menunggu koneksi.` | Connect; sync automatically. |
| Syncing | Progress "Mengirim 2 dari 3…"; per-item state changes; a failing item does not block the rest. | `Mengirim 2 dari 3 transaksi…` | Wait; retry failures individually. |
| Sync-conflict | Conflict sheet shows product, local quantity, server quantity, money taken, and allowed decisions: override with reason, void with reason, or review later. Not dismissible without a choice or a persistent badge. | `Stok berubah saat offline. Tinjau sebelum melanjutkan.` | Override (Admin/Owner), void (reason + refund), or review later. |
| Destructive-confirmation | Voiding a queued sale discards the sale and records a cash refund if money was taken. Reason required. | `Batalkan transaksi offline? Uang tunai harus dikembalikan ke pelanggan.` | Cancel; override instead; or confirm with reason. |
| Success | Counts clear or reduce; final invoice numbers replace local references; receipt reprint shows the final number. | `3 transaksi tersinkron.` | Open the order; reprint; return to selling. |
| Long content | 30+ items scroll; amounts and references never clip; batch retry does not duplicate; the queue survives restart. | — | — |

---

## 3. Shared component states

These components are used across surfaces. Their state behavior must be identical everywhere; a screen may not override it.

| Component | States to verify | Required behavior |
|---|---|---|
| `Button` | default, hover, focus, active, disabled, loading | Disabled state has a visible reason when the cause is not obvious; loading preserves width and sets `aria-busy`; never a dead click. |
| `TextField` / `MoneyInput` / `PlateInput` | default, focus, filled, error, disabled, read-only | Label always present; error via `aria-describedby`; money formats live; plate normalizes live; validation on blur. |
| `DataTable` | loading, empty, filtered-empty, error, success, sorted, selected | Caption and headers; `aria-sort`; stable skeleton; error inside the table container; no page overflow. |
| `Modal` / `Drawer` | open, closing, dirty, destructive | Focus trap; Escape for non-destructive; return focus; cancel initial focus in destructive dialogs. |
| `Toast` / `Banner` | success, info, error, persistent | Toast is secondary; banner is persistent while true; polite vs assertive live regions; dismiss button. |
| `EmptyState` / `ErrorState` / `Skeleton` | empty variants, error, retry, loading | True zero vs no results vs not configured; `—` for unknown numbers; skeletons match final geometry. |
| `NumericKeypad` | default, pressed, disabled, max reached | 56 dp keys; visible "Hapus semua"; formatted value; no decimal key for IDR. |
| `QuantityStepper` | default, min, max, disabled | −/+ buttons labelled; no drag or swipe requirement; numeric input alternative. |
| `SyncChip` / `ConflictCard` | online, offline, syncing, failed, conflict, resolved | Text + icon + count; actionable; announces changes; conflict shows local vs server values. |
| `ReceiptPreview` | paid, offline-local, reprint, void, conflict | Paper-white; 35/48 columns; never truncates money; stamps are explicit. |
| `StatusChip` / `StatusRail` | all statuses | Text label mandatory; color supplementary; rail is decorative and hidden from assistive technology. |
| `Pagination` / `FilterBar` | default, disabled, loading, applied | Page count in text; filters removable by keyboard; URL state; no infinite scroll in back-office. |

---

## 4. Copy bank

Use these as patterns; keep one concept per word. Replace only buyer-confirmed vocabulary.

### 4.1 Loading

- `Memuat data…`
- `Menyiapkan laporan…`
- `Menyimpan…`
- `Mengirim 2 dari 3 transaksi…`
- `Memperbarui data…`

### 4.2 Empty and zero

- `Belum ada penjualan hari ini. Mulai transaksi baru untuk melihat data.`
- `Keranjang masih kosong. Tambah spare part atau jasa.`
- `Belum ada riwayat untuk plat ini.`
- `Tidak ada hasil untuk "oli". Hapus filter atau coba kata lain.`
- `Semua transaksi tersinkron.`
- `Tambahkan produk pertama untuk mulai berjualan.`

### 4.3 Error

- `Data gagal dimuat. Periksa koneksi, lalu coba lagi.`
- `Laporan gagal dimuat. Angka tidak ditampilkan.`
- `Pencarian gagal. Kendaraan mungkin ada, tetapi belum dapat diperiksa.`
- `Printer tidak terhubung.`
- `Pembayaran gagal disimpan. Tidak ada dana yang tercatat.`
- `Periksa 3 kolom yang ditandai.`

### 4.4 Permission

- `Hanya Admin atau Pemilik yang dapat menyesuaikan stok.`
- `Hanya Pemilik yang dapat membatalkan transaksi yang sudah dibayar.`
- `Hanya Pemilik yang dapat mengelola pengguna.`
- `Mekanik tidak dapat membuat transaksi.`
- `Hanya menampilkan data Outlet A.`

### 4.5 Offline and sync

- `Anda offline. Transaksi tetap bisa dibuat dan akan disinkronkan otomatis.`
- `Stok sementara. Angka final ditentukan server setelah sinkron.`
- `Tersimpan di perangkat. Menunggu sinkron.`
- `Salinan lokal, belum tersinkron.`
- `Menunggu koneksi.`
- `Sinkron gagal. Akan dicoba lagi otomatis.`
- `3 transaksi belum tersinkron dan tidak termasuk dalam laporan ini.`

### 4.6 Conflict

- `Stok berubah saat offline. Tinjau transaksi sebelum melanjutkan.`
- `Pembayaran sudah diterima. Jangan ulangi pembayaran.`
- `Plat ini sudah terdaftar pada kendaraan lain.`
- `Transaksi ini perlu tinjauan.`
- `Override stok hanya untuk Admin atau Pemilik.`

### 4.7 Destructive

- `Batalkan transaksi? Transaksi tetap tersimpan di riwayat dan tidak dapat dipulihkan.`
- `Nonaktifkan Dewi? Sesi aktif akan diakhiri.`
- `Kosongkan keranjang? 3 item akan dihapus.`
- `Tutup hari 26 November 2026? Hari yang ditutup tidak dapat dibuka kembali.`
- `Batalkan transaksi offline? Uang tunai harus dikembalikan ke pelanggan.`

### 4.8 Success

- `Pembayaran berhasil. Kembalian Rp 300.`
- `Transaksi dibatalkan. Stok dikembalikan.`
- `Stok diperbarui: 12 → 9.`
- `Pengguna dibuat.`
- `Pengaturan disimpan. Berlaku untuk transaksi berikutnya.`
- `3 transaksi tersinkron.`
- `Struk tercetak.`

---

## 5. Coverage checklist

Legend: Y = must be designed and implemented; — = not applicable on that surface.

| Surface | Default | Loading | Empty | Error | Permission | Offline | Syncing | Conflict | Destructive | Success |
|---|---|---|---|---|---|---|---|---|---|---|
| Login and session | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Dashboard | Y | Y | Y | Y | Y | Y | Y | Y | — | Y |
| POS cart | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Payment | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Receipt print | Y | Y | Y | Y | Y | Y | Y | Y | — | Y |
| Vehicle lookup | Y | Y | Y | Y | Y | Y | Y | Y | — | Y |
| Vehicle history | Y | Y | Y | Y | Y | Y | Y | Y | — | Y |
| Service intake | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Inventory adjustment | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Transaction void | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Reports | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Staff and roles | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Settings | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Sync queue and conflicts | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |

A surface with a Y must have a real rendered state, not a placeholder. Long-content stress is required on every surface and is checked with the fixtures in §1.2 rule 10.

---

## 6. Verification notes

- This matrix defines design and QA expectations; it is not evidence that the screens exist. No application UI exists in this kickoff, so all rendered-state verification is **NOT VERIFIED** until the implementation is captured on real viewports.
- For every state, QA records: viewport/device class, screenshot path outside the repository, whether keyboard/TalkBack reached every action, whether the live region announced the change, and whether `scrollWidth <= innerWidth`.
- Device classes not captured are reported as `NOT VERIFIED`. A passing automated contrast check does not substitute for a keyboard or screen-reader pass.
- State copy must be reviewed against the buyer's final vocabulary (nota/struk, jasa/servis) and legal receipt text before sign-off.
