import Stripe from "stripe";

import prismadb from "@/lib/prismadb";
import { stripe } from "@/lib/stripe";

type AuthenticatedUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  stripeCustomerId: string | null;
};

function isMissingStripeResource(error: unknown) {
  return (
    error instanceof Stripe.errors.StripeInvalidRequestError &&
    error.code === "resource_missing"
  );
}

async function saveCustomerId(userId: string, stripeCustomerId: string) {
  await prismadb.user.update({
    where: { id: userId },
    data: { stripeCustomerId },
  });
}

async function claimCustomer(user: AuthenticatedUser, customer: Stripe.Customer) {
  if (customer.metadata.userId !== user.id) {
    customer = await stripe.customers.update(customer.id, {
      metadata: {
        ...customer.metadata,
        userId: user.id,
      },
    });
  }

  await saveCustomerId(user.id, customer.id);
  return customer;
}

export async function getOrCreateStripeCustomer(user: AuthenticatedUser) {
  if (user.stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(user.stripeCustomerId);

      if (!existing.deleted) {
        return claimCustomer(user, existing);
      }
    } catch (error) {
      if (!isMissingStripeResource(error)) {
        throw error;
      }
    }

    await prismadb.user.updateMany({
      where: { id: user.id, stripeCustomerId: user.stripeCustomerId },
      data: { stripeCustomerId: null },
    });
  }

  const escapedUserId = user.id.replace(/[\\']/g, "\\$&");
  const byMetadata = await stripe.customers.search({
    query: `metadata['userId']:'${escapedUserId}'`,
    limit: 1,
  });

  if (byMetadata.data[0]) {
    return claimCustomer(user, byMetadata.data[0]);
  }

  // Older customers may predate userId metadata. Email is used only as a
  // verified fallback and only when it identifies exactly one customer.
  if (user.emailVerified) {
    const byEmail = await stripe.customers.list({ email: user.email, limit: 10 });
    const unclaimedCustomers = byEmail.data.filter(
      (customer) => !customer.metadata.userId || customer.metadata.userId === user.id
    );

    if (unclaimedCustomers.length === 1) {
      return claimCustomer(user, unclaimedCustomers[0]);
    }
  }

  const customer = await stripe.customers.create(
    {
      email: user.email,
      name: user.name,
      metadata: { userId: user.id },
    },
    { idempotencyKey: `better-auth-customer-${user.id}` }
  );

  await saveCustomerId(user.id, customer.id);
  return customer;
}
