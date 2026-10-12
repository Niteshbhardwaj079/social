-- SaaS step 2: plans, subscriptions, payments and invoices.
--
-- Flow (manual payments today, a payment gateway later):
--   1. A customer picks a plan under Billing and pays (UPI / bank transfer) outside the app.
--   2. They submit the transaction ID (+ optional screenshot)  -> a `payments` row, status 'pending'.
--   3. The platform owner approves it under Platform → Payments -> the subscription is extended,
--      an `invoices` row is created and a `subscription_events` row records the history.
-- A future gateway (Razorpay / Stripe) creates the same `payments` row and calls the same
-- "activate" code — see src/billing/README.md.

-- ---------------------------------------------------------------- plans (platform-wide, editable by the owner)
CREATE TABLE plans (
  id                   text          PRIMARY KEY,
  name                 text          NOT NULL,
  description          text          NOT NULL DEFAULT '',
  price_monthly        numeric(12,2) NOT NULL DEFAULT 0,
  price_yearly         numeric(12,2) NOT NULL DEFAULT 0,
  currency             text          NOT NULL DEFAULT 'INR',
  -- Limits. NULL = unlimited.
  max_social_accounts  integer,
  max_users            integer,
  max_posts_per_month  integer,
  max_storage_mb       integer,
  -- Modules this plan includes.
  feature_analytics    boolean       NOT NULL DEFAULT true,
  feature_inbox        boolean       NOT NULL DEFAULT false,
  feature_recycling    boolean       NOT NULL DEFAULT false,
  feature_links        boolean       NOT NULL DEFAULT false,
  feature_ads          boolean       NOT NULL DEFAULT false,
  is_active            boolean       NOT NULL DEFAULT true,   -- false = hidden from customers
  sort_order           integer       NOT NULL DEFAULT 0,
  updated_at           timestamptz   NOT NULL DEFAULT now()
);

INSERT INTO plans (id, name, description, price_monthly, price_yearly, max_social_accounts, max_users, max_posts_per_month, max_storage_mb,
                   feature_analytics, feature_inbox, feature_recycling, feature_links, feature_ads, sort_order) VALUES
  ('free',       'Free',       'Try the basics for a small brand.',            0,     0,      3,    1,    30,   500,  true, false, false, false, false, 1),
  ('starter',    'Starter',    'For freelancers and small businesses.',        999,   9990,   10,   3,    300,  5120, true, true,  true,  true,  false, 2),
  ('pro',        'Pro',        'For growing teams and agencies.',              2499,  24990,  25,   10,   NULL, 51200, true, true, true,  true,  true,  3),
  ('enterprise', 'Enterprise', 'Unlimited everything, for large teams.',       6999,  69990,  NULL, NULL, NULL, NULL, true, true,  true,  true,  true,  4);

-- ---------------------------------------------------------------- one current subscription per organization
CREATE TABLE subscriptions (
  organization_id       uuid        PRIMARY KEY REFERENCES organizations (id) ON DELETE CASCADE DEFAULT app_current_org(),
  plan_id               text        NOT NULL REFERENCES plans (id),
  status                text        NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'cancelled')),
  billing_cycle         text        CHECK (billing_cycle IN ('monthly', 'yearly')),
  current_period_start  timestamptz NOT NULL DEFAULT now(),
  current_period_end    timestamptz,               -- NULL = never ends (the Free plan)
  provider              text        NOT NULL DEFAULT 'manual',
  provider_reference    text,                      -- a gateway's own subscription id, later
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- payments (manual today, gateway later)
CREATE TABLE payments (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid          NOT NULL REFERENCES organizations (id) ON DELETE CASCADE DEFAULT app_current_org(),
  plan_id              text          NOT NULL REFERENCES plans (id),
  billing_cycle        text          NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  -- Price breakdown frozen when the customer submits, so a later price/tax change never alters it.
  subtotal             numeric(12,2) NOT NULL,
  tax_label            text          NOT NULL DEFAULT '',
  tax_rate             numeric(5,2)  NOT NULL DEFAULT 0,
  tax_amount           numeric(12,2) NOT NULL DEFAULT 0,
  amount               numeric(12,2) NOT NULL,     -- total = subtotal + tax_amount
  currency             text          NOT NULL,
  provider             text          NOT NULL DEFAULT 'manual',
  provider_payment_id  text          NOT NULL,     -- the UTR / transaction ID the customer typed, or a gateway's payment id
  method               text          NOT NULL DEFAULT 'upi',
  payer_name           text          NOT NULL DEFAULT '',
  paid_on              date,
  note                 text          NOT NULL DEFAULT '',
  proof_file           text,                       -- screenshot file name under BILLING_PROOF_DIR (never public)
  proof_content_type   text,
  status               text          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by         uuid          REFERENCES users (id) ON DELETE SET NULL,
  reviewed_by          uuid          REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at          timestamptz,
  review_note          text          NOT NULL DEFAULT '',
  created_at           timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX payments_organization_idx ON payments (organization_id, created_at DESC);
CREATE INDEX payments_status_idx ON payments (status, created_at);
-- The same transaction ID can never be used twice (unless it was rejected).
CREATE UNIQUE INDEX payments_provider_reference_unique ON payments (provider, lower(provider_payment_id)) WHERE status <> 'rejected';

-- ---------------------------------------------------------------- invoices (a frozen copy: never changes after it is issued)
CREATE SEQUENCE invoice_number_seq;

CREATE TABLE invoices (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid          NOT NULL REFERENCES organizations (id) ON DELETE CASCADE DEFAULT app_current_org(),
  payment_id       uuid          NOT NULL UNIQUE REFERENCES payments (id) ON DELETE RESTRICT,
  invoice_number   text          NOT NULL UNIQUE,
  issued_at        timestamptz   NOT NULL DEFAULT now(),
  seller           jsonb         NOT NULL,         -- { name, address, gstin, email, phone }
  buyer            jsonb         NOT NULL,         -- { name, email, address, gstin }
  plan_name        text          NOT NULL,
  billing_cycle    text          NOT NULL,
  period_start     timestamptz   NOT NULL,
  period_end       timestamptz   NOT NULL,
  subtotal         numeric(12,2) NOT NULL,
  tax_label        text          NOT NULL,
  tax_rate         numeric(5,2)  NOT NULL,
  tax_amount       numeric(12,2) NOT NULL,
  total            numeric(12,2) NOT NULL,
  currency         text          NOT NULL,
  payment_method   text          NOT NULL,
  payment_reference text         NOT NULL
);
CREATE INDEX invoices_organization_idx ON invoices (organization_id, issued_at DESC);

-- ---------------------------------------------------------------- history: what changed, when ("plan history")
CREATE TABLE subscription_events (
  id               bigserial   PRIMARY KEY,
  organization_id  uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE DEFAULT app_current_org(),
  event            text        NOT NULL,           -- signed_up | trial_started | payment_submitted | payment_approved | payment_rejected | plan_assigned
  from_plan_id     text,
  to_plan_id       text,
  billing_cycle    text,
  period_end       timestamptz,
  note             text        NOT NULL DEFAULT '',
  actor_id         uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscription_events_organization_idx ON subscription_events (organization_id, created_at DESC);

-- Same isolation rules as every other tenant table (see 028_multi_tenancy.sql).
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['subscriptions', 'payments', 'invoices', 'subscription_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (app_is_system() OR organization_id = app_current_org()) WITH CHECK (app_is_system() OR organization_id = app_current_org())',
      table_name
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------- platform-wide settings (one row, edited by the owner)
-- Payment instructions shown to customers, your company details printed on invoices, tax and trial.
-- Stored as JSON so a new setting needs no migration — the defaults live in src/services/platformSettingsService.js.
CREATE TABLE platform_settings (
  id          boolean     PRIMARY KEY DEFAULT true CHECK (id),
  value       jsonb       NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_settings (id) VALUES (true);

-- Existing organizations (an upgraded single-tenant install) start on Enterprise, so nothing they
-- already use gets switched off by the upgrade.
INSERT INTO subscriptions (organization_id, plan_id, status, current_period_end)
SELECT id, 'enterprise', 'active', NULL FROM organizations;
