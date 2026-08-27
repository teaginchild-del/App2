-- Product catalog: product families and the extended product-detail /
-- product-pricing fields needed by the Catalog > Products management UI.
--
-- Builds on the `products` table introduced in 0001_billing_schema.sql.
-- Existing columns (name, description, base_price_cents, billing_interval,
-- accounting_code, is_active) are untouched so the Subscriptions module
-- keeps working; this migration only adds new, optional columns plus the
-- `product_families` parent table.

-- =========================================================================
-- product_families
-- =========================================================================
create table if not exists product_families (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  name text not null,
  description text,
  api_handle text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_families_api_handle_unique unique (api_handle)
);

create index if not exists product_families_admin_id_idx on product_families (admin_id);

create trigger product_families_set_updated_at
  before update on product_families
  for each row execute function set_updated_at();

alter table product_families enable row level security;
create policy "public read/write" on product_families for all using (true) with check (true);

-- =========================================================================
-- products — catalog fields for the Products management UI
-- =========================================================================
alter table products
  add column if not exists product_family_id uuid references product_families (id) on delete set null,
  add column if not exists api_handle text,
  add column if not exists item_category text,
  add column if not exists department text,
  add column if not exists enable_taxes boolean not null default false,
  add column if not exists require_payment_method boolean not null default false,
  add column if not exists require_billing_address boolean not null default false,
  add column if not exists create_v2_signup_page boolean not null default false,
  add column if not exists enable_url_params boolean not null default false,
  add column if not exists price_interval integer not null default 1,
  add column if not exists price_interval_unit text not null default 'month'
    check (price_interval_unit in ('month', 'day')),
  add column if not exists tax_included boolean not null default false,
  add column if not exists has_trial boolean not null default false,
  add column if not exists trial_interval integer,
  add column if not exists trial_interval_unit text check (trial_interval_unit in ('month', 'day')),
  add column if not exists trial_price_cents integer,
  add column if not exists has_setup_fee boolean not null default false,
  add column if not exists setup_fee_cents integer,
  add column if not exists has_term boolean not null default false,
  add column if not exists term_interval integer,
  add column if not exists term_interval_unit text check (term_interval_unit in ('month', 'day', 'year'));

create index if not exists products_product_family_id_idx on products (product_family_id);

-- The new "Occurs" + Day(s)/Month(s) pricing model can express intervals the
-- original enum didn't cover (e.g. daily billing); widen the check rather
-- than replace it so existing rows/values stay valid.
alter table products drop constraint if exists products_billing_interval_check;
alter table products add constraint products_billing_interval_check
  check (billing_interval in ('weekly', 'monthly', 'quarterly', 'annual', 'one_time', 'daily'));
