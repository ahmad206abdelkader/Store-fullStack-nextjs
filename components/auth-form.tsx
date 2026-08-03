"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";

type AuthFormProps = {
  mode: "sign-in" | "sign-up";
};

export type SocialProvider = "google" | "github";

export function AuthForm({
  mode,
  socialProviders = [],
}: AuthFormProps & { socialProviders?: SocialProvider[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [pendingProvider, setPendingProvider] =
    useState<SocialProvider | null>(null);
  const isSignUp = mode === "sign-up";
  const rawCallbackURL = searchParams.get("callbackURL");
  const callbackURL =
    rawCallbackURL?.startsWith("/") && !rawCallbackURL.startsWith("//")
      ? rawCallbackURL
      : "/";
  const alternateAuthPath = isSignUp ? "/sign-in" : "/sign-up";
  const alternateAuthURL =
    callbackURL === "/"
      ? alternateAuthPath
      : `${alternateAuthPath}?callbackURL=${encodeURIComponent(callbackURL)}`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const result = isSignUp
      ? await authClient.signUp.email({ name, email, password })
      : await authClient.signIn.email({ email, password });

    setIsPending(false);

    if (result.error) {
      setError(result.error.message || "Authentication failed");
      return;
    }

    router.push(callbackURL);
    router.refresh();
  }

  async function onSocialSignIn(provider: SocialProvider) {
    setError(null);
    setPendingProvider(provider);

    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: new URL(callbackURL, window.location.origin).toString(),
      });

      if (result.error) {
        setError(result.error.message || `Unable to continue with ${provider}`);
      }
    } catch {
      setError(`Unable to continue with ${provider}. Please try again.`);
    } finally {
      setPendingProvider(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border p-6 shadow-sm">
      <div>
        <h1 className="text-2xl font-semibold">{isSignUp ? "Create account" : "Sign in"}</h1>
        <p className="text-sm text-muted-foreground">Use your Store account to continue.</p>
      </div>
      {socialProviders.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {socialProviders.map((provider) => (
              <button
                className="rounded-md border px-3 py-2 text-sm font-medium capitalize hover:bg-muted disabled:opacity-50"
                disabled={isPending || pendingProvider !== null}
                key={provider}
                onClick={() => onSocialSignIn(provider)}
                type="button"
              >
                {pendingProvider === provider ? "Connecting..." : provider}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>or continue with email</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      {isSignUp && (
        <label className="block space-y-1 text-sm">
          <span>Name</span>
          <input
            className="w-full rounded-md border bg-background px-3 py-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="name"
          />
        </label>
      )}
      <label className="block space-y-1 text-sm">
        <span>Email</span>
        <input
          className="w-full rounded-md border bg-background px-3 py-2"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Password</span>
        <input
          className="w-full rounded-md border bg-background px-3 py-2"
          type="password"
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete={isSignUp ? "new-password" : "current-password"}
        />
      </label>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        disabled={isPending || pendingProvider !== null}
        type="submit"
      >
        {isPending ? "Please wait..." : isSignUp ? "Sign up" : "Sign in"}
      </button>
      <p className="text-center text-sm">
        {isSignUp ? "Already have an account? " : "Need an account? "}
        <Link className="underline" href={alternateAuthURL}>
          {isSignUp ? "Sign in" : "Sign up"}
        </Link>
      </p>
    </form>
  );
}
