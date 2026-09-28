/**
 * Integer-cent arithmetic for the billing engine. Every amount inside
 * `billing-engine` is a whole number of cents — never a float dollar value —
 * so installment splits, tax, and payment application can't drift by a
 * penny. Convert at the edges only (form inputs, display).
 */

export type Cents = number

export function toCents(dollars: number | string): Cents {
  const n = typeof dollars === 'number' ? dollars : Number(dollars)
  if (!Number.isFinite(n)) throw new Error(`Not a finite amount: ${String(dollars)}`)
  return Math.round(n * 100)
}

export function toDollars(cents: Cents): number {
  return Math.round(cents) / 100
}

/** Half-away-from-zero rounding of a fractional cent value. */
export function roundCents(value: number): Cents {
  return Math.sign(value) * Math.round(Math.abs(value))
}

/** quantity × unit price, rounded once at the line level. */
export function extend(quantity: number, unitPriceCents: Cents): Cents {
  return roundCents(quantity * unitPriceCents)
}

/** Percentage of an amount, e.g. rate 8.25 → 8.25%. */
export function percentOf(amount: Cents, ratePercent: number): Cents {
  return roundCents((amount * ratePercent) / 100)
}

export function sum(values: Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0)
}

/**
 * Splits `total` across `weights` so the parts sum exactly to `total`
 * (largest-remainder method). Used for installments, milestone percentages,
 * and ratable revenue — anywhere a naive `total / n` would lose cents.
 */
export function allocate(total: Cents, weights: number[]): Cents[] {
  if (weights.length === 0) return []
  const weightSum = weights.reduce((a, b) => a + b, 0)
  if (weightSum <= 0) throw new Error('allocate: weights must sum to a positive number')

  const sign = total < 0 ? -1 : 1
  const abs = Math.abs(total)
  const raw = weights.map((w) => (abs * w) / weightSum)
  const parts = raw.map(Math.floor)
  let remainder = abs - sum(parts)

  // Hand leftover cents to the parts with the largest fractional remainder;
  // ties go to the earliest part so results are deterministic.
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; remainder > 0; k = (k + 1) % order.length) {
    parts[order[k].i] += 1
    remainder -= 1
  }
  return parts.map((p) => p * sign)
}
