// Setu Workflow pricing, as sold on setutechnology.com. Client-safe.
//
// A plan covers INCLUDED_USERS people. Larger firms buy extra users through
// sales, who issue a key carrying the agreed seat count.

export const INCLUDED_USERS = 10;

export type Billing = "monthly" | "yearly";

/** How much subscription one purchase adds. */
export const BILLING_DAYS: Record<Billing, number> = { monthly: 30, yearly: 365 };

export const PLAN_PRICES = {
  IN: { currency: "INR", symbol: "₹", monthly: 999, yearly: 9999 },
  INTL: { currency: "USD", symbol: "$", monthly: 9.99, yearly: 99.99 },
} as const;

/** Each user beyond INCLUDED_USERS, per month. Arranged through sales. */
export const EXTRA_USER_PRICE = { currency: "USD", symbol: "$", monthly: 4.99 } as const;

export function formatPlanPrice(amount: number, currency: "INR" | "USD") {
  return currency === "INR"
    ? `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount)}`
    : `$${amount.toFixed(2)}`;
}

/** Where a key is bought. */
export const BUY_URL =
  process.env.NEXT_PUBLIC_WORKFLOW_BUY_URL || "https://setutechnology.com/products/workflow";
