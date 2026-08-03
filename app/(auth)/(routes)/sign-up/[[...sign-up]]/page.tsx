import { AuthForm, SocialProvider } from "@/components/auth-form";
import { getServerSession } from "@/lib/auth-session";
import { redirect } from "next/navigation";

export default async function Page() {
  if (await getServerSession()) {
    redirect("/");
  }

  return (
    <AuthForm
      mode="sign-up"
      socialProviders={getEnabledSocialProviders()}
    />
  );
}

function getEnabledSocialProviders(): SocialProvider[] {
  return [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? ["google" as const]
      : []),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? ["github" as const]
      : []),
  ];
}
