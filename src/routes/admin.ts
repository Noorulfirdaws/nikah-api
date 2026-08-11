import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { requireAdminKey } from '../middleware/adminAuth'
import { asyncHandler } from '../middleware/errors'

const router = Router()
router.use(requireAdminKey)

// GET /api/admin/users — list recent registrations.
// Never returns passwordHash or other sensitive fields.
router.get('/users', asyncHandler(async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      name: true,
      email: true,
      gender: true,
      country: true,
      plan: true,
      emailVerified: true,
      createdAt: true,
      subscription: { select: { status: true, plan: true } },
    },
  })
  res.json({ count: users.length, users })
}))

// GET /api/admin/users/:id — single user detail.
router.get('/users/:id', asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, name: true, email: true, gender: true, country: true,
      plan: true, emailVerified: true, createdAt: true, updatedAt: true,
      subscription: true,
    },
  })
  if (!user) { res.status(404).json({ error: 'User not found' }); return }
  res.json(user)
}))

// DELETE /api/admin/users/:id — remove a test/unwanted account.
router.delete('/users/:id', asyncHandler(async (req: Request, res: Response) => {
  const exists = await prisma.user.findUnique({ where: { id: req.params.id } })
  if (!exists) { res.status(404).json({ error: 'User not found' }); return }
  await prisma.user.delete({ where: { id: req.params.id } })
  res.json({ deleted: true, id: req.params.id })
}))

export default router
