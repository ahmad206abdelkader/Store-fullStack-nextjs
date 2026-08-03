import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import { ensurePrismaConnection } from "@/lib/prismadb";

export const runtime = "nodejs";

const handlers = toNextJsHandler(auth);

const withDatabase = (handler: typeof handlers.GET) => {
  return async (request: Request) => {
    await ensurePrismaConnection();
    return handler(request);
  };
};

export const GET = withDatabase(handlers.GET);
export const POST = withDatabase(handlers.POST);

export function OPTIONS() {
  return new Response(null, { status: 204 });
}
