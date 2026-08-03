import { format } from "date-fns";

import prismadb from "@/lib/prismadb";
import { formatter } from "@/lib/utils";

import { OrderColumn } from "./components/columns";
import { OrderClient } from "./components/client";


const OrdersPage = async ({
  params
}: {
  params: { storeId: string }
}) => {
  const orders = await prismadb.order.findMany({
    where: {
      storeId: params.storeId
    },
    include: {
      orderItems: {
        include: {
          product: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  const formattedOrders: OrderColumn[] = orders.map((item) => {
    const hasLegacyStripeReference = Boolean(
      item.stripeCustomerId ||
        item.stripeCheckoutSessionId ||
        item.stripePaymentIntentId
    );

    return {
      id: item.id,
      phone: item.phone,
      address: item.address,
      products: item.orderItems
        .map((orderItem) => orderItem.product.name)
        .join(", "),
      totalPrice: formatter.format(
        item.orderItems.reduce((total, orderItem) => {
          return total + Number(orderItem.unitPrice ?? orderItem.product.price);
        }, 0)
      ),
      paymentMethod:
        item.paymentMethod ||
        (hasLegacyStripeReference ? "STRIPE" : "LEGACY_UNKNOWN"),
      paymentStatus:
        item.paymentStatus || (item.isPaid ? "PAID" : "PENDING"),
      orderStatus: item.orderStatus || "PENDING",
      createdAt: format(item.createdAt, "MMMM do, yyyy"),
    };
  });

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <OrderClient data={formattedOrders} />
      </div>
    </div>
  );
};

export default OrdersPage;
