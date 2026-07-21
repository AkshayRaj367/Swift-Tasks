import { PrismaClient } from '@prisma/client'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import ws from 'ws'

// Configure neon to use websockets (needed for serverless/edge)
neonConfig.webSocketConstructor = ws

let db: PrismaClient

const connectionString = process.env.DATABASE_URL

if (process.env.NODE_ENV === 'production') {
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL environment variable is missing on Vercel. Please add DATABASE_URL in Vercel Project Settings -> Environment Variables and Redeploy.'
    )
  }
  // Production: use connection pool adapter for serverless
  const pool = new Pool({ connectionString })
  const adapter = new PrismaNeon(pool)
  db = new PrismaClient({ adapter })
} else {
  // Development: standard PrismaClient with query logging
  const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }
  db = globalForPrisma.prisma ?? new PrismaClient({ log: ['query'] })
  globalForPrisma.prisma = db
}

export { db }