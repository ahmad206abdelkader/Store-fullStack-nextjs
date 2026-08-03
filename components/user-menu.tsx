"use client";

import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

export function UserMenu() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  async function signOut() {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <button
      className="rounded-md border px-3 py-2 text-sm"
      onClick={signOut}
      title={session?.user.email || "Account"}
      type="button"
    >
      Sign out
    </button>
  );
}
