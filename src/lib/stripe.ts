import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10',
})

// Price IDs — set these in your Railway env vars after creating products in Stripe dashboard
export const PRICES = {
  premium_monthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY!,
  premium_annual:  process.env.STRIPE_PRICE_PREMIUM_ANNUAL!,
  family_monthly:  process.env.STRIPE_PRICE_FAMILY_MONTHLY!,
  family_annual:   process.env.STRIPE_PRICE_FAMILY_ANNUAL!,
} as const

export type PriceKey = keyof typeof PRICES
