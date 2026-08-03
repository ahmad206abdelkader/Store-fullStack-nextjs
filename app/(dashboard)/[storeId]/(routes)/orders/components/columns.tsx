"use client";

import { useState } from "react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type OrderColumn = {
  id: string;
  phone: string;
  address: string;
  totalPrice: string;
  products: string;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  createdAt: string;
};

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function PaymentAction({ order }: { order: OrderColumn }) {
  const params = useParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const canMarkPaid =
    order.paymentMethod === "CASH_ON_DELIVERY" &&
    order.paymentStatus === "PENDING";

  if (!canMarkPaid) {
    return null;
  }

  const markPaid = async () => {
    try {
      setIsLoading(true);
      await axios.post(
        `/api/${params.storeId}/orders/${order.id}/mark-paid`
      );
      toast.success("Cash order marked as paid.");
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        toast.error(String(error.response.data));
      } else {
        toast.error("Unable to update the order.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button size="sm" disabled={isLoading} onClick={markPaid}>
      Mark paid
    </Button>
  );
}

export const columns: ColumnDef<OrderColumn>[] = [
  {
    accessorKey: "products",
    header: "Products",
  },
  {
    accessorKey: "phone",
    header: "Phone",
  },
  {
    accessorKey: "address",
    header: "Address",
  },
  {
    accessorKey: "totalPrice",
    header: "Total price",
  },
  {
    accessorKey: "paymentMethod",
    header: "Payment method",
    cell: ({ row }) => formatStatus(row.original.paymentMethod),
  },
  {
    accessorKey: "paymentStatus",
    header: "Payment status",
    cell: ({ row }) => (
      <Badge
        variant={
          row.original.paymentStatus === "PAID" ? "default" : "secondary"
        }
      >
        {formatStatus(row.original.paymentStatus)}
      </Badge>
    ),
  },
  {
    accessorKey: "orderStatus",
    header: "Order status",
    cell: ({ row }) => formatStatus(row.original.orderStatus),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
  },
  {
    id: "actions",
    cell: ({ row }) => <PaymentAction order={row.original} />,
  },
];
