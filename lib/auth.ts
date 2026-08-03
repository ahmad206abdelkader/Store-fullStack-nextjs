import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { dash } from "@better-auth/infra";
import bcrypt from "bcryptjs";

import prismadb from "@/lib/prismadb";

const authURL = process.env.BETTER_AUTH_URL;
const frontendStoreURL = process.env.FRONTEND_STORE_URL;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const githubClientId = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;

if (!authURL) {
  throw new Error("BETTER_AUTH_URL is required");
}

if (!frontendStoreURL) {
  throw new Error("FRONTEND_STORE_URL is required");
}

if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
  throw new Error(
    "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together"
  );
}

if (Boolean(githubClientId) !== Boolean(githubClientSecret)) {
  throw new Error(
    "GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be configured together"
  );
}

const trustedOrigins = [
  authURL,
  frontendStoreURL,
  ...(process.env.NODE_ENV === "development"
    ? ["http://localhost:3000", "http://localhost:3001"]
    : []),
];

const usesCrossOriginCookies =
  new URL(authURL).origin !== new URL(frontendStoreURL).origin;

export const auth = betterAuth({
  appName: "Store",
  baseURL: authURL,
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prismadb, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    password: {
      hash: (password) => bcrypt.hash(password, 12),
      verify: ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  socialProviders: {
    ...(googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {}),
    ...(githubClientId && githubClientSecret
      ? {
          github: {
            clientId: githubClientId,
            clientSecret: githubClientSecret,
          },
        }
      : {}),
  },
  trustedOrigins,
  advanced: usesCrossOriginCookies
    ? {
        defaultCookieAttributes: {
          httpOnly: true,
          sameSite: "none",
          secure: true,
        },
      }
    : undefined,
  plugins: [dash()],
});
