-- Run this in Supabase SQL Editor to support lump-sum split payments
CREATE TABLE IF NOT EXISTS payment_allocations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  allocated_amount numeric(10, 2) NOT NULL,
  paypal_fee numeric(10, 2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_id ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_deal_id ON payment_allocations(deal_id);

-- Allow authenticated users to read/write (RLS must be disabled or policies added)
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access" ON payment_allocations
  USING (true)
  WITH CHECK (true);
