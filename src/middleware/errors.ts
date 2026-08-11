import { Request, Response, NextFunction, RequestHandler } from 'express'

// Express 4 does not catch rejected promises from async handlers — without
// this wrapper a thrown error leaves the request hanging with no response.
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { fn(req, res, next).catch(next) }
}

// Global error handler — logs server-side, returns a generic message.
// Never leak stack traces, Stripe errors, or Prisma internals to clients.
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  // CORS rejections surface here as plain Errors
  if (err.message?.startsWith('CORS:')) {
    res.status(403).json({ error: 'Origin not allowed' })
    return
  }

  console.error(`[error] ${req.method} ${req.path}:`, err.message)

  if (res.headersSent) return
  res.status(500).json({ error: 'Internal server error' })
}
