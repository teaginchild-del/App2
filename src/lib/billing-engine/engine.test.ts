import { describe, expect, it } from 'vitest'
import {
  allocate,
  addMonths,
  applyDeposits,
  applyPayment,
  agingReport,
  billableAmount,
  billableQuantity,
  buildInvoiceDraft,
  buildRenewal,
  buildStatement,
  contractItemSchedule,
  customerDepositStatus,
  deriveSalesOrderStatus,
  dueDateFor,
  earlyPaymentDiscount,
  isoDate,
  nextDunningLevel,
  parseStatementAmount,
  parseStatementCsv,
  parseTerms,
  planBillingEvents,
  proposeBankDeposits,
  ratableSchedule,
  reconcile,
  renewalDue,
  suggestReceiptsForLine,
  validateFulfillment,
  type SalesOrderLineState,
} from './index'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const dates = (xs: Array<Date | null | undefined>) => xs.map((x) => (x ? isoDate(x) : null))

describe('money', () => {
  it('allocates without losing cents', () => {
    expect(allocate(10000, [1, 1, 1])).toEqual([3334, 3333, 3333])
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33])
    expect(allocate(999, [50, 25, 25]).reduce((a, b) => a + b)).toBe(999)
  })
})

describe('dates and terms', () => {
  it('clamps month ends', () => {
    expect(isoDate(addMonths(d('2026-01-31'), 1))).toBe('2026-02-28')
  })
  it('computes due dates from terms', () => {
    expect(isoDate(dueDateFor(d('2026-09-15'), parseTerms('Net 30')))).toBe('2026-10-15')
    expect(isoDate(dueDateFor(d('2026-09-15'), parseTerms('EOM 15')))).toBe('2026-10-15')
    expect(isoDate(dueDateFor(d('2026-09-15'), parseTerms('Due on receipt')))).toBe('2026-09-15')
    expect(isoDate(dueDateFor(d('2026-01-15'), { type: 'day_of_next_month', dayOfMonth: 31 }))).toBe('2026-02-28')
  })
  it('applies early payment discount only inside the window', () => {
    const terms = parseTerms('2% 10 Net 30')
    expect(earlyPaymentDiscount(d('2026-09-01'), terms, 100000, d('2026-09-11'))).toBe(2000)
    expect(earlyPaymentDiscount(d('2026-09-01'), terms, 100000, d('2026-09-12'))).toBe(0)
  })
})

describe('sales order status', () => {
  const line = (over: Partial<SalesOrderLineState> = {}): SalesOrderLineState => ({
    id: 'l1',
    itemKind: 'inventory',
    quantity: 3,
    unitPrice: 3333,
    amount: 9999,
    quantityFulfilled: 0,
    quantityBilled: 0,
    amountBilled: 0,
    scheduled: false,
    ...over,
  })
  const order = (lines: SalesOrderLineState[], approved = true) => ({
    approved,
    cancelled: false,
    closed: false,
    lines,
  })

  it('moves through the lifecycle', () => {
    expect(deriveSalesOrderStatus(order([line()], false))).toBe('pending_approval')
    expect(deriveSalesOrderStatus(order([line()]))).toBe('pending_fulfillment')
    expect(deriveSalesOrderStatus(order([line({ quantityFulfilled: 1 })]))).toBe('pending_billing')
    expect(deriveSalesOrderStatus(order([line({ quantityFulfilled: 1, quantityBilled: 1, amountBilled: 3333 })]))).toBe(
      'partially_billed',
    )
    expect(deriveSalesOrderStatus(order([line({ quantityFulfilled: 3, quantityBilled: 3, amountBilled: 9999 })]))).toBe(
      'billed',
    )
  })

  it('services are billable without fulfillment', () => {
    expect(deriveSalesOrderStatus(order([line({ itemKind: 'service' })]))).toBe('pending_billing')
  })

  it('final partial bill takes the remaining amount', () => {
    const l = line({ unitPrice: 3333, amount: 10000, quantityFulfilled: 3, quantityBilled: 2, amountBilled: 6666 })
    expect(billableQuantity(l)).toBe(1)
    expect(billableAmount(l, 1)).toBe(3334)
  })

  it('rejects over-fulfillment', () => {
    expect(() => validateFulfillment(order([line({ quantityFulfilled: 2 })]), [{ lineId: 'l1', quantity: 2 }])).toThrow(
      /exceed/,
    )
  })
})

describe('billing schedules', () => {
  it('installments', () => {
    const ev = planBillingEvents(
      { type: 'installments', count: 3, intervalMonths: 1, firstBillDate: '2026-01-31' },
      10000,
    )
    expect(ev.map((e) => e.amount)).toEqual([3334, 3333, 3333])
    expect(dates(ev.map((e) => e.billDate))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it('milestones must total 100%', () => {
    expect(() => planBillingEvents({ type: 'milestones', milestones: [{ name: 'a', percent: 40 }] }, 100)).toThrow()
    const ev = planBillingEvents(
      {
        type: 'milestones',
        milestones: [
          { name: 'Kickoff', percent: 30 },
          { name: 'Go-live', percent: 70 },
        ],
      },
      50000,
    )
    expect(ev.map((e) => [e.milestoneName, e.amount, e.billDate])).toEqual([
      ['Kickoff', 15000, null],
      ['Go-live', 35000, null],
    ])
  })

  it('monthly in advance vs in arrears, with a prorated stub', () => {
    const base = {
      type: 'recurring' as const,
      frequencyMonths: 1 as const,
      serviceStart: '2026-01-01',
      serviceEnd: '2026-03-15',
      amountPerPeriod: 31000,
    }
    const adv = planBillingEvents({ ...base, timing: 'advance' }, 0)
    const arr = planBillingEvents({ ...base, timing: 'arrears' }, 0)
    expect(dates(adv.map((e) => e.billDate))).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
    expect(dates(arr.map((e) => e.billDate))).toEqual(['2026-01-31', '2026-02-28', '2026-03-15'])
    expect(adv.map((e) => e.amount)).toEqual([31000, 31000, 15000])
  })
})

describe('revenue recognition', () => {
  it('spreads ratably by day and sums exactly', () => {
    const s = ratableSchedule(120000, d('2026-01-15'), d('2027-01-14'))
    expect(s).toHaveLength(13)
    expect(s.reduce((a, e) => a + e.amount, 0)).toBe(120000)
    expect(isoDate(s[0].recognizeOn)).toBe('2026-01-31')
  })
})

describe('invoice builder', () => {
  it("posts AR/revenue/deferred/tax and applies the order's deposit", () => {
    const draft = buildInvoiceDraft({
      invoiceDate: d('2026-09-01'),
      terms: parseTerms('Net 30'),
      salesOrderId: 'so1',
      lines: [
        {
          productId: null,
          description: 'Widget',
          amount: 100000,
          taxable: true,
          taxRatePercent: 8.25,
          revenueTreatment: 'point_in_time',
        },
        {
          productId: null,
          description: 'Support 12 mo',
          amount: 120000,
          taxable: false,
          taxRatePercent: 0,
          revenueTreatment: 'ratable',
          revRecStart: d('2026-09-01'),
          revRecEnd: d('2027-08-31'),
        },
      ],
      deposits: [
        { id: 'dep-other', remaining: 50000, salesOrderId: 'so2', receivedAt: d('2026-08-01') },
        { id: 'dep1', remaining: 110000, salesOrderId: 'so1', receivedAt: d('2026-08-15') },
      ],
    })
    expect(draft.taxTotal).toBe(8250)
    expect(draft.total).toBe(228250)
    expect(isoDate(draft.dueDate)).toBe('2026-10-01')
    expect(draft.depositApplications).toEqual([{ depositId: 'dep1', amount: 110000 }])
    expect(draft.balanceDue).toBe(118250)
    expect(draft.lines[1].deferred).toBe(true)
    expect(draft.lines[1].revRecSchedule).toHaveLength(12)
    const debits = draft.gl.reduce((a, g) => a + g.debit, 0)
    const credits = draft.gl.reduce((a, g) => a + g.credit, 0)
    expect(debits).toBe(credits)
  })

  it('does not defer a ratable line whose period is already over (arrears)', () => {
    const draft = buildInvoiceDraft({
      invoiceDate: d('2026-09-30'),
      terms: parseTerms('Net 15'),
      lines: [
        {
          productId: null,
          description: 'Sept service',
          amount: 5000,
          taxable: false,
          taxRatePercent: 0,
          revenueTreatment: 'ratable',
          revRecStart: d('2026-09-01'),
          revRecEnd: d('2026-09-30'),
        },
      ],
    })
    expect(draft.lines[0].deferred).toBe(false)
  })
})

describe('cash application', () => {
  const open = [
    { id: 'i2', balance: 5000, dueDate: d('2026-09-30'), invoiceDate: null },
    { id: 'i1', balance: 3000, dueDate: d('2026-08-31'), invoiceDate: null },
  ]
  it('auto-applies oldest first and leaves a partial open', () => {
    expect(applyPayment(6000, open)).toEqual({
      applications: [
        { invoiceId: 'i1', amount: 3000 },
        { invoiceId: 'i2', amount: 3000 },
      ],
      unapplied: 0,
    })
  })
  it('keeps overpayment as unapplied credit', () => {
    expect(applyPayment(9000, open).unapplied).toBe(1000)
  })
  it('validates explicit splits', () => {
    expect(() => applyPayment(1000, open, [{ invoiceId: 'i1', amount: 3001 }])).toThrow(/exceeds invoice/)
    expect(() => applyPayment(1000, open, [{ invoiceId: 'i1', amount: 2000 }])).toThrow(/exceeds payment/)
  })
  it('only uses unlinked deposits when asked', () => {
    const deps = [{ id: 'u', remaining: 500, salesOrderId: null, receivedAt: d('2026-01-01') }]
    expect(applyDeposits(1000, deps, 'so1')).toEqual([])
    expect(applyDeposits(1000, deps, 'so1', true)).toEqual([{ depositId: 'u', amount: 500 }])
  })
  it('deposit status', () => {
    expect(customerDepositStatus(1000, 0, 1000)).toBe('refunded')
    expect(customerDepositStatus(1000, 400, 0)).toBe('partially_applied')
    expect(customerDepositStatus(1000, 400, 600)).toBe('fully_applied')
  })
})

describe('receivables', () => {
  const invs = [
    {
      id: 'a',
      customerId: 'c1',
      docNumber: '1',
      invoiceDate: null,
      dueDate: d('2026-09-20'),
      total: 1000,
      balance: 1000,
    },
    {
      id: 'b',
      customerId: 'c1',
      docNumber: '2',
      invoiceDate: null,
      dueDate: d('2026-07-01'),
      total: 2000,
      balance: 500,
    },
    {
      id: 'c',
      customerId: 'c2',
      docNumber: '3',
      invoiceDate: null,
      dueDate: d('2026-10-10'),
      total: 700,
      balance: 700,
    },
  ]
  it('ages balances', () => {
    const r = agingReport(invs, d('2026-09-28'))
    expect(r.totals).toMatchObject({ current: 700, '1-30': 1000, '61-90': 500, total: 2200 })
  })
  it('builds a consolidated statement', () => {
    const s = buildStatement('c1', invs, d('2026-09-28'))
    expect(s.amountDue).toBe(1500)
    expect(s.pastDue).toBe(1500)
    expect(s.lines.map((l) => l.invoiceId)).toEqual(['b', 'a'])
  })
  it('dunning escalates one level at a time, never repeats', () => {
    const inv = { dueDate: d('2026-07-01'), invoiceDate: null, balance: 500 }
    expect(nextDunningLevel(inv, d('2026-09-28'), 0)?.level).toBe(4)
    expect(nextDunningLevel(inv, d('2026-09-28'), 4)).toBeNull()
    expect(nextDunningLevel({ ...inv, balance: 0 }, d('2026-09-28'), 0)).toBeNull()
    expect(nextDunningLevel(inv, d('2026-06-28'), 0)?.level).toBe(1)
  })
})

describe('bank deposits and reconciliation', () => {
  const receipts = [
    { id: 'p1', kind: 'payment' as const, amount: 10000, receivedOn: d('2026-09-01'), method: 'check' as const },
    { id: 'p2', kind: 'payment' as const, amount: 2500, receivedOn: d('2026-09-01'), method: 'check' as const },
    {
      id: 'p3',
      kind: 'deposit' as const,
      amount: 7000,
      receivedOn: d('2026-09-02'),
      method: 'stripe' as const,
      stripePayoutId: 'po_1',
    },
    { id: 'p4', kind: 'payment' as const, amount: 3000, receivedOn: d('2026-09-02'), method: 'stripe' as const },
    { id: 'p5', kind: 'payment' as const, amount: 4000, receivedOn: d('2026-09-03'), method: 'ach' as const },
  ]
  it('groups receipts the way they hit the bank', () => {
    const g = proposeBankDeposits(receipts)
    expect(g.map((x) => [x.source, x.amount, x.receiptIds])).toEqual([
      ['check_batch', 12500, ['p1', 'p2']],
      ['stripe_payout', 7000, ['p3']],
      ['individual', 4000, ['p5']],
    ])
  })
  it('matches by reference, then unique amount+date', () => {
    const result = reconcile(
      [
        { id: 's1', postedOn: d('2026-09-04'), amount: 7000, description: 'STRIPE TRANSFER po_1' },
        { id: 's2', postedOn: d('2026-09-02'), amount: 12500, description: 'DEPOSIT' },
        { id: 's3', postedOn: d('2026-09-05'), amount: -1500, description: 'FEE' },
        { id: 's4', postedOn: d('2026-09-06'), amount: 999, description: '??' },
      ],
      [
        { id: 'd1', depositDate: d('2026-09-01'), amount: 12500 },
        { id: 'd2', depositDate: d('2026-09-02'), amount: 7000, reference: 'po_1' },
      ],
    )
    expect(result.matches).toEqual([
      { statementLineId: 's1', depositId: 'd2', rule: 'reference' },
      { statementLineId: 's2', depositId: 'd1', rule: 'amount_and_date' },
    ])
    expect(result.unmatchedLines.map((l) => l.id)).toEqual(['s4'])
  })
  it('refuses ambiguous amount matches', () => {
    const r = reconcile(
      [{ id: 's', postedOn: d('2026-09-02'), amount: 500, description: '' }],
      [
        { id: 'a', depositDate: d('2026-09-01'), amount: 500 },
        { id: 'b', depositDate: d('2026-09-03'), amount: 500 },
      ],
    )
    expect(r.matches).toEqual([])
  })
  it('suggests receipts summing to an unmatched line', () => {
    expect(
      suggestReceiptsForLine({ id: 's', postedOn: d('2026-09-03'), amount: 14000, description: '' }, receipts)?.sort(),
    ).toEqual(['p1', 'p5'])
  })
  it('parses statement amounts', () => {
    expect(parseStatementAmount('$1,234.56')).toBe(123456)
    expect(parseStatementAmount('(12.00)')).toBe(-1200)
  })
})

describe('contracts', () => {
  const contract = {
    startDate: d('2026-01-01'),
    endDate: d('2026-12-31'),
    renewal: { autoRenew: true, renewalTermMonths: 12, upliftPercent: 5, renewalLeadDays: 30 },
    items: [
      {
        productId: null,
        description: 'Seats',
        quantity: 10,
        unitPrice: 2500,
        frequencyMonths: 1 as const,
        timing: 'advance' as const,
        startDate: d('2026-01-01'),
        endDate: d('2026-12-31'),
      },
    ],
  }
  it('bills monthly per item', () => {
    const ev = planBillingEvents(contractItemSchedule(contract.items[0]), 0)
    expect(ev).toHaveLength(12)
    expect(ev.every((e) => e.amount === 25000)).toBe(true)
  })
  it('renews with uplift at term end', () => {
    expect(renewalDue(contract, d('2026-11-30'))).toBe(false)
    expect(renewalDue(contract, d('2026-12-01'))).toBe(true)
    const next = buildRenewal(contract)
    expect(isoDate(next.startDate)).toBe('2027-01-01')
    expect(isoDate(next.endDate)).toBe('2027-12-31')
    expect(next.items[0].unitPrice).toBe(2625)
  })
})

describe('statement CSV import', () => {
  it('reads signed-amount and credit/debit layouts, keeping same-day duplicates distinct', () => {
    const signed = parseStatementCsv(
      'Date,Description,Amount\n2026-09-02,"DEPOSIT, BRANCH 12",125.00\n2026-09-02,"DEPOSIT, BRANCH 12",125.00\n2026-09-03,FEE,(15.00)\n',
    )
    expect(signed.map((r) => [r.postedOn, r.amount, r.description])).toEqual([
      ['2026-09-02', 12500, 'DEPOSIT, BRANCH 12'],
      ['2026-09-02', 12500, 'DEPOSIT, BRANCH 12'],
      ['2026-09-03', -1500, 'FEE'],
    ])
    expect(new Set(signed.map((r) => r.externalId)).size).toBe(3)

    const split = parseStatementCsv(
      'Posted Date,Memo,Credit,Debit,FITID\n2026-09-04,STRIPE po_1,70.00,,abc\n2026-09-05,Rent,,500\n',
    )
    expect(split.map((r) => [r.externalId, r.amount])).toEqual([
      ['abc', 7000],
      ['2026-09-05|-50000|Rent', -50000],
    ])
  })

  it('requires a date column', () => {
    expect(() => parseStatementCsv('Amount\n1.00\n')).toThrow(/Date column/)
  })
})
