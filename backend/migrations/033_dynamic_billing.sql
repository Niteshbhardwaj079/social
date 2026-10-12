-- SaaS step 5: dynamic billing — owner-made plans, mid-period plan changes with credit, and
-- invoices that can be voided and re-issued (an issued invoice is never edited in place).

-- ---------------------------------------------------------------- payments: credit for the unused part of the old plan
ALTER TABLE payments
  ADD COLUMN plan_price     numeric(12,2),                     -- list price of the plan for the cycle
  ADD COLUMN credit_applied numeric(12,2) NOT NULL DEFAULT 0,  -- unused days of the previous paid plan
  ADD COLUMN credit_note    text NOT NULL DEFAULT '';          -- e.g. "Unused 12 days of Starter (Monthly)"
UPDATE payments SET plan_price = subtotal WHERE plan_price IS NULL;

-- ---------------------------------------------------------------- invoices: void + re-issue
ALTER TABLE invoices
  ADD COLUMN status              text          NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'void')),
  ADD COLUMN void_reason         text          NOT NULL DEFAULT '',
  ADD COLUMN voided_at           timestamptz,
  ADD COLUMN replaces_invoice_id uuid          REFERENCES invoices (id) ON DELETE SET NULL,
  ADD COLUMN plan_price          numeric(12,2),
  ADD COLUMN credit_amount       numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN credit_note         text          NOT NULL DEFAULT '',
  ADD COLUMN notes               text          NOT NULL DEFAULT '';
UPDATE invoices SET plan_price = subtotal WHERE plan_price IS NULL;

-- One payment may now have several invoices over time (a voided one + its replacement), but only
-- one that is currently valid.
ALTER TABLE invoices DROP CONSTRAINT invoices_payment_id_key;
CREATE UNIQUE INDEX invoices_one_issued_per_payment ON invoices (payment_id) WHERE status = 'issued';
