-- Billing module schema: customers, product catalog, coupons, and subscriptions.
--
-- SECURITY NOTE: The app currently has no authentication, so there is no
-- `auth.uid()` to scope Row Level Security to. Every table below carries an
-- `admin_id` column so tenant scoping can be enforced once an auth/Admin
-- model exists, but the RLS policies here are intentionally permissive
-- (any request using the anon/publishable key can read and write) so the
-- app functions today. Tighten these policies to check `admin_id` against
-- the authenticated admin's id as soon as auth is added.

create extension if not exists "pgcrypto";

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =========================================================================
-- customers
-- =========================================================================
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  customer_number text unique,
  company_name text not null,
  industry text,
  website text,
  contact_name text,
  contact_title text,
  email text,
  phone text,
  status text not null default 'active'
    check (status in ('active', 'trial', 'past_due', 'canceled', 'paused')),
  lifecycle_stage text not null default 'customer'
    check (lifecycle_stage in ('lead', 'opportunity', 'customer', 'churned')),
  owner text,
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'annual')),
  currency text not null default 'USD',
  payment_method text
    check (payment_method in ('credit_card', 'ach', 'invoice', 'wire')),
  address_line1 text,
  address_city text,
  address_state text,
  address_postal_code text,
  address_country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_admin_id_idx on customers (admin_id);

create trigger customers_set_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- =========================================================================
-- products
-- =========================================================================
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  name text not null,
  description text,
  base_price_cents integer not null default 0,
  billing_interval text not null default 'monthly'
    check (billing_interval in ('weekly', 'monthly', 'quarterly', 'annual', 'one_time')),
  accounting_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_admin_id_idx on products (admin_id);

create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

-- =========================================================================
-- product_price_points — pre-configured tiers a product can offer
-- =========================================================================
create table if not exists product_price_points (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  name text not null,
  price_cents integer not null,
  billing_interval text not null
    check (billing_interval in ('weekly', 'monthly', 'quarterly', 'annual', 'one_time')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_price_points_product_id_idx on product_price_points (product_id);

create trigger product_price_points_set_updated_at
  before update on product_price_points
  for each row execute function set_updated_at();

-- =========================================================================
-- components — add-ons that can be attached to a subscription
-- =========================================================================
create table if not exists components (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products (id) on delete cascade,
  name text not null,
  pricing_scheme text not null default 'flat'
    check (pricing_scheme in ('flat', 'per_unit', 'tiered')),
  unit_name text,
  price_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists components_product_id_idx on components (product_id);

create trigger components_set_updated_at
  before update on components
  for each row execute function set_updated_at();

-- =========================================================================
-- coupons
-- =========================================================================
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  name text not null,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  -- percent: whole-number percent off (0-100). fixed: cents off.
  discount_value integer not null check (discount_value >= 0),
  duration text not null default 'once'
    check (duration in ('once', 'repeating', 'forever')),
  duration_in_periods integer,
  max_redemptions integer,
  redemption_count integer not null default 0,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_repeating_requires_periods
    check (duration <> 'repeating' or duration_in_periods is not null)
);

create index if not exists coupons_admin_id_idx on coupons (admin_id);

create trigger coupons_set_updated_at
  before update on coupons
  for each row execute function set_updated_at();

-- =========================================================================
-- subscriptions
-- =========================================================================
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  customer_id uuid not null references customers (id) on delete restrict,
  product_id uuid not null references products (id) on delete restrict,
  product_price_point_id uuid references product_price_points (id) on delete set null,
  custom_price_cents integer,
  is_custom_price boolean not null default false,
  term_type text not null check (term_type in ('term', 'evergreen')),
  term_start_date date not null,
  term_end_date date,
  first_billing_date date not null,
  -- Deal-signed date; independently editable from term/billing dates.
  order_date date not null default current_date,
  status text not null default 'active'
    check (status in ('active', 'canceled', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_term_dates_check check (
    (term_type = 'term' and term_end_date is not null)
    or (term_type = 'evergreen' and term_end_date is null)
  ),
  constraint subscriptions_custom_price_check check (
    (is_custom_price = true and custom_price_cents is not null)
    or (is_custom_price = false)
  )
);

create index if not exists subscriptions_admin_id_idx on subscriptions (admin_id);
create index if not exists subscriptions_customer_id_idx on subscriptions (customer_id);
create index if not exists subscriptions_product_id_idx on subscriptions (product_id);

create trigger subscriptions_set_updated_at
  before update on subscriptions
  for each row execute function set_updated_at();

-- =========================================================================
-- subscription_components (join table)
-- =========================================================================
create table if not exists subscription_components (
  subscription_id uuid not null references subscriptions (id) on delete cascade,
  component_id uuid not null references components (id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  price_override_cents integer,
  created_at timestamptz not null default now(),
  primary key (subscription_id, component_id)
);

-- =========================================================================
-- subscription_coupons (join table)
-- =========================================================================
create table if not exists subscription_coupons (
  subscription_id uuid not null references subscriptions (id) on delete cascade,
  coupon_id uuid not null references coupons (id) on delete restrict,
  applied_at timestamptz not null default now(),
  primary key (subscription_id, coupon_id)
);

-- =========================================================================
-- invoices / invoice_line_items — minimal draft-invoice generation stub.
-- No invoice module exists yet elsewhere in the app; this is a starting
-- shape the Subscription wizard writes to when it drafts an invoice.
-- =========================================================================
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  customer_id uuid not null references customers (id) on delete restrict,
  subscription_id uuid references subscriptions (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'paid', 'void')),
  amount_due_cents integer not null default 0,
  currency text not null default 'USD',
  issue_date date not null default current_date,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_customer_id_idx on invoices (customer_id);
create index if not exists invoices_subscription_id_idx on invoices (subscription_id);

create trigger invoices_set_updated_at
  before update on invoices
  for each row execute function set_updated_at();

create table if not exists invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  description text not null,
  amount_cents integer not null,
  quantity integer not null default 1,
  sort_order integer not null default 0
);

create index if not exists invoice_line_items_invoice_id_idx on invoice_line_items (invoice_id);

-- =========================================================================
-- Row Level Security — permissive for now (see security note above).
-- =========================================================================
alter table customers enable row level security;
alter table products enable row level security;
alter table product_price_points enable row level security;
alter table components enable row level security;
alter table coupons enable row level security;
alter table subscriptions enable row level security;
alter table subscription_components enable row level security;
alter table subscription_coupons enable row level security;
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;

create policy "public read/write" on customers for all using (true) with check (true);
create policy "public read/write" on products for all using (true) with check (true);
create policy "public read/write" on product_price_points for all using (true) with check (true);
create policy "public read/write" on components for all using (true) with check (true);
create policy "public read/write" on coupons for all using (true) with check (true);
create policy "public read/write" on subscriptions for all using (true) with check (true);
create policy "public read/write" on subscription_components for all using (true) with check (true);
create policy "public read/write" on subscription_coupons for all using (true) with check (true);
create policy "public read/write" on invoices for all using (true) with check (true);
create policy "public read/write" on invoice_line_items for all using (true) with check (true);
