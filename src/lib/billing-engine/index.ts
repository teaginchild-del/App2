/**
 * Billing engine core: pure, I/O-free order-to-cash logic modeled on
 * NetSuite (sales order → fulfillment → invoice → payment/deposit → bank
 * deposit → reconciliation, plus contracts and revenue recognition).
 * Persistence lives in src/lib/api (Supabase), with the multi-row writes
 * done atomically by the o2c_* database functions in
 * supabase/migrations/0005_order_to_cash.sql.
 */
export * from './money'
export * from './dates'
export * from './payment-terms'
export * from './sales-order'
export * from './billing-schedule'
export * from './revenue-recognition'
export * from './cash-application'
export * from './invoice-builder'
export * from './receivables'
export * from './bank-reconciliation'
export * from './contracts'
