import prismadb from "@/lib/prismadb";
import { auth } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { SettingsForm } from "./components/setting-form";

//this is the function components
interface SettingsPageProps {
  params: {
    storeId: string;
  };
}

//this error becuase i have async await with '({ params }: SettingsPageProps) => Promise<Element>'
const SettingsPage: React.FC<SettingsPageProps> = async ({ params }) => {
  const { userId } = auth();

  if (!userId) {
    redirect("/sign-in");
  }

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
    <div className="flex-col ">
      <div className='flex-1 space-y-4 p-8 pt-6'>
        <SettingsForm />
      </div>
    </div>
  );
};

export default SettingsPage;
