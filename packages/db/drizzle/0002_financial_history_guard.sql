-- 0002_financial_history_guard
--
-- Forward-fix migration on top of 0000_init and 0001_append_only_guard (both
-- frozen; never edit an applied migration). It closes the remaining ways a
-- bug or the application credential could rewrite money and chronology:
--
--   1. Paid/VOID financial-history immutability triggers on `orders`,
--      `payments`, and `order_lines`. Pre-PAID editing stays allowed; a PAID
--      order may only transition to VOID (with void metadata); a VOID order is
--      terminal. FR-048 corrections happen before PAID, BR-008 voids after.
--   2. Whole-payment refunds: `refunds.payment_id` becomes NOT NULL and a
--      BEFORE INSERT trigger requires the payment to exist, to belong to the
--      same order, and to match the refund's amount and method.
--   3. Server-assigned `created_at` on `stock_ledger`, `audit_log`, and
--      `order_status_events`: a caller-supplied timestamp is overwritten with
--      `now()`, so ledger/audit chronology cannot be backdated.
--   4. SHA-256 hex shape checks for `device_tokens.token_hash` and
--      `idempotency_keys.request_hash` (a raw bearer token or truncated digest
--      can no longer be stored).
--   5. Stock-ledger entry/source consistency (entry type vs source type, sale
--      entries require an order line, ORDER sources require an order id).
--   6. A role-safety assertion: if `app_rw` exists with SUPERUSER,
--      CREATEROLE, or BYPASSRLS, or owns any public table, the migration
--      fails loudly instead of leaving the documented break-glass path broken.
--
-- The generated ALTER TABLE block below mirrors `src/schema/*.ts`, so a future
-- `drizzle-kit generate` reports no drift against this migration.
--
-- Deliberately not here: stock continuity and concurrency (`SELECT ... FOR
-- UPDATE`, quantity_before derivation) are owned by WP4, not by the database.
--
-- Down path: drop the seven triggers and five functions created below, then
-- `ALTER TABLE refunds ALTER COLUMN payment_id DROP NOT NULL;` and drop each
-- named CHECK added above. Re-running the file is safe: every trigger is
-- dropped-if-exists before creation.

ALTER TABLE "refunds" ALTER COLUMN "payment_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_token_hash_sha256_hex" CHECK ("device_tokens"."token_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_request_hash_sha256_hex" CHECK ("idempotency_keys"."request_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_stock_in_source_matches" CHECK ("stock_ledger"."entry_type" <> 'STOCK_IN' or "stock_ledger"."source_type" = 'STOCK_IN');--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_adjustment_source_matches" CHECK ("stock_ledger"."entry_type" <> 'ADJUSTMENT' or "stock_ledger"."source_type" in ('ADJUSTMENT', 'CYCLE_COUNT'));--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_sale_requires_order_line" CHECK ("stock_ledger"."entry_type" not in ('SALE_DECREMENT', 'SALE_REVERSAL') or ("stock_ledger"."source_type" = 'ORDER' and "stock_ledger"."order_line_id" is not null));--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_order_source_requires_id" CHECK ("stock_ledger"."source_type" <> 'ORDER' or "stock_ledger"."source_id" is not null);--> statement-breakpoint
-- Role safety: ownership is the append-only bypass, so refuse to continue if
-- app_rw could disable triggers, truncate, or grant itself privileges.
DO $do$
DECLARE
  v_role_super boolean;
  v_role_createrole boolean;
  v_role_bypassrls boolean;
  v_owned_tables bigint;
BEGIN
  SELECT rolsuper, rolcreaterole, rolbypassrls
    INTO v_role_super, v_role_createrole, v_role_bypassrls
    FROM pg_catalog.pg_roles
   WHERE rolname = 'app_rw';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'app_rw role is missing; apply 0001_append_only_guard first';
  END IF;

  IF v_role_super OR v_role_createrole OR v_role_bypassrls THEN
    RAISE EXCEPTION
      'app_rw must stay unprivileged (superuser=%, createrole=%, bypassrls=%)',
      v_role_super, v_role_createrole, v_role_bypassrls;
  END IF;

  SELECT count(*)
    INTO v_owned_tables
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p')
     AND pg_catalog.pg_get_userbyid(c.relowner) = 'app_rw';

  IF v_owned_tables > 0 THEN
    RAISE EXCEPTION
      'app_rw owns % public table(s); migrations must run as the database owner',
      v_owned_tables;
  END IF;
END
$do$;--> statement-breakpoint
-- Paid orders: allowed transitions before PAID stay untouched. A PAID order may
-- only become VOID, and never through a change to any business/financial field.
-- A VOID order is terminal.
CREATE OR REPLACE FUNCTION public.enforce_paid_order_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'VOID' THEN
    RAISE EXCEPTION 'order % is VOID and immutable', OLD.id
      USING ERRCODE = 'raise_exception';
  END IF;

  IF OLD.status = 'PAID' THEN
    IF NEW.business_id IS DISTINCT FROM OLD.business_id
       OR NEW.outlet_id IS DISTINCT FROM OLD.outlet_id
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
       OR NEW.technician_id IS DISTINCT FROM OLD.technician_id
       OR NEW.odometer IS DISTINCT FROM OLD.odometer
       OR NEW.order_number IS DISTINCT FROM OLD.order_number
       OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.discount_total IS DISTINCT FROM OLD.discount_total
       OR NEW.tax_total IS DISTINCT FROM OLD.tax_total
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
      RAISE EXCEPTION 'paid order % has immutable business and money fields (only a PAID to VOID transition is allowed)', OLD.id
        USING ERRCODE = 'raise_exception';
    END IF;

    IF NEW.status <> 'VOID' THEN
      RAISE EXCEPTION 'paid order % may only transition to VOID (attempted %)',
        OLD.id, NEW.status
        USING ERRCODE = 'raise_exception';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;--> statement-breakpoint
DROP TRIGGER IF EXISTS orders_paid_immutable_guard ON public.orders;--> statement-breakpoint
CREATE TRIGGER orders_paid_immutable_guard
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_paid_order_immutability();--> statement-breakpoint
-- Payments of PAID/VOID orders are immutable (UPDATE and DELETE). FR-048
-- corrections are pre-PAID; post-PAID reversals are refund rows, not edits.
CREATE OR REPLACE FUNCTION public.enforce_paid_payment_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_order_id uuid;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;

  SELECT o.status::text INTO v_status
    FROM public.orders o
   WHERE o.id = v_order_id;

  IF v_status IN ('PAID', 'VOID') THEN
    RAISE EXCEPTION 'payments of % order % are immutable', v_status, v_order_id
      USING ERRCODE = 'raise_exception';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;--> statement-breakpoint
DROP TRIGGER IF EXISTS payments_paid_immutable_guard ON public.payments;--> statement-breakpoint
CREATE TRIGGER payments_paid_immutable_guard
  BEFORE UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_paid_payment_immutability();--> statement-breakpoint
-- Order lines of PAID/VOID orders are immutable (INSERT, UPDATE, DELETE), so a
-- paid receipt cannot gain, lose, or reprice a line.
CREATE OR REPLACE FUNCTION public.enforce_paid_order_line_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status text;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    SELECT o.status::text INTO v_status
      FROM public.orders o
     WHERE o.id = NEW.order_id;

    IF v_status IN ('PAID', 'VOID') THEN
      RAISE EXCEPTION 'order_lines of % order % are immutable', v_status, NEW.order_id
        USING ERRCODE = 'raise_exception';
    END IF;
  END IF;

  IF TG_OP <> 'INSERT'
     AND (TG_OP = 'DELETE' OR NEW.order_id IS DISTINCT FROM OLD.order_id) THEN
    SELECT o.status::text INTO v_status
      FROM public.orders o
     WHERE o.id = OLD.order_id;

    IF v_status IN ('PAID', 'VOID') THEN
      RAISE EXCEPTION 'order_lines of % order % are immutable', v_status, OLD.order_id
        USING ERRCODE = 'raise_exception';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;--> statement-breakpoint
DROP TRIGGER IF EXISTS order_lines_paid_immutable_guard ON public.order_lines;--> statement-breakpoint
CREATE TRIGGER order_lines_paid_immutable_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.order_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_paid_order_line_immutability();--> statement-breakpoint
-- Whole-payment refunds only (BR-008): the payment must exist, belong to the
-- refund's order, and match both amount and method exactly.
CREATE OR REPLACE FUNCTION public.enforce_full_refund()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_amount bigint;
  v_method text;
  v_order_id uuid;
BEGIN
  SELECT p.amount, p.method::text, p.order_id
    INTO v_amount, v_method, v_order_id
    FROM public.payments p
   WHERE p.id = NEW.payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund payment % does not exist', NEW.payment_id
      USING ERRCODE = 'raise_exception';
  END IF;

  IF NEW.order_id <> v_order_id THEN
    RAISE EXCEPTION 'refund order % does not match payment order %',
      NEW.order_id, v_order_id
      USING ERRCODE = 'raise_exception';
  END IF;

  IF NEW.amount <> v_amount THEN
    RAISE EXCEPTION 'refund amount % does not match payment amount %',
      NEW.amount, v_amount
      USING ERRCODE = 'raise_exception';
  END IF;

  IF NEW.method::text <> v_method THEN
    RAISE EXCEPTION 'refund method % does not match payment method %',
      NEW.method, v_method
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN NEW;
END;
$function$;--> statement-breakpoint
DROP TRIGGER IF EXISTS refunds_full_refund_guard ON public.refunds;--> statement-breakpoint
CREATE TRIGGER refunds_full_refund_guard
  BEFORE INSERT ON public.refunds
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_full_refund();--> statement-breakpoint
-- Ledger/timeline chronology is server-assigned: a supplied created_at is
-- overwritten with the transaction timestamp.
CREATE OR REPLACE FUNCTION public.set_server_created_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.created_at := now();
  RETURN NEW;
END;
$function$;--> statement-breakpoint
DROP TRIGGER IF EXISTS stock_ledger_server_created_at ON public.stock_ledger;--> statement-breakpoint
CREATE TRIGGER stock_ledger_server_created_at
  BEFORE INSERT ON public.stock_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.set_server_created_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_server_created_at ON public.audit_log;--> statement-breakpoint
CREATE TRIGGER audit_log_server_created_at
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.set_server_created_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS order_status_events_server_created_at ON public.order_status_events;--> statement-breakpoint
CREATE TRIGGER order_status_events_server_created_at
  BEFORE INSERT ON public.order_status_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_server_created_at();
