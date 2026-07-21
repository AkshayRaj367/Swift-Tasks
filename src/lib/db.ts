import { PrismaClient } from '@prisma/client'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import ws from 'ws'

// Configure neon to use websockets (needed for serverless/edge)
neonConfig.webSocketConstructor = ws

let db: PrismaClient

if (process.env.NODE_ENV === 'production') {
  // Production: use connection pool adapter for serverless
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaNeon(pool)
  db = new PrismaClient({ adapter })
} else {
  // Development: standard PrismaClient with query logging
  const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }
  db = globalForPrisma.prisma ?? new PrismaClient({ log: ['query'] })
  globalForPrisma.prisma = db
}

export { db }