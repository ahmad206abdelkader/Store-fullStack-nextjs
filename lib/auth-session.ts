import { headers } from "next/headers";

import { auth } from "@/lib/auth";

export async function getServerSession(requestHeaders?: Headers) {
  return auth.api.getSession({
    headers: requestHeaders ?? headers(),
  });
}

export async function getCurrentUserId(requestHeaders?: Headers) {
  const session = await getServerSession(requestHeaders);
  return session?.user.id ?? null;
}
