import { PrismaClient } from '@prisma/client';
import { AppEnv } from '../config';

let prisma: PrismaClient | null = null;

export function getPrismaClient(env: AppEnv): PrismaClient {
  if (prisma) {
    return prisma;
  }

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: env.DATABASE_URL
      }
    }
  });

  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
