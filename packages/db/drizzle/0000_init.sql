CREATE TYPE "public"."ledger_entry_type" AS ENUM('STOCK_IN', 'ADJUSTMENT', 'SALE_DECREMENT', 'SALE_REVERSAL');--> statement-breakpoint
CREATE TYPE "public"."ledger_source_type" AS ENUM('ORDER', 'STOCK_IN', 'ADJUSTMENT', 'CYCLE_COUNT');--> statement-breakpoint
CREATE TYPE "public"."order_kind" AS ENUM('SALE', 'SERVICE');--> statement-breakpoint
CREATE TYPE "public"."order_line_type" AS ENUM('PRODUCT', 'SERVICE');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('DRAFT', 'ESTIMATED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'PAID', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'TRANSFER', 'QRIS');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('OWNER', 'ADMIN', 'CASHIER', 'MECHANIC');--> statement-breakpoint
CREATE TYPE "public"."sync_conflict_code" AS ENUM('STOCK_INSUFFICIENT', 'PRICE_CHANGED', 'PLATE_REASSIGNED', 'CASH_REPORTING');--> statement-breakpoint
CREATE TYPE "public"."sync_state" AS ENUM('QUEUED', 'APPLIED', 'CONFLICT');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"outlet_id" uuid,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_provider_id_account_id_unique" UNIQUE("providerId","accountId")
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"outlet_id" uuid,
	"token_hash" text NOT NULL,
	"label" text,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"succeeded" boolean DEFAULT false NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	"activeOutletId" uuid,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "staff_outlets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"outlet_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_outlets_user_id_outlet_id_unique" UNIQUE("user_id","outlet_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"businessId" uuid NOT NULL,
	"role" "staff_role" NOT NULL,
	"username" text,
	"displayUsername" text,
	"phone" text NOT NULL,
	"deactivatedAt" timestamp with time zone,
	"anonymizedAt" timestamp with time zone,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"cost" bigint NOT NULL,
	"price" bigint NOT NULL,
	"low_stock_threshold" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_outlet_id_sku_unique" UNIQUE("outlet_id","sku"),
	CONSTRAINT "products_cost_non_negative" CHECK ("products"."cost" >= 0),
	CONSTRAINT "products_price_non_negative" CHECK ("products"."price" >= 0),
	CONSTRAINT "products_low_stock_threshold_non_negative" CHECK ("products"."low_stock_threshold" is null or "products"."low_stock_threshold" >= 0),
	CONSTRAINT "products_soft_delete_implies_inactive" CHECK ("products"."deleted_at" is null or "products"."is_active" = false)
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"price" bigint NOT NULL,
	"duration_minutes" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_outlet_id_code_unique" UNIQUE("outlet_id","code"),
	CONSTRAINT "services_price_non_negative" CHECK ("services"."price" >= 0),
	CONSTRAINT "services_duration_minutes_positive" CHECK ("services"."duration_minutes" > 0),
	CONSTRAINT "services_soft_delete_implies_inactive" CHECK ("services"."deleted_at" is null or "services"."is_active" = false)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"address" text,
	"notes" text,
	"anonymized_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"normalized_plate" text NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"year" integer,
	"color" text,
	"odometer" integer,
	"vin" text,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_business_id_normalized_plate_unique" UNIQUE("business_id","normalized_plate"),
	CONSTRAINT "vehicles_normalized_plate_format" CHECK ("vehicles"."normalized_plate" ~ '^[A-Z0-9]+$'),
	CONSTRAINT "vehicles_year_range" CHECK ("vehicles"."year" is null or ("vehicles"."year" >= 1886 and "vehicles"."year" <= 2200)),
	CONSTRAINT "vehicles_odometer_non_negative" CHECK ("vehicles"."odometer" is null or "vehicles"."odometer" >= 0)
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"key" text NOT NULL,
	"operation" text NOT NULL,
	"request_hash" text NOT NULL,
	"order_id" uuid,
	"response_status" integer,
	"response_body" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_business_id_key_unique" UNIQUE("business_id","key")
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"line_type" "order_line_type" NOT NULL,
	"product_id" uuid,
	"service_id" uuid,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" bigint NOT NULL,
	"discount_percent" integer,
	"discount_amount" bigint DEFAULT 0 NOT NULL,
	"tax_amount" bigint DEFAULT 0 NOT NULL,
	"line_total" bigint NOT NULL,
	"technician_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_lines_quantity_positive" CHECK ("order_lines"."quantity" > 0),
	CONSTRAINT "order_lines_unit_price_non_negative" CHECK ("order_lines"."unit_price" >= 0),
	CONSTRAINT "order_lines_line_total_non_negative" CHECK ("order_lines"."line_total" >= 0),
	CONSTRAINT "order_lines_discount_amount_non_negative" CHECK ("order_lines"."discount_amount" >= 0),
	CONSTRAINT "order_lines_tax_amount_non_negative" CHECK ("order_lines"."tax_amount" >= 0),
	CONSTRAINT "order_lines_discount_percent_range" CHECK ("order_lines"."discount_percent" is null or ("order_lines"."discount_percent" >= 0 and "order_lines"."discount_percent" <= 100)),
	CONSTRAINT "order_lines_exactly_one_catalog_item" CHECK (("order_lines"."line_type" = 'PRODUCT' and "order_lines"."product_id" is not null and "order_lines"."service_id" is null) or ("order_lines"."line_type" = 'SERVICE' and "order_lines"."service_id" is not null and "order_lines"."product_id" is null)),
	CONSTRAINT "order_lines_discount_within_line_value" CHECK ("order_lines"."discount_amount" <= "order_lines"."quantity" * "order_lines"."unit_price")
);
--> statement-breakpoint
CREATE TABLE "order_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"kind" "order_kind" NOT NULL,
	"status" "order_status" DEFAULT 'DRAFT' NOT NULL,
	"customer_id" uuid,
	"vehicle_id" uuid,
	"technician_id" text,
	"odometer" integer,
	"order_number" text,
	"tax_rate" integer NOT NULL,
	"subtotal" bigint NOT NULL,
	"discount_total" bigint NOT NULL,
	"tax_total" bigint NOT NULL,
	"total" bigint NOT NULL,
	"notes" text,
	"paid_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_outlet_id_order_number_unique" UNIQUE("outlet_id","order_number"),
	CONSTRAINT "orders_tax_rate_range" CHECK ("orders"."tax_rate" >= 0 and "orders"."tax_rate" <= 100),
	CONSTRAINT "orders_odometer_non_negative" CHECK ("orders"."odometer" is null or "orders"."odometer" >= 0),
	CONSTRAINT "orders_subtotal_non_negative" CHECK ("orders"."subtotal" >= 0),
	CONSTRAINT "orders_discount_total_non_negative" CHECK ("orders"."discount_total" >= 0),
	CONSTRAINT "orders_tax_total_non_negative" CHECK ("orders"."tax_total" >= 0),
	CONSTRAINT "orders_total_non_negative" CHECK ("orders"."total" >= 0),
	CONSTRAINT "orders_service_requires_vehicle" CHECK ("orders"."kind" <> 'SERVICE' or "orders"."vehicle_id" is not null),
	CONSTRAINT "orders_void_requires_timestamp_and_reason" CHECK ("orders"."status" <> 'VOID' or ("orders"."voided_at" is not null and "orders"."void_reason" is not null and length(btrim("orders"."void_reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount" bigint NOT NULL,
	"change_amount" bigint DEFAULT 0 NOT NULL,
	"reference_note" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_change_amount_non_negative" CHECK ("payments"."change_amount" >= 0),
	CONSTRAINT "payments_non_cash_has_no_change" CHECK ("payments"."method" = 'CASH' or "payments"."change_amount" = 0)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid,
	"method" "payment_method" NOT NULL,
	"amount" bigint NOT NULL,
	"reason" text NOT NULL,
	"reference_note" text,
	"refunded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"tax_rate" integer DEFAULT 11 NOT NULL,
	"cashier_discount_cap_percent" integer DEFAULT 0 NOT NULL,
	"idle_timeout_minutes" integer DEFAULT 30 NOT NULL,
	"receipt_paper_width" integer DEFAULT 58 NOT NULL,
	"void_reason_min_length" integer DEFAULT 10 NOT NULL,
	"receipt_prefix" text DEFAULT '' NOT NULL,
	"receipt_header_text" text,
	"receipt_footer_text" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_outlet_id_unique" UNIQUE("outlet_id"),
	CONSTRAINT "settings_tax_rate_range" CHECK ("settings"."tax_rate" >= 0 and "settings"."tax_rate" <= 100),
	CONSTRAINT "settings_cashier_discount_cap_range" CHECK ("settings"."cashier_discount_cap_percent" >= 0 and "settings"."cashier_discount_cap_percent" <= 100),
	CONSTRAINT "settings_idle_timeout_minutes_positive" CHECK ("settings"."idle_timeout_minutes" >= 1),
	CONSTRAINT "settings_receipt_paper_width_supported" CHECK ("settings"."receipt_paper_width" in (58, 80)),
	CONSTRAINT "settings_void_reason_min_length_positive" CHECK ("settings"."void_reason_min_length" >= 1)
);
--> statement-breakpoint
CREATE TABLE "stock_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"entry_type" "ledger_entry_type" NOT NULL,
	"quantity_before" integer NOT NULL,
	"quantity_after" integer NOT NULL,
	"override" boolean DEFAULT false NOT NULL,
	"reason" text,
	"source_type" "ledger_source_type" NOT NULL,
	"source_id" uuid,
	"source_ref" text,
	"order_line_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_ledger_quantity_changed" CHECK ("stock_ledger"."quantity_after" <> "stock_ledger"."quantity_before"),
	CONSTRAINT "stock_ledger_override_requires_reason" CHECK ("stock_ledger"."override" = false or ("stock_ledger"."reason" is not null and length(btrim("stock_ledger"."reason")) > 0)),
	CONSTRAINT "stock_ledger_non_negative_without_override" CHECK ("stock_ledger"."override" = true or "stock_ledger"."quantity_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sync_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"device_token_id" uuid,
	"client_key" text NOT NULL,
	"order_id" uuid,
	"state" "sync_state" DEFAULT 'QUEUED' NOT NULL,
	"conflict_code" "sync_conflict_code",
	"device_recorded_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_keys_business_id_client_key_unique" UNIQUE("business_id","client_key"),
	CONSTRAINT "sync_keys_attempt_count_non_negative" CHECK ("sync_keys"."attempt_count" >= 0),
	CONSTRAINT "sync_keys_conflict_requires_code" CHECK ("sync_keys"."state" <> 'CONFLICT' or "sync_keys"."conflict_code" is not null)
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"product_display_name" text,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"logo_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outlets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outlets_business_id_name_unique" UNIQUE("business_id","name")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_activeOutletId_outlets_id_fk" FOREIGN KEY ("activeOutletId") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_outlets" ADD CONSTRAINT "staff_outlets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_outlets" ADD CONSTRAINT "staff_outlets_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_businessId_businesses_id_fk" FOREIGN KEY ("businessId") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_technician_id_user_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_technician_id_user_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_keys" ADD CONSTRAINT "sync_keys_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_keys" ADD CONSTRAINT "sync_keys_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_keys" ADD CONSTRAINT "sync_keys_device_token_id_device_tokens_id_fk" FOREIGN KEY ("device_token_id") REFERENCES "public"."device_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_keys" ADD CONSTRAINT "sync_keys_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_keys" ADD CONSTRAINT "sync_keys_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_business_id_created_at_idx" ON "audit_log" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_id_created_at_idx" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_created_at_idx" ON "audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_outlet_id_created_at_idx" ON "audit_log" USING btree ("outlet_id","created_at");--> statement-breakpoint
CREATE INDEX "device_tokens_user_id_revoked_at_idx" ON "device_tokens" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "login_attempts_identifier_attempted_at_idx" ON "login_attempts" USING btree ("identifier","attempted_at");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "staff_outlets_outlet_id_idx" ON "staff_outlets" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "products_outlet_id_is_active_idx" ON "products" USING btree ("outlet_id","is_active");--> statement-breakpoint
CREATE INDEX "products_business_id_idx" ON "products" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "services_outlet_id_is_active_idx" ON "services" USING btree ("outlet_id","is_active");--> statement-breakpoint
CREATE INDEX "customers_business_id_phone_idx" ON "customers" USING btree ("business_id","phone");--> statement-breakpoint
CREATE INDEX "customers_business_id_name_idx" ON "customers" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "vehicles_customer_id_idx" ON "vehicles" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idempotency_keys_business_id_created_at_idx" ON "idempotency_keys" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "order_lines_order_id_idx" ON "order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_lines_product_id_idx" ON "order_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "order_lines_service_id_idx" ON "order_lines" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "order_status_events_order_id_created_at_idx" ON "order_status_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_outlet_id_created_at_idx" ON "orders" USING btree ("outlet_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_outlet_id_status_created_at_idx" ON "orders" USING btree ("outlet_id","status","created_at");--> statement-breakpoint
CREATE INDEX "orders_outlet_id_paid_at_idx" ON "orders" USING btree ("outlet_id","paid_at");--> statement-breakpoint
CREATE INDEX "orders_business_id_paid_at_idx" ON "orders" USING btree ("business_id","paid_at");--> statement-breakpoint
CREATE INDEX "orders_customer_id_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_vehicle_id_idx" ON "orders" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "orders_technician_id_status_idx" ON "orders" USING btree ("technician_id","status");--> statement-breakpoint
CREATE INDEX "payments_order_id_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_method_received_at_idx" ON "payments" USING btree ("method","received_at");--> statement-breakpoint
CREATE INDEX "payments_received_at_idx" ON "payments" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "refunds_order_id_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_ledger_order_line_entry_unique" ON "stock_ledger" USING btree ("order_line_id","entry_type") WHERE "stock_ledger"."entry_type" in ('SALE_DECREMENT', 'SALE_REVERSAL');--> statement-breakpoint
CREATE INDEX "stock_ledger_outlet_id_product_id_created_at_idx" ON "stock_ledger" USING btree ("outlet_id","product_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_ledger_product_id_created_at_idx" ON "stock_ledger" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_ledger_source_type_source_id_idx" ON "stock_ledger" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "stock_ledger_order_line_id_idx" ON "stock_ledger" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "sync_keys_business_id_state_idx" ON "sync_keys" USING btree ("business_id","state");--> statement-breakpoint
CREATE INDEX "sync_keys_outlet_id_state_idx" ON "sync_keys" USING btree ("outlet_id","state");--> statement-breakpoint
CREATE INDEX "sync_keys_device_token_id_idx" ON "sync_keys" USING btree ("device_token_id");--> statement-breakpoint
CREATE INDEX "outlets_business_id_is_active_idx" ON "outlets" USING btree ("business_id","is_active");