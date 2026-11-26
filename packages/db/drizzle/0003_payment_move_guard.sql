-- 0003_payment_move_guard
--
-- Forward fix for 0002_financial_history_guard. That guard validated only the
-- destination order of an UPDATE, so `UPDATE payments SET order_id = <editable
-- order> WHERE id = <payment of a PAID order>` passed: the payment was detached
-- from the PAID receipt while the source order stayed PAID.
--
-- This replaces the function so both the source (OLD) order and, when it
-- changes, the destination (NEW) order must be editable. DELETE still checks
-- the payment's own order. PAID/VOID payment rows stay immutable for every
-- role; pre-PAID correction and removal remain allowed.
--
-- Down path: re-apply the function body from 0002_financial_history_guard.sql
-- (the earlier, narrower check). No table, grant, or trigger changes here.

CREATE OR REPLACE FUNCTION public.enforce_paid_payment_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT o.status::text INTO v_status
      FROM public.orders o
     WHERE o.id = OLD.order_id;

    IF v_status IN ('PAID', 'VOID') THEN
      RAISE EXCEPTION 'payments of % order % are immutable', v_status, OLD.order_id
        USING ERRCODE = 'raise_exception';
    END IF;

    RETURN OLD;
  END IF;

  SELECT o.status::text INTO v_status
    FROM public.orders o
   WHERE o.id = OLD.order_id;

  IF v_status IN ('PAID', 'VOID') THEN
    RAISE EXCEPTION 'payments of % order % are immutable', v_status, OLD.order_id
      USING ERRCODE = 'raise_exception';
  END IF;

  IF NEW.order_id IS DISTINCT FROM OLD.order_id THEN
    SELECT o.status::text INTO v_status
      FROM public.orders o
     WHERE o.id = NEW.order_id;

    IF v_status IN ('PAID', 'VOID') THEN
      RAISE EXCEPTION 'payments of % order % are immutable', v_status, NEW.order_id
        USING ERRCODE = 'raise_exception';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
