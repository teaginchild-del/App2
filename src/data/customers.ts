import type {
  BillingCycle,
  Customer,
  CustomerStatus,
  LifecycleStage,
  PaymentMethod,
} from '@/types/customer'

const companyNames = [
  'Northwind Traders',
  'Acme Fintech',
  'Bluepeak Logistics',
  'Cascade Robotics',
  'Delta Analytics',
  'Everline Media',
  'Fjord Health',
  'Granite Payments',
  'Harborlight Studios',
  'Ironclad Security',
  'Junction Retail',
  'Kepler Aerospace',
  'Lumen Energy',
  'Meridian Capital',
  'Novaworks',
  'Orbit Freight',
  'Pinecrest Realty',
  'Quantum Loop',
  'Redwood Farms',
  'Summit Insurance',
  'Tidal Commerce',
  'Union Manufacturing',
  'Vantage Legal',
  'Westgate Hospitality',
  'Yellowbrick Education',
  'Zenith Biotech',
  'Anchor Freight Co',
  'Brightline Telecom',
  'Cobalt Design',
  'Driftwood Apparel',
  'Emberline Foods',
  'Foundry Software',
  'Glasswing Travel',
  'Hollowpoint Sports',
  'Ivywood Consulting',
  'Jasperstone Mining',
]

const industries = [
  'Software',
  'Financial Services',
  'Retail',
  'Healthcare',
  'Manufacturing',
  'Logistics',
  'Media',
  'Insurance',
  'Real Estate',
  'Hospitality',
  'Education',
  'Energy',
]

const firstNames = [
  'Jordan',
  'Casey',
  'Morgan',
  'Riley',
  'Taylor',
  'Avery',
  'Cameron',
  'Drew',
  'Emerson',
  'Harper',
  'Kendall',
  'Logan',
  'Parker',
  'Quinn',
  'Reese',
  'Sawyer',
]

const lastNames = [
  'Bennett',
  'Cruz',
  'Diaz',
  'Ellis',
  'Foster',
  'Grant',
  'Hayes',
  'Ibarra',
  'Jensen',
  'Kim',
  'Lopez',
  'Mercer',
  'Nakamura',
  'Osei',
  'Patel',
  'Reyes',
]

const titles = [
  'CFO',
  'Controller',
  'VP Finance',
  'Owner',
  'Accounts Payable Lead',
  'COO',
  'Director of Operations',
  'CEO',
]

const owners = ['Sam Whitfield', 'Priya Ramaswamy', 'Marcus Lee', 'Dana Okafor', 'ElenaVasquez']

const plans = [
  'Starter Monthly',
  'Growth Monthly',
  'Scale Monthly',
  'Starter Annual',
  'Growth Annual',
  'Scale Annual',
  'Enterprise',
]

const states = ['CA', 'NY', 'TX', 'WA', 'IL', 'MA', 'CO', 'GA', 'NC', 'AZ', 'OR', 'FL']

const cities: Record<string, string> = {
  CA: 'San Francisco',
  NY: 'New York',
  TX: 'Austin',
  WA: 'Seattle',
  IL: 'Chicago',
  MA: 'Boston',
  CO: 'Denver',
  GA: 'Atlanta',
  NC: 'Raleigh',
  AZ: 'Phoenix',
  OR: 'Portland',
  FL: 'Miami',
}

const statuses: CustomerStatus[] = ['active', 'active', 'active', 'trial', 'past_due', 'paused', 'canceled']
const stages: LifecycleStage[] = ['customer', 'customer', 'customer', 'opportunity', 'lead', 'churned']
const cycles: BillingCycle[] = ['monthly', 'monthly', 'annual']
const paymentMethods: PaymentMethod[] = ['credit_card', 'ach', 'invoice', 'wire']

// Simple seeded PRNG (mulberry32) so mock data is stable across renders/builds.
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20260826)

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]
}

function randomInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min
}

function randomDate(daysBack: number, daysForward = 0): string {
  const now = new Date('2026-08-26T00:00:00Z')
  const offset = randomInt(-daysBack, daysForward)
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function buildCustomer(index: number): Customer {
  const company = companyNames[index % companyNames.length]
  const first = pick(firstNames)
  const last = pick(lastNames)
  const state = pick(states)
  const status = pick(statuses)
  const stage: LifecycleStage = status === 'canceled' ? 'churned' : pick(stages)
  const cycle = pick(cycles)
  const mrrBase = randomInt(200, 24000)
  const mrr = status === 'canceled' ? 0 : mrrBase
  const balanceDue = status === 'past_due' ? randomInt(500, 18000) : status === 'active' ? pick([0, 0, 0, randomInt(100, 3000)]) : 0

  return {
    id: `cus_${(index + 1).toString().padStart(4, '0')}`,
    customerNumber: `CUST-${(1000 + index).toString()}`,
    companyName: company,
    industry: pick(industries),
    website: `www.${slugify(company)}.com`,
    contactName: `${first} ${last}`,
    contactTitle: pick(titles),
    email: `${first.toLowerCase()}.${last.toLowerCase()}@${slugify(company)}.com`,
    phone: `(${randomInt(200, 989)}) ${randomInt(200, 999)}-${randomInt(1000, 9999)}`,
    status,
    lifecycleStage: stage,
    owner: pick(owners),
    plan: pick(plans),
    billingCycle: cycle,
    mrr,
    balanceDue,
    lifetimeValue: mrr * randomInt(3, 36) + balanceDue,
    currency: 'USD',
    paymentMethod: pick(paymentMethods),
    lastInvoiceDate: randomDate(60, 0),
    nextBillingDate: randomDate(0, 45),
    customerSince: randomDate(1400, -30),
    address: {
      line1: `${randomInt(100, 9999)} ${pick(['Market St', 'Main St', 'Industrial Pkwy', 'Commerce Ave', 'Harbor Rd', 'Innovation Dr'])}`,
      city: cities[state],
      state,
      postalCode: randomInt(10000, 99999).toString(),
      country: 'USA',
    },
    tags: [pick(['high-touch', 'self-serve', 'partner-referred', 'enterprise', 'smb'])],
  }
}

export const customers: Customer[] = Array.from({ length: 48 }, (_, i) => buildCustomer(i))
