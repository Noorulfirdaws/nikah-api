import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { stripe } from '../lib/stripe'

const router = Router()

const RegisterSchema = z.object({
  name:     z.string().min(2).max(50),
  email:    z.string().email().max(254),
  password: z.string().min(8).max(128),
  gender:   z.enum(['BROTHER', 'SISTER']),
  country:  z.string().max(80).optional(),
})

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() })
    return
  }

  const { name, email, password, gender, country } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists' })
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)

  // Create Stripe customer alongside the user
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { gender },
  })

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      gender,
      country: country ?? '',
      stripeCustomerId: customer.id,
    },
  })

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '30d' })

  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
  })
})

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' })
    return
  }

  const { email, password } = parsed.data

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '30d' })

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
  })
})

// GET /api/auth/me
router.get('/me', async (req: Request, res: Response) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as { userId: string }
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { subscription: true },
    })
    if (!user) { res.status(404).json({ error: 'User not found' }); return }
    res.json({ id: user.id, name: user.name, email: user.email, plan: user.plan, subscription: user.subscription })
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
})

export default router
