-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Enums
create type payment_method_creator as enum ('wise', 'paypal', 'bank', 'check', 'venmo', 'zelle');
create type payment_method_brand as enum ('wire', 'paypal', 'wise', 'check', 'ach');
create type deal_status as enum ('draft', 'active', 'payment_pending', 'payment_received', 'escrowed', 'disbursed', 'closed');
create type payment_source as enum ('bluevine', 'wise', 'paypal', 'bank_wire', 'other');
create type match_status as enum ('unmatched', 'ai_suggested', 'confirmed', 'rejected');
create type disbursement_status as enum ('pending_approval', 'approved', 'sent', 'confirmed');
create type recipient_type as enum ('creator', 'tsp');

-- Creators
create table creators (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  legal_name text not null,
  stage_name text,
  business_entity_name text,
  aliases text[] default '{}',
  email text,
  phone text,
  payment_method payment_method_creator,
  payment_details jsonb,
  default_commission_pct numeric default 30 check (default_commission_pct between 0 and 100),
  notes text
);

-- Brands
create table brands (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  brand_name text not null,
  aliases text[] default '{}',
  primary_contact_name text,
  primary_contact_email text,
  payment_method payment_method_brand,
  notes text
);

-- Deals
create table deals (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  deal_id text unique not null,
  brand_id uuid references brands(id) on delete restrict,
  creator_id uuid references creators(id) on delete restrict,
  campaign_name text not null,
  brand_rate numeric not null check (brand_rate >= 0),
  creator_rate numeric not null check (creator_rate >= 0),
  tsp_commission_pct numeric not null default 30 check (tsp_commission_pct between 0 and 100),
  tsp_margin numeric generated always as (brand_rate - creator_rate) stored,
  tsp_commission numeric generated always as (creator_rate * tsp_commission_pct / 100) stored,
  tsp_total numeric generated always as ((brand_rate - creator_rate) + (creator_rate * tsp_commission_pct / 100)) stored,
  creator_payout numeric generated always as (creator_rate * (1 - tsp_commission_pct / 100)) stored,
  status deal_status default 'draft',
  contract_date date,
  expected_payment_date date,
  payment_reference text,
  notes text,
  constraint creator_rate_lte_brand_rate check (creator_rate <= brand_rate)
);

-- Payments
create table payments (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  amount numeric not null check (amount > 0),
  payment_date date not null,
  source payment_source not null,
  sender_name text not null,
  memo text,
  matched_deal_id uuid references deals(id),
  match_status match_status default 'unmatched',
  ai_match_confidence text check (ai_match_confidence in ('high', 'medium', 'low')),
  ai_match_reasoning text,
  ai_suggested_deal_id uuid references deals(id),
  confirmed_by text,
  confirmed_at timestamptz,
  raw_import_data jsonb
);

-- Disbursements
create table disbursements (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  deal_id uuid references deals(id) on delete restrict,
  payment_id uuid references payments(id) on delete restrict,
  recipient_type recipient_type not null,
  recipient_name text not null,
  amount numeric not null check (amount > 0),
  status disbursement_status default 'pending_approval',
  approved_by text,
  approved_at timestamptz,
  sent_at timestamptz,
  payment_method text,
  notes text
);

-- Indexes
create index idx_deals_brand_id on deals(brand_id);
create index idx_deals_creator_id on deals(creator_id);
create index idx_deals_status on deals(status);
create index idx_payments_match_status on payments(match_status);
create index idx_payments_matched_deal on payments(matched_deal_id);
create index idx_disbursements_deal_id on disbursements(deal_id);
create index idx_disbursements_status on disbursements(status);

-- Escrow balance view
create or replace view escrow_balance as
select
  coalesce(sum(p.amount) filter (where p.match_status = 'confirmed'), 0) as total_confirmed_payments,
  coalesce(sum(d.amount) filter (where d.status in ('sent', 'confirmed')), 0) as total_disbursed,
  coalesce(sum(p.amount) filter (where p.match_status = 'confirmed'), 0) -
  coalesce(sum(d.amount) filter (where d.status in ('sent', 'confirmed')), 0) as escrow_balance
from payments p
full outer join disbursements d on true;

-- RLS
alter table creators enable row level security;
alter table brands enable row level security;
alter table deals enable row level security;
alter table payments enable row level security;
alter table disbursements enable row level security;

-- Policies (allow authenticated users to read/write all; disbursement approval restricted to admin)
create policy "authenticated read creators" on creators for select using (auth.role() = 'authenticated');
create policy "authenticated write creators" on creators for all using (auth.role() = 'authenticated');

create policy "authenticated read brands" on brands for select using (auth.role() = 'authenticated');
create policy "authenticated write brands" on brands for all using (auth.role() = 'authenticated');

create policy "authenticated read deals" on deals for select using (auth.role() = 'authenticated');
create policy "authenticated write deals" on deals for all using (auth.role() = 'authenticated');

create policy "authenticated read payments" on payments for select using (auth.role() = 'authenticated');
create policy "authenticated write payments" on payments for all using (auth.role() = 'authenticated');

create policy "authenticated read disbursements" on disbursements for select using (auth.role() = 'authenticated');
create policy "authenticated write disbursements" on disbursements for all using (auth.role() = 'authenticated');
