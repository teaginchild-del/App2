-- Seed data for the billing module: a handful of customers (matching the
-- company names already shown in the mock Customers view, so the wizard's
-- customer picker feels continuous with the rest of the app), a small
-- product catalog with price points and components, and a couple of coupons.
--
-- Safe to run once against a fresh database. Re-running will duplicate rows
-- (no unique constraints on name), so guard with `where not exists` checks
-- if you need idempotency.

insert into customers
  (customer_number, company_name, industry, website, contact_name, contact_title, email, phone, status, lifecycle_stage, owner, billing_cycle, currency, payment_method, address_line1, address_city, address_state, address_postal_code, address_country)
values
  ('CUST-1000', 'Northwind Traders', 'Software', 'www.northwindtraders.com', 'Jordan Bennett', 'CFO', 'jordan.bennett@northwindtraders.com', '(415) 555-0110', 'active', 'customer', 'Sam Whitfield', 'monthly', 'USD', 'credit_card', '482 Market St', 'San Francisco', 'CA', '94105', 'USA'),
  ('CUST-1001', 'Acme Fintech', 'Financial Services', 'www.acmefintech.com', 'Casey Cruz', 'Controller', 'casey.cruz@acmefintech.com', '(212) 555-0142', 'active', 'customer', 'Priya Ramaswamy', 'annual', 'USD', 'ach', '901 Commerce Ave', 'New York', 'NY', '10004', 'USA'),
  ('CUST-1002', 'Bluepeak Logistics', 'Logistics', 'www.bluepeaklogistics.com', 'Morgan Diaz', 'VP Finance', 'morgan.diaz@bluepeaklogistics.com', '(512) 555-0176', 'trial', 'opportunity', 'Marcus Lee', 'monthly', 'USD', 'invoice', '220 Industrial Pkwy', 'Austin', 'TX', '73301', 'USA'),
  ('CUST-1003', 'Cascade Robotics', 'Manufacturing', 'www.cascaderobotics.com', 'Riley Ellis', 'Owner', 'riley.ellis@cascaderobotics.com', '(206) 555-0198', 'active', 'customer', 'Dana Okafor', 'monthly', 'USD', 'wire', '1330 Harbor Rd', 'Seattle', 'WA', '98101', 'USA'),
  ('CUST-1004', 'Delta Analytics', 'Software', 'www.deltaanalytics.com', 'Taylor Foster', 'COO', 'taylor.foster@deltaanalytics.com', '(312) 555-0113', 'past_due', 'customer', 'Sam Whitfield', 'monthly', 'USD', 'credit_card', '77 Innovation Dr', 'Chicago', 'IL', '60601', 'USA'),
  ('CUST-1005', 'Everline Media', 'Media', 'www.everlinemedia.com', 'Avery Grant', 'Director of Operations', 'avery.grant@everlinemedia.com', '(617) 555-0164', 'active', 'customer', 'Elena Vasquez', 'annual', 'USD', 'credit_card', '55 Main St', 'Boston', 'MA', '02108', 'USA'),
  ('CUST-1006', 'Fjord Health', 'Healthcare', 'www.fjordhealth.com', 'Cameron Hayes', 'CEO', 'cameron.hayes@fjordhealth.com', '(720) 555-0187', 'active', 'customer', 'Marcus Lee', 'monthly', 'USD', 'ach', '640 Commerce Ave', 'Denver', 'CO', '80202', 'USA'),
  ('CUST-1007', 'Granite Payments', 'Financial Services', 'www.granitepayments.com', 'Drew Ibarra', 'CFO', 'drew.ibarra@granitepayments.com', '(404) 555-0129', 'active', 'customer', 'Priya Ramaswamy', 'monthly', 'USD', 'wire', '18 Market St', 'Atlanta', 'GA', '30303', 'USA');

with p as (
  insert into products (name, description, base_price_cents, billing_interval, accounting_code, is_active)
  values ('Ledger Pro', 'Core accounting and reconciliation platform.', 29900, 'monthly', 'REV-LEDGER', true)
  returning id
)
insert into product_price_points (product_id, name, price_cents, billing_interval, is_default)
select id, v.name, v.price_cents, v.billing_interval, v.is_default
from p, (values
  ('Monthly', 29900, 'monthly', true),
  ('Annual', 299000, 'annual', false),
  ('Annual (Discounted)', 249000, 'annual', false)
) as v(name, price_cents, billing_interval, is_default);

with p as (
  insert into products (name, description, base_price_cents, billing_interval, accounting_code, is_active)
  values ('Payables Suite', 'Automated vendor bill pay and approvals.', 19900, 'monthly', 'REV-PAYABLES', true)
  returning id
)
insert into product_price_points (product_id, name, price_cents, billing_interval, is_default)
select id, v.name, v.price_cents, v.billing_interval, v.is_default
from p, (values
  ('Monthly', 19900, 'monthly', true),
  ('Annual', 199000, 'annual', false)
) as v(name, price_cents, billing_interval, is_default);

insert into products (name, description, base_price_cents, billing_interval, accounting_code, is_active)
values ('Onboarding Package', 'One-time implementation and data migration.', 250000, 'one_time', 'REV-SERVICES', true);

insert into components (product_id, name, pricing_scheme, unit_name, price_cents)
select id, 'Additional Seat', 'per_unit', 'seat', 1500 from products where name = 'Ledger Pro';

insert into components (product_id, name, pricing_scheme, unit_name, price_cents)
select id, 'API Overage', 'per_unit', '1,000 calls', 500 from products where name = 'Ledger Pro';

insert into components (product_id, name, pricing_scheme, unit_name, price_cents)
select id, 'Priority Support', 'flat', null, 9900 from products where name = 'Ledger Pro';

insert into components (product_id, name, pricing_scheme, unit_name, price_cents)
select id, 'Additional Approver Seat', 'per_unit', 'seat', 1200 from products where name = 'Payables Suite';

insert into coupons (name, discount_type, discount_value, duration, duration_in_periods, max_redemptions, expires_at, is_active)
values
  ('New Customer 20%', 'percent', 20, 'repeating', 3, 100, now() + interval '1 year', true),
  ('Annual Prepay $500', 'fixed', 50000, 'once', null, null, now() + interval '2 years', true),
  ('Partner Referral 10%', 'percent', 10, 'forever', null, 25, null, true);
