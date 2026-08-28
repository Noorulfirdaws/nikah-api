import { Router, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { asyncHandler } from '../middleware/errors'

const router = Router()

// Generous enough for a real user retrying a typo, tight enough to stop
// abuse — contact forms are a classic spam/flooding target.
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages sent — please try again later' },
})

const ContactSchema = z.object({
  name:    z.string().trim().min(1).max(100),
  email:   z.string().email().max(254).transform(e => e.toLowerCase().trim()),
  subject: z.string().max(120).optional(),
  message: z.string().trim().min(1).max(5000),
})

// POST /api/contact — stores the message; no email delivery is configured
// yet (no SMTP provider wired), so responses must not claim one was sent.
router.post('/', contactLimiter, asyncHandler(async (req: Request, res: Response) => {
  const parsed = ContactSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', fields: parsed.error.flatten().fieldErrors })
    return
  }

  const { name, email, subject, message } = parsed.data
  const saved = await prisma.contactMessage.create({
    data: { name, email, subject: subject ?? '', message },
  })

  res.status(201).json({ received: true, id: saved.id })
}))

export default router
