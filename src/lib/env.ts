// Startup environment validation — fail fast and loud instead of running
// with a missing or weak secret.

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as const

export function validateEnv() {
  const missing = REQUIRED.filter(k => !process.env[k])
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }

  const secret = process.env.JWT_SECRET!
  if (secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters. Generate one with:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
    )
  }
  if (/^(change|secret|test|dev|password)/i.test(secret)) {
    throw new Error('JWT_SECRET looks like a placeholder — set a real random secret.')
  }

  if (process.env.NODE_ENV === 'production' && !process.env.ALLOWED_ORIGINS) {
    throw new Error('ALLOWED_ORIGINS must be set in production (comma-separated frontend origins).')
  }
}

export const JWT_SECRET = () => process.env.JWT_SECRET!

// Common signing options — short-lived tokens with issuer/audience binding.
export const JWT_OPTS = {
  issuer: 'nikah-api',
  audience: 'nikah-app',
  expiresIn: '7d',
} as const

export const JWT_VERIFY_OPTS = {
  issuer: 'nikah-api',
  audience: 'nikah-app',
} as const
