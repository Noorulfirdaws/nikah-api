import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { JWT_SECRET, JWT_VERIFY_OPTS } from '../lib/env'

export interface AuthRequest extends Request {
  userId?: string
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' })
    return
  }

  const token = header.slice(7)
  try {
    // Verify signature AND issuer/audience so tokens minted for other
    // services (or with a stolen secret elsewhere) are rejected.
    const payload = jwt.verify(token, JWT_SECRET(), JWT_VERIFY_OPTS)
    if (typeof payload === 'string' || typeof payload.userId !== 'string') {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }
    req.userId = payload.userId
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
