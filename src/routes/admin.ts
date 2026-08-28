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
      age: true,
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
      id: true, name: true, email: true, age: true, gender: true, country: true,
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

// GET /api/admin/contact-messages — review submissions from the contact form.
router.get('/contact-messages', asyncHandler(async (_req: Request, res: Response) => {
  const messages = await prisma.contactMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  res.json({ count: messages.length, messages })
}))

// PATCH /api/admin/contact-messages/:id — mark a message resolved/open.
router.patch('/contact-messages/:id', asyncHandler(async (req: Request, res: Response) => {
  const status = req.body?.status
  if (status !== 'OPEN' && status !== 'RESOLVED') {
    res.status(400).json({ error: 'status must be OPEN or RESOLVED' })
    return
  }
  const exists = await prisma.contactMessage.findUnique({ where: { id: req.params.id } })
  if (!exists) { res.status(404).json({ error: 'Message not found' }); return }
  const updated = await prisma.contactMessage.update({ where: { id: req.params.id }, data: { status } })
  res.json(updated)
}))

// DELETE /api/admin/contact-messages/:id — remove a test/spam submission.
router.delete('/contact-messages/:id', asyncHandler(async (req: Request, res: Response) => {
  const exists = await prisma.contactMessage.findUnique({ where: { id: req.params.id } })
  if (!exists) { res.status(404).json({ error: 'Message not found' }); return }
  await prisma.contactMessage.delete({ where: { id: req.params.id } })
  res.json({ deleted: true, id: req.params.id })
}))

export default router
