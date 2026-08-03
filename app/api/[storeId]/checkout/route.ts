import Stripe from "stripe";
import { NextResponse } from "next/server";

import { stripe } from "@/lib/stripe";
import prismadb from "@/lib/prismadb";
import { getServerSession } from "@/lib/auth-session";
import { getOrCreateStripeCustomer } from "@/lib/stripe-customer";

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.FRONTEND_STORE_URL || "http://localhost:3001",
  "Access-Control-Allow-Credentials": "true",
  "Vary": "Origin",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  const authSession = await getServerSession(req.headers);

  if (!authSession) {
    return new NextResponse("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  const productIds = body?.productIds;

  if (
    !Array.isArray(productIds) ||
    productIds.length === 0 ||
    productIds.length > 100 ||
    productIds.some((productId) => typeof productId !== "string")
  ) {
    return new NextResponse("Product ids are required", {
      status: 400,
      headers: corsHeaders,
    });
  }

  const uniqueProductIds = Array.from(new Set<string>(productIds));

  const products = await prismadb.product.findMany({
    where: {
      id: { in: uniqueProductIds },
      storeId: params.storeId,
      isArchived: false,
    }
  });

  if (products.length !== uniqueProductIds.length) {
    return new NextResponse("One or more products are unavailable", {
      status: 400,
      headers: corsHeaders,
    });
  }

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  products.forEach((product) => {
    const unitAmount = Math.round(product.price.toNumber() * 100);

    if (!Number.isSafeInteger(unitAmount) || unitAmount <= 0) {
      throw new Error(`Product ${product.id} has an invalid price`);
    }

    line_items.push({
      quantity: 1,
      price_data: {
        currency: 'USD',
        product_data: {
          name: product.name,
        },
        unit_amount: unitAmount,
      }
    });
  });

  const user = await prismadb.user.findUnique({
    where: { id: authSession.user.id },
  });

  if (!user) {
    return new NextResponse("Authenticated user was not found", {
      status: 401,
      headers: corsHeaders,
    });
  }

  const customer = await getOrCreateStripeCustomer(user);

  const order = await prismadb.order.create({
    data: {
      storeId: params.storeId,
      userId: user.id,
      stripeCustomerId: customer.id,
      isPaid: false,
      orderItems: {
        create: products.map((product) => ({
          product: {
            connect: {
              id: product.id,
            }
          }
        }))
      }
    }
  });

  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    client_reference_id: user.id,
    line_items,
    mode: 'payment',
    billing_address_collection: 'required',
    phone_number_collection: {
      enabled: true,
    },
    success_url: `${process.env.FRONTEND_STORE_URL}/cart?success=1`,
    cancel_url: `${process.env.FRONTEND_STORE_URL}/cart?canceled=1`,
    metadata: {
      orderId: order.id,
      userId: user.id,
    },
    payment_intent_data: {
      metadata: {
        orderId: order.id,
        userId: user.id,
      },
    },
  });

  await prismadb.order.update({
    where: { id: order.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  return NextResponse.json({ url: session.url }, {
    headers: corsHeaders
  });
};
