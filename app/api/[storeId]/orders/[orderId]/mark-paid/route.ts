import { PaymentMethod, PaymentStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-session";
import prismadb from "@/lib/prismadb";

export async function POST(
  request: Request,
  { params }: { params: { storeId: string; orderId: string } }
) {
  const authSession = await getServerSession(request.headers);

  if (!authSession) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const store = await prismadb.store.findFirst({
    where: {
      id: params.storeId,
      userId: authSession.user.id,
    },
    select: { id: true },
  });

  if (!store) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const order = await prismadb.order.findFirst({
    where: {
      id: params.orderId,
      storeId: store.id,
    },
    select: {
      id: true,
      paymentMethod: true,
      paymentStatus: true,
    },
  });

  if (!order) {
    return new NextResponse("Order not found", { status: 404 });
  }

  if (order.paymentMethod !== PaymentMethod.CASH_ON_DELIVERY) {
    return new NextResponse("Only cash orders can be marked as paid", {
      status: 400,
    });
  }

  if (order.paymentStatus === PaymentStatus.PAID) {
    return NextResponse.json({ id: order.id, alreadyPaid: true });
  }

  if (order.paymentStatus !== PaymentStatus.PENDING) {
    return new NextResponse(
      `Cannot mark a ${order.paymentStatus.toLowerCase()} order as paid`,
      { status: 409 }
    );
  }

  const update = await prismadb.order.updateMany({
    where: {
      id: order.id,
      storeId: store.id,
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
      paymentStatus: PaymentStatus.PENDING,
    },
    data: {
      paymentStatus: PaymentStatus.PAID,
      isPaid: true,
    },
  });

  if (update.count !== 1) {
    return new NextResponse("Order status changed; refresh and try again", {
      status: 409,
    });
  }

  return NextResponse.json({ id: order.id, paymentStatus: PaymentStatus.PAID });
}
