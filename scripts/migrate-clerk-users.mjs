import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { PrismaClient } from "@prisma/client";
import { parse } from "csv-parse/sync";

const exportPath = process.argv[2];

if (!exportPath) {
  console.error(
    "Usage: npm run migrate:clerk-users -- /absolute/path/to/exported_users.csv"
  );
  process.exit(1);
}

const prisma = new PrismaClient();
const csv = await readFile(exportPath, "utf8");
const records = parse(csv, {
  bom: true,
  columns: true,
  relax_column_count: true,
  skip_empty_lines: true,
  trim: true,
});

const seenClerkIds = new Set();
const seenEmails = new Set();

for (const record of records) {
  const clerkId = record.id?.trim();
  const email = record.primary_email_address?.trim().toLowerCase();

  if (!clerkId || !email) {
    continue;
  }

  if (seenClerkIds.has(clerkId)) {
    throw new Error(`Duplicate Clerk user id in export: ${clerkId}`);
  }

  if (seenEmails.has(email)) {
    throw new Error(`Duplicate primary email in Clerk export: ${email}`);
  }

  seenClerkIds.add(clerkId);
  seenEmails.add(email);
}

let usersCreated = 0;
let usersMatched = 0;
let credentialsImported = 0;
let credentialsSkipped = 0;
let storeOwnersRemapped = 0;

function isEmailVerified(record, email) {
  const verified = record.verified_email_addresses || record.email_verified || "";
  return verified === "true" || verified.includes(email);
}

function isBcryptHash(hash, hasher) {
  return /^\$2[aby]\$\d{2}\$/.test(hash) &&
    (!hasher || hasher.toLowerCase().includes("bcrypt"));
}

for (const record of records) {
  const clerkId = record.id?.trim();
  const email = record.primary_email_address?.trim().toLowerCase();

  if (!clerkId || !email) {
    credentialsSkipped += 1;
    continue;
  }

  const name =
    [record.first_name, record.last_name].filter(Boolean).join(" ").trim() ||
    record.username?.trim() ||
    email.split("@")[0];
  const passwordHash = record.password_digest?.trim() || "";
  const passwordHasher = record.password_hasher?.trim() || "";
  const emailVerified = isEmailVerified(record, email);

  await prisma.$transaction(async (tx) => {
    const [existingById, existingByEmail] = await Promise.all([
      tx.user.findUnique({ where: { id: clerkId } }),
      tx.user.findUnique({ where: { email } }),
    ]);

    if (
      existingById &&
      existingByEmail &&
      existingById.id !== existingByEmail.id
    ) {
      throw new Error(
        `Ambiguous identity: Clerk id ${clerkId} and email ${email} match different Better Auth users`
      );
    }

    if (existingById && existingById.email.toLowerCase() !== email) {
      throw new Error(
        `Identity collision: Clerk id ${clerkId} already belongs to another email`
      );
    }

    if (!existingById && existingByEmail && !emailVerified) {
      throw new Error(
        `Refusing to match unverified Clerk email ${email} to an existing Better Auth user`
      );
    }

    const existing = existingById || existingByEmail;
    const userId = existing?.id || clerkId;

    if (existing) {
      usersMatched += 1;
      await tx.user.update({
        where: { id: existing.id },
        data: {
          name: existing.name || name,
          emailVerified: existing.emailVerified || emailVerified,
          image: existing.image || record.image_url || null,
        },
      });

      if (existing.id !== clerkId) {
        const remapped = await tx.store.updateMany({
          where: { userId: clerkId },
          data: { userId: existing.id },
        });
        storeOwnersRemapped += remapped.count;
      }
    } else {
      await tx.user.create({
        data: {
          id: clerkId,
          name,
          email,
          emailVerified,
          image: record.image_url || null,
        },
      });
      usersCreated += 1;
    }

    if (!isBcryptHash(passwordHash, passwordHasher)) {
      credentialsSkipped += 1;
      return;
    }

    const credentialAccount = await tx.account.findFirst({
      where: { userId, providerId: "credential" },
    });

    if (credentialAccount) {
      await tx.account.update({
        where: { id: credentialAccount.id },
        data: { accountId: userId, password: passwordHash },
      });
    } else {
      await tx.account.create({
        data: {
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: passwordHash,
        },
      });
    }

    credentialsImported += 1;
  });
}

await prisma.$disconnect();

console.log(
  JSON.stringify({
    usersCreated,
    usersMatched,
    credentialsImported,
    credentialsSkipped,
    storeOwnersRemapped,
  })
);
