import { Router, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { asyncHandler } from '../middleware/errors'

const router = Router()

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later' },
})

const SubscribeSchema = z.object({
  email: z.string().email().max(254).transform(e => e.toLowerCase().trim()),
})

// POST /api/newsletter — store an email for the weekly digest.
// Idempotent: re-subscribing an existing address returns 200, not 409,
// so the endpoint can't be used to enumerate who's already subscribed.
router.post('/', limiter, asyncHandler(async (req: Request, res: Response) => {
  const parsed = SubscribeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Please enter a valid email address' })
    return
  }

  const { email } = parsed.data
  try {
    await prisma.newsletterSubscriber.create({ data: { email } })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      // Already subscribed — resurface as subscribed, and clear any prior opt-out.
      await prisma.newsletterSubscriber.update({ where: { email }, data: { unsubscribed: false } })
    } else {
      throw e
    }
  }

  res.status(201).json({ subscribed: true })
}))

export default router
