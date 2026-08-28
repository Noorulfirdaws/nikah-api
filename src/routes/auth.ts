import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { stripe } from '../lib/stripe'
import { JWT_SECRET, JWT_OPTS, JWT_VERIFY_OPTS } from '../lib/env'
import { asyncHandler } from '../middleware/errors'

const router = Router()

// Dummy hash (of a random value) compared when the account does not exist,
// so login latency is identical whether or not the email is registered.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-' + Math.random(), 12)

// Tighter, endpoint-specific brute-force limits (on top of the /api/auth limiter)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
})
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many accounts created from this address, please try again later' },
})

// Nikah is 18+ only. Age eligibility is enforced here — not just in the
// frontend wizard — because the frontend check is trivially bypassed by
// anyone calling this endpoint directly.
const RegisterSchema = z.object({
  name:     z.string().min(2).max(50),
  email:    z.string().email().max(254).transform(e => e.toLowerCase().trim()),
  password: z.string().min(8).max(72), // bcrypt compares at most 72 bytes
  age:      z.number().int().min(18, 'You must be 18 or older to use Nikah.').max(100),
  gender:   z.enum(['BROTHER', 'SISTER']),
  country:  z.string().max(80).optional(),
})

const LoginSchema = z.object({
  email:    z.string().email().max(254).transform(e => e.toLowerCase().trim()),
  password: z.string().min(1).max(72),
})

function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET(), JWT_OPTS)
}

// POST /api/auth/register
router.post('/register', registerLimiter, asyncHandler(async (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', fields: parsed.error.flatten().fieldErrors })
    return
  }

  const { name, email, password, age, gender, country } = parsed.data
  const passwordHash = await bcrypt.hash(password, 12)

  // Create the user first; the unique constraint (not a racy pre-check)
  // is the source of truth for duplicates.
  let user
  try {
    user = await prisma.user.create({
      data: { name, email, passwordHash, age, gender, country: country ?? '' },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      res.status(409).json({ error: 'An account with this email already exists' })
      return
    }
    throw e
  }

  // Create the Stripe customer after the user exists — if this fails the user
  // can still log in and the customer is created lazily at first subscription.
  try {
    const customer = await stripe.customers.create({ email, name, metadata: { userId: user.id } })
    user = await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } })
  } catch (e) {
    console.error('[auth] Stripe customer creation failed for user', user.id, (e as Error).message)
  }

  res.status(201).json({
    token: signToken(user.id),
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
  })
}))

// POST /api/auth/login
router.post('/login', loginLimiter, asyncHandler(async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' })
    return
  }

  const { email, password } = parsed.data
  const user = await prisma.user.findUnique({ where: { email } })

  // Always run a bcrypt compare so response time does not reveal whether
  // the email is registered.
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !valid) {
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }

  res.json({
    token: signToken(user.id),
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
  })
}))

// GET /api/auth/me
router.get('/me', asyncHandler(async (req: Request, res: Response) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  let userId: string
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET(), JWT_VERIFY_OPTS)
    if (typeof payload === 'string' || typeof payload.userId !== 'string') throw new Error('bad payload')
    userId = payload.userId
  } catch {
    res.status(401).json({ error: 'Invalid token' })
    return
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  })
  if (!user) { res.status(404).json({ error: 'User not found' }); return }
  res.json({ id: user.id, name: user.name, email: user.email, plan: user.plan, subscription: user.subscription })
}))

export default router
