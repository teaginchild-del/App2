import { beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * End-to-end order-to-cash run through the real API modules and o2c_*
 * database functions. Needs a PostgREST in front of a database with
 * supabase/migrations applied and an `anon` role, e.g.
 *
 *   O2C_TEST_POSTGREST_URL=http://localhost:3000 npm test
 *
 * Skipped when the variable is unset.
 */
const url = import.meta.env.O2C_TEST_POSTGREST_URL as string | undefined

vi.mock('@/lib/supabase', async () => {
  const { PostgrestClient } = await import('@supabase/postgrest-js')
  return { supabase: new PostgrestClient(import.meta.env.O2C_TEST_POSTGREST_URL ?? 'http://localhost:0') }
})

describe.skipIf(!url)('order-to-cash against Postgres', () => {
  let api: {
    billing: typeof import('@/lib/api/billing')
    so: typeof import('@/lib/api/sales-orders')
    inv: typeof import('@/lib/api/invoicing')
    cash: typeof import('@/lib/api/cash')
    bank: typeof import('@/lib/api/banking')
    ar: typeof import('@/lib/api/receivables')
    ct: typeof import('@/lib/api/contracts')
    db: (typeof import('@/lib/supabase'))['supabase']
  }
  let customerId: string

  beforeAll(async () => {
    api = {
      billing: await import('@/lib/api/billing'),
      so: await import('@/lib/api/sales-orders'),
      inv: await import('@/lib/api/invoicing'),
      cash: await import('@/lib/api/cash'),
      bank: await import('@/lib/api/banking'),
      ar: await import('@/lib/api/receivables'),
      ct: await import('@/lib/api/contracts'),
      db: (await import('@/lib/supabase')).supabase,
    }
    const customer = await api.billing.createCustomer({
      companyName: `O2C Test ${crypto.randomUUID().slice(0, 8)}`,
      email: 'ap@example.com',
    })
    customerId = customer.id
  })

  const customerInvoices = async () => (await api.inv.listInvoices({ customerId })).reverse()

  it('runs a sales order from approval through billing, payment, bank deposit and reconciliation', async () => {
    const { so, inv, cash, bank, ar } = api
    const orderId = await so.createSalesOrder({
      customerId,
      orderDate: '2026-09-01',
      terms: 'Net 30',
      requiresApproval: true,
      depositRequestedCents: 100000,
      lines: [
        {
          productId: null,
          description: 'Widget',
          itemKind: 'inventory',
          quantity: 3,
          unitPriceCents: 33333,
          taxable: true,
          taxRatePercent: 8.25,
          revenueTreatment: 'point_in_time',
        },
        {
          productId: null,
          description: 'Implementation',
          itemKind: 'service',
          quantity: 1,
          unitPriceCents: 500000,
          taxable: false,
          taxRatePercent: 0,
          revenueTreatment: 'point_in_time',
          billingSchedule: {
            type: 'milestones',
            milestones: [
              { name: 'Kickoff', percent: 30 },
              { name: 'Go-live', percent: 70 },
            ],
          },
        },
        {
          productId: null,
          description: 'Support',
          itemKind: 'service',
          quantity: 1,
          unitPriceCents: 10000,
          taxable: false,
          taxRatePercent: 0,
          revenueTreatment: 'ratable',
          billingSchedule: {
            type: 'recurring',
            frequencyMonths: 1,
            timing: 'advance',
            serviceStart: '2026-09-01',
            serviceEnd: '2027-08-31',
            amountPerPeriod: 10000,
          },
        },
      ],
    })

    let order = await so.getSalesOrder(orderId)
    expect(order.status).toBe('pending_approval')
    expect(order.lines[2].amountCents).toBe(120000)
    expect(order.lines[2].billingEvents).toHaveLength(12)
    await expect(inv.billSalesOrder(orderId, { asOf: '2026-09-15' })).rejects.toThrow(/pending approval/)

    await so.approveSalesOrder(orderId)
    await cash.recordCustomerDeposit({
      customerId,
      salesOrderId: orderId,
      amountCents: 100000,
      method: 'check',
      receivedOn: '2026-09-02',
      reference: '1001',
    })
    order = await so.getSalesOrder(orderId)
    await so.recordFulfillment(order, {
      fulfilledOn: '2026-09-05',
      lines: [{ lineId: order.lines[0].id, quantity: 2 }],
    })
    await expect(
      so.recordFulfillment(order, { fulfilledOn: '2026-09-05', lines: [{ lineId: order.lines[0].id, quantity: 2 }] }),
    ).rejects.toThrow()
    const kickoff = order.lines[1].billingEvents[0]
    await so.completeMilestone(kickoff, '2026-09-10')
    await expect(so.completeMilestone(kickoff, '2026-09-10')).rejects.toThrow(/already/)

    const firstId = await inv.billSalesOrder(orderId, { asOf: '2026-09-15' })
    const first = await inv.getInvoice(firstId)
    // 2 widgets 66666 + tax 5500 · kickoff 150000 · September support 10000
    expect(first.lineItems.map((l) => l.amountCents)).toEqual([66666, 150000, 10000])
    expect(first.taxTotalCents).toBe(5500)
    expect(first.totalCents).toBe(232166)
    expect(first.depositAppliedCents).toBe(100000)
    expect(first.balanceCents).toBe(132166)
    expect(first.dueDate).toBe('2026-10-15')
    expect(first.status).toBe('open')
    const debits = first.glLines.reduce((a, g) => a + g.debit, 0)
    expect(debits).toBe(first.glLines.reduce((a, g) => a + g.credit, 0))

    order = await so.getSalesOrder(orderId)
    expect(order.status).toBe('partially_billed')
    expect(order.lines[0].quantityBilled).toBe(2)
    await expect(inv.billSalesOrder(orderId, { asOf: '2026-09-15' })).rejects.toThrow(/Nothing is billable/)

    // Two concurrent bill-now clicks for the last widget produce one invoice.
    await so.recordFulfillment(order, {
      fulfilledOn: '2026-09-20',
      lines: [{ lineId: order.lines[0].id, quantity: 1 }],
    })
    const [a, b] = await Promise.allSettled([
      inv.billSalesOrder(orderId, { asOf: '2026-09-20' }),
      inv.billSalesOrder(orderId, { asOf: '2026-09-20' }),
    ])
    const ids = [a, b].filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<string>).value)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(1)
    order = await so.getSalesOrder(orderId)
    expect(order.lines[0].amountBilledCents).toBe(99999) // final bill takes the remainder
    expect((await customerInvoices()).length).toBe(2)

    // Cancelling a billed order is refused; closing cancels the remaining schedule.
    await expect(so.cancelSalesOrder(orderId)).rejects.toThrow(/close it instead/)

    // One check pays the oldest invoice in full and part of the next.
    const invoices = await customerInvoices()
    const second = invoices[1]
    await cash.receiveCustomerPayment({
      idempotencyKey: `test:${crypto.randomUUID()}`,
      customerId,
      amountCents: 132166 + 10000,
      method: 'check',
      receivedOn: '2026-09-02',
      reference: '5521',
    })
    expect((await inv.getInvoice(first.id)).status).toBe('paid')
    const secondAfter = await inv.getInvoice(second.id)
    expect(secondAfter.balanceCents).toBe(second.balanceCents - 10000)
    expect(secondAfter.status).toBe('partially_paid')

    // Explicit application larger than the balance is refused by the engine.
    await expect(
      cash.receiveCustomerPayment({
        idempotencyKey: `test:${crypto.randomUUID()}`,
        customerId,
        amountCents: 999999,
        method: 'ach',
        receivedOn: '2026-09-03',
        applications: [{ invoiceId: second.id, amountCents: 999999 }],
      }),
    ).rejects.toThrow(/exceeds invoice/)

    // Idempotent payment: the same key records once.
    const key = `test:${crypto.randomUUID()}`
    const p1 = await cash.receiveCustomerPayment({
      idempotencyKey: key,
      customerId,
      amountCents: 500,
      method: 'wire',
      receivedOn: '2026-09-04',
    })
    const p2 = await cash.receiveCustomerPayment({
      idempotencyKey: key,
      customerId,
      amountCents: 500,
      method: 'wire',
      receivedOn: '2026-09-04',
    })
    expect(p1).toBe(p2)

    // Deposit is fully applied, so it can't be refunded.
    const [deposit] = await cash.listDeposits({ salesOrderId: orderId })
    expect(deposit.status).toBe('fully_applied')
    await expect(cash.refundCustomerDeposit(deposit, 100)).rejects.toThrow(/exceeds unused/)

    // The day's checks (deposit 1001 + payment 5521) go to the bank together.
    const receipts = (await bank.listUndepositedReceipts()).filter(
      (r) => r.reference === '1001' || r.reference === '5521',
    )
    const proposals = bank.proposeDeposits(receipts)
    expect(proposals).toHaveLength(1)
    expect(proposals[0].source).toBe('check_batch')
    const bankDepositId = await bank.createBankDeposit(receipts)
    await expect(bank.createBankDeposit(receipts)).rejects.toThrow(/already in a bank deposit/)
    const bd = (await bank.listBankDeposits()).find((d) => d.id === bankDepositId)!
    expect(bd.amountCents).toBe(100000 + 142166)

    // Statement import (re-import is a no-op), then auto-reconcile.
    const csv = `Date,Description,Amount,ID\n2026-09-03,BRANCH DEPOSIT,${(bd.amountCents / 100).toFixed(2)},${bankDepositId}\n2026-09-04,SERVICE FEE,-12.00,fee-${bankDepositId}\n`
    expect((await bank.importStatementCsv(csv)).imported).toBe(2)
    expect((await bank.importStatementCsv(csv)).imported).toBe(0)
    await bank.autoReconcile()
    const lines = (await bank.listStatementLines()).filter((l) => l.externalId.endsWith(bankDepositId))
    const credit = lines.find((l) => l.amountCents > 0)!
    expect(credit.status).toBe('matched')
    expect(credit.bankDepositId).toBe(bankDepositId)
    await bank.ignoreStatementLine(lines.find((l) => l.amountCents < 0)!.id)

    // Close stops billing: remaining events are cancelled.
    await so.closeSalesOrder(orderId)
    order = await so.getSalesOrder(orderId)
    expect(order.status).toBe('closed')
    expect(order.lines[2].billingEvents.filter((e) => e.status === 'pending')).toHaveLength(0)

    // Aging sees the open balance; dunning queues once per level.
    const secondNow = await inv.getInvoice(second.id)
    expect(secondNow.balanceCents).toBe(secondAfter.balanceCents - 500) // the $5 wire auto-applied
    const aging = await ar.getAgingReport('2026-12-31')
    expect(aging.byCustomer.find((c) => c.customerId === customerId)?.totals['61-90']).toBe(secondNow.balanceCents)
    const statement = await ar.getStatement(customerId, '2026-12-31')
    expect(statement.amountDue).toBe(secondNow.balanceCents)
    const firstRun = await ar.runDunning('2026-12-31')
    expect(firstRun.queued).toBeGreaterThanOrEqual(1)
    const notices = (await ar.listDunningNotices()).filter((n) => n.invoiceId === second.id)
    expect(notices.map((n) => n.level)).toEqual([4])
    await ar.runDunning('2026-12-31')
    expect((await ar.listDunningNotices()).filter((n) => n.invoiceId === second.id)).toHaveLength(1)
  })

  it('bills standalone ratable invoices, defers revenue and recognizes it', async () => {
    const { inv, cash, ar } = api
    await cash.recordCustomerDeposit({ customerId, amountCents: 20000, method: 'ach', receivedOn: '2026-01-02' })
    const [unlinked] = (await cash.listDeposits()).filter((d) => d.customerId === customerId && !d.salesOrderId)
    await cash.refundCustomerDeposit(unlinked, 5000)
    await expect(cash.refundCustomerDeposit({ ...unlinked, amountRefundedCents: 0 }, 20000)).rejects.toThrow(/exceeds/)

    const key = crypto.randomUUID()
    const input = {
      idempotencyKey: key,
      customerId,
      invoiceDate: '2026-01-15',
      terms: '2% 10 Net 30',
      applyUnlinkedDeposits: true,
      lines: [
        {
          productId: null,
          description: 'Annual license',
          quantity: 1,
          unitPriceCents: 120000,
          taxable: false,
          taxRatePercent: 0,
          revenueTreatment: 'ratable' as const,
          revRecStart: '2026-01-15',
          revRecEnd: '2027-01-14',
        },
      ],
    }
    const id = await inv.createStandaloneInvoice(input)
    expect(await inv.createStandaloneInvoice(input)).toBe(id)
    const invoice = await inv.getInvoice(id)
    expect(invoice.depositAppliedCents).toBe(15000)
    expect(invoice.balanceCents).toBe(105000)
    expect(invoice.lineItems[0].deferred).toBe(true)
    expect(invoice.glLines.find((g) => g.account === 'deferred_revenue')?.credit).toBe(120000)

    const activity = await inv.getInvoiceActivity(invoice)
    expect(activity.revRec).toHaveLength(13)
    expect(activity.revRec.reduce((a, r) => a + r.amountCents, 0)).toBe(120000)

    const recognized = await ar.recognizeRevenue('2026-03-31')
    expect(recognized.entries).toBeGreaterThanOrEqual(3)
    const after = await inv.getInvoiceActivity(invoice)
    expect(after.revRec.filter((r) => r.recognizedAt).map((r) => r.recognizeOn)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ])
    expect((await ar.recognizeRevenue('2026-03-31')).entries).toBe(0)
  })

  it('issues a subscription draft invoice with a due date from terms', async () => {
    const { inv, db } = api
    const { data, error } = await db
      .from('invoices')
      .insert({
        customer_id: customerId,
        status: 'draft',
        amount_due_cents: 29900,
        issue_date: '2026-09-01',
        due_date: '2026-09-01',
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    await db
      .from('invoice_line_items')
      .insert({ invoice_id: data!.id, description: 'Ledger Pro', amount_cents: 29900, quantity: 1 })
    const draft = await inv.getInvoice(data!.id as string)
    await inv.issueDraftInvoice(draft, 'Net 15')
    const issued = await inv.getInvoice(draft.id)
    expect(issued.status).toBe('open')
    expect(issued.dueDate).toBe('2026-09-16')
    expect(issued.balanceCents).toBe(29900)
    await expect(inv.issueDraftInvoice(draft, 'Net 15')).rejects.toThrow(/already issued/)
  })

  it('bills contracts on schedule and renews them with an uplift', async () => {
    const { ct, so, inv } = api
    const contractId = await ct.createContract(
      {
        customerId,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        terms: 'Net 30',
        autoRenew: true,
        renewalTermMonths: 12,
        upliftPercent: 5,
        renewalLeadDays: 30,
        items: [
          {
            productId: null,
            description: 'Seats',
            quantity: 10,
            unitPriceCents: 2500,
            frequencyMonths: 1,
            timing: 'advance',
            revenueTreatment: 'ratable',
          },
        ],
      },
      { activate: true },
    )
    const contract = await ct.getContract(contractId)
    expect(contract.status).toBe('active')
    const { salesOrderId } = await ct.getContractLinks(contractId)
    const order = await so.getSalesOrder(salesOrderId!)
    expect(order.memo).toBe(`Contract ${contract.contractNumber}`)
    expect(order.status).toBe('pending_billing')
    expect(order.lines[0].billingEvents.every((e) => e.amountCents === 25000)).toBe(true)

    const run = await inv.runScheduledBilling('2026-03-15')
    expect(run.failed.filter((f) => f.orderNumber === order.orderNumber)).toEqual([])
    const [billed] = await inv.listInvoices({ salesOrderId: order.id })
    expect(billed.lineItems.map((l) => l.amountCents)).toEqual([25000, 25000, 25000])

    // Renewal inside the lead window: draft contract + order awaiting approval.
    await ct.runContractRenewals('2026-12-05')
    const { renewedToId } = await ct.getContractLinks(contractId)
    expect(renewedToId).toBeTruthy()
    const renewal = await ct.getContract(renewedToId!)
    expect(renewal.status).toBe('draft')
    expect(renewal.startDate).toBe('2027-01-01')
    expect(renewal.items[0].unitPriceCents).toBe(2625)
    await ct.runContractRenewals('2026-12-06')
    expect((await ct.listContracts()).filter((c) => c.renewedFromId === contractId)).toHaveLength(1)

    const renewalOrder = await so.getSalesOrder((await ct.getContractLinks(renewal.id)).salesOrderId!)
    expect(renewalOrder.status).toBe('pending_approval')
    await so.approveSalesOrder(renewalOrder.id)
    expect((await ct.getContract(renewal.id)).status).toBe('active')

    await ct.runContractRenewals('2027-01-02')
    expect((await ct.getContract(contractId)).status).toBe('renewed')

    await ct.terminateContract(renewal.id, '2027-06-30')
    const terminatedOrder = await so.getSalesOrder(renewalOrder.id)
    const pending = terminatedOrder.lines[0].billingEvents.filter((e) => e.status === 'pending')
    expect(pending.every((e) => (e.periodStart ?? '') <= '2027-06-30')).toBe(true)
    expect((await ct.getContract(renewal.id)).status).toBe('terminated')
  })
})
