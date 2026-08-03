import prismadb from "@/lib/prismadb";
import { getCurrentUserId } from "@/lib/auth-session";
import { redirect } from "next/navigation";
import Navbar from "@/components/navbar";

export default async function DahsboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { storeId: string };
}) {
  const userId = await getCurrentUserId();

  if (!userId) {
    redirect("/sign-in");
  };
  const store = await prismadb.store.findFirst({
    where: {
      id: params.storeId,
      userId,
    },
  });

  if (!store) {
    redirect("/");
  }

  return (
  
    <>
      <Navbar />
      {children} 
    </>
  );
}
