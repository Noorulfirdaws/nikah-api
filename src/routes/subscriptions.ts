import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { stripe, PRICES, PriceKey } from '../lib/stripe'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

const CreateSchema = z.object({
  plan:         z.enum(['premium', 'family']),
  billingCycle: z.enum(['monthly', 'annual']),
  paymentMethodId: z.string().min(1),
})

// POST /api/subscriptions/create
router.post('/create', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() })
    return
  }

  const { plan, billingCycle, paymentMethodId } = parsed.data

  const user = await prisma.user.findUnique({ where: { id: req.userId } })
  if (!user?.stripeCustomerId) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const priceKey = `${plan}_${billingCycle}` as PriceKey
  const priceId  = PRICES[priceKey]
  if (!priceId) {
    res.status(400).json({ error: 'Invalid plan/billing combination' })
    return
  }

  // Attach payment method to customer
  await stripe.paymentMethods.attach(paymentMethodId, { customer: user.stripeCustomerId })
  await stripe.customers.update(user.stripeCustomerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  })

  // Create subscription with 7-day trial
  const stripeSub = await stripe.subscriptions.create({
    customer:          user.stripeCustomerId,
    items:             [{ price: priceId }],
    trial_period_days: 7,
    payment_settings:  { payment_method_types: ['card'], save_default_payment_method: 'on_subscription' },
    expand:            ['latest_invoice.payment_intent'],
    metadata:          { userId: user.id, plan, billingCycle },
  })

  // Save to DB
  const planEnum  = plan.toUpperCase() as 'PREMIUM' | 'FAMILY'
  const cycleEnum = billingCycle.toUpperCase() as 'MONTHLY' | 'ANNUAL'

  await prisma.subscription.upsert({
    where:  { userId: user.id },
    create: {
      userId:              user.id,
      stripeSubscriptionId: stripeSub.id,
      stripePriceId:       priceId,
      status:              'TRIALING',
      plan:                planEnum,
      billingCycle:        cycleEnum,
      currentPeriodStart:  new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd:    new Date(stripeSub.current_period_end   * 1000),
    },
    update: {
      stripeSubscriptionId: stripeSub.id,
      stripePriceId:        priceId,
      status:               'TRIALING',
      plan:                 planEnum,
      billingCycle:         cycleEnum,
      currentPeriodStart:   new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd:     new Date(stripeSub.current_period_end   * 1000),
    },
  })

  await prisma.user.update({ where: { id: user.id }, data: { plan: planEnum } })

  res.status(201).json({ success: true, subscriptionId: stripeSub.id, status: stripeSub.status })
})

// GET /api/subscriptions/status
router.get('/status', requireAuth, async (req: AuthRequest, res: Response) => {
  const sub = await prisma.subscription.findUnique({ where: { userId: req.userId } })
  if (!sub) {
    res.json({ plan: 'FREE', status: null })
    return
  }
  res.json({
    plan:              sub.plan,
    status:            sub.status,
    billingCycle:      sub.billingCycle,
    currentPeriodEnd:  sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  })
})

// POST /api/subscriptions/cancel
router.post('/cancel', requireAuth, async (req: AuthRequest, res: Response) => {
  const sub = await prisma.subscription.findUnique({ where: { userId: req.userId } })
  if (!sub) { res.status(404).json({ error: 'No active subscription' }); return }

  await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true })
  await prisma.subscription.update({
    where:  { userId: req.userId },
    data:   { cancelAtPeriodEnd: true },
  })

  res.json({ success: true, message: 'Subscription will cancel at end of billing period' })
})

export default router
