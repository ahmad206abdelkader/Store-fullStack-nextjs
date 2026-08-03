import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-session";
import prismadb from "@/lib/prismadb";

const frontendStoreOrigin = new URL(
  process.env.FRONTEND_STORE_URL || "http://localhost:3001"
).origin;

const corsHeaders = {
  "Access-Control-Allow-Origin": frontendStoreOrigin,
  "Access-Control-Allow-Credentials": "true",
  Vary: "Origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

class CheckoutConflictError extends Error {}

function hasTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === frontendStoreOrigin;
}

export async function OPTIONS(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return new NextResponse(null, { status: 403 });
  }

  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(
  request: Request,
  { params }: { params: { storeId: string } }
) {
  if (!hasTrustedOrigin(request)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const authSession = await getServerSession(request.headers);

  if (!authSession) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: corsHeaders,
    });
  }

  const body = await request.json().catch(() => null);
  const productIds = body?.productIds;
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";

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

  if (address.length < 5 || address.length > 500) {
    return new NextResponse("A valid delivery address is required", {
      status: 400,
      headers: corsHeaders,
    });
  }

  if (
    phone.length < 7 ||
    phone.length > 32 ||
    !/^[+\d][\d\s().-]+$/.test(phone)
  ) {
    return new NextResponse("A valid phone number is required", {
      status: 400,
      headers: corsHeaders,
    });
  }

  const user = await prismadb.user.findUnique({
    where: { id: authSession.user.id },
    select: { id: true },
  });

  if (!user) {
    return new NextResponse("Authenticated user was not found", {
      status: 401,
      headers: corsHeaders,
    });
  }

  const uniqueProductIds = Array.from(new Set<string>(productIds));

  try {
    const order = await prismadb.$transaction(async (transaction) => {
      const products = await transaction.product.findMany({
        where: {
          id: { in: uniqueProductIds },
          storeId: params.storeId,
          isArchived: false,
        },
        select: {
          id: true,
          price: true,
        },
      });

      if (
        products.length !== uniqueProductIds.length ||
        products.some((product) => product.price.lte(0))
      ) {
        throw new CheckoutConflictError(
          "One or more products are unavailable or have an invalid price"
        );
      }

      const reservation = await transaction.product.updateMany({
        where: {
          id: { in: uniqueProductIds },
          storeId: params.storeId,
          isArchived: false,
        },
        data: { isArchived: true },
      });

      if (reservation.count !== uniqueProductIds.length) {
        throw new CheckoutConflictError(
          "One or more products became unavailable"
        );
      }

      return transaction.order.create({
        data: {
          storeId: params.storeId,
          userId: user.id,
          address,
          phone,
          isPaid: false,
          paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
          paymentStatus: PaymentStatus.PENDING,
          orderStatus: OrderStatus.PENDING,
          orderItems: {
            create: products.map((product) => ({
              unitPrice: product.price,
              product: {
                connect: { id: product.id },
              },
            })),
          },
        },
        select: { id: true },
      });
    });

    return NextResponse.json(
      { orderId: order.id },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    if (error instanceof CheckoutConflictError) {
      return new NextResponse(error.message, {
        status: 409,
        headers: corsHeaders,
      });
    }

    throw error;
  }
}
