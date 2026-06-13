import { Router, Request, Response } from 'express'
import Stripe from 'stripe'
import { stripe } from '../lib/stripe'
import { prisma } from '../lib/prisma'
import { SubscriptionStatus, Plan } from '@prisma/client'

const router = Router()

// POST /api/webhooks/stripe
// Raw body required — mounted before express.json() in index.ts
router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature']
  if (!sig) { res.status(400).send('Missing stripe-signature header'); return }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    res.status(400).send('Webhook signature verification failed')
    return
  }

  const statusMap: Record<string, SubscriptionStatus> = {
    active:    'ACTIVE',
    past_due:  'PAST_DUE',
    canceled:  'CANCELED',
    incomplete: 'INCOMPLETE',
    trialing:  'TRIALING',
  }

  switch (event.type) {

    case 'customer.subscription.updated':
    case 'customer.subscription.created': {
      const sub = event.data.object as Stripe.Subscription
      const status = statusMap[sub.status] ?? 'INCOMPLETE'
      const planMeta = (sub.metadata?.plan ?? 'premium').toUpperCase() as Plan

      await prisma.subscription.upsert({
        where:  { stripeSubscriptionId: sub.id },
        create: {
          userId:               sub.metadata.userId,
          stripeSubscriptionId: sub.id,
          stripePriceId:        sub.items.data[0].price.id,
          status,
          plan:                 planMeta,
          billingCycle:         sub.metadata?.billingCycle?.toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY',
          currentPeriodStart:   new Date(sub.current_period_start * 1000),
          currentPeriodEnd:     new Date(sub.current_period_end   * 1000),
          cancelAtPeriodEnd:    sub.cancel_at_period_end,
        },
        update: {
          status,
          stripePriceId:      sub.items.data[0].price.id,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd:   new Date(sub.current_period_end   * 1000),
          cancelAtPeriodEnd:  sub.cancel_at_period_end,
        },
      })

      if (status === 'ACTIVE' || status === 'TRIALING') {
        await prisma.user.update({
          where: { id: sub.metadata.userId },
          data:  { plan: planMeta },
        })
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      await prisma.subscription.update({
        where: { stripeSubscriptionId: sub.id },
        data:  { status: 'CANCELED', cancelAtPeriodEnd: false },
      })
      await prisma.user.update({
        where: { id: sub.metadata.userId },
        data:  { plan: 'FREE' },
      })
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      if (invoice.subscription) {
        await prisma.subscription.update({
          where: { stripeSubscriptionId: invoice.subscription as string },
          data:  { status: 'PAST_DUE' },
        })
      }
      break
    }

    default:
      // Unhandled event — safe to ignore
      break
  }

  res.json({ received: true })
})

export default router
