-- 0001_append_only_guard
--
-- Hand-written policy migration (WP2 design §4). It creates the least-privilege
-- application role, grants explicit table privileges, and blocks UPDATE/DELETE
-- on the append-only ledgers for every role, including the owner.
--
-- Deliberately absent: ALTER DEFAULT PRIVILEGES. Every future migration that
-- creates a table must add its own explicit grants (see packages/db/README.md),
-- otherwise a future append-only table would silently inherit UPDATE/DELETE.
--
-- app_rw never runs migrations. Deployments run migrations as the database
-- owner; the application connects as app_rw and its password comes from
-- deployment secrets, never from this file.
--
-- Down path: see packages/db/README.md ("Migration inventory"). In short, drop
-- the two triggers and the function, then revoke the grants; the role may stay.

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'app_rw') THEN
    EXECUTE 'CREATE ROLE app_rw LOGIN';
  END IF;
END
$do$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_rw;
--> statement-breakpoint
-- Mutable master data and financial headers: SELECT/INSERT/UPDATE only.
-- Orders are never deleted; financial history is corrected by void/refund rows.
GRANT SELECT, INSERT, UPDATE ON TABLE
  public.businesses,
  public.outlets,
  public.products,
  public.services,
  public.customers,
  public.vehicles,
  public.orders,
  public.payments,
  public.settings,
  public.idempotency_keys,
  public.sync_keys,
  public."user"
TO app_rw;
--> statement-breakpoint
-- Operational rows that may be removed while editable (lines, sessions,
-- devices, staff assignments) or short-lived counters.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.staff_outlets,
  public.device_tokens,
  public.login_attempts,
  public.order_lines,
  public.session,
  public.account,
  public.verification
TO app_rw;
--> statement-breakpoint
-- Append-only and financial history: SELECT/INSERT only.
GRANT SELECT, INSERT ON TABLE
  public.refunds,
  public.stock_ledger,
  public.audit_log,
  public.order_status_events
TO app_rw;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.prevent_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'append-only table: UPDATE/DELETE is not permitted on % (operation %)',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'raise_exception';
END;
$function$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS stock_ledger_append_only_guard ON public.stock_ledger;
--> statement-breakpoint
CREATE TRIGGER stock_ledger_append_only_guard
  BEFORE UPDATE OR DELETE ON public.stock_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_append_only_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_append_only_guard ON public.audit_log;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only_guard
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_append_only_mutation();
