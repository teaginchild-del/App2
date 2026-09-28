-- Order-to-cash billing engine (ported from App1's NetSuite-style engine).
--
--   sales order → fulfillment → invoice → customer payment / deposit
--     → bank deposit → bank reconciliation
--   plus billing schedules, contracts with renewals, revenue recognition,
--   A/R aging, statements and dunning.
--
-- The billing math lives in src/lib/billing-engine (pure TypeScript, integer
-- cents). The browser computes an invoice/payment with the engine and hands
-- the result to one of the o2c_* functions below, which writes every row in
-- a single transaction and re-checks the state it was computed from (event
-- still pending, quantities unchanged, deposit balance still available,
-- invoice balance still open). A stale or concurrent request fails instead
-- of double-billing, and idempotency keys make retries return the original
-- record.
--
-- SECURITY NOTE: same as 0001_billing_schema.sql — no auth yet, so RLS is
-- permissive and the functions run as the caller (security invoker).
-- Tighten both once an admin/auth model exists.

-- =========================================================================
-- customers: default payment terms used for invoice due dates
-- =========================================================================
alter table customers add column if not exists payment_terms text not null default 'Net 30';

-- =========================================================================
-- contracts (SuiteBilling-style). Items bill through a sales order the
-- contract owns (one recurring-schedule line per item).
-- =========================================================================
create sequence if not exists contract_number_seq;

create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  contract_number text not null unique
    default ('CT-' || lpad(nextval('contract_number_seq')::text, 5, '0')),
  customer_id uuid not null references customers (id) on delete restrict,
  start_date date not null,
  end_date date not null,
  terms text not null default 'Net 30',
  status text not null default 'draft'
    check (status in ('draft', 'active', 'renewed', 'terminated', 'expired')),
  auto_renew boolean not null default true,
  renewal_term_months integer not null default 12 check (renewal_term_months > 0),
  uplift_percent numeric(6, 3) not null default 0,
  renewal_lead_days integer not null default 30 check (renewal_lead_days >= 0),
  renewed_from_id uuid unique references contracts (id) on delete set null,
  terminated_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contracts_dates_check check (end_date >= start_date)
);

create index if not exists contracts_customer_id_idx on contracts (customer_id);
create index if not exists contracts_status_end_idx on contracts (status, end_date);

create trigger contracts_set_updated_at
  before update on contracts
  for each row execute function set_updated_at();

create table if not exists contract_items (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts (id) on delete cascade,
  product_id uuid references products (id) on delete set null,
  description text not null,
  quantity numeric(14, 4) not null check (quantity > 0),
  -- per unit, per billing period
  unit_price_cents integer not null,
  frequency_months integer not null check (frequency_months in (1, 3, 6, 12)),
  timing text not null default 'advance' check (timing in ('advance', 'arrears')),
  start_date date not null,
  end_date date not null,
  revenue_treatment text not null default 'ratable'
    check (revenue_treatment in ('point_in_time', 'ratable')),
  constraint contract_items_dates_check check (end_date >= start_date)
);

create index if not exists contract_items_contract_id_idx on contract_items (contract_id);

-- =========================================================================
-- sales_orders — commitments, never postings. Status is derived in the app
-- from line progress (src/lib/billing-engine/sales-order.ts), not stored.
-- =========================================================================
create sequence if not exists sales_order_number_seq;

create table if not exists sales_orders (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  order_number text not null unique
    default ('SO-' || lpad(nextval('sales_order_number_seq')::text, 5, '0')),
  customer_id uuid not null references customers (id) on delete restrict,
  order_date date not null default current_date,
  terms text not null default 'Net 30',
  currency text not null default 'USD',
  memo text,
  -- Up-front deposit asked of the customer (e.g. 50%).
  deposit_requested_cents integer check (deposit_requested_cents is null or deposit_requested_cents >= 0),
  requires_approval boolean not null default true,
  approved_at timestamptz,
  approved_by text,
  cancelled_at timestamptz,
  closed_at timestamptz,
  contract_id uuid unique references contracts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_orders_customer_id_idx on sales_orders (customer_id);

create trigger sales_orders_set_updated_at
  before update on sales_orders
  for each row execute function set_updated_at();

create table if not exists sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders (id) on delete cascade,
  line_no integer not null,
  product_id uuid references products (id) on delete set null,
  description text not null,
  item_kind text not null default 'service'
    check (item_kind in ('inventory', 'non_inventory', 'service')),
  quantity numeric(14, 4) not null check (quantity > 0),
  unit_price_cents integer not null,
  amount_cents integer not null,
  quantity_fulfilled numeric(14, 4) not null default 0,
  quantity_billed numeric(14, 4) not null default 0,
  amount_billed_cents integer not null default 0,
  taxable boolean not null default false,
  tax_rate_percent numeric(7, 4) not null default 0,
  revenue_treatment text not null default 'point_in_time'
    check (revenue_treatment in ('point_in_time', 'ratable')),
  rev_rec_start date,
  rev_rec_end date,
  -- BillingScheduleSpec (src/lib/billing-engine/billing-schedule.ts), or
  -- null = bill by quantity as fulfilled (goods) / immediately (services).
  billing_schedule jsonb,
  contract_item_id uuid unique references contract_items (id) on delete set null,
  unique (sales_order_id, line_no),
  constraint sales_order_lines_fulfilled_check check (quantity_fulfilled between 0 and quantity),
  constraint sales_order_lines_billed_check check (quantity_billed between 0 and quantity)
);

create index if not exists sales_order_lines_order_idx on sales_order_lines (sales_order_id);

-- Shipments of goods; makes the shipped quantity billable.
create table if not exists fulfillments (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders (id) on delete cascade,
  fulfilled_on date not null,
  reference text, -- carrier / tracking number
  created_at timestamptz not null default now()
);

create index if not exists fulfillments_order_idx on fulfillments (sales_order_id);

create table if not exists fulfillment_lines (
  id uuid primary key default gen_random_uuid(),
  fulfillment_id uuid not null references fulfillments (id) on delete cascade,
  sales_order_line_id uuid not null references sales_order_lines (id) on delete cascade,
  quantity numeric(14, 4) not null check (quantity > 0)
);

-- One planned bill on a scheduled line: an installment, a milestone, or a
-- recurring period. The billing run invoices every pending event whose
-- bill_date has arrived.
create table if not exists billing_events (
  id uuid primary key default gen_random_uuid(),
  sales_order_line_id uuid not null references sales_order_lines (id) on delete cascade,
  seq integer not null,
  bill_date date, -- null until a milestone is completed
  amount_cents integer not null,
  period_start date,
  period_end date,
  milestone_name text,
  milestone_completed_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'billed', 'cancelled')),
  unique (sales_order_line_id, seq)
);

create index if not exists billing_events_status_date_idx on billing_events (status, bill_date);

-- =========================================================================
-- invoices: extend the existing table into the engine's posting record.
-- amount_due_cents keeps its meaning (total less deposits applied);
-- balance_cents is what is still owed after payments.
-- =========================================================================
create sequence if not exists invoice_number_seq;

alter table invoices
  add column if not exists invoice_number text unique
    default ('INV-' || lpad(nextval('invoice_number_seq')::text, 5, '0')),
  add column if not exists sales_order_id uuid references sales_orders (id) on delete set null,
  add column if not exists terms text,
  add column if not exists memo text,
  add column if not exists subtotal_cents integer not null default 0,
  add column if not exists tax_total_cents integer not null default 0,
  add column if not exists total_cents integer not null default 0,
  add column if not exists deposit_applied_cents integer not null default 0,
  add column if not exists balance_cents integer not null default 0,
  add column if not exists idempotency_key text unique,
  -- Journal preview (Dr A/R, Cr Revenue / Deferred Revenue / Sales Tax ...)
  add column if not exists gl_lines jsonb not null default '[]'::jsonb,
  -- Highest dunning level already sent (0 = none); only ever moves forward.
  add column if not exists dunning_level integer not null default 0,
  add column if not exists dunning_paused boolean not null default false,
  -- Filled once the invoice is synced to QuickBooks by a backend job.
  add column if not exists qbo_invoice_id text;

-- Backfill totals for invoices created before the engine existed.
update invoices
set subtotal_cents = amount_due_cents,
    total_cents = amount_due_cents,
    balance_cents = case when status = 'paid' or status = 'void' then 0 else amount_due_cents end
where total_cents = 0 and amount_due_cents <> 0;

alter table invoices drop constraint if exists invoices_status_check;
alter table invoices add constraint invoices_status_check
  check (status in ('draft', 'open', 'partially_paid', 'paid', 'void'));
alter table invoices add constraint invoices_balance_check check (balance_cents >= 0);

create index if not exists invoices_sales_order_id_idx on invoices (sales_order_id);
create index if not exists invoices_status_idx on invoices (status);

alter table invoice_line_items
  alter column quantity type numeric(14, 4),
  add column if not exists product_id uuid references products (id) on delete set null,
  add column if not exists sales_order_line_id uuid references sales_order_lines (id) on delete set null,
  add column if not exists billing_event_id uuid unique references billing_events (id) on delete set null,
  add column if not exists unit_price_cents integer,
  add column if not exists tax_cents integer not null default 0,
  add column if not exists taxable boolean not null default false,
  add column if not exists revenue_treatment text not null default 'point_in_time'
    check (revenue_treatment in ('point_in_time', 'ratable')),
  add column if not exists deferred boolean not null default false,
  add column if not exists rev_rec_start date,
  add column if not exists rev_rec_end date;

-- Monthly release of deferred revenue: Dr Deferred Revenue / Cr Revenue.
create table if not exists rev_rec_entries (
  id uuid primary key default gen_random_uuid(),
  invoice_line_item_id uuid not null references invoice_line_items (id) on delete cascade,
  recognize_on date not null,
  amount_cents integer not null,
  recognized_at timestamptz,
  unique (invoice_line_item_id, recognize_on)
);

create index if not exists rev_rec_entries_open_idx on rev_rec_entries (recognized_at, recognize_on);

-- =========================================================================
-- Cash: bank deposits, customer deposits (prepayments), customer payments
-- =========================================================================
create table if not exists bank_deposits (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  deposit_date date not null,
  amount_cents integer not null,
  source text not null check (source in ('stripe_payout', 'check_batch', 'individual')),
  stripe_payout_id text unique,
  reference text,
  created_at timestamptz not null default now()
);

create table if not exists customer_deposits (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  customer_id uuid not null references customers (id) on delete restrict,
  sales_order_id uuid references sales_orders (id) on delete set null,
  received_on date not null,
  amount_cents integer not null check (amount_cents > 0),
  amount_applied_cents integer not null default 0,
  amount_refunded_cents integer not null default 0,
  method text not null check (method in ('check', 'cash', 'ach', 'wire', 'card', 'stripe')),
  reference text,
  stripe_payment_intent_id text unique,
  stripe_payout_id text,
  bank_deposit_id uuid references bank_deposits (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint customer_deposits_balance_check
    check (amount_applied_cents >= 0 and amount_refunded_cents >= 0
           and amount_applied_cents + amount_refunded_cents <= amount_cents)
);

create index if not exists customer_deposits_customer_idx on customer_deposits (customer_id);
create index if not exists customer_deposits_order_idx on customer_deposits (sales_order_id);

create table if not exists deposit_applications (
  id uuid primary key default gen_random_uuid(),
  customer_deposit_id uuid not null references customer_deposits (id) on delete cascade,
  invoice_id uuid not null references invoices (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  applied_at timestamptz not null default now(),
  unique (customer_deposit_id, invoice_id)
);

create table if not exists customer_payments (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  customer_id uuid not null references customers (id) on delete restrict,
  received_on date not null,
  amount_cents integer not null check (amount_cents > 0),
  unapplied_cents integer not null default 0 check (unapplied_cents >= 0),
  method text not null check (method in ('check', 'cash', 'ach', 'wire', 'card', 'stripe')),
  reference text, -- check number, ACH trace, etc.
  stripe_payout_id text,
  idempotency_key text not null unique,
  bank_deposit_id uuid references bank_deposits (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_payments_customer_idx on customer_payments (customer_id);

create table if not exists payment_applications (
  id uuid primary key default gen_random_uuid(),
  customer_payment_id uuid not null references customer_payments (id) on delete cascade,
  invoice_id uuid not null references invoices (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  unique (customer_payment_id, invoice_id)
);

-- Imported bank feed / statement CSV rows.
create table if not exists bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  posted_on date not null,
  amount_cents integer not null,
  description text not null default '',
  external_id text not null unique, -- bank's transaction ID, or a content key
  status text not null default 'unmatched' check (status in ('unmatched', 'matched', 'ignored')),
  bank_deposit_id uuid unique references bank_deposits (id) on delete set null,
  match_rule text check (match_rule in ('reference', 'amount_and_date', 'manual')),
  matched_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bank_statement_lines_status_idx on bank_statement_lines (status);

-- Reminder history; one row per invoice and level so a level is never re-sent.
create table if not exists dunning_notices (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  level integer not null,
  subject text not null,
  sent_to text,
  delivery_status text not null default 'queued' check (delivery_status in ('queued', 'sent')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (invoice_id, level)
);

-- =========================================================================
-- Row Level Security — permissive for now (see security note above).
-- =========================================================================
alter table contracts enable row level security;
alter table contract_items enable row level security;
alter table sales_orders enable row level security;
alter table sales_order_lines enable row level security;
alter table fulfillments enable row level security;
alter table fulfillment_lines enable row level security;
alter table billing_events enable row level security;
alter table rev_rec_entries enable row level security;
alter table bank_deposits enable row level security;
alter table customer_deposits enable row level security;
alter table deposit_applications enable row level security;
alter table customer_payments enable row level security;
alter table payment_applications enable row level security;
alter table bank_statement_lines enable row level security;
alter table dunning_notices enable row level security;

create policy "public read/write" on contracts for all using (true) with check (true);
create policy "public read/write" on contract_items for all using (true) with check (true);
create policy "public read/write" on sales_orders for all using (true) with check (true);
create policy "public read/write" on sales_order_lines for all using (true) with check (true);
create policy "public read/write" on fulfillments for all using (true) with check (true);
create policy "public read/write" on fulfillment_lines for all using (true) with check (true);
create policy "public read/write" on billing_events for all using (true) with check (true);
create policy "public read/write" on rev_rec_entries for all using (true) with check (true);
create policy "public read/write" on bank_deposits for all using (true) with check (true);
create policy "public read/write" on customer_deposits for all using (true) with check (true);
create policy "public read/write" on deposit_applications for all using (true) with check (true);
create policy "public read/write" on customer_payments for all using (true) with check (true);
create policy "public read/write" on payment_applications for all using (true) with check (true);
create policy "public read/write" on bank_statement_lines for all using (true) with check (true);
create policy "public read/write" on dunning_notices for all using (true) with check (true);

-- =========================================================================
-- o2c_* functions: atomic multi-row writes. Each raises on a failed guard,
-- which rolls back everything it did.
-- =========================================================================

-- Creates a sales order with its lines and planned billing events.
-- p_order: { id?, customerId, orderDate, terms, memo, currency,
--   depositRequestedCents, requiresApproval, approvedBy, contractId,
--   lines: [{ id?, lineNo, productId, description, itemKind, quantity,
--     unitPriceCents, amountCents, taxable, taxRatePercent,
--     revenueTreatment, revRecStart, revRecEnd, billingSchedule,
--     contractItemId, events: [{ seq, billDate, amountCents, periodStart,
--     periodEnd, milestoneName }] }] }
create or replace function o2c_create_sales_order(p_order jsonb)
returns uuid
language plpgsql
as $$
declare
  v_order_id uuid := coalesce((p_order->>'id')::uuid, gen_random_uuid());
  v_requires_approval boolean := coalesce((p_order->>'requiresApproval')::boolean, true);
  v_line jsonb;
  v_line_id uuid;
  v_event jsonb;
begin
  if jsonb_array_length(coalesce(p_order->'lines', '[]'::jsonb)) = 0 then
    raise exception 'A sales order needs at least one line';
  end if;

  insert into sales_orders (
    id, customer_id, order_date, terms, currency, memo, deposit_requested_cents,
    requires_approval, approved_at, approved_by, contract_id
  ) values (
    v_order_id,
    (p_order->>'customerId')::uuid,
    (p_order->>'orderDate')::date,
    coalesce(p_order->>'terms', 'Net 30'),
    coalesce(p_order->>'currency', 'USD'),
    nullif(p_order->>'memo', ''),
    (p_order->>'depositRequestedCents')::integer,
    v_requires_approval,
    case when v_requires_approval then null else now() end,
    case when v_requires_approval then null else coalesce(p_order->>'approvedBy', 'auto') end,
    (p_order->>'contractId')::uuid
  );

  for v_line in select * from jsonb_array_elements(p_order->'lines') loop
    v_line_id := coalesce((v_line->>'id')::uuid, gen_random_uuid());
    insert into sales_order_lines (
      id, sales_order_id, line_no, product_id, description, item_kind, quantity,
      unit_price_cents, amount_cents, taxable, tax_rate_percent, revenue_treatment,
      rev_rec_start, rev_rec_end, billing_schedule, contract_item_id
    ) values (
      v_line_id,
      v_order_id,
      (v_line->>'lineNo')::integer,
      (v_line->>'productId')::uuid,
      v_line->>'description',
      coalesce(v_line->>'itemKind', 'service'),
      (v_line->>'quantity')::numeric,
      (v_line->>'unitPriceCents')::integer,
      (v_line->>'amountCents')::integer,
      coalesce((v_line->>'taxable')::boolean, false),
      coalesce((v_line->>'taxRatePercent')::numeric, 0),
      coalesce(v_line->>'revenueTreatment', 'point_in_time'),
      (v_line->>'revRecStart')::date,
      (v_line->>'revRecEnd')::date,
      case when jsonb_typeof(v_line->'billingSchedule') = 'object' then v_line->'billingSchedule' end,
      (v_line->>'contractItemId')::uuid
    );

    for v_event in select * from jsonb_array_elements(coalesce(v_line->'events', '[]'::jsonb)) loop
      insert into billing_events (
        sales_order_line_id, seq, bill_date, amount_cents, period_start, period_end, milestone_name
      ) values (
        v_line_id,
        (v_event->>'seq')::integer,
        (v_event->>'billDate')::date,
        (v_event->>'amountCents')::integer,
        (v_event->>'periodStart')::date,
        (v_event->>'periodEnd')::date,
        v_event->>'milestoneName'
      );
    end loop;
  end loop;

  return v_order_id;
end;
$$;

-- Approves an order. A contract's order waits for approval (e.g. a
-- renewal); approving it activates that contract.
create or replace function o2c_approve_sales_order(p_order_id uuid, p_approved_by text)
returns void
language plpgsql
as $$
declare
  v_order sales_orders%rowtype;
begin
  select * into v_order from sales_orders where id = p_order_id for update;
  if not found then raise exception 'Sales order not found'; end if;
  if v_order.cancelled_at is not null or v_order.closed_at is not null then
    raise exception 'Cannot approve a cancelled or closed order';
  end if;
  if v_order.approved_at is null then
    update sales_orders set approved_at = now(), approved_by = p_approved_by where id = p_order_id;
    if v_order.contract_id is not null then
      update contracts set status = 'active' where id = v_order.contract_id and status = 'draft';
    end if;
  end if;
end;
$$;

-- Cancel (nothing billed yet) or close (stop further billing) an order;
-- either way its pending billing events are cancelled.
create or replace function o2c_end_sales_order(p_order_id uuid, p_action text)
returns void
language plpgsql
as $$
begin
  perform 1 from sales_orders where id = p_order_id for update;
  if not found then raise exception 'Sales order not found'; end if;

  if p_action = 'cancel' then
    if exists (select 1 from sales_order_lines where sales_order_id = p_order_id and amount_billed_cents <> 0) then
      raise exception 'Order has billed lines — close it instead of cancelling';
    end if;
    update sales_orders set cancelled_at = now() where id = p_order_id and cancelled_at is null;
  elsif p_action = 'close' then
    update sales_orders set closed_at = now() where id = p_order_id and closed_at is null;
  else
    raise exception 'Unknown action %', p_action;
  end if;

  update billing_events set status = 'cancelled'
  where status = 'pending'
    and sales_order_line_id in (select id from sales_order_lines where sales_order_id = p_order_id);
end;
$$;

-- Records a shipment. p_lines: [{ lineId, quantity }]
create or replace function o2c_record_fulfillment(
  p_order_id uuid, p_fulfilled_on date, p_reference text, p_lines jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_order sales_orders%rowtype;
  v_fulfillment_id uuid;
  v_line jsonb;
begin
  select * into v_order from sales_orders where id = p_order_id for update;
  if not found then raise exception 'Sales order not found'; end if;
  if v_order.approved_at is null then raise exception 'Order must be approved before fulfillment'; end if;
  if v_order.cancelled_at is not null or v_order.closed_at is not null then
    raise exception 'Order is cancelled or closed';
  end if;

  insert into fulfillments (sales_order_id, fulfilled_on, reference)
  values (p_order_id, p_fulfilled_on, nullif(p_reference, ''))
  returning id into v_fulfillment_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    update sales_order_lines
    set quantity_fulfilled = quantity_fulfilled + (v_line->>'quantity')::numeric
    where id = (v_line->>'lineId')::uuid
      and sales_order_id = p_order_id
      and item_kind = 'inventory';
    if not found then raise exception 'Line % is not an inventory line on this order', v_line->>'lineId'; end if;

    insert into fulfillment_lines (fulfillment_id, sales_order_line_id, quantity)
    values (v_fulfillment_id, (v_line->>'lineId')::uuid, (v_line->>'quantity')::numeric);
  end loop;

  return v_fulfillment_id;
end;
$$;

-- Reserves an invoice built by the engine (buildInvoiceDraft): inserts the
-- invoice, its lines and revenue schedule, marks the sales-order work it
-- covers as billed, and applies deposits. Returns the existing invoice if
-- the idempotency key was already used.
--
-- p_invoice: { idempotencyKey, customerId, salesOrderId, invoiceDate,
--   dueDate, terms, memo, subtotalCents, taxTotalCents, totalCents,
--   depositAppliedCents, glLines,
--   lines: [{ salesOrderLineId, billingEventId, productId, description,
--     quantity, unitPriceCents, amountCents, taxCents, taxable,
--     revenueTreatment, deferred, revRecStart, revRecEnd,
--     addQuantityBilled, expectedQuantityBilled,
--     revRec: [{ recognizeOn, amountCents }] }],
--   depositApplications: [{ depositId, amountCents }] }
create or replace function o2c_reserve_invoice(p_invoice jsonb)
returns uuid
language plpgsql
as $$
declare
  v_existing uuid;
  v_invoice_id uuid;
  v_order_id uuid := (p_invoice->>'salesOrderId')::uuid;
  v_customer_id uuid := (p_invoice->>'customerId')::uuid;
  v_order sales_orders%rowtype;
  v_total integer := (p_invoice->>'totalCents')::integer;
  v_deposit_applied integer := coalesce((p_invoice->>'depositAppliedCents')::integer, 0);
  v_balance integer;
  v_line jsonb;
  v_line_item_id uuid;
  v_rev jsonb;
  v_app jsonb;
  v_sort integer := 0;
begin
  select id into v_existing from invoices where idempotency_key = p_invoice->>'idempotencyKey';
  if found then return v_existing; end if;

  if v_order_id is not null then
    select * into v_order from sales_orders where id = v_order_id for update;
    if not found then raise exception 'Sales order not found'; end if;
    if v_order.customer_id <> v_customer_id then raise exception 'Sales order belongs to a different customer'; end if;
    if v_order.cancelled_at is not null or v_order.closed_at is not null then
      raise exception 'Order is cancelled or closed';
    end if;
    if v_order.approved_at is null then raise exception 'Order is pending approval'; end if;
  end if;

  v_balance := v_total - v_deposit_applied;
  if v_balance < 0 then raise exception 'Deposits applied exceed the invoice total'; end if;

  insert into invoices (
    customer_id, sales_order_id, status, amount_due_cents, issue_date, due_date, terms, memo,
    subtotal_cents, tax_total_cents, total_cents, deposit_applied_cents, balance_cents,
    idempotency_key, gl_lines
  ) values (
    v_customer_id,
    v_order_id,
    case when v_balance = 0 then 'paid' else 'open' end,
    v_balance,
    (p_invoice->>'invoiceDate')::date,
    (p_invoice->>'dueDate')::date,
    p_invoice->>'terms',
    nullif(p_invoice->>'memo', ''),
    (p_invoice->>'subtotalCents')::integer,
    (p_invoice->>'taxTotalCents')::integer,
    v_total,
    v_deposit_applied,
    v_balance,
    p_invoice->>'idempotencyKey',
    coalesce(p_invoice->'glLines', '[]'::jsonb)
  ) returning id into v_invoice_id;

  for v_line in select * from jsonb_array_elements(p_invoice->'lines') loop
    insert into invoice_line_items (
      invoice_id, description, amount_cents, quantity, sort_order, product_id,
      sales_order_line_id, billing_event_id, unit_price_cents, tax_cents, taxable,
      revenue_treatment, deferred, rev_rec_start, rev_rec_end
    ) values (
      v_invoice_id,
      v_line->>'description',
      (v_line->>'amountCents')::integer,
      coalesce((v_line->>'quantity')::numeric, 1),
      v_sort,
      (v_line->>'productId')::uuid,
      (v_line->>'salesOrderLineId')::uuid,
      (v_line->>'billingEventId')::uuid,
      (v_line->>'unitPriceCents')::integer,
      coalesce((v_line->>'taxCents')::integer, 0),
      coalesce((v_line->>'taxable')::boolean, false),
      coalesce(v_line->>'revenueTreatment', 'point_in_time'),
      coalesce((v_line->>'deferred')::boolean, false),
      (v_line->>'revRecStart')::date,
      (v_line->>'revRecEnd')::date
    ) returning id into v_line_item_id;
    v_sort := v_sort + 1;

    for v_rev in select * from jsonb_array_elements(coalesce(v_line->'revRec', '[]'::jsonb)) loop
      insert into rev_rec_entries (invoice_line_item_id, recognize_on, amount_cents)
      values (v_line_item_id, (v_rev->>'recognizeOn')::date, (v_rev->>'amountCents')::integer);
    end loop;

    if v_line->>'billingEventId' is not null then
      update billing_events set status = 'billed'
      where id = (v_line->>'billingEventId')::uuid and status = 'pending' and bill_date is not null;
      if not found then
        raise exception 'Billing event % was already billed or is not due — refresh and try again', v_line->>'billingEventId';
      end if;
    end if;

    if v_line->>'salesOrderLineId' is not null then
      update sales_order_lines
      set amount_billed_cents = amount_billed_cents + (v_line->>'amountCents')::integer,
          quantity_billed = quantity_billed + coalesce((v_line->>'addQuantityBilled')::numeric, 0)
      where id = (v_line->>'salesOrderLineId')::uuid
        and sales_order_id = v_order_id
        and (v_line->>'expectedQuantityBilled' is null
             or quantity_billed = (v_line->>'expectedQuantityBilled')::numeric);
      if not found then
        raise exception 'Sales order line % changed since this invoice was prepared — refresh and try again', v_line->>'salesOrderLineId';
      end if;
    end if;
  end loop;

  for v_app in select * from jsonb_array_elements(coalesce(p_invoice->'depositApplications', '[]'::jsonb)) loop
    update customer_deposits
    set amount_applied_cents = amount_applied_cents + (v_app->>'amountCents')::integer
    where id = (v_app->>'depositId')::uuid
      and customer_id = v_customer_id
      and amount_cents - amount_applied_cents - amount_refunded_cents >= (v_app->>'amountCents')::integer;
    if not found then
      raise exception 'Deposit % no longer has enough unapplied balance — refresh and try again', v_app->>'depositId';
    end if;
    insert into deposit_applications (customer_deposit_id, invoice_id, amount_cents)
    values ((v_app->>'depositId')::uuid, v_invoice_id, (v_app->>'amountCents')::integer);
  end loop;

  return v_invoice_id;
end;
$$;

-- Records a customer payment and its applications to open invoices.
-- p_payment: { idempotencyKey, customerId, receivedOn, amountCents, method,
--   reference, stripePayoutId, applications: [{ invoiceId, amountCents }] }
create or replace function o2c_record_payment(p_payment jsonb)
returns uuid
language plpgsql
as $$
declare
  v_existing uuid;
  v_payment_id uuid;
  v_customer_id uuid := (p_payment->>'customerId')::uuid;
  v_amount integer := (p_payment->>'amountCents')::integer;
  v_applied integer := 0;
  v_app jsonb;
begin
  select id into v_existing from customer_payments where idempotency_key = p_payment->>'idempotencyKey';
  if found then return v_existing; end if;

  select coalesce(sum((a->>'amountCents')::integer), 0) into v_applied
  from jsonb_array_elements(coalesce(p_payment->'applications', '[]'::jsonb)) a;
  if v_applied > v_amount then raise exception 'Applications exceed the payment amount'; end if;

  insert into customer_payments (
    customer_id, received_on, amount_cents, unapplied_cents, method, reference, stripe_payout_id, idempotency_key
  ) values (
    v_customer_id,
    (p_payment->>'receivedOn')::date,
    v_amount,
    v_amount - v_applied,
    p_payment->>'method',
    nullif(p_payment->>'reference', ''),
    nullif(p_payment->>'stripePayoutId', ''),
    p_payment->>'idempotencyKey'
  ) returning id into v_payment_id;

  for v_app in select * from jsonb_array_elements(coalesce(p_payment->'applications', '[]'::jsonb)) loop
    update invoices
    set balance_cents = balance_cents - (v_app->>'amountCents')::integer,
        status = case
          when balance_cents - (v_app->>'amountCents')::integer = 0 then 'paid'
          else 'partially_paid'
        end
    where id = (v_app->>'invoiceId')::uuid
      and customer_id = v_customer_id
      and status in ('open', 'partially_paid')
      and balance_cents >= (v_app->>'amountCents')::integer;
    if not found then
      raise exception 'Invoice % is no longer open for that amount — refresh and try again', v_app->>'invoiceId';
    end if;
    insert into payment_applications (customer_payment_id, invoice_id, amount_cents)
    values (v_payment_id, (v_app->>'invoiceId')::uuid, (v_app->>'amountCents')::integer);
  end loop;

  return v_payment_id;
end;
$$;

-- Refunds the unused portion of a customer deposit.
create or replace function o2c_refund_deposit(p_deposit_id uuid, p_amount_cents integer)
returns void
language plpgsql
as $$
begin
  if p_amount_cents <= 0 then raise exception 'Refund amount must be positive'; end if;
  update customer_deposits
  set amount_refunded_cents = amount_refunded_cents + p_amount_cents
  where id = p_deposit_id
    and amount_cents - amount_applied_cents - amount_refunded_cents >= p_amount_cents;
  if not found then raise exception 'Refund exceeds the unused deposit balance'; end if;
end;
$$;

-- Groups undeposited receipts into one bank deposit. The amount is summed
-- from the claimed rows, and a receipt already in another deposit fails
-- the whole call.
-- p_deposit: { depositDate, source, reference, stripePayoutId,
--   paymentIds: [uuid], depositIds: [uuid] }
create or replace function o2c_create_bank_deposit(p_deposit jsonb)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
  v_payment_ids uuid[] := array(select jsonb_array_elements_text(coalesce(p_deposit->'paymentIds', '[]'::jsonb))::uuid);
  v_deposit_ids uuid[] := array(select jsonb_array_elements_text(coalesce(p_deposit->'depositIds', '[]'::jsonb))::uuid);
  v_claimed_payments integer;
  v_claimed_deposits integer;
  v_amount integer;
begin
  if cardinality(v_payment_ids) + cardinality(v_deposit_ids) = 0 then
    raise exception 'Pick at least one receipt';
  end if;

  insert into bank_deposits (id, deposit_date, amount_cents, source, stripe_payout_id, reference)
  values (
    v_id,
    (p_deposit->>'depositDate')::date,
    0,
    coalesce(p_deposit->>'source', 'individual'),
    nullif(p_deposit->>'stripePayoutId', ''),
    nullif(p_deposit->>'reference', '')
  );

  update customer_payments set bank_deposit_id = v_id
  where id = any (v_payment_ids) and bank_deposit_id is null;
  get diagnostics v_claimed_payments = row_count;

  update customer_deposits set bank_deposit_id = v_id
  where id = any (v_deposit_ids) and bank_deposit_id is null;
  get diagnostics v_claimed_deposits = row_count;

  if v_claimed_payments <> cardinality(v_payment_ids) or v_claimed_deposits <> cardinality(v_deposit_ids) then
    raise exception 'Some receipts are already in a bank deposit — refresh and try again';
  end if;

  select coalesce((select sum(amount_cents) from customer_payments where bank_deposit_id = v_id), 0)
       + coalesce((select sum(amount_cents) from customer_deposits where bank_deposit_id = v_id), 0)
  into v_amount;
  update bank_deposits set amount_cents = v_amount where id = v_id;

  return v_id;
end;
$$;

-- Matches a statement line to a bank deposit (amounts must agree exactly).
create or replace function o2c_match_statement_line(p_line_id uuid, p_bank_deposit_id uuid, p_rule text)
returns void
language plpgsql
as $$
declare
  v_line bank_statement_lines%rowtype;
  v_deposit bank_deposits%rowtype;
begin
  select * into v_line from bank_statement_lines where id = p_line_id for update;
  select * into v_deposit from bank_deposits where id = p_bank_deposit_id for update;
  if v_line.id is null or v_deposit.id is null then raise exception 'Statement line or deposit not found'; end if;
  if v_line.status <> 'unmatched' then raise exception 'Statement line is already %', v_line.status; end if;
  if exists (select 1 from bank_statement_lines where bank_deposit_id = p_bank_deposit_id) then
    raise exception 'Deposit is already matched';
  end if;
  if v_line.amount_cents <> v_deposit.amount_cents then
    raise exception 'Amounts differ; a bank deposit must match its statement line exactly';
  end if;
  update bank_statement_lines
  set status = 'matched', bank_deposit_id = p_bank_deposit_id, match_rule = p_rule, matched_at = now()
  where id = p_line_id;
end;
$$;

-- Creates a contract, its items and (optionally) its billing sales order in
-- one transaction. Ids are generated by the caller so the order's lines can
-- reference contract items.
-- p_contract: { id, customerId, startDate, endDate, terms, status, autoRenew,
--   renewalTermMonths, upliftPercent, renewalLeadDays, renewedFromId,
--   items: [{ id, productId, description, quantity, unitPriceCents,
--     frequencyMonths, timing, startDate, endDate, revenueTreatment }] }
-- p_order: same shape as o2c_create_sales_order, or null.
create or replace function o2c_create_contract(p_contract jsonb, p_order jsonb)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := (p_contract->>'id')::uuid;
  v_number text;
  v_item jsonb;
begin
  insert into contracts (
    id, customer_id, start_date, end_date, terms, status, auto_renew,
    renewal_term_months, uplift_percent, renewal_lead_days, renewed_from_id
  ) values (
    v_id,
    (p_contract->>'customerId')::uuid,
    (p_contract->>'startDate')::date,
    (p_contract->>'endDate')::date,
    coalesce(p_contract->>'terms', 'Net 30'),
    coalesce(p_contract->>'status', 'draft'),
    coalesce((p_contract->>'autoRenew')::boolean, true),
    coalesce((p_contract->>'renewalTermMonths')::integer, 12),
    coalesce((p_contract->>'upliftPercent')::numeric, 0),
    coalesce((p_contract->>'renewalLeadDays')::integer, 30),
    (p_contract->>'renewedFromId')::uuid
  ) returning contract_number into v_number;

  for v_item in select * from jsonb_array_elements(p_contract->'items') loop
    insert into contract_items (
      id, contract_id, product_id, description, quantity, unit_price_cents,
      frequency_months, timing, start_date, end_date, revenue_treatment
    ) values (
      (v_item->>'id')::uuid,
      v_id,
      (v_item->>'productId')::uuid,
      v_item->>'description',
      (v_item->>'quantity')::numeric,
      (v_item->>'unitPriceCents')::integer,
      (v_item->>'frequencyMonths')::integer,
      coalesce(v_item->>'timing', 'advance'),
      (v_item->>'startDate')::date,
      (v_item->>'endDate')::date,
      coalesce(v_item->>'revenueTreatment', 'ratable')
    );
  end loop;

  if p_order is not null and jsonb_typeof(p_order) = 'object' then
    perform o2c_create_sales_order(
      p_order || jsonb_build_object('contractId', v_id, 'memo', 'Contract ' || v_number)
    );
  end if;

  return v_id;
end;
$$;

-- Ends a contract early: billing for periods starting after the effective
-- date is cancelled. Credit for an already-billed period is a business
-- decision and isn't issued automatically.
create or replace function o2c_terminate_contract(p_contract_id uuid, p_effective date)
returns void
language plpgsql
as $$
begin
  update contracts set status = 'terminated', auto_renew = false, terminated_on = p_effective
  where id = p_contract_id and status in ('draft', 'active');
  if not found then raise exception 'Only a draft or active contract can be terminated'; end if;

  update billing_events set status = 'cancelled'
  where status = 'pending'
    and period_start > p_effective
    and sales_order_line_id in (
      select l.id from sales_order_lines l
      join sales_orders o on o.id = l.sales_order_id
      where o.contract_id = p_contract_id
    );
end;
$$;
