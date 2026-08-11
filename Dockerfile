FROM node:20-alpine AS builder
WORKDIR /app
# Prisma's engine binaries need OpenSSL to load on musl (Alpine) — without
# this, `prisma generate`/`migrate deploy` silently fail to parse engine
# responses and the process never starts.
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
EXPOSE 3000
# Apply pending migrations, then start — safe to run on every deploy
# (no-op when the schema is already up to date).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
