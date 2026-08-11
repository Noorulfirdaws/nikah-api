import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import authRoutes         from './routes/auth'
import subscriptionRoutes from './routes/subscriptions'
import webhookRoutes      from './routes/webhooks'
import adminRoutes        from './routes/admin'
import { validateEnv } from './lib/env'
import { errorHandler } from './middleware/errors'

// Fail fast on missing/weak secrets — never boot in an insecure state.
validateEnv()

const app  = express()
const PORT = parseInt(process.env.PORT ?? '3200', 10)

// Railway (and most PaaS) terminate TLS at a reverse proxy. Without this,
// req.ip is the proxy's IP and per-IP rate limiting silently stops working.
app.set('trust proxy', 1)

// Don't advertise the framework
app.disable('x-powered-by')

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet())

// ── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(o => o.trim()).filter(Boolean)
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))

// ── Stripe webhook — raw body MUST come before express.json() ─────────────────
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes)

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '16kb' }))

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
}))

app.use('/api/subscriptions', rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
}))

app.use('/api/admin', rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
}))

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes)
app.use('/api/subscriptions', subscriptionRoutes)
app.use('/api/admin',         adminRoutes)

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'nikah-api', timestamp: new Date().toISOString() })
})

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler)

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Nikah API running on port ${PORT}`)
})

export default app
