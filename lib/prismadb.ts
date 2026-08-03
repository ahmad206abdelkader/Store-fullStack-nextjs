import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
  var prismaConnection: Promise<void> | undefined;
}

const prismadb = globalThis.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalThis.prisma = prismadb;

async function connectWithRetry() {
  try {
    await prismadb.$connect();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await prismadb.$connect();
  }
}

export function ensurePrismaConnection() {
  if (!globalThis.prismaConnection) {
    globalThis.prismaConnection = connectWithRetry().catch((error) => {
      globalThis.prismaConnection = undefined;
      throw error;
    });
  }

  return globalThis.prismaConnection;
}

export default prismadb;
