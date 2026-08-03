import Stripe from "stripe";
import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

function getStripeId(value: string | { id: string } | null) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function formatAddress(address: Stripe.Address | null | undefined) {
  return [
    address?.line1,
    address?.line2,
    address?.city,
    address?.state,
    address?.postal_code,
    address?.country,
  ]
    .filter((component): component is string => Boolean(component))
    .join(", ");
}

async function handleCompletedCheckout(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId;
  const metadataUserId = session.metadata?.userId;

  if (!orderId) {
    return new NextResponse("Checkout Session is missing orderId metadata", {
      status: 400,
    });
  }

  const order = await prismadb.order.findUnique({
    where: { id: orderId },
    include: { orderItems: true },
  });

  if (!order) {
    return new NextResponse("Order not found", { status: 400 });
  }

  if (order.userId && order.userId !== metadataUserId) {
    return new NextResponse("Checkout user does not match the order", {
      status: 400,
    });
  }

  if (
    order.stripeCheckoutSessionId &&
    order.stripeCheckoutSessionId !== session.id
  ) {
    return new NextResponse("Checkout Session does not match the order", {
      status: 400,
    });
  }

  if (session.payment_status !== "paid") {
    return NextResponse.json({
      received: true,
      handled: false,
      reason: "payment_pending",
    });
  }

  const stripeCustomerId = getStripeId(session.customer);
  const stripePaymentIntentId = getStripeId(session.payment_intent);
  const wasProcessed = await prismadb.$transaction(async (transaction) => {
    const update = await transaction.order.updateMany({
      where: { id: order.id, isPaid: false },
      data: {
        isPaid: true,
        address: formatAddress(session.customer_details?.address),
        phone: session.customer_details?.phone || "",
        userId: order.userId || metadataUserId,
        stripeCustomerId: order.stripeCustomerId || stripeCustomerId,
        stripeCheckoutSessionId: order.stripeCheckoutSessionId || session.id,
        stripePaymentIntentId:
          order.stripePaymentIntentId || stripePaymentIntentId,
      },
    });

    if (update.count === 0) {
      return false;
    }

    await transaction.product.updateMany({
      where: {
        id: { in: order.orderItems.map((orderItem) => orderItem.productId) },
      },
      data: { isArchived: true },
    });

    return true;
  });

  if (!wasProcessed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  return NextResponse.json({ received: true, handled: true });
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new NextResponse("Missing Stripe-Signature header", {
      status: 400,
    });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return new NextResponse("Stripe webhook secret is not configured", {
      status: 500,
    });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      await req.text(),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return handleCompletedCheckout(event.data.object as Stripe.Checkout.Session);
    default:
      return NextResponse.json({
        received: true,
        handled: false,
        eventType: event.type,
      });
  }
}
