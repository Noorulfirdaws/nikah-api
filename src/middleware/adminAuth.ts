import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'

// Separate from user JWT auth — a static shared-secret key for the small
// internal admin read endpoints. Real role-based admin auth (tied to a
// User.role column + login) is tracked in docs/BACKEND-SCHEMA-RECOMMENDATIONS.md;
// this is intentionally minimal until that lands.
export function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  const configured = process.env.ADMIN_API_KEY
  if (!configured) {
    res.status(503).json({ error: 'Admin API not configured (ADMIN_API_KEY unset)' })
    return
  }
  const provided = req.headers['x-admin-key']
  if (typeof provided !== 'string' || !timingSafeEqual(provided, configured)) {
    res.status(401).json({ error: 'Invalid admin key' })
    return
  }
  next()
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}
